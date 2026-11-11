
from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel, Field
import logging

from app.core.security import validate_identifier
from app.rag.retrieval.rag_service import RAGService


logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/rag",
    tags=["RAG"],
)


# --------------------------------------------------
# Request schema
# --------------------------------------------------

class AskRequest(BaseModel):
    subject_id: str = Field(
        ...,
        min_length=1,
        max_length=128,
        description="ID of the subject whose materials should be searched",
    )

    question: str = Field(
        ...,
        min_length=1,
        max_length=4000,
        description="Student's question",
    )

    document_id: str | None = Field(
        default=None,
        max_length=128,
        description="Optional document ID to restrict the search",
    )

    top_k: int = Field(
        default=5,
        ge=1,
        le=20,
        description="Number of relevant chunks to retrieve",
    )


# --------------------------------------------------
# Dependencies
# --------------------------------------------------

def get_rag_service(request: Request) -> RAGService:
    """
    Retrieve the shared RAGService instance initialized
    during FastAPI startup.
    """

    rag_service = getattr(
        request.app.state,
        "rag_service",
        None,
    )

    if rag_service is None:
        raise HTTPException(
            status_code=503,
            detail="RAG service is not initialized",
        )

    return rag_service


# --------------------------------------------------
# Ask endpoint
# --------------------------------------------------

@router.post("/ask")
def ask_question(
    payload: AskRequest,
    rag_service: RAGService = Depends(get_rag_service),
):
    """
    Ask a question using uploaded subject materials.

    The RAG service retrieves relevant chunks from Qdrant
    and generates a grounded answer using Ollama.
    """

    subject_id = validate_identifier(payload.subject_id, "subject_id")
    question = payload.question.strip()

    if not question:
        raise HTTPException(
            status_code=400,
            detail="question cannot be empty",
        )

    document_id = (
        validate_identifier(payload.document_id, "document_id")
        if payload.document_id is not None
        else None
    )

    try:
        result = rag_service.ask(
            question=question,
            subject_id=subject_id,
            document_id=document_id,
            top_k=payload.top_k,
        )

        return {
            "success": True,
            "subject_id": subject_id,
            "document_id": document_id,
            "answer": result["answer"],
            "sources": result["sources"],
        }

    except ValueError as error:
        raise HTTPException(
            status_code=400,
            detail=str(error),
        )

    except Exception:
        logger.exception("RAG question answering failed")

        raise HTTPException(
            status_code=500,
            detail="Unable to generate an answer at the moment",
        )
