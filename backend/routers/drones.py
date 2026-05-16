"""
Drone telemetry router
  GET  /api/drones            — snapshot of all drone states
  WS   /api/drones/ws         — WebSocket stream: server pushes telemetry every N seconds
"""
import asyncio
import json
import math
import random
from typing import Any

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect
from sqlmodel import Session, select

from database import get_session, SystemSettings
from dependencies import get_current_operator
from schemas import DroneTelemetry

router = APIRouter(prefix="/api/drones", tags=["drones"])

# ─── Drone state store (in-memory simulation) ────────────────────────────────

_DRONE_BASES = [
    {"id": 1, "name": "DRONE-ALPHA",   "lat": 32.4512, "lng": 75.6831, "alt": 450, "sector": "ALPHA"},
    {"id": 2, "name": "DRONE-BRAVO",   "lat": 32.4889, "lng": 75.7102, "alt": 420, "sector": "BRAVO"},
    {"id": 3, "name": "DRONE-CHARLIE", "lat": 32.4210, "lng": 75.6540, "alt": 510, "sector": "CHARLIE"},
    {"id": 4, "name": "DRONE-DELTA",   "lat": 32.5003, "lng": 75.7380, "alt": 390, "sector": "DELTA"},
]

# Mutable runtime state for each drone
_drone_state: dict[int, dict[str, Any]] = {
    d["id"]: {
        **d,
        "signal":  random.randint(88, 100),
        "battery": random.randint(75, 100),
        "temp":    round(random.uniform(28, 38), 1),
        "wind":    round(random.uniform(5, 18), 1),
        "status":  "MOCK",
        "threat":  "CLEAR",
        # patrol angle for circular orbit simulation
        "_angle":  random.uniform(0, 2 * math.pi),
    }
    for d in _DRONE_BASES
}


def _tick_drone(state: dict) -> dict:
    """Advance one telemetry tick and return updated state."""
    # Orbit: small circular drift around the base position
    state["_angle"] += random.uniform(0.02, 0.05)
    r = 0.008  # ~900 m radius
    base = next(d for d in _DRONE_BASES if d["id"] == state["id"])
    state["lat"] = round(base["lat"] + r * math.cos(state["_angle"]), 6)
    state["lng"] = round(base["lng"] + r * math.sin(state["_angle"]), 6)

    # Simulate sensor fluctuations
    state["signal"]  = max(60, min(100, state["signal"]  + random.randint(-2, 2)))
    state["battery"] = max(10, min(100, state["battery"] - random.uniform(0, 0.15)))
    state["temp"]    = round(max(20, min(55,  state["temp"]  + random.uniform(-0.5, 0.5))), 1)
    state["wind"]    = round(max(0,  min(40,  state["wind"]  + random.uniform(-1, 1))),    1)
    state["alt"]     = round(base["alt"] + random.uniform(-5, 5), 1)

    return state


def _state_to_schema(state: dict) -> dict:
    return {
        "id":      state["id"],
        "name":    state["name"],
        "lat":     state["lat"],
        "lng":     state["lng"],
        "alt":     state["alt"],
        "signal":  state["signal"],
        "battery": round(state["battery"]),
        "temp":    state["temp"],
        "wind":    state["wind"],
        "status":  state["status"],
        "threat":  state["threat"],
    }


# ─── Connected WebSocket clients ──────────────────────────────────────────────

_ws_clients: list[WebSocket] = []


async def _telemetry_broadcast_loop():
    """
    Background task: tick all drones and push JSON to every WS client.
    Started once from main.py on startup.
    """
    from config import settings
    while True:
        await asyncio.sleep(settings.DRONE_TELEMETRY_INTERVAL)
        payload = []
        for drone_id, state in _drone_state.items():
            _tick_drone(state)
            payload.append(_state_to_schema(state))

        msg = json.dumps({"type": "telemetry", "drones": payload})
        dead: list[WebSocket] = []
        for ws in _ws_clients:
            try:
                await ws.send_text(msg)
            except Exception:
                dead.append(ws)
        for ws in dead:
            _ws_clients.remove(ws)


# ─── Routes ───────────────────────────────────────────────────────────────────

@router.get("", response_model=list[DroneTelemetry])
def get_drones(_op=Depends(get_current_operator)):
    """Snapshot of all drone telemetry — no WebSocket required."""
    return [_state_to_schema(s) for s in _drone_state.values()]


@router.websocket("/ws")
async def drone_ws(websocket: WebSocket):
    """
    WebSocket endpoint for real-time drone telemetry.
    Auth: pass token as query param ?token=<JWT>
    """
    from auth import decode_token
    token = websocket.query_params.get("token")
    if not token or decode_token(token) is None:
        await websocket.close(code=4001, reason="Unauthorized")
        return

    await websocket.accept()
    _ws_clients.append(websocket)

    # Send initial snapshot immediately
    snapshot = [_state_to_schema(s) for s in _drone_state.values()]
    await websocket.send_text(json.dumps({"type": "telemetry", "drones": snapshot}))

    try:
        # Keep alive — just echo back any ping from client
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text(json.dumps({"type": "pong"}))
    except WebSocketDisconnect:
        if websocket in _ws_clients:
            _ws_clients.remove(websocket)


# expose the loop function so main.py can start it
telemetry_broadcast_loop = _telemetry_broadcast_loop
