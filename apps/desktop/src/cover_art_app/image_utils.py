"""Helpers to download images and turn them into Tkinter-displayable objects."""
import io
import requests
from PIL import Image, ImageTk


def fetch_image_bytes(url: str, timeout: int = 10) -> bytes:
    resp = requests.get(url, timeout=timeout)
    resp.raise_for_status()
    return resp.content


def bytes_to_photoimage(data: bytes, max_size=None) -> ImageTk.PhotoImage:
    img = Image.open(io.BytesIO(data)).convert("RGB")
    if max_size:
        img.thumbnail(max_size, Image.LANCZOS)
    return ImageTk.PhotoImage(img)


def save_bytes_to_file(data: bytes, path: str) -> None:
    with open(path, "wb") as f:
        f.write(data)
