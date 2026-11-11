import re
from pathlib import Path
from fastapi import Header, HTTPException, Security, status
from fastapi.security import APIKeyHeader, HTTPBearer, HTTPAuthorizationCredentials

from app.config import settings

# Identifier pattern: letters, numbers, hyphens, underscores, dots (1-128 chars)
IDENTIFIER_REGEX = re.compile(r"^[a-zA-Z0-9_\-\.]{1,128}$")

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)
bearer_auth = HTTPBearer(auto_error=False)


def validate_identifier(value: str, field_name: str = "ID") -> str:
    """
    Validate that an identifier (subject_id or document_id) is non-empty,
    within length limits, and does not contain path traversal characters.
    """
    if not value or not isinstance(value, str):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{field_name} cannot be empty",
        )

    clean_value = value.strip()
    if not clean_value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{field_name} cannot be empty",
        )

    if ".." in clean_value or "/" in clean_value or "\\" in clean_value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{field_name} contains invalid path traversal characters",
        )

    if not IDENTIFIER_REGEX.match(clean_value):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"{field_name} contains invalid characters. Use letters, numbers, hyphens, underscores, and dots only.",
        )

    return clean_value


def sanitize_filename(filename: str) -> str:
    """
    Strip directory components and return only the safe base filename.
    """
    if not filename:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Filename is required",
        )
    safe_name = Path(filename).name.strip()
    if not safe_name or safe_name in {".", ".."}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid filename",
        )
    return safe_name


def verify_api_key(
    x_api_key: str | None = Security(api_key_header),
    bearer: HTTPAuthorizationCredentials | None = Security(bearer_auth),
) -> bool:
    """
    Verify API Key if authentication is enabled.
    Checks either 'X-API-Key' header or 'Authorization: Bearer <key>'.
    """
    if not settings.AUTH_ENABLED:
        return True

    expected_key = settings.API_KEY.strip()
    if not expected_key:
        return True

    provided_key = x_api_key or (bearer.credentials if bearer else None)

    if not provided_key or provided_key != expected_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API key",
            headers={"WWW-Authenticate": "Bearer"},
        )

    return True

