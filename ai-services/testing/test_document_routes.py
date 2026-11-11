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
    log("STARTING DOCUMENT DELETION ROUTE TESTS (A, B, C, D)")
    log("=" * 65)

    with TestClient(app) as client:
        # Pre-requisite: ensure DOC001 exists with 2 chunks
        pdf_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "sample_documents", "pdfdocument.pdf")
        with open(pdf_path, "rb") as f:
            client.post(
                "/api/rag/ingest",
                data={"subject_id": "SUB001", "document_id": "DOC001"},
                files={"file": ("pdfdocument.pdf", f, "application/pdf")},
            )

        # ----------------------------------------------------
        # Test A — Delete one document (DOC001)
        # ----------------------------------------------------
        log("=" * 65)
        log("TEST A: Delete one document (DOC001 from SUB001)")
        log("=" * 65)
        log("DELETE /api/rag/subjects/SUB001/documents/DOC001")
        resp_a = client.delete("/api/rag/subjects/SUB001/documents/DOC001")
        log(f"Status Code: {resp_a.status_code}")
        data_a = resp_a.json()
        print(json.dumps(data_a, indent=2), flush=True)

        assert resp_a.status_code == 200, f"Expected 200, got {resp_a.status_code}"
        assert data_a["success"] is True
        assert data_a["subject_id"] == "SUB001"
        assert data_a["document_id"] == "DOC001"
        assert data_a["deleted_chunks"] == 2
        log(">>> TEST A PASSED! <<<")

        # ----------------------------------------------------
        # Test B — Verify document deletion
        # ----------------------------------------------------
        log("\n" + "=" * 65)
        log("TEST B: Verify document deletion via /api/rag/ask")
        log("=" * 65)
        payload_b = {
            "subject_id": "SUB001",
            "document_id": "DOC001",
            "question": "Explain the main concepts in this document.",
        }
        log(f"POST /api/rag/ask with payload:\n{json.dumps(payload_b, indent=2)}")
        resp_b = client.post("/api/rag/ask", json=payload_b)
        log(f"Status Code: {resp_b.status_code}")
        data_b = resp_b.json()
        print(json.dumps(data_b, indent=2), flush=True)

        assert resp_b.status_code == 200, f"Expected 200, got {resp_b.status_code}"
        assert data_b["success"] is True
        assert data_b["subject_id"] == "SUB001"
        assert data_b["document_id"] == "DOC001"
        assert data_b["sources"] == [], f"Expected empty sources, got {data_b['sources']}"
        assert "couldn't find relevant information" in data_b["answer"].lower()
        log(">>> TEST B PASSED! <<<")

        # ----------------------------------------------------
        # Test C — Delete every document belonging to a subject
        # ----------------------------------------------------
        log("\n" + "=" * 65)
        log("TEST C: Delete every document belonging to SUB001")
        log("=" * 65)
        log("DELETE /api/rag/subjects/SUB001/documents")
        resp_c = client.delete("/api/rag/subjects/SUB001/documents")
        log(f"Status Code: {resp_c.status_code}")
        data_c = resp_c.json()
        print(json.dumps(data_c, indent=2), flush=True)

        assert resp_c.status_code == 200, f"Expected 200, got {resp_c.status_code}"
        assert data_c["success"] is True
        assert data_c["subject_id"] == "SUB001"
        assert isinstance(data_c["deleted_chunks"], int) and data_c["deleted_chunks"] >= 0
        log(">>> TEST C PASSED! <<<")

        # ----------------------------------------------------
        # Test D — Verify subject cleanup
        # ----------------------------------------------------
        log("\n" + "=" * 65)
        log("TEST D: Verify subject cleanup via /api/rag/ask")
        log("=" * 65)
        payload_d = {
            "subject_id": "SUB001",
            "question": "What topics are covered in this subject?",
        }
        log(f"POST /api/rag/ask with payload:\n{json.dumps(payload_d, indent=2)}")
        resp_d = client.post("/api/rag/ask", json=payload_d)
        log(f"Status Code: {resp_d.status_code}")
        data_d = resp_d.json()
        print(json.dumps(data_d, indent=2), flush=True)

        assert resp_d.status_code == 200, f"Expected 200, got {resp_d.status_code}"
        assert data_d["success"] is True
        assert data_d["subject_id"] == "SUB001"
        assert data_d["document_id"] is None
        assert data_d["sources"] == [], f"Expected empty sources, got {data_d['sources']}"
        assert "couldn't find relevant information" in data_d["answer"].lower()
        log(">>> TEST D PASSED! <<<")

    log("\n" + "=" * 65)
    log("ALL TESTS (A, B, C, D) COMPLETED AND VERIFIED SUCCESSFULLY!")
    log("=" * 65)

if __name__ == "__main__":
    main()

