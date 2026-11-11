
import logging
import os
import tempfile
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Request, UploadFile
from app.config import settings
from app.core.security import validate_identifier, sanitize_filename
from app.rag.ingestion.ingestion_service import IngestionService
from app.rag.ingestion.document_extractor import DocumentExtractionError

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/rag",
    tags=["Document Ingestion"],
)

MAX_FILE_SIZE = settings.max_upload_size_bytes

ALLOWED_EXTENSIONS = {".pdf", ".docx", ".pptx"}


def get_ingestion_service(request: Request) -> IngestionService:
    service = getattr(request.app.state, "ingestion_service", None)

    if service is None:
        raise HTTPException(
            status_code=503,
            detail="Ingestion service is not initialized",
        )

    return service


@router.post("/ingest")
def ingest_document(
    subject_id: str = Form(...),
    document_id: str = Form(...),
    file: UploadFile = File(...),
    ingestion_service: IngestionService = Depends(get_ingestion_service),
):
    subject_id = validate_identifier(subject_id, "Subject ID")
    document_id = validate_identifier(document_id, "Document ID")
    safe_filename = sanitize_filename(file.filename)

    extension = Path(safe_filename).suffix.lower()

    if extension not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=415,
            detail="Only PDF, DOCX, and PPTX files are supported",
        )

    temp_path = None

    try:
        with tempfile.NamedTemporaryFile(
            suffix=extension,
            delete=False,
        ) as temp_file:
            temp_path = temp_file.name
            total_size = 0

            while True:
                chunk = file.file.read(1024 * 1024)

                if not chunk:
                    break

                total_size += len(chunk)

                if total_size > MAX_FILE_SIZE:
                    raise HTTPException(
                        status_code=413,
                        detail="File size exceeds the 25 MB limit",
                    )

                temp_file.write(chunk)

        if total_size == 0:
            raise HTTPException(
                status_code=400,
                detail="Uploaded file is empty",
            )

        result = ingestion_service.ingest_file(
            file_path=temp_path,
            subject_id=subject_id,
            document_id=document_id,
        )

        return {
            "success": True,
            "message": "Document ingested successfully",
            "data": result,
        }

    except HTTPException:
        raise

    except (ValueError, DocumentExtractionError) as exc:
        raise HTTPException(
            status_code=422,
            detail=str(exc),
        )

    except Exception:
        logger.exception("Document ingestion failed")

        raise HTTPException(
            status_code=500,
            detail="Document ingestion failed",
        )

    finally:
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)

        file.file.close()
