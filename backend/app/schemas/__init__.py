from __future__ import annotations

from datetime import datetime, timezone
from typing import Annotated, Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field, PlainSerializer, field_validator

from ..constants import HazardType, Severity, Status, Vote


def _iso_z(dt: datetime) -> str:
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


UTCDateTime = Annotated[datetime, PlainSerializer(_iso_z, return_type=str)]


# ---------------------------------------------------------------- hazards
class HazardCreate(BaseModel):
    hazard_type: HazardType
    severity: Severity
    description: str = Field(default="", max_length=1000)
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)
    upload_id: Optional[str] = Field(default=None, pattern=r"^[a-f0-9]{32}$")

    @field_validator("description")
    @classmethod
    def _strip(cls, v: str) -> str:
        return v.strip()


class HazardRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    hazard_type: str
    severity: str
    status: str
    description: str
    latitude: float
    longitude: float
    image_url: Optional[str] = None
    detections: List[Any] = []
    ai_status: str
    ai_model: Optional[str] = None
    ai_suggested_type: Optional[str] = None
    ai_overridden: bool = False
    confirm_count: int
    flag_count: int
    is_demo: bool
    created_at: UTCDateTime
    updated_at: UTCDateTime


class EventRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    kind: str
    from_status: Optional[str] = None
    to_status: Optional[str] = None
    note: str
    actor: str
    created_at: UTCDateTime


class HazardDetail(HazardRead):
    events: List[EventRead] = []
    verify_threshold: int


class HazardPage(BaseModel):
    items: List[HazardRead]
    total: int
    page: int
    page_size: int
    pages: int


class StatusUpdate(BaseModel):
    status: Status
    note: str = Field(default="", max_length=500)

    @field_validator("note")
    @classmethod
    def _strip(cls, v: str) -> str:
        return v.strip()


class VerifyRequest(BaseModel):
    vote: Vote
    note: str = Field(default="", max_length=300)

    @field_validator("note")
    @classmethod
    def _strip(cls, v: str) -> str:
        return v.strip()


class VerifyResponse(BaseModel):
    hazard: HazardRead
    vote: str
    auto_verified: bool = False


# --------------------------------------------------------------- detection
class Detection(BaseModel):
    label: str  # raw class name from the model
    hazard_type: str  # mapped RoadGuardian type
    confidence: float
    # Normalised box (0-1) relative to image width/height
    box: Dict[str, float]


class DetectResponse(BaseModel):
    upload_id: str
    available: bool
    analyzed: bool
    model: Optional[str] = None
    reason: Optional[str] = None
    image_url: str
    image_width: int
    image_height: int
    detections: List[Detection] = []
    suggested_type: Optional[str] = None
    disclaimer: str


# ------------------------------------------------------------------ routes
class LatLng(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)


class RouteCompareRequest(BaseModel):
    origin: LatLng
    destination: LatLng


class RouteHazardHit(BaseModel):
    id: int
    hazard_type: str
    severity: str
    status: str
    distance_m: float
    contribution: float
    latitude: float
    longitude: float


class RouteResult(BaseModel):
    id: int
    label: str
    distance_m: float
    duration_s: float
    geometry: List[List[float]]  # [[lat, lng], ...]
    hazard_count: int
    risk_raw: float
    risk_score: float  # 0-100 estimated-risk index
    risk_level: str
    hazards_per_km: float
    is_shortest: bool
    is_fastest: bool
    is_lowest_risk: bool
    hazards: List[RouteHazardHit]


class RouteCompareResponse(BaseModel):
    provider: str
    routes: List[RouteResult]
    methodology: Dict[str, Any]
    disclaimer: str
    considered_hazards: int
    distance_threshold_percent: float = 20.0
    recommendation_mode: str = "safety_within_distance_threshold"
    recommendation_message: str = "Routes are ranked by reported hazard risk within the distance threshold."


# ------------------------------------------------------------------- stats
class RecentActivity(BaseModel):
    event_id: int
    hazard_id: int
    kind: str
    hazard_type: str
    severity: str
    from_status: Optional[str] = None
    to_status: Optional[str] = None
    actor: str
    created_at: UTCDateTime


class StatsResponse(BaseModel):
    total: int
    active: int
    high_severity_active: int
    verified: int
    resolved: int
    in_progress: int
    rejected: int
    flagged_for_review: int
    by_type: Dict[str, int]
    by_severity: Dict[str, int]
    by_status: Dict[str, int]
    reports_per_day: List[Dict[str, Any]]
    recent_activity: List[RecentActivity]
