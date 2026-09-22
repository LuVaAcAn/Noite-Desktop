use rusqlite::params;
use serde::Serialize;
use serde_json::Value;
use std::collections::{HashMap, HashSet};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager, State};

use crate::password_vault::VaultRuntime;
use crate::{CommandError, CommandResult};

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PurgeCounts {
    library_items: usize,
    plans: usize,
    plan_items: usize,
    reviews: usize,
    shared_reviews: usize,
    attachments: usize,
    music_associations: usize,
    sessions: usize,
}

impl PurgeCounts {
    fn add(&mut self, other: &Self) {
        self.library_items += other.library_items;
        self.plans += other.plans;
        self.plan_items += other.plan_items;
        self.reviews += other.reviews;
        self.shared_reviews += other.shared_reviews;
        self.attachments += other.attachments;
        self.music_associations += other.music_associations;
        self.sessions += other.sessions;
    }
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PurgePreview {
    target_id: Option<String>,
    target_title: String,
    counts: PurgeCounts,
    media_bytes: u64,
    media_files: usize,
    clears_rolling_backups: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PurgeResult {
    #[serde(flatten)]
    preview: PurgePreview,
    completed_at: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FactoryResetStatus {
    completed: bool,
    removed_media_files: usize,
    removed_credentials: bool,
}

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheCleanupResult {
    removed_files: usize,
    removed_bytes: u64,
}

struct PurgeMutation {
    state: HashMap<String, Value>,
    preview: PurgePreview,
    media_paths: Vec<String>,
}

fn command_error(code: &str, message: &str) -> CommandError {
    CommandError {
        code: code.into(),
        message: message.into(),
        details: None,
    }
}

fn values(state: &HashMap<String, Value>, key: &str) -> Vec<Value> {
    state
        .get(key)
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
}

fn string(value: &Value, key: &str) -> Option<String> {
    value.get(key).and_then(Value::as_str).map(str::to_owned)
}

fn references_in_state(state: &HashMap<String, Value>) -> HashSet<String> {
    let mut paths = HashSet::new();
    let mut add = |value: Option<&str>| {
        if let Some(value) = value.filter(|candidate| candidate.starts_with("media/")) {
            paths.insert(value.to_owned());
        }
    };
    for item in values(state, "libraryItems") {
        add(item.get("customCoverPath").and_then(Value::as_str));
    }
    for item in values(state, "attachments") {
        add(item.get("storagePath").and_then(Value::as_str));
    }
    for item in values(state, "memoryTracks") {
        add(item.get("cachedArtworkPath").and_then(Value::as_str));
    }
    for item in values(state, "savedMusicItems") {
        add(item.get("localStoragePath").and_then(Value::as_str));
        add(item.get("artworkStoragePath").and_then(Value::as_str));
    }
    if let Some(settings) = state.get("settings") {
        add(settings.get("userAvatarPath").and_then(Value::as_str));
        add(settings.get("partnerAvatarPath").and_then(Value::as_str));
        if let Some(appearances) = settings
            .get("sectionAppearances")
            .and_then(Value::as_object)
        {
            for appearance in appearances.values() {
                add(appearance
                    .get("backgroundImageStoragePath")
                    .and_then(Value::as_str)
                    .or_else(|| {
                        appearance
                            .get("backgroundImagePath")
                            .and_then(Value::as_str)
                    }));
            }
        }
    }
    paths
}

fn scan_regenerable_media(app: &AppHandle, remove: bool) -> Result<CacheCleanupResult, String> {
    fn visit(
        root: &std::path::Path,
        current: &std::path::Path,
        references: &HashSet<String>,
        remove: bool,
        result: &mut CacheCleanupResult,
    ) -> Result<(), String> {
        if !current.exists() {
            return Ok(());
        }
        for entry in fs::read_dir(current).map_err(|cause| cause.to_string())? {
            let entry = entry.map_err(|cause| cause.to_string())?;
            let path = entry.path();
            let metadata = entry.metadata().map_err(|cause| cause.to_string())?;
            if metadata.is_dir() {
                visit(root, &path, references, remove, result)?;
                if remove {
                    let _ = fs::remove_dir(&path);
                }
                continue;
            }
            if !metadata.is_file() {
                continue;
            }
            let relative = path
                .strip_prefix(root)
                .map_err(|cause| cause.to_string())?
                .to_string_lossy()
                .replace('\\', "/");
            let storage_path = format!("media/{relative}");
            if path.extension().and_then(|value| value.to_str()) == Some("part")
                || !references.contains(&storage_path)
            {
                result.removed_bytes = result.removed_bytes.saturating_add(metadata.len());
                if remove {
                    fs::remove_file(&path).map_err(|cause| cause.to_string())?;
                }
                result.removed_files += 1;
            }
        }
        Ok(())
    }
    let state = crate::read_state(&crate::connection(app)?)?;
    let references = references_in_state(&state);
    let root = app
        .path()
        .app_data_dir()
        .map_err(|cause| cause.to_string())?
        .join("media");
    let mut result = CacheCleanupResult::default();
    visit(&root, &root, &references, remove, &mut result)?;
    if remove {
        let connection = crate::connection(app)?;
        let mut statement=connection.prepare("SELECT storage_path,local_storage_path FROM sync_media WHERE local_storage_path IS NOT NULL").map_err(|cause|cause.to_string())?;
        let mappings = statement
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|cause| cause.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|cause| cause.to_string())?;
        drop(statement);
        for (remote, local) in mappings {
            if !crate::safe_media_path(app, &local)?.is_file() {
                connection
                    .execute("DELETE FROM sync_media WHERE storage_path=?1", [remote])
                    .map_err(|cause| cause.to_string())?;
            }
        }
    }
    Ok(result)
}

pub fn purge_unreferenced_media_for_current_state(
    app: &AppHandle,
) -> Result<CacheCleanupResult, String> {
    scan_regenerable_media(app, true)
}

#[tauri::command]
pub fn clear_regenerable_cache(app: AppHandle) -> CommandResult<CacheCleanupResult> {
    purge_unreferenced_media_for_current_state(&app).map_err(CommandError::from)
}

#[tauri::command]
pub fn preview_regenerable_cache(app: AppHandle) -> CommandResult<CacheCleanupResult> {
    scan_regenerable_media(&app, false).map_err(CommandError::from)
}

fn purge_activity(
    mut state: HashMap<String, Value>,
    item_id: &str,
) -> CommandResult<PurgeMutation> {
    let library = values(&state, "libraryItems");
    let target = library
        .iter()
        .find(|item| item.get("id").and_then(Value::as_str) == Some(item_id))
        .ok_or_else(|| command_error("not_found", "Actividad no encontrada."))?;
    if target.get("archivedAt").is_none_or(Value::is_null) {
        return Err(command_error(
            "not_archived",
            "Solo se pueden eliminar definitivamente actividades archivadas.",
        ));
    }
    let title = string(target, "title").unwrap_or_else(|| "Actividad".into());
    let mut media_paths = Vec::new();
    if let Some(path) = string(target, "customCoverPath") {
        media_paths.push(path);
    }
    state.insert(
        "libraryItems".into(),
        Value::Array(
            library
                .into_iter()
                .filter(|item| item.get("id").and_then(Value::as_str) != Some(item_id))
                .collect(),
        ),
    );

    let mut plan_item_ids = HashSet::new();
    let mut affected_plan_ids = HashSet::new();
    let mut plans = Vec::new();
    let original_plans = values(&state, "plans");
    for mut plan in original_plans {
        let plan_id = string(&plan, "id").unwrap_or_default();
        let original_items = plan
            .get("items")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        let mut kept = Vec::new();
        for item in original_items {
            if item.get("libraryItemId").and_then(Value::as_str) == Some(item_id) {
                if let Some(id) = string(&item, "id") {
                    plan_item_ids.insert(id);
                }
                affected_plan_ids.insert(plan_id.clone());
            } else {
                kept.push(item);
            }
        }
        if !kept.is_empty() {
            plan["items"] = Value::Array(kept);
            plans.push(plan);
        }
    }
    let surviving_plan_ids: HashSet<String> =
        plans.iter().filter_map(|plan| string(plan, "id")).collect();
    let removed_plan_ids: HashSet<String> = affected_plan_ids
        .difference(&surviving_plan_ids)
        .cloned()
        .collect();
    state.insert("plans".into(), Value::Array(plans));

    let reviews = values(&state, "reviews");
    let removed_reviews = reviews
        .iter()
        .filter(|review| string(review, "planItemId").is_some_and(|id| plan_item_ids.contains(&id)))
        .count();
    state.insert(
        "reviews".into(),
        Value::Array(
            reviews
                .into_iter()
                .filter(|review| {
                    !string(review, "planItemId").is_some_and(|id| plan_item_ids.contains(&id))
                })
                .collect(),
        ),
    );
    let shared = values(&state, "sharedReviews");
    let removed_shared = shared
        .iter()
        .filter(|review| string(review, "planItemId").is_some_and(|id| plan_item_ids.contains(&id)))
        .count();
    state.insert(
        "sharedReviews".into(),
        Value::Array(
            shared
                .into_iter()
                .filter(|review| {
                    !string(review, "planItemId").is_some_and(|id| plan_item_ids.contains(&id))
                })
                .collect(),
        ),
    );

    let tracks = values(&state, "memoryTracks");
    let removed_tracks: Vec<Value> = tracks
        .iter()
        .filter(|track| string(track, "planItemId").is_some_and(|id| plan_item_ids.contains(&id)))
        .cloned()
        .collect();
    media_paths.extend(
        removed_tracks
            .iter()
            .filter_map(|track| string(track, "cachedArtworkPath")),
    );
    state.insert(
        "memoryTracks".into(),
        Value::Array(
            tracks
                .into_iter()
                .filter(|track| {
                    !string(track, "planItemId").is_some_and(|id| plan_item_ids.contains(&id))
                })
                .collect(),
        ),
    );

    let attachments = values(&state, "attachments");
    let removed_attachments: Vec<Value> = attachments
        .iter()
        .filter(|attachment| {
            string(attachment, "planItemId").is_some_and(|id| plan_item_ids.contains(&id))
        })
        .cloned()
        .collect();
    media_paths.extend(
        removed_attachments
            .iter()
            .filter_map(|attachment| string(attachment, "storagePath")),
    );
    state.insert(
        "attachments".into(),
        Value::Array(
            attachments
                .into_iter()
                .filter(|attachment| {
                    !string(attachment, "planItemId").is_some_and(|id| plan_item_ids.contains(&id))
                })
                .collect(),
        ),
    );

    let sessions = values(&state, "sessions");
    let affected_sessions = sessions
        .iter()
        .filter(|session| {
            string(session, "planId").is_some_and(|id| removed_plan_ids.contains(&id))
                || string(session, "currentPlanItemId")
                    .is_some_and(|id| plan_item_ids.contains(&id))
        })
        .count();
    let sessions = sessions
        .into_iter()
        .filter_map(|mut session| {
            if string(&session, "planId").is_some_and(|id| removed_plan_ids.contains(&id)) {
                return None;
            }
            if string(&session, "currentPlanItemId").is_some_and(|id| plan_item_ids.contains(&id)) {
                session["currentPlanItemId"] = Value::Null;
            }
            Some(session)
        })
        .collect();
    state.insert("sessions".into(), Value::Array(sessions));

    let referenced = references_in_state(&state);
    media_paths.sort();
    media_paths.dedup();
    media_paths.retain(|path| !referenced.contains(path));
    Ok(PurgeMutation {
        state,
        media_paths,
        preview: PurgePreview {
            target_id: Some(item_id.into()),
            target_title: title,
            counts: PurgeCounts {
                library_items: 1,
                plans: removed_plan_ids.len(),
                plan_items: plan_item_ids.len(),
                reviews: removed_reviews,
                shared_reviews: removed_shared,
                attachments: removed_attachments.len(),
                music_associations: removed_tracks.len(),
                sessions: affected_sessions,
            },
            media_bytes: 0,
            media_files: 0,
            clears_rolling_backups: true,
        },
    })
}

fn purge_attachment(
    mut state: HashMap<String, Value>,
    attachment_id: &str,
) -> CommandResult<PurgeMutation> {
    let attachments = values(&state, "attachments");
    let target = attachments
        .iter()
        .find(|item| item.get("id").and_then(Value::as_str) == Some(attachment_id))
        .ok_or_else(|| command_error("not_found", "Captura no encontrada."))?;
    if target.get("archivedAt").is_none_or(Value::is_null) {
        return Err(command_error(
            "not_archived",
            "Solo se pueden eliminar definitivamente capturas archivadas.",
        ));
    }
    let candidate = string(target, "storagePath");
    state.insert(
        "attachments".into(),
        Value::Array(
            attachments
                .into_iter()
                .filter(|item| item.get("id").and_then(Value::as_str) != Some(attachment_id))
                .collect(),
        ),
    );
    let referenced = references_in_state(&state);
    let media_paths = candidate
        .into_iter()
        .filter(|path| !referenced.contains(path))
        .collect::<Vec<_>>();
    Ok(PurgeMutation {
        state,
        media_paths,
        preview: PurgePreview {
            target_id: Some(attachment_id.into()),
            target_title: "Captura archivada".into(),
            counts: PurgeCounts {
                attachments: 1,
                ..Default::default()
            },
            media_bytes: 0,
            media_files: 0,
            clears_rolling_backups: true,
        },
    })
}

fn enrich_media(app: &AppHandle, mutation: &mut PurgeMutation) {
    mutation.preview.media_files = mutation
        .media_paths
        .iter()
        .filter(|path| crate::safe_media_path(app, path).is_ok_and(|file| file.is_file()))
        .count();
    mutation.preview.media_bytes = mutation
        .media_paths
        .iter()
        .filter_map(|path| crate::safe_media_path(app, path).ok())
        .filter_map(|file| fs::metadata(file).ok())
        .map(|metadata| metadata.len())
        .sum();
}

fn archived_ids(state: &HashMap<String, Value>, key: &str) -> Vec<String> {
    values(state, key)
        .into_iter()
        .filter(|item| item.get("archivedAt").is_some_and(|value| !value.is_null()))
        .filter_map(|item| string(&item, "id"))
        .collect()
}

fn purge_all_state(mut state: HashMap<String, Value>) -> CommandResult<PurgeMutation> {
    let mut counts = PurgeCounts::default();
    let mut paths = Vec::new();
    for id in archived_ids(&state, "libraryItems") {
        let result = purge_activity(state, &id)?;
        state = result.state;
        counts.add(&result.preview.counts);
        paths.extend(result.media_paths);
    }
    for id in archived_ids(&state, "attachments") {
        let result = purge_attachment(state, &id)?;
        state = result.state;
        counts.add(&result.preview.counts);
        paths.extend(result.media_paths);
    }
    paths.sort();
    paths.dedup();
    Ok(PurgeMutation {
        state,
        media_paths: paths,
        preview: PurgePreview {
            target_id: None,
            target_title: "Todo el archivo".into(),
            counts,
            media_bytes: 0,
            media_files: 0,
            clears_rolling_backups: true,
        },
    })
}

fn stage_media(
    app: &AppHandle,
    paths: &[String],
) -> CommandResult<(PathBuf, Vec<(PathBuf, PathBuf)>)> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|error| CommandError::from(error.to_string()))?;
    let staging = root.join(format!(
        ".purge-{}-{}",
        std::process::id(),
        chrono::Utc::now().timestamp_millis()
    ));
    let mut moved = Vec::new();
    for (index, path) in paths.iter().enumerate() {
        let source = crate::safe_media_path(app, path).map_err(CommandError::from)?;
        if !source.is_file() {
            continue;
        }
        fs::create_dir_all(&staging).map_err(|error| CommandError::from(error.to_string()))?;
        let target = staging.join(format!("{index}.deleted"));
        if let Err(error) = fs::rename(&source, &target) {
            for (original, staged) in moved.iter().rev() {
                let _ = fs::rename(staged, original);
            }
            return Err(CommandError::from(error.to_string()));
        }
        moved.push((source, target));
    }
    Ok((staging, moved))
}

fn commit_purge(app: &AppHandle, mutation: &PurgeMutation) -> CommandResult<()> {
    let mut connection = crate::connection(app).map_err(CommandError::from)?;
    let transaction = connection
        .transaction()
        .map_err(|error| CommandError::from(error.to_string()))?;
    for (key, value) in &mutation.state {
        let raw =
            serde_json::to_string(value).map_err(|error| CommandError::from(error.to_string()))?;
        transaction.execute("INSERT INTO state(key,value) VALUES(?1,?2) ON CONFLICT(key) DO UPDATE SET value=excluded.value", params![key, raw]).map_err(|error| CommandError::from(error.to_string()))?;
        crate::sync_typed_entry(&transaction, key, value).map_err(CommandError::from)?;
    }
    transaction
        .execute("DELETE FROM backups", [])
        .map_err(|error| CommandError::from(error.to_string()))?;
    let snapshot = crate::encode_snapshot(&transaction).map_err(CommandError::from)?;
    transaction
        .execute(
            "INSERT INTO backups(created_at,snapshot) VALUES(datetime('now'),?1)",
            [snapshot],
        )
        .map_err(|error| CommandError::from(error.to_string()))?;
    transaction
        .commit()
        .map_err(|error| CommandError::from(error.to_string()))?;
    let connection = crate::connection(app).map_err(CommandError::from)?;
    connection
        .execute_batch("PRAGMA wal_checkpoint(TRUNCATE); VACUUM;")
        .map_err(|error| CommandError::from(error.to_string()))?;
    Ok(())
}

fn execute_purge(app: &AppHandle, mut mutation: PurgeMutation) -> CommandResult<PurgeResult> {
    enrich_media(app, &mut mutation);
    let (staging, moved) = stage_media(app, &mutation.media_paths)?;
    if let Err(error) = commit_purge(app, &mutation) {
        for (original, staged) in moved.iter().rev() {
            let _ = fs::rename(staged, original);
        }
        let _ = fs::remove_dir_all(staging);
        return Err(error);
    }
    let _ = fs::remove_dir_all(staging);
    Ok(PurgeResult {
        preview: mutation.preview,
        completed_at: chrono::Utc::now().to_rfc3339(),
    })
}

#[tauri::command]
pub fn preview_activity_purge(
    app: AppHandle,
    library_item_id: String,
) -> CommandResult<PurgePreview> {
    let state = crate::read_state(&crate::connection(&app).map_err(CommandError::from)?)
        .map_err(CommandError::from)?;
    let mut mutation = purge_activity(state, &library_item_id)?;
    enrich_media(&app, &mut mutation);
    Ok(mutation.preview)
}

#[tauri::command]
pub fn preview_attachment_purge(
    app: AppHandle,
    attachment_id: String,
) -> CommandResult<PurgePreview> {
    let state = crate::read_state(&crate::connection(&app).map_err(CommandError::from)?)
        .map_err(CommandError::from)?;
    let mut mutation = purge_attachment(state, &attachment_id)?;
    enrich_media(&app, &mut mutation);
    Ok(mutation.preview)
}

#[tauri::command]
pub fn preview_archive_purge(app: AppHandle) -> CommandResult<PurgePreview> {
    let state = crate::read_state(&crate::connection(&app).map_err(CommandError::from)?)
        .map_err(CommandError::from)?;
    let mut mutation = purge_all_state(state)?;
    enrich_media(&app, &mut mutation);
    Ok(mutation.preview)
}

fn confirms_delete(value: &str) -> bool {
    matches!(value.trim(), "ELIMINAR" | "DELETE")
}

fn confirms_factory_reset(value: &str) -> bool {
    matches!(value.trim(), "ELIMINAR NOITE" | "DELETE NOITE")
}

#[tauri::command]
pub fn purge_archived_activity(
    app: AppHandle,
    library_item_id: String,
    confirmation: String,
) -> CommandResult<PurgeResult> {
    if !confirms_delete(&confirmation) {
        return Err(command_error(
            "confirmation_required",
            "Escribe ELIMINAR para continuar.",
        ));
    }
    let state = crate::read_state(&crate::connection(&app).map_err(CommandError::from)?)
        .map_err(CommandError::from)?;
    execute_purge(&app, purge_activity(state, &library_item_id)?)
}

#[tauri::command]
pub fn purge_archived_attachment(
    app: AppHandle,
    attachment_id: String,
    confirmation: String,
) -> CommandResult<PurgeResult> {
    if !confirms_delete(&confirmation) {
        return Err(command_error(
            "confirmation_required",
            "Escribe ELIMINAR para continuar.",
        ));
    }
    let state = crate::read_state(&crate::connection(&app).map_err(CommandError::from)?)
        .map_err(CommandError::from)?;
    execute_purge(&app, purge_attachment(state, &attachment_id)?)
}

#[tauri::command]
pub fn purge_all_archived(app: AppHandle, confirmation: String) -> CommandResult<PurgeResult> {
    if !confirms_delete(&confirmation) {
        return Err(command_error(
            "confirmation_required",
            "Escribe ELIMINAR para continuar.",
        ));
    }
    let state = crate::read_state(&crate::connection(&app).map_err(CommandError::from)?)
        .map_err(CommandError::from)?;
    execute_purge(&app, purge_all_state(state)?)
}

fn count_files(path: &PathBuf) -> usize {
    if !path.is_dir() {
        return usize::from(path.is_file());
    }
    fs::read_dir(path)
        .ok()
        .into_iter()
        .flatten()
        .filter_map(Result::ok)
        .map(|entry| count_files(&entry.path()))
        .sum()
}

#[tauri::command]
pub async fn factory_reset(
    app: AppHandle,
    vault_runtime: State<'_, VaultRuntime>,
    confirmation: String,
) -> CommandResult<FactoryResetStatus> {
    if !confirms_factory_reset(&confirmation) {
        return Err(command_error(
            "confirmation_required",
            "Escribe ELIMINAR NOITE para continuar.",
        ));
    }
    let mut connection = crate::connection(&app).map_err(CommandError::from)?;
    let transaction = connection
        .transaction()
        .map_err(|error| CommandError::from(error.to_string()))?;
    transaction
        .execute("DELETE FROM state", [])
        .map_err(|error| CommandError::from(error.to_string()))?;
    crate::clear_typed_state(&transaction).map_err(CommandError::from)?;
    transaction
        .execute("DELETE FROM backups", [])
        .map_err(|error| CommandError::from(error.to_string()))?;
    transaction
        .execute("DELETE FROM password_entries", [])
        .map_err(|error| CommandError::from(error.to_string()))?;
    transaction
        .execute("DELETE FROM password_vaults", [])
        .map_err(|error| CommandError::from(error.to_string()))?;
    transaction
        .execute_batch("DELETE FROM sync_conflicts; DELETE FROM sync_conflict_ignores; DELETE FROM sync_invites; DELETE FROM sync_peers; DELETE FROM sync_media; DELETE FROM sync_space;")
        .map_err(|error| CommandError::from(error.to_string()))?;
    transaction
        .execute_batch("DELETE FROM local_game_installations; DELETE FROM local_game_scan_state; DELETE FROM local_game_provider_results;")
        .map_err(|error| CommandError::from(error.to_string()))?;
    transaction
        .commit()
        .map_err(|error| CommandError::from(error.to_string()))?;
    crate::password_vault::lock_all(&vault_runtime);
    let media = crate::media_root(&app).map_err(CommandError::from)?;
    let removed_media_files = count_files(&media);
    if media.exists() {
        fs::remove_dir_all(&media).map_err(|error| CommandError::from(error.to_string()))?;
    }
    crate::cover_search::clear_all_cover_credentials();
    crate::spotify_link::clear_legacy_spotify_credentials();
    let connection = crate::connection(&app).map_err(CommandError::from)?;
    connection
        .execute_batch("PRAGMA wal_checkpoint(TRUNCATE); VACUUM;")
        .map_err(|error| CommandError::from(error.to_string()))?;
    Ok(FactoryResetStatus {
        completed: true,
        removed_media_files,
        removed_credentials: true,
    })
}

/// Runs before Tauri (and therefore the single-instance plugin) is initialized.
/// This keeps the uninstall helper independent from WebView/runtime state and
/// makes an explicit data-removal request deterministic even if Noite is open.
#[cfg(windows)]
pub(crate) fn uninstall_cleanup_early(identifier: &str) -> Result<(), String> {
    stop_other_copies_of_current_executable()?;
    crate::cover_search::clear_all_cover_credentials();
    crate::spotify_link::clear_legacy_spotify_credentials();

    let roaming = roaming_app_data_dir()?;
    let root = roaming.join(identifier);
    if root.exists() {
        let safe_root = validate_uninstall_root(&root, identifier)?;
        fs::remove_dir_all(safe_root).map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[cfg(windows)]
fn roaming_app_data_dir() -> Result<PathBuf, String> {
    use windows::Win32::System::Com::CoTaskMemFree;
    use windows::Win32::UI::Shell::{
        FOLDERID_RoamingAppData, SHGetKnownFolderPath, KF_FLAG_DEFAULT,
    };

    // SAFETY: SHGetKnownFolderPath allocates a null-terminated string with the
    // COM allocator. It is copied immediately and released with CoTaskMemFree.
    unsafe {
        let raw = SHGetKnownFolderPath(&FOLDERID_RoamingAppData, KF_FLAG_DEFAULT, None)
            .map_err(|error| error.to_string())?;
        let result = raw
            .to_string()
            .map(PathBuf::from)
            .map_err(|error| error.to_string());
        CoTaskMemFree(Some(raw.as_ptr().cast()));
        result
    }
}

#[cfg(windows)]
fn stop_other_copies_of_current_executable() -> Result<(), String> {
    use std::mem::size_of;
    use windows_sys::Win32::Foundation::{CloseHandle, INVALID_HANDLE_VALUE, WAIT_OBJECT_0};
    use windows_sys::Win32::System::Diagnostics::ToolHelp::{
        CreateToolhelp32Snapshot, Process32FirstW, Process32NextW, PROCESSENTRY32W,
        TH32CS_SNAPPROCESS,
    };
    use windows_sys::Win32::System::Threading::{
        OpenProcess, QueryFullProcessImageNameW, TerminateProcess, WaitForSingleObject,
        PROCESS_QUERY_LIMITED_INFORMATION, PROCESS_TERMINATE,
    };

    const SYNCHRONIZE_ACCESS: u32 = 0x0010_0000;

    let current_pid = std::process::id();
    let current_exe = fs::canonicalize(std::env::current_exe().map_err(|e| e.to_string())?)
        .map_err(|error| error.to_string())?;
    let current_name = current_exe
        .file_name()
        .and_then(|value| value.to_str())
        .ok_or_else(|| "Noite no pudo validar el nombre de su ejecutable.".to_string())?;
    let mut failures = Vec::new();

    // SAFETY: every valid snapshot/process handle is closed on all paths. The
    // process image is canonicalized and compared with this exact executable
    // before termination; a matching filename alone is never sufficient.
    unsafe {
        let snapshot = CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0);
        if snapshot == INVALID_HANDLE_VALUE {
            return Err("Noite no pudo enumerar sus procesos durante la desinstalación.".into());
        }

        let mut entry: PROCESSENTRY32W = std::mem::zeroed();
        entry.dwSize = size_of::<PROCESSENTRY32W>() as u32;
        let mut has_entry = Process32FirstW(snapshot, &mut entry) != 0;
        while has_entry {
            let pid = entry.th32ProcessID;
            if pid != 0 && pid != current_pid {
                let listed_name = String::from_utf16_lossy(
                    &entry.szExeFile[..entry
                        .szExeFile
                        .iter()
                        .position(|character| *character == 0)
                        .unwrap_or(entry.szExeFile.len())],
                );
                let looks_like_noite = listed_name.eq_ignore_ascii_case(current_name);
                let process = OpenProcess(
                    PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_TERMINATE | SYNCHRONIZE_ACCESS,
                    0,
                    pid,
                );
                if !process.is_null() {
                    let mut buffer = vec![0u16; 32_768];
                    let mut length = buffer.len() as u32;
                    let queried =
                        QueryFullProcessImageNameW(process, 0, buffer.as_mut_ptr(), &mut length)
                            != 0;
                    if queried {
                        let candidate =
                            PathBuf::from(String::from_utf16_lossy(&buffer[..length as usize]));
                        if let Ok(candidate) = fs::canonicalize(candidate) {
                            let same_executable = candidate
                                .to_string_lossy()
                                .eq_ignore_ascii_case(&current_exe.to_string_lossy());
                            if same_executable
                                && (TerminateProcess(process, 0) == 0
                                    || WaitForSingleObject(process, 10_000) != WAIT_OBJECT_0)
                            {
                                failures.push(pid);
                            }
                        }
                    } else if looks_like_noite {
                        failures.push(pid);
                    }
                    let _ = CloseHandle(process);
                } else if looks_like_noite {
                    failures.push(pid);
                }
            }
            has_entry = Process32NextW(snapshot, &mut entry) != 0;
        }
        let _ = CloseHandle(snapshot);
    }

    if failures.is_empty() {
        Ok(())
    } else {
        Err(format!(
            "Noite no pudo cerrar {} instancia(s) antes de limpiar sus datos.",
            failures.len()
        ))
    }
}

fn validate_uninstall_root(root: &Path, identifier: &str) -> Result<PathBuf, String> {
    if identifier.is_empty()
        || root.file_name().and_then(|value| value.to_str()) != Some(identifier)
        || root.parent().is_none()
    {
        return Err("Noite bloqueó una ruta de desinstalación inesperada.".into());
    }
    let metadata = fs::symlink_metadata(root).map_err(|error| error.to_string())?;
    if !metadata.is_dir() || metadata.file_type().is_symlink() {
        return Err("Noite bloqueó una ruta de datos enlazada o inválida.".into());
    }
    let parent = fs::canonicalize(root.parent().expect("validated parent"))
        .map_err(|error| error.to_string())?;
    let canonical = fs::canonicalize(root).map_err(|error| error.to_string())?;
    if canonical.parent() != Some(parent.as_path())
        || canonical.file_name().and_then(|value| value.to_str()) != Some(identifier)
    {
        return Err("Noite bloqueó una ruta de datos fuera de su directorio esperado.".into());
    }
    Ok(canonical)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn destructive_confirmations_accept_both_locales() {
        assert!(confirms_delete("ELIMINAR"));
        assert!(confirms_delete("DELETE"));
        assert!(confirms_factory_reset("ELIMINAR NOITE"));
        assert!(confirms_factory_reset("DELETE NOITE"));
        assert!(!confirms_delete("delete"));
    }

    #[test]
    fn uninstall_cleanup_rejects_broad_or_mismatched_paths() {
        let temp = std::env::temp_dir();
        assert!(validate_uninstall_root(&temp, "com.grutexpa.proyecto-noche").is_err());
        assert!(validate_uninstall_root(
            &temp.join("different-app"),
            "com.grutexpa.proyecto-noche"
        )
        .is_err());
    }

    #[test]
    fn purges_activity_history_but_keeps_saved_music() {
        let mut state = HashMap::new();
        state.insert("libraryItems".into(), serde_json::json!([{ "id":"a", "title":"Juego", "archivedAt":"now", "customCoverPath":"media/covers/a.jpg" }]));
        state.insert(
            "plans".into(),
            serde_json::json!([{ "id":"p", "items":[{ "id":"pi", "libraryItemId":"a" }] }]),
        );
        state.insert(
            "reviews".into(),
            serde_json::json!([{ "id":"r", "planItemId":"pi" }]),
        );
        state.insert("sharedReviews".into(), serde_json::json!([]));
        state.insert(
            "memoryTracks".into(),
            serde_json::json!([{ "id":"t", "planItemId":"pi", "savedMusicItemId":"song" }]),
        );
        state.insert(
            "savedMusicItems".into(),
            serde_json::json!([{ "id":"song", "localStoragePath":"media/music/song.mp3" }]),
        );
        state.insert("attachments".into(), serde_json::json!([]));
        state.insert("sessions".into(), serde_json::json!([]));
        state.insert(
            "settings".into(),
            serde_json::json!({ "sectionAppearances":{} }),
        );
        let purged = purge_activity(state, "a").unwrap();
        assert_eq!(values(&purged.state, "libraryItems").len(), 0);
        assert_eq!(values(&purged.state, "plans").len(), 0);
        assert_eq!(values(&purged.state, "reviews").len(), 0);
        assert_eq!(values(&purged.state, "savedMusicItems").len(), 1);
        assert!(!purged
            .media_paths
            .iter()
            .any(|path| path.ends_with("song.mp3")));
    }
}
