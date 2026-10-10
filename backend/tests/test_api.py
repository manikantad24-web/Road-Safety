import io

import pytest

from PIL import Image

from tests.conftest import ADMIN


def png_bytes(size=(64, 48), fmt="PNG"):
    buf = io.BytesIO()
    Image.new("RGB", size, (120, 120, 120)).save(buf, format=fmt)
    return buf.getvalue()


# ------------------------------------------------------------------ health
def test_health_reports_ai_unavailable(client):
    r = client.get("/api/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["ai"]["available"] is False
    assert body["ai"]["reason"]
    assert "tmp" not in body["ai"]["reason"]  # no local filesystem paths leaked


# ------------------------------------------------------- create + retrieve
def test_create_and_retrieve_hazard(client, make_hazard):
    created = make_hazard(description="  Big hole  ")
    assert created["id"] >= 1
    assert created["status"] == "reported"
    assert created["description"] == "Big hole"
    assert created["ai_status"] == "manual"
    assert created["is_demo"] is False
    assert created["created_at"].endswith("Z")

    r = client.get(f"/api/hazards/{created['id']}")
    assert r.status_code == 200
    detail = r.json()
    assert detail["latitude"] == 18.52
    assert [e["kind"] for e in detail["events"]] == ["created"]


def test_get_missing_hazard_returns_404(client):
    r = client.get("/api/hazards/9999")
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "not_found"


def test_list_filters_and_pagination(client, make_hazard):
    for i in range(5):
        make_hazard(hazard_type="pothole" if i % 2 == 0 else "crack", severity="low" if i < 3 else "high")
    r = client.get("/api/hazards", params={"page_size": 2, "page": 1})
    body = r.json()
    assert body["total"] == 5 and body["pages"] == 3 and len(body["items"]) == 2

    assert client.get("/api/hazards", params={"type": "crack"}).json()["total"] == 2
    assert client.get("/api/hazards", params={"severity": "high"}).json()["total"] == 2
    assert client.get("/api/hazards", params={"source": "demo"}).json()["total"] == 0
    assert client.get("/api/hazards", params={"date_from": "2999-01-01"}).json()["total"] == 0


def test_list_rejects_bad_filters(client):
    assert client.get("/api/hazards", params={"type": "volcano"}).status_code == 422
    assert client.get("/api/hazards", params={"page": 0}).status_code == 422
    assert client.get("/api/hazards", params={"page_size": 5000}).status_code == 422
    r = client.get("/api/hazards", params={"date_from": "2026-02-01", "date_to": "2026-01-01"})
    assert r.status_code == 422


# ---------------------------------------------------------- invalid input
def test_create_rejects_invalid_input(client):
    base = {"hazard_type": "pothole", "severity": "high", "latitude": 10, "longitude": 10}
    cases = [
        {**base, "hazard_type": "meteor"},
        {**base, "severity": "catastrophic"},
        {**base, "latitude": 91},
        {**base, "longitude": -181},
        {**base, "description": "x" * 1001},
        {**base, "upload_id": "../../etc/passwd"},
        {k: v for k, v in base.items() if k != "latitude"},
    ]
    for body in cases:
        r = client.post("/api/hazards", json=body)
        assert r.status_code == 422, body
        err = r.json()["error"]
        assert err["code"] == "validation_error" and err["details"]


def test_create_with_unknown_upload_is_rejected(client):
    r = client.post(
        "/api/hazards",
        json={"hazard_type": "pothole", "severity": "low", "latitude": 1, "longitude": 1, "upload_id": "a" * 32},
    )
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "unknown_upload"


# ------------------------------------------------------------ status update
def test_status_update_requires_admin_token(client, make_hazard):
    h = make_hazard()
    url = f"/api/hazards/{h['id']}/status"
    assert client.patch(url, json={"status": "resolved"}).status_code == 401
    assert client.patch(url, json={"status": "resolved"}, headers={"X-Admin-Token": "wrong"}).status_code == 401
    r = client.patch(url, json={"status": "resolved", "note": "Patched"}, headers=ADMIN)
    assert r.status_code == 200 and r.json()["status"] == "resolved"

    detail = client.get(f"/api/hazards/{h['id']}").json()
    last = detail["events"][-1]
    assert (last["kind"], last["from_status"], last["to_status"], last["note"]) == (
        "status_changed", "reported", "resolved", "Patched",
    )


def test_status_update_invalid_and_noop(client, make_hazard):
    h = make_hazard()
    url = f"/api/hazards/{h['id']}/status"
    assert client.patch(url, json={"status": "banana"}, headers=ADMIN).status_code == 422
    assert client.patch(url, json={"status": "reported"}, headers=ADMIN).status_code == 409
    assert client.patch("/api/hazards/424242/status", json={"status": "resolved"}, headers=ADMIN).status_code == 404


def test_status_update_disabled_when_no_token_configured(client, make_hazard, monkeypatch):
    from app.config import get_settings

    h = make_hazard()
    monkeypatch.setenv("ADMIN_TOKEN", "")
    get_settings.cache_clear()
    r = client.patch(f"/api/hazards/{h['id']}/status", json={"status": "resolved"}, headers=ADMIN)
    assert r.status_code == 503
    get_settings.cache_clear()


# ------------------------------------------------------------ verification
def test_verify_prevents_duplicates_and_auto_verifies(client, make_hazard):
    h = make_hazard()
    url = f"/api/hazards/{h['id']}/verify"

    r = client.post(url, json={"vote": "confirm"}, headers={"X-Client-Id": "client-aaaaaaaa"})
    assert r.status_code == 201 and r.json()["hazard"]["confirm_count"] == 1

    dup = client.post(url, json={"vote": "flag"}, headers={"X-Client-Id": "client-aaaaaaaa"})
    assert dup.status_code == 409 and dup.json()["error"]["code"] == "already_voted"

    client.post(url, json={"vote": "confirm"}, headers={"X-Client-Id": "client-bbbbbbbb"})
    r3 = client.post(url, json={"vote": "confirm"}, headers={"X-Client-Id": "client-cccccccc"})
    assert r3.json()["auto_verified"] is True
    assert r3.json()["hazard"]["status"] == "verified"

    flag = client.post(url, json={"vote": "flag", "note": "looks fine"}, headers={"X-Client-Id": "client-dddddddd"})
    assert flag.json()["hazard"]["flag_count"] == 1


def test_verify_validation(client, make_hazard):
    h = make_hazard()
    url = f"/api/hazards/{h['id']}/verify"
    assert client.post(url, json={"vote": "love"}).status_code == 422
    assert client.post(url, json={"vote": "confirm"}, headers={"X-Client-Id": "bad id!"}).status_code == 400
    assert client.post("/api/hazards/999/verify", json={"vote": "confirm"}).status_code == 404


# -------------------------------------------------------------- detection
def test_detect_without_model_is_explicitly_unavailable(client, make_hazard):
    r = client.post("/api/detect", files={"file": ("road.png", png_bytes(), "image/png")})
    assert r.status_code == 200
    body = r.json()
    assert body["available"] is False and body["analyzed"] is False
    assert body["detections"] == [] and body["reason"]
    assert body["image_url"].startswith("/api/images/")
    assert "\\" not in body["image_url"] and "uploads" not in body["image_url"]

    # The image is served back, and a manual report can reference the upload.
    assert client.get(body["image_url"]).status_code == 200
    h = make_hazard(upload_id=body["upload_id"])
    assert h["ai_status"] == "unavailable" and h["detections"] == [] and h["image_url"]

    # An upload can only be attached once.
    again = client.post(
        "/api/hazards",
        json={"hazard_type": "pothole", "severity": "low", "latitude": 1, "longitude": 1, "upload_id": body["upload_id"]},
    )
    assert again.status_code == 409


def test_detect_rejects_bad_files(client):
    assert client.post("/api/detect", files={"file": ("a.txt", b"hello", "text/plain")}).status_code == 415
    # Claims to be a PNG but is not an image
    assert client.post("/api/detect", files={"file": ("a.png", b"not an image", "image/png")}).status_code == 400
    assert client.post("/api/detect", files={"file": ("a.png", b"", "image/png")}).status_code == 400
    # GIF is a real image but not an allowed format
    assert client.post("/api/detect", files={"file": ("a.png", png_bytes(fmt="GIF"), "image/png")}).status_code == 415
    # Over the 1 MB test limit
    assert client.post("/api/detect", files={"file": ("a.png", b"\x89PNG" + b"0" * (1024 * 1024 + 10), "image/png")}).status_code == 413
    assert client.post("/api/detect").status_code == 422


def test_image_endpoint_rejects_traversal(client):
    assert client.get("/api/images/..%2f..%2fetc%2fpasswd").status_code == 404
    assert client.get("/api/images/notahash.jpg").status_code == 404


# ------------------------------------------------------------------ stats
def test_stats(client, make_hazard):
    a = make_hazard(severity="high")
    make_hazard(severity="low", hazard_type="crack")
    client.patch(f"/api/hazards/{a['id']}/status", json={"status": "resolved"}, headers=ADMIN)
    s = client.get("/api/stats").json()
    assert s["total"] == 2 and s["active"] == 1 and s["resolved"] == 1
    assert s["high_severity_active"] == 0 and s["by_type"]["crack"] == 1
    assert len(s["reports_per_day"]) == 14 and s["recent_activity"]


def test_invalid_image_is_a_400_even_when_ultralytics_is_loaded(client, monkeypatch):
    """Regression: importing ultralytics replaces PIL.Image.open with a wrapper that, on a failed decode,
    may try to pip-install packages and raise an unrelated exception. Validation must not use it."""
    pytest.importorskip("ultralytics")
    import ultralytics.utils.patches  # noqa: F401  (applies the Image.open patch)
    from PIL import Image

    assert Image.open.__module__.startswith("ultralytics"), "test precondition: Image.open should be patched"

    calls = []
    real_open = Image.open

    def spy(*a, **k):  # record use of the (ultralytics-patched) opener instead of raising, so a broad except can't hide it
        calls.append(1)
        return real_open(*a, **k)

    monkeypatch.setattr(Image, "open", spy)
    r = client.post("/api/detect", files={"file": ("a.jpg", b"this is not an image", "image/jpeg")})
    assert r.status_code == 400
    assert r.json()["error"]["code"] == "invalid_image"
    assert calls == [], "upload validation must use the original Pillow opener, not the patched Image.open"
