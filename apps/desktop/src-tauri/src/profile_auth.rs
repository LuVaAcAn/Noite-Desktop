use argon2::{Algorithm, Argon2, Params, Version};
use base64::Engine;
use chacha20poly1305::aead::{rand_core::RngCore, OsRng};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use std::collections::HashSet;
use std::sync::Mutex;
use tauri::{AppHandle, State};

use crate::{CommandError, CommandResult};

#[derive(Default)]
pub struct ProfileAuthRuntime {
    unlocked: Mutex<HashSet<String>>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileAuthStatus {
    profile_id: String,
    initialized: bool,
    unlocked: bool,
    access_mode: String,
    credential_kind: Option<String>,
    locale: String,
    locked_until: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileSetupResult {
    status: ProfileAuthStatus,
    recovery_code: String,
}

fn error(code: &str, message: impl Into<String>) -> CommandError {
    CommandError {
        code: code.into(),
        message: message.into(),
        details: None,
    }
}

pub fn migrate(connection: &Connection) -> Result<(), String> {
    connection.execute_batch("CREATE TABLE IF NOT EXISTS profile_credentials(
        profile_id TEXT PRIMARY KEY,
        access_mode TEXT NOT NULL DEFAULT 'setup_required' CHECK(access_mode IN ('protected','open','setup_required')),
        credential_kind TEXT CHECK(credential_kind IN ('pin','password')),
        locale TEXT NOT NULL DEFAULT 'es' CHECK(locale IN ('es','en')),
        salt BLOB,
        verifier BLOB,
        recovery_salt BLOB,
        recovery_verifier BLOB,
        failed_attempts INTEGER NOT NULL DEFAULT 0,
        lock_level INTEGER NOT NULL DEFAULT 0,
        locked_until TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );").map_err(|cause| cause.to_string())
}

pub fn migrate_v8(connection: &Connection) -> Result<(), String> {
    let has_access_mode = {
        let mut statement = connection
            .prepare("PRAGMA table_info(profile_credentials)")
            .map_err(|cause| cause.to_string())?;
        let columns = statement
            .query_map([], |row| row.get::<_, String>(1))
            .map_err(|cause| cause.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|cause| cause.to_string())?;
        columns.iter().any(|column| column == "access_mode")
    };
    if has_access_mode {
        return Ok(());
    }
    connection.execute_batch("BEGIN IMMEDIATE;
        ALTER TABLE profile_credentials RENAME TO profile_credentials_v7;
        CREATE TABLE profile_credentials(
            profile_id TEXT PRIMARY KEY,
            access_mode TEXT NOT NULL DEFAULT 'setup_required' CHECK(access_mode IN ('protected','open','setup_required')),
            credential_kind TEXT CHECK(credential_kind IN ('pin','password')),
            locale TEXT NOT NULL DEFAULT 'es' CHECK(locale IN ('es','en')),
            salt BLOB, verifier BLOB, recovery_salt BLOB, recovery_verifier BLOB,
            failed_attempts INTEGER NOT NULL DEFAULT 0,
            lock_level INTEGER NOT NULL DEFAULT 0,
            locked_until TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );
        INSERT INTO profile_credentials(profile_id,access_mode,credential_kind,locale,salt,verifier,recovery_salt,recovery_verifier,failed_attempts,lock_level,locked_until,created_at,updated_at)
        SELECT profile_id,'protected',credential_kind,locale,salt,verifier,recovery_salt,recovery_verifier,failed_attempts,lock_level,locked_until,created_at,updated_at FROM profile_credentials_v7;
        DROP TABLE profile_credentials_v7;
        COMMIT;").map_err(|cause| cause.to_string())
}

fn hash(secret: &str, salt: &[u8]) -> Result<Vec<u8>, CommandError> {
    let params = Params::new(32_768, 3, 1, Some(32))
        .map_err(|cause| CommandError::from(cause.to_string()))?;
    let mut output = vec![0_u8; 32];
    Argon2::new(Algorithm::Argon2id, Version::V0x13, params)
        .hash_password_into(secret.as_bytes(), salt, &mut output)
        .map_err(|cause| CommandError::from(cause.to_string()))?;
    Ok(output)
}

fn validate(kind: &str, credential: &str) -> CommandResult<()> {
    match kind {
        "pin"
            if credential.len() == 4 && credential.bytes().all(|value| value.is_ascii_digit()) =>
        {
            Ok(())
        }
        "password" if credential.chars().count() >= 8 => Ok(()),
        "pin" => Err(error(
            "invalid_pin",
            "El PIN debe tener exactamente 4 dígitos.",
        )),
        "password" => Err(error(
            "weak_profile_password",
            "La contraseña debe tener al menos 8 caracteres.",
        )),
        _ => Err(error(
            "invalid_credential_kind",
            "El tipo de credencial no es válido.",
        )),
    }
}

fn status_internal(
    connection: &Connection,
    runtime: &ProfileAuthRuntime,
    profile_id: &str,
) -> CommandResult<ProfileAuthStatus> {
    let row = connection.query_row(
        "SELECT access_mode,credential_kind,locale,locked_until FROM profile_credentials WHERE profile_id=?1",
        [profile_id],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?, row.get::<_, String>(2)?, row.get::<_, Option<String>>(3)?)),
    ).optional().map_err(|cause| CommandError::from(cause.to_string()))?;
    let unlocked = runtime
        .unlocked
        .lock()
        .map_err(|_| error("auth_runtime", "No se pudo consultar la sesión."))?
        .contains(profile_id);
    Ok(match row {
        Some((access_mode, credential_kind, locale, locked_until)) => ProfileAuthStatus {
            profile_id: profile_id.into(),
            initialized: access_mode != "setup_required",
            unlocked,
            access_mode,
            credential_kind,
            locale,
            locked_until,
        },
        None => ProfileAuthStatus {
            profile_id: profile_id.into(),
            initialized: false,
            unlocked: false,
            access_mode: "setup_required".into(),
            credential_kind: None,
            locale: "es".into(),
            locked_until: None,
        },
    })
}

#[tauri::command]
pub fn profile_auth_status(
    app: AppHandle,
    runtime: State<'_, ProfileAuthRuntime>,
    profile_id: String,
) -> CommandResult<ProfileAuthStatus> {
    let connection = crate::connection(&app).map_err(CommandError::from)?;
    status_internal(&connection, &runtime, &profile_id)
}

#[tauri::command]
pub fn profile_auth_setup(
    app: AppHandle,
    runtime: State<'_, ProfileAuthRuntime>,
    profile_id: String,
    credential_kind: String,
    credential: String,
    locale: String,
) -> CommandResult<ProfileSetupResult> {
    validate(&credential_kind, &credential)?;
    if !matches!(locale.as_str(), "es" | "en") {
        return Err(error("invalid_locale", "El idioma no es válido."));
    }
    let mut credential_salt = [0_u8; 16];
    let mut recovery_salt = [0_u8; 16];
    let mut recovery_bytes = [0_u8; 24];
    OsRng.fill_bytes(&mut credential_salt);
    OsRng.fill_bytes(&mut recovery_salt);
    OsRng.fill_bytes(&mut recovery_bytes);
    let recovery_code = base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(recovery_bytes);
    let verifier = hash(&credential, &credential_salt)?;
    let recovery_verifier = hash(&recovery_code, &recovery_salt)?;
    let connection = crate::connection(&app).map_err(CommandError::from)?;
    connection.execute("INSERT INTO profile_credentials(profile_id,access_mode,credential_kind,locale,salt,verifier,recovery_salt,recovery_verifier) VALUES(?1,'protected',?2,?3,?4,?5,?6,?7) ON CONFLICT(profile_id) DO UPDATE SET access_mode='protected',credential_kind=excluded.credential_kind,locale=excluded.locale,salt=excluded.salt,verifier=excluded.verifier,recovery_salt=excluded.recovery_salt,recovery_verifier=excluded.recovery_verifier,failed_attempts=0,lock_level=0,locked_until=NULL,updated_at=datetime('now')", params![profile_id, credential_kind, locale, credential_salt.to_vec(), verifier, recovery_salt.to_vec(), recovery_verifier]).map_err(|cause| CommandError::from(cause.to_string()))?;
    runtime
        .unlocked
        .lock()
        .map_err(|_| error("auth_runtime", "No se pudo iniciar la sesión."))?
        .insert(profile_id.clone());
    Ok(ProfileSetupResult {
        status: status_internal(&connection, &runtime, &profile_id)?,
        recovery_code,
    })
}

#[tauri::command]
pub fn profile_auth_setup_open(
    app: AppHandle,
    runtime: State<'_, ProfileAuthRuntime>,
    profile_id: String,
    locale: String,
) -> CommandResult<ProfileAuthStatus> {
    if !matches!(locale.as_str(), "es" | "en") {
        return Err(error("invalid_locale", "El idioma no es válido."));
    }
    let connection = crate::connection(&app).map_err(CommandError::from)?;
    connection.execute("INSERT INTO profile_credentials(profile_id,access_mode,locale) VALUES(?1,'open',?2) ON CONFLICT(profile_id) DO UPDATE SET access_mode='open',credential_kind=NULL,locale=excluded.locale,salt=NULL,verifier=NULL,recovery_salt=NULL,recovery_verifier=NULL,failed_attempts=0,lock_level=0,locked_until=NULL,updated_at=datetime('now')", params![profile_id, locale]).map_err(|cause| CommandError::from(cause.to_string()))?;
    runtime
        .unlocked
        .lock()
        .map_err(|_| error("auth_runtime", "No se pudo iniciar la sesión."))?
        .insert(profile_id.clone());
    status_internal(&connection, &runtime, &profile_id)
}

#[tauri::command]
pub fn profile_auth_enter_open(
    app: AppHandle,
    runtime: State<'_, ProfileAuthRuntime>,
    profile_id: String,
) -> CommandResult<ProfileAuthStatus> {
    let connection = crate::connection(&app).map_err(CommandError::from)?;
    let mode = connection
        .query_row(
            "SELECT access_mode FROM profile_credentials WHERE profile_id=?1",
            [&profile_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|cause| CommandError::from(cause.to_string()))?;
    if mode.as_deref() != Some("open") {
        return Err(error(
            "profile_not_open",
            "Este perfil requiere configuración o una credencial.",
        ));
    }
    runtime
        .unlocked
        .lock()
        .map_err(|_| error("auth_runtime", "No se pudo iniciar la sesión."))?
        .insert(profile_id.clone());
    status_internal(&connection, &runtime, &profile_id)
}

#[tauri::command]
pub fn profile_auth_reset_other(
    app: AppHandle,
    runtime: State<'_, ProfileAuthRuntime>,
    requester_profile_id: String,
    target_profile_id: String,
) -> CommandResult<ProfileAuthStatus> {
    if requester_profile_id == target_profile_id {
        return Err(error(
            "cannot_reset_self",
            "No puedes borrar la credencial de tu propio perfil.",
        ));
    }
    if !runtime
        .unlocked
        .lock()
        .map_err(|_| error("auth_runtime", "No se pudo consultar la sesión."))?
        .contains(&requester_profile_id)
    {
        return Err(error(
            "requester_locked",
            "Desbloquea tu perfil antes de restablecer el de tu pareja.",
        ));
    }
    let connection = crate::connection(&app).map_err(CommandError::from)?;
    let settings_payload = connection
        .query_row(
            "SELECT payload FROM local_settings WHERE singleton=1",
            [],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|cause| CommandError::from(cause.to_string()))?
        .ok_or_else(|| {
            error(
                "profiles_unavailable",
                "No se pudo comprobar la pareja de perfiles.",
            )
        })?;
    let settings: serde_json::Value = serde_json::from_str(&settings_payload)
        .map_err(|cause| CommandError::from(cause.to_string()))?;
    let primary = settings
        .pointer("/profiles/primary/id")
        .and_then(|value| value.as_str());
    let partner = settings
        .pointer("/profiles/partner/id")
        .and_then(|value| value.as_str());
    let active = settings
        .get("activeProfileId")
        .and_then(|value| value.as_str());
    let valid_pair = active == Some(requester_profile_id.as_str())
        && matches!((primary, partner), (Some(primary), Some(partner)) if (primary == requester_profile_id && partner == target_profile_id) || (partner == requester_profile_id && primary == target_profile_id));
    if !valid_pair {
        return Err(error(
            "invalid_profile_pair",
            "Solo puedes restablecer el otro perfil de esta pareja.",
        ));
    }
    let locale = connection
        .query_row(
            "SELECT locale FROM profile_credentials WHERE profile_id=?1",
            [&target_profile_id],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(|cause| CommandError::from(cause.to_string()))?
        .unwrap_or_else(|| "es".into());
    connection.execute("INSERT INTO profile_credentials(profile_id,access_mode,locale) VALUES(?1,'setup_required',?2) ON CONFLICT(profile_id) DO UPDATE SET access_mode='setup_required',credential_kind=NULL,salt=NULL,verifier=NULL,recovery_salt=NULL,recovery_verifier=NULL,failed_attempts=0,lock_level=0,locked_until=NULL,updated_at=datetime('now')", params![target_profile_id, locale]).map_err(|cause| CommandError::from(cause.to_string()))?;
    runtime
        .unlocked
        .lock()
        .map_err(|_| error("auth_runtime", "No se pudo cerrar la sesión del perfil."))?
        .remove(&target_profile_id);
    status_internal(&connection, &runtime, &target_profile_id)
}

fn verify(
    app: &AppHandle,
    runtime: &ProfileAuthRuntime,
    profile_id: &str,
    secret: &str,
    recovery: bool,
) -> CommandResult<ProfileAuthStatus> {
    let connection = crate::connection(app).map_err(CommandError::from)?;
    let row = connection.query_row("SELECT access_mode,salt,verifier,recovery_salt,recovery_verifier,failed_attempts,lock_level,locked_until FROM profile_credentials WHERE profile_id=?1", [profile_id], |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<Vec<u8>>>(1)?, row.get::<_, Option<Vec<u8>>>(2)?, row.get::<_, Option<Vec<u8>>>(3)?, row.get::<_, Option<Vec<u8>>>(4)?, row.get::<_, i64>(5)?, row.get::<_, i64>(6)?, row.get::<_, Option<String>>(7)?))).optional().map_err(|cause| CommandError::from(cause.to_string()))?.ok_or_else(|| error("profile_auth_not_configured", "Este perfil todavía no tiene una credencial."))?;
    if row.0 != "protected" {
        return Err(error(
            "profile_auth_not_configured",
            "Este perfil no tiene una credencial configurada.",
        ));
    }
    if row
        .7
        .as_deref()
        .and_then(|value| value.parse::<chrono::DateTime<chrono::Utc>>().ok())
        .is_some_and(|until| until > chrono::Utc::now())
    {
        return Err(error(
            "profile_locked",
            format!(
                "Demasiados intentos. Intenta de nuevo después de {}.",
                row.7.unwrap_or_default()
            ),
        ));
    }
    let pair = if recovery {
        row.3.as_deref().zip(row.4.as_deref())
    } else {
        row.1.as_deref().zip(row.2.as_deref())
    };
    let (salt, expected) = pair.ok_or_else(|| {
        error(
            "profile_auth_corrupt",
            "La credencial del perfil está dañada.",
        )
    })?;
    if hash(secret, salt)? != expected {
        let attempts = row.5 + 1;
        if attempts >= 5 {
            let level = (row.6 + 1).min(3);
            let seconds = match level {
                1 => 30,
                2 => 120,
                _ => 600,
            };
            let until = (chrono::Utc::now() + chrono::Duration::seconds(seconds)).to_rfc3339();
            connection.execute("UPDATE profile_credentials SET failed_attempts=0,lock_level=?1,locked_until=?2,updated_at=datetime('now') WHERE profile_id=?3", params![level, until, profile_id]).map_err(|cause| CommandError::from(cause.to_string()))?;
            return Err(error(
                "profile_locked",
                format!("Demasiados intentos. El perfil se bloqueó durante {seconds} segundos."),
            ));
        }
        connection.execute("UPDATE profile_credentials SET failed_attempts=?1,updated_at=datetime('now') WHERE profile_id=?2", params![attempts, profile_id]).map_err(|cause| CommandError::from(cause.to_string()))?;
        return Err(error(
            if recovery {
                "invalid_recovery_code"
            } else {
                "invalid_profile_credential"
            },
            if recovery {
                "El código de recuperación es incorrecto."
            } else {
                "La credencial es incorrecta."
            },
        ));
    }
    connection.execute("UPDATE profile_credentials SET failed_attempts=0,locked_until=NULL,updated_at=datetime('now') WHERE profile_id=?1", [profile_id]).map_err(|cause| CommandError::from(cause.to_string()))?;
    runtime
        .unlocked
        .lock()
        .map_err(|_| error("auth_runtime", "No se pudo iniciar la sesión."))?
        .insert(profile_id.into());
    status_internal(&connection, runtime, profile_id)
}

#[tauri::command]
pub fn profile_auth_unlock(
    app: AppHandle,
    runtime: State<'_, ProfileAuthRuntime>,
    profile_id: String,
    credential: String,
) -> CommandResult<ProfileAuthStatus> {
    verify(&app, &runtime, &profile_id, &credential, false)
}

#[tauri::command]
pub fn profile_auth_recover(
    app: AppHandle,
    runtime: State<'_, ProfileAuthRuntime>,
    profile_id: String,
    recovery_code: String,
) -> CommandResult<ProfileAuthStatus> {
    verify(&app, &runtime, &profile_id, &recovery_code, true)
}

#[tauri::command]
pub fn profile_auth_lock_all(runtime: State<'_, ProfileAuthRuntime>) -> CommandResult<()> {
    lock_all(&runtime)
}

pub(crate) fn lock_all(runtime: &ProfileAuthRuntime) -> CommandResult<()> {
    runtime
        .unlocked
        .lock()
        .map_err(|_| error("auth_runtime", "No se pudieron cerrar las sesiones."))?
        .clear();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn v8_migration_preserves_credentials_and_allows_unprotected_profiles() {
        let connection = Connection::open_in_memory().unwrap();
        connection.execute_batch("CREATE TABLE profile_credentials(
            profile_id TEXT PRIMARY KEY,
            credential_kind TEXT NOT NULL CHECK(credential_kind IN ('pin','password')),
            locale TEXT NOT NULL DEFAULT 'es', salt BLOB NOT NULL, verifier BLOB NOT NULL,
            recovery_salt BLOB NOT NULL, recovery_verifier BLOB NOT NULL,
            failed_attempts INTEGER NOT NULL DEFAULT 0, lock_level INTEGER NOT NULL DEFAULT 0,
            locked_until TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
        );").unwrap();
        connection.execute("INSERT INTO profile_credentials(profile_id,credential_kind,locale,salt,verifier,recovery_salt,recovery_verifier) VALUES('one','pin','es',x'01',x'02',x'03',x'04')", []).unwrap();
        migrate_v8(&connection).unwrap();
        let preserved: (String, String, Vec<u8>) = connection.query_row("SELECT access_mode,credential_kind,verifier FROM profile_credentials WHERE profile_id='one'", [], |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?))).unwrap();
        assert_eq!(preserved, ("protected".into(), "pin".into(), vec![2]));
        connection.execute("INSERT INTO profile_credentials(profile_id,access_mode,locale) VALUES('two','open','en')", []).unwrap();
        let kind: Option<String> = connection
            .query_row(
                "SELECT credential_kind FROM profile_credentials WHERE profile_id='two'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(kind, None);
    }
}
