"""Shared enumerations (kept as plain string literals so they serialize cleanly)."""
from typing import Literal, get_args

HazardType = Literal[
    "pothole", "crack", "surface_damage", "debris", "waterlogging", "missing_signage", "other"
]
Severity = Literal["low", "medium", "high"]
Status = Literal["reported", "verified", "in_progress", "resolved", "rejected"]
Vote = Literal["confirm", "flag"]

HAZARD_TYPES = get_args(HazardType)
SEVERITIES = get_args(Severity)
STATUSES = get_args(Status)

ACTIVE_STATUSES = ("reported", "verified", "in_progress")
