
import logging

from fastapi import APIRouter, Depends, HTTPException, Request

from app.core.security import validate_identifier
from app.rag.vector_store.qdrant_store import QdrantStore

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/rag",
    tags=["Document Management"],
)


def get_qdrant_store(request: Request) -> QdrantStore:
    qdrant_store = getattr(request.app.state, "qdrant_store", None)

    if qdrant_store is None:
        raise HTTPException(
            status_code=503,
            detail="Qdrant store is not initialized",
        )

    return qdrant_store


@router.delete("/subjects/{subject_id}/documents/{document_id}")
def delete_document(
    subject_id: str,
    document_id: str,
    qdrant_store: QdrantStore = Depends(get_qdrant_store),
):
    subject_id = validate_identifier(subject_id, "Subject ID")
    document_id = validate_identifier(document_id, "Document ID")

    try:
        deleted_count = qdrant_store.delete_document(
            subject_id=subject_id,
            document_id=document_id,
        )

        return {
            "success": True,
            "message": "Document chunks deleted successfully",
            "subject_id": subject_id,
            "document_id": document_id,
            "deleted_chunks": deleted_count,
        }

    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    except Exception:
        logger.exception("Failed to delete document chunks")
        raise HTTPException(
            status_code=500,
            detail="Failed to delete document",
        )


@router.delete("/subjects/{subject_id}/documents")
def delete_subject_documents(
    subject_id: str,
    qdrant_store: QdrantStore = Depends(get_qdrant_store),
):
    subject_id = validate_identifier(subject_id, "Subject ID")

    try:
        deleted_count = qdrant_store.delete_subject(
            subject_id=subject_id,
        )

        return {
            "success": True,
            "message": "Subject documents deleted successfully",
            "subject_id": subject_id,
            "deleted_chunks": deleted_count,
        }

    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))

    except Exception:
        logger.exception("Failed to delete subject documents")
        raise HTTPException(
            status_code=500,
            detail="Failed to delete subject documents",
        )
