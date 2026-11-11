import os
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from collections import Counter

from app.rag.vector_store.qdrant_store import QdrantStore
from app.rag.generation.ollama_client import OllamaClient
from app.rag.quiz.quiz_generator import QuizGenerator


def main():

    qdrant_store = QdrantStore(
        storage_path=r"D:\snapclass\ai-services\qdrant_data",
        vector_size=384,
    )

    ollama_client = OllamaClient(
        model="qwen2.5:3b",
    )

    quiz_generator = QuizGenerator(
        qdrant_store=qdrant_store,
        ollama_client=ollama_client,
    )

    try:
        subject_id = "sample-subject-001"

        # Confirm the subject material being supplied to Qwen.
        chunks = qdrant_store.get_subject_chunks(subject_id)

        document_counts = Counter(
            chunk["document_id"] for chunk in chunks
        )

        print("=" * 60)
        print("SUBJECT MATERIAL")
        print("=" * 60)
        print(f"Subject: {subject_id}")
        print(f"Total chunks: {len(chunks)}")

        for document_id, count in document_counts.items():
            print(f"{document_id}: {count} chunks")

        # Qwen generates the questions.
        print("\nGenerating quiz using Qwen...")
        print("This may take some time on your CPU.")

        quiz = quiz_generator.generate_quiz(
            subject_id=subject_id,
            number_of_questions=5,
            difficulty="mixed",
        )

        # Display the generated quiz.
        print("\n" + "=" * 60)
        print("AI-GENERATED QUIZ")
        print("=" * 60)

        print(f"Title: {quiz.title}")
        print(f"Subject: {quiz.subject_id}")
        print(f"Total questions: {quiz.total_questions}")

        for index, question in enumerate(
            quiz.questions,
            start=1,
        ):
            print(f"\n{'-' * 60}")
            print(f"Question {index}: {question.question}")
            print(f"Difficulty: {question.difficulty}")

            for option_index, option in enumerate(
                question.options,
                start=1,
            ):
                print(f"{option_index}. {option}")

            print(f"Correct answer: {question.correct_answer}")
            print(f"Explanation: {question.explanation}")
            print(f"Source document: {question.source_document}")
            print(f"Source location: {question.source_location}")

        print("\n" + "=" * 60)
        print("QUIZ GENERATION SUCCESSFUL")
        print("=" * 60)

    finally:
        qdrant_store.close()


if __name__ == "__main__":
    main()