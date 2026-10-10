from __future__ import annotations

import math
from collections import Counter
from datetime import date, datetime, timedelta, timezone
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, col, select

from ..config import Settings, get_settings
from ..constants import ACTIVE_STATUSES, HAZARD_TYPES, SEVERITIES, STATUSES, HazardType, Severity, Status
from ..database import get_session
from ..models import Hazard, HazardEvent, Upload, Verification, utcnow
from ..schemas import (
    EventRead,
    HazardCreate,
    HazardDetail,
    HazardPage,
    HazardRead,
    RecentActivity,
    StatsResponse,
    StatusUpdate,
    VerifyRequest,
    VerifyResponse,
)
from ..schemas.errors import ApiError
from ..services.storage import image_url
from .deps import require_admin, voter_identity

router = APIRouter(tags=["hazards"])


def to_read(h: Hazard) -> HazardRead:
    data = HazardRead.model_validate(h)
    data.image_url = image_url(h.image_filename)
    return data


def _get_or_404(session: Session, hazard_id: int) -> Hazard:
    h = session.get(Hazard, hazard_id)
    if not h:
        raise ApiError(404, "not_found", f"Hazard {hazard_id} was not found.")
    return h


def _source_filter(stmt, source: str):
    if source == "demo":
        return stmt.where(Hazard.is_demo == True)  # noqa: E712
    if source == "real":
        return stmt.where(Hazard.is_demo == False)  # noqa: E712
    return stmt


# ------------------------------------------------------------------ list
@router.get("/hazards", response_model=HazardPage, summary="List hazards (filtered, paginated)")
def list_hazards(
    hazard_type: Optional[HazardType] = Query(None, alias="type"),
    severity: Optional[Severity] = None,
    status: Optional[Status] = None,
    active_only: bool = Query(False, description="Only reported / verified / in_progress"),
    flagged: bool = Query(False, description="Only reports with at least one 'flag' vote"),
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    source: str = Query("all", pattern="^(all|demo|real)$", description="Filter fictional demo data"),
    q: Optional[str] = Query(None, max_length=100, description="Search in description"),
    sort: str = Query("newest", pattern="^(newest|oldest|severity|verified)$"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
    session: Session = Depends(get_session),
):
    if date_from and date_to and date_from > date_to:
        raise ApiError(422, "validation_error", "date_from must not be after date_to.")

    stmt = select(Hazard)
    if hazard_type:
        stmt = stmt.where(Hazard.hazard_type == hazard_type)
    if severity:
        stmt = stmt.where(Hazard.severity == severity)
    if status:
        stmt = stmt.where(Hazard.status == status)
    if active_only:
        stmt = stmt.where(col(Hazard.status).in_(ACTIVE_STATUSES))
    if flagged:
        stmt = stmt.where(Hazard.flag_count > 0)
    if date_from:
        stmt = stmt.where(Hazard.created_at >= datetime.combine(date_from, datetime.min.time(), tzinfo=timezone.utc))
    if date_to:
        stmt = stmt.where(Hazard.created_at < datetime.combine(date_to + timedelta(days=1), datetime.min.time(), tzinfo=timezone.utc))
    if q:
        stmt = stmt.where(col(Hazard.description).ilike(f"%{q}%"))
    stmt = _source_filter(stmt, source)

    total = session.exec(select(func.count()).select_from(stmt.subquery())).one()

    if sort == "oldest":
        stmt = stmt.order_by(col(Hazard.created_at).asc())
    elif sort == "severity":
        rank = func.case((Hazard.severity == "high", 3), (Hazard.severity == "medium", 2), else_=1)
        stmt = stmt.order_by(rank.desc(), col(Hazard.created_at).desc())
    elif sort == "verified":
        stmt = stmt.order_by(col(Hazard.confirm_count).desc(), col(Hazard.created_at).desc())
    else:
        stmt = stmt.order_by(col(Hazard.created_at).desc())

    rows = session.exec(stmt.offset((page - 1) * page_size).limit(page_size)).all()
    return HazardPage(
        items=[to_read(h) for h in rows],
        total=total,
        page=page,
        page_size=page_size,
        pages=max(1, math.ceil(total / page_size)),
    )


# ---------------------------------------------------------------- create
@router.post("/hazards", response_model=HazardRead, status_code=201, summary="Create a hazard report")
def create_hazard(body: HazardCreate, session: Session = Depends(get_session)):
    image_filename = None
    detections: list = []
    ai_status = "manual"
    ai_model = None
    suggested = None

    if body.upload_id:
        upload = session.get(Upload, body.upload_id)
        if not upload:
            raise ApiError(422, "unknown_upload", "The referenced image upload does not exist.")
        if upload.claimed:
            raise ApiError(409, "upload_already_used", "This image has already been attached to a report.")
        upload.claimed = True
        session.add(upload)
        image_filename = upload.filename
        detections = upload.detections
        ai_status = upload.ai_status
        ai_model = upload.ai_model
        if detections:
            suggested = max(detections, key=lambda d: d["confidence"])["hazard_type"]

    hazard = Hazard(
        hazard_type=body.hazard_type,
        severity=body.severity,
        description=body.description,
        latitude=body.latitude,
        longitude=body.longitude,
        image_filename=image_filename,
        detections=detections,
        ai_status=ai_status,
        ai_model=ai_model,
        ai_suggested_type=suggested,
        ai_overridden=bool(suggested and suggested != body.hazard_type),
    )
    session.add(hazard)
    session.flush()
    session.add(
        HazardEvent(
            hazard_id=hazard.id,
            kind="created",
            to_status="reported",
            actor="reporter",
            note="Report submitted" + (" with image" if image_filename else " (no image)"),
        )
    )
    session.commit()
    session.refresh(hazard)
    return to_read(hazard)


# ----------------------------------------------------------------- stats
@router.get("/stats", response_model=StatsResponse, summary="Dashboard / admin summary analytics")
def stats(
    source: str = Query("all", pattern="^(all|demo|real)$"),
    days: int = Query(14, ge=3, le=90),
    session: Session = Depends(get_session),
):
    base = _source_filter(select(Hazard), source)
    hazards: List[Hazard] = session.exec(base).all()
    active = [h for h in hazards if h.status in ACTIVE_STATUSES]

    by_status = Counter(h.status for h in hazards)
    by_type = Counter(h.hazard_type for h in active)
    by_sev = Counter(h.severity for h in active)

    today = utcnow().date()
    per_day: Dict[date, int] = {today - timedelta(days=i): 0 for i in range(days - 1, -1, -1)}
    for h in hazards:
        d = h.created_at.date()
        if d in per_day:
            per_day[d] += 1

    ev_stmt = (
        select(HazardEvent, Hazard)
        .join(Hazard, Hazard.id == HazardEvent.hazard_id)
        .order_by(col(HazardEvent.created_at).desc(), col(HazardEvent.id).desc())
        .limit(12)
    )
    ev_stmt = _source_filter(ev_stmt, source)
    activity = [
        RecentActivity(
            event_id=e.id,
            hazard_id=h.id,
            kind=e.kind,
            hazard_type=h.hazard_type,
            severity=h.severity,
            from_status=e.from_status,
            to_status=e.to_status,
            actor=e.actor,
            created_at=e.created_at,
        )
        for e, h in session.exec(ev_stmt).all()
    ]

    return StatsResponse(
        total=len(hazards),
        active=len(active),
        high_severity_active=sum(1 for h in active if h.severity == "high"),
        verified=by_status.get("verified", 0),
        resolved=by_status.get("resolved", 0),
        in_progress=by_status.get("in_progress", 0),
        rejected=by_status.get("rejected", 0),
        flagged_for_review=sum(1 for h in active if h.flag_count > 0),
        by_type={t: by_type.get(t, 0) for t in HAZARD_TYPES},
        by_severity={s: by_sev.get(s, 0) for s in SEVERITIES},
        by_status={s: by_status.get(s, 0) for s in STATUSES},
        reports_per_day=[{"date": d.isoformat(), "count": c} for d, c in per_day.items()],
        recent_activity=activity,
    )


# ---------------------------------------------------------------- detail
@router.get("/hazards/{hazard_id}", response_model=HazardDetail, summary="Hazard detail with history")
def get_hazard(hazard_id: int, session: Session = Depends(get_session), settings: Settings = Depends(get_settings)):
    h = _get_or_404(session, hazard_id)
    events = session.exec(
        select(HazardEvent).where(HazardEvent.hazard_id == hazard_id).order_by(col(HazardEvent.created_at), col(HazardEvent.id))
    ).all()
    base = to_read(h).model_dump()
    return HazardDetail(**base, events=[EventRead.model_validate(e) for e in events], verify_threshold=settings.verify_threshold)


# ---------------------------------------------------------------- status
@router.patch(
    "/hazards/{hazard_id}/status",
    response_model=HazardRead,
    summary="Update report status (requires X-Admin-Token; local demo authorisation)",
)
def update_status(
    hazard_id: int,
    body: StatusUpdate,
    actor: str = Depends(require_admin),
    session: Session = Depends(get_session),
):
    h = _get_or_404(session, hazard_id)
    if h.status == body.status:
        raise ApiError(409, "no_change", f"Report is already '{h.status}'.")
    old = h.status
    h.status = body.status
    h.updated_at = utcnow()
    session.add(h)
    session.add(
        HazardEvent(hazard_id=h.id, kind="status_changed", from_status=old, to_status=body.status, note=body.note, actor=actor)
    )
    session.commit()
    session.refresh(h)
    return to_read(h)


# ---------------------------------------------------------------- verify
@router.post(
    "/hazards/{hazard_id}/verify",
    response_model=VerifyResponse,
    status_code=201,
    summary="Confirm or flag a hazard (one vote per anonymous client)",
)
def verify_hazard(
    hazard_id: int,
    body: VerifyRequest,
    voter: str = Depends(voter_identity),
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
):
    h = _get_or_404(session, hazard_id)
    if h.status in ("resolved", "rejected"):
        raise ApiError(409, "closed", f"This report is '{h.status}' and no longer accepts votes.")

    existing = session.exec(
        select(Verification).where(Verification.hazard_id == hazard_id, Verification.voter_id == voter)
    ).first()
    if existing:
        raise ApiError(409, "already_voted", f"You have already {existing.vote}ed this report.", {"vote": existing.vote})

    session.add(Verification(hazard_id=hazard_id, voter_id=voter, vote=body.vote, note=body.note))
    auto_verified = False
    if body.vote == "confirm":
        h.confirm_count += 1
        session.add(HazardEvent(hazard_id=h.id, kind="confirmed", note=body.note, actor="community"))
        if h.status == "reported" and h.confirm_count >= settings.verify_threshold:
            h.status = "verified"
            auto_verified = True
            session.add(
                HazardEvent(
                    hazard_id=h.id,
                    kind="status_changed",
                    from_status="reported",
                    to_status="verified",
                    actor="community",
                    note=f"Reached {settings.verify_threshold} community confirmations",
                )
            )
    else:
        h.flag_count += 1
        session.add(HazardEvent(hazard_id=h.id, kind="flagged", note=body.note, actor="community"))
    h.updated_at = utcnow()
    session.add(h)
    try:
        session.commit()  # unique constraint is the final guard against races
    except IntegrityError:
        session.rollback()
        raise ApiError(409, "already_voted", "You have already voted on this report.")
    session.refresh(h)
    return VerifyResponse(hazard=to_read(h), vote=body.vote, auto_verified=auto_verified)
