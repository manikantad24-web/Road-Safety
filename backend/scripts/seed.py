"""Seed FICTIONAL demonstration reports.

All rows are created with is_demo=True and a "(Fictional demo report)" description prefix, so they are
always distinguishable from real reports and can be removed without touching real data:

    python -m scripts.seed            # add demo reports (no-op if demo reports already exist)
    python -m scripts.seed --reset    # delete ONLY demo rows, then re-seed
    python -m scripts.seed --clear    # delete ONLY demo rows
    python -m scripts.seed --center 18.5204 73.8567   # use another sample-area centre

The sample area is a ~3 km box around SEED_CENTER_LAT / SEED_CENTER_LNG (default: central Pune, India).
The locations are arbitrary coordinates and do NOT correspond to real road defects.
"""
from __future__ import annotations

import argparse
import os
import random
from datetime import timedelta

from sqlmodel import Session, delete, select

from app.database import get_engine, init_db
from app.models import Hazard, HazardEvent, Verification, utcnow

PREFIX = "(Fictional demo report) "

# (type, severity, status, dlat_m, dlng_m, age_days, confirms, flags, description)
DEMO = [
    ("pothole", "high", "verified", 150, -200, 3, 5, 0, "Deep pothole in the left wheel path near the junction."),
    ("pothole", "medium", "reported", 420, 310, 1, 1, 0, "Medium pothole beside the bus stop."),
    ("crack", "low", "reported", -380, 120, 9, 0, 0, "Longitudinal crack running along the lane edge."),
    ("surface_damage", "high", "verified", -90, 540, 6, 4, 0, "Alligator cracking and loose surface over a 10 m stretch."),
    ("debris", "medium", "reported", 700, -150, 0, 2, 0, "Construction debris partly blocking the left lane."),
    ("waterlogging", "high", "in_progress", -560, -420, 12, 6, 0, "Water pools across the lane after rain; depth unclear."),
    ("missing_signage", "medium", "reported", 260, 780, 15, 1, 1, "Faded stop sign at an uncontrolled crossing."),
    ("pothole", "low", "resolved", -250, -80, 40, 3, 0, "Small pothole, patched by the local ward office."),
    ("pothole", "high", "reported", 980, 90, 2, 1, 0, "Large pothole close to a speed bump, hard to see at dusk."),
    ("crack", "medium", "verified", -700, 360, 21, 4, 0, "Transverse cracks every few metres."),
    ("surface_damage", "medium", "reported", 40, -640, 7, 0, 2, "Possible rutting; one reader flagged this as just a shadow."),
    ("debris", "low", "resolved", 520, -520, 33, 2, 0, "Fallen branch, cleared."),
    ("pothole", "medium", "in_progress", -820, -60, 18, 5, 0, "Cluster of potholes, repair crew scheduled."),
    ("waterlogging", "medium", "reported", 330, 1120, 4, 1, 0, "Drain overflow at the underpass entrance."),
    ("missing_signage", "low", "rejected", -150, 900, 25, 0, 3, "Reported missing sign; flagged and rejected as duplicate."),
    ("pothole", "high", "verified", 760, 640, 5, 7, 0, "Edge-of-carriageway pothole forcing vehicles to swerve."),
    ("crack", "low", "reported", -430, -760, 11, 0, 0, "Hairline crack along a patched section."),
    ("surface_damage", "high", "reported", 120, 260, 1, 2, 0, "Collapsed edge where the drain cover meets the road."),
]


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--reset", action="store_true", help="delete demo rows then re-seed")
    ap.add_argument("--clear", action="store_true", help="delete demo rows and exit")
    ap.add_argument("--center", nargs=2, type=float, metavar=("LAT", "LNG"))
    args = ap.parse_args()

    lat0 = args.center[0] if args.center else float(os.getenv("SEED_CENTER_LAT", "18.5204"))
    lng0 = args.center[1] if args.center else float(os.getenv("SEED_CENTER_LNG", "73.8567"))

    init_db()
    with Session(get_engine()) as s:
        if args.reset or args.clear:
            ids = [h.id for h in s.exec(select(Hazard).where(Hazard.is_demo == True)).all()]  # noqa: E712
            if ids:
                s.exec(delete(Verification).where(Verification.hazard_id.in_(ids)))
                s.exec(delete(HazardEvent).where(HazardEvent.hazard_id.in_(ids)))
                s.exec(delete(Hazard).where(Hazard.id.in_(ids)))
                s.commit()
            print(f"Removed {len(ids)} demo reports (real reports untouched).")
            if args.clear:
                return

        if s.exec(select(Hazard).where(Hazard.is_demo == True).limit(1)).first():  # noqa: E712
            print("Demo reports already present; use --reset to re-seed. Nothing changed.")
            return

        rng = random.Random(42)  # deterministic sub-day jitter
        now = utcnow()
        m_per_deg_lat = 111_320.0
        import math

        m_per_deg_lng = m_per_deg_lat * math.cos(math.radians(lat0))
        for typ, sev, status, dlat, dlng, age, conf, flag, desc in DEMO:
            created = now - timedelta(days=age, hours=rng.randint(0, 20), minutes=rng.randint(0, 59))
            h = Hazard(
                hazard_type=typ,
                severity=sev,
                status=status,
                description=PREFIX + desc,
                latitude=round(lat0 + dlat / m_per_deg_lat, 6),
                longitude=round(lng0 + dlng / m_per_deg_lng, 6),
                ai_status="manual",  # demo rows have no image and no AI analysis
                confirm_count=conf,
                flag_count=flag,
                is_demo=True,
                created_at=created,
                updated_at=created,
            )
            s.add(h)
            s.flush()
            s.add(HazardEvent(hazard_id=h.id, kind="created", to_status="reported", actor="reporter", note="Demo report", created_at=created))
            for i in range(conf):
                s.add(Verification(hazard_id=h.id, voter_id=f"demo-voter-{i}", vote="confirm", created_at=created + timedelta(hours=2 + i)))
                s.add(HazardEvent(hazard_id=h.id, kind="confirmed", actor="community", created_at=created + timedelta(hours=2 + i)))
            for i in range(flag):
                s.add(Verification(hazard_id=h.id, voter_id=f"demo-flagger-{i}", vote="flag", created_at=created + timedelta(hours=3 + i)))
                s.add(HazardEvent(hazard_id=h.id, kind="flagged", actor="community", created_at=created + timedelta(hours=3 + i)))
            if status != "reported":
                s.add(
                    HazardEvent(
                        hazard_id=h.id,
                        kind="status_changed",
                        from_status="reported",
                        to_status=status,
                        actor="community" if status == "verified" else "admin-demo",
                        note="Demo status change",
                        created_at=created + timedelta(days=min(age, 1), hours=1),
                    )
                )
        s.commit()
        print(f"Seeded {len(DEMO)} fictional demo reports around ({lat0}, {lng0}).")


if __name__ == "__main__":
    main()
