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
    print("STEP 3: Re-ingestion with fewer chunks to verify stale chunk deletion", flush=True)
    print("=" * 65, flush=True)

    with TestClient(app) as client:
        # Re-ingest DOC003 with pdfdocument.pdf (2 chunks)
        # Previous DOC003 had 25 chunks.
        # Expectation: total_chunks=2, stale_chunks_deleted=23 (> 0)
        file_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "sample_documents", "pdfdocument.pdf")
        print(f"\n[Re-ingestion] Re-ingesting {file_path} as subject_id='SUB001', document_id='DOC003'...", flush=True)

        with open(file_path, "rb") as f:
            resp = client.post(
                "/api/rag/ingest",
                data={"subject_id": "SUB001", "document_id": "DOC003"},
                files={"file": ("pdfdocument.pdf", f, "application/pdf")},
            )

        print(f"Re-ingestion HTTP Status: {resp.status_code}", flush=True)
        data = resp.json()
        print(f"Re-ingestion Response:\n{json.dumps(data, indent=2)}", flush=True)

        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}"
        assert data["success"] is True
        ingest_data = data["data"]
        assert ingest_data["subject_id"] == "SUB001"
        assert ingest_data["document_id"] == "DOC003"
        assert ingest_data["total_chunks"] == 2
        stale_deleted = ingest_data["stale_chunks_deleted"]
        print(f"\nstale_chunks_deleted: {stale_deleted}", flush=True)
        assert stale_deleted > 0, f"Expected stale_chunks_deleted > 0, got {stale_deleted}"

        print(f"\n>>> TEST 3 (RE-INGESTION) PASSED SUCCESSFULLY! Deleted {stale_deleted} stale chunks. <<<", flush=True)

if __name__ == "__main__":
    main()

