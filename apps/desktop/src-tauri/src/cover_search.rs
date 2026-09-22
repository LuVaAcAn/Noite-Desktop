use serde::Serialize;
use serde_json::Value;
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};

const SERVICE: &str = "com.grutexpa.proyecto-noche.cover";

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CoverCredentialStatus {
    tmdb_configured: bool,
    igdb_configured: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CoverSearchResult {
    external_id: String,
    external_provider: String,
    title: String,
    year: Option<String>,
    cover_url: Option<String>,
    overview: Option<String>,
    provider_label: String,
    source_url: String,
    attribution: String,
}

#[derive(Serialize)]
pub struct CoverError {
    code: String,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    retry_after_seconds: Option<u64>,
}

type Result<T> = std::result::Result<T, CoverError>;

fn error(code: &str, message: impl Into<String>) -> CoverError {
    CoverError {
        code: code.into(),
        message: message.into(),
        retry_after_seconds: None,
    }
}

fn rate_error(seconds: u64) -> CoverError {
    CoverError {
        code: "rate_limited".into(),
        message: format!("Demasiadas solicitudes. Reintenta en {seconds} s."),
        retry_after_seconds: Some(seconds),
    }
}

fn credential(name: &str) -> std::result::Result<String, keyring::Error> {
    keyring::Entry::new(SERVICE, name)?.get_password()
}

fn configured(name: &str) -> bool {
    credential(name).is_ok_and(|value| !value.trim().is_empty())
}

#[tauri::command]
pub fn cover_credential_status() -> CoverCredentialStatus {
    CoverCredentialStatus {
        tmdb_configured: configured("tmdb_api_key"),
        igdb_configured: configured("igdb_client_id") && configured("igdb_client_secret"),
    }
}

#[tauri::command]
pub fn save_cover_credentials(
    tmdb_api_key: Option<String>,
    igdb_client_id: Option<String>,
    igdb_client_secret: Option<String>,
) -> Result<CoverCredentialStatus> {
    for (name, value) in [
        ("tmdb_api_key", tmdb_api_key),
        ("igdb_client_id", igdb_client_id),
        ("igdb_client_secret", igdb_client_secret),
    ] {
        if let Some(value) = value {
            if value.trim().is_empty() {
                continue;
            }
            keyring::Entry::new(SERVICE, name)
                .and_then(|entry| entry.set_password(value.trim()))
                .map_err(|cause| {
                    error(
                        "credential_store",
                        format!("No se pudo guardar la credencial: {cause}"),
                    )
                })?;
        }
    }
    Ok(cover_credential_status())
}

#[tauri::command]
pub fn clear_cover_credentials(provider: String) -> Result<CoverCredentialStatus> {
    let names: &[&str] = match provider.as_str() {
        "tmdb" => &["tmdb_api_key"],
        "igdb" => &["igdb_client_id", "igdb_client_secret"],
        _ => {
            return Err(error(
                "invalid_provider",
                "Proveedor de portadas no válido.",
            ))
        }
    };
    for name in names {
        if let Ok(entry) = keyring::Entry::new(SERVICE, name) {
            let _ = entry.delete_credential();
        }
    }
    Ok(cover_credential_status())
}

pub(crate) fn clear_all_cover_credentials() {
    for name in ["tmdb_api_key", "igdb_client_id", "igdb_client_secret"] {
        if let Ok(entry) = keyring::Entry::new(SERVICE, name) {
            let _ = entry.delete_credential();
        }
    }
}

pub(crate) fn export_shared_credentials() -> HashMap<String, String> {
    ["tmdb_api_key", "igdb_client_id", "igdb_client_secret"]
        .into_iter()
        .filter_map(|name| {
            credential(name)
                .ok()
                .filter(|value| !value.trim().is_empty())
                .map(|value| (name.to_string(), value))
        })
        .collect()
}

pub(crate) fn import_shared_credentials(
    values: HashMap<String, String>,
) -> std::result::Result<(), String> {
    for name in ["tmdb_api_key", "igdb_client_id", "igdb_client_secret"] {
        if let Some(value) = values.get(name).filter(|value| !value.trim().is_empty()) {
            keyring::Entry::new(SERVICE, name)
                .and_then(|entry| entry.set_password(value))
                .map_err(|cause| cause.to_string())?;
        }
    }
    Ok(())
}

fn client() -> Result<reqwest::Client> {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .map_err(|cause| {
            error(
                "network",
                format!("No se pudo preparar la conexión: {cause}"),
            )
        })
}

async fn search_tmdb(query: &str, kind: &str) -> Result<Vec<CoverSearchResult>> {
    let key = credential("tmdb_api_key")
        .map_err(|_| error("missing_tmdb", "Configura tu API Key de TMDB en Ajustes."))?;
    let media_type = if kind == "movie" { "movie" } else { "tv" };
    let response = client()?
        .get(format!("https://api.themoviedb.org/3/search/{media_type}"))
        .query(&[
            ("api_key", key.as_str()),
            ("query", query),
            ("include_adult", "false"),
            ("language", "es-ES"),
        ])
        .send()
        .await
        .map_err(|cause| {
            error(
                if cause.is_timeout() {
                    "timeout"
                } else {
                    "offline"
                },
                "No se pudo conectar con TMDB.",
            )
        })?;
    if response.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
        let seconds = crate::provider_gate::retry_after(&response);
        crate::provider_gate::cooldown("tmdb", seconds);
        return Err(rate_error(seconds));
    }
    if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err(error("invalid_tmdb", "La API Key de TMDB no es válida."));
    }
    if !response.status().is_success() {
        return Err(error(
            "tmdb_unavailable",
            format!("TMDB respondió {}.", response.status()),
        ));
    }
    let data: Value = response
        .json()
        .await
        .map_err(|_| error("invalid_response", "TMDB devolvió una respuesta inválida."))?;
    Ok(data["results"]
        .as_array()
        .into_iter()
        .flatten()
        .take(12)
        .map(|item| {
            let id = item["id"]
                .as_i64()
                .map(|value| value.to_string())
                .unwrap_or_default();
            let title = item["title"]
                .as_str()
                .or_else(|| item["name"].as_str())
                .unwrap_or("Sin título")
                .to_owned();
            let date = item["release_date"]
                .as_str()
                .or_else(|| item["first_air_date"].as_str())
                .unwrap_or_default();
            CoverSearchResult {
                external_id: id.clone(),
                external_provider: "tmdb".into(),
                title,
                year: date
                    .get(..4)
                    .filter(|value| !value.is_empty())
                    .map(str::to_owned),
                cover_url: item["poster_path"]
                    .as_str()
                    .map(|path| format!("https://image.tmdb.org/t/p/w780{path}")),
                overview: item["overview"]
                    .as_str()
                    .filter(|value| !value.is_empty())
                    .map(str::to_owned),
                provider_label: "TMDB".into(),
                source_url: format!("https://www.themoviedb.org/{media_type}/{id}"),
                attribution: "Datos e imágenes de TMDB.".into(),
            }
        })
        .collect())
}

#[derive(Clone)]
struct IgdbToken {
    value: String,
    expires_at: Instant,
}
static IGDB_TOKEN: OnceLock<Mutex<Option<IgdbToken>>> = OnceLock::new();

async fn igdb_token(client: &reqwest::Client, client_id: &str, secret: &str) -> Result<String> {
    let cache = IGDB_TOKEN.get_or_init(|| Mutex::new(None));
    if let Some(token) = cache
        .lock()
        .ok()
        .and_then(|guard| guard.clone())
        .filter(|token| token.expires_at > Instant::now() + Duration::from_secs(30))
    {
        return Ok(token.value);
    }
    let response = client
        .post("https://id.twitch.tv/oauth2/token")
        .query(&[
            ("client_id", client_id),
            ("client_secret", secret),
            ("grant_type", "client_credentials"),
        ])
        .send()
        .await
        .map_err(|_| error("offline", "No se pudo autenticar con IGDB."))?;
    if !response.status().is_success() {
        return Err(error(
            "invalid_igdb",
            "El Client ID o Client Secret de IGDB no es válido.",
        ));
    }
    let data: Value = response
        .json()
        .await
        .map_err(|_| error("invalid_response", "IGDB devolvió una respuesta inválida."))?;
    let value = data["access_token"]
        .as_str()
        .ok_or_else(|| error("invalid_response", "IGDB no devolvió un token."))?
        .to_owned();
    let expires = data["expires_in"]
        .as_u64()
        .unwrap_or(3600)
        .saturating_sub(60);
    if let Ok(mut guard) = cache.lock() {
        *guard = Some(IgdbToken {
            value: value.clone(),
            expires_at: Instant::now() + Duration::from_secs(expires),
        });
    }
    Ok(value)
}

async fn search_igdb(query: &str) -> Result<Vec<CoverSearchResult>> {
    let client_id = credential("igdb_client_id").map_err(|_| {
        error(
            "missing_igdb",
            "Configura las credenciales de IGDB en Ajustes.",
        )
    })?;
    let secret = credential("igdb_client_secret").map_err(|_| {
        error(
            "missing_igdb",
            "Configura las credenciales de IGDB en Ajustes.",
        )
    })?;
    let client = client()?;
    let token = igdb_token(&client, &client_id, &secret).await?;
    let safe_query = query.replace('\\', "\\\\").replace('"', "\\\"");
    let body = format!("search \"{safe_query}\"; fields name,slug,cover.image_id,first_release_date,summary; limit 12;");
    let response = client
        .post("https://api.igdb.com/v4/games")
        .header("Client-ID", &client_id)
        .bearer_auth(token)
        .body(body)
        .send()
        .await
        .map_err(|cause| {
            error(
                if cause.is_timeout() {
                    "timeout"
                } else {
                    "offline"
                },
                "No se pudo conectar con IGDB.",
            )
        })?;
    if response.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
        let seconds = crate::provider_gate::retry_after(&response);
        crate::provider_gate::cooldown("igdb", seconds);
        return Err(rate_error(seconds));
    }
    if response.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err(error(
            "invalid_igdb",
            "Las credenciales de IGDB no son válidas.",
        ));
    }
    if !response.status().is_success() {
        return Err(error(
            "igdb_unavailable",
            format!("IGDB respondió {}.", response.status()),
        ));
    }
    let data: Vec<Value> = response
        .json()
        .await
        .map_err(|_| error("invalid_response", "IGDB devolvió una respuesta inválida."))?;
    Ok(data
        .into_iter()
        .map(|item| {
            let id = item["id"]
                .as_i64()
                .map(|value| value.to_string())
                .unwrap_or_default();
            let slug = item["slug"].as_str().unwrap_or_default();
            let image_id = item["cover"]["image_id"].as_str();
            CoverSearchResult {
                external_id: id,
                external_provider: "igdb".into(),
                title: item["name"].as_str().unwrap_or("Sin título").into(),
                year: item["first_release_date"]
                    .as_i64()
                    .and_then(|seconds| chrono::DateTime::from_timestamp(seconds, 0))
                    .map(|date| date.format("%Y").to_string()),
                cover_url: image_id.map(|value| {
                    format!("https://images.igdb.com/igdb/image/upload/t_1080p/{value}.jpg")
                }),
                overview: item["summary"]
                    .as_str()
                    .filter(|value| !value.is_empty())
                    .map(str::to_owned),
                provider_label: "IGDB".into(),
                source_url: if slug.is_empty() {
                    "https://www.igdb.com/".into()
                } else {
                    format!("https://www.igdb.com/games/{slug}")
                },
                attribution: "Datos e imágenes de IGDB.".into(),
            }
        })
        .collect())
}

#[tauri::command]
pub async fn search_cover(query: String, kind: String) -> Result<Vec<CoverSearchResult>> {
    let query = query.trim();
    if query.is_empty() || query.chars().count() > 160 {
        return Err(error(
            "invalid_query",
            "Escribe un título de hasta 160 caracteres.",
        ));
    }
    type Cache = HashMap<String, (Instant, Vec<CoverSearchResult>)>;
    static CACHE: OnceLock<Mutex<Cache>> = OnceLock::new();
    let cache_key = format!("{}:{}", kind, query.to_lowercase());
    if let Some(value) = CACHE
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
        .ok()
        .and_then(|cache| {
            cache
                .get(&cache_key)
                .filter(|(created, _)| created.elapsed() < Duration::from_secs(600))
                .map(|(_, value)| value.clone())
        })
    {
        return Ok(value);
    }
    let provider = match kind.as_str() {
        "movie" | "series" | "season_or_episode" => "tmdb",
        "video_game" | "browser_game" => "igdb",
        _ => {
            return Err(error(
                "unsupported_kind",
                "Este tipo de actividad no admite búsqueda automática.",
            ))
        }
    };
    let _permit = crate::provider_gate::acquire(provider).map_err(rate_error)?;
    let result = match kind.as_str() {
        "movie" | "series" | "season_or_episode" => search_tmdb(query, &kind).await,
        "video_game" | "browser_game" => search_igdb(query).await,
        _ => Err(error(
            "unsupported_kind",
            "Este tipo de actividad no admite búsqueda automática.",
        )),
    }?;
    if let Ok(mut cache) = CACHE.get_or_init(|| Mutex::new(HashMap::new())).lock() {
        cache.insert(cache_key, (Instant::now(), result.clone()));
    }
    Ok(result)
}

#[tauri::command]
pub async fn test_cover_credentials(provider: String) -> Result<()> {
    let provider_key = match provider.as_str() {
        "tmdb" => "tmdb",
        "igdb" => "igdb",
        _ => {
            return Err(error(
                "invalid_provider",
                "Proveedor de portadas no válido.",
            ))
        }
    };
    let _permit = crate::provider_gate::acquire(provider_key).map_err(rate_error)?;
    match provider.as_str() {
        "tmdb" => {
            search_tmdb("Noite", "movie").await?;
        }
        "igdb" => {
            search_igdb("Noite").await?;
        }
        _ => {
            return Err(error(
                "invalid_provider",
                "Proveedor de portadas no válido.",
            ))
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn rejects_empty_queries_before_network() {
        let result = tauri::async_runtime::block_on(search_cover("   ".into(), "movie".into()));
        assert!(matches!(result, Err(CoverError { code, .. }) if code == "invalid_query"));
    }
}
