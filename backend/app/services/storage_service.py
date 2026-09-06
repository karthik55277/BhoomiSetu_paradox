"""
BhoomiSetu Object / File Storage Service.

Provides pluggable storage engine abstractions (LocalStorageEngine for zero-dependency test/dev environments
and MinIOStorageEngine for production S3-compatible deployments).

Includes strict security controls:
- Independent UUID storage key generation (eliminates path traversal vulnerabilities)
- Streaming file size limit enforcement (rejects >25MB and 0-byte files)
- Header magic-byte signature validation for PDF, JPEG, PNG, TIFF, and XML/TXT formats.
"""

from __future__ import annotations

import io
import os
import re
import uuid
from abc import ABC, abstractmethod
from datetime import datetime, timezone

from pathlib import Path
from typing import BinaryIO, Tuple

try:
    from app.core.config import settings
except ImportError:
    settings = None


MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024  # 25 MB max limit
CHUNK_SIZE_BYTES = 64 * 1024  # 64 KB streaming chunks

ALLOWED_MIME_EXTENSIONS = {
    "application/pdf": [".pdf"],
    "image/png": [".png"],
    "image/jpeg": [".jpg", ".jpeg"],
    "image/tiff": [".tif", ".tiff"],
    "application/xml": [".xml"],
    "text/plain": [".txt", ".csv"],
}

# Magic-byte header signatures for content validation
MAGIC_SIGNATURES = {
    ".pdf": [b"%PDF-"],
    ".jpg": [b"\xff\xd8\xff"],
    ".jpeg": [b"\xff\xd8\xff"],
    ".png": [b"\x89PNG\r\n\x1a\n"],
    ".tif": [b"II*\x00", b"MM\x00*"],
    ".tiff": [b"II*\x00", b"MM\x00*"],
    ".xml": [b"<?xml", b"<"],
}


def sanitize_filename(filename: str) -> str:
    """Sanitize user-provided display filename for headers/metadata (prevents CRLF / header injection)."""
    clean = os.path.basename(filename)
    clean = re.sub(r"[^\w\.\-\_\s]", "", clean)
    return clean.strip() or "document"


def validate_file_content_signature(header: bytes, filename: str, mime_type: str) -> str:
    """
    Validates file extension, declared MIME type, and binary magic-byte signatures.
    Returns normalized extension.
    Raises ValueError on mismatch or forbidden format.
    """
    ext = Path(filename).suffix.lower()
    if not ext:
        # Fallback extension lookup from MIME
        exts = ALLOWED_MIME_EXTENSIONS.get(mime_type.lower())
        if exts:
            ext = exts[0]
        else:
            raise ValueError(f"File extension missing and unsupported MIME type '{mime_type}'.")

    # Verify extension is permitted
    all_allowed_exts = [e for sublist in ALLOWED_MIME_EXTENSIONS.values() for e in sublist]
    if ext not in all_allowed_exts:
        raise ValueError(f"File format extension '{ext}' is not permitted. Allowed: {all_allowed_exts}")

    # Verify magic bytes if signature exists for format
    if ext in MAGIC_SIGNATURES:
        signatures = MAGIC_SIGNATURES[ext]
        match = any(header.startswith(sig) for sig in signatures)
        if not match:
            raise ValueError(f"File content magic-byte signature mismatch for extension '{ext}'. Declared payload header does not match expected format.")

    return ext


class BaseStorageEngine(ABC):
    """Abstract interface for document object storage."""

    @abstractmethod
    def save_file(self, file_obj: BinaryIO, filename: str, mime_type: str) -> Tuple[str, int, str]:
        """Reads stream, validates size & magic bytes, stores object. Returns (storage_key, file_size_bytes, clean_filename)."""
        pass

    @abstractmethod
    def get_file_stream(self, storage_key: str) -> BinaryIO:
        """Retrieves stream for stored object key."""
        pass

    @abstractmethod
    def delete_file(self, storage_key: str) -> bool:
        """Deletes object by key. Returns True if deleted or missing."""
        pass


class LocalStorageEngine(BaseStorageEngine):
    """Local filesystem storage engine with strict root jail path-traversal prevention."""

    def __init__(self, base_dir: Path | str | None = None):
        if base_dir is None:
            # Default to backend/storage/uploads
            root_project = Path(__file__).resolve().parents[2]
            base_dir = root_project / "storage" / "uploads"
        self.base_dir = Path(base_dir).resolve()
        self.base_dir.mkdir(parents=True, exist_ok=True)

    def _resolve_safe_path(self, storage_key: str) -> Path:
        """Resolves path and enforces root jail confinement."""
        target_path = (self.base_dir / storage_key).resolve()
        try:
            target_path.relative_to(self.base_dir)
        except ValueError as exc:
            raise ValueError(f"Path traversal security violation: key '{storage_key}' escapes storage root.") from exc
        return target_path

    def save_file(self, file_obj: BinaryIO, filename: str, mime_type: str) -> Tuple[str, int, str]:
        clean_name = sanitize_filename(filename)
        now = datetime.now(timezone.utc)

        doc_uuid = uuid.uuid4()
        
        # Read header for magic byte validation
        header = file_obj.read(512)
        if not header:
            raise ValueError("Empty 0-byte files are not accepted.")
        
        ext = validate_file_content_signature(header, clean_name, mime_type)
        
        # Construct independent UUID storage key (never use client path/filename as directory)
        relative_key = f"docs/{now.year}/{now.month:02d}/{doc_uuid}{ext}"
        target_path = self._resolve_safe_path(relative_key)
        target_path.parent.mkdir(parents=True, exist_ok=True)

        total_bytes = len(header)
        if total_bytes > MAX_FILE_SIZE_BYTES:
            raise ValueError(f"File size exceeds maximum allowed limit of 25 MB.")

        with open(target_path, "wb") as out:
            out.write(header)
            while True:
                chunk = file_obj.read(CHUNK_SIZE_BYTES)
                if not chunk:
                    break
                total_bytes += len(chunk)
                if total_bytes > MAX_FILE_SIZE_BYTES:
                    # Clean up partial file on size limit overflow
                    out.close()
                    if target_path.exists():
                        target_path.unlink()
                    raise ValueError("File size exceeds maximum allowed limit of 25 MB during streaming.")
                out.write(chunk)

        return relative_key, total_bytes, clean_name

    def get_file_stream(self, storage_key: str) -> BinaryIO:
        path = self._resolve_safe_path(storage_key)
        if not path.exists() or not path.is_file():
            raise FileNotFoundError(f"Storage object for key '{storage_key}' not found.")
        return open(path, "rb")

    def delete_file(self, storage_key: str) -> bool:
        try:
            path = self._resolve_safe_path(storage_key)
            if path.exists() and path.is_file():
                path.unlink()
            return True
        except Exception:
            return False


class MinIOStorageEngine(BaseStorageEngine):
    """Production S3 / MinIO Object Storage engine."""

    def __init__(self):
        try:
            from minio import Minio
        except ImportError as exc:
            raise RuntimeError("minio library not installed. Install via `pip install minio`.") from exc

        endpoint = os.getenv("MINIO_ENDPOINT", "localhost:9000")
        access_key = os.getenv("MINIO_ACCESS_KEY", "minioadmin")
        secret_key = os.getenv("MINIO_SECRET_KEY", "minioadmin")
        secure = os.getenv("MINIO_SECURE", "false").lower() == "true"
        self.bucket = os.getenv("MINIO_BUCKET", "bhoomisetu-documents")

        self.client = Minio(endpoint, access_key=access_key, secret_key=secret_key, secure=secure)
        # Ensure bucket exists
        try:
            if not self.client.bucket_exists(self.bucket):
                self.client.make_bucket(self.bucket)
        except Exception:
            pass  # Fallback gracefully if connection managed externally

    def save_file(self, file_obj: BinaryIO, filename: str, mime_type: str) -> Tuple[str, int, str]:
        clean_name = sanitize_filename(filename)
        now = datetime.utcnow()
        doc_uuid = uuid.uuid4()

        header = file_obj.read(512)
        if not header:
            raise ValueError("Empty 0-byte files are not accepted.")

        ext = validate_file_content_signature(header, clean_name, mime_type)
        relative_key = f"docs/{now.year}/{now.month:02d}/{doc_uuid}{ext}"

        # Combine header and rest of stream in memory buffer for upload
        body = header + file_obj.read()
        total_bytes = len(body)
        if total_bytes > MAX_FILE_SIZE_BYTES:
            raise ValueError("File size exceeds maximum allowed limit of 25 MB.")

        buf = io.BytesIO(body)
        self.client.put_object(
            bucket_name=self.bucket,
            object_name=relative_key,
            data=buf,
            length=total_bytes,
            content_type=mime_type,
        )
        return relative_key, total_bytes, clean_name

    def get_file_stream(self, storage_key: str) -> BinaryIO:
        try:
            response = self.client.get_object(self.bucket, storage_key)
            return response  # Returns HTTP response stream
        except Exception as exc:
            raise FileNotFoundError(f"Object '{storage_key}' not found in MinIO bucket.") from exc

    def delete_file(self, storage_key: str) -> bool:
        try:
            self.client.remove_object(self.bucket, storage_key)
            return True
        except Exception:
            return False


def get_storage_engine() -> BaseStorageEngine:
    """Factory selecting storage engine based on STORAGE_TYPE environment variable (default: local)."""
    stype = os.getenv("STORAGE_TYPE", "local").lower()
    if stype == "minio":
        try:
            return MinIOStorageEngine()
        except Exception:
            # Fallback to local if MinIO connection fails
            return LocalStorageEngine()
    return LocalStorageEngine()
