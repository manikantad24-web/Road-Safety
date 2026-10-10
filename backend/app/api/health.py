from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlmodel import Session

from ..config import Settings, get_settings
from ..database import get_session
from ..services.detection import get_detection_service

router = APIRouter(tags=["health"])


@router.get("/health", summary="Service health, AI model availability and routing configuration")
def health(session: Session = Depends(get_session), settings: Settings = Depends(get_settings)):
    try:
        session.exec(text("SELECT 1"))
        db = "ok"
    except Exception:
        db = "error"
    ai = get_detection_service(settings).status()
    return {
        "status": "ok" if db == "ok" else "degraded",
        "version": settings.app_version,
        "database": db,
        "ai": {"available": ai["available"], "model": ai["model"], "classes": ai["classes"], "reason": ai["reason"]},
        "routing": {"provider": settings.routing_provider},
        "admin_configured": bool(settings.admin_token),
        "verify_threshold": settings.verify_threshold,
        "max_upload_mb": settings.max_upload_mb,
    }
