import os
import sys
import json

os.environ["HF_HUB_OFFLINE"] = "1"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from starlette.testclient import TestClient
from app.main import app

def main():
    print("=" * 65, flush=True)
    print("STEP 4: Invalid file format (.txt) upload test", flush=True)
    print("=" * 65, flush=True)

    with TestClient(app) as client:
        # Create dummy .txt file content in memory
        file_content = b"This is a plain text file, not allowed."
        resp = client.post(
            "/api/rag/ingest",
            data={"subject_id": "SUB001", "document_id": "DOC004"},
            files={"file": ("test.txt", file_content, "text/plain")},
        )

        print(f"HTTP Status: {resp.status_code}", flush=True)
        print(f"Response: {resp.json()}", flush=True)

        assert resp.status_code == 415, f"Expected 415, got {resp.status_code}"
        assert resp.json()["detail"] == "Only PDF, DOCX, and PPTX files are supported"
        print("\n>>> TEST 4 (INVALID FILE FORMAT 415) PASSED SUCCESSFULLY! <<<", flush=True)

if __name__ == "__main__":
    main()

