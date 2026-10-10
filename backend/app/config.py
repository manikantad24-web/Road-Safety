"""Application configuration, loaded from environment variables (or a local .env file).

Nothing in here is exposed to the frontend. See ../.env.example for documentation of each value.
"""
from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Dict, List

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BACKEND_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # --- General ---------------------------------------------------------
    app_name: str = "RoadGuardian API"
    app_version: str = "1.0.0"
    database_url: str = f"sqlite:///{BACKEND_DIR / 'data' / 'roadguardian.db'}"
    upload_dir: Path = BACKEND_DIR / "uploads"
    max_upload_mb: float = 8.0
    max_image_pixels: int = 40_000_000
    max_stored_image_side: int = 2048
    allowed_origins: str = "http://localhost:5173,http://127.0.0.1:5173"

    # --- Admin (LOCAL DEMO ONLY: a single shared token, not real user auth) --
    admin_token: str = ""

    # --- Community verification -------------------------------------------
    verify_threshold: int = 3  # confirmations needed to auto-promote "reported" -> "verified"

    # --- AI detection ------------------------------------------------------
    yolo_weights_path: Path = BACKEND_DIR / "models_weights" / "road_damage.pt"
    yolo_conf: float = 0.25
    yolo_iou: float = 0.45
    yolo_imgsz: int = 640
    # Optional JSON object mapping model class names to RoadGuardian hazard types.
    detection_class_map: str = ""

    # --- Routing -----------------------------------------------------------
    routing_provider: str = "osrm"
    # The public OSRM demo server is for light demo use only. Self-host OSRM for real use.
    osrm_base_url: str = "https://router.project-osrm.org"
    routing_timeout_s: float = 12.0
    routing_max_alternatives: int = 3
    route_detour_threshold_percent: float = 20.0  # safer alternatives beyond this detour are not recommended

    # --- Risk scoring (see app/services/risk.py and README) ----------------
    risk_buffer_m: float = 60.0  # hazards farther than this from the route are ignored
    risk_weight_low: float = 1.0
    risk_weight_medium: float = 2.5
    risk_weight_high: float = 5.0
    risk_recency_half_life_days: float = 30.0
    risk_recency_floor: float = 0.15
    risk_confirm_bonus: float = 0.2
    risk_flag_penalty: float = 0.3
    risk_verification_min: float = 0.3
    risk_verification_max: float = 2.0
    risk_proximity_edge_factor: float = 0.3  # weight of a hazard sitting exactly at the buffer edge
    risk_saturation_scale: float = 10.0  # raw score at which the 0-100 index reaches ~63

    @field_validator("upload_dir", "yolo_weights_path", mode="after")
    @classmethod
    def _resolve_paths(cls, v: Path) -> Path:
        return v if v.is_absolute() else (BACKEND_DIR / v).resolve()

    @property
    def cors_origins(self) -> List[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    @property
    def max_upload_bytes(self) -> int:
        return int(self.max_upload_mb * 1024 * 1024)

    @property
    def class_map_override(self) -> Dict[str, str]:
        if not self.detection_class_map.strip():
            return {}
        try:
            data = json.loads(self.detection_class_map)
            return {str(k).lower(): str(v) for k, v in data.items()}
        except (ValueError, AttributeError):
            return {}


@lru_cache
def get_settings() -> Settings:
    return Settings()
