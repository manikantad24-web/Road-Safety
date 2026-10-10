"""Safe image intake.

Security properties:
* size is enforced while reading (never trusts Content-Length alone)
* the content is decoded with Pillow, so the declared MIME type/extension is irrelevant
* only JPEG / PNG / WebP are accepted; decompression-bomb limits are enforced
* the image is re-encoded, which strips EXIF metadata (including GPS) and any appended payloads
* the stored filename is a random UUID - the client filename is never used
* only the opaque filename is ever returned to clients, never a filesystem path
"""
from __future__ import annotations

import io
import re
import uuid
from dataclasses import dataclass
from pathlib import Path
from typing import BinaryIO

from PIL import Image, ImageOps, UnidentifiedImageError

from ..config import Settings
from ..schemas.errors import ApiError

# Keep a reference to Pillow's own opener. Importing `ultralytics` replaces `Image.open` with a wrapper that,
# on a failed decode, may try to auto-install packages. Upload validation must never go through that path.
_pil_open = Image.open

ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP"}
ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
FILENAME_RE = re.compile(r"^[a-f0-9]{32}\.jpg$")


@dataclass
class StoredImage:
    upload_id: str
    filename: str
    image: Image.Image
    width: int
    height: int


def read_limited(fileobj: BinaryIO, max_bytes: int) -> bytes:
    data = fileobj.read(max_bytes + 1)
    if len(data) > max_bytes:
        raise ApiError(413, "file_too_large", f"Image exceeds the {max_bytes // (1024 * 1024)} MB upload limit.")
    if not data:
        raise ApiError(400, "empty_file", "The uploaded file is empty.")
    return data


def validate_and_store(fileobj: BinaryIO, content_type: str | None, settings: Settings) -> StoredImage:
    if content_type and content_type.lower() not in ALLOWED_CONTENT_TYPES:
        raise ApiError(415, "unsupported_media_type", "Only JPEG, PNG or WebP images are accepted.")

    data = read_limited(fileobj, settings.max_upload_bytes)

    Image.MAX_IMAGE_PIXELS = settings.max_image_pixels
    try:
        probe = _pil_open(io.BytesIO(data))
        fmt = probe.format
        probe.verify()  # integrity check; the object is unusable afterwards
        if fmt not in ALLOWED_FORMATS:
            raise ApiError(415, "unsupported_media_type", "Only JPEG, PNG or WebP images are accepted.")
        img = _pil_open(io.BytesIO(data))
        img.load()
    except ApiError:
        raise
    except Exception:  # any decode failure (corrupt, truncated, bomb, unknown format) is a client error
        raise ApiError(400, "invalid_image", "The file could not be read as a valid image.")

    img = ImageOps.exif_transpose(img)
    img = img.convert("RGB")
    longest = max(img.size)
    if longest > settings.max_stored_image_side:
        scale = settings.max_stored_image_side / longest
        img = img.resize((max(1, round(img.width * scale)), max(1, round(img.height * scale))), Image.LANCZOS)

    upload_id = uuid.uuid4().hex
    filename = f"{upload_id}.jpg"
    settings.upload_dir.mkdir(parents=True, exist_ok=True)
    img.save(settings.upload_dir / filename, format="JPEG", quality=90, optimize=True)  # no exif passed
    return StoredImage(upload_id, filename, img, img.width, img.height)


def resolve_image_path(filename: str, settings: Settings) -> Path:
    if not FILENAME_RE.match(filename):
        raise ApiError(404, "not_found", "Image not found.")
    path = (settings.upload_dir / filename).resolve()
    if settings.upload_dir.resolve() not in path.parents or not path.is_file():
        raise ApiError(404, "not_found", "Image not found.")
    return path


def image_url(filename: str | None) -> str | None:
    return f"/api/images/{filename}" if filename else None
