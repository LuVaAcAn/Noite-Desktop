use argon2::{Algorithm, Argon2, Params, Version};
use base64::Engine;
use chacha20poly1305::{
    aead::{rand_core::RngCore, Aead, KeyInit, OsRng, Payload},
    XChaCha20Poly1305, XNonce,
};
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::{
    collections::HashMap,
    sync::Mutex,
    time::{Duration, Instant},
};
use tauri::{AppHandle, State};
use zeroize::Zeroizing;

const MEMORY_KIB: u32 = 19_456;
const ITERATIONS: u32 = 2;
const PARALLELISM: u32 = 1;
const KEY_LEN: usize = 32;
const NONCE_LEN: usize = 24;
const SALT_LEN: usize = 16;
const IDLE_TIMEOUT: Duration = Duration::from_secs(10 * 60);

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultError {
    code: String,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    details: Option<Value>,
}

impl VaultError {
    fn new(code: &str, message: &str) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            details: None,
        }
    }

    fn internal(error: impl ToString) -> Self {
        Self {
            code: "vault_failed".into(),
            message: "Noite no pudo acceder al gestor de contraseñas.".into(),
            details: crate::diagnostic_details(error),
        }
    }
}

type VaultResult<T> = Result<T, VaultError>;

struct UnlockedVault {
    key: Zeroizing<Vec<u8>>,
    last_access: Instant,
}

#[derive(Default)]
struct FailureState {
    attempts: u32,
    blocked_until: Option<Instant>,
}

#[derive(Default)]
pub struct VaultRuntime {
    unlocked: Mutex<HashMap<String, UnlockedVault>>,
    failures: Mutex<HashMap<String, FailureState>>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PasswordVaultStatus {
    actor_id: String,
    configured: bool,
    unlocked: bool,
    entry_count: usize,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PasswordVaultEntry {
    id: String,
    actor_id: String,
    site: String,
    url: String,
    username: String,
    notes: String,
    has_password: bool,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PasswordVaultEntryInput {
    id: Option<String>,
    site: String,
    url: String,
    username: String,
    password: String,
    notes: String,
}

#[derive(Debug, Deserialize, Serialize)]
struct VaultEntryPayload {
    site: String,
    url: String,
    username: String,
    password: String,
    notes: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub(crate) struct EncryptedVaultProfileBackup {
    actor_id: String,
    salt: Vec<u8>,
    memory_kib: u32,
    iterations: u32,
    parallelism: u32,
    wrap_nonce: Vec<u8>,
    wrapped_key: Vec<u8>,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub(crate) struct EncryptedVaultEntryBackup {
    id: String,
    actor_id: String,
    nonce: Vec<u8>,
    ciphertext: Vec<u8>,
    created_at: String,
    updated_at: String,
}

#[derive(Debug, Clone, Default, Deserialize, Serialize)]
pub(crate) struct EncryptedVaultBackup {
    profiles: Vec<EncryptedVaultProfileBackup>,
    entries: Vec<EncryptedVaultEntryBackup>,
}

struct ProfileRecord {
    salt: Vec<u8>,
    memory_kib: u32,
    iterations: u32,
    parallelism: u32,
    wrap_nonce: Vec<u8>,
    wrapped_key: Vec<u8>,
}

fn validate_actor(actor_id: &str) -> VaultResult<()> {
    if matches!(actor_id, "me" | "partner") {
        Ok(())
    } else {
        Err(VaultError::new(
            "invalid_actor",
            "El perfil seleccionado no es válido.",
        ))
    }
}

fn validate_master(master_password: &str) -> VaultResult<()> {
    if master_password.chars().count() < 12 {
        return Err(VaultError::new(
            "weak_master_password",
            "La contraseña maestra debe tener al menos 12 caracteres.",
        ));
    }
    if master_password.len() > 1024 {
        return Err(VaultError::new(
            "invalid_master_password",
            "La contraseña maestra es demasiado larga.",
        ));
    }
    Ok(())
}

fn validate_input(
    input: PasswordVaultEntryInput,
) -> VaultResult<(Option<String>, VaultEntryPayload)> {
    let payload = VaultEntryPayload {
        site: input.site.trim().to_string(),
        url: input.url.trim().to_string(),
        username: input.username.trim().to_string(),
        password: input.password,
        notes: input.notes.trim().to_string(),
    };
    if payload.site.is_empty() {
        return Err(VaultError::new(
            "invalid_entry",
            "Escribe el nombre del sitio o servicio.",
        ));
    }
    if payload.password.is_empty() {
        return Err(VaultError::new(
            "invalid_entry",
            "Escribe o genera una contraseña.",
        ));
    }
    if payload.site.chars().count() > 200
        || payload.url.chars().count() > 2048
        || payload.username.chars().count() > 320
        || payload.password.chars().count() > 4096
        || payload.notes.chars().count() > 10_000
    {
        return Err(VaultError::new(
            "invalid_entry",
            "Uno de los campos supera el tamaño permitido.",
        ));
    }
    if !payload.url.is_empty() {
        let parsed = url::Url::parse(&payload.url)
            .map_err(|_| VaultError::new("invalid_entry", "La dirección web no es válida."))?;
        if !matches!(parsed.scheme(), "https" | "http") {
            return Err(VaultError::new(
                "invalid_entry",
                "La dirección debe comenzar con https:// o http://.",
            ));
        }
    }
    Ok((input.id, payload))
}

fn derive_key(
    master_password: &str,
    salt: &[u8],
    memory_kib: u32,
    iterations: u32,
    parallelism: u32,
) -> VaultResult<Zeroizing<Vec<u8>>> {
    let params = Params::new(memory_kib, iterations, parallelism, Some(KEY_LEN))
        .map_err(VaultError::internal)?;
    let argon = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut output = Zeroizing::new(vec![0u8; KEY_LEN]);
    argon
        .hash_password_into(master_password.as_bytes(), salt, &mut output)
        .map_err(VaultError::internal)?;
    Ok(output)
}

fn random_bytes<const N: usize>() -> [u8; N] {
    let mut bytes = [0u8; N];
    OsRng.fill_bytes(&mut bytes);
    bytes
}

fn wrap_aad(actor_id: &str) -> String {
    format!("noite:vault-key:{actor_id}:1")
}

fn entry_aad(actor_id: &str, entry_id: &str) -> String {
    format!("noite:vault-entry:{actor_id}:{entry_id}:1")
}

fn encrypt_with_key(
    key: &[u8],
    nonce: &[u8],
    plaintext: &[u8],
    aad: &[u8],
) -> VaultResult<Vec<u8>> {
    if key.len() != KEY_LEN || nonce.len() != NONCE_LEN {
        return Err(VaultError::new(
            "vault_corrupt",
            "El almacén cifrado está dañado.",
        ));
    }
    let cipher = XChaCha20Poly1305::new_from_slice(key).map_err(VaultError::internal)?;
    cipher
        .encrypt(
            XNonce::from_slice(nonce),
            Payload {
                msg: plaintext,
                aad,
            },
        )
        .map_err(|_| VaultError::new("vault_corrupt", "No se pudo cifrar el almacén."))
}

fn decrypt_with_key(
    key: &[u8],
    nonce: &[u8],
    ciphertext: &[u8],
    aad: &[u8],
) -> VaultResult<Zeroizing<Vec<u8>>> {
    if key.len() != KEY_LEN || nonce.len() != NONCE_LEN {
        return Err(VaultError::new(
            "vault_corrupt",
            "El almacén cifrado está dañado.",
        ));
    }
    let cipher = XChaCha20Poly1305::new_from_slice(key).map_err(VaultError::internal)?;
    cipher
        .decrypt(
            XNonce::from_slice(nonce),
            Payload {
                msg: ciphertext,
                aad,
            },
        )
        .map(Zeroizing::new)
        .map_err(|_| {
            VaultError::new(
                "vault_corrupt",
                "El almacén cifrado está dañado o la contraseña es incorrecta.",
            )
        })
}

fn load_profile(connection: &Connection, actor_id: &str) -> VaultResult<Option<ProfileRecord>> {
    connection
        .query_row(
            "SELECT salt, memory_kib, iterations, parallelism, wrap_nonce, wrapped_key FROM password_vaults WHERE actor_id=?1",
            [actor_id],
            |row| Ok(ProfileRecord {
                salt: row.get(0)?,
                memory_kib: row.get::<_, i64>(1)? as u32,
                iterations: row.get::<_, i64>(2)? as u32,
                parallelism: row.get::<_, i64>(3)? as u32,
                wrap_nonce: row.get(4)?,
                wrapped_key: row.get(5)?,
            }),
        )
        .optional()
        .map_err(VaultError::internal)
}

fn unwrap_profile_key(
    actor_id: &str,
    master_password: &str,
    record: &ProfileRecord,
) -> VaultResult<Zeroizing<Vec<u8>>> {
    let wrapping_key = derive_key(
        master_password,
        &record.salt,
        record.memory_kib,
        record.iterations,
        record.parallelism,
    )?;
    decrypt_with_key(
        &wrapping_key,
        &record.wrap_nonce,
        &record.wrapped_key,
        wrap_aad(actor_id).as_bytes(),
    )
}

fn active_key(runtime: &VaultRuntime, actor_id: &str) -> VaultResult<Zeroizing<Vec<u8>>> {
    let now = Instant::now();
    let mut unlocked = runtime.unlocked.lock().map_err(VaultError::internal)?;
    let expired = unlocked
        .get(actor_id)
        .is_some_and(|entry| now.duration_since(entry.last_access) >= IDLE_TIMEOUT);
    if expired {
        unlocked.remove(actor_id);
    }
    let entry = unlocked
        .get_mut(actor_id)
        .ok_or_else(|| VaultError::new("vault_locked", "Desbloquea este perfil para continuar."))?;
    entry.last_access = now;
    Ok(Zeroizing::new(entry.key.to_vec()))
}

fn set_unlocked(
    runtime: &VaultRuntime,
    actor_id: &str,
    key: Zeroizing<Vec<u8>>,
) -> VaultResult<()> {
    runtime
        .unlocked
        .lock()
        .map_err(VaultError::internal)?
        .insert(
            actor_id.to_string(),
            UnlockedVault {
                key,
                last_access: Instant::now(),
            },
        );
    Ok(())
}

fn summary(
    actor_id: &str,
    id: String,
    payload: VaultEntryPayload,
    created_at: String,
    updated_at: String,
) -> PasswordVaultEntry {
    PasswordVaultEntry {
        id,
        actor_id: actor_id.into(),
        site: payload.site,
        url: payload.url,
        username: payload.username,
        notes: payload.notes,
        has_password: !payload.password.is_empty(),
        created_at,
        updated_at,
    }
}

fn decrypt_payload(
    actor_id: &str,
    id: &str,
    nonce: &[u8],
    ciphertext: &[u8],
    key: &[u8],
) -> VaultResult<VaultEntryPayload> {
    let plaintext = decrypt_with_key(key, nonce, ciphertext, entry_aad(actor_id, id).as_bytes())?;
    serde_json::from_slice(&plaintext)
        .map_err(|_| VaultError::new("vault_corrupt", "Una entrada cifrada está dañada."))
}

fn entry_record(
    connection: &Connection,
    actor_id: &str,
    entry_id: &str,
) -> VaultResult<(Vec<u8>, Vec<u8>, String, String)> {
    connection
        .query_row(
            "SELECT nonce, ciphertext, created_at, updated_at FROM password_entries WHERE actor_id=?1 AND id=?2",
            params![actor_id, entry_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .optional()
        .map_err(VaultError::internal)?
        .ok_or_else(|| VaultError::new("entry_not_found", "La entrada ya no existe."))
}

fn generated_id() -> String {
    let bytes = random_bytes::<18>();
    format!(
        "vault-{}",
        base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
    )
}

fn sample_index(size: usize) -> usize {
    let zone = u32::MAX - (u32::MAX % size as u32);
    loop {
        let value = OsRng.next_u32();
        if value < zone {
            return (value % size as u32) as usize;
        }
    }
}

#[tauri::command]
pub fn vault_status(
    app: AppHandle,
    runtime: State<'_, VaultRuntime>,
    actor_id: String,
) -> VaultResult<PasswordVaultStatus> {
    validate_actor(&actor_id)?;
    let connection = crate::connection(&app).map_err(VaultError::internal)?;
    let configured = load_profile(&connection, &actor_id)?.is_some();
    let entry_count = if configured {
        connection
            .query_row(
                "SELECT COUNT(*) FROM password_entries WHERE actor_id=?1",
                [&actor_id],
                |row| row.get::<_, i64>(0),
            )
            .map_err(VaultError::internal)? as usize
    } else {
        0
    };
    let unlocked = active_key(&runtime, &actor_id).is_ok();
    Ok(PasswordVaultStatus {
        actor_id,
        configured,
        unlocked,
        entry_count,
    })
}

#[tauri::command]
pub fn vault_initialize(
    app: AppHandle,
    runtime: State<'_, VaultRuntime>,
    actor_id: String,
    master_password: String,
) -> VaultResult<PasswordVaultStatus> {
    validate_actor(&actor_id)?;
    validate_master(&master_password)?;
    let connection = crate::connection(&app).map_err(VaultError::internal)?;
    if load_profile(&connection, &actor_id)?.is_some() {
        return Err(VaultError::new(
            "already_configured",
            "Este perfil ya tiene un almacén configurado.",
        ));
    }
    crate::save_rolling_backup(&connection).map_err(VaultError::internal)?;
    let salt = random_bytes::<SALT_LEN>();
    let wrap_nonce = random_bytes::<NONCE_LEN>();
    let data_key = Zeroizing::new(random_bytes::<KEY_LEN>().to_vec());
    let wrapping_key = derive_key(&master_password, &salt, MEMORY_KIB, ITERATIONS, PARALLELISM)?;
    let wrapped_key = encrypt_with_key(
        &wrapping_key,
        &wrap_nonce,
        &data_key,
        wrap_aad(&actor_id).as_bytes(),
    )?;
    connection
        .execute(
            "INSERT INTO password_vaults(actor_id,salt,memory_kib,iterations,parallelism,wrap_nonce,wrapped_key,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,?6,?7,datetime('now'),datetime('now'))",
            params![actor_id, salt.to_vec(), MEMORY_KIB, ITERATIONS, PARALLELISM, wrap_nonce.to_vec(), wrapped_key],
        )
        .map_err(VaultError::internal)?;
    set_unlocked(&runtime, &actor_id, data_key)?;
    Ok(PasswordVaultStatus {
        actor_id,
        configured: true,
        unlocked: true,
        entry_count: 0,
    })
}

#[tauri::command]
pub fn vault_unlock(
    app: AppHandle,
    runtime: State<'_, VaultRuntime>,
    actor_id: String,
    master_password: String,
) -> VaultResult<PasswordVaultStatus> {
    validate_actor(&actor_id)?;
    {
        let failures = runtime.failures.lock().map_err(VaultError::internal)?;
        if let Some(until) = failures
            .get(&actor_id)
            .and_then(|state| state.blocked_until)
        {
            if until > Instant::now() {
                return Err(VaultError {
                    code: "unlock_throttled".into(),
                    message: "Espera un momento antes de volver a intentarlo.".into(),
                    details: Some(
                        serde_json::json!({ "retryAfterSeconds": until.duration_since(Instant::now()).as_secs().max(1) }),
                    ),
                });
            }
        }
    }
    let connection = crate::connection(&app).map_err(VaultError::internal)?;
    let record = load_profile(&connection, &actor_id)?.ok_or_else(|| {
        VaultError::new("not_configured", "Este perfil todavía no tiene un almacén.")
    })?;
    match unwrap_profile_key(&actor_id, &master_password, &record) {
        Ok(key) => {
            runtime
                .failures
                .lock()
                .map_err(VaultError::internal)?
                .remove(&actor_id);
            set_unlocked(&runtime, &actor_id, key)?;
            let entry_count = connection
                .query_row(
                    "SELECT COUNT(*) FROM password_entries WHERE actor_id=?1",
                    [&actor_id],
                    |row| row.get::<_, i64>(0),
                )
                .map_err(VaultError::internal)? as usize;
            Ok(PasswordVaultStatus {
                actor_id,
                configured: true,
                unlocked: true,
                entry_count,
            })
        }
        Err(_) => {
            let mut failures = runtime.failures.lock().map_err(VaultError::internal)?;
            let state = failures.entry(actor_id).or_default();
            state.attempts = state.attempts.saturating_add(1);
            if state.attempts >= 5 {
                let delay = (5u64.saturating_mul(1u64 << (state.attempts - 5).min(4))).min(60);
                state.blocked_until = Some(Instant::now() + Duration::from_secs(delay));
            }
            Err(VaultError::new(
                "invalid_master_password",
                "La contraseña maestra no es correcta.",
            ))
        }
    }
}

#[tauri::command]
pub fn vault_lock(runtime: State<'_, VaultRuntime>, actor_id: String) -> VaultResult<()> {
    validate_actor(&actor_id)?;
    runtime
        .unlocked
        .lock()
        .map_err(VaultError::internal)?
        .remove(&actor_id);
    Ok(())
}

#[tauri::command]
pub fn vault_lock_all(runtime: State<'_, VaultRuntime>) -> VaultResult<()> {
    runtime
        .unlocked
        .lock()
        .map_err(VaultError::internal)?
        .clear();
    Ok(())
}

#[tauri::command]
pub fn vault_list(
    app: AppHandle,
    runtime: State<'_, VaultRuntime>,
    actor_id: String,
) -> VaultResult<Vec<PasswordVaultEntry>> {
    validate_actor(&actor_id)?;
    let key = active_key(&runtime, &actor_id)?;
    let connection = crate::connection(&app).map_err(VaultError::internal)?;
    let mut statement = connection
        .prepare("SELECT id,nonce,ciphertext,created_at,updated_at FROM password_entries WHERE actor_id=?1 ORDER BY updated_at DESC, id DESC")
        .map_err(VaultError::internal)?;
    let rows = statement
        .query_map([&actor_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, Vec<u8>>(1)?,
                row.get::<_, Vec<u8>>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
            ))
        })
        .map_err(VaultError::internal)?;
    let mut entries = Vec::new();
    for row in rows {
        let (id, nonce, ciphertext, created_at, updated_at) = row.map_err(VaultError::internal)?;
        let payload = decrypt_payload(&actor_id, &id, &nonce, &ciphertext, &key)?;
        entries.push(summary(&actor_id, id, payload, created_at, updated_at));
    }
    Ok(entries)
}

#[tauri::command]
pub fn vault_reveal(
    app: AppHandle,
    runtime: State<'_, VaultRuntime>,
    actor_id: String,
    entry_id: String,
) -> VaultResult<String> {
    validate_actor(&actor_id)?;
    let key = active_key(&runtime, &actor_id)?;
    let connection = crate::connection(&app).map_err(VaultError::internal)?;
    let (nonce, ciphertext, _, _) = entry_record(&connection, &actor_id, &entry_id)?;
    Ok(decrypt_payload(&actor_id, &entry_id, &nonce, &ciphertext, &key)?.password)
}

#[tauri::command]
pub fn vault_upsert(
    app: AppHandle,
    runtime: State<'_, VaultRuntime>,
    actor_id: String,
    input: PasswordVaultEntryInput,
) -> VaultResult<PasswordVaultEntry> {
    validate_actor(&actor_id)?;
    let key = active_key(&runtime, &actor_id)?;
    let (requested_id, payload) = validate_input(input)?;
    let connection = crate::connection(&app).map_err(VaultError::internal)?;
    crate::save_rolling_backup(&connection).map_err(VaultError::internal)?;
    let id = requested_id.unwrap_or_else(generated_id);
    let existing_actor = connection
        .query_row(
            "SELECT actor_id FROM password_entries WHERE id=?1",
            [&id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(VaultError::internal)?;
    if existing_actor
        .as_deref()
        .is_some_and(|existing| existing != actor_id.as_str())
    {
        return Err(VaultError::new(
            "entry_not_found",
            "La entrada ya no existe.",
        ));
    }
    let created_at = connection
        .query_row(
            "SELECT created_at FROM password_entries WHERE actor_id=?1 AND id=?2",
            params![actor_id, id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(VaultError::internal)?
        .unwrap_or_else(|| chrono::Utc::now().to_rfc3339());
    let updated_at = chrono::Utc::now().to_rfc3339();
    let nonce = random_bytes::<NONCE_LEN>();
    let plaintext = Zeroizing::new(serde_json::to_vec(&payload).map_err(VaultError::internal)?);
    let ciphertext = encrypt_with_key(
        &key,
        &nonce,
        &plaintext,
        entry_aad(&actor_id, &id).as_bytes(),
    )?;
    connection
        .execute(
            "INSERT INTO password_entries(id,actor_id,nonce,ciphertext,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,?6) ON CONFLICT(id) DO UPDATE SET nonce=excluded.nonce,ciphertext=excluded.ciphertext,updated_at=excluded.updated_at WHERE password_entries.actor_id=excluded.actor_id",
            params![id, actor_id, nonce.to_vec(), ciphertext, created_at, updated_at],
        )
        .map_err(VaultError::internal)?;
    Ok(summary(&actor_id, id, payload, created_at, updated_at))
}

#[tauri::command]
pub fn vault_delete(
    app: AppHandle,
    runtime: State<'_, VaultRuntime>,
    actor_id: String,
    entry_id: String,
) -> VaultResult<()> {
    validate_actor(&actor_id)?;
    active_key(&runtime, &actor_id)?;
    let connection = crate::connection(&app).map_err(VaultError::internal)?;
    crate::save_rolling_backup(&connection).map_err(VaultError::internal)?;
    connection
        .execute(
            "DELETE FROM password_entries WHERE actor_id=?1 AND id=?2",
            params![actor_id, entry_id],
        )
        .map_err(VaultError::internal)?;
    Ok(())
}

#[tauri::command]
pub fn vault_change_master(
    app: AppHandle,
    runtime: State<'_, VaultRuntime>,
    actor_id: String,
    current_password: String,
    new_password: String,
) -> VaultResult<()> {
    validate_actor(&actor_id)?;
    validate_master(&new_password)?;
    let connection = crate::connection(&app).map_err(VaultError::internal)?;
    let record = load_profile(&connection, &actor_id)?.ok_or_else(|| {
        VaultError::new("not_configured", "Este perfil todavía no tiene un almacén.")
    })?;
    let data_key = unwrap_profile_key(&actor_id, &current_password, &record).map_err(|_| {
        VaultError::new(
            "invalid_master_password",
            "La contraseña maestra actual no es correcta.",
        )
    })?;
    crate::save_rolling_backup(&connection).map_err(VaultError::internal)?;
    let salt = random_bytes::<SALT_LEN>();
    let nonce = random_bytes::<NONCE_LEN>();
    let wrapping_key = derive_key(&new_password, &salt, MEMORY_KIB, ITERATIONS, PARALLELISM)?;
    let wrapped_key = encrypt_with_key(
        &wrapping_key,
        &nonce,
        &data_key,
        wrap_aad(&actor_id).as_bytes(),
    )?;
    connection
        .execute(
            "UPDATE password_vaults SET salt=?2,memory_kib=?3,iterations=?4,parallelism=?5,wrap_nonce=?6,wrapped_key=?7,updated_at=datetime('now') WHERE actor_id=?1",
            params![actor_id, salt.to_vec(), MEMORY_KIB, ITERATIONS, PARALLELISM, nonce.to_vec(), wrapped_key],
        )
        .map_err(VaultError::internal)?;
    set_unlocked(&runtime, &actor_id, data_key)
}

#[tauri::command]
pub fn vault_reset(
    app: AppHandle,
    runtime: State<'_, VaultRuntime>,
    actor_id: String,
    confirmation: String,
) -> VaultResult<()> {
    validate_actor(&actor_id)?;
    if !matches!(confirmation.trim(), "ELIMINAR" | "DELETE") {
        return Err(VaultError::new(
            "confirmation_required",
            "Escribe ELIMINAR para borrar este almacén.",
        ));
    }
    let connection = crate::connection(&app).map_err(VaultError::internal)?;
    crate::save_rolling_backup(&connection).map_err(VaultError::internal)?;
    connection
        .execute("DELETE FROM password_vaults WHERE actor_id=?1", [&actor_id])
        .map_err(VaultError::internal)?;
    runtime
        .unlocked
        .lock()
        .map_err(VaultError::internal)?
        .remove(&actor_id);
    Ok(())
}

#[tauri::command]
pub fn vault_generate_password(
    length: usize,
    include_digits: bool,
    include_symbols: bool,
) -> VaultResult<String> {
    if !(12..=128).contains(&length) {
        return Err(VaultError::new(
            "invalid_length",
            "La longitud debe estar entre 12 y 128 caracteres.",
        ));
    }
    let letters = b"ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
    let digits = b"23456789";
    let symbols = b"!@#$%^&*()-_=+[]{};:,.?";
    let mut groups: Vec<&[u8]> = vec![letters];
    if include_digits {
        groups.push(digits);
    }
    if include_symbols {
        groups.push(symbols);
    }
    let alphabet = groups
        .iter()
        .flat_map(|group| group.iter().copied())
        .collect::<Vec<_>>();
    let mut password = groups
        .iter()
        .map(|group| group[sample_index(group.len())])
        .collect::<Vec<_>>();
    while password.len() < length {
        password.push(alphabet[sample_index(alphabet.len())]);
    }
    for index in (1..password.len()).rev() {
        let other = sample_index(index + 1);
        password.swap(index, other);
    }
    String::from_utf8(password).map_err(VaultError::internal)
}

#[tauri::command]
pub fn vault_copy_secret(
    app: AppHandle,
    runtime: State<'_, VaultRuntime>,
    actor_id: String,
    entry_id: String,
) -> VaultResult<()> {
    validate_actor(&actor_id)?;
    let key = active_key(&runtime, &actor_id)?;
    let connection = crate::connection(&app).map_err(VaultError::internal)?;
    let (nonce, ciphertext, _, _) = entry_record(&connection, &actor_id, &entry_id)?;
    let secret =
        Zeroizing::new(decrypt_payload(&actor_id, &entry_id, &nonce, &ciphertext, &key)?.password);
    arboard::Clipboard::new()
        .and_then(|mut clipboard| clipboard.set_text(secret.as_str()))
        .map_err(VaultError::internal)?;
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(30));
        if let Ok(mut clipboard) = arboard::Clipboard::new() {
            if clipboard
                .get_text()
                .is_ok_and(|current| current == secret.as_str())
            {
                let _ = clipboard.set_text(String::new());
            }
        }
    });
    Ok(())
}

pub(crate) fn lock_all(runtime: &VaultRuntime) {
    if let Ok(mut unlocked) = runtime.unlocked.lock() {
        unlocked.clear();
    }
}

pub(crate) fn export_encrypted(connection: &Connection) -> Result<EncryptedVaultBackup, String> {
    let mut profiles_statement = connection.prepare("SELECT actor_id,salt,memory_kib,iterations,parallelism,wrap_nonce,wrapped_key,created_at,updated_at FROM password_vaults ORDER BY actor_id").map_err(|error| error.to_string())?;
    let profiles = profiles_statement
        .query_map([], |row| {
            Ok(EncryptedVaultProfileBackup {
                actor_id: row.get(0)?,
                salt: row.get(1)?,
                memory_kib: row.get::<_, i64>(2)? as u32,
                iterations: row.get::<_, i64>(3)? as u32,
                parallelism: row.get::<_, i64>(4)? as u32,
                wrap_nonce: row.get(5)?,
                wrapped_key: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            })
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    let mut entries_statement = connection.prepare("SELECT id,actor_id,nonce,ciphertext,created_at,updated_at FROM password_entries ORDER BY actor_id,id").map_err(|error| error.to_string())?;
    let entries = entries_statement
        .query_map([], |row| {
            Ok(EncryptedVaultEntryBackup {
                id: row.get(0)?,
                actor_id: row.get(1)?,
                nonce: row.get(2)?,
                ciphertext: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    Ok(EncryptedVaultBackup { profiles, entries })
}

pub(crate) fn restore_encrypted(
    connection: &Connection,
    backup: &EncryptedVaultBackup,
) -> Result<(), String> {
    connection
        .execute("DELETE FROM password_entries", [])
        .map_err(|error| error.to_string())?;
    connection
        .execute("DELETE FROM password_vaults", [])
        .map_err(|error| error.to_string())?;
    for profile in &backup.profiles {
        connection.execute(
            "INSERT INTO password_vaults(actor_id,salt,memory_kib,iterations,parallelism,wrap_nonce,wrapped_key,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,?6,?7,?8,?9)",
            params![profile.actor_id, profile.salt, profile.memory_kib, profile.iterations, profile.parallelism, profile.wrap_nonce, profile.wrapped_key, profile.created_at, profile.updated_at],
        ).map_err(|error| error.to_string())?;
    }
    for entry in &backup.entries {
        connection.execute(
            "INSERT INTO password_entries(id,actor_id,nonce,ciphertext,created_at,updated_at) VALUES(?1,?2,?3,?4,?5,?6)",
            params![entry.id, entry.actor_id, entry.nonce, entry.ciphertext, entry.created_at, entry.updated_at],
        ).map_err(|error| error.to_string())?;
    }
    Ok(())
}

pub(crate) fn encrypted_entry_count(connection: &Connection) -> Result<usize, String> {
    connection
        .query_row("SELECT COUNT(*) FROM password_entries", [], |row| {
            row.get::<_, i64>(0)
        })
        .map(|value| value as usize)
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn schema(connection: &Connection) {
        connection.execute_batch(
            "PRAGMA foreign_keys=ON;
             CREATE TABLE password_vaults(actor_id TEXT PRIMARY KEY,salt BLOB NOT NULL,memory_kib INTEGER NOT NULL,iterations INTEGER NOT NULL,parallelism INTEGER NOT NULL,wrap_nonce BLOB NOT NULL,wrapped_key BLOB NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
             CREATE TABLE password_entries(id TEXT PRIMARY KEY,actor_id TEXT NOT NULL REFERENCES password_vaults(actor_id) ON DELETE CASCADE,nonce BLOB NOT NULL,ciphertext BLOB NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);",
        ).unwrap();
    }

    #[test]
    fn encrypts_and_detects_tampering() {
        let key = random_bytes::<KEY_LEN>();
        let nonce = random_bytes::<NONCE_LEN>();
        let mut ciphertext = encrypt_with_key(&key, &nonce, b"secret", b"aad").unwrap();
        assert_eq!(
            &*decrypt_with_key(&key, &nonce, &ciphertext, b"aad").unwrap(),
            b"secret"
        );
        ciphertext[0] ^= 1;
        assert!(decrypt_with_key(&key, &nonce, &ciphertext, b"aad").is_err());
    }

    #[test]
    fn master_password_and_actor_aad_are_required() {
        let salt = random_bytes::<SALT_LEN>();
        let nonce = random_bytes::<NONCE_LEN>();
        let data_key = random_bytes::<KEY_LEN>();
        let wrapping_key = derive_key(
            "a very long master phrase",
            &salt,
            MEMORY_KIB,
            ITERATIONS,
            PARALLELISM,
        )
        .unwrap();
        let wrapped_key =
            encrypt_with_key(&wrapping_key, &nonce, &data_key, wrap_aad("me").as_bytes()).unwrap();
        let record = ProfileRecord {
            salt: salt.to_vec(),
            memory_kib: MEMORY_KIB,
            iterations: ITERATIONS,
            parallelism: PARALLELISM,
            wrap_nonce: nonce.to_vec(),
            wrapped_key,
        };
        assert_eq!(
            &*unwrap_profile_key("me", "a very long master phrase", &record).unwrap(),
            &data_key
        );
        assert!(unwrap_profile_key("me", "the wrong master phrase", &record).is_err());
        assert!(unwrap_profile_key("partner", "a very long master phrase", &record).is_err());
    }

    #[test]
    fn encrypted_backup_contains_no_entry_plaintext() {
        let connection = Connection::open_in_memory().unwrap();
        schema(&connection);
        let salt = random_bytes::<SALT_LEN>();
        let nonce = random_bytes::<NONCE_LEN>();
        connection
            .execute(
                "INSERT INTO password_vaults VALUES('me',?1,19456,2,1,?2,?3,'now','now')",
                params![salt.to_vec(), nonce.to_vec(), vec![1u8; 48]],
            )
            .unwrap();
        let key = random_bytes::<KEY_LEN>();
        let payload = serde_json::to_vec(&VaultEntryPayload {
            site: "Example".into(),
            url: "https://example.com".into(),
            username: "ana".into(),
            password: "my-secret-password".into(),
            notes: "private note".into(),
        })
        .unwrap();
        let ciphertext =
            encrypt_with_key(&key, &nonce, &payload, entry_aad("me", "entry").as_bytes()).unwrap();
        connection
            .execute(
                "INSERT INTO password_entries VALUES('entry','me',?1,?2,'now','now')",
                params![nonce.to_vec(), ciphertext],
            )
            .unwrap();
        let serialized = serde_json::to_string(&export_encrypted(&connection).unwrap()).unwrap();
        assert!(!serialized.contains("my-secret-password"));
        let restored = Connection::open_in_memory().unwrap();
        schema(&restored);
        restore_encrypted(&restored, &export_encrypted(&connection).unwrap()).unwrap();
        assert_eq!(encrypted_entry_count(&restored).unwrap(), 1);
    }
}
