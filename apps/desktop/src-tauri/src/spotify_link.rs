use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{Duration, Instant};
use url::Url;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpotifyLinkError {
    code: String,
    message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    details: Option<Value>,
}

impl SpotifyLinkError {
    fn new(code: &str, message: &str) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
            details: None,
        }
    }

    fn from_reqwest(error: reqwest::Error) -> Self {
        Self {
            code: if error.is_timeout() {
                "timeout"
            } else {
                "offline"
            }
            .into(),
            message: if error.is_timeout() {
                "Spotify tardó demasiado en responder."
            } else {
                "No se pudo consultar Spotify. Comprueba la conexión."
            }
            .into(),
            details: crate::diagnostic_details(error),
        }
    }
}

type SpotifyLinkResult<T> = Result<T, SpotifyLinkError>;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SpotifyLinkPreview {
    normalized_url: String,
    spotify_uri: Option<String>,
    embed_url: String,
    entity_type: String,
    spotify_id: Option<String>,
    title: String,
    thumbnail_url: Option<String>,
    provider_name: String,
    attribution_url: String,
}

#[derive(Debug, Deserialize)]
struct OEmbedResponse {
    title: String,
    thumbnail_url: Option<String>,
    provider_name: Option<String>,
}

const ENTITY_TYPES: [&str; 6] = ["track", "album", "playlist", "artist", "show", "episode"];

fn open_spotify_url(input: &str) -> SpotifyLinkResult<Url> {
    let trimmed = input.trim();
    if let Some(rest) = trimmed.strip_prefix("spotify:") {
        let mut parts = rest.split(':');
        let entity = parts.next().unwrap_or_default();
        let id = parts.next().unwrap_or_default();
        if !ENTITY_TYPES.contains(&entity) || id.is_empty() || parts.next().is_some() {
            return Err(SpotifyLinkError::new(
                "invalid_link",
                "El enlace de Spotify no es compatible.",
            ));
        }
        return Url::parse(&format!("https://open.spotify.com/{entity}/{id}")).map_err(|_| {
            SpotifyLinkError::new("invalid_link", "El enlace de Spotify no es válido.")
        });
    }
    let parsed = Url::parse(trimmed)
        .map_err(|_| SpotifyLinkError::new("invalid_link", "Pega un enlace válido de Spotify."))?;
    if parsed.scheme() != "https"
        || !matches!(parsed.host_str(), Some("open.spotify.com" | "spotify.link"))
    {
        return Err(SpotifyLinkError::new(
            "invalid_link",
            "Solo se admiten enlaces oficiales de Spotify.",
        ));
    }
    Ok(parsed)
}

fn entity_details(url: &Url) -> (String, Option<String>, Option<String>) {
    let parts = url
        .path_segments()
        .map(|segments| segments.collect::<Vec<_>>())
        .unwrap_or_default();
    let offset = usize::from(parts.first().is_some_and(|part| part.starts_with("intl-")));
    let entity = parts.get(offset).copied().unwrap_or("link");
    let id = parts
        .get(offset + 1)
        .map(|value| value.split('?').next().unwrap_or(value))
        .filter(|value| !value.is_empty());
    if ENTITY_TYPES.contains(&entity) {
        (
            entity.into(),
            id.map(str::to_owned),
            id.map(|id| format!("spotify:{entity}:{id}")),
        )
    } else {
        ("link".into(), None, None)
    }
}

async fn resolve_short_link(client: &reqwest::Client, url: Url) -> SpotifyLinkResult<Url> {
    if url.host_str() != Some("spotify.link") {
        return Ok(url);
    }
    let response = client
        .get(url)
        .send()
        .await
        .map_err(SpotifyLinkError::from_reqwest)?;
    let destination = response.url().clone();
    if destination.scheme() != "https" || destination.host_str() != Some("open.spotify.com") {
        return Err(SpotifyLinkError::new(
            "invalid_link",
            "El enlace corto no lleva a Spotify.",
        ));
    }
    Ok(destination)
}

#[tauri::command]
pub async fn spotify_link_preview(input: String) -> SpotifyLinkResult<SpotifyLinkPreview> {
    if input.chars().count() > 2048 {
        return Err(SpotifyLinkError::new(
            "invalid_link",
            "El enlace de Spotify es demasiado largo.",
        ));
    }
    type Cache = HashMap<String, (Instant, SpotifyLinkPreview)>;
    static CACHE: OnceLock<Mutex<Cache>> = OnceLock::new();
    let cache_key = input.trim().to_owned();
    if let Some(value) = CACHE
        .get_or_init(|| Mutex::new(HashMap::new()))
        .lock()
        .ok()
        .and_then(|cache| {
            cache
                .get(&cache_key)
                .filter(|(created, _)| created.elapsed() < Duration::from_secs(1800))
                .map(|(_, value)| value.clone())
        })
    {
        return Ok(value);
    }
    let _permit = crate::provider_gate::acquire("spotify").map_err(|seconds| SpotifyLinkError {
        code: "rate_limited".into(),
        message: format!("Demasiadas solicitudes. Reintenta en {seconds} s."),
        details: Some(serde_json::json!({ "retryAfterSeconds": seconds })),
    })?;
    let initial = open_spotify_url(&input)?;
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .redirect(reqwest::redirect::Policy::limited(4))
        .user_agent("Noite/1.0")
        .build()
        .map_err(SpotifyLinkError::from_reqwest)?;
    let normalized = resolve_short_link(&client, initial).await?;
    let (entity_type, spotify_id, spotify_uri) = entity_details(&normalized);
    if entity_type == "link" {
        return Err(SpotifyLinkError::new(
            "invalid_link",
            "Ese tipo de contenido de Spotify no es compatible.",
        ));
    }
    let response = client
        .get("https://open.spotify.com/oembed")
        .query(&[("url", normalized.as_str())])
        .send()
        .await
        .map_err(SpotifyLinkError::from_reqwest)?;
    if response.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
        let seconds = crate::provider_gate::retry_after(&response);
        crate::provider_gate::cooldown("spotify", seconds);
        return Err(SpotifyLinkError {
            code: "rate_limited".into(),
            message: format!("Spotify limitó las solicitudes. Reintenta en {seconds} s."),
            details: Some(serde_json::json!({ "retryAfterSeconds": seconds })),
        });
    }
    if !response.status().is_success() {
        return Err(SpotifyLinkError {
            code: "preview_unavailable".into(),
            message: "Spotify no pudo generar la vista previa de este enlace.".into(),
            details: crate::diagnostic_details(response.status()),
        });
    }
    let preview: OEmbedResponse = response
        .json()
        .await
        .map_err(SpotifyLinkError::from_reqwest)?;
    let result = SpotifyLinkPreview {
        normalized_url: normalized.to_string(),
        spotify_uri,
        embed_url: format!(
            "https://open.spotify.com/embed/{entity_type}/{}",
            spotify_id.as_deref().unwrap_or_default()
        ),
        entity_type,
        spotify_id,
        title: preview.title,
        thumbnail_url: preview.thumbnail_url,
        provider_name: preview.provider_name.unwrap_or_else(|| "Spotify".into()),
        attribution_url: "https://www.spotify.com/".into(),
    };
    if let Ok(mut cache) = CACHE.get_or_init(|| Mutex::new(HashMap::new())).lock() {
        cache.insert(cache_key, (Instant::now(), result.clone()));
    }
    Ok(result)
}

#[tauri::command]
pub fn clear_legacy_spotify_credentials() {
    for actor in ["me", "partner"] {
        if let Ok(entry) = keyring::Entry::new("com.grutexpa.proyecto-noche.spotify", actor) {
            let _ = entry.delete_credential();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn converts_supported_spotify_uri() {
        let url = open_spotify_url("spotify:track:abc123").unwrap();
        assert_eq!(url.as_str(), "https://open.spotify.com/track/abc123");
    }

    #[test]
    fn rejects_non_spotify_hosts() {
        assert!(open_spotify_url("https://example.com/track/abc").is_err());
    }

    #[test]
    fn reads_internationalized_links() {
        let url = Url::parse("https://open.spotify.com/intl-es/album/abc").unwrap();
        assert_eq!(
            entity_details(&url),
            (
                "album".into(),
                Some("abc".into()),
                Some("spotify:album:abc".into())
            )
        );
    }
}
