
from typing import Literal

from pydantic import BaseModel, Field, model_validator


class QuizQuestion(BaseModel):
    """
    Represents one multiple-choice quiz question.
    """

    question: str = Field(
        min_length=5,
    )

    options: list[str] = Field(
        min_length=4,
        max_length=4,
    )

    correct_answer: str = Field(
        min_length=1,
    )

    explanation: str = Field(
        min_length=1,
    )

    difficulty: Literal["easy", "medium", "hard"]

    source_document: str = Field(
        min_length=1,
    )

    source_location: str = Field(
        min_length=1,
    )

    @model_validator(mode="after")
    def validate_question(self):
        # Question must not be empty or whitespace-only.
        if not self.question.strip():
            raise ValueError("Question cannot be empty")

        # Ensure all four options are distinct.
        normalized_options = [
            option.strip().casefold()
            for option in self.options
        ]

        if any(not option for option in normalized_options):
            raise ValueError("Options cannot be empty")

        if len(set(normalized_options)) != 4:
            raise ValueError("All four options must be distinct")

        # Correct answer must match one of the options.
        if self.correct_answer not in self.options:
            raise ValueError(
                "Correct answer must be one of the four options"
            )

        if not self.explanation.strip():
            raise ValueError("Explanation cannot be empty")

        if not self.source_document.strip():
            raise ValueError("Source document cannot be empty")

        if not self.source_location.strip():
            raise ValueError("Source location cannot be empty")

        return self


class QuizResponse(BaseModel):
    """
    Represents the complete generated quiz.
    """

    title: str = Field(
        min_length=1,
    )

    subject_id: str = Field(
        min_length=1,
    )

    total_questions: int = Field(
        ge=1,
    )

    questions: list[QuizQuestion] = Field(
        min_length=1,
    )

    @model_validator(mode="after")
    def validate_quiz(self):

        if not self.title.strip():
            raise ValueError("Quiz title cannot be empty")

        if not self.subject_id.strip():
            raise ValueError("Subject ID cannot be empty")

        if self.total_questions != len(self.questions):
            raise ValueError(
                "total_questions must match the number of questions"
            )

        return self
