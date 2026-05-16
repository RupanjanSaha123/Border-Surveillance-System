"""
Alerts router
  GET    /api/alerts          — paginated alert history
  POST   /api/alerts          — create a new alert (+ broadcast via SSE)
  PATCH  /api/alerts/{id}/acknowledge — acknowledge an alert
  DELETE /api/alerts/{id}     — delete an alert
  GET    /api/alerts/stream   — SSE stream of live alerts
"""
import asyncio
import json
from datetime import datetime
from typing import AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlmodel import Session, select, desc

from database import get_session, Alert
from dependencies import get_current_operator
from schemas import AlertCreate, AlertRead, AcknowledgeRequest

router = APIRouter(prefix="/api/alerts", tags=["alerts"])

# ─── In-memory SSE subscriber queues ─────────────────────────────────────────
_subscribers: list[asyncio.Queue] = []


def _broadcast(alert_dict: dict):
    """Push an alert to every active SSE subscriber."""
    for q in _subscribers:
        try:
            q.put_nowait(alert_dict)
        except asyncio.QueueFull:
            pass  # slow consumer — skip


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.get("", response_model=list[AlertRead])
async def list_alerts(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    sector: str | None = Query(None),
    alert_type: str | None = Query(None),
    session: Session = Depends(get_session),
    _op=Depends(get_current_operator),
):
    query = select(Alert).order_by(desc(Alert.timestamp))
    if sector:
        query = query.where(Alert.sector == sector.upper())
    if alert_type:
        query = query.where(Alert.alert_type == alert_type.lower())
    alerts = session.exec(query.offset(skip).limit(limit)).all()
    return alerts


@router.post("", response_model=AlertRead, status_code=201)
async def create_alert(
    body: AlertCreate,
    session: Session = Depends(get_session),
    _op=Depends(get_current_operator),
):
    alert = Alert(**body.model_dump())
    session.add(alert)
    session.commit()
    session.refresh(alert)

    # Broadcast to all SSE listeners
    _broadcast({
        "id": alert.id,
        "timestamp": alert.timestamp.isoformat(),
        "sector": alert.sector,
        "threat": alert.threat,
        "camera": alert.camera,
        "lat": alert.lat,
        "lng": alert.lng,
        "alert_type": alert.alert_type,
        "acknowledged": alert.acknowledged,
    })

    return alert


@router.patch("/{alert_id}/acknowledge", response_model=AlertRead)
async def acknowledge_alert(
    alert_id: int,
    body: AcknowledgeRequest,
    session: Session = Depends(get_session),
    _op=Depends(get_current_operator),
):
    alert = session.get(Alert, alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.acknowledged = True
    alert.acknowledged_by = body.call_sign
    session.add(alert)
    session.commit()
    session.refresh(alert)
    return alert


@router.delete("/{alert_id}", status_code=204)
async def delete_alert(
    alert_id: int,
    session: Session = Depends(get_session),
    _op=Depends(get_current_operator),
):
    alert = session.get(Alert, alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    session.delete(alert)
    session.commit()


# ─── SSE stream ───────────────────────────────────────────────────────────────

async def _event_generator(queue: asyncio.Queue) -> AsyncGenerator[str, None]:
    """Yield SSE-formatted events from the subscriber queue."""
    from config import settings
    try:
        while True:
            try:
                # Wait for next alert with heartbeat timeout
                data = await asyncio.wait_for(
                    queue.get(), timeout=settings.SSE_HEARTBEAT
                )
                yield f"event: alert\ndata: {json.dumps(data)}\n\n"
            except asyncio.TimeoutError:
                # Heartbeat to keep the connection alive
                yield f"event: heartbeat\ndata: {json.dumps({'ts': datetime.utcnow().isoformat()})}\n\n"
    except asyncio.CancelledError:
        pass


@router.get("/stream")
async def alert_stream(_op=Depends(get_current_operator)):
    """
    Server-Sent Events endpoint.
    The frontend connects once and receives every new alert in real time.
    """
    queue: asyncio.Queue = asyncio.Queue(maxsize=100)
    _subscribers.append(queue)

    async def cleanup():
        async for chunk in _event_generator(queue):
            yield chunk
        _subscribers.remove(queue)

    return StreamingResponse(
        cleanup(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Connection": "keep-alive",
        },
    )
