import os
import tempfile
from pathlib import Path

_TMP = Path(tempfile.mkdtemp(prefix="rg-tests-"))
os.environ["DATABASE_URL"] = f"sqlite:///{_TMP / 'test.db'}"
os.environ["UPLOAD_DIR"] = str(_TMP / "uploads")
os.environ["ADMIN_TOKEN"] = "test-admin-token"
os.environ["YOLO_WEIGHTS_PATH"] = str(_TMP / "does-not-exist.pt")  # force AI-unavailable state
os.environ["MAX_UPLOAD_MB"] = "1"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlmodel import SQLModel  # noqa: E402

from app.config import get_settings  # noqa: E402
from app.database import get_engine, init_db  # noqa: E402
from app.main import create_app  # noqa: E402
from app.services.detection import reset_detection_service  # noqa: E402

ADMIN = {"X-Admin-Token": "test-admin-token"}


@pytest.fixture()
def client():
    get_settings.cache_clear()
    reset_detection_service()
    SQLModel.metadata.drop_all(get_engine())
    init_db()
    with TestClient(create_app()) as c:
        yield c


@pytest.fixture()
def make_hazard(client):
    def _make(**overrides):
        body = {
            "hazard_type": "pothole",
            "severity": "high",
            "description": "Test pothole",
            "latitude": 18.52,
            "longitude": 73.85,
        }
        body.update(overrides)
        r = client.post("/api/hazards", json=body)
        assert r.status_code == 201, r.text
        return r.json()

    return _make
