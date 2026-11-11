import logging
import urllib.request
import json
from fastapi import APIRouter, Request, status
from fastapi.responses import JSONResponse

from app.config import settings

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Health & Monitoring"])


@router.get("/health")
@router.get("/health/live")
def liveness_check():
    """
    Basic service liveness probe.
    Returns 200 immediately if the service process is up and accepting HTTP connections.
    """
    return {
        "status": "ok",
        "success": True,
        "service": settings.APP_NAME,
        "version": settings.APP_VERSION,
    }


@router.get("/health/ready")
def readiness_check(request: Request):
    """
    Dependency readiness probe.
    Checks whether:
      1. Embedding model is loaded.
      2. Qdrant vector store is accessible.
      3. Ollama generation service is reachable.
    Returns 200 if all are ready, or 503 if any dependency is unavailable.
    """
    checks = {}
    is_ready = True

    # 1. Check Embedding Service
    try:
        embedding_service = getattr(request.app.state, "embedding_service", None)
        if embedding_service and hasattr(embedding_service, "vector_size"):
            checks["embedding"] = {
                "status": "ok",
                "model": settings.EMBEDDING_MODEL,
                "vector_size": embedding_service.vector_size,
            }
        else:
            checks["embedding"] = {
                "status": "unavailable",
                "error": "Embedding service not initialized",
            }
            is_ready = False
    except Exception as exc:
        checks["embedding"] = {"status": "error", "error": str(exc)}
        is_ready = False

    # 2. Check Qdrant Vector Store
    try:
        qdrant_store = getattr(request.app.state, "qdrant_store", None)
        if qdrant_store and hasattr(qdrant_store, "client"):
            exists = qdrant_store.client.collection_exists(
                collection_name=qdrant_store.COLLECTION_NAME
            )
            checks["qdrant"] = {
                "status": "ok" if exists else "warning",
                "collection": qdrant_store.COLLECTION_NAME,
                "exists": exists,
                "remote": settings.is_qdrant_remote,
            }
        else:
            checks["qdrant"] = {
                "status": "unavailable",
                "error": "Qdrant store not initialized",
            }
            is_ready = False
    except Exception as exc:
        checks["qdrant"] = {"status": "error", "error": str(exc)}
        is_ready = False

    # 3. Check Ollama Service
    try:
        ollama_url = f"{settings.OLLAMA_BASE_URL}/api/version"
        req = urllib.request.Request(ollama_url, method="GET")
        with urllib.request.urlopen(req, timeout=3.0) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            checks["ollama"] = {
                "status": "ok",
                "model": settings.OLLAMA_MODEL,
                "server_version": data.get("version", "unknown"),
            }
    except Exception as exc:
        checks["ollama"] = {
            "status": "unavailable",
            "error": f"Cannot reach Ollama at {settings.OLLAMA_BASE_URL}: {str(exc)}",
        }
        is_ready = False

    response_payload = {
        "status": "ready" if is_ready else "unhealthy",
        "service": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "dependencies": checks,
    }

    status_code = status.HTTP_200_OK if is_ready else status.HTTP_503_SERVICE_UNAVAILABLE
    return JSONResponse(status_code=status_code, content=response_payload)
