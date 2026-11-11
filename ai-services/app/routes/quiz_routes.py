
from fastapi import APIRouter, HTTPException, Request, Depends
from pydantic import BaseModel, Field
from typing import Literal
import logging

from app.core.security import validate_identifier
from app.rag.quiz.quiz_generator import QuizGenerator


logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/rag",
    tags=["Quiz Generation"],
)


# --------------------------------------------------
# Request schema
# --------------------------------------------------

class QuizRequest(BaseModel):

    subject_id: str = Field(
        ...,
        min_length=1,
        max_length=128,
        description="Subject whose learning materials will be used",
    )

    number_of_questions: int = Field(
        default=5,
        ge=1,
        le=20,
        description="Number of questions to generate",
    )

    difficulty: Literal[
        "easy",
        "medium",
        "hard",
        "mixed",
    ] = Field(
        default="mixed",
        description="Desired quiz difficulty",
    )

    document_ids: list[str] | None = Field(
        default=None,
        description="Optional list of document IDs to use",
    )


# --------------------------------------------------
# Dependency
# --------------------------------------------------

def get_quiz_generator(request: Request) -> QuizGenerator:
    """
    Retrieve the shared QuizGenerator instance
    initialized during application startup.
    """

    quiz_generator = getattr(
        request.app.state,
        "quiz_generator",
        None,
    )

    if quiz_generator is None:
        raise HTTPException(
            status_code=503,
            detail="Quiz generation service is not initialized",
        )

    return quiz_generator


# --------------------------------------------------
# Quiz generation endpoint
# --------------------------------------------------

@router.post("/quiz")
def generate_quiz(
    payload: QuizRequest,
    quiz_generator: QuizGenerator = Depends(get_quiz_generator),
):
    """
    Generate an MCQ quiz using subject learning materials.

    Supports:
    - Subject-wide quiz generation
    - Document-specific quiz generation
    - Easy, medium, hard, and mixed difficulty
    """

    subject_id = validate_identifier(payload.subject_id, "subject_id")

    document_ids = payload.document_ids

    if document_ids is not None:
        if not document_ids:
            raise HTTPException(
                status_code=400,
                detail="document_ids cannot be an empty list",
            )

        document_ids = [
            validate_identifier(document_id, "document_id")
            for document_id in document_ids
        ]

        # Remove duplicate IDs while preserving order.
        document_ids = list(dict.fromkeys(document_ids))

    try:

        quiz = quiz_generator.generate_quiz(
            subject_id=subject_id,
            number_of_questions=payload.number_of_questions,
            difficulty=payload.difficulty,
            document_ids=document_ids,
        )

        return {
            "success": True,
            "message": "Quiz generated successfully",
            "quiz": quiz.model_dump(),
        }

    except ValueError as error:

        raise HTTPException(
            status_code=400,
            detail=str(error),
        )

    except Exception:

        logger.exception("Quiz generation failed")

        raise HTTPException(
            status_code=500,
            detail="Unable to generate quiz at the moment",
        )
