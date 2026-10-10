"""Transparent, configurable route risk scoring.

THIS IS AN ESTIMATE BASED ON USER-REPORTED DATA. It is not derived from accident statistics, live
traffic or live road conditions, and a low score does not mean a route is safe.

For every active report (status reported / verified / in_progress) within `buffer_m` of a route:

    contribution = severity_weight x recency_factor x verification_factor x proximity_factor

  severity_weight      low=1.0, medium=2.5, high=5.0                      (RISK_WEIGHT_*)
  recency_factor       0.5 ** (age_days / half_life_days), floored         (RISK_RECENCY_*)
  verification_factor  clamp(1 + confirm_bonus*confirms - flag_penalty*flags, min, max)
  proximity_factor     1 at the route line, falling linearly to
                       `proximity_edge_factor` at the buffer edge

  risk_raw    = sum of contributions over hazards near the route (a cumulative exposure measure,
                so longer routes passing more hazards score higher)
  risk_score  = 100 * (1 - exp(-risk_raw / saturation_scale))   -> 0-100 index
  risk_level  = low (<25) | moderate (<50) | elevated (<75) | high

Limitations: unreported hazards are invisible; report density follows where people report, not where
risk is highest; severity is self-reported; the weights are judgement-based defaults, not calibrated
against crash outcomes.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from datetime import datetime
from typing import Dict, List, Sequence, Tuple

from ..config import Settings

LatLng = Tuple[float, float]


@dataclass
class RiskConfig:
    buffer_m: float
    weights: Dict[str, float]
    half_life_days: float
    recency_floor: float
    confirm_bonus: float
    flag_penalty: float
    verification_min: float
    verification_max: float
    edge_factor: float
    saturation_scale: float

    @classmethod
    def from_settings(cls, s: Settings) -> "RiskConfig":
        return cls(
            buffer_m=s.risk_buffer_m,
            weights={"low": s.risk_weight_low, "medium": s.risk_weight_medium, "high": s.risk_weight_high},
            half_life_days=s.risk_recency_half_life_days,
            recency_floor=s.risk_recency_floor,
            confirm_bonus=s.risk_confirm_bonus,
            flag_penalty=s.risk_flag_penalty,
            verification_min=s.risk_verification_min,
            verification_max=s.risk_verification_max,
            edge_factor=s.risk_proximity_edge_factor,
            saturation_scale=s.risk_saturation_scale,
        )

    def describe(self) -> Dict:
        return {
            "formula": "contribution = severity_weight x recency_factor x verification_factor x proximity_factor",
            "aggregation": "risk_raw = sum(contributions); risk_score = 100 * (1 - exp(-risk_raw / saturation_scale))",
            "parameters": {
                "buffer_m": self.buffer_m,
                "severity_weights": self.weights,
                "recency_half_life_days": self.half_life_days,
                "recency_floor": self.recency_floor,
                "confirm_bonus": self.confirm_bonus,
                "flag_penalty": self.flag_penalty,
                "verification_range": [self.verification_min, self.verification_max],
                "proximity_edge_factor": self.edge_factor,
                "saturation_scale": self.saturation_scale,
            },
            "included_statuses": ["reported", "verified", "in_progress"],
            "levels": {"low": "<25", "moderate": "25-49", "elevated": "50-74", "high": ">=75"},
            "nature": "Estimated risk from user-reported hazards. Not verified accident statistics.",
        }


# ---------------------------------------------------------------- geometry
_EARTH_R = 6_371_000.0


def haversine_m(a: LatLng, b: LatLng) -> float:
    la1, lo1, la2, lo2 = map(math.radians, (a[0], a[1], b[0], b[1]))
    d = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 2 * _EARTH_R * math.asin(math.sqrt(d))


def polyline_length_m(points: Sequence[LatLng]) -> float:
    return sum(haversine_m(points[i], points[i + 1]) for i in range(len(points) - 1))


def distance_to_polyline_m(point: LatLng, line: Sequence[LatLng]) -> float:
    """Minimum distance from a point to a polyline using a local equirectangular projection."""
    if not line:
        return math.inf
    lat0 = math.radians(point[0])
    kx = math.cos(lat0) * _EARTH_R * math.pi / 180.0
    ky = _EARTH_R * math.pi / 180.0
    px, py = 0.0, 0.0  # point is the origin
    best = math.inf
    prev = ((line[0][1] - point[1]) * kx, (line[0][0] - point[0]) * ky)
    if len(line) == 1:
        return math.hypot(*prev)
    for lat, lng in line[1:]:
        cur = ((lng - point[1]) * kx, (lat - point[0]) * ky)
        dx, dy = cur[0] - prev[0], cur[1] - prev[1]
        seg2 = dx * dx + dy * dy
        if seg2 == 0:
            d = math.hypot(prev[0] - px, prev[1] - py)
        else:
            t = max(0.0, min(1.0, ((px - prev[0]) * dx + (py - prev[1]) * dy) / seg2))
            d = math.hypot(prev[0] + t * dx - px, prev[1] + t * dy - py)
        if d < best:
            best = d
        prev = cur
    return best


def bbox(points: Sequence[LatLng], pad_m: float) -> Tuple[float, float, float, float]:
    lats = [p[0] for p in points]
    lngs = [p[1] for p in points]
    mid_lat = math.radians((min(lats) + max(lats)) / 2)
    dlat = pad_m / 111_320.0
    dlng = pad_m / (111_320.0 * max(math.cos(mid_lat), 0.01))
    return min(lats) - dlat, min(lngs) - dlng, max(lats) + dlat, max(lngs) + dlng


# ----------------------------------------------------------------- scoring
def recency_factor(created_at: datetime, now: datetime, cfg: RiskConfig) -> float:
    age_days = max(0.0, (now - created_at).total_seconds() / 86400.0)
    return max(cfg.recency_floor, 0.5 ** (age_days / cfg.half_life_days))


def verification_factor(confirms: int, flags: int, cfg: RiskConfig) -> float:
    raw = 1.0 + cfg.confirm_bonus * confirms - cfg.flag_penalty * flags
    return max(cfg.verification_min, min(cfg.verification_max, raw))


def proximity_factor(distance_m: float, cfg: RiskConfig) -> float:
    if distance_m >= cfg.buffer_m:
        return 0.0
    return 1.0 - (1.0 - cfg.edge_factor) * (distance_m / cfg.buffer_m)


def hazard_contribution(h, distance_m: float, now: datetime, cfg: RiskConfig) -> float:
    return (
        cfg.weights.get(h.severity, cfg.weights["medium"])
        * recency_factor(h.created_at, now, cfg)
        * verification_factor(h.confirm_count, h.flag_count, cfg)
        * proximity_factor(distance_m, cfg)
    )


def risk_index(raw: float, cfg: RiskConfig) -> float:
    return round(100.0 * (1.0 - math.exp(-raw / cfg.saturation_scale)), 1)


def risk_level(score: float) -> str:
    if score < 25:
        return "low"
    if score < 50:
        return "moderate"
    if score < 75:
        return "elevated"
    return "high"


def score_route(geometry: Sequence[LatLng], hazards: Sequence, now: datetime, cfg: RiskConfig):
    """Returns (risk_raw, hits) where hits = [(hazard, distance_m, contribution)] sorted by contribution."""
    if not geometry:
        return 0.0, []
    min_lat, min_lng, max_lat, max_lng = bbox(geometry, cfg.buffer_m)
    hits: List[tuple] = []
    for h in hazards:
        if not (min_lat <= h.latitude <= max_lat and min_lng <= h.longitude <= max_lng):
            continue
        d = distance_to_polyline_m((h.latitude, h.longitude), geometry)
        if d <= cfg.buffer_m:
            hits.append((h, d, hazard_contribution(h, d, now, cfg)))
    hits.sort(key=lambda t: t[2], reverse=True)
    return sum(c for _, _, c in hits), hits
