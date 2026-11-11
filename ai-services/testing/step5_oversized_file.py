import os
import sys
import io
import json

os.environ["HF_HUB_OFFLINE"] = "1"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from starlette.testclient import TestClient
from app.main import app

def main():
    print("=" * 65, flush=True)
    print("STEP 5: Oversized file (> 25 MB) upload test", flush=True)
    print("=" * 65, flush=True)

    with TestClient(app) as client:
        # Create a 26 MB stream in memory
        oversized_data = io.BytesIO(b"0" * (26 * 1024 * 1024))
        
        print("Sending 26 MB PDF upload request to /api/rag/ingest...", flush=True)
        resp = client.post(
            "/api/rag/ingest",
            data={"subject_id": "SUB001", "document_id": "DOC005"},
            files={"file": ("oversized.pdf", oversized_data, "application/pdf")},
        )

        print(f"HTTP Status: {resp.status_code}", flush=True)
        print(f"Response: {resp.json()}", flush=True)

        assert resp.status_code == 413, f"Expected 413, got {resp.status_code}"
        assert resp.json()["detail"] == "File size exceeds the 25 MB limit"
        print("\n>>> TEST 5 (OVERSIZED FILE 413) PASSED SUCCESSFULLY! <<<", flush=True)

if __name__ == "__main__":
    main()

