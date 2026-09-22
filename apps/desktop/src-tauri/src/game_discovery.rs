use crate::{CommandError, CommandResult};
use quick_xml::de::from_str as xml_from_str;
use rusqlite::{params, params_from_iter, Connection, OptionalExtension, Transaction};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha2::{Digest, Sha256};
use std::{
    cell::RefCell,
    collections::{HashMap, HashSet},
    fs,
    io::Read,
    path::{Path, PathBuf},
    process::Command,
    sync::atomic::{AtomicBool, Ordering},
};
use tauri::{AppHandle, Emitter};

const SCANNER_VERSION: i64 = 2;
const MAX_MANIFEST_BYTES: u64 = 4 * 1024 * 1024;
const MAX_PROVIDER_ENTRIES: usize = 5_000;
const MAX_COMMAND_ITEMS: usize = 5_000;
const MAX_TITLE_CHARS: usize = 300;
static GAME_SCAN_RUNNING: AtomicBool = AtomicBool::new(false);

#[derive(Default)]
struct ScanDiagnostics {
    unreadable: usize,
    invalid: usize,
    oversized: usize,
}

thread_local! {
    static SCAN_DIAGNOSTICS: RefCell<ScanDiagnostics> = RefCell::new(ScanDiagnostics::default());
}

struct ScanGuard;

impl ScanGuard {
    fn acquire() -> CommandResult<Self> {
        GAME_SCAN_RUNNING
            .compare_exchange(false, true, Ordering::AcqRel, Ordering::Acquire)
            .map(|_| Self)
            .map_err(|_| {
                command_error(
                    "game_scan_in_progress",
                    "Ya hay un escaneo de juegos en curso.",
                    None,
                )
            })
    }
}

impl Drop for ScanGuard {
    fn drop(&mut self) {
        GAME_SCAN_RUNNING.store(false, Ordering::Release);
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
enum GameStore {
    Steam,
    Epic,
    Gog,
    Xbox,
    Ea,
    Ubisoft,
    Battlenet,
    Manual,
}

impl GameStore {
    fn as_str(&self) -> &'static str {
        match self {
            Self::Steam => "steam",
            Self::Epic => "epic",
            Self::Gog => "gog",
            Self::Xbox => "xbox",
            Self::Ea => "ea",
            Self::Ubisoft => "ubisoft",
            Self::Battlenet => "battlenet",
            Self::Manual => "manual",
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum LaunchTarget {
    Protocol {
        url: String,
    },
    Executable {
        path: String,
        args: Vec<String>,
        working_dir: Option<String>,
    },
    Shortcut {
        path: String,
    },
    Aumid {
        app_id: String,
    },
    ExecutionAlias {
        alias: String,
    },
}

#[derive(Debug, Clone)]
struct DetectedGame {
    discovery_key: String,
    store: GameStore,
    store_game_id: String,
    title: String,
    install_location: Option<String>,
    launch_target: Option<LaunchTarget>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameScanState {
    status: String,
    scanner_version: i64,
    last_started_at: Option<String>,
    last_completed_at: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameScanCandidate {
    installation_id: String,
    discovery_key: String,
    store: String,
    store_game_id: String,
    title: String,
    install_location: Option<String>,
    launchable: bool,
    available: bool,
    ignored: bool,
    linked_library_item_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProviderScanResult {
    store: String,
    status: String,
    found: usize,
    warnings: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameScanReport {
    candidates: Vec<GameScanCandidate>,
    providers: Vec<ProviderScanResult>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameInstallationSummary {
    installation_id: String,
    library_item_id: String,
    store: String,
    title: String,
    available: bool,
    launchable: bool,
    preferred: bool,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GameBindingInput {
    installation_id: String,
    library_item_id: String,
    preferred: Option<bool>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GameImportResult {
    created_item_ids: Vec<String>,
    linked_count: usize,
}

fn command_error(code: &str, message: &str, details: impl Into<Option<Value>>) -> CommandError {
    CommandError {
        code: code.into(),
        message: message.into(),
        details: details.into(),
    }
}

fn valid_identifier(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 200
        && !value.chars().any(|character| character.is_control())
}

pub fn migrate(connection: &Connection) -> Result<(), String> {
    connection
        .execute_batch(
            "CREATE TABLE IF NOT EXISTS local_game_installations(
                id TEXT PRIMARY KEY,
                discovery_key TEXT NOT NULL UNIQUE,
                store TEXT NOT NULL,
                store_game_id TEXT NOT NULL,
                title TEXT NOT NULL,
                install_location TEXT,
                launch_target TEXT,
                library_item_id TEXT,
                available INTEGER NOT NULL DEFAULT 1,
                preferred INTEGER NOT NULL DEFAULT 0,
                ignored INTEGER NOT NULL DEFAULT 0,
                first_seen_at TEXT NOT NULL DEFAULT(datetime('now')),
                last_seen_at TEXT NOT NULL DEFAULT(datetime('now'))
            );
            CREATE INDEX IF NOT EXISTS idx_local_games_library ON local_game_installations(library_item_id,available,preferred);
            CREATE TABLE IF NOT EXISTS local_game_scan_state(
                singleton INTEGER PRIMARY KEY CHECK(singleton=1),
                status TEXT NOT NULL CHECK(status IN ('not_asked','pending_review','completed','skipped')),
                scanner_version INTEGER NOT NULL,
                last_started_at TEXT,
                last_completed_at TEXT
            );
            CREATE TABLE IF NOT EXISTS local_game_provider_results(
                store TEXT PRIMARY KEY,
                status TEXT NOT NULL CHECK(status IN ('ok','unavailable','partial','error')),
                found INTEGER NOT NULL,
                warnings TEXT NOT NULL DEFAULT '[]',
                scanned_at TEXT NOT NULL DEFAULT(datetime('now'))
            );
            INSERT OR IGNORE INTO local_game_scan_state(singleton,status,scanner_version) VALUES(1,'not_asked',2);",
        )
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn game_scan_status(app: AppHandle) -> CommandResult<GameScanState> {
    let connection = crate::connection(&app).map_err(CommandError::from)?;
    connection
        .query_row(
            "SELECT status,scanner_version,last_started_at,last_completed_at FROM local_game_scan_state WHERE singleton=1",
            [],
            |row| {
                Ok(GameScanState {
                    status: row.get(0)?,
                    scanner_version: row.get(1)?,
                    last_started_at: row.get(2)?,
                    last_completed_at: row.get(3)?,
                })
            },
        )
        .map_err(|error| CommandError::from(error.to_string()))
}

#[tauri::command]
pub fn skip_game_scan(app: AppHandle) -> CommandResult<()> {
    let connection = crate::connection(&app).map_err(CommandError::from)?;
    connection
        .execute(
            "UPDATE local_game_scan_state SET status='skipped',scanner_version=?1,last_completed_at=datetime('now') WHERE singleton=1",
            [SCANNER_VERSION],
        )
        .map_err(|error| CommandError::from(error.to_string()))?;
    Ok(())
}

#[tauri::command]
pub fn game_scan_report(app: AppHandle) -> CommandResult<GameScanReport> {
    let connection = crate::connection(&app).map_err(CommandError::from)?;
    Ok(GameScanReport {
        candidates: read_candidates(&connection).map_err(CommandError::from)?,
        providers: read_provider_results(&connection).map_err(CommandError::from)?,
    })
}

#[tauri::command]
pub async fn scan_installed_games(app: AppHandle) -> CommandResult<GameScanReport> {
    let _guard = ScanGuard::acquire()?;
    let connection = crate::connection(&app).map_err(CommandError::from)?;
    connection
        .execute(
            "UPDATE local_game_scan_state SET scanner_version=?1,last_started_at=datetime('now') WHERE singleton=1",
            [SCANNER_VERSION],
        )
        .map_err(|error| CommandError::from(error.to_string()))?;
    drop(connection);
    let app_for_scan = app.clone();
    let progress_app = app.clone();
    let (games, providers) =
        tauri::async_runtime::spawn_blocking(move || scan_all(Some(&progress_app)))
            .await
            .map_err(|error| {
                command_error(
                    "game_scan_failed",
                    "Noite no pudo completar el escaneo local.",
                    Some(Value::String(error.to_string())),
                )
            })?;
    persist_scan(&app_for_scan, games, &providers).map_err(CommandError::from)?;
    let connection = crate::connection(&app_for_scan).map_err(CommandError::from)?;
    Ok(GameScanReport {
        candidates: read_candidates(&connection).map_err(CommandError::from)?,
        providers,
    })
}

fn persist_scan(
    app: &AppHandle,
    games: Vec<DetectedGame>,
    providers: &[ProviderScanResult],
) -> Result<(), String> {
    let mut connection = crate::connection(app)?;
    let transaction = connection
        .transaction()
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "UPDATE local_game_scan_state SET scanner_version=?1,last_completed_at=datetime('now') WHERE singleton=1",
            [SCANNER_VERSION],
        )
        .map_err(|error| error.to_string())?;
    transaction
        .execute(
            "UPDATE local_game_installations SET available=0 WHERE store<>'manual'",
            [],
        )
        .map_err(|error| error.to_string())?;
    for game in games.into_iter().take(MAX_PROVIDER_ENTRIES * 8) {
        let id = stable_id("installation", &game.discovery_key);
        let launch = game
            .launch_target
            .as_ref()
            .map(serde_json::to_string)
            .transpose()
            .map_err(|error| error.to_string())?;
        transaction.execute(
            "INSERT INTO local_game_installations(id,discovery_key,store,store_game_id,title,install_location,launch_target,available,last_seen_at)
             VALUES(?1,?2,?3,?4,?5,?6,?7,1,datetime('now'))
             ON CONFLICT(discovery_key) DO UPDATE SET store=excluded.store,store_game_id=excluded.store_game_id,title=excluded.title,install_location=excluded.install_location,launch_target=excluded.launch_target,available=1,last_seen_at=datetime('now')",
            params![id,game.discovery_key,game.store.as_str(),game.store_game_id,game.title,game.install_location,launch],
        ).map_err(|error| error.to_string())?;
    }
    for provider in providers {
        let warnings =
            serde_json::to_string(&provider.warnings).map_err(|error| error.to_string())?;
        transaction.execute(
            "INSERT INTO local_game_provider_results(store,status,found,warnings,scanned_at)
             VALUES(?1,?2,?3,?4,datetime('now'))
             ON CONFLICT(store) DO UPDATE SET status=excluded.status,found=excluded.found,warnings=excluded.warnings,scanned_at=datetime('now')",
            params![provider.store, provider.status, provider.found as i64, warnings],
        ).map_err(|error| error.to_string())?;
    }
    transaction
        .execute(
            "UPDATE local_game_scan_state
         SET status=CASE WHEN EXISTS(
           SELECT 1 FROM local_game_installations
           WHERE available=1 AND ignored=0 AND library_item_id IS NULL
         ) THEN 'pending_review' ELSE 'completed' END
         WHERE singleton=1",
            [],
        )
        .map_err(|error| error.to_string())?;
    transaction.commit().map_err(|error| error.to_string())
}

fn read_provider_results(connection: &Connection) -> Result<Vec<ProviderScanResult>, String> {
    let mut statement = connection
        .prepare(
            "SELECT store,status,found,warnings FROM local_game_provider_results ORDER BY store",
        )
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| {
            let raw: String = row.get(3)?;
            Ok(ProviderScanResult {
                store: row.get(0)?,
                status: row.get(1)?,
                found: row.get::<_, i64>(2)?.max(0) as usize,
                warnings: serde_json::from_str(&raw).unwrap_or_else(|_| {
                    vec!["No se pudo leer el detalle del escaneo anterior.".into()]
                }),
            })
        })
        .map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

fn read_candidates(connection: &Connection) -> Result<Vec<GameScanCandidate>, String> {
    let mut statement = connection
        .prepare("SELECT id,discovery_key,store,store_game_id,title,install_location,launch_target IS NOT NULL,available,ignored,library_item_id FROM local_game_installations WHERE available=1 AND ignored=0 AND library_item_id IS NULL ORDER BY title COLLATE NOCASE,store")
        .map_err(|error| error.to_string())?;
    let rows = statement
        .query_map([], |row| {
            Ok(GameScanCandidate {
                installation_id: row.get(0)?,
                discovery_key: row.get(1)?,
                store: row.get(2)?,
                store_game_id: row.get(3)?,
                title: row.get(4)?,
                install_location: row.get(5)?,
                launchable: row.get::<_, i64>(6)? != 0,
                available: row.get::<_, i64>(7)? != 0,
                ignored: row.get::<_, i64>(8)? != 0,
                linked_library_item_id: row.get(9)?,
            })
        })
        .map_err(|error| error.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

fn validate_new_item(item: &Value) -> Result<(String, String), CommandError> {
    let object = item.as_object().ok_or_else(|| {
        command_error(
            "invalid_game_import",
            "La actividad importada no es válida.",
            None,
        )
    })?;
    let id = object
        .get("id")
        .and_then(Value::as_str)
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| {
            command_error(
                "invalid_game_import",
                "Falta el identificador de una actividad.",
                None,
            )
        })?;
    let title = object
        .get("title")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|value| !value.is_empty() && value.chars().count() <= MAX_TITLE_CHARS)
        .ok_or_else(|| {
            command_error(
                "invalid_game_import",
                "El título detectado no es válido.",
                None,
            )
        })?;
    if object.get("kind").and_then(Value::as_str) != Some("video_game")
        || object.get("status").and_then(Value::as_str) != Some("pending")
    {
        return Err(command_error(
            "invalid_game_import",
            "Solo se pueden importar videojuegos pendientes.",
            None,
        ));
    }
    Ok((id.to_string(), title.to_string()))
}

#[tauri::command]
pub fn commit_game_import(
    app: AppHandle,
    new_items: Vec<Value>,
    bindings: Vec<GameBindingInput>,
    ignored_installation_ids: Vec<String>,
) -> CommandResult<GameImportResult> {
    if new_items.len() > MAX_COMMAND_ITEMS
        || bindings.len() > MAX_COMMAND_ITEMS
        || ignored_installation_ids.len() > MAX_COMMAND_ITEMS
    {
        return Err(command_error(
            "game_import_too_large",
            "La selección contiene demasiados juegos.",
            None,
        ));
    }
    if bindings.iter().any(|binding| {
        !valid_identifier(&binding.installation_id) || !valid_identifier(&binding.library_item_id)
    }) || ignored_installation_ids
        .iter()
        .any(|id| !valid_identifier(id))
    {
        return Err(command_error(
            "invalid_game_import",
            "La selección contiene identificadores no válidos.",
            None,
        ));
    }
    let mut connection = crate::connection(&app).map_err(CommandError::from)?;
    let state = crate::read_state(&connection).map_err(CommandError::from)?;
    let mut library = state
        .get("libraryItems")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let mut known_ids: HashSet<String> = library
        .iter()
        .filter_map(|item| item.get("id").and_then(Value::as_str).map(str::to_string))
        .collect();
    let mut created_item_ids = Vec::new();
    for item in new_items {
        let (id, _) = validate_new_item(&item)?;
        if known_ids.insert(id.clone()) {
            created_item_ids.push(id);
            library.push(item);
        }
    }
    let final_ids: HashSet<String> = library
        .iter()
        .filter_map(|item| item.get("id").and_then(Value::as_str).map(str::to_string))
        .collect();
    let game_ids: HashSet<String> = library
        .iter()
        .filter(|item| item.get("kind").and_then(Value::as_str) == Some("video_game"))
        .filter_map(|item| item.get("id").and_then(Value::as_str).map(str::to_string))
        .collect();
    if bindings
        .iter()
        .any(|binding| !final_ids.contains(&binding.library_item_id))
    {
        return Err(command_error(
            "invalid_game_binding",
            "Una instalación apunta a una actividad inexistente.",
            None,
        ));
    }
    if bindings
        .iter()
        .any(|binding| !game_ids.contains(&binding.library_item_id))
    {
        return Err(command_error(
            "invalid_game_binding",
            "Las instalaciones solo pueden vincularse con videojuegos.",
            None,
        ));
    }
    let binding_ids: HashSet<&str> = bindings
        .iter()
        .map(|binding| binding.installation_id.as_str())
        .collect();
    let ignored_ids: HashSet<&str> = ignored_installation_ids
        .iter()
        .map(String::as_str)
        .collect();
    if binding_ids.len() != bindings.len()
        || ignored_ids.len() != ignored_installation_ids.len()
        || binding_ids.iter().any(|id| ignored_ids.contains(id))
    {
        return Err(command_error(
            "invalid_game_import",
            "La selección contiene instalaciones duplicadas o contradictorias.",
            None,
        ));
    }
    let entries = HashMap::from([("libraryItems".to_string(), Value::Array(library))]);
    crate::save_rolling_backup(&connection).map_err(CommandError::from)?;
    let transaction = connection
        .transaction()
        .map_err(|error| CommandError::from(error.to_string()))?;
    write_library_entry(
        &transaction,
        entries.get("libraryItems").expect("library entry"),
    )
    .map_err(CommandError::from)?;
    for binding in &bindings {
        if binding.preferred.unwrap_or(false) {
            transaction
                .execute(
                    "UPDATE local_game_installations SET preferred=0 WHERE library_item_id=?1",
                    [&binding.library_item_id],
                )
                .map_err(|error| CommandError::from(error.to_string()))?;
        }
        let changed = transaction.execute(
            "UPDATE local_game_installations SET library_item_id=?1,ignored=0,preferred=?2 WHERE id=?3",
            params![binding.library_item_id, binding.preferred.unwrap_or(false) as i64, binding.installation_id],
        ).map_err(|error| CommandError::from(error.to_string()))?;
        if changed == 0 {
            return Err(command_error(
                "game_installation_missing",
                "Una instalación detectada ya no está disponible.",
                None,
            ));
        }
    }
    for id in &ignored_installation_ids {
        let changed = transaction.execute("UPDATE local_game_installations SET ignored=1,library_item_id=NULL,preferred=0 WHERE id=?1", [id]).map_err(|error| CommandError::from(error.to_string()))?;
        if changed == 0 {
            return Err(command_error(
                "game_installation_missing",
                "Una instalación ignorada ya no existe.",
                None,
            ));
        }
    }
    transaction.execute("UPDATE local_game_scan_state SET status='completed',scanner_version=?1,last_completed_at=datetime('now') WHERE singleton=1", [SCANNER_VERSION]).map_err(|error| CommandError::from(error.to_string()))?;
    transaction
        .commit()
        .map_err(|error| CommandError::from(error.to_string()))?;
    Ok(GameImportResult {
        created_item_ids,
        linked_count: bindings.len(),
    })
}

fn write_library_entry(transaction: &Transaction<'_>, value: &Value) -> Result<(), String> {
    let raw = serde_json::to_string(value).map_err(|error| error.to_string())?;
    transaction.execute("INSERT INTO state(key,value) VALUES('libraryItems',?1) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [&raw]).map_err(|error| error.to_string())?;
    crate::sync_typed_entry(transaction, "libraryItems", value)
}

pub fn reconcile_bindings(connection: &Connection) -> Result<(), String> {
    connection.execute(
        "UPDATE local_game_installations SET library_item_id=NULL,preferred=0 WHERE library_item_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM library_items WHERE library_items.id=local_game_installations.library_item_id)",
        [],
    ).map(|_|()).map_err(|error|error.to_string())
}

pub fn sanitize_portable_database(connection: &Connection) -> Result<(), String> {
    connection
        .execute_batch(
            "DELETE FROM local_game_installations;
             DELETE FROM local_game_scan_state;
             DELETE FROM local_game_provider_results;",
        )
        .map_err(|error| error.to_string())
}

pub fn preserve_local_state_for_import(
    imported: &Connection,
    current_database: &Path,
) -> Result<(), String> {
    imported
        .execute(
            "ATTACH DATABASE ?1 AS current_device",
            [current_database.to_string_lossy().as_ref()],
        )
        .map_err(|error| error.to_string())?;
    let result = imported.execute_batch(
        "DELETE FROM local_game_installations;
         DELETE FROM local_game_scan_state;
         DELETE FROM local_game_provider_results;
         INSERT INTO local_game_installations(
             id,discovery_key,store,store_game_id,title,install_location,launch_target,
             library_item_id,available,preferred,ignored,first_seen_at,last_seen_at
         )
         SELECT id,discovery_key,store,store_game_id,title,install_location,launch_target,
             library_item_id,available,preferred,ignored,first_seen_at,last_seen_at
         FROM current_device.local_game_installations;
         INSERT INTO local_game_scan_state(
             singleton,status,scanner_version,last_started_at,last_completed_at
         )
         SELECT singleton,status,scanner_version,last_started_at,last_completed_at
         FROM current_device.local_game_scan_state;
         INSERT INTO local_game_provider_results(store,status,found,warnings,scanned_at)
         SELECT store,status,found,warnings,scanned_at
         FROM current_device.local_game_provider_results;",
    );
    let detach_result = imported.execute_batch("DETACH DATABASE current_device;");
    result
        .and(detach_result)
        .map_err(|error| error.to_string())?;
    reconcile_bindings(imported)
}

#[tauri::command]
pub fn game_installations_for_items(
    app: AppHandle,
    mut item_ids: Vec<String>,
) -> CommandResult<Vec<GameInstallationSummary>> {
    if item_ids.len() > MAX_COMMAND_ITEMS {
        return Err(command_error(
            "game_query_too_large",
            "Se solicitaron demasiadas instalaciones a la vez.",
            None,
        ));
    }
    if item_ids.iter().any(|id| !valid_identifier(id)) {
        return Err(command_error(
            "invalid_game_query",
            "La consulta contiene identificadores no válidos.",
            None,
        ));
    }
    item_ids.sort();
    item_ids.dedup();
    if item_ids.is_empty() {
        return Ok(Vec::new());
    }
    let connection = crate::connection(&app).map_err(CommandError::from)?;
    let placeholders = std::iter::repeat_n("?", item_ids.len())
        .collect::<Vec<_>>()
        .join(",");
    let sql = format!("SELECT id,library_item_id,store,title,available,launch_target IS NOT NULL,preferred FROM local_game_installations WHERE library_item_id IN ({placeholders}) ORDER BY preferred DESC,title COLLATE NOCASE");
    let mut statement = connection
        .prepare(&sql)
        .map_err(|error| CommandError::from(error.to_string()))?;
    let rows = statement
        .query_map(params_from_iter(item_ids), |row| {
            Ok(GameInstallationSummary {
                installation_id: row.get(0)?,
                library_item_id: row.get(1)?,
                store: row.get(2)?,
                title: row.get(3)?,
                available: row.get::<_, i64>(4)? != 0,
                launchable: row.get::<_, i64>(5)? != 0,
                preferred: row.get::<_, i64>(6)? != 0,
            })
        })
        .map_err(|error| CommandError::from(error.to_string()))?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| CommandError::from(error.to_string()))
}

#[tauri::command]
pub fn set_preferred_game_installation(
    app: AppHandle,
    installation_id: String,
) -> CommandResult<()> {
    if !valid_identifier(&installation_id) {
        return Err(command_error(
            "invalid_game_installation",
            "La instalación solicitada no es válida.",
            None,
        ));
    }
    let mut connection = crate::connection(&app).map_err(CommandError::from)?;
    let item_id: Option<String> = connection
        .query_row(
            "SELECT library_item_id FROM local_game_installations WHERE id=?1",
            [&installation_id],
            |row| row.get(0),
        )
        .optional()
        .map_err(|error| CommandError::from(error.to_string()))?
        .flatten();
    let item_id = item_id.ok_or_else(|| {
        command_error(
            "game_installation_missing",
            "La instalación no está vinculada a un juego.",
            None,
        )
    })?;
    let transaction = connection
        .transaction()
        .map_err(|error| CommandError::from(error.to_string()))?;
    transaction
        .execute(
            "UPDATE local_game_installations SET preferred=0 WHERE library_item_id=?1",
            [&item_id],
        )
        .map_err(|error| CommandError::from(error.to_string()))?;
    transaction
        .execute(
            "UPDATE local_game_installations SET preferred=1 WHERE id=?1 AND library_item_id=?2",
            params![installation_id, item_id],
        )
        .map_err(|error| CommandError::from(error.to_string()))?;
    transaction
        .commit()
        .map_err(|error| CommandError::from(error.to_string()))?;
    Ok(())
}

#[tauri::command]
pub fn launch_game_installation(app: AppHandle, installation_id: String) -> CommandResult<()> {
    if !valid_identifier(&installation_id) {
        return Err(command_error(
            "invalid_game_installation",
            "La instalación solicitada no es válida.",
            None,
        ));
    }
    let connection = crate::connection(&app).map_err(CommandError::from)?;
    let row: Option<(Option<String>, i64, i64)> = connection
        .query_row(
            "SELECT launch_target,available,library_item_id IS NOT NULL FROM local_game_installations WHERE id=?1",
            [&installation_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()
        .map_err(|error| CommandError::from(error.to_string()))?;
    let (raw, available, linked) = row.ok_or_else(|| {
        command_error(
            "game_installation_missing",
            "Noite ya no encuentra esta instalación.",
            None,
        )
    })?;
    if linked == 0 {
        return Err(command_error(
            "game_not_linked",
            "Vincula la instalación con un juego antes de abrirla.",
            None,
        ));
    }
    if available == 0 {
        return Err(command_error(
            "game_not_installed",
            "Este juego ya no está disponible en este equipo.",
            None,
        ));
    }
    let target: LaunchTarget = serde_json::from_str(raw.as_deref().ok_or_else(|| {
        command_error(
            "game_not_launchable",
            "Esta instalación necesita un ejecutable manual.",
            None,
        )
    })?)
    .map_err(|_| {
        command_error(
            "invalid_launch_target",
            "El destino de lanzamiento guardado no es válido.",
            None,
        )
    })?;
    launch_target(&target)
}

#[tauri::command]
pub fn add_manual_game_installation(
    app: AppHandle,
    library_item_id: String,
    item_title: String,
) -> CommandResult<Option<GameInstallationSummary>> {
    if !valid_identifier(&library_item_id) {
        return Err(command_error(
            "invalid_library_item",
            "La actividad seleccionada no es válida.",
            None,
        ));
    }
    let item_title = item_title.trim().to_string();
    if item_title.is_empty() || item_title.chars().count() > MAX_TITLE_CHARS {
        return Err(command_error(
            "invalid_game_title",
            "El título del juego no es válido.",
            None,
        ));
    }
    let selected = rfd::FileDialog::new()
        .add_filter("Juego o acceso directo", &["exe", "lnk"])
        .pick_file();
    let Some(path) = selected else {
        return Ok(None);
    };
    let target = manual_target(&path)?;
    let canonical = fs::canonicalize(&path).map_err(|error| {
        command_error(
            "game_target_missing",
            "No se pudo leer el archivo seleccionado.",
            Some(Value::String(error.to_string())),
        )
    })?;
    let discovery_key = format!("manual:{}", canonical.to_string_lossy().to_lowercase());
    let id = stable_id("installation", &discovery_key);
    let connection = crate::connection(&app).map_err(CommandError::from)?;
    let exists: bool = connection
        .query_row(
            "SELECT EXISTS(SELECT 1 FROM library_items WHERE id=?1 AND kind='video_game')",
            [&library_item_id],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|error| CommandError::from(error.to_string()))?
        != 0;
    if !exists {
        return Err(command_error(
            "library_item_missing",
            "La actividad no existe o no es un videojuego.",
            None,
        ));
    }
    connection.execute(
        "INSERT INTO local_game_installations(id,discovery_key,store,store_game_id,title,install_location,launch_target,library_item_id,available,preferred,last_seen_at)
         VALUES(?1,?2,'manual',?2,?3,?4,?5,?6,1,1,datetime('now'))
         ON CONFLICT(discovery_key) DO UPDATE SET title=excluded.title,install_location=excluded.install_location,launch_target=excluded.launch_target,library_item_id=excluded.library_item_id,available=1,preferred=1,last_seen_at=datetime('now')",
        params![id,discovery_key,item_title,canonical.parent().map(|value|value.to_string_lossy().to_string()),serde_json::to_string(&target).map_err(|error|CommandError::from(error.to_string()))?,library_item_id],
    ).map_err(|error| CommandError::from(error.to_string()))?;
    connection.execute("UPDATE local_game_installations SET preferred=CASE WHEN id=?1 THEN 1 ELSE 0 END WHERE library_item_id=?2", params![id,library_item_id]).map_err(|error| CommandError::from(error.to_string()))?;
    Ok(Some(GameInstallationSummary {
        installation_id: id,
        library_item_id,
        store: "manual".into(),
        title: item_title,
        available: true,
        launchable: true,
        preferred: true,
    }))
}

fn manual_target(path: &Path) -> CommandResult<LaunchTarget> {
    match path
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase)
        .as_deref()
    {
        Some("exe") => {
            let executable = validated_executable(path)?;
            Ok(LaunchTarget::Executable {
                path: executable.to_string_lossy().to_string(),
                args: Vec::new(),
                working_dir: executable
                    .parent()
                    .map(|value| value.to_string_lossy().to_string()),
            })
        }
        Some("lnk") => resolve_shortcut(path).map_err(|error| {
            command_error(
                "unsafe_game_target",
                "El acceso directo no apunta a un ejecutable de juego seguro.",
                Some(Value::String(error)),
            )
        }),
        _ => Err(command_error(
            "unsafe_game_target",
            "Selecciona un archivo .exe o .lnk.",
            None,
        )),
    }
}

fn validate_shortcut_path(path: &Path) -> Result<PathBuf, String> {
    if !path.is_absolute()
        || !path.is_file()
        || path
            .extension()
            .and_then(|value| value.to_str())
            .is_none_or(|value| !value.eq_ignore_ascii_case("lnk"))
    {
        return Err("El acceso directo no existe o no es un archivo .lnk absoluto.".into());
    }
    fs::canonicalize(path).map_err(|error| error.to_string())
}

fn parse_windows_arguments(value: &str) -> Result<Vec<String>, String> {
    if value.len() > 8_192 || value.chars().any(|character| character == '\0') {
        return Err("Los argumentos del acceso directo no son válidos.".into());
    }
    let characters: Vec<char> = value.chars().collect();
    let mut result = Vec::new();
    let mut index = 0;
    while index < characters.len() {
        while index < characters.len() && characters[index].is_whitespace() {
            index += 1;
        }
        if index == characters.len() {
            break;
        }
        let mut argument = String::new();
        let mut quoted = false;
        while index < characters.len() {
            let character = characters[index];
            if character == '"' {
                quoted = !quoted;
                index += 1;
                continue;
            }
            if !quoted && character.is_whitespace() {
                break;
            }
            if character == '\\' {
                let start = index;
                while index < characters.len() && characters[index] == '\\' {
                    index += 1;
                }
                let slash_count = index - start;
                if index < characters.len() && characters[index] == '"' {
                    argument.extend(std::iter::repeat_n('\\', slash_count / 2));
                    if slash_count % 2 == 0 {
                        quoted = !quoted;
                    } else {
                        argument.push('"');
                    }
                    index += 1;
                } else {
                    argument.extend(std::iter::repeat_n('\\', slash_count));
                }
                continue;
            }
            if character.is_control() {
                return Err("Los argumentos contienen caracteres de control.".into());
            }
            argument.push(character);
            index += 1;
        }
        if quoted {
            return Err("Los argumentos contienen comillas sin cerrar.".into());
        }
        result.push(argument);
        if result.len() > 64 {
            return Err("El acceso directo contiene demasiados argumentos.".into());
        }
    }
    Ok(result)
}

fn wide_string(buffer: &[u16]) -> String {
    let length = buffer
        .iter()
        .position(|character| *character == 0)
        .unwrap_or(buffer.len());
    String::from_utf16_lossy(&buffer[..length])
}

#[cfg(windows)]
fn resolve_shortcut(path: &Path) -> Result<LaunchTarget, String> {
    use windows::{
        core::{Interface, HSTRING},
        Win32::{
            System::Com::{
                CoCreateInstance, CoInitializeEx, CoUninitialize, IPersistFile,
                CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED, STGM_READ,
            },
            UI::Shell::{IShellLinkW, ShellLink, SLGP_RAWPATH},
        },
    };

    let shortcut = validate_shortcut_path(path)?;
    unsafe {
        let initialized = CoInitializeEx(None, COINIT_APARTMENTTHREADED).is_ok();
        let result = (|| {
            let link: IShellLinkW = CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER)
                .map_err(|error| error.to_string())?;
            let persistent: IPersistFile = link.cast().map_err(|error| error.to_string())?;
            persistent
                .Load(
                    &HSTRING::from(shortcut.to_string_lossy().as_ref()),
                    STGM_READ,
                )
                .map_err(|error| error.to_string())?;
            let mut target_buffer = vec![0u16; 32_768];
            link.GetPath(
                &mut target_buffer,
                std::ptr::null_mut(),
                SLGP_RAWPATH.0 as u32,
            )
            .map_err(|error| error.to_string())?;
            let target = PathBuf::from(wide_string(&target_buffer));
            let target = validated_executable(&target).map_err(|error| error.message)?;

            let mut arguments_buffer = vec![0u16; 8_193];
            link.GetArguments(&mut arguments_buffer)
                .map_err(|error| error.to_string())?;
            let arguments = parse_windows_arguments(&wide_string(&arguments_buffer))?;

            let mut working_buffer = vec![0u16; 32_768];
            let working_dir = link
                .GetWorkingDirectory(&mut working_buffer)
                .ok()
                .map(|_| PathBuf::from(wide_string(&working_buffer)))
                .filter(|directory| directory.is_absolute() && directory.is_dir())
                .map(|directory| directory.to_string_lossy().to_string());

            Ok(LaunchTarget::Executable {
                path: target.to_string_lossy().to_string(),
                args: arguments,
                working_dir,
            })
        })();
        if initialized {
            CoUninitialize();
        }
        result
    }
}

#[cfg(not(windows))]
fn resolve_shortcut(path: &Path) -> Result<LaunchTarget, String> {
    validate_shortcut_path(path)?;
    Err("La resolución segura de accesos directos solo está disponible en Windows.".into())
}

fn launch_target(target: &LaunchTarget) -> CommandResult<()> {
    match target {
        LaunchTarget::Protocol { url } => {
            validate_protocol(url)?;
            open::that(url).map_err(|error| {
                command_error(
                    "game_launch_failed",
                    "No se pudo abrir el launcher del juego.",
                    Some(Value::String(error.to_string())),
                )
            })
        }
        LaunchTarget::Executable {
            path,
            args,
            working_dir,
        } => {
            let executable = validated_executable(Path::new(path))?;
            let mut command = Command::new(&executable);
            command.args(args);
            if let Some(directory) = working_dir
                .as_deref()
                .map(Path::new)
                .filter(|value| value.is_dir())
            {
                command.current_dir(directory);
            }
            command.spawn().map(|_| ()).map_err(|error| {
                command_error(
                    "game_launch_failed",
                    "No se pudo iniciar el juego.",
                    Some(Value::String(error.to_string())),
                )
            })
        }
        LaunchTarget::Shortcut { path } => {
            let shortcut = Path::new(path);
            if !shortcut.is_absolute()
                || !shortcut.is_file()
                || shortcut
                    .extension()
                    .and_then(|value| value.to_str())
                    .map(|value| !value.eq_ignore_ascii_case("lnk"))
                    .unwrap_or(true)
            {
                return Err(command_error(
                    "unsafe_game_target",
                    "El acceso directo ya no es válido.",
                    None,
                ));
            }
            let resolved = resolve_shortcut(shortcut).map_err(|error| {
                command_error(
                    "unsafe_game_target",
                    "El acceso directo no apunta a un ejecutable de juego seguro.",
                    Some(Value::String(error)),
                )
            })?;
            launch_target(&resolved)
        }
        LaunchTarget::Aumid { app_id } => {
            if app_id.len() < 3
                || app_id.len() > 300
                || app_id.matches('!').count() != 1
                || !app_id.chars().all(|character| {
                    character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-' | '!')
                })
            {
                return Err(command_error(
                    "unsafe_game_target",
                    "La identidad de la aplicación no es válida.",
                    None,
                ));
            }
            activate_aumid(app_id).map_err(|error| {
                command_error(
                    "game_launch_failed",
                    "Windows no pudo activar el juego.",
                    Some(Value::String(error)),
                )
            })
        }
        LaunchTarget::ExecutionAlias { alias } => {
            let alias_path = validated_execution_alias(alias)?;
            Command::new(alias_path)
                .spawn()
                .map(|_| ())
                .map_err(|error| {
                    command_error(
                        "game_launch_failed",
                        "Windows no pudo iniciar el alias del juego.",
                        Some(Value::String(error.to_string())),
                    )
                })
        }
    }
}

#[cfg(windows)]
fn activate_aumid(app_id: &str) -> Result<(), String> {
    use windows::{
        core::{HSTRING, PCWSTR},
        Win32::{
            System::Com::{
                CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_LOCAL_SERVER,
                COINIT_APARTMENTTHREADED,
            },
            UI::Shell::{ApplicationActivationManager, IApplicationActivationManager, AO_NONE},
        },
    };

    unsafe {
        let initialized = CoInitializeEx(None, COINIT_APARTMENTTHREADED).is_ok();
        let result = (|| {
            let manager: IApplicationActivationManager =
                CoCreateInstance(&ApplicationActivationManager, None, CLSCTX_LOCAL_SERVER)
                    .map_err(|error| error.to_string())?;
            manager
                .ActivateApplication(&HSTRING::from(app_id), PCWSTR::null(), AO_NONE)
                .map(|_| ())
                .map_err(|error| error.to_string())
        })();
        if initialized {
            CoUninitialize();
        }
        result
    }
}

#[cfg(not(windows))]
fn activate_aumid(_app_id: &str) -> Result<(), String> {
    Err("La activación AUMID solo está disponible en Windows.".into())
}

fn validate_protocol(value: &str) -> CommandResult<()> {
    if value.len() > 2_048 || value.chars().any(char::is_control) {
        return Err(command_error(
            "unsafe_game_target",
            "El protocolo del launcher no es válido.",
            None,
        ));
    }
    let parsed = url::Url::parse(value).map_err(|_| {
        command_error(
            "unsafe_game_target",
            "El protocolo del launcher no es válido.",
            None,
        )
    })?;
    if !parsed.username().is_empty()
        || parsed.password().is_some()
        || parsed.fragment().is_some()
        || !matches!(
            parsed.scheme(),
            "steam" | "com.epicgames.launcher" | "uplay" | "origin2" | "battlenet"
        )
    {
        return Err(command_error(
            "unsafe_game_target",
            "Noite bloqueó un protocolo de lanzamiento no permitido.",
            None,
        ));
    }
    let valid_shape = match parsed.scheme() {
        "steam" => {
            parsed.host_str() == Some("rungameid")
                && parsed.query().is_none()
                && parsed.path_segments().is_some_and(|mut segments| {
                    let id = segments.next().unwrap_or_default();
                    !id.is_empty()
                        && id.len() <= 20
                        && id.chars().all(|character| character.is_ascii_digit())
                        && segments.next().is_none()
                })
        }
        "com.epicgames.launcher" => {
            parsed.host_str() == Some("apps")
                && parsed.path().len() > 1
                && parsed.path().len() <= 1_024
                && parsed.query_pairs().all(|(key, value)| {
                    matches!(
                        (key.as_ref(), value.as_ref()),
                        ("action", "launch") | ("silent", "true")
                    )
                })
        }
        _ => parsed.host_str().is_some() || parsed.path().len() > 1,
    };
    if !valid_shape {
        return Err(command_error(
            "unsafe_game_target",
            "El destino del launcher no tiene un formato permitido.",
            None,
        ));
    }
    Ok(())
}

fn validated_executable(path: &Path) -> CommandResult<PathBuf> {
    if !path.is_absolute()
        || !path.is_file()
        || path
            .extension()
            .and_then(|value| value.to_str())
            .map(|value| !value.eq_ignore_ascii_case("exe"))
            .unwrap_or(true)
    {
        return Err(command_error(
            "game_target_missing",
            "El ejecutable del juego ya no existe.",
            None,
        ));
    }
    let canonical = fs::canonicalize(path).map_err(|error| {
        command_error(
            "game_target_missing",
            "No se pudo validar el ejecutable del juego.",
            Some(Value::String(error.to_string())),
        )
    })?;
    if canonical
        .extension()
        .and_then(|value| value.to_str())
        .is_none_or(|value| !value.eq_ignore_ascii_case("exe"))
    {
        return Err(command_error(
            "unsafe_game_target",
            "El destino final no es un ejecutable permitido.",
            None,
        ));
    }
    let name = canonical
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or_default();
    if is_denied_executable_name(name) {
        return Err(command_error(
            "unsafe_game_target",
            "Noite bloqueó un ejecutable del sistema que no es un juego.",
            None,
        ));
    }
    Ok(canonical)
}

fn is_denied_executable_name(name: &str) -> bool {
    [
        "cmd.exe",
        "powershell.exe",
        "pwsh.exe",
        "wscript.exe",
        "cscript.exe",
        "mshta.exe",
        "rundll32.exe",
        "regsvr32.exe",
        "explorer.exe",
        "msiexec.exe",
        "reg.exe",
        "schtasks.exe",
        "control.exe",
        "hh.exe",
        "msbuild.exe",
        "installutil.exe",
        "certutil.exe",
        "bitsadmin.exe",
    ]
    .iter()
    .any(|denied_name| name.eq_ignore_ascii_case(denied_name))
}

#[cfg(windows)]
fn validated_execution_alias(alias: &str) -> CommandResult<PathBuf> {
    use windows::Win32::System::Com::CoTaskMemFree;
    use windows::Win32::UI::Shell::{FOLDERID_LocalAppData, SHGetKnownFolderPath, KF_FLAG_DEFAULT};

    if alias.len() > 180
        || !alias
            .chars()
            .all(|value| value.is_ascii_alphanumeric() || matches!(value, '.' | '_' | '-'))
        || !alias.to_ascii_lowercase().ends_with(".exe")
        || is_denied_executable_name(alias)
    {
        return Err(command_error(
            "unsafe_game_target",
            "El alias de ejecución no es válido.",
            None,
        ));
    }

    // SAFETY: Windows allocates the known-folder string with the COM allocator;
    // it is copied before being released with CoTaskMemFree.
    let local_data = unsafe {
        let raw = SHGetKnownFolderPath(&FOLDERID_LocalAppData, KF_FLAG_DEFAULT, None).map_err(
            |error| {
                command_error(
                    "game_target_missing",
                    "Windows no pudo ubicar sus alias de aplicaciones.",
                    Some(Value::String(error.to_string())),
                )
            },
        )?;
        let copied = raw.to_string().map(PathBuf::from).map_err(|error| {
            command_error(
                "game_target_missing",
                "Windows devolvió una ruta de alias no válida.",
                Some(Value::String(error.to_string())),
            )
        });
        CoTaskMemFree(Some(raw.as_ptr().cast()));
        copied?
    };
    let aliases_root = local_data.join("Microsoft").join("WindowsApps");
    let candidate = aliases_root.join(alias);
    if !candidate.is_file() || candidate.parent() != Some(aliases_root.as_path()) {
        return Err(command_error(
            "game_target_missing",
            "El alias de ejecución del juego ya no existe.",
            None,
        ));
    }
    Ok(candidate)
}

#[cfg(not(windows))]
fn validated_execution_alias(_alias: &str) -> CommandResult<PathBuf> {
    Err(command_error(
        "game_target_missing",
        "Los alias de ejecución solo están disponibles en Windows.",
        None,
    ))
}

fn scan_all(progress_app: Option<&AppHandle>) -> (Vec<DetectedGame>, Vec<ProviderScanResult>) {
    let mut all = Vec::new();
    let mut providers = Vec::new();
    for (store, scanner) in [
        (
            GameStore::Steam,
            scan_steam as fn() -> Result<Vec<DetectedGame>, String>,
        ),
        (GameStore::Epic, scan_epic),
        (GameStore::Gog, scan_gog),
        (GameStore::Xbox, scan_xbox),
        (GameStore::Ea, scan_ea),
        (GameStore::Ubisoft, scan_ubisoft),
        (GameStore::Battlenet, scan_battlenet),
    ] {
        reset_scan_diagnostics();
        let provider = match scanner() {
            Ok(mut games) => {
                let before_validation = games.len();
                games.retain(valid_detected_game_shape);
                let found = games.len();
                let missing_targets = games
                    .iter()
                    .filter(|game| game.launch_target.is_none())
                    .count();
                let mut warnings = take_scan_warnings();
                let invalid_results = before_validation.saturating_sub(found);
                if invalid_results > 0 {
                    warnings.push(format!(
                        "Se omitieron {invalid_results} resultado(s) con identificadores o títulos fuera de los límites."
                    ));
                }
                if missing_targets > 0 {
                    warnings.push(format!(
                        "{missing_targets} instalación(es) requieren seleccionar un ejecutable manual."
                    ));
                }
                all.append(&mut games);
                ProviderScanResult {
                    store: store.as_str().into(),
                    status: if found == 0 {
                        "unavailable"
                    } else if warnings.is_empty() {
                        "ok"
                    } else {
                        "partial"
                    }
                    .into(),
                    found,
                    warnings,
                }
            }
            Err(error) => {
                let mut warnings = take_scan_warnings();
                warnings.push(error);
                ProviderScanResult {
                    store: store.as_str().into(),
                    status: "error".into(),
                    found: 0,
                    warnings,
                }
            }
        };
        if let Some(app) = progress_app {
            let _ = app.emit("game-scan-progress", provider.clone());
        }
        providers.push(provider);
    }
    let mut keys = HashSet::new();
    all.retain(|game| keys.insert(game.discovery_key.clone()));
    (all, providers)
}

fn valid_detected_game_shape(game: &DetectedGame) -> bool {
    let title = game.title.trim();
    !title.is_empty()
        && title.chars().count() <= MAX_TITLE_CHARS
        && !title.chars().any(char::is_control)
        && !game.discovery_key.is_empty()
        && game.discovery_key.len() <= 1_024
        && !game.discovery_key.chars().any(char::is_control)
        && !game.store_game_id.is_empty()
        && game.store_game_id.len() <= 512
        && !game.store_game_id.chars().any(char::is_control)
        && game.install_location.as_ref().is_none_or(|path| {
            !path.is_empty() && path.len() <= 32_767 && !path.chars().any(char::is_control)
        })
}

fn reset_scan_diagnostics() {
    SCAN_DIAGNOSTICS.with(|diagnostics| *diagnostics.borrow_mut() = ScanDiagnostics::default());
}

fn record_manifest_error(error: &str) {
    SCAN_DIAGNOSTICS.with(|diagnostics| {
        let mut diagnostics = diagnostics.borrow_mut();
        if error.contains("demasiado grande") {
            diagnostics.oversized += 1;
        } else {
            diagnostics.unreadable += 1;
        }
    });
}

fn record_invalid_manifest() {
    SCAN_DIAGNOSTICS.with(|diagnostics| diagnostics.borrow_mut().invalid += 1);
}

fn take_scan_warnings() -> Vec<String> {
    SCAN_DIAGNOSTICS.with(|diagnostics| {
        let diagnostics = std::mem::take(&mut *diagnostics.borrow_mut());
        let mut warnings = Vec::new();
        if diagnostics.invalid > 0 {
            warnings.push(format!(
                "Se omitieron {} manifiesto(s) dañado(s) o incompleto(s).",
                diagnostics.invalid
            ));
        }
        if diagnostics.unreadable > 0 {
            warnings.push(format!(
                "No se pudieron leer {} manifiesto(s).",
                diagnostics.unreadable
            ));
        }
        if diagnostics.oversized > 0 {
            warnings.push(format!(
                "Se omitieron {} manifiesto(s) que superaban el límite de seguridad.",
                diagnostics.oversized
            ));
        }
        warnings
    })
}

fn stable_id(prefix: &str, value: &str) -> String {
    let digest = Sha256::digest(value.as_bytes());
    format!(
        "{prefix}-{}",
        digest
            .iter()
            .take(12)
            .map(|byte| format!("{byte:02x}"))
            .collect::<String>()
    )
}

fn read_small(path: &Path) -> Result<String, String> {
    let metadata = fs::metadata(path).map_err(|error| error.to_string())?;
    if metadata.len() > MAX_MANIFEST_BYTES {
        return Err(format!(
            "El manifiesto {} es demasiado grande.",
            path.display()
        ));
    }
    let file = fs::File::open(path).map_err(|error| error.to_string())?;
    let mut contents = String::new();
    file.take(MAX_MANIFEST_BYTES + 1)
        .read_to_string(&mut contents)
        .map_err(|error| error.to_string())?;
    if contents.len() as u64 > MAX_MANIFEST_BYTES {
        return Err(format!(
            "El manifiesto {} es demasiado grande.",
            path.display()
        ));
    }
    Ok(contents)
}

#[cfg(windows)]
fn known_folder_path(id: &windows::core::GUID) -> Option<PathBuf> {
    use windows::Win32::System::Com::CoTaskMemFree;
    use windows::Win32::UI::Shell::{SHGetKnownFolderPath, KF_FLAG_DEFAULT};

    // SAFETY: the returned string uses the COM allocator and is freed after
    // being copied into an owned PathBuf.
    unsafe {
        let raw = SHGetKnownFolderPath(id, KF_FLAG_DEFAULT, None).ok()?;
        let path = raw.to_string().ok().map(PathBuf::from);
        CoTaskMemFree(Some(raw.as_ptr().cast()));
        path
    }
}

#[cfg(windows)]
fn roaming_app_data_path() -> Option<PathBuf> {
    known_folder_path(&windows::Win32::UI::Shell::FOLDERID_RoamingAppData)
}

#[cfg(windows)]
fn program_data_path() -> Option<PathBuf> {
    known_folder_path(&windows::Win32::UI::Shell::FOLDERID_ProgramData)
}

#[cfg(not(windows))]
fn roaming_app_data_path() -> Option<PathBuf> {
    std::env::var_os("APPDATA").map(PathBuf::from)
}

#[cfg(not(windows))]
fn program_data_path() -> Option<PathBuf> {
    std::env::var_os("PROGRAMDATA").map(PathBuf::from)
}

fn quoted_value(contents: &str, key: &str) -> Option<String> {
    contents.lines().find_map(|line| {
        let mut parts = line.split('"').filter(|part| !part.trim().is_empty());
        let found = parts.next()?.trim();
        let value = parts.next()?.trim();
        found
            .eq_ignore_ascii_case(key)
            .then(|| value.replace("\\\\", "\\"))
    })
}

#[cfg(windows)]
fn steam_install_path() -> Option<PathBuf> {
    use winreg::{enums::*, RegKey};
    let current = RegKey::predef(HKEY_CURRENT_USER)
        .open_subkey("Software\\Valve\\Steam")
        .ok()
        .and_then(|key| {
            key.get_value::<String, _>("SteamPath")
                .ok()
                .or_else(|| key.get_value("InstallPath").ok())
        });
    let machine = RegKey::predef(HKEY_LOCAL_MACHINE)
        .open_subkey_with_flags(
            "SOFTWARE\\WOW6432Node\\Valve\\Steam",
            KEY_READ | KEY_WOW64_32KEY,
        )
        .ok()
        .and_then(|key| key.get_value::<String, _>("InstallPath").ok());
    current.or(machine).map(PathBuf::from)
}

#[cfg(not(windows))]
fn steam_install_path() -> Option<PathBuf> {
    None
}

fn scan_steam() -> Result<Vec<DetectedGame>, String> {
    let Some(root) = steam_install_path().filter(|path| path.is_dir()) else {
        return Ok(Vec::new());
    };
    let mut libraries = vec![root.clone()];
    let library_file = root.join("steamapps").join("libraryfolders.vdf");
    if library_file.is_file() {
        match read_small(&library_file) {
            Ok(contents) => {
                for line in contents
                    .lines()
                    .filter(|line| line.to_ascii_lowercase().contains("\"path\""))
                {
                    if let Some(value) = quoted_value(line, "path") {
                        let path = PathBuf::from(value);
                        if path.is_dir() {
                            libraries.push(path);
                        }
                    }
                }
            }
            Err(error) => record_manifest_error(&error),
        }
    }
    let mut games = Vec::new();
    for library in libraries {
        let steamapps = library.join("steamapps");
        let Ok(entries) = fs::read_dir(&steamapps) else {
            continue;
        };
        for entry in entries.filter_map(Result::ok).take(MAX_PROVIDER_ENTRIES) {
            let path = entry.path();
            let file_name = path
                .file_name()
                .and_then(|value| value.to_str())
                .unwrap_or_default();
            if !file_name.starts_with("appmanifest_")
                || path.extension().and_then(|value| value.to_str()) != Some("acf")
            {
                continue;
            }
            let contents = match read_small(&path) {
                Ok(contents) => contents,
                Err(error) => {
                    record_manifest_error(&error);
                    continue;
                }
            };
            let Some(app_id) = quoted_value(&contents, "appid") else {
                record_invalid_manifest();
                continue;
            };
            if app_id.len() > 20 || !app_id.chars().all(|character| character.is_ascii_digit()) {
                record_invalid_manifest();
                continue;
            }
            let Some(title) =
                quoted_value(&contents, "name").filter(|value| !value.trim().is_empty())
            else {
                record_invalid_manifest();
                continue;
            };
            let install = quoted_value(&contents, "installdir").map(|value| {
                steamapps
                    .join("common")
                    .join(value)
                    .to_string_lossy()
                    .to_string()
            });
            games.push(DetectedGame {
                discovery_key: format!("steam:{app_id}"),
                store: GameStore::Steam,
                store_game_id: app_id.clone(),
                title,
                install_location: install,
                launch_target: Some(LaunchTarget::Protocol {
                    url: format!("steam://rungameid/{app_id}"),
                }),
            });
        }
    }
    Ok(games)
}

fn scan_epic() -> Result<Vec<DetectedGame>, String> {
    let Some(program_data) = program_data_path() else {
        return Ok(Vec::new());
    };
    let root = program_data
        .join("Epic")
        .join("EpicGamesLauncher")
        .join("Data")
        .join("Manifests");
    let Ok(entries) = fs::read_dir(root) else {
        return Ok(Vec::new());
    };
    let mut games = Vec::new();
    for entry in entries.filter_map(Result::ok).take(MAX_PROVIDER_ENTRIES) {
        let path = entry.path();
        if path.extension().and_then(|value| value.to_str()) != Some("item") {
            continue;
        }
        let contents = match read_small(&path) {
            Ok(contents) => contents,
            Err(error) => {
                record_manifest_error(&error);
                continue;
            }
        };
        let value = match serde_json::from_str::<Value>(&contents) {
            Ok(value) => value,
            Err(_) => {
                record_invalid_manifest();
                continue;
            }
        };
        if let Some(game) = epic_game_from_manifest(&value) {
            games.push(game);
        }
    }
    Ok(games)
}

fn epic_game_from_manifest(value: &Value) -> Option<DetectedGame> {
    if value.get("bIsIncompleteInstall").and_then(Value::as_bool) == Some(true)
        || value.get("bIsApplication").and_then(Value::as_bool) == Some(false)
    {
        return None;
    }
    let categories = value
        .get("AppCategories")
        .and_then(Value::as_array)
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .map(str::to_ascii_lowercase)
        .collect::<Vec<_>>();
    if categories.iter().any(|category| {
        [
            "dlc", "plugin", "plugins", "tool", "tools", "editor", "engine",
        ]
        .iter()
        .any(|blocked| category == blocked)
    }) {
        return None;
    }
    let app = value.get("AppName")?.as_str()?;
    let main = value
        .get("MainGameAppName")
        .and_then(Value::as_str)
        .unwrap_or_default();
    if app.is_empty() || (!main.is_empty() && main != app) {
        return None;
    }
    let title = value
        .get("DisplayName")
        .and_then(Value::as_str)
        .or_else(|| value.get("VaultTitleText").and_then(Value::as_str))?
        .trim();
    if title.is_empty() {
        return None;
    }
    let namespace = value
        .get("CatalogNamespace")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let catalog = value
        .get("CatalogItemId")
        .and_then(Value::as_str)
        .unwrap_or_default();
    if !valid_store_token(app) || !valid_store_token(namespace) || !valid_store_token(catalog) {
        return None;
    }
    let identity = format!("{namespace}:{catalog}:{app}");
    let encoded = url::form_urlencoded::byte_serialize(identity.as_bytes()).collect::<String>();
    Some(DetectedGame {
        discovery_key: format!("epic:{identity}"),
        store: GameStore::Epic,
        store_game_id: identity,
        title: title.into(),
        install_location: value
            .get("InstallLocation")
            .and_then(Value::as_str)
            .map(str::to_string),
        launch_target: Some(LaunchTarget::Protocol {
            url: format!("com.epicgames.launcher://apps/{encoded}?action=launch&silent=true"),
        }),
    })
}

fn valid_store_token(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 256
        && value.chars().all(|character| {
            character.is_ascii_alphanumeric() || matches!(character, '.' | '_' | '-')
        })
}

#[cfg(windows)]
fn scan_gog() -> Result<Vec<DetectedGame>, String> {
    use winreg::{enums::*, RegKey};
    let mut games = Vec::new();
    for (hive, flags) in [
        (HKEY_CURRENT_USER, KEY_READ | KEY_WOW64_32KEY),
        (HKEY_CURRENT_USER, KEY_READ | KEY_WOW64_64KEY),
        (HKEY_LOCAL_MACHINE, KEY_READ | KEY_WOW64_32KEY),
        (HKEY_LOCAL_MACHINE, KEY_READ | KEY_WOW64_64KEY),
    ] {
        let Ok(root) =
            RegKey::predef(hive).open_subkey_with_flags("SOFTWARE\\GOG.com\\Games", flags)
        else {
            continue;
        };
        for id in root
            .enum_keys()
            .filter_map(Result::ok)
            .take(MAX_PROVIDER_ENTRIES)
        {
            let Ok(key) = root.open_subkey_with_flags(&id, flags) else {
                continue;
            };
            let title: String = key
                .get_value("gameName")
                .or_else(|_| key.get_value("gameTitle"))
                .unwrap_or_else(|_| id.clone());
            let path: Option<String> = key.get_value("path").ok();
            let exe: Option<String> = key
                .get_value("exe")
                .ok()
                .or_else(|| key.get_value("launchCommand").ok());
            let launch = exe.and_then(|raw| executable_target(&raw, path.as_deref()));
            if path
                .as_deref()
                .is_some_and(|value| !Path::new(value).is_dir())
                && launch.is_none()
            {
                continue;
            }
            games.push(DetectedGame {
                discovery_key: format!("gog:{id}"),
                store: GameStore::Gog,
                store_game_id: id,
                title,
                install_location: path,
                launch_target: launch,
            });
        }
    }
    Ok(games)
}

#[cfg(not(windows))]
fn scan_gog() -> Result<Vec<DetectedGame>, String> {
    Ok(Vec::new())
}

fn executable_target(raw: &str, install: Option<&str>) -> Option<LaunchTarget> {
    let trimmed = raw.trim();
    let direct = PathBuf::from(trimmed.trim_matches('"'));
    let (executable, args) = if direct.is_file() {
        (direct, Vec::new())
    } else {
        let mut parts = parse_windows_arguments(trimmed).ok()?.into_iter();
        (PathBuf::from(parts.next()?), parts.collect())
    };
    let mut path = executable;
    if path.is_relative() {
        path = PathBuf::from(install?).join(path);
    }
    let path = validated_executable(&path).ok()?;
    Some(LaunchTarget::Executable {
        path: path.to_string_lossy().to_string(),
        args,
        working_dir: path
            .parent()
            .map(|value| value.to_string_lossy().to_string()),
    })
}

#[derive(Debug, Deserialize)]
#[serde(rename = "Game")]
struct MicrosoftGameConfig {
    #[serde(rename = "Identity")]
    identity: MicrosoftIdentity,
    #[serde(rename = "ShellVisuals")]
    shell_visuals: Option<MicrosoftShellVisuals>,
    #[serde(rename = "ExecutableList")]
    executable_list: MicrosoftExecutableList,
}
#[derive(Debug, Deserialize)]
struct MicrosoftIdentity {
    #[serde(rename = "@Name")]
    name: String,
}
#[derive(Debug, Deserialize)]
struct MicrosoftShellVisuals {
    #[serde(rename = "@DefaultDisplayName")]
    default_display_name: Option<String>,
}
#[derive(Debug, Deserialize)]
struct MicrosoftExecutableList {
    #[serde(rename = "Executable", default)]
    executables: Vec<MicrosoftExecutable>,
}
#[derive(Debug, Deserialize)]
struct MicrosoftExecutable {
    #[serde(rename = "@Name")]
    name: String,
    #[serde(rename = "@Alias")]
    alias: Option<String>,
    #[serde(rename = "@Id")]
    id: Option<String>,
}

fn scan_xbox() -> Result<Vec<DetectedGame>, String> {
    let mut games = scan_xbox_packages();
    for letter in b'A'..=b'Z' {
        let root = PathBuf::from(format!("{}:\\XboxGames", letter as char));
        let Ok(entries) = fs::read_dir(root) else {
            continue;
        };
        for entry in entries.filter_map(Result::ok).take(MAX_PROVIDER_ENTRIES) {
            let content = entry.path().join("Content");
            let config_path = content.join("MicrosoftGame.config");
            if !config_path.is_file() {
                continue;
            }
            let raw = match read_small(&config_path) {
                Ok(raw) => raw,
                Err(error) => {
                    record_manifest_error(&error);
                    continue;
                }
            };
            let config = match xml_from_str::<MicrosoftGameConfig>(&raw) {
                Ok(config) => config,
                Err(_) => {
                    record_invalid_manifest();
                    continue;
                }
            };
            let Some(executable) = config
                .executable_list
                .executables
                .into_iter()
                .find(|value| !value.name.is_empty())
            else {
                continue;
            };
            let mut title = config
                .shell_visuals
                .and_then(|value| value.default_display_name)
                .unwrap_or_else(|| entry.file_name().to_string_lossy().to_string());
            if title.starts_with("ms-resource:") {
                title = entry.file_name().to_string_lossy().to_string();
            }
            let path = content.join(&executable.name);
            let alias_launch =
                executable
                    .alias
                    .filter(|value| !value.is_empty())
                    .and_then(|alias| {
                        validated_execution_alias(&alias)
                            .ok()
                            .map(|_| LaunchTarget::ExecutionAlias { alias })
                    });
            let launch = alias_launch.or_else(|| {
                path.is_file().then(|| LaunchTarget::Executable {
                    path: path.to_string_lossy().to_string(),
                    args: Vec::new(),
                    working_dir: path
                        .parent()
                        .map(|value| value.to_string_lossy().to_string()),
                })
            });
            let id = executable.id.unwrap_or_else(|| "Game".into());
            games.push(DetectedGame {
                discovery_key: format!("xbox:{}:{id}", config.identity.name),
                store: GameStore::Xbox,
                store_game_id: config.identity.name,
                title,
                install_location: Some(content.to_string_lossy().to_string()),
                launch_target: launch,
            });
        }
    }
    games.extend(scan_shortcuts(Some(GameStore::Xbox))?);
    Ok(games)
}

#[cfg(windows)]
fn scan_xbox_packages() -> Vec<DetectedGame> {
    use windows::{
        core::HSTRING,
        Management::Deployment::PackageManager,
        Win32::System::WinRT::{RoInitialize, RoUninitialize, RO_INIT_MULTITHREADED},
    };

    let initialized = unsafe { RoInitialize(RO_INIT_MULTITHREADED).is_ok() };
    let result = (|| {
        let Ok(manager) = PackageManager::new() else {
            return Vec::new();
        };
        let Ok(packages) = manager.FindPackagesByUserSecurityId(&HSTRING::new()) else {
            return Vec::new();
        };
        let mut games = Vec::new();
        for package in packages.into_iter().take(MAX_PROVIDER_ENTRIES) {
            if package.IsFramework().unwrap_or(true) {
                continue;
            }
            let Ok(location) = package.InstalledLocation() else {
                continue;
            };
            let Ok(location_path) = location.Path() else {
                continue;
            };
            let install = PathBuf::from(location_path.to_string_lossy());
            let config_path = install.join("MicrosoftGame.config");
            if !config_path.is_file() {
                continue;
            }
            let raw = match read_small(&config_path) {
                Ok(raw) => raw,
                Err(error) => {
                    record_manifest_error(&error);
                    continue;
                }
            };
            let config = match xml_from_str::<MicrosoftGameConfig>(&raw) {
                Ok(config) => config,
                Err(_) => {
                    record_invalid_manifest();
                    continue;
                }
            };
            let Ok(entries) = package.GetAppListEntries() else {
                continue;
            };
            for entry in entries.into_iter().take(16) {
                let Ok(aumid) = entry.AppUserModelId() else {
                    continue;
                };
                let app_id = aumid.to_string_lossy();
                if app_id.is_empty() {
                    continue;
                }
                let display_name = entry
                    .DisplayInfo()
                    .and_then(|info| info.DisplayName())
                    .ok()
                    .map(|value| value.to_string_lossy())
                    .filter(|value| !value.trim().is_empty() && !value.starts_with("ms-resource:"));
                let config_title = config
                    .shell_visuals
                    .as_ref()
                    .and_then(|visuals| visuals.default_display_name.clone())
                    .filter(|value| !value.starts_with("ms-resource:"));
                let title = display_name
                    .or(config_title)
                    .unwrap_or_else(|| config.identity.name.clone());
                games.push(DetectedGame {
                    discovery_key: format!("xbox:aumid:{app_id}"),
                    store: GameStore::Xbox,
                    store_game_id: config.identity.name.clone(),
                    title,
                    install_location: Some(install.to_string_lossy().to_string()),
                    launch_target: Some(LaunchTarget::Aumid { app_id }),
                });
            }
        }
        games
    })();
    if initialized {
        unsafe { RoUninitialize() };
    }
    result
}

#[cfg(not(windows))]
fn scan_xbox_packages() -> Vec<DetectedGame> {
    Vec::new()
}

fn scan_ea() -> Result<Vec<DetectedGame>, String> {
    scan_compat_store(GameStore::Ea)
}
fn scan_ubisoft() -> Result<Vec<DetectedGame>, String> {
    scan_compat_store(GameStore::Ubisoft)
}
fn scan_battlenet() -> Result<Vec<DetectedGame>, String> {
    scan_compat_store(GameStore::Battlenet)
}

fn scan_compat_store(store: GameStore) -> Result<Vec<DetectedGame>, String> {
    let mut result = scan_uninstall_registry(&store)?;
    result.extend(scan_shortcuts(Some(store))?);
    Ok(result)
}

#[cfg(windows)]
fn scan_uninstall_registry(store: &GameStore) -> Result<Vec<DetectedGame>, String> {
    use winreg::{enums::*, RegKey};
    let mut games = Vec::new();
    for (hive, flags) in [
        (HKEY_CURRENT_USER, KEY_READ),
        (HKEY_LOCAL_MACHINE, KEY_READ | KEY_WOW64_32KEY),
        (HKEY_LOCAL_MACHINE, KEY_READ | KEY_WOW64_64KEY),
    ] {
        let Ok(root) = RegKey::predef(hive).open_subkey_with_flags(
            "SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall",
            flags,
        ) else {
            continue;
        };
        for key_name in root
            .enum_keys()
            .filter_map(Result::ok)
            .take(MAX_PROVIDER_ENTRIES)
        {
            let Ok(key) = root.open_subkey_with_flags(&key_name, flags) else {
                continue;
            };
            let title: String = match key.get_value("DisplayName") {
                Ok(value) => value,
                Err(_) => continue,
            };
            let publisher: String = key.get_value("Publisher").unwrap_or_default();
            let haystack = format!("{title} {publisher} {key_name}").to_ascii_lowercase();
            if !store_matches(store, &haystack) {
                continue;
            }
            if is_launcher_name(&title) {
                continue;
            }
            let install: Option<String> = key.get_value("InstallLocation").ok();
            let icon: Option<String> = key.get_value("DisplayIcon").ok();
            let launch = icon.as_deref().and_then(|value| {
                executable_target(value.split(',').next().unwrap_or(value), install.as_deref())
            });
            games.push(DetectedGame {
                discovery_key: format!("{}:uninstall:{key_name}", store.as_str()),
                store: store.clone(),
                store_game_id: key_name,
                title,
                install_location: install,
                launch_target: launch,
            });
        }
    }
    Ok(games)
}

#[cfg(not(windows))]
fn scan_uninstall_registry(_store: &GameStore) -> Result<Vec<DetectedGame>, String> {
    Ok(Vec::new())
}

fn store_matches(store: &GameStore, value: &str) -> bool {
    match store {
        GameStore::Ea => {
            value.contains("electronic arts")
                || value.contains("ea games")
                || value.contains("origin")
        }
        GameStore::Ubisoft => value.contains("ubisoft") || value.contains("uplay"),
        GameStore::Battlenet => value.contains("battle.net") || value.contains("blizzard"),
        _ => false,
    }
}
fn is_launcher_name(value: &str) -> bool {
    matches!(
        value.trim().to_ascii_lowercase().as_str(),
        "ea app" | "origin" | "ubisoft connect" | "uplay" | "battle.net" | "xbox"
    )
}

fn scan_shortcuts(filter: Option<GameStore>) -> Result<Vec<DetectedGame>, String> {
    let mut roots = Vec::new();
    if let Some(appdata) = roaming_app_data_path() {
        roots.push(appdata.join("Microsoft\\Windows\\Start Menu\\Programs"));
    }
    if let Some(programdata) = program_data_path() {
        roots.push(programdata.join("Microsoft\\Windows\\Start Menu\\Programs"));
    }
    let mut games = Vec::new();
    let mut visited = 0usize;
    for root in roots {
        let Ok(root) = fs::canonicalize(root) else {
            continue;
        };
        visit_shortcuts(&root, &root, 0, filter.as_ref(), &mut games, &mut visited);
    }
    Ok(games)
}

fn visit_shortcuts(
    root: &Path,
    path: &Path,
    depth: u8,
    filter: Option<&GameStore>,
    out: &mut Vec<DetectedGame>,
    visited: &mut usize,
) {
    if depth > 6 || out.len() >= MAX_PROVIDER_ENTRIES || *visited >= MAX_PROVIDER_ENTRIES {
        return;
    }
    let Ok(entries) = fs::read_dir(path) else {
        return;
    };
    for entry in entries.filter_map(Result::ok) {
        if *visited >= MAX_PROVIDER_ENTRIES {
            break;
        }
        *visited += 1;
        let path = entry.path();
        let Ok(file_type) = entry.file_type() else {
            continue;
        };
        if file_type.is_symlink() {
            continue;
        }
        if file_type.is_dir() {
            visit_shortcuts(root, &path, depth + 1, filter, out, visited);
            continue;
        }
        if path
            .extension()
            .and_then(|value| value.to_str())
            .is_none_or(|value| !value.eq_ignore_ascii_case("lnk"))
        {
            continue;
        }
        let relative = path
            .strip_prefix(root)
            .unwrap_or(&path)
            .to_string_lossy()
            .to_ascii_lowercase();
        let store = if relative.contains("battle.net") || relative.contains("blizzard") {
            GameStore::Battlenet
        } else if relative.contains("ubisoft") || relative.contains("uplay") {
            GameStore::Ubisoft
        } else if relative.contains("ea games")
            || relative.contains("electronic arts")
            || relative.contains("origin")
        {
            GameStore::Ea
        } else if relative.contains("xbox") {
            GameStore::Xbox
        } else {
            continue;
        };
        if filter.is_some_and(|wanted| wanted != &store) {
            continue;
        }
        let title = path
            .file_stem()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .trim()
            .to_string();
        if title.is_empty() || is_launcher_name(&title) {
            continue;
        }
        let Ok(launch_target) = resolve_shortcut(&path) else {
            continue;
        };
        let identity = path.to_string_lossy().to_ascii_lowercase();
        out.push(DetectedGame {
            discovery_key: format!(
                "{}:shortcut:{}",
                store.as_str(),
                stable_id("path", &identity)
            ),
            store,
            store_game_id: identity,
            title,
            install_location: path
                .parent()
                .map(|value| value.to_string_lossy().to_string()),
            launch_target: Some(launch_target),
        });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_steam_manifest_values() {
        let manifest="\"AppState\"\n{\n\"appid\"\t\"123\"\n\"name\"\t\"Night Game\"\n\"installdir\"\t\"Night\"\n}";
        assert_eq!(quoted_value(manifest, "appid").as_deref(), Some("123"));
        assert_eq!(
            quoted_value(manifest, "name").as_deref(),
            Some("Night Game")
        );
    }

    #[test]
    fn manifest_reader_rejects_oversized_files_before_parsing() {
        let path = std::env::temp_dir().join(format!(
            "noite-oversized-manifest-{}-{}",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        let file = std::fs::File::create(&path).unwrap();
        file.set_len(MAX_MANIFEST_BYTES + 1).unwrap();
        drop(file);
        assert!(read_small(&path).unwrap_err().contains("demasiado grande"));
        std::fs::remove_file(path).unwrap();
    }

    #[test]
    fn rejects_dangerous_executable_names() {
        let fake = Path::new("C:\\Windows\\System32\\cmd.exe");
        if fake.is_file() {
            assert!(validated_executable(fake).is_err());
        }
    }

    #[cfg(windows)]
    #[test]
    fn execution_aliases_never_use_path_search_or_system_interpreters() {
        assert!(validated_execution_alias("cmd.exe").is_err());
        assert!(validated_execution_alias("..\\night.exe").is_err());
        assert!(validated_execution_alias("night.bat").is_err());
        assert!(validated_execution_alias("alias-that-does-not-exist.exe").is_err());
    }

    #[test]
    fn protocol_allowlist_blocks_web_and_scripts() {
        assert!(validate_protocol("steam://rungameid/10").is_ok());
        assert!(validate_protocol("https://example.com").is_err());
        assert!(validate_protocol("file:///C:/game.exe").is_err());
    }

    #[test]
    fn detected_results_enforce_bounded_titles_and_identifiers() {
        let base = DetectedGame {
            discovery_key: "steam:10".into(),
            store: GameStore::Steam,
            store_game_id: "10".into(),
            title: "Night Game".into(),
            install_location: Some("C:\\Games\\Night".into()),
            launch_target: None,
        };
        assert!(valid_detected_game_shape(&base));
        let mut oversized = base.clone();
        oversized.title = "x".repeat(MAX_TITLE_CHARS + 1);
        assert!(!valid_detected_game_shape(&oversized));
        let mut controlled = base;
        controlled.discovery_key.push('\n');
        assert!(!valid_detected_game_shape(&controlled));
    }

    #[test]
    fn parses_shortcut_arguments_without_invoking_a_shell() {
        assert_eq!(
            parse_windows_arguments(r#"--profile "Player One" --safe"#).unwrap(),
            vec!["--profile", "Player One", "--safe"]
        );
        assert!(parse_windows_arguments("\"unterminated").is_err());
        assert!(parse_windows_arguments(&"x ".repeat(65)).is_err());
    }

    #[cfg(windows)]
    #[test]
    fn gog_commands_keep_separate_arguments_and_reject_interpreters() {
        let root = std::env::temp_dir().join(format!(
            "noite-gog-command-{}-{}",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        std::fs::create_dir_all(&root).unwrap();
        let executable = root.join("night game.exe");
        std::fs::write(&executable, []).unwrap();
        let raw = format!("\"{}\" --profile \"Player One\"", executable.display());
        let target = executable_target(&raw, Some(root.to_string_lossy().as_ref())).unwrap();
        let LaunchTarget::Executable { path, args, .. } = target else {
            panic!("expected executable target");
        };
        assert_eq!(
            PathBuf::from(path),
            std::fs::canonicalize(&executable).unwrap()
        );
        assert_eq!(args, vec!["--profile", "Player One"]);
        assert!(executable_target("\"C:\\Windows\\System32\\cmd.exe\" /c calc", None).is_none());
        std::fs::remove_dir_all(root).unwrap();
    }

    #[cfg(windows)]
    #[test]
    fn rejects_a_shortcut_that_hides_a_system_interpreter() {
        use windows::{
            core::{Interface, HSTRING},
            Win32::{
                System::Com::{
                    CoCreateInstance, CoInitializeEx, CoUninitialize, IPersistFile,
                    CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED,
                },
                UI::Shell::{IShellLinkW, ShellLink},
            },
        };

        let shortcut = std::env::temp_dir().join(format!(
            "noite-unsafe-shortcut-{}-{}.lnk",
            std::process::id(),
            chrono::Utc::now().timestamp_nanos_opt().unwrap_or_default()
        ));
        let interpreter = std::env::var("COMSPEC").expect("COMSPEC");
        unsafe {
            let initialized = CoInitializeEx(None, COINIT_APARTMENTTHREADED).is_ok();
            let link: IShellLinkW =
                CoCreateInstance(&ShellLink, None, CLSCTX_INPROC_SERVER).unwrap();
            link.SetPath(&HSTRING::from(interpreter)).unwrap();
            let persistent: IPersistFile = link.cast().unwrap();
            persistent
                .Save(&HSTRING::from(shortcut.to_string_lossy().as_ref()), true)
                .unwrap();
            drop(persistent);
            drop(link);
            if initialized {
                CoUninitialize();
            }
        }
        assert!(resolve_shortcut(&shortcut).is_err());
        std::fs::remove_file(shortcut).unwrap();
    }

    #[test]
    fn epic_manifest_filters_incomplete_installs_and_dlc() {
        let valid = serde_json::json!({
            "AppName": "NightGame",
            "MainGameAppName": "NightGame",
            "DisplayName": "Night Game",
            "CatalogNamespace": "namespace",
            "CatalogItemId": "catalog",
            "InstallLocation": "C:\\Games\\Night"
        });
        assert_eq!(epic_game_from_manifest(&valid).unwrap().title, "Night Game");
        let mut incomplete = valid.clone();
        incomplete["bIsIncompleteInstall"] = Value::Bool(true);
        assert!(epic_game_from_manifest(&incomplete).is_none());
        let mut dlc = valid;
        dlc["AppName"] = Value::String("NightGameDlc".into());
        assert!(epic_game_from_manifest(&dlc).is_none());
        let malicious = serde_json::json!({
            "AppName": "NightGame%0Afile",
            "MainGameAppName": "NightGame%0Afile",
            "DisplayName": "Night Game",
            "CatalogNamespace": "namespace",
            "CatalogItemId": "catalog"
        });
        assert!(epic_game_from_manifest(&malicious).is_none());
        let mut tool = serde_json::json!({
            "AppName": "Editor",
            "DisplayName": "Game Editor",
            "CatalogNamespace": "namespace",
            "CatalogItemId": "tool",
            "AppCategories": ["tools"]
        });
        assert!(epic_game_from_manifest(&tool).is_none());
        tool["AppCategories"] = serde_json::json!(["games"]);
        assert!(epic_game_from_manifest(&tool).is_some());
    }

    #[test]
    fn parses_microsoft_game_config_identity_and_alias() {
        let xml = r#"<Game><Identity Name="Noite.Game"/><ShellVisuals DefaultDisplayName="Night Game"/><ExecutableList><Executable Name="Game.exe" Id="Game" Alias="night.exe"/></ExecutableList></Game>"#;
        let config: MicrosoftGameConfig = xml_from_str(xml).unwrap();
        assert_eq!(config.identity.name, "Noite.Game");
        assert_eq!(
            config.executable_list.executables[0].alias.as_deref(),
            Some("night.exe")
        );
    }

    #[test]
    fn game_tables_are_not_part_of_shared_state() {
        let connection = Connection::open_in_memory().unwrap();
        connection
            .execute_batch("CREATE TABLE state(key TEXT PRIMARY KEY,value TEXT NOT NULL);")
            .unwrap();
        migrate(&connection).unwrap();
        connection.execute("INSERT INTO local_game_installations(id,discovery_key,store,store_game_id,title,available) VALUES('i','steam:1','steam','1','Game',1)",[]).unwrap();
        let state_count: i64 = connection
            .query_row("SELECT COUNT(*) FROM state", [], |row| row.get(0))
            .unwrap();
        assert_eq!(state_count, 0);
    }

    #[test]
    fn portable_database_removes_all_game_discovery_data() {
        let connection = Connection::open_in_memory().unwrap();
        migrate(&connection).unwrap();
        connection.execute("INSERT INTO local_game_installations(id,discovery_key,store,store_game_id,title,install_location,launch_target,available) VALUES('i','steam:1','steam','1','Game','C:\\\\Games','{\"kind\":\"protocol\",\"url\":\"steam://rungameid/1\"}',1)",[]).unwrap();
        connection.execute("INSERT INTO local_game_provider_results(store,status,found,warnings) VALUES('steam','ok',1,'[]')",[]).unwrap();
        sanitize_portable_database(&connection).unwrap();
        let installations: i64 = connection
            .query_row("SELECT COUNT(*) FROM local_game_installations", [], |row| {
                row.get(0)
            })
            .unwrap();
        let scan_state: i64 = connection
            .query_row("SELECT COUNT(*) FROM local_game_scan_state", [], |row| {
                row.get(0)
            })
            .unwrap();
        let providers: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM local_game_provider_results",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(installations, 0);
        assert_eq!(scan_state, 0);
        assert_eq!(providers, 0);
    }

    #[test]
    fn import_keeps_current_device_installations_and_reconciles_links() {
        let source_path = std::env::temp_dir().join(format!(
            "noite-game-import-{}-{}.sqlite3",
            std::process::id(),
            stable_id("test", &chrono::Utc::now().to_rfc3339())
        ));
        {
            let source = Connection::open(&source_path).unwrap();
            migrate(&source).unwrap();
            source.execute("INSERT INTO local_game_installations(id,discovery_key,store,store_game_id,title,library_item_id,available) VALUES('i','steam:1','steam','1','Game','kept-item',1)",[]).unwrap();
        }
        let imported = Connection::open_in_memory().unwrap();
        imported
            .execute_batch(
                "CREATE TABLE library_items(id TEXT PRIMARY KEY);
                 INSERT INTO library_items(id) VALUES('kept-item');",
            )
            .unwrap();
        migrate(&imported).unwrap();
        preserve_local_state_for_import(&imported, &source_path).unwrap();
        let binding: String = imported
            .query_row(
                "SELECT library_item_id FROM local_game_installations WHERE id='i'",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(binding, "kept-item");
        drop(imported);
        std::fs::remove_file(source_path).unwrap();
    }
}
