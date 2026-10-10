from __future__ import annotations

import hashlib
import re
import secrets
from typing import Optional

from fastapi import Header, Request

from ..config import get_settings
from ..schemas.errors import ApiError

_CLIENT_ID_RE = re.compile(r"^[A-Za-z0-9_-]{8,64}$")


def require_admin(x_admin_token: Optional[str] = Header(default=None)) -> str:
    """LOCAL DEMO AUTHORISATION ONLY.

    A single shared secret from the ADMIN_TOKEN environment variable, sent in the X-Admin-Token header.
    It is NOT user authentication: there are no accounts, no audit identity and no rate limiting.
    Replace with real authN/authZ (e.g. OAuth/OIDC + roles) before any production use.
    """
    expected = get_settings().admin_token
    if not expected:
        raise ApiError(
            503,
            "admin_disabled",
            "Status updates are disabled because ADMIN_TOKEN is not set on the server.",
        )
    if not x_admin_token or not secrets.compare_digest(x_admin_token.encode(), expected.encode()):
        raise ApiError(401, "unauthorized", "A valid admin token is required to change report status.")
    return "admin-demo"


def voter_identity(request: Request, x_client_id: Optional[str] = Header(default=None)) -> str:
    """Best-effort duplicate prevention for community votes.

    Uses an anonymous browser-generated id (X-Client-Id). When absent, falls back to a hash of the
    client IP + user-agent. Both can be evaded by a determined user; real prevention needs accounts.
    """
    if x_client_id:
        if not _CLIENT_ID_RE.match(x_client_id):
            raise ApiError(400, "invalid_client_id", "X-Client-Id must be 8-64 letters, digits, '-' or '_'.")
        return f"cid:{x_client_id}"
    ip = request.client.host if request.client else "unknown"
    ua = request.headers.get("user-agent", "")
    return "ip:" + hashlib.sha256(f"{ip}|{ua}".encode()).hexdigest()[:32]
