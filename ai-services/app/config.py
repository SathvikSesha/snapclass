import os
from pathlib import Path

from dotenv import load_dotenv

# Project root: parent directory of app/
BASE_DIR = Path(__file__).resolve().parent.parent

# Load environment variables from the project root.
load_dotenv(BASE_DIR / ".env")


def get_int(name: str, default: int) -> int:
    value = os.getenv(name)
    if value is None or not str(value).strip():
        return default
    try:
        return int(value)
    except ValueError as exc:
        raise ValueError(f"Environment variable {name} must be an integer") from exc


def get_float(name: str, default: float) -> float:
    value = os.getenv(name)
    if value is None or not str(value).strip():
        return default
    try:
        return float(value)
    except ValueError as exc:
        raise ValueError(f"Environment variable {name} must be a float") from exc


def get_bool(name: str, default: bool) -> bool:
    value = os.getenv(name)
    if value is None or not str(value).strip():
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


class Settings:
    # Application
    APP_NAME: str = os.getenv("APP_NAME", "SnapClass AI Service")
    APP_VERSION: str = os.getenv("APP_VERSION", "1.0.0")
    DEBUG: bool = get_bool("DEBUG", False)
    LOG_LEVEL: str = os.getenv("LOG_LEVEL", "INFO").upper()

    # Server
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = get_int("PORT", 8000)

    # Security
    API_KEY: str = os.getenv("API_KEY", "")
    AUTH_ENABLED: bool = get_bool("AUTH_ENABLED", False)

    # Embeddings
    EMBEDDING_MODEL: str = os.getenv("EMBEDDING_MODEL", "BAAI/bge-small-en-v1.5")

    # Ollama
    OLLAMA_BASE_URL: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
    OLLAMA_MODEL: str = os.getenv("OLLAMA_MODEL", "qwen2.5:3b")
    OLLAMA_TIMEOUT: int = get_int("OLLAMA_TIMEOUT", 300)
    OLLAMA_NUM_CTX: int = get_int("OLLAMA_NUM_CTX", 4096)
    OLLAMA_NUM_PREDICT: int = get_int("OLLAMA_NUM_PREDICT", 1024)
    OLLAMA_NUM_THREAD: int = get_int("OLLAMA_NUM_THREAD", 4)
    OLLAMA_TEMPERATURE: float = get_float("OLLAMA_TEMPERATURE", 0.2)

    # Qdrant
    QDRANT_STORAGE_PATH: str = os.getenv(
        "QDRANT_STORAGE_PATH",
        str(BASE_DIR / "qdrant_data"),
    )
    QDRANT_COLLECTION_NAME: str = os.getenv("QDRANT_COLLECTION_NAME", "snapclass_chunks")
    QDRANT_VECTOR_SIZE: int = get_int("QDRANT_VECTOR_SIZE", 384)
    QDRANT_URL: str | None = os.getenv("QDRANT_URL", None) or None

    # Document ingestion
    MAX_UPLOAD_SIZE_MB: int = get_int("MAX_UPLOAD_SIZE_MB", 25)
    CHUNK_SIZE: int = get_int("CHUNK_SIZE", 1500)
    CHUNK_OVERLAP: int = get_int("CHUNK_OVERLAP", 200)

    # Face Recognition Limits
    FACE_MAX_IMAGE_SIZE_MB: int = get_int("FACE_MAX_IMAGE_SIZE_MB", 5)
    FACE_MAX_IMAGES: int = get_int("FACE_MAX_IMAGES", 4)
    FACE_MAX_IMAGE_PIXELS: int = get_int("FACE_MAX_IMAGE_PIXELS", 25_000_000)

    @property
    def max_upload_size_bytes(self) -> int:
        return self.MAX_UPLOAD_SIZE_MB * 1024 * 1024

    @property
    def face_max_image_size_bytes(self) -> int:
        return self.FACE_MAX_IMAGE_SIZE_MB * 1024 * 1024

    @property
    def is_qdrant_remote(self) -> bool:
        return bool(self.QDRANT_URL and self.QDRANT_URL.strip())


settings = Settings()
