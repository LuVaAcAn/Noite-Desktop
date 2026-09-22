#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use argon2::{Algorithm, Argon2, Params as ArgonParams, Version};
use base64::Engine;
use chacha20poly1305::{
    aead::{rand_core::RngCore, Aead, KeyInit, OsRng},
    XChaCha20Poly1305, XNonce,
};
use cpal::traits::{DeviceTrait, HostTrait};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    collections::HashMap,
    fs,
    io::{Cursor, Read, Write},
    path::{Path, PathBuf},
};
use tauri::{AppHandle, Manager, State};

mod archive_database;
mod cover_search;
mod data_management;
mod game_discovery;
mod local_audio;
mod password_vault;
mod profile_auth;
mod provider_gate;
mod spotify_link;

fn database_path(app: &AppHandle) -> Result<PathBuf, String> {
    let directory = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    fs::create_dir_all(&directory).map_err(|error| error.to_string())?;
    Ok(directory.join("proyecto-noche.sqlite3"))
}

const SCHEMA_VERSION: i64 = 11;

fn migrate_legacy_sync_tables(connection: &Connection) -> Result<(), String> {
    connection.execute_batch("CREATE TABLE IF NOT EXISTS sync_space(singleton INTEGER PRIMARY KEY CHECK(singleton=1),space_id TEXT NOT NULL,enabled INTEGER NOT NULL DEFAULT 0,document BLOB,created_at TEXT NOT NULL DEFAULT(datetime('now')),last_sync_at TEXT,last_error TEXT,connection_path TEXT);
        CREATE TABLE IF NOT EXISTS sync_peers(device_id TEXT PRIMARY KEY,display_name TEXT NOT NULL,endpoint_addr TEXT NOT NULL,actor_mapping TEXT NOT NULL DEFAULT 'same',authorized_at TEXT NOT NULL DEFAULT(datetime('now')),last_seen_at TEXT,revoked_at TEXT);
        CREATE TABLE IF NOT EXISTS sync_invites(secret_hash TEXT PRIMARY KEY,expires_at TEXT NOT NULL,used_at TEXT);
        CREATE TABLE IF NOT EXISTS sync_conflicts(id TEXT PRIMARY KEY,collection_name TEXT NOT NULL,entity_id TEXT NOT NULL,field_name TEXT NOT NULL,values_json TEXT NOT NULL,created_at TEXT NOT NULL DEFAULT(datetime('now')),resolved_at TEXT);
        CREATE TABLE IF NOT EXISTS sync_conflict_ignores(id TEXT PRIMARY KEY,ignored_at TEXT NOT NULL DEFAULT(datetime('now')));
        CREATE TABLE IF NOT EXISTS sync_media(storage_path TEXT PRIMARY KEY,content_hash TEXT,size_bytes INTEGER,available_locally INTEGER NOT NULL DEFAULT 0,updated_at TEXT NOT NULL DEFAULT(datetime('now')));")
        .map_err(|cause| cause.to_string())?;
    let has_local_path = connection
        .prepare("PRAGMA table_info(sync_media)")
        .and_then(|mut statement| {
            statement
                .query_map([], |row| row.get::<_, String>(1))?
                .collect::<Result<Vec<_>, _>>()
        })
        .map_err(|cause| cause.to_string())?
        .iter()
        .any(|column| column == "local_storage_path");
    if !has_local_path {
        connection
            .execute(
                "ALTER TABLE sync_media ADD COLUMN local_storage_path TEXT",
                [],
            )
            .map_err(|cause| cause.to_string())?;
    }
    Ok(())
}

fn clear_typed_state(connection: &Connection) -> Result<(), String> {
    connection.execute_batch("DELETE FROM local_settings; DELETE FROM library_items; DELETE FROM plan_items; DELETE FROM plans; DELETE FROM reviews; DELETE FROM shared_reviews; DELETE FROM memory_tracks; DELETE FROM saved_music_items; DELETE FROM attachments; DELETE FROM sessions;").map_err(|error| error.to_string())
}

fn sync_typed_entry(connection: &Connection, key: &str, value: &Value) -> Result<(), String> {
    let raw = |entry: &Value| serde_json::to_string(entry).map_err(|error| error.to_string());
    match key {
        "settings" => {
            connection
                .execute("DELETE FROM local_settings", [])
                .map_err(|error| error.to_string())?;
            connection
                .execute(
                    "INSERT INTO local_settings(singleton, payload) VALUES(1, ?1)",
                    [raw(value)?],
                )
                .map_err(|error| error.to_string())?;
        }
        "libraryItems" => {
            connection
                .execute("DELETE FROM library_items", [])
                .map_err(|error| error.to_string())?;
            for item in value.as_array().into_iter().flatten() {
                connection.execute("INSERT INTO library_items(id, space_id, title, kind, status, archived_at, payload) VALUES(?1,?2,?3,?4,?5,?6,?7)", params![item.get("id").and_then(Value::as_str), item.get("spaceId").and_then(Value::as_str), item.get("title").and_then(Value::as_str), item.get("kind").and_then(Value::as_str), item.get("status").and_then(Value::as_str), item.get("archivedAt").and_then(Value::as_str), raw(item)?]).map_err(|error| error.to_string())?;
            }
        }
        "plans" => {
            connection
                .execute("DELETE FROM plan_items", [])
                .map_err(|error| error.to_string())?;
            connection
                .execute("DELETE FROM plans", [])
                .map_err(|error| error.to_string())?;
            for plan in value.as_array().into_iter().flatten() {
                connection.execute("INSERT INTO plans(id, space_id, title, status, starts_at, payload) VALUES(?1,?2,?3,?4,?5,?6)", params![plan.get("id").and_then(Value::as_str), plan.get("spaceId").and_then(Value::as_str), plan.get("title").and_then(Value::as_str), plan.get("status").and_then(Value::as_str), plan.get("startsAt").and_then(Value::as_str), raw(plan)?]).map_err(|error| error.to_string())?;
                for item in plan
                    .get("items")
                    .and_then(Value::as_array)
                    .into_iter()
                    .flatten()
                {
                    connection.execute("INSERT INTO plan_items(id, plan_id, library_item_id, title, status, position, payload) VALUES(?1,?2,?3,?4,?5,?6,?7)", params![item.get("id").and_then(Value::as_str), plan.get("id").and_then(Value::as_str), item.get("libraryItemId").and_then(Value::as_str), item.get("titleSnapshot").and_then(Value::as_str), item.get("status").and_then(Value::as_str), item.get("position").and_then(Value::as_i64), raw(item)?]).map_err(|error| error.to_string())?;
                }
            }
        }
        "reviews" => {
            connection
                .execute("DELETE FROM reviews", [])
                .map_err(|error| error.to_string())?;
            for item in value.as_array().into_iter().flatten() {
                connection.execute("INSERT INTO reviews(id, plan_item_id, user_id, rating, payload) VALUES(?1,?2,?3,?4,?5)", params![item.get("id").and_then(Value::as_str), item.get("planItemId").and_then(Value::as_str), item.get("userId").and_then(Value::as_str), item.get("rating").and_then(Value::as_f64), raw(item)?]).map_err(|error| error.to_string())?;
            }
        }
        "sharedReviews" => {
            connection
                .execute("DELETE FROM shared_reviews", [])
                .map_err(|error| error.to_string())?;
            for item in value.as_array().into_iter().flatten() {
                connection
                    .execute(
                        "INSERT INTO shared_reviews(plan_item_id, payload) VALUES(?1,?2)",
                        params![item.get("planItemId").and_then(Value::as_str), raw(item)?],
                    )
                    .map_err(|error| error.to_string())?;
            }
        }
        "memoryTracks" => {
            connection
                .execute("DELETE FROM memory_tracks", [])
                .map_err(|error| error.to_string())?;
            for item in value.as_array().into_iter().flatten() {
                connection.execute("INSERT INTO memory_tracks(id, plan_item_id, provider, title, payload) VALUES(?1,?2,?3,?4,?5)", params![item.get("id").and_then(Value::as_str), item.get("planItemId").and_then(Value::as_str), item.get("provider").and_then(Value::as_str), item.get("title").and_then(Value::as_str), raw(item)?]).map_err(|error| error.to_string())?;
            }
        }
        "savedMusicItems" => {
            connection
                .execute("DELETE FROM saved_music_items", [])
                .map_err(|error| error.to_string())?;
            for item in value.as_array().into_iter().flatten() {
                connection.execute("INSERT INTO saved_music_items(id, space_id, provider, title, payload) VALUES(?1,?2,?3,?4,?5)", params![item.get("id").and_then(Value::as_str), item.get("spaceId").and_then(Value::as_str), item.get("provider").and_then(Value::as_str), item.get("title").and_then(Value::as_str), raw(item)?]).map_err(|error| error.to_string())?;
            }
        }
        "attachments" => {
            connection
                .execute("DELETE FROM attachments", [])
                .map_err(|error| error.to_string())?;
            for item in value.as_array().into_iter().flatten() {
                connection.execute("INSERT INTO attachments(id, plan_item_id, storage_path, archived_at, payload) VALUES(?1,?2,?3,?4,?5)", params![item.get("id").and_then(Value::as_str), item.get("planItemId").and_then(Value::as_str), item.get("storagePath").and_then(Value::as_str), item.get("archivedAt").and_then(Value::as_str), raw(item)?]).map_err(|error| error.to_string())?;
            }
        }
        "sessions" => {
            connection
                .execute("DELETE FROM sessions", [])
                .map_err(|error| error.to_string())?;
            for item in value.as_array().into_iter().flatten() {
                connection.execute("INSERT INTO sessions(id, plan_id, status, current_plan_item_id, payload) VALUES(?1,?2,?3,?4,?5)", params![item.get("id").and_then(Value::as_str), item.get("planId").and_then(Value::as_str), item.get("status").and_then(Value::as_str), item.get("currentPlanItemId").and_then(Value::as_str), raw(item)?]).map_err(|error| error.to_string())?;
            }
        }
        _ => {}
    }
    Ok(())
}

fn synchronize_typed_state(connection: &Connection) -> Result<(), String> {
    let mut statement = connection
        .prepare("SELECT key, value FROM state")
        .map_err(|error| error.to_string())?;
    let entries = statement
        .query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())?;
    drop(statement);
    clear_typed_state(connection)?;
    for (key, raw) in entries {
        sync_typed_entry(
            connection,
            &key,
            &serde_json::from_str(&raw).map_err(|error| error.to_string())?,
        )?;
    }
    Ok(())
}

fn migrate(connection: &mut Connection) -> Result<(), String> {
    let version: i64 = connection
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .map_err(|error| error.to_string())?;
    if version > SCHEMA_VERSION {
        return Err(format!(
            "La base de datos usa la versión {version}, pero esta aplicación solo admite hasta la {SCHEMA_VERSION}."
        ));
    }
    if version == 0 {
        connection
            .execute_batch(
                "BEGIN IMMEDIATE;
                 CREATE TABLE IF NOT EXISTS state (
                     key TEXT PRIMARY KEY,
                     value TEXT NOT NULL
                 );
                 CREATE TABLE IF NOT EXISTS backups (
                     id INTEGER PRIMARY KEY AUTOINCREMENT,
                     created_at TEXT NOT NULL,
                     snapshot TEXT NOT NULL
                 );
                 PRAGMA user_version=1;
                 COMMIT;",
            )
            .map_err(|error| error.to_string())?;
    }
    if version < 2 {
        connection.execute_batch("BEGIN IMMEDIATE;
            CREATE TABLE IF NOT EXISTS local_settings(singleton INTEGER PRIMARY KEY CHECK(singleton=1), payload TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS library_items(id TEXT PRIMARY KEY, space_id TEXT, title TEXT, kind TEXT, status TEXT, archived_at TEXT, payload TEXT NOT NULL);
            CREATE INDEX IF NOT EXISTS idx_library_space_status ON library_items(space_id, status, archived_at);
            CREATE TABLE IF NOT EXISTS plans(id TEXT PRIMARY KEY, space_id TEXT, title TEXT, status TEXT, starts_at TEXT, payload TEXT NOT NULL);
            CREATE INDEX IF NOT EXISTS idx_plans_space_status ON plans(space_id, status, starts_at);
            CREATE TABLE IF NOT EXISTS plan_items(id TEXT PRIMARY KEY, plan_id TEXT NOT NULL, library_item_id TEXT, title TEXT, status TEXT, position INTEGER, payload TEXT NOT NULL, FOREIGN KEY(plan_id) REFERENCES plans(id) ON DELETE CASCADE);
            CREATE TABLE IF NOT EXISTS reviews(id TEXT PRIMARY KEY, plan_item_id TEXT, user_id TEXT, rating REAL, payload TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS shared_reviews(plan_item_id TEXT PRIMARY KEY, payload TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS memory_tracks(id TEXT PRIMARY KEY, plan_item_id TEXT, provider TEXT, title TEXT, payload TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS saved_music_items(id TEXT PRIMARY KEY, space_id TEXT, provider TEXT, title TEXT, payload TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS attachments(id TEXT PRIMARY KEY, plan_item_id TEXT, storage_path TEXT, archived_at TEXT, payload TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, plan_id TEXT, status TEXT, current_plan_item_id TEXT, payload TEXT NOT NULL);
            PRAGMA user_version=2; COMMIT;").map_err(|error| error.to_string())?;
        synchronize_typed_state(connection)?;
    }
    if version < 3 {
        connection
            .execute_batch("BEGIN IMMEDIATE; PRAGMA user_version=3; COMMIT;")
            .map_err(|error| error.to_string())?;
    }
    if version < 4 {
        connection.execute_batch("BEGIN IMMEDIATE; CREATE TABLE IF NOT EXISTS saved_music_items(id TEXT PRIMARY KEY, space_id TEXT, provider TEXT, title TEXT, payload TEXT NOT NULL); CREATE INDEX IF NOT EXISTS idx_saved_music_space ON saved_music_items(space_id, provider); PRAGMA user_version=4; COMMIT;").map_err(|error| error.to_string())?;
        synchronize_typed_state(connection)?;
    }
    if version < 5 {
        connection.execute_batch(
            "BEGIN IMMEDIATE;
             CREATE TABLE IF NOT EXISTS password_vaults(
                 actor_id TEXT PRIMARY KEY CHECK(actor_id IN ('me','partner')),
                 salt BLOB NOT NULL,
                 memory_kib INTEGER NOT NULL,
                 iterations INTEGER NOT NULL,
                 parallelism INTEGER NOT NULL,
                 wrap_nonce BLOB NOT NULL,
                 wrapped_key BLOB NOT NULL,
                 created_at TEXT NOT NULL,
                 updated_at TEXT NOT NULL
             );
             CREATE TABLE IF NOT EXISTS password_entries(
                 id TEXT PRIMARY KEY,
                 actor_id TEXT NOT NULL REFERENCES password_vaults(actor_id) ON DELETE CASCADE,
                 nonce BLOB NOT NULL,
                 ciphertext BLOB NOT NULL,
                 created_at TEXT NOT NULL,
                 updated_at TEXT NOT NULL
             );
             CREATE INDEX IF NOT EXISTS idx_password_entries_actor ON password_entries(actor_id, updated_at DESC);
             PRAGMA user_version=5;
             COMMIT;",
        ).map_err(|error| error.to_string())?;
    }
    if version < 6 {
        migrate_legacy_sync_tables(connection)?;
        connection
            .execute_batch("BEGIN IMMEDIATE; PRAGMA user_version=6; COMMIT;")
            .map_err(|error| error.to_string())?;
    }
    if version < 7 {
        profile_auth::migrate(connection)?;
        connection
            .execute_batch("BEGIN IMMEDIATE; PRAGMA user_version=7; COMMIT;")
            .map_err(|error| error.to_string())?;
    }
    if version < 8 {
        profile_auth::migrate_v8(connection)?;
        connection
            .execute_batch("BEGIN IMMEDIATE; PRAGMA user_version=8; COMMIT;")
            .map_err(|error| error.to_string())?;
    }
    // Las tablas auxiliares de la versión de sincronización pueden ampliarse
    // sin forzar una migración destructiva del documento compartido.
    if version < 9 {
        connection
            .execute_batch("BEGIN IMMEDIATE; PRAGMA user_version=9; COMMIT;")
            .map_err(|error| error.to_string())?;
    }
    if version < 10 {
        connection
            .execute_batch("BEGIN IMMEDIATE; PRAGMA user_version=10; COMMIT;")
            .map_err(|error| error.to_string())?;
    }
    if version < 11 {
        game_discovery::migrate(connection)?;
        connection
            .execute_batch("BEGIN IMMEDIATE; PRAGMA user_version=11; COMMIT;")
            .map_err(|error| error.to_string())?;
    }
    migrate_legacy_sync_tables(connection)?;
    profile_auth::migrate(connection)?;
    game_discovery::migrate(connection)?;
    Ok(())
}

fn connection(app: &AppHandle) -> Result<Connection, String> {
    let mut connection =
        Connection::open(database_path(app)?).map_err(|error| error.to_string())?;
    connection
        .execute_batch("PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;")
        .map_err(|error| error.to_string())?;
    migrate(&mut connection)?;
    Ok(connection)
}

fn read_state(connection: &Connection) -> Result<HashMap<String, Value>, String> {
    let mut statement = connection
        .prepare("SELECT key, value FROM state")
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| {
            let key: String = row.get(0)?;
            let raw: String = row.get(1)?;
            Ok((key, raw))
        })
        .map_err(|error| error.to_string())?;
    let mut result = HashMap::new();
    for row in rows {
        let (key, raw) = row.map_err(|error| error.to_string())?;
        result.insert(
            key,
            serde_json::from_str(&raw).map_err(|error| error.to_string())?,
        );
    }
    Ok(result)
}

#[derive(Deserialize, Serialize)]
struct RollingSnapshot {
    version: u8,
    state: HashMap<String, Value>,
    vault: password_vault::EncryptedVaultBackup,
}

fn encode_snapshot(connection: &Connection) -> Result<String, String> {
    serde_json::to_string(&RollingSnapshot {
        version: 2,
        state: read_state(connection)?,
        vault: password_vault::export_encrypted(connection)?,
    })
    .map_err(|error| error.to_string())
}

fn decode_snapshot(
    raw: &str,
) -> Result<
    (
        HashMap<String, Value>,
        Option<password_vault::EncryptedVaultBackup>,
    ),
    String,
> {
    let value: Value = serde_json::from_str(raw).map_err(|error| error.to_string())?;
    if value.get("state").is_some() {
        let snapshot: RollingSnapshot =
            serde_json::from_value(value).map_err(|error| error.to_string())?;
        return Ok((snapshot.state, Some(snapshot.vault)));
    }
    serde_json::from_value(value)
        .map(|state| (state, None))
        .map_err(|error| error.to_string())
}

fn save_rolling_backup(connection: &Connection) -> Result<(), String> {
    let snapshot = encode_snapshot(connection)?;
    connection
        .execute(
            "INSERT INTO backups(created_at, snapshot) VALUES(datetime('now'), ?1)",
            [snapshot],
        )
        .map_err(|error| error.to_string())?;
    connection
        .execute(
            "DELETE FROM backups WHERE id NOT IN (
                SELECT id FROM backups ORDER BY id DESC LIMIT 7
            )",
            [],
        )
        .map_err(|error| error.to_string())?;
    Ok(())
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CommandError {
    code: String,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    details: Option<Value>,
}

fn diagnostic_details(value: impl ToString) -> Option<Value> {
    #[cfg(debug_assertions)]
    {
        Some(Value::String(value.to_string()))
    }
    #[cfg(not(debug_assertions))]
    {
        let _ = value;
        None
    }
}

impl From<String> for CommandError {
    fn from(details: String) -> Self {
        Self {
            code: "persistence_failed".into(),
            message: "No se pudieron leer o guardar los datos locales.".into(),
            details: diagnostic_details(details),
        }
    }
}

type CommandResult<T> = Result<T, CommandError>;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SystemStatus {
    battery_percent: Option<u8>,
    charging: Option<bool>,
    audio_output_name: Option<String>,
    audio_output_kind: Option<String>,
}

#[cfg(windows)]
fn battery_status() -> (Option<u8>, Option<bool>) {
    use windows_sys::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};
    let mut status = SYSTEM_POWER_STATUS {
        ACLineStatus: 255,
        BatteryFlag: 255,
        BatteryLifePercent: 255,
        SystemStatusFlag: 0,
        BatteryLifeTime: u32::MAX,
        BatteryFullLifeTime: u32::MAX,
    };
    let available = unsafe { GetSystemPowerStatus(&mut status) } != 0;
    if !available || status.BatteryFlag == 128 || status.BatteryLifePercent == 255 {
        return (None, None);
    }
    let charging = (status.BatteryFlag != 255).then_some(status.BatteryFlag & 8 != 0);
    (Some(status.BatteryLifePercent.min(100)), charging)
}

#[cfg(not(windows))]
fn battery_status() -> (Option<u8>, Option<bool>) {
    (None, None)
}

fn audio_status() -> (Option<String>, Option<String>) {
    let name = cpal::default_host()
        .default_output_device()
        .and_then(|device| device.name().ok());
    let kind = name.as_ref().map(|value| {
        let lower = value.to_lowercase();
        if lower.contains("bluetooth") || lower.contains("a2dp") {
            "bluetooth"
        } else if lower.contains("headphone")
            || lower.contains("headset")
            || lower.contains("auricular")
        {
            "headphones"
        } else if lower.contains("speaker") || lower.contains("altavoz") {
            "speaker"
        } else {
            "unknown"
        }
        .to_string()
    });
    (name, kind)
}

#[tauri::command]
fn get_system_status() -> SystemStatus {
    let (battery_percent, charging) = battery_status();
    let (audio_output_name, audio_output_kind) = audio_status();
    SystemStatus {
        battery_percent,
        charging,
        audio_output_name,
        audio_output_kind,
    }
}

#[tauri::command]
fn exit_app(app: AppHandle) {
    app.exit(0);
}

#[tauri::command]
fn open_external(url: String) -> CommandResult<()> {
    let parsed = validate_external_url(&url).map_err(|message| CommandError {
        code: "invalid_url".into(),
        message: message.into(),
        details: None,
    })?;
    open::that(parsed.as_str()).map_err(|error| CommandError {
        code: "open_failed".into(),
        message: "No se pudo abrir el enlace.".into(),
        details: diagnostic_details(error),
    })
}

fn validate_external_url(value: &str) -> Result<url::Url, &'static str> {
    if value.is_empty()
        || value.len() > 2_048
        || value.trim() != value
        || value.chars().any(char::is_control)
    {
        return Err("El enlace no es válido.");
    }
    let parsed = url::Url::parse(value).map_err(|_| "El enlace no es válido.")?;
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err("Noite bloqueó un enlace con credenciales incrustadas.");
    }
    match parsed.scheme() {
        "https" if parsed.host_str().is_some() => Ok(parsed),
        "spotify" => {
            let mut parts = value.split(':');
            let scheme = parts.next().unwrap_or_default();
            let entity = parts.next().unwrap_or_default();
            let id = parts.next().unwrap_or_default();
            let allowed_entity = matches!(
                entity,
                "track" | "album" | "playlist" | "artist" | "show" | "episode"
            );
            if scheme == "spotify"
                && allowed_entity
                && !id.is_empty()
                && id.len() <= 128
                && id
                    .chars()
                    .all(|character| character.is_ascii_alphanumeric())
                && parts.next().is_none()
            {
                Ok(parsed)
            } else {
                Err("Noite bloqueó un enlace de Spotify no reconocido.")
            }
        }
        _ => Err("Noite bloqueó un enlace no seguro."),
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ImportedMedia {
    storage_path: String,
    absolute_path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct OptimizedImage {
    data_url: String,
    sha256: String,
    size_bytes: usize,
}

fn decode_image_data_url(data_url: &str) -> CommandResult<Vec<u8>> {
    let (_, encoded) = data_url.split_once(',').ok_or_else(|| CommandError {
        code: "invalid_image".into(),
        message: "La imagen no tiene un formato válido.".into(),
        details: None,
    })?;
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .map_err(|_| CommandError {
            code: "invalid_image".into(),
            message: "No se pudo leer la imagen seleccionada.".into(),
            details: None,
        })?;
    if bytes.len() > 12 * 1024 * 1024 {
        return Err(CommandError {
            code: "media_too_large".into(),
            message: "La imagen supera los 12 MB permitidos.".into(),
            details: None,
        });
    }
    Ok(bytes)
}

fn oriented_image(bytes: &[u8]) -> CommandResult<image::DynamicImage> {
    let format = image::guess_format(bytes).map_err(|_| CommandError {
        code: "unsupported_image".into(),
        message: "Usa una imagen JPG, PNG o WebP. HEIC todavía no es compatible.".into(),
        details: None,
    })?;
    if !matches!(
        format,
        image::ImageFormat::Jpeg | image::ImageFormat::Png | image::ImageFormat::WebP
    ) {
        return Err(CommandError {
            code: "unsupported_image".into(),
            message: "Usa una imagen JPG, PNG o WebP. HEIC todavía no es compatible.".into(),
            details: None,
        });
    }
    let mut decoded =
        image::load_from_memory_with_format(bytes, format).map_err(|_| CommandError {
            code: "invalid_image".into(),
            message: "El archivo parece una imagen, pero está dañado o no puede decodificarse."
                .into(),
            details: None,
        })?;
    if format == image::ImageFormat::Jpeg {
        let orientation = exif::Reader::new()
            .read_from_container(&mut Cursor::new(bytes))
            .ok()
            .and_then(|exif| {
                exif.get_field(exif::Tag::Orientation, exif::In::PRIMARY)
                    .and_then(|field| field.value.get_uint(0))
            })
            .unwrap_or(1);
        decoded = apply_image_orientation(decoded, orientation);
    }
    Ok(decoded)
}

fn apply_image_orientation(decoded: image::DynamicImage, orientation: u32) -> image::DynamicImage {
    match orientation {
        2 => decoded.fliph(),
        3 => decoded.rotate180(),
        4 => decoded.flipv(),
        5 => decoded.rotate90().fliph(),
        6 => decoded.rotate90(),
        7 => decoded.rotate270().fliph(),
        8 => decoded.rotate270(),
        _ => decoded,
    }
}

#[tauri::command]
fn optimize_image_data_url(data_url: String) -> CommandResult<OptimizedImage> {
    let bytes = decode_image_data_url(&data_url)?;
    let mut image = oriented_image(&bytes)?;
    let longest = image.width().max(image.height());
    if longest > 1600 {
        let ratio = 1600.0 / longest as f32;
        image = image.resize(
            (image.width() as f32 * ratio).round() as u32,
            (image.height() as f32 * ratio).round() as u32,
            image::imageops::FilterType::Lanczos3,
        );
    }
    let mut quality = 82.0;
    let mut encoded = Vec::new();
    for _ in 0..8 {
        let rgba = image.to_rgba8();
        encoded = webp::Encoder::from_rgba(rgba.as_raw(), rgba.width(), rgba.height())
            .encode(quality)
            .to_vec();
        if encoded.len() <= 1572864 {
            break;
        }
        if quality > 58.0 {
            quality -= 8.0
        } else {
            image = image.resize(
                (image.width() as f32 * 0.82).round().max(1.0) as u32,
                (image.height() as f32 * 0.82).round().max(1.0) as u32,
                image::imageops::FilterType::Lanczos3,
            );
        }
    }
    if encoded.len() > 1572864 {
        return Err(CommandError {
            code: "media_too_large".into(),
            message: "La imagen sigue siendo demasiado grande después de optimizarla.".into(),
            details: None,
        });
    }
    let digest = format!("{:x}", Sha256::digest(&encoded));
    let data_url = format!(
        "data:image/webp;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(&encoded)
    );
    Ok(OptimizedImage {
        data_url,
        sha256: digest,
        size_bytes: encoded.len(),
    })
}

#[tauri::command]
fn read_media_data_url(app: AppHandle, storage_path: String) -> CommandResult<String> {
    let path = safe_media_path(&app, &storage_path).map_err(CommandError::from)?;
    let bytes = fs::read(&path).map_err(|_| CommandError {
        code: "media_missing".into(),
        message: "Una imagen local pendiente ya no existe. Vuelve a adjuntarla.".into(),
        details: None,
    })?;
    let mime = match image::guess_format(&bytes).ok() {
        Some(image::ImageFormat::Jpeg) => "image/jpeg",
        Some(image::ImageFormat::Png) => "image/png",
        Some(image::ImageFormat::WebP) => "image/webp",
        _ => {
            return Err(CommandError {
                code: "unsupported_image".into(),
                message: "La imagen local pendiente no es JPG, PNG o WebP.".into(),
                details: None,
            })
        }
    };
    Ok(format!(
        "data:{mime};base64,{}",
        base64::engine::general_purpose::STANDARD.encode(bytes)
    ))
}

fn media_root(app: &AppHandle) -> Result<PathBuf, String> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("media");
    fs::create_dir_all(&root).map_err(|error| error.to_string())?;
    Ok(root)
}

pub(crate) fn safe_media_path(app: &AppHandle, storage_path: &str) -> Result<PathBuf, String> {
    let relative = PathBuf::from(storage_path);
    if relative.is_absolute()
        || relative.components().any(|part| {
            matches!(
                part,
                std::path::Component::ParentDir
                    | std::path::Component::RootDir
                    | std::path::Component::Prefix(_)
            )
        })
    {
        return Err("Ruta multimedia no válida".into());
    }
    let relative = relative.strip_prefix("media").unwrap_or(&relative);
    Ok(media_root(app)?.join(relative))
}

#[tauri::command]
fn import_media_data_url(
    app: AppHandle,
    category: String,
    data_url: String,
    file_name: Option<String>,
) -> CommandResult<ImportedMedia> {
    const CATEGORIES: [&str; 5] = ["covers", "captures", "profiles", "spotify", "backgrounds"];
    if !CATEGORIES.contains(&category.as_str()) {
        return Err(CommandError {
            code: "invalid_media_category".into(),
            message: "La categoría multimedia no es válida.".into(),
            details: None,
        });
    }
    let (header, encoded) = data_url.split_once(',').ok_or_else(|| CommandError {
        code: "invalid_media".into(),
        message: "La imagen no tiene un formato válido.".into(),
        details: None,
    })?;
    if !header.starts_with("data:image/") || !header.ends_with(";base64") {
        return Err(CommandError {
            code: "invalid_media".into(),
            message: "Solo se admiten imágenes codificadas localmente.".into(),
            details: None,
        });
    }
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .map_err(|error| CommandError {
            code: "invalid_media".into(),
            message: "No se pudo leer la imagen.".into(),
            details: Some(Value::String(error.to_string())),
        })?;
    if bytes.len() > 12 * 1024 * 1024 {
        return Err(CommandError {
            code: "media_too_large".into(),
            message: "La imagen supera los 12 MB permitidos.".into(),
            details: None,
        });
    }
    let mime = header
        .trim_start_matches("data:")
        .trim_end_matches(";base64");
    let extension = match mime {
        "image/jpeg" => "jpg",
        "image/png" => "png",
        "image/webp" => "webp",
        "image/gif" => "gif",
        _ => {
            return Err(CommandError {
                code: "unsupported_media".into(),
                message: "Este formato de imagen no está admitido.".into(),
                details: None,
            })
        }
    };
    let digest = format!("{:x}", Sha256::digest(&bytes));
    let hint = file_name.unwrap_or_default();
    let safe_hint: String = hint
        .chars()
        .filter(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
        .take(32)
        .collect();
    let name = if safe_hint.is_empty() {
        format!("{digest}.{extension}")
    } else {
        format!("{safe_hint}-{}.{extension}", &digest[..16])
    };
    let storage_path = format!("media/{category}/{name}");
    let absolute = safe_media_path(&app, &storage_path).map_err(CommandError::from)?;
    if let Some(parent) = absolute.parent() {
        fs::create_dir_all(parent).map_err(|error| CommandError::from(error.to_string()))?;
    }
    if !absolute.exists() {
        let temporary = absolute.with_extension(format!("{extension}.part"));
        fs::write(&temporary, bytes).map_err(|error| CommandError::from(error.to_string()))?;
        fs::rename(&temporary, &absolute).map_err(|error| {
            let _ = fs::remove_file(&temporary);
            CommandError::from(error.to_string())
        })?;
    }
    Ok(ImportedMedia {
        storage_path,
        absolute_path: absolute.to_string_lossy().into_owned(),
    })
}

fn remote_image_extension(content_type: &str, bytes: &[u8]) -> Option<&'static str> {
    match content_type.split(';').next().unwrap_or_default().trim() {
        "image/jpeg" if bytes.starts_with(&[0xff, 0xd8, 0xff]) => Some("jpg"),
        "image/png" if bytes.starts_with(b"\x89PNG\r\n\x1a\n") => Some("png"),
        "image/webp" if bytes.starts_with(b"RIFF") && bytes.get(8..12) == Some(b"WEBP") => {
            Some("webp")
        }
        "image/gif" if bytes.starts_with(b"GIF87a") || bytes.starts_with(b"GIF89a") => Some("gif"),
        _ => None,
    }
}

#[tauri::command]
async fn import_media_remote_url(
    app: AppHandle,
    category: String,
    url: String,
) -> CommandResult<ImportedMedia> {
    const CATEGORIES: [&str; 5] = ["covers", "captures", "profiles", "spotify", "backgrounds"];
    fn allowed_image_host(host: &str) -> bool {
        matches!(host, "image.tmdb.org" | "images.igdb.com" | "i.scdn.co")
            || host.ends_with(".scdn.co")
            || host.ends_with(".spotifycdn.com")
    }
    const MAX_BYTES: u64 = 12 * 1024 * 1024;
    if !CATEGORIES.contains(&category.as_str()) {
        return Err(CommandError {
            code: "invalid_media_category".into(),
            message: "La categoría multimedia no es válida.".into(),
            details: None,
        });
    }
    let parsed = reqwest::Url::parse(&url).map_err(|_| CommandError {
        code: "invalid_host".into(),
        message: "La dirección de la imagen no es válida.".into(),
        details: None,
    })?;
    if parsed.scheme() != "https" || !parsed.host_str().is_some_and(allowed_image_host) {
        return Err(CommandError {
            code: "invalid_host".into(),
            message: "Este servidor de imágenes no está permitido.".into(),
            details: None,
        });
    }
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::custom(|attempt| {
            if attempt.previous().len() >= 3 {
                return attempt.error("too many redirects");
            }
            let destination = attempt.url();
            if destination.scheme() == "https"
                && destination.host_str().is_some_and(allowed_image_host)
            {
                attempt.follow()
            } else {
                attempt.error("redirect host not allowed")
            }
        }))
        .build()
        .map_err(|error| CommandError {
            code: "offline".into(),
            message: "No se pudo preparar la descarga de la imagen.".into(),
            details: Some(Value::String(error.to_string())),
        })?;
    let response = client.get(parsed).send().await.map_err(|error| {
        let invalid_redirect = error.to_string().contains("redirect host not allowed");
        CommandError {
            code: if invalid_redirect {
                "invalid_host"
            } else if error.is_timeout() {
                "timeout"
            } else {
                "offline"
            }
            .into(),
            message: if invalid_redirect {
                "El proveedor intentó redirigir a un servidor no permitido."
            } else if error.is_timeout() {
                "La descarga de la imagen tardó demasiado."
            } else {
                "No se pudo descargar la imagen. Comprueba la conexión."
            }
            .into(),
            details: Some(Value::String(error.to_string())),
        }
    })?;
    if !response.status().is_success() {
        return Err(CommandError {
            code: "offline".into(),
            message: "El proveedor no pudo entregar la imagen.".into(),
            details: Some(Value::String(response.status().to_string())),
        });
    }
    if response
        .content_length()
        .is_some_and(|length| length > MAX_BYTES)
    {
        return Err(CommandError {
            code: "too_large".into(),
            message: "La imagen supera los 12 MB permitidos.".into(),
            details: None,
        });
    }
    let content_type = response
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|value| value.to_str().ok())
        .unwrap_or_default()
        .to_owned();
    let bytes = response.bytes().await.map_err(|error| CommandError {
        code: "offline".into(),
        message: "La descarga de la imagen se interrumpió.".into(),
        details: Some(Value::String(error.to_string())),
    })?;
    if bytes.len() as u64 > MAX_BYTES {
        return Err(CommandError {
            code: "too_large".into(),
            message: "La imagen supera los 12 MB permitidos.".into(),
            details: None,
        });
    }
    let extension = remote_image_extension(&content_type, &bytes).ok_or_else(|| CommandError {
        code: "invalid_image".into(),
        message: "El archivo recibido no es una imagen compatible.".into(),
        details: None,
    })?;
    let digest = format!("{:x}", Sha256::digest(&bytes));
    let storage_path = format!("media/{category}/{digest}.{extension}");
    let absolute = safe_media_path(&app, &storage_path).map_err(CommandError::from)?;
    if let Some(parent) = absolute.parent() {
        fs::create_dir_all(parent).map_err(|error| CommandError::from(error.to_string()))?;
    }
    if !absolute.exists() {
        let temporary = absolute.with_extension(format!("{extension}.part"));
        fs::write(&temporary, &bytes).map_err(|error| CommandError::from(error.to_string()))?;
        fs::rename(&temporary, &absolute).map_err(|error| {
            let _ = fs::remove_file(&temporary);
            CommandError::from(error.to_string())
        })?;
    }
    Ok(ImportedMedia {
        storage_path,
        absolute_path: absolute.to_string_lossy().into_owned(),
    })
}

#[tauri::command]
fn resolve_media_path(app: AppHandle, storage_path: String) -> CommandResult<String> {
    let path = safe_media_path(&app, &storage_path).map_err(CommandError::from)?;
    if !path.is_file() {
        return Err(CommandError {
            code: "media_missing".into(),
            message: "No se encontró el archivo multimedia.".into(),
            details: None,
        });
    }
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
fn remove_media(app: AppHandle, storage_path: String) -> CommandResult<()> {
    let path = safe_media_path(&app, &storage_path).map_err(CommandError::from)?;
    if path.is_file() {
        fs::remove_file(path).map_err(|error| CommandError::from(error.to_string()))?;
    }
    Ok(())
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ArchiveCounts {
    library_items: usize,
    plans: usize,
    reviews: usize,
    tracks: usize,
    #[serde(default)]
    saved_music: usize,
    attachments: usize,
    media_files: usize,
    #[serde(default)]
    password_vault_entries: usize,
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct ArchiveManifest {
    format: String,
    version: u8,
    exported_at: String,
    #[serde(default)]
    app_version: Option<String>,
    #[serde(default)]
    schema_version: Option<i64>,
    #[serde(default)]
    couple_names: Option<[String; 2]>,
    counts: ArchiveCounts,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportedArchive {
    manifest: ArchiveManifest,
    base64: String,
    suggested_file_name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportedArchiveFile {
    manifest: ArchiveManifest,
    path: String,
}

#[derive(Serialize)]
struct ArchivePreview {
    manifest: ArchiveManifest,
    warnings: Vec<String>,
}

fn value_count(state: &HashMap<String, Value>, key: &str) -> usize {
    state.get(key).and_then(Value::as_array).map_or(0, Vec::len)
}

fn collect_media_files(
    root: &Path,
    directory: &Path,
    files: &mut Vec<(String, Vec<u8>)>,
) -> Result<(), String> {
    if !directory.exists() {
        return Ok(());
    }
    for entry in fs::read_dir(directory).map_err(|error| error.to_string())? {
        let entry = entry.map_err(|error| error.to_string())?;
        let path = entry.path();
        if path.is_dir() {
            collect_media_files(root, &path, files)?;
        } else if path.is_file() {
            let relative = path
                .strip_prefix(root)
                .map_err(|error| error.to_string())?
                .to_string_lossy()
                .replace('\\', "/");
            files.push((
                format!("media/{relative}"),
                fs::read(path).map_err(|error| error.to_string())?,
            ));
        }
    }
    Ok(())
}

fn archive_bytes(encoded: &str) -> Result<Vec<u8>, CommandError> {
    if encoded.len() > 700 * 1024 * 1024 {
        return Err(CommandError {
            code: "backup_too_large".into(),
            message: "El respaldo es demasiado grande.".into(),
            details: None,
        });
    }
    base64::engine::general_purpose::STANDARD
        .decode(encoded)
        .map_err(|error| CommandError {
            code: "invalid_backup".into(),
            message: "No se pudo leer el respaldo.".into(),
            details: Some(Value::String(error.to_string())),
        })
}

fn manifest_from_archive(bytes: &[u8]) -> Result<ArchiveManifest, CommandError> {
    let mut archive = zip::ZipArchive::new(Cursor::new(bytes)).map_err(|error| CommandError {
        code: "invalid_backup".into(),
        message: "El archivo .noche no es válido.".into(),
        details: Some(Value::String(error.to_string())),
    })?;
    let mut raw = String::new();
    archive
        .by_name("manifest.json")
        .map_err(|_| CommandError {
            code: "missing_manifest".into(),
            message: "El respaldo no contiene un manifiesto.".into(),
            details: None,
        })?
        .read_to_string(&mut raw)
        .map_err(|error| CommandError::from(error.to_string()))?;
    let manifest: ArchiveManifest = serde_json::from_str(&raw).map_err(|error| CommandError {
        code: "invalid_manifest".into(),
        message: "El manifiesto del respaldo no es válido.".into(),
        details: Some(Value::String(error.to_string())),
    })?;
    if manifest.format != "noche" || !matches!(manifest.version, 2..=5) {
        return Err(CommandError {
            code: "unsupported_backup".into(),
            message: format!(
                "Noite no admite este respaldo versión {}.",
                manifest.version
            ),
            details: None,
        });
    }
    if archive.by_name("database/noite.sqlite3").is_err() {
        return Err(CommandError {
            code: "missing_database".into(),
            message: "El respaldo no contiene la base de datos.".into(),
            details: None,
        });
    }
    Ok(manifest)
}

#[tauri::command]
fn export_noche_archive(app: AppHandle) -> CommandResult<ExportedArchive> {
    let connection = connection(&app)?;
    connection
        .execute_batch("PRAGMA wal_checkpoint(FULL);")
        .map_err(|error| CommandError::from(error.to_string()))?;
    let state = read_state(&connection).map_err(CommandError::from)?;
    let password_vault_entries =
        password_vault::encrypted_entry_count(&connection).map_err(CommandError::from)?;
    let media = media_root(&app).map_err(CommandError::from)?;
    let mut media_files = Vec::new();
    collect_media_files(&media, &media, &mut media_files).map_err(CommandError::from)?;
    let exported_at = chrono::Utc::now().to_rfc3339();
    let manifest = ArchiveManifest {
        format: "noche".into(),
        version: 5,
        exported_at: exported_at.clone(),
        app_version: Some(env!("CARGO_PKG_VERSION").into()),
        schema_version: Some(SCHEMA_VERSION),
        couple_names: state.get("settings").map(|settings| {
            ["userName", "partnerName"].map(|key| {
                settings
                    .get(key)
                    .and_then(Value::as_str)
                    .unwrap_or_default()
                    .to_string()
            })
        }),
        counts: ArchiveCounts {
            library_items: value_count(&state, "libraryItems"),
            plans: value_count(&state, "plans"),
            reviews: value_count(&state, "reviews"),
            tracks: value_count(&state, "memoryTracks"),
            saved_music: value_count(&state, "savedMusicItems"),
            attachments: value_count(&state, "attachments"),
            media_files: media_files.len(),
            password_vault_entries,
        },
    };
    let mut writer = zip::ZipWriter::new(Cursor::new(Vec::new()));
    let options = zip::write::SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .unix_permissions(0o644);
    writer
        .start_file("manifest.json", options)
        .map_err(|error| CommandError::from(error.to_string()))?;
    writer
        .write_all(
            serde_json::to_string_pretty(&manifest)
                .map_err(|error| CommandError::from(error.to_string()))?
                .as_bytes(),
        )
        .map_err(|error| CommandError::from(error.to_string()))?;
    writer
        .start_file("database/noite.sqlite3", options)
        .map_err(|error| CommandError::from(error.to_string()))?;
    let portable_database = database_path(&app)
        .map_err(CommandError::from)?
        .with_extension(format!("export-{}.sqlite3", rand::random::<u64>()));
    let portable_bytes =
        archive_database::export(&connection, &portable_database).map_err(CommandError::from)?;
    writer
        .write_all(&portable_bytes)
        .map_err(|error| CommandError::from(error.to_string()))?;
    writer
        .start_file("shared-secrets.json", options)
        .map_err(|error| CommandError::from(error.to_string()))?;
    writer
        .write_all(
            &serde_json::to_vec(&cover_search::export_shared_credentials())
                .map_err(|error| CommandError::from(error.to_string()))?,
        )
        .map_err(|error| CommandError::from(error.to_string()))?;
    for (name, bytes) in media_files {
        writer
            .start_file(name, options)
            .map_err(|error| CommandError::from(error.to_string()))?;
        writer
            .write_all(&bytes)
            .map_err(|error| CommandError::from(error.to_string()))?;
    }
    let bytes = writer
        .finish()
        .map_err(|error| CommandError::from(error.to_string()))?
        .into_inner();
    Ok(ExportedArchive {
        manifest,
        base64: base64::engine::general_purpose::STANDARD.encode(bytes),
        suggested_file_name: format!("noite-{}.noche", &exported_at[..10]),
    })
}

const NOCHE_V5_MAGIC: &[u8; 8] = b"NOITE5\0\0";
const NOCHE_V5_AAD: &[u8] = b"noite-backup-v5";
const NOCHE_V5_BLOCK_MARKER: &[u8; 4] = b"BLK1";
const NOCHE_V5_BLOCK_SIZE: usize = 1024 * 1024;

fn derive_backup_key(password: &str, salt: &[u8; 16]) -> CommandResult<[u8; 32]> {
    if password.chars().count() < 12 {
        return Err(CommandError {
            code: "weak_backup_password".into(),
            message: "La contraseña del respaldo debe tener al menos 12 caracteres.".into(),
            details: None,
        });
    }
    let params = ArgonParams::new(65_536, 3, 1, Some(32))
        .map_err(|error| CommandError::from(error.to_string()))?;
    let argon = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut key = [0_u8; 32];
    argon
        .hash_password_into(password.as_bytes(), salt, &mut key)
        .map_err(|error| CommandError::from(error.to_string()))?;
    Ok(key)
}

fn encrypt_noche_v5(plain: &[u8], password: &str) -> CommandResult<Vec<u8>> {
    let mut salt = [0_u8; 16];
    OsRng.fill_bytes(&mut salt);
    let key = derive_backup_key(password, &salt)?;
    let cipher = XChaCha20Poly1305::new_from_slice(&key)
        .map_err(|error| CommandError::from(error.to_string()))?;
    let block_count = plain.len().div_ceil(NOCHE_V5_BLOCK_SIZE).max(1) as u32;
    let mut output = Vec::with_capacity(
        NOCHE_V5_MAGIC.len() + salt.len() + 12 + plain.len() + block_count as usize * 44,
    );
    output.extend_from_slice(NOCHE_V5_MAGIC);
    output.extend_from_slice(&salt);
    output.extend_from_slice(NOCHE_V5_BLOCK_MARKER);
    output.extend_from_slice(&(NOCHE_V5_BLOCK_SIZE as u32).to_le_bytes());
    output.extend_from_slice(&block_count.to_le_bytes());
    for index in 0..block_count {
        let start = index as usize * NOCHE_V5_BLOCK_SIZE;
        let end = (start + NOCHE_V5_BLOCK_SIZE).min(plain.len());
        let block = if start < plain.len() {
            &plain[start..end]
        } else {
            &[]
        };
        let mut nonce = [0_u8; 24];
        OsRng.fill_bytes(&mut nonce);
        let mut aad = NOCHE_V5_AAD.to_vec();
        aad.extend_from_slice(&index.to_le_bytes());
        aad.extend_from_slice(&block_count.to_le_bytes());
        let encrypted = cipher
            .encrypt(
                XNonce::from_slice(&nonce),
                chacha20poly1305::aead::Payload {
                    msg: block,
                    aad: &aad,
                },
            )
            .map_err(|_| CommandError {
                code: "backup_encryption_failed".into(),
                message: "No se pudo cifrar el respaldo.".into(),
                details: None,
            })?;
        output.extend_from_slice(&nonce);
        output.extend_from_slice(&(encrypted.len() as u32).to_le_bytes());
        output.extend_from_slice(&encrypted);
    }
    Ok(output)
}

fn decrypt_noche_file(bytes: &[u8], password: &str) -> CommandResult<(Vec<u8>, bool)> {
    if !bytes.starts_with(NOCHE_V5_MAGIC) {
        return Ok((bytes.to_vec(), true));
    }
    if bytes.len() < 28 {
        return Err(CommandError {
            code: "invalid_backup".into(),
            message: "El respaldo está incompleto.".into(),
            details: None,
        });
    }
    let salt: [u8; 16] = bytes[8..24]
        .try_into()
        .map_err(|_| CommandError::from("invalid salt".to_string()))?;
    let key = derive_backup_key(password, &salt)?;
    let cipher = XChaCha20Poly1305::new_from_slice(&key)
        .map_err(|error| CommandError::from(error.to_string()))?;
    if bytes.get(24..28) == Some(NOCHE_V5_BLOCK_MARKER) {
        if bytes.len() < 36 {
            return Err(CommandError {
                code: "invalid_backup".into(),
                message: "El respaldo está incompleto.".into(),
                details: None,
            });
        }
        let block_size = u32::from_le_bytes(bytes[28..32].try_into().unwrap()) as usize;
        let block_count = u32::from_le_bytes(bytes[32..36].try_into().unwrap());
        if block_size == 0
            || block_size > 16 * 1024 * 1024
            || block_count == 0
            || block_count > 1_000_000
        {
            return Err(CommandError {
                code: "invalid_backup".into(),
                message: "La estructura del respaldo no es válida.".into(),
                details: None,
            });
        }
        let mut cursor = 36_usize;
        let mut plain = Vec::with_capacity(block_size.saturating_mul(block_count as usize));
        for index in 0..block_count {
            if cursor + 28 > bytes.len() {
                return Err(CommandError {
                    code: "invalid_backup".into(),
                    message: "El respaldo está incompleto.".into(),
                    details: None,
                });
            }
            let nonce = &bytes[cursor..cursor + 24];
            let encrypted_len =
                u32::from_le_bytes(bytes[cursor + 24..cursor + 28].try_into().unwrap()) as usize;
            cursor += 28;
            let end = cursor
                .checked_add(encrypted_len)
                .filter(|end| *end <= bytes.len())
                .ok_or_else(|| CommandError {
                    code: "invalid_backup".into(),
                    message: "El respaldo está incompleto.".into(),
                    details: None,
                })?;
            let mut aad = NOCHE_V5_AAD.to_vec();
            aad.extend_from_slice(&index.to_le_bytes());
            aad.extend_from_slice(&block_count.to_le_bytes());
            let block = cipher
                .decrypt(
                    XNonce::from_slice(nonce),
                    chacha20poly1305::aead::Payload {
                        msg: &bytes[cursor..end],
                        aad: &aad,
                    },
                )
                .map_err(|_| CommandError {
                    code: "wrong_backup_password".into(),
                    message: "La contraseña es incorrecta o el respaldo fue modificado.".into(),
                    details: None,
                })?;
            if block.len() > block_size {
                return Err(CommandError {
                    code: "invalid_backup".into(),
                    message: "La estructura del respaldo no es válida.".into(),
                    details: None,
                });
            }
            plain.extend_from_slice(&block);
            cursor = end;
        }
        if cursor != bytes.len() {
            return Err(CommandError {
                code: "invalid_backup".into(),
                message: "El respaldo contiene datos inesperados.".into(),
                details: None,
            });
        }
        return Ok((plain, false));
    }
    if bytes.len() < 48 {
        return Err(CommandError {
            code: "invalid_backup".into(),
            message: "El respaldo está incompleto.".into(),
            details: None,
        });
    }
    let nonce = &bytes[24..48];
    let plain = cipher
        .decrypt(
            XNonce::from_slice(nonce),
            chacha20poly1305::aead::Payload {
                msg: &bytes[48..],
                aad: NOCHE_V5_AAD,
            },
        )
        .map_err(|_| CommandError {
            code: "wrong_backup_password".into(),
            message: "La contraseña es incorrecta o el respaldo fue modificado.".into(),
            details: None,
        })?;
    Ok((plain, false))
}

fn validate_noche_path(path: &Path) -> CommandResult<()> {
    if path
        .extension()
        .and_then(|value| value.to_str())
        .is_none_or(|value| !value.eq_ignore_ascii_case("noche"))
    {
        return Err(CommandError {
            code: "invalid_backup_extension".into(),
            message:
                "Noite solo acepta archivos .noche; no uses ZIP, JSON ni cambies la extensión."
                    .into(),
            details: None,
        });
    }
    Ok(())
}

#[tauri::command]
fn choose_noche_export_path() -> CommandResult<Option<String>> {
    let suggested = format!("noite-{}.noche", chrono::Utc::now().format("%Y-%m-%d"));
    let mut dialog = rfd::FileDialog::new()
        .add_filter("Respaldo de Noite", &["noche"])
        .set_title("Guardar respaldo de Noite")
        .set_file_name(&suggested);
    if let Some(documents) = std::env::var_os("USERPROFILE")
        .map(PathBuf::from)
        .map(|path| path.join("Documents"))
        .filter(|path| path.is_dir())
    {
        dialog = dialog.set_directory(documents);
    }
    Ok(dialog
        .save_file()
        .map(|path| path.to_string_lossy().into_owned()))
}

#[tauri::command]
fn choose_noche_import_path() -> CommandResult<Option<String>> {
    Ok(rfd::FileDialog::new()
        .add_filter("Respaldo de Noite", &["noche"])
        .set_title("Importar respaldo de Noite")
        .pick_file()
        .map(|path| path.to_string_lossy().into_owned()))
}

#[tauri::command]
fn open_backup_folder(path: String) -> CommandResult<()> {
    let source = PathBuf::from(path);
    validate_noche_path(&source)?;
    let parent = source
        .parent()
        .ok_or_else(|| CommandError::from("La ruta no tiene una carpeta válida.".to_string()))?;
    open::that(parent).map_err(|error| CommandError::from(error.to_string()))
}

#[tauri::command]
fn export_noche_archive_file(
    app: AppHandle,
    path: String,
    password: String,
) -> CommandResult<ExportedArchiveFile> {
    let target = PathBuf::from(path);
    validate_noche_path(&target)?;
    let exported = export_noche_archive(app)?;
    let plain = archive_bytes(&exported.base64)?;
    let encrypted = encrypt_noche_v5(&plain, &password)?;
    let temporary = target.with_extension("noche.part");
    fs::write(&temporary, encrypted).map_err(|error| CommandError::from(error.to_string()))?;
    fs::rename(&temporary, &target).map_err(|error| {
        let _ = fs::remove_file(&temporary);
        CommandError::from(error.to_string())
    })?;
    Ok(ExportedArchiveFile {
        manifest: exported.manifest,
        path: target.to_string_lossy().into_owned(),
    })
}

#[tauri::command]
fn preview_noche_archive_file(path: String, password: String) -> CommandResult<ArchivePreview> {
    let source = PathBuf::from(path);
    validate_noche_path(&source)?;
    let raw = fs::read(source).map_err(|error| CommandError::from(error.to_string()))?;
    let (plain, legacy) = decrypt_noche_file(&raw, &password)?;
    let manifest = manifest_from_archive(&plain)?;
    let mut warnings = Vec::new();
    if legacy {
        warnings.push("Este respaldo es anterior a v5 y no estaba cifrado por completo.".into());
    }
    Ok(ArchivePreview { manifest, warnings })
}

#[tauri::command]
fn import_noche_archive_file(
    app: AppHandle,
    runtime: State<'_, password_vault::VaultRuntime>,
    profile_runtime: State<'_, profile_auth::ProfileAuthRuntime>,
    path: String,
    password: String,
) -> CommandResult<()> {
    let source = PathBuf::from(path);
    validate_noche_path(&source)?;
    let raw = fs::read(source).map_err(|error| CommandError::from(error.to_string()))?;
    let (plain, _) = decrypt_noche_file(&raw, &password)?;
    let encoded = base64::engine::general_purpose::STANDARD.encode(plain);
    import_noche_archive(app, runtime, encoded)?;
    profile_auth::lock_all(&profile_runtime)
}

#[tauri::command]
fn import_noche_archive(
    app: AppHandle,
    runtime: State<'_, password_vault::VaultRuntime>,
    base64: String,
) -> CommandResult<()> {
    let bytes = archive_bytes(&base64)?;
    manifest_from_archive(&bytes)?;
    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|error| CommandError::from(error.to_string()))?;
    let staging = app_data.join("noite-import-staging.sqlite3");
    let mut archive = zip::ZipArchive::new(Cursor::new(bytes))
        .map_err(|error| CommandError::from(error.to_string()))?;
    let mut database = Vec::new();
    archive
        .by_name("database/noite.sqlite3")
        .map_err(|error| CommandError::from(error.to_string()))?
        .read_to_end(&mut database)
        .map_err(|error| CommandError::from(error.to_string()))?;
    let shared_credentials = {
        let mut values = HashMap::new();
        if let Ok(mut file) = archive.by_name("shared-secrets.json") {
            let mut raw = Vec::new();
            file.read_to_end(&mut raw)
                .map_err(|error| CommandError::from(error.to_string()))?;
            values = serde_json::from_slice(&raw)
                .map_err(|error| CommandError::from(error.to_string()))?;
        }
        values
    };
    fs::write(&staging, database).map_err(|error| CommandError::from(error.to_string()))?;
    let current_snapshot = {
        let connection = connection(&app)?;
        save_rolling_backup(&connection).map_err(CommandError::from)?;
        let snapshot = encode_snapshot(&connection).map_err(CommandError::from)?;
        connection
            .execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")
            .map_err(|error| CommandError::from(error.to_string()))?;
        snapshot
    };
    {
        let mut imported =
            Connection::open(&staging).map_err(|error| CommandError::from(error.to_string()))?;
        migrate(&mut imported).map_err(CommandError::from)?;
        let current_database = database_path(&app).map_err(CommandError::from)?;
        game_discovery::preserve_local_state_for_import(&imported, &current_database)
            .map_err(CommandError::from)?;
        let state = read_state(&imported).map_err(CommandError::from)?;
        if !state.contains_key("settings") {
            return Err(CommandError {
                code: "invalid_database".into(),
                message: "El respaldo no contiene una configuración válida.".into(),
                details: None,
            });
        }
        imported
            .execute(
                "INSERT INTO backups(created_at, snapshot) VALUES(datetime('now'), ?1)",
                [current_snapshot],
            )
            .map_err(|error| CommandError::from(error.to_string()))?;
        imported
            .execute_batch("PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE;")
            .map_err(|error| CommandError::from(error.to_string()))?;
    }
    let root = media_root(&app).map_err(CommandError::from)?;
    for index in 0..archive.len() {
        let mut file = archive
            .by_index(index)
            .map_err(|error| CommandError::from(error.to_string()))?;
        let Some(name) = file.enclosed_name() else {
            continue;
        };
        if !name.starts_with("media") || file.is_dir() {
            continue;
        }
        let relative = name
            .strip_prefix("media")
            .map_err(|error| CommandError::from(error.to_string()))?;
        let target = root.join(relative);
        if let Some(parent) = target.parent() {
            fs::create_dir_all(parent).map_err(|error| CommandError::from(error.to_string()))?;
        }
        let mut contents = Vec::new();
        file.read_to_end(&mut contents)
            .map_err(|error| CommandError::from(error.to_string()))?;
        fs::write(target, contents).map_err(|error| CommandError::from(error.to_string()))?;
    }
    let database = database_path(&app).map_err(CommandError::from)?;
    for suffix in ["-wal", "-shm"] {
        let sidecar = PathBuf::from(format!("{}{suffix}", database.to_string_lossy()));
        if sidecar.exists() {
            fs::remove_file(sidecar).map_err(|error| CommandError::from(error.to_string()))?;
        }
    }
    let recovery = app_data.join("proyecto-noche.pre-import.sqlite3");
    if recovery.exists() {
        fs::remove_file(&recovery).map_err(|error| CommandError::from(error.to_string()))?;
    }
    fs::rename(&database, &recovery).map_err(|error| CommandError::from(error.to_string()))?;
    if let Err(error) = fs::rename(&staging, &database) {
        let _ = fs::rename(&recovery, &database);
        return Err(CommandError::from(error.to_string()));
    }
    let _ = fs::remove_file(recovery);
    password_vault::lock_all(&runtime);
    cover_search::import_shared_credentials(shared_credentials).map_err(CommandError::from)?;
    Ok(())
}

#[tauri::command]
fn load_state(app: AppHandle) -> CommandResult<HashMap<String, Value>> {
    let connection = connection(&app)?;
    read_state(&connection).map_err(CommandError::from)
}

pub(crate) fn write_entries_internal(
    app: &AppHandle,
    entries: HashMap<String, Value>,
    replace: bool,
    _record_changes: bool,
) -> Result<(), String> {
    let mut connection = connection(app)?;
    save_rolling_backup(&connection)?;
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    if replace {
        transaction
            .execute("DELETE FROM state", [])
            .map_err(|error| error.to_string())?;
        clear_typed_state(&transaction)?;
    }
    for (key, value) in &entries {
        let raw = serde_json::to_string(&value).map_err(|error| error.to_string())?;
        transaction
            .execute(
                "INSERT INTO state(key, value) VALUES(?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                params![key, raw],
            )
            .map_err(|error| error.to_string())?;
        sync_typed_entry(&transaction, key, value)?;
    }
    game_discovery::reconcile_bindings(&transaction)?;
    transaction.commit().map_err(|error| error.to_string())
}

fn write_entries(
    app: &AppHandle,
    entries: HashMap<String, Value>,
    replace: bool,
) -> Result<(), String> {
    write_entries_internal(app, entries, replace, true)
}

#[tauri::command]
fn commit_state(app: AppHandle, entries: HashMap<String, Value>) -> CommandResult<()> {
    write_entries(&app, entries, false).map_err(CommandError::from)
}

#[tauri::command]
fn replace_state(
    app: AppHandle,
    runtime: State<'_, password_vault::VaultRuntime>,
    entries: HashMap<String, Value>,
) -> CommandResult<()> {
    write_entries(&app, entries, true).map_err(CommandError::from)?;
    password_vault::lock_all(&runtime);
    Ok(())
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BackupInfo {
    id: i64,
    created_at: String,
}

#[tauri::command]
fn list_backups(app: AppHandle) -> CommandResult<Vec<BackupInfo>> {
    let connection = connection(&app)?;
    let mut statement = connection
        .prepare("SELECT id, created_at FROM backups ORDER BY id DESC LIMIT 7")
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok(BackupInfo {
                id: row.get(0)?,
                created_at: row.get(1)?,
            })
        })
        .map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
        .map_err(CommandError::from)
}

#[tauri::command]
fn restore_backup(
    app: AppHandle,
    runtime: State<'_, password_vault::VaultRuntime>,
    backup_id: i64,
) -> CommandResult<()> {
    let mut connection = connection(&app)?;
    let raw: String = connection
        .query_row(
            "SELECT snapshot FROM backups WHERE id = ?1",
            [backup_id],
            |row| row.get(0),
        )
        .map_err(|error| error.to_string())?;
    let (restored, restored_vault) = decode_snapshot(&raw).map_err(CommandError::from)?;
    let current = encode_snapshot(&connection).map_err(CommandError::from)?;
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "INSERT INTO backups(created_at, snapshot) VALUES(datetime('now'), ?1)",
            [current],
        )
        .map_err(|error| error.to_string())?;
    transaction
        .execute("DELETE FROM state", [])
        .map_err(|error| error.to_string())?;
    clear_typed_state(&transaction).map_err(CommandError::from)?;
    for (key, value) in restored {
        sync_typed_entry(&transaction, &key, &value).map_err(CommandError::from)?;
        transaction
            .execute(
                "INSERT INTO state(key, value) VALUES(?1, ?2)",
                params![
                    key,
                    serde_json::to_string(&value).map_err(|error| error.to_string())?
                ],
            )
            .map_err(|error| error.to_string())?;
    }
    game_discovery::reconcile_bindings(&transaction).map_err(CommandError::from)?;
    if let Some(vault) = restored_vault {
        password_vault::restore_encrypted(&transaction, &vault).map_err(CommandError::from)?;
    }
    transaction
        .execute(
            "DELETE FROM backups WHERE id NOT IN (
                SELECT id FROM backups ORDER BY id DESC LIMIT 7
            )",
            [],
        )
        .map_err(|error| error.to_string())?;
    transaction
        .commit()
        .map_err(|error| error.to_string())
        .map_err(CommandError::from)?;
    password_vault::lock_all(&runtime);
    Ok(())
}

#[tauri::command]
fn main() {
    #[cfg(windows)]
    if std::env::args().any(|argument| argument == "--uninstall-cleanup") {
        let status = match data_management::uninstall_cleanup_early("com.grutexpa.proyecto-noche") {
            Ok(()) => 0,
            Err(error) => {
                eprintln!("{error}");
                1
            }
        };
        std::process::exit(status);
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(
            |app, _arguments, _cwd| {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.unminimize();
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            },
        ))
        .manage(password_vault::VaultRuntime::default())
        .manage(profile_auth::ProfileAuthRuntime::default())
        .invoke_handler(tauri::generate_handler![
            load_state,
            commit_state,
            replace_state,
            list_backups,
            restore_backup,
            get_system_status,
            exit_app,
            open_external,
            game_discovery::game_scan_status,
            game_discovery::game_scan_report,
            game_discovery::scan_installed_games,
            game_discovery::skip_game_scan,
            game_discovery::commit_game_import,
            game_discovery::game_installations_for_items,
            game_discovery::launch_game_installation,
            game_discovery::set_preferred_game_installation,
            game_discovery::add_manual_game_installation,
            import_media_data_url,
            import_media_remote_url,
            optimize_image_data_url,
            read_media_data_url,
            resolve_media_path,
            remove_media,
            choose_noche_export_path,
            choose_noche_import_path,
            export_noche_archive_file,
            preview_noche_archive_file,
            import_noche_archive_file,
            open_backup_folder,
            spotify_link::spotify_link_preview,
            spotify_link::clear_legacy_spotify_credentials,
            cover_search::cover_credential_status,
            cover_search::save_cover_credentials,
            cover_search::clear_cover_credentials,
            cover_search::test_cover_credentials,
            cover_search::search_cover,
            local_audio::import_audio_data_url,
            password_vault::vault_status,
            password_vault::vault_initialize,
            password_vault::vault_unlock,
            password_vault::vault_lock,
            password_vault::vault_lock_all,
            password_vault::vault_list,
            password_vault::vault_reveal,
            password_vault::vault_upsert,
            password_vault::vault_delete,
            password_vault::vault_change_master,
            password_vault::vault_reset,
            password_vault::vault_generate_password,
            password_vault::vault_copy_secret,
            profile_auth::profile_auth_status,
            profile_auth::profile_auth_setup,
            profile_auth::profile_auth_setup_open,
            profile_auth::profile_auth_enter_open,
            profile_auth::profile_auth_reset_other,
            profile_auth::profile_auth_unlock,
            profile_auth::profile_auth_recover,
            profile_auth::profile_auth_lock_all,
            data_management::preview_activity_purge,
            data_management::preview_attachment_purge,
            data_management::preview_archive_purge,
            data_management::purge_archived_activity,
            data_management::purge_archived_attachment,
            data_management::purge_all_archived,
            data_management::factory_reset,
            data_management::clear_regenerable_cache,
            data_management::preview_regenerable_cache,
        ])
        .run(tauri::generate_context!())
        .expect("error al iniciar Noite");
}

#[cfg(test)]
mod external_navigation_tests {
    use super::*;

    #[test]
    fn permits_only_credential_free_https_and_known_spotify_uris() {
        assert!(validate_external_url("https://www.igdb.com/games").is_ok());
        assert!(validate_external_url("spotify:track:4uLU6hMCjMI75M1A2tKUQC").is_ok());
        assert!(validate_external_url("http://example.com").is_err());
        assert!(validate_external_url("https://user:password@example.com").is_err());
        assert!(validate_external_url("spotify:../../cmd.exe").is_err());
        assert!(validate_external_url("https://example.com\nfile:///tmp/a").is_err());
    }
}

#[cfg(test)]
mod image_pipeline_tests {
    use super::*;

    fn data_url(format: image::ImageFormat) -> String {
        let image = image::DynamicImage::ImageRgba8(image::RgbaImage::from_pixel(
            12,
            8,
            image::Rgba([40, 80, 120, 255]),
        ));
        let bytes = if format == image::ImageFormat::WebP {
            let rgba = image.to_rgba8();
            webp::Encoder::from_rgba(rgba.as_raw(), rgba.width(), rgba.height())
                .encode(82.0)
                .to_vec()
        } else {
            let mut cursor = Cursor::new(Vec::new());
            image.write_to(&mut cursor, format).unwrap();
            cursor.into_inner()
        };
        format!(
            "data:image/test;base64,{}",
            base64::engine::general_purpose::STANDARD.encode(bytes)
        )
    }

    #[test]
    fn optimizes_jpeg_png_and_webp_to_bounded_webp() {
        for format in [
            image::ImageFormat::Jpeg,
            image::ImageFormat::Png,
            image::ImageFormat::WebP,
        ] {
            let result = optimize_image_data_url(data_url(format)).unwrap();
            assert!(result.data_url.starts_with("data:image/webp;base64,"));
            assert!(result.size_bytes <= 1572864);
            assert_eq!(result.sha256.len(), 64);
        }
    }

    #[test]
    fn applies_exif_rotation_before_encoding() {
        let source = image::DynamicImage::new_rgba8(12, 8);
        let rotated = apply_image_orientation(source, 6);
        assert_eq!((rotated.width(), rotated.height()), (8, 12));
    }
}

#[cfg(test)]
mod persistence_tests {
    use super::*;

    #[test]
    fn noche_v5_encrypts_and_detects_tampering() {
        let needle = b"recognizable sqlite and secret contents";
        let mut plain = vec![0x41; NOCHE_V5_BLOCK_SIZE + 37];
        plain.extend_from_slice(needle);
        let mut encrypted = encrypt_noche_v5(&plain, "a secure backup password").unwrap();
        assert!(encrypted.starts_with(NOCHE_V5_MAGIC));
        assert_eq!(&encrypted[24..28], NOCHE_V5_BLOCK_MARKER);
        assert!(!encrypted
            .windows(needle.len())
            .any(|window| window == needle));
        assert_eq!(
            decrypt_noche_file(&encrypted, "a secure backup password")
                .unwrap()
                .0,
            plain
        );
        let last = encrypted.len() - 1;
        encrypted[last] ^= 1;
        assert_eq!(
            decrypt_noche_file(&encrypted, "a secure backup password")
                .unwrap_err()
                .code,
            "wrong_backup_password"
        );
    }

    #[test]
    fn migrates_to_typed_schema_v11_and_indexes_entities() {
        let mut connection = Connection::open_in_memory().unwrap();
        migrate(&mut connection).unwrap();
        let version: i64 = connection
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .unwrap();
        assert_eq!(version, 11);
        let vault_tables: i64 = connection.query_row("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('password_vaults','password_entries')", [], |row| row.get(0)).unwrap();
        assert_eq!(vault_tables, 2);
        let sync_tables: i64 = connection.query_row("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('sync_space','sync_peers','sync_invites','sync_conflicts','sync_conflict_ignores','sync_media')", [], |row| row.get(0)).unwrap();
        assert_eq!(sync_tables, 6);
        let profile_tables: i64 = connection.query_row("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name='profile_credentials'", [], |row| row.get(0)).unwrap();
        assert_eq!(profile_tables, 1);
        let local_game_tables: i64 = connection.query_row("SELECT COUNT(*) FROM sqlite_master WHERE type='table' AND name IN ('local_game_installations','local_game_scan_state','local_game_provider_results')", [], |row| row.get(0)).unwrap();
        assert_eq!(local_game_tables, 3);
        let items = serde_json::json!([{ "id": "item-1", "spaceId": "local-space", "title": "Juego", "kind": "video_game", "status": "pending", "archivedAt": null }]);
        sync_typed_entry(&connection, "libraryItems", &items).unwrap();
        let count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM library_items WHERE status='pending'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn migration_from_v10_preserves_state_and_backups_and_is_idempotent() {
        let mut connection = Connection::open_in_memory().unwrap();
        migrate(&mut connection).unwrap();
        connection
            .execute(
                "INSERT INTO state(key,value) VALUES('libraryItems','[{\"id\":\"kept\"}]')",
                [],
            )
            .unwrap();
        connection
            .execute(
                "INSERT INTO backups(created_at,snapshot) VALUES('2026-01-01','{\"kept\":true}')",
                [],
            )
            .unwrap();
        connection
            .execute_batch(
                "DROP TABLE local_game_installations;
                 DROP TABLE local_game_scan_state;
                 DROP TABLE local_game_provider_results;
                 PRAGMA user_version=10;",
            )
            .unwrap();

        migrate(&mut connection).unwrap();
        migrate(&mut connection).unwrap();
        let version: i64 = connection
            .query_row("PRAGMA user_version", [], |row| row.get(0))
            .unwrap();
        let state: String = connection
            .query_row(
                "SELECT value FROM state WHERE key='libraryItems'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        let backup: String = connection
            .query_row("SELECT snapshot FROM backups LIMIT 1", [], |row| row.get(0))
            .unwrap();
        assert_eq!(version, 11);
        assert!(state.contains("kept"));
        assert!(backup.contains("kept"));
    }

    #[test]
    fn rejects_databases_from_a_newer_schema() {
        let mut connection = Connection::open_in_memory().unwrap();
        connection.execute_batch("PRAGMA user_version=12;").unwrap();
        assert!(migrate(&mut connection)
            .unwrap_err()
            .contains("solo admite hasta la 11"));
    }

    #[test]
    fn validates_a_v2_archive_manifest_and_database_entry() {
        let manifest = ArchiveManifest {
            format: "noche".into(),
            version: 2,
            exported_at: "2026-01-01T00:00:00Z".into(),
            app_version: None,
            schema_version: None,
            couple_names: None,
            counts: ArchiveCounts {
                library_items: 0,
                plans: 0,
                reviews: 0,
                tracks: 0,
                saved_music: 0,
                attachments: 0,
                media_files: 0,
                password_vault_entries: 0,
            },
        };
        let mut legacy_json = serde_json::to_value(&manifest).unwrap();
        legacy_json.as_object_mut().unwrap().remove("coupleNames");
        let legacy: ArchiveManifest = serde_json::from_value(legacy_json).unwrap();
        assert!(legacy.couple_names.is_none());
        let mut named = manifest.clone();
        named.couple_names = Some(["Ana".into(), "Luz".into()]);
        let roundtrip: ArchiveManifest =
            serde_json::from_str(&serde_json::to_string(&named).unwrap()).unwrap();
        assert_eq!(roundtrip.couple_names, Some(["Ana".into(), "Luz".into()]));
        let mut writer = zip::ZipWriter::new(Cursor::new(Vec::new()));
        let options = zip::write::SimpleFileOptions::default();
        writer.start_file("manifest.json", options).unwrap();
        writer
            .write_all(serde_json::to_string(&manifest).unwrap().as_bytes())
            .unwrap();
        writer
            .start_file("database/noite.sqlite3", options)
            .unwrap();
        writer.write_all(b"sqlite-placeholder").unwrap();
        let bytes = writer.finish().unwrap().into_inner();
        assert_eq!(manifest_from_archive(&bytes).unwrap().version, 2);
    }
}
