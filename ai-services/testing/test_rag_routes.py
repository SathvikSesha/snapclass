import os
import sys
import json

os.environ["HF_HUB_OFFLINE"] = "1"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from starlette.testclient import TestClient
from app.main import app

def run_tests():
    print("=" * 65)
    print("STARTING RAG ROUTES TEST (Test A, Test B, Test C, Test D)")
    print("=" * 65)

    with TestClient(app) as client:
        # Pre-requisite: Ingest DOC001 so questions have relevant content
        pdf_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "sample_documents", "pdfdocument.pdf")
        with open(pdf_path, "rb") as f:
            client.post(
                "/api/rag/ingest",
                data={"subject_id": "SUB001", "document_id": "DOC001"},
                files={"file": ("pdfdocument.pdf", f, "application/pdf")},
            )

        # ----------------------------------------------------
        # Health Check
        # ----------------------------------------------------
        health_resp = client.get("/health")
        print(f"\nHealth check status: {health_resp.status_code}")
        print(f"Health response: {health_resp.json()}")
        assert health_resp.status_code == 200

        # ----------------------------------------------------
        # Test A — Ask a question about the subject
        # ----------------------------------------------------
        print("\n" + "=" * 65)
        print("TEST A: Ask a question about the subject (SUB001)")
        print("=" * 65)
        payload_a = {
            "subject_id": "SUB001",
            "question": "Explain the main concepts covered in this document.",
            "top_k": 5,
        }
        print(f"POST /api/rag/ask Payload:\n{json.dumps(payload_a, indent=2)}")
        resp_a = client.post("/api/rag/ask", json=payload_a)
        print(f"Status Code: {resp_a.status_code}")
        data_a = resp_a.json()
        print(f"Response:\n{json.dumps(data_a, indent=2)}")

        assert resp_a.status_code == 200, f"Expected 200, got {resp_a.status_code}"
        assert data_a["success"] is True
        assert data_a["subject_id"] == "SUB001"
        assert data_a["document_id"] is None
        assert isinstance(data_a["answer"], str) and len(data_a["answer"]) > 0
        assert isinstance(data_a["sources"], list) and len(data_a["sources"]) > 0
        for src in data_a["sources"]:
            assert src["document_id"] == "DOC001"

        print(">>> TEST A PASSED! <<<")

        # ----------------------------------------------------
        # Test B — Restrict the question to a particular document
        # ----------------------------------------------------
        print("\n" + "=" * 65)
        print("TEST B: Restrict question to DOC001")
        print("=" * 65)
        payload_b = {
            "subject_id": "SUB001",
            "document_id": "DOC001",
            "question": "What does the document say about the first topic?",
            "top_k": 3,
        }
        print(f"POST /api/rag/ask Payload:\n{json.dumps(payload_b, indent=2)}")
        resp_b = client.post("/api/rag/ask", json=payload_b)
        print(f"Status Code: {resp_b.status_code}")
        data_b = resp_b.json()
        print(f"Response:\n{json.dumps(data_b, indent=2)}")

        assert resp_b.status_code == 200, f"Expected 200, got {resp_b.status_code}"
        assert data_b["success"] is True
        assert data_b["subject_id"] == "SUB001"
        assert data_b["document_id"] == "DOC001"
        assert isinstance(data_b["answer"], str) and len(data_b["answer"]) > 0
        assert isinstance(data_b["sources"], list) and len(data_b["sources"]) > 0
        for src in data_b["sources"]:
            assert src["document_id"] == "DOC001"

        print(">>> TEST B PASSED! <<<")

        # ----------------------------------------------------
        # Test C — Ask about a nonexistent subject
        # ----------------------------------------------------
        print("\n" + "=" * 65)
        print("TEST C: Nonexistent subject (SUB999)")
        print("=" * 65)
        payload_c = {
            "subject_id": "SUB999",
            "question": "Explain the concepts of this subject.",
        }
        print(f"POST /api/rag/ask Payload:\n{json.dumps(payload_c, indent=2)}")
        resp_c = client.post("/api/rag/ask", json=payload_c)
        print(f"Status Code: {resp_c.status_code}")
        data_c = resp_c.json()
        print(f"Response:\n{json.dumps(data_c, indent=2)}")

        assert resp_c.status_code == 200, f"Expected 200, got {resp_c.status_code}"
        assert data_c["success"] is True
        assert data_c["subject_id"] == "SUB999"
        assert data_c["document_id"] is None
        assert data_c["sources"] == []
        assert "couldn't find relevant information" in data_c["answer"].lower() or "not provide enough information" in data_c["answer"].lower()

        print(">>> TEST C PASSED! <<<")

        # ----------------------------------------------------
        # Test D — Invalid request
        # ----------------------------------------------------
        print("\n" + "=" * 65)
        print("TEST D: Invalid request empty fields")
        print("=" * 65)
        payload_d = {
            "subject_id": "",
            "question": "",
        }
        print(f"POST /api/rag/ask Payload:\n{json.dumps(payload_d, indent=2)}")
        resp_d = client.post("/api/rag/ask", json=payload_d)
        print(f"Status Code: {resp_d.status_code}")
        data_d = resp_d.json()
        print(f"Response:\n{json.dumps(data_d, indent=2)}")

        assert resp_d.status_code == 422, f"Expected 422, got {resp_d.status_code}"
        print(">>> TEST D PASSED! <<<")

    print("\n" + "=" * 65)
    print("ALL TESTS (A, B, C, D) COMPLETED SUCCESSFULLY!")
    print("=" * 65)

if __name__ == "__main__":
    run_tests()

