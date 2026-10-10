"""Uniform error body: {"error": {"code": "...", "message": "...", "details": [...]}}"""
from __future__ import annotations

from typing import Any, Optional


class ApiError(Exception):
    def __init__(self, status_code: int, code: str, message: str, details: Optional[Any] = None):
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details
        super().__init__(message)

    def body(self) -> dict:
        err: dict = {"code": self.code, "message": self.message}
        if self.details is not None:
            err["details"] = self.details
        return {"error": err}
