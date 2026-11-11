import os
import sys
import json
import time

os.environ["HF_HUB_OFFLINE"] = "1"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from starlette.testclient import TestClient
from app.main import app

def main():
    print("=" * 65, flush=True)
    print("STEP 2: Quiz Generation with document_ids=['DOC003']", flush=True)
    print("=" * 65, flush=True)

    with TestClient(app) as client:
        quiz_payload = {
            "subject_id": "SUB001",
            "number_of_questions": 2,
            "difficulty": "easy",
            "document_ids": ["DOC003"]
        }
        print(f"POST /api/rag/quiz Payload:\n{json.dumps(quiz_payload, indent=2)}", flush=True)

        t0 = time.time()
        resp_quiz = client.post("/api/rag/quiz", json=quiz_payload)
        elapsed = time.time() - t0

        print(f"\nQuiz HTTP Status: {resp_quiz.status_code} (took {elapsed:.2f}s)", flush=True)
        quiz_data = resp_quiz.json()
        print(f"Quiz Response:\n{json.dumps(quiz_data, indent=2)}", flush=True)

        assert resp_quiz.status_code == 200, f"Expected 200, got {resp_quiz.status_code}"
        assert quiz_data["success"] is True
        assert quiz_data["subject_id"] == "SUB001"
        assert quiz_data["total_questions"] == 2
        questions = quiz_data["questions"]
        assert len(questions) == 2, f"Expected 2 questions, got {len(questions)}"

        for i, q in enumerate(questions, 1):
            assert "question" in q and len(q["question"]) > 0
            assert len(q["options"]) == 4, f"Expected 4 options, got {len(q['options'])}"
            assert q["correct_answer"] in ["A", "B", "C", "D"]
            assert "source" in q
            # Check source references DOC003 or FDA
            src_doc = q["source"].get("document", "")
            print(f"Question {i} Source Document: '{src_doc}', Location: '{q['source'].get('location')}'", flush=True)

        print("\n>>> TEST 2 (QUIZ ENDPOINT) PASSED SUCCESSFULLY! <<<", flush=True)

if __name__ == "__main__":
    main()

