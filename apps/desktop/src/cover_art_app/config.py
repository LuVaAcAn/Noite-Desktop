"""Local, persistent storage for API credentials.

Keys are saved to a JSON file in the user's home directory so they
only need to be entered once (via the Settings dialog in the app).
"""
import json
from pathlib import Path

CONFIG_DIR = Path.home() / ".imdb_cover_app"
CONFIG_FILE = CONFIG_DIR / "config.json"

DEFAULTS = {
    "tmdb_api_key": "",
    "igdb_client_id": "",
    "igdb_client_secret": "",
}


def load_config() -> dict:
    if not CONFIG_FILE.exists():
        return dict(DEFAULTS)
    try:
        with open(CONFIG_FILE, "r", encoding="utf-8") as f:
            data = json.load(f)
        cfg = dict(DEFAULTS)
        cfg.update(data)
        return cfg
    except (json.JSONDecodeError, OSError):
        return dict(DEFAULTS)


def save_config(cfg: dict) -> None:
    CONFIG_DIR.mkdir(parents=True, exist_ok=True)
    with open(CONFIG_FILE, "w", encoding="utf-8") as f:
        json.dump(cfg, f, indent=2, ensure_ascii=False)
