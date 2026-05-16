"""
System health router
  GET /api/health   — public liveness check
  GET /api/status   — authenticated full system status
"""
import time
from fastapi import APIRouter, Depends
from sqlmodel import Session, select, func

from database import get_session, Alert, SystemSettings
from dependencies import get_current_operator
from schemas import SystemHealth

router = APIRouter(tags=["health"])

_START_TIME = time.time()
_VERSION = "v2.4.1-ALPHA"


@router.get("/api/health")
def health_check():
    """Public — used by Docker/load balancer probes."""
    return {"status": "ok", "version": _VERSION}


@router.get("/api/status", response_model=SystemHealth)
def system_status(
    session: Session = Depends(get_session),
    _op=Depends(get_current_operator),
):
    cfg = session.exec(select(SystemSettings)).first()
    active_alerts = session.exec(
        select(func.count(Alert.id)).where(Alert.acknowledged == False)  # noqa: E712
    ).one()

    return SystemHealth(
        status="operational",
        drones_online=cfg.drones_online if cfg else 12,
        sat_link="SECURE",
        power_level=98,
        uptime_seconds=int(time.time() - _START_TIME),
        active_alerts=active_alerts,
        version=_VERSION,
    )
