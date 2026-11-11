import os
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from starlette.testclient import TestClient
from app.main import app
from app.config import settings

def test_health_and_security():
    print("=" * 65, flush=True)
    print("TESTING HEALTH, READINESS, SECURITY & CONFIGURATION", flush=True)
    print("=" * 65, flush=True)

    with TestClient(app) as client:
        # 1. Basic Liveness Check
        resp_live = client.get("/health")
        print(f"\n1. /health -> {resp_live.status_code}, data: {resp_live.json()}", flush=True)
        assert resp_live.status_code == 200
        assert resp_live.json()["status"] == "ok"
        assert resp_live.json()["success"] is True

        resp_live2 = client.get("/health/live")
        assert resp_live2.status_code == 200
        assert resp_live2.json()["status"] == "ok"

        # 2. Dependency Readiness Check
        resp_ready = client.get("/health/ready")
        print(f"\n2. /health/ready -> {resp_ready.status_code}", flush=True)
        ready_data = resp_ready.json()
        print(f"Readiness payload: {ready_data}", flush=True)
        # Should check embedding, qdrant, ollama
        assert "dependencies" in ready_data
        assert "embedding" in ready_data["dependencies"]
        assert "qdrant" in ready_data["dependencies"]
        assert "ollama" in ready_data["dependencies"]
        print("Embedding status:", ready_data["dependencies"]["embedding"]["status"])
        print("Qdrant status:", ready_data["dependencies"]["qdrant"]["status"])
        print("Ollama status:", ready_data["dependencies"]["ollama"]["status"])

        # 3. Security: Path Traversal in Identifiers
        print("\n3. Testing identifier path traversal prevention...", flush=True)
        bad_payload = {
            "subject_id": "../etc/passwd",
            "question": "What is here?",
        }
        resp_bad = client.post("/api/rag/ask", json=bad_payload)
        print(f"Path traversal status: {resp_bad.status_code}, response: {resp_bad.json()}", flush=True)
        assert resp_bad.status_code in [400, 422], f"Expected 400 or 422, got {resp_bad.status_code}"

        # 4. Security: API Key Authentication
        print("\n4. Testing API Key Authentication (when enabled)...", flush=True)
        # Temporarily enable auth
        settings.AUTH_ENABLED = True
        settings.API_KEY = "test-secret-key-12345"

        # Request without key -> 401
        resp_unauth = client.post("/api/rag/ask", json={"subject_id": "SUB001", "question": "test"})
        print(f"Unauthenticated status: {resp_unauth.status_code}, response: {resp_unauth.json()}", flush=True)
        assert resp_unauth.status_code == 401

        # Request with valid X-API-Key -> 200 (or pass auth check)
        resp_auth = client.post(
            "/api/rag/ask",
            json={"subject_id": "SUB001", "question": "test"},
            headers={"X-API-Key": "test-secret-key-12345"},
        )
        print(f"Authenticated with X-API-Key status: {resp_auth.status_code}", flush=True)
        assert resp_auth.status_code == 200

        # Request with Bearer token
        resp_bearer = client.post(
            "/api/rag/ask",
            json={"subject_id": "SUB001", "question": "test"},
            headers={"Authorization": "Bearer test-secret-key-12345"},
        )
        print(f"Authenticated with Bearer status: {resp_bearer.status_code}", flush=True)
        assert resp_bearer.status_code == 200

        # Reset auth back to default
        settings.AUTH_ENABLED = False
        settings.API_KEY = ""

        print("\n>>> ALL HEALTH, READINESS & SECURITY CHECKS PASSED! <<<", flush=True)

if __name__ == "__main__":
    test_health_and_security()

