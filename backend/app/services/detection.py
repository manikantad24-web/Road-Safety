"""Road-damage detection service (Ultralytics YOLO).

This module never fabricates detections. If the `ultralytics` package or the weights file is missing,
`status()` reports `available=False` with a reason and `detect()` raises `DetectionUnavailable`.

Model setup is documented in the README. Any Ultralytics-compatible YOLO weights trained on road damage
can be used (e.g. the RDD2022 classes D00/D10/D20/D40, or a pothole-only model). Point
YOLO_WEIGHTS_PATH at the .pt file. If your model uses different class names, set DETECTION_CLASS_MAP.
"""
from __future__ import annotations

import os
import threading
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from PIL import Image

from ..config import Settings

# Default mapping of common road-damage class names -> RoadGuardian hazard types.
DEFAULT_CLASS_MAP: Dict[str, str] = {
    # RDD2022 / RDD2020
    "d00": "crack",  # longitudinal crack
    "d10": "crack",  # transverse crack
    "d20": "surface_damage",  # alligator crack
    "d40": "pothole",
    "d43": "surface_damage",  # crosswalk blur
    "d44": "surface_damage",  # white-line blur
    # Descriptive names
    "pothole": "pothole",
    "potholes": "pothole",
    "crack": "crack",
    "cracks": "crack",
    "longitudinal crack": "crack",
    "transverse crack": "crack",
    "longitudinal_crack": "crack",
    "transverse_crack": "crack",
    "alligator crack": "surface_damage",
    "alligator_crack": "surface_damage",
    "alligator cracking": "surface_damage",
    "rutting": "surface_damage",
    "patch": "surface_damage",
}

DISCLAIMER = (
    "Image detection can locate visible damage patterns but cannot establish real-world severity or "
    "danger with certainty. Camera angle, lighting, wet surfaces and shadows all affect results. "
    "Please review the AI suggestion and choose the type and severity yourself."
)


class DetectionUnavailable(Exception):
    pass


@dataclass
class RawDetection:
    label: str
    hazard_type: str
    confidence: float
    box: Dict[str, float]  # normalised x1,y1,x2,y2 in 0-1


@dataclass
class DetectionOutcome:
    model_name: str
    detections: List[RawDetection] = field(default_factory=list)

    @property
    def suggested_type(self) -> Optional[str]:
        if not self.detections:
            return None
        return max(self.detections, key=lambda d: d.confidence).hazard_type


class DetectionService:
    def __init__(self, settings: Settings):
        self.settings = settings
        self._model: Any = None
        self._load_error: Optional[str] = None
        self._lock = threading.Lock()
        self._class_map = {**DEFAULT_CLASS_MAP, **settings.class_map_override}

    # ------------------------------------------------------------------ status
    def _ensure_loaded(self) -> None:
        if self._model is not None:
            return
        with self._lock:
            if self._model is not None:
                return
            weights = self.settings.yolo_weights_path
            if not weights.is_file():
                self._load_error = (
                    "No model weights found. Download road-damage YOLO weights and set "
                    "YOLO_WEIGHTS_PATH (see README, 'AI model setup')."
                )
                return
            try:
                # Never let a web request trigger pip installs or network calls from inside Ultralytics.
                os.environ.setdefault("YOLO_AUTOINSTALL", "False")
                os.environ.setdefault("YOLO_VERBOSE", "False")
                from ultralytics import YOLO  # imported lazily: heavy dependency
            except Exception:  # ImportError or a broken torch install
                self._load_error = (
                    "The 'ultralytics' package is not installed. Run: pip install -r requirements-ai.txt"
                )
                return
            try:
                self._model = YOLO(str(weights))
                self._load_error = None
            except Exception as exc:  # corrupt / incompatible weights
                self._load_error = f"Model weights could not be loaded ({type(exc).__name__})."

    def status(self) -> Dict[str, Any]:
        self._ensure_loaded()
        if self._model is not None:
            names = getattr(self._model, "names", {}) or {}
            return {
                "available": True,
                "model": self.settings.yolo_weights_path.name,
                "classes": [str(n) for n in (names.values() if isinstance(names, dict) else names)],
                "reason": None,
            }
        return {"available": False, "model": None, "classes": [], "reason": self._load_error}

    # ------------------------------------------------------------------ inference
    def detect(self, image: Image.Image) -> DetectionOutcome:
        self._ensure_loaded()
        if self._model is None:
            raise DetectionUnavailable(self._load_error or "AI model unavailable.")

        s = self.settings
        results = self._model.predict(
            image, conf=s.yolo_conf, iou=s.yolo_iou, imgsz=s.yolo_imgsz, verbose=False
        )
        names = self._model.names
        out: List[RawDetection] = []
        w, h = image.size
        for r in results:
            boxes = getattr(r, "boxes", None)
            if boxes is None:
                continue
            for cls_id, conf, xyxy in zip(boxes.cls.tolist(), boxes.conf.tolist(), boxes.xyxy.tolist()):
                label = str(names[int(cls_id)])
                x1, y1, x2, y2 = xyxy
                out.append(
                    RawDetection(
                        label=label,
                        hazard_type=self._class_map.get(label.strip().lower(), "other"),
                        confidence=round(float(conf), 4),
                        box={
                            "x1": round(max(0.0, x1 / w), 5),
                            "y1": round(max(0.0, y1 / h), 5),
                            "x2": round(min(1.0, x2 / w), 5),
                            "y2": round(min(1.0, y2 / h), 5),
                        },
                    )
                )
        out.sort(key=lambda d: d.confidence, reverse=True)
        return DetectionOutcome(model_name=s.yolo_weights_path.name, detections=out)


_service: Optional[DetectionService] = None


def get_detection_service(settings: Settings) -> DetectionService:
    global _service
    if _service is None:
        _service = DetectionService(settings)
    return _service


def reset_detection_service() -> None:
    global _service
    _service = None
