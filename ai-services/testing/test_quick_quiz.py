import os
import sys
import json
import time

os.environ["HF_HUB_OFFLINE"] = "1"
os.environ["PYTHONUNBUFFERED"] = "1"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from starlette.testclient import TestClient
from app.main import app

def log(msg):
    timestamp = time.strftime("%H:%M:%S")
    print(f"[{timestamp}] {msg}", flush=True)

def main():
    log("=" * 65)
    log("TESTING 2 EASY QUESTIONS QUIZ GENERATION")
    log("=" * 65)

    with TestClient(app) as client:
        payload = {
            "subject_id": "SUB001",
            "number_of_questions": 2,
            "difficulty": "easy",
        }
        log(f"Sending POST /api/rag/quiz with payload:\n{json.dumps(payload, indent=2)}")

        start_time = time.time()
        response = client.post("/api/rag/quiz", json=payload)
        elapsed = round(time.time() - start_time, 1)

        log(f"Request completed in {elapsed}s with HTTP {response.status_code}")
        data = response.json()

        print("\n" + "=" * 65, flush=True)
        print("API RESPONSE:", flush=True)
        print("=" * 65, flush=True)
        print(json.dumps(data, indent=2), flush=True)

        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        assert data.get("success") is True
        quiz = data.get("quiz", {})
        assert quiz.get("total_questions") == 2
        assert len(quiz.get("questions", [])) == 2

        print("\n" + "=" * 65, flush=True)
        print("GENERATED 2 MCQs SUMMARY:", flush=True)
        print("=" * 65, flush=True)
        print(f"Quiz Title: {quiz.get('title')}", flush=True)
        print(f"Subject ID: {quiz.get('subject_id')}", flush=True)

        for idx, q in enumerate(quiz.get("questions", []), start=1):
            print(f"\nQuestion {idx} ({q.get('difficulty')}): {q.get('question')}", flush=True)
            for opt_idx, opt in enumerate(q.get("options", []), start=1):
                marker = " [CORRECT]" if opt == q.get("correct_answer") else ""
                print(f"  {opt_idx}. {opt}{marker}", flush=True)
            print(f"Explanation: {q.get('explanation')}", flush=True)
            print(f"Source: {q.get('source_document')} at {q.get('source_location')}", flush=True)

        print("\n" + "=" * 65, flush=True)
        print(">>> 2-QUESTION QUIZ GENERATED AND VERIFIED SUCCESSFULLY! <<<", flush=True)
        print("=" * 65, flush=True)

if __name__ == "__main__":
    main()

