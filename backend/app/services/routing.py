"""Routing provider adapter.

Add a new provider by implementing `RoutingProvider.get_routes` and registering it in `get_provider`.
No fallback geometry is ever invented: if the provider cannot be reached, `RoutingUnavailable` is raised.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import List, Protocol, Tuple

import httpx

from ..config import Settings

LatLng = Tuple[float, float]


class RoutingUnavailable(Exception):
    pass


@dataclass
class CandidateRoute:
    distance_m: float
    duration_s: float
    geometry: List[LatLng]  # [(lat, lng), ...]


class RoutingProvider(Protocol):
    name: str

    def get_routes(self, origin: LatLng, destination: LatLng) -> List[CandidateRoute]: ...


class OSRMProvider:
    name = "osrm"

    def __init__(self, settings: Settings):
        self.base_url = settings.osrm_base_url.rstrip("/")
        self.timeout = settings.routing_timeout_s
        self.want_alternatives = settings.routing_max_alternatives

    def get_routes(self, origin: LatLng, destination: LatLng) -> List[CandidateRoute]:
        coords = f"{origin[1]:.6f},{origin[0]:.6f};{destination[1]:.6f},{destination[0]:.6f}"
        url = f"{self.base_url}/route/v1/driving/{coords}"
        params = {
            "alternatives": str(self.want_alternatives) if self.want_alternatives > 1 else "false",
            "overview": "full",
            "geometries": "geojson",
            "steps": "false",
        }
        try:
            resp = httpx.get(url, params=params, timeout=self.timeout, headers={"User-Agent": "RoadGuardian/1.0"})
        except httpx.HTTPError as exc:
            raise RoutingUnavailable(f"Could not reach the routing service ({type(exc).__name__}).") from exc

        if resp.status_code != 200:
            try:
                msg = resp.json().get("message") or resp.json().get("code")
            except ValueError:
                msg = None
            if resp.status_code == 400 or (msg and "NoRoute" in str(msg)):
                raise RoutingUnavailable("The routing service found no drivable route between these points.")
            raise RoutingUnavailable(f"The routing service returned an error (HTTP {resp.status_code}).")

        try:
            data = resp.json()
        except ValueError as exc:
            raise RoutingUnavailable("The routing service returned an unreadable response.") from exc
        if data.get("code") != "Ok" or not data.get("routes"):
            raise RoutingUnavailable("The routing service found no drivable route between these points.")

        routes: List[CandidateRoute] = []
        for r in data["routes"][: max(1, self.want_alternatives)]:
            coords_ll = r["geometry"]["coordinates"]  # [[lng, lat], ...]
            routes.append(
                CandidateRoute(
                    distance_m=float(r["distance"]),
                    duration_s=float(r["duration"]),
                    geometry=[(round(lat, 6), round(lng, 6)) for lng, lat in coords_ll],
                )
            )
        return routes


def get_provider(settings: Settings) -> RoutingProvider:
    if settings.routing_provider.lower() == "osrm":
        return OSRMProvider(settings)
    raise RoutingUnavailable(f"Unknown routing provider '{settings.routing_provider}'.")
