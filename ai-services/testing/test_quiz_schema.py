import os
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.rag.quiz.quiz_schema import QuizQuestion, QuizResponse


def main():

    question = QuizQuestion(
        question="What is NumPy primarily used for?",
        options=[
            "Numerical computing",
            "Web development",
            "Database administration",
            "Operating system management",
        ],
        correct_answer="Numerical computing",
        explanation="NumPy provides tools for numerical computing.",
        difficulty="easy",
        source_document="pptdocument",
        source_location="slide 2",
    )

    quiz = QuizResponse(
        title="NumPy Basics",
        subject_id="sample-subject-001",
        total_questions=1,
        questions=[question],
    )

    print("VALID QUIZ:")
    print(quiz.model_dump_json(indent=2))

    print("\nTESTING INVALID ANSWER:")

    try:
        QuizQuestion(
            question="What is NumPy?",
            options=["A", "B", "C", "D"],
            correct_answer="Python",
            explanation="Test explanation",
            difficulty="easy",
            source_document="pptdocument",
            source_location="slide 2",
        )

    except Exception as error:
        print("Invalid question correctly rejected:")
        print(error)


if __name__ == "__main__":
    main()
