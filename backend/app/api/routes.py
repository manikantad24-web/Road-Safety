from __future__ import annotations

import math

from fastapi import APIRouter, Depends
from sqlmodel import Session, col, select

from ..config import Settings, get_settings
from ..constants import ACTIVE_STATUSES
from ..database import get_session
from ..models import Hazard, utcnow
from ..schemas import RouteCompareRequest, RouteCompareResponse, RouteHazardHit, RouteResult
from ..schemas.errors import ApiError
from ..services import risk
from ..services.routing import RoutingUnavailable, get_provider

router = APIRouter(tags=["routing"])

DISCLAIMER = (
    "Risk scores are estimates computed only from hazards reported by users of this application. They are "
    "not verified accident statistics, do not reflect live traffic or live road conditions, and do not "
    "guarantee that any route is safe. Unreported hazards are not represented. Always drive according to "
    "current conditions and local law."
)


@router.post(
    "/routes/compare",
    response_model=RouteCompareResponse,
    summary="Compare candidate routes against reported hazards",
    responses={503: {"description": "Routing service unavailable"}},
)
def compare_routes(
    body: RouteCompareRequest,
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
):
    origin = (body.origin.lat, body.origin.lng)
    dest = (body.destination.lat, body.destination.lng)
    if risk.haversine_m(origin, dest) < 50:
        raise ApiError(422, "validation_error", "Origin and destination are too close together to compare routes.")

    try:
        provider = get_provider(settings)
        candidates = provider.get_routes(origin, dest)
    except RoutingUnavailable as exc:
        raise ApiError(503, "routing_unavailable", str(exc)) from exc

    cfg = risk.RiskConfig.from_settings(settings)
    now = utcnow()

    # Only load hazards inside the union bounding box of all candidates.
    all_pts = [p for c in candidates for p in c.geometry]
    min_lat, min_lng, max_lat, max_lng = risk.bbox(all_pts, cfg.buffer_m)
    hazards = session.exec(
        select(Hazard).where(
            col(Hazard.status).in_(ACTIVE_STATUSES),
            Hazard.latitude >= min_lat,
            Hazard.latitude <= max_lat,
            Hazard.longitude >= min_lng,
            Hazard.longitude <= max_lng,
        )
    ).all()

    results = []
    for idx, c in enumerate(candidates):
        raw, hits = risk.score_route(c.geometry, hazards, now, cfg)
        score = risk.risk_index(raw, cfg)
        km = max(c.distance_m / 1000.0, 0.001)
        results.append(
            RouteResult(
                id=idx,
                label=f"Route {chr(65 + idx)}",
                distance_m=round(c.distance_m, 1),
                duration_s=round(c.duration_s, 1),
                geometry=[[lat, lng] for lat, lng in c.geometry],
                hazard_count=len(hits),
                risk_raw=round(raw, 3),
                risk_score=score,
                risk_level=risk.risk_level(score),
                hazards_per_km=round(len(hits) / km, 2),
                is_shortest=False,
                is_fastest=False,
                is_lowest_risk=False,
                hazards=[
                    RouteHazardHit(
                        id=h.id,
                        hazard_type=h.hazard_type,
                        severity=h.severity,
                        status=h.status,
                        distance_m=round(d, 1),
                        contribution=round(contrib, 3),
                        latitude=h.latitude,
                        longitude=h.longitude,
                    )
                    for h, d, contrib in hits
                ],
            )
        )

    shortest = min(results, key=lambda r: r.distance_m)
    fastest = min(results, key=lambda r: r.duration_s)
    lowest = min(results, key=lambda r: (r.risk_raw, r.distance_m))
    shortest.is_shortest = True
    fastest.is_fastest = True

    # Safety is optimized only when the lowest-risk alternative is within the
    # configured detour threshold. Otherwise, return only the shortest route.
    threshold = max(0.0, settings.route_detour_threshold_percent)
    detour_percent = ((lowest.distance_m - shortest.distance_m) / max(shortest.distance_m, 1.0)) * 100.0
    if len(results) > 1 and lowest.id != shortest.id and detour_percent > threshold:
        shown_results = [shortest]
        recommendation_mode = "shortest_only_threshold_exceeded"
        recommendation_message = (
            f"The lowest-reported-risk alternative is {detour_percent:.1f}% longer, exceeding the "
            f"{threshold:.0f}% detour threshold. Showing the shortest route only. Check current road conditions."
        )
    else:
        eligible = [
            r for r in results
            if ((r.distance_m - shortest.distance_m) / max(shortest.distance_m, 1.0)) * 100.0 <= threshold
        ]
        # If the shortest route itself is the only route inside the threshold,
        # it remains the only displayed option.
        shown_results = sorted(eligible, key=lambda r: (r.risk_raw, r.distance_m))
        recommendation_mode = "safety_within_distance_threshold"
        recommendation_message = (
            f"Recommended route minimizes reported hazard risk among routes no more than {threshold:.0f}% "
            "longer than the shortest route."
        )
        recommended = min(shown_results, key=lambda r: (r.risk_raw, r.distance_m))
        if len(shown_results) > 1 and any(
            not math.isclose(r.risk_raw, recommended.risk_raw, abs_tol=1e-6) for r in shown_results
        ):
            recommended.is_lowest_risk = True

    return RouteCompareResponse(
        provider=provider.name,
        routes=shown_results,
        methodology=cfg.describe(),
        disclaimer=DISCLAIMER,
        considered_hazards=len(hazards),
        distance_threshold_percent=threshold,
        recommendation_mode=recommendation_mode,
        recommendation_message=recommendation_message,
    )
