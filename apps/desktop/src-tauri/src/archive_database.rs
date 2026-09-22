use rusqlite::Connection;
use std::path::Path;

/// Writes a consistent, compact snapshot. Never modifies the source database.
pub fn export(source: &Connection, destination: &Path) -> Result<Vec<u8>, String> {
    // VACUUM INTO refuses existing destinations, and includes committed WAL data.
    source
        .execute("VACUUM INTO ?1", [destination.to_string_lossy().as_ref()])
        .map_err(|error| error.to_string())?;
    let result = (|| {
        let copy = Connection::open(destination).map_err(|error| error.to_string())?;
        sanitize(&copy)?;
        drop(copy);
        std::fs::read(destination).map_err(|error| error.to_string())
    })();
    let cleanup = std::fs::remove_file(destination).map_err(|error| error.to_string());
    match (result, cleanup) {
        (Ok(bytes), Ok(())) => Ok(bytes),
        (Err(error), _) | (_, Err(error)) => Err(error),
    }
}

fn sanitize(copy: &Connection) -> Result<(), String> {
    const TABLES: &[&str] = &[
        "state",
        "backups",
        "local_settings",
        "library_items",
        "plans",
        "plan_items",
        "reviews",
        "shared_reviews",
        "memory_tracks",
        "saved_music_items",
        "attachments",
        "sessions",
        "password_vaults",
        "password_entries",
        "profile_credentials",
        "local_game_installations",
        "local_game_scan_state",
        "local_game_provider_results",
    ];
    copy.execute_batch("PRAGMA foreign_keys=OFF; PRAGMA secure_delete=ON;")
        .map_err(|error| error.to_string())?;
    let objects = copy.prepare("SELECT type,name FROM sqlite_master WHERE type IN ('table','view','trigger') AND name NOT LIKE 'sqlite_%'")
        .map_err(|error| error.to_string())?
        .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))
        .map_err(|error| error.to_string())?
        .collect::<Result<Vec<_>,_>>().map_err(|error| error.to_string())?;
    for (kind, name) in objects {
        if kind == "table" && TABLES.contains(&name.as_str()) {
            continue;
        }
        // kind comes from sqlite_master and is restricted by the SELECT above.
        let quoted = name.replace('"', "\"\"");
        copy.execute_batch(&format!(
            "DROP {} IF EXISTS \"{}\";",
            kind.to_uppercase(),
            quoted
        ))
        .map_err(|error| error.to_string())?;
    }
    copy.execute_batch("DELETE FROM backups;
        DELETE FROM state WHERE key NOT IN ('settings','libraryItems','plans','reviews','sharedReviews','memoryTracks','savedMusicItems','attachments','sessions');")
        .map_err(|error| error.to_string())?;
    crate::game_discovery::sanitize_portable_database(copy)?;
    copy.execute_batch("PRAGMA journal_mode=DELETE; VACUUM;")
        .map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_library_and_excludes_auxiliary_data_without_changing_source() {
        let mut source = Connection::open_in_memory().unwrap();
        crate::migrate(&mut source).unwrap();
        source.execute_batch("CREATE TABLE obsolete_data(value TEXT); INSERT INTO obsolete_data VALUES('UNIQUE_AUXILIARY_MARKER');
            INSERT INTO state VALUES('libraryItems','[]'); INSERT INTO state VALUES('obsolete','\"UNIQUE_STATE_MARKER\"');
            INSERT INTO backups(created_at,snapshot) VALUES('now','UNIQUE_BACKUP_MARKER');").unwrap();
        let path = std::env::temp_dir().join(format!(
            "noite-export-test-{}.sqlite3",
            rand::random::<u64>()
        ));
        let bytes = export(&source, &path).unwrap();
        assert!(!path.exists());
        for marker in [
            "UNIQUE_AUXILIARY_MARKER",
            "UNIQUE_STATE_MARKER",
            "UNIQUE_BACKUP_MARKER",
        ] {
            assert!(!bytes
                .windows(marker.len())
                .any(|window| window == marker.as_bytes()));
        }
        assert_eq!(
            source
                .query_row("SELECT count(*) FROM obsolete_data", [], |row| row
                    .get::<_, i64>(0))
                .unwrap(),
            1
        );
        assert_eq!(
            source
                .query_row("SELECT count(*) FROM backups", [], |row| row
                    .get::<_, i64>(0))
                .unwrap(),
            1
        );
        assert_eq!(
            source
                .query_row(
                    "SELECT value FROM state WHERE key='libraryItems'",
                    [],
                    |row| row.get::<_, String>(0)
                )
                .unwrap(),
            "[]"
        );
        assert!(bytes.starts_with(b"SQLite format 3"));
    }
}
