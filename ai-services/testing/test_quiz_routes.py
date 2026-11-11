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

def run_tests():
    log("=" * 65)
    log("STARTING QUIZ ROUTES TEST (Test A, Test B, Test C, Test D)")
    log("=" * 65)

    with TestClient(app) as client:
        # ----------------------------------------------------
        # Test D — Invalid question count (fast test first)
        # ----------------------------------------------------
        log("=" * 65)
        log("TEST D: Invalid question count (25 questions, max is 20)")
        log("=" * 65)
        payload_d = {
            "subject_id": "SUB001",
            "number_of_questions": 25,
            "difficulty": "easy",
        }
        resp_d = client.post("/api/rag/quiz", json=payload_d)
        log(f"Status Code: {resp_d.status_code}")
        assert resp_d.status_code == 422, f"Expected 422, got {resp_d.status_code}"
        log(">>> TEST D PASSED! <<<")

        # ----------------------------------------------------
        # Test A — Mixed quiz from all subject materials
        # ----------------------------------------------------
        log("=" * 65)
        log("TEST A: Generate mixed quiz from all subject materials (SUB001, 5 questions)")
        log("=" * 65)
        payload_a = {
            "subject_id": "SUB001",
            "number_of_questions": 5,
            "difficulty": "mixed",
        }
        t0 = time.time()
        resp_a = client.post("/api/rag/quiz", json=payload_a)
        duration_a = round(time.time() - t0, 1)
        log(f"Test A completed in {duration_a}s. Status Code: {resp_a.status_code}")
        data_a = resp_a.json()
        assert resp_a.status_code == 200, f"Expected 200, got {resp_a.status_code}: {resp_a.text}"
        assert data_a["success"] is True
        quiz_a = data_a["quiz"]
        assert quiz_a["subject_id"] == "SUB001"
        assert quiz_a["total_questions"] == 5
        log(f"Title: {quiz_a['title']}")
        for idx, q in enumerate(quiz_a["questions"], start=1):
            log(f"  Q{idx} [{q['difficulty']}]: {q['question']}")
            log(f"     Source: {q['source_document']} ({q['source_location']})")
            assert len(q["options"]) == 4
            assert q["correct_answer"] in q["options"]
        log(">>> TEST A PASSED! <<<")

        # ----------------------------------------------------
        # Test B — Generate an easy quiz
        # ----------------------------------------------------
        log("=" * 65)
        log("TEST B: Generate an easy quiz (SUB001, 5 questions, difficulty=easy)")
        log("=" * 65)
        payload_b = {
            "subject_id": "SUB001",
            "number_of_questions": 5,
            "difficulty": "easy",
        }
        t0 = time.time()
        resp_b = client.post("/api/rag/quiz", json=payload_b)
        duration_b = round(time.time() - t0, 1)
        log(f"Test B completed in {duration_b}s. Status Code: {resp_b.status_code}")
        data_b = resp_b.json()
        assert resp_b.status_code == 200, f"Expected 200, got {resp_b.status_code}: {resp_b.text}"
        assert data_b["success"] is True
        quiz_b = data_b["quiz"]
        assert quiz_b["subject_id"] == "SUB001"
        assert quiz_b["total_questions"] == 5
        log(f"Title: {quiz_b['title']}")
        for idx, q in enumerate(quiz_b["questions"], start=1):
            log(f"  Q{idx} [{q['difficulty']}]: {q['question']}")
            log(f"     Source: {q['source_document']} ({q['source_location']})")
            assert len(q["options"]) == 4
            assert q["correct_answer"] in q["options"]
        log(">>> TEST B PASSED! <<<")

        # ----------------------------------------------------
        # Test C — Generate a quiz from selected documents
        # ----------------------------------------------------
        log("=" * 65)
        log("TEST C: Generate hard quiz from DOC001 and DOC002 (5 questions)")
        log("=" * 65)
        payload_c = {
            "subject_id": "SUB001",
            "number_of_questions": 5,
            "difficulty": "hard",
            "document_ids": [
                "DOC001",
                "DOC002",
            ],
        }
        t0 = time.time()
        resp_c = client.post("/api/rag/quiz", json=payload_c)
        duration_c = round(time.time() - t0, 1)
        log(f"Test C completed in {duration_c}s. Status Code: {resp_c.status_code}")
        data_c = resp_c.json()
        assert resp_c.status_code == 200, f"Expected 200, got {resp_c.status_code}: {resp_c.text}"
        assert data_c["success"] is True
        quiz_c = data_c["quiz"]
        assert quiz_c["subject_id"] == "SUB001"
        assert quiz_c["total_questions"] == 5
        log(f"Title: {quiz_c['title']}")
        for idx, q in enumerate(quiz_c["questions"], start=1):
            log(f"  Q{idx} [{q['difficulty']}]: {q['question']}")
            log(f"     Source: {q['source_document']} ({q['source_location']})")
            assert q["source_document"] in ["DOC001", "DOC002"]
            assert len(q["options"]) == 4
            assert q["correct_answer"] in q["options"]
        log(">>> TEST C PASSED! <<<")

    log("=" * 65)
    log("ALL QUIZ TESTS (A, B, C, D) COMPLETED SUCCESSFULLY!")
    log("=" * 65)

if __name__ == "__main__":
    run_tests()

