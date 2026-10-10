from datetime import timedelta

import pytest

from app.config import Settings
from app.models import Hazard, utcnow
from app.services import risk
from app.services.routing import CandidateRoute, RoutingUnavailable

# A straight ~1.1 km north-south road at lng 73.85
STRAIGHT = [(18.520 + i * 0.001, 73.85) for i in range(11)]
DETOUR = [(18.520, 73.85), (18.520, 73.86), (18.530, 73.86)]
COMPARE_BODY = {"origin": {"lat": 18.52, "lng": 73.85}, "destination": {"lat": 18.53, "lng": 73.85}}


class FakeProvider:
    name = "fake"

    def __init__(self, routes=None, error=None):
        self._routes, self._error = routes, error

    def get_routes(self, o, d):
        if self._error:
            raise RoutingUnavailable(self._error)
        return self._routes


def cfg():
    return risk.RiskConfig.from_settings(Settings())


def hz(sev="high", age_days=0, confirms=0, flags=0, lat=18.525, lng=73.85):
    return Hazard(
        id=1, hazard_type="pothole", severity=sev, latitude=lat, longitude=lng,
        confirm_count=confirms, flag_count=flags, created_at=utcnow() - timedelta(days=age_days),
    )


# ---------------------------------------------------------------- unit: risk
def test_severity_ordering():
    now = utcnow()
    c = cfg()
    low, med, high = (risk.hazard_contribution(hz(s), 0, now, c) for s in ("low", "medium", "high"))
    assert low < med < high


def test_recency_decays_with_half_life():
    now = utcnow()
    c = cfg()
    fresh = risk.hazard_contribution(hz(age_days=0), 0, now, c)
    month = risk.hazard_contribution(hz(age_days=30), 0, now, c)
    assert month == pytest.approx(fresh / 2, rel=0.02)
    assert risk.recency_factor(now - timedelta(days=3650), now, c) == c.recency_floor


def test_verification_and_proximity_factors():
    c = cfg()
    assert risk.verification_factor(0, 0, c) == 1.0
    assert risk.verification_factor(3, 0, c) > 1.0
    assert risk.verification_factor(0, 10, c) == c.verification_min
    assert risk.verification_factor(50, 0, c) == c.verification_max
    assert risk.proximity_factor(0, c) == 1.0
    assert risk.proximity_factor(c.buffer_m, c) == 0.0
    assert 0 < risk.proximity_factor(c.buffer_m / 2, c) < 1


def test_distance_to_polyline_and_scoring_buffer():
    near = (18.525, 73.85 + 0.0002)  # ~21 m east of the road
    far = (18.525, 73.85 + 0.01)  # ~1 km east
    assert risk.distance_to_polyline_m(near, STRAIGHT) == pytest.approx(21, abs=3)
    raw, hits = risk.score_route(STRAIGHT, [hz(lat=near[0], lng=near[1]), hz(lat=far[0], lng=far[1])], utcnow(), cfg())
    assert len(hits) == 1 and raw > 0


def test_risk_index_is_bounded_and_monotonic():
    c = cfg()
    assert risk.risk_index(0, c) == 0
    assert risk.risk_index(5, c) < risk.risk_index(20, c) < 100
    assert risk.risk_level(10) == "low" and risk.risk_level(30) == "moderate"
    assert risk.risk_level(60) == "elevated" and risk.risk_level(90) == "high"


# --------------------------------------------------------- API: compare
def test_compare_routes_scores_hazards(client, make_hazard, monkeypatch):
    make_hazard(severity="high", latitude=18.525, longitude=73.85)  # on STRAIGHT
    make_hazard(severity="low", latitude=18.5, longitude=73.9)  # far away
    straight = CandidateRoute(1100, 120, STRAIGHT)
    detour = CandidateRoute(2600, 300, DETOUR)
    monkeypatch.setattr("app.api.routes.get_provider", lambda s: FakeProvider([straight, detour]))

    r = client.post("/api/routes/compare", json=COMPARE_BODY)
    assert r.status_code == 200
    body = r.json()
    # The lowest-risk route is far beyond the default 20% detour threshold,
    # so the API intentionally returns only the shortest route.
    assert len(body["routes"]) == 1
    a = body["routes"][0]
    assert a["hazard_count"] == 1
    assert a["is_shortest"] and a["is_fastest"] and not a["is_lowest_risk"]
    assert body["recommendation_mode"] == "shortest_only_threshold_exceeded"
    assert body["distance_threshold_percent"] == 20.0
    assert a["hazards"][0]["distance_m"] < 1
    assert "not" in body["disclaimer"].lower() and "guarantee" in body["disclaimer"].lower()
    assert body["methodology"]["parameters"]["buffer_m"] == 60


def test_compare_ignores_resolved_hazards(client, make_hazard, monkeypatch):
    from tests.conftest import ADMIN

    h = make_hazard(latitude=18.525, longitude=73.85)
    client.patch(f"/api/hazards/{h['id']}/status", json={"status": "resolved"}, headers=ADMIN)
    monkeypatch.setattr("app.api.routes.get_provider", lambda s: FakeProvider([CandidateRoute(1100, 120, STRAIGHT)]))
    body = client.post("/api/routes/compare", json=COMPARE_BODY).json()
    assert body["routes"][0]["hazard_count"] == 0 and body["routes"][0]["is_lowest_risk"] is False


def test_compare_handles_routing_outage(client, monkeypatch):
    monkeypatch.setattr("app.api.routes.get_provider", lambda s: FakeProvider(error="Could not reach the routing service."))
    r = client.post("/api/routes/compare", json=COMPARE_BODY)
    assert r.status_code == 503
    assert r.json()["error"]["code"] == "routing_unavailable"


def test_compare_validation(client):
    assert client.post("/api/routes/compare", json={"origin": {"lat": 200, "lng": 0}, "destination": {"lat": 0, "lng": 0}}).status_code == 422
    same = {"origin": {"lat": 18.52, "lng": 73.85}, "destination": {"lat": 18.52, "lng": 73.85}}
    assert client.post("/api/routes/compare", json=same).status_code == 422
    assert client.post("/api/routes/compare", json={}).status_code == 422


# ------------------------------------------------- OSRM adapter parsing
class _Resp:
    def __init__(self, status=200, payload=None):
        self.status_code, self._payload = status, payload

    def json(self):
        if self._payload is None:
            raise ValueError("no json")
        return self._payload


def test_osrm_adapter_parses_geojson_routes(monkeypatch):
    from app.services.routing import OSRMProvider

    payload = {
        "code": "Ok",
        "routes": [
            {"distance": 1000.0, "duration": 100.0, "geometry": {"coordinates": [[73.85, 18.52], [73.85, 18.53]]}},
            {"distance": 1500.0, "duration": 90.0, "geometry": {"coordinates": [[73.85, 18.52], [73.86, 18.53]]}},
        ],
    }
    seen = {}

    def fake_get(url, params=None, timeout=None, headers=None):
        seen["url"], seen["params"] = url, params
        return _Resp(200, payload)

    monkeypatch.setattr("app.services.routing.httpx.get", fake_get)
    routes = OSRMProvider(Settings()).get_routes((18.52, 73.85), (18.53, 73.85))
    assert len(routes) == 2 and routes[0].geometry[0] == (18.52, 73.85)  # (lat, lng) order
    assert "73.850000,18.520000;73.850000,18.530000" in seen["url"]  # OSRM wants lng,lat
    assert seen["params"]["geometries"] == "geojson"


def test_osrm_adapter_error_paths(monkeypatch):
    import httpx

    from app.services.routing import OSRMProvider

    p = OSRMProvider(Settings())

    def boom(*a, **k):
        raise httpx.ConnectError("down")

    monkeypatch.setattr("app.services.routing.httpx.get", boom)
    with pytest.raises(RoutingUnavailable):
        p.get_routes((1, 1), (2, 2))

    monkeypatch.setattr("app.services.routing.httpx.get", lambda *a, **k: _Resp(200, {"code": "NoRoute", "routes": []}))
    with pytest.raises(RoutingUnavailable, match="no drivable route"):
        p.get_routes((1, 1), (2, 2))

    monkeypatch.setattr("app.services.routing.httpx.get", lambda *a, **k: _Resp(500, None))
    with pytest.raises(RoutingUnavailable, match="HTTP 500"):
        p.get_routes((1, 1), (2, 2))
