from __future__ import annotations

from fastapi import APIRouter, Depends, File, UploadFile
from fastapi.responses import FileResponse
from sqlmodel import Session

from ..config import Settings, get_settings
from ..database import get_session
from ..models import Upload
from ..schemas import DetectResponse
from ..services.detection import DISCLAIMER, DetectionUnavailable, get_detection_service
from ..services.storage import image_url, resolve_image_path, validate_and_store

router = APIRouter(tags=["detection"])


@router.post(
    "/detect",
    response_model=DetectResponse,
    summary="Upload a road image and run YOLO road-damage detection",
    description=(
        "Validates and stores the image (EXIF stripped, random filename) and runs the configured YOLO model. "
        "If no model is installed the response has `available=false`, `analyzed=false` and no detections: "
        "the image is still stored so a clearly-labelled manual report can reference it via `upload_id`."
    ),
)
def detect(
    file: UploadFile = File(...),
    session: Session = Depends(get_session),
    settings: Settings = Depends(get_settings),
):
    stored = validate_and_store(file.file, file.content_type, settings)
    service = get_detection_service(settings)

    analyzed, reason, model_name, detections = False, None, None, []
    try:
        outcome = service.detect(stored.image)
        analyzed, model_name = True, outcome.model_name
        detections = [
            {"label": d.label, "hazard_type": d.hazard_type, "confidence": d.confidence, "box": d.box}
            for d in outcome.detections
        ]
    except DetectionUnavailable as exc:
        reason = str(exc)
    except Exception:  # inference failure must never be reported as "no hazards found"
        reason = "The model failed while analysing this image. Please submit a manual report."

    session.add(
        Upload(
            id=stored.upload_id,
            filename=stored.filename,
            width=stored.width,
            height=stored.height,
            ai_status="analyzed" if analyzed else "unavailable",
            ai_model=model_name,
            ai_reason=reason,
            detections=detections,
        )
    )
    session.commit()

    suggested = max(detections, key=lambda d: d["confidence"])["hazard_type"] if detections else None
    return DetectResponse(
        upload_id=stored.upload_id,
        available=analyzed,
        analyzed=analyzed,
        model=model_name,
        reason=reason,
        image_url=image_url(stored.filename),
        image_width=stored.width,
        image_height=stored.height,
        detections=detections,
        suggested_type=suggested,
        disclaimer=DISCLAIMER,
    )


@router.get("/images/{filename}", summary="Serve a stored report image", include_in_schema=True)
def get_image(filename: str, settings: Settings = Depends(get_settings)):
    path = resolve_image_path(filename, settings)
    return FileResponse(
        path,
        media_type="image/jpeg",
        headers={"Cache-Control": "public, max-age=86400", "X-Content-Type-Options": "nosniff"},
    )
