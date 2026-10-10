from datetime import datetime, timezone
from typing import Any, List, Optional

from sqlalchemy import JSON, Column, UniqueConstraint
from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    """Timezone-aware UTC timestamp. Serialised with a 'Z' suffix in schemas."""
    return datetime.now(timezone.utc)


class Upload(SQLModel, table=True):
    """An image accepted by /api/detect, with the server-side detection result.

    Detection output is stored server-side so a report cannot carry client-fabricated AI results.
    """

    id: str = Field(primary_key=True)
    filename: str
    width: int
    height: int
    ai_status: str  # "analyzed" | "unavailable"
    ai_model: Optional[str] = None
    ai_reason: Optional[str] = None
    detections: List[Any] = Field(default_factory=list, sa_column=Column(JSON))
    claimed: bool = Field(default=False, index=True)
    created_at: datetime = Field(default_factory=utcnow)


class Hazard(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    hazard_type: str = Field(index=True)
    severity: str = Field(index=True)
    status: str = Field(default="reported", index=True)
    description: str = ""
    latitude: float = Field(index=True)
    longitude: float = Field(index=True)

    image_filename: Optional[str] = None
    detections: List[Any] = Field(default_factory=list, sa_column=Column(JSON))
    # "analyzed"   -> a real model ran on the image
    # "unavailable"-> an image was attached but no model was available (manual report)
    # "manual"     -> no image attached
    ai_status: str = "manual"
    ai_model: Optional[str] = None
    ai_suggested_type: Optional[str] = None
    ai_overridden: bool = False  # the reporter chose a different type than the AI suggested

    confirm_count: int = 0
    flag_count: int = 0
    is_demo: bool = Field(default=False, index=True)

    created_at: datetime = Field(default_factory=utcnow, index=True)
    updated_at: datetime = Field(default_factory=utcnow)


class Verification(SQLModel, table=True):
    __table_args__ = (UniqueConstraint("hazard_id", "voter_id", name="uq_verification_voter"),)

    id: Optional[int] = Field(default=None, primary_key=True)
    hazard_id: int = Field(foreign_key="hazard.id", index=True)
    voter_id: str = Field(index=True)
    vote: str  # "confirm" | "flag"
    note: str = ""
    created_at: datetime = Field(default_factory=utcnow)


class HazardEvent(SQLModel, table=True):
    """Append-only history of a report (creation, votes, status changes)."""

    id: Optional[int] = Field(default=None, primary_key=True)
    hazard_id: int = Field(foreign_key="hazard.id", index=True)
    kind: str  # created | confirmed | flagged | status_changed
    from_status: Optional[str] = None
    to_status: Optional[str] = None
    note: str = ""
    actor: str = "system"  # reporter | community | admin-demo | system
    created_at: datetime = Field(default_factory=utcnow, index=True)
