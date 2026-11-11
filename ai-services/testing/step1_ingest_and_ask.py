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
    print("STEP 1: Ingestion of DOC003 and Verification of Ask Endpoint", flush=True)
    print("=" * 65, flush=True)

    with TestClient(app) as client:
        # Ingestion of DOC003
        file_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "sample_documents", "FDA.docx")
        print(f"\n[Ingestion] Ingesting {file_path} as subject_id='SUB001', document_id='DOC003'...", flush=True)
        with open(file_path, "rb") as f:
            resp_ingest = client.post(
                "/api/rag/ingest",
                data={"subject_id": "SUB001", "document_id": "DOC003"},
                files={"file": ("FDA.docx", f, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")},
            )
        
        print(f"Ingestion HTTP Status: {resp_ingest.status_code}", flush=True)
        print(f"Ingestion Response: {json.dumps(resp_ingest.json(), indent=2)}", flush=True)
        assert resp_ingest.status_code == 200, f"Expected 200, got {resp_ingest.status_code}"
        ingest_data = resp_ingest.json()
        assert ingest_data["success"] is True

        # Test 1 — Ask endpoint
        print("\n" + "-" * 65, flush=True)
        print("TEST 1: /api/rag/ask with subject_id='SUB001' and document_id='DOC003'", flush=True)
        print("-" * 65, flush=True)
        ask_payload = {
            "subject_id": "SUB001",
            "document_id": "DOC003",
            "question": "What course code and course title is covered in this document?",
            "top_k": 3
        }
        print(f"POST /api/rag/ask Payload:\n{json.dumps(ask_payload, indent=2)}", flush=True)

        t0 = time.time()
        resp_ask = client.post("/api/rag/ask", json=ask_payload)
        elapsed = time.time() - t0

        print(f"\nAsk HTTP Status: {resp_ask.status_code} (took {elapsed:.2f}s)", flush=True)
        ask_data = resp_ask.json()
        print(f"Ask Response:\n{json.dumps(ask_data, indent=2)}", flush=True)

        assert resp_ask.status_code == 200, f"Expected 200, got {resp_ask.status_code}"
        assert ask_data["success"] is True
        assert ask_data["subject_id"] == "SUB001"
        assert ask_data["document_id"] == "DOC003"
        assert len(ask_data["sources"]) > 0, "Expected at least 1 source"
        for src in ask_data["sources"]:
            assert src["document_id"] == "DOC003", f"Expected DOC003 source, got {src['document_id']}"

        print("\n>>> TEST 1 PASSED SUCCESSFULLY! <<<", flush=True)

if __name__ == "__main__":
    main()

