"""Search clients for cover art.

IMDb itself does not offer a free public search/poster API, so this
app uses two well-known, free-tier data sources instead:

- TMDb (The Movie Database) for movies and TV series/shows.
- IGDB (Internet Game Database, run by Twitch) for video games.

Both return high-quality cover/poster art and are the same sources
many IMDb-alternative apps use under the hood.
"""
import time
import requests

TMDB_BASE = "https://api.themoviedb.org/3"
TMDB_IMG_BASE = "https://image.tmdb.org/t/p"

IGDB_TOKEN_URL = "https://id.twitch.tv/oauth2/token"
IGDB_API_BASE = "https://api.igdb.com/v4"

# Simple in-memory cache so we don't re-authenticate on every search.
_igdb_token_cache = {"token": None, "expires_at": 0}


class ApiError(Exception):
    """Raised for user-facing API/config problems (bad key, no key, etc.)."""


def tmdb_search(query: str, api_key: str, media_type: str = "movie") -> list:
    """media_type must be 'movie' or 'tv'. Returns normalized result dicts."""
    if not api_key:
        raise ApiError("Falta la API key de TMDb. Configúrala en Ajustes.")

    endpoint = f"{TMDB_BASE}/search/{media_type}"
    params = {
        "api_key": api_key,
        "query": query,
        "include_adult": "false",
        "language": "es-ES",
    }
    resp = requests.get(endpoint, params=params, timeout=10)
    if resp.status_code == 401:
        raise ApiError("API key de TMDb inválida.")
    resp.raise_for_status()
    data = resp.json()

    results = []
    for item in data.get("results", []):
        title = item.get("title") or item.get("name") or "Sin título"
        date = item.get("release_date") or item.get("first_air_date") or ""
        year = date[:4] if date else "?"
        poster_path = item.get("poster_path")

        results.append({
            "source": "tmdb",
            "media_type": "Película" if media_type == "movie" else "Serie/TV",
            "title": title,
            "year": year,
            "overview": item.get("overview") or "Sin descripción disponible.",
            "thumb_url": f"{TMDB_IMG_BASE}/w185{poster_path}" if poster_path else None,
            "full_url": f"{TMDB_IMG_BASE}/w780{poster_path}" if poster_path else None,
        })
    return results


def _get_igdb_token(client_id: str, client_secret: str) -> str:
    now = time.time()
    if _igdb_token_cache["token"] and _igdb_token_cache["expires_at"] > now + 30:
        return _igdb_token_cache["token"]

    params = {
        "client_id": client_id,
        "client_secret": client_secret,
        "grant_type": "client_credentials",
    }
    resp = requests.post(IGDB_TOKEN_URL, params=params, timeout=10)
    if resp.status_code != 200:
        raise ApiError("No se pudo autenticar con IGDB. Revisa el Client ID/Secret.")
    data = resp.json()
    token = data["access_token"]
    _igdb_token_cache["token"] = token
    _igdb_token_cache["expires_at"] = now + data.get("expires_in", 3600)
    return token


def igdb_search(query: str, client_id: str, client_secret: str) -> list:
    if not client_id or not client_secret:
        raise ApiError("Faltan credenciales de IGDB. Configúralas en Ajustes.")

    token = _get_igdb_token(client_id, client_secret)
    headers = {
        "Client-ID": client_id,
        "Authorization": f"Bearer {token}",
    }
    # IGDB uses its own Apicalypse query language, sent as the request body.
    safe_query = query.replace('"', '\\"')
    body = (
        f'search "{safe_query}"; '
        "fields name, cover.url, first_release_date, summary; "
        "limit 20;"
    )
    resp = requests.post(f"{IGDB_API_BASE}/games", headers=headers, data=body, timeout=10)
    if resp.status_code == 401:
        _igdb_token_cache["token"] = None
        raise ApiError("Token de IGDB expirado o inválido. Intenta de nuevo.")
    resp.raise_for_status()
    data = resp.json()

    results = []
    for item in data:
        cover = item.get("cover") or {}
        cover_url = cover.get("url")
        thumb_url = full_url = None
        if cover_url:
            base = cover_url.replace("t_thumb", "t_cover_big")
            if base.startswith("//"):
                base = "https:" + base
            thumb_url = base
            full_url = base.replace("t_cover_big", "t_1080p")

        ts = item.get("first_release_date")
        year = time.strftime("%Y", time.gmtime(ts)) if ts else "?"

        results.append({
            "source": "igdb",
            "media_type": "Videojuego",
            "title": item.get("name", "Sin título"),
            "year": year,
            "overview": item.get("summary") or "Sin descripción disponible.",
            "thumb_url": thumb_url,
            "full_url": full_url,
        })
    return results
