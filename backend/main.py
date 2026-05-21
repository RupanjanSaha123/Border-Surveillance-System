"""
BSC-DOP Border Surveillance Command — FastAPI Backend
Entry point: main.py
Run with:  uvicorn main:app --reload --port 8000
"""
import asyncio
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from database import create_db_and_tables, seed_operators, seed_settings
from routers import auth, alerts, drones, settings as settings_router, health, cameras
from routers import detection as detection_router

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(name)s] %(levelname)s: %(message)s",
    datefmt="%H:%M:%S",
)


# ─── Lifespan ─────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    # ── Startup ──
    print("BSC-DOP Backend starting up...")
    create_db_and_tables()
    seed_operators()
    seed_settings()
    print("Database ready.")

    # Start drone telemetry background broadcast loop
    task = asyncio.create_task(drones.telemetry_broadcast_loop())
    print(f"Drone telemetry broadcast started (interval={settings.DRONE_TELEMETRY_INTERVAL}s).")

    # ── Start AI Detection Engine ──
    from ai.engine import detection_engine
    from routers.alerts import _broadcast as alert_broadcast
    from database import Alert, engine as db_engine
    from sqlmodel import Session
    import time

    async def on_ai_alert(alert_event):
        """Bridge AI alerts into the existing SSE alert system."""
        try:
            # Determine camera name from ID
            cam_map = {"CAM-01": "ALPHA", "CAM-02": "BRAVO",
                       "CAM-03": "CHARLIE", "CAM-04": "DELTA"}
            sector = alert_event.sector
            if sector == "UNKNOWN":
                sector = cam_map.get(alert_event.camera_id, "ALPHA")

            # Save to database
            from datetime import datetime
            alert_obj = Alert(
                sector=sector,
                threat=alert_event.threat,
                camera=alert_event.camera_id,
                lat=32.45 + (hash(alert_event.camera_id) % 10) * 0.005,
                lng=75.68 + (hash(alert_event.camera_id) % 10) * 0.005,
                alert_type=alert_event.alert_type,
            )
            with Session(db_engine) as session:
                session.add(alert_obj)
                session.commit()
                session.refresh(alert_obj)

            # Broadcast via existing SSE
            alert_broadcast({
                "id": alert_obj.id,
                "timestamp": alert_obj.timestamp.isoformat(),
                "sector": alert_obj.sector,
                "threat": alert_obj.threat,
                "camera": alert_obj.camera,
                "lat": alert_obj.lat,
                "lng": alert_obj.lng,
                "alert_type": alert_obj.alert_type,
                "acknowledged": False,
                "ai_description": alert_event.description,
                "ai_severity": alert_event.severity,
                "ai_detections": alert_event.detections,
            })
            print(f"[AI ALERT] {alert_event.severity.upper()}: {alert_event.description}")
        except Exception as e:
            print(f"[AI ALERT ERROR] {e}")

    # Wire the alert callback
    loop = asyncio.get_event_loop()
    detection_engine.set_alert_callback(on_ai_alert, loop)

    # Start engine asynchronously so backend can accept requests immediately
    async def _async_start_engine():
        try:
            await asyncio.to_thread(detection_engine.start)
            print("AI Detection Engine started.")
        except Exception as e:
            print(f"AI Engine startup warning: {e} — AI features may be limited.")

    asyncio.create_task(_async_start_engine())

    # Start detection history logger (persists detection events to DB)
    from routers.detection import detection_history_logger
    history_task = asyncio.create_task(detection_history_logger())
    print("Detection history logger started (5s interval).")

    yield  # application runs here

    # ── Shutdown ──
    detection_engine.stop()
    history_task.cancel()
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass
    try:
        await history_task
    except asyncio.CancelledError:
        pass
    print("BSC-DOP Backend shut down.")


# ─── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="BSC-DOP — Border Surveillance Command API",
    description=(
        "Real-time backend for the Border Surveillance Command & "
        "Digital Operations Platform. Provides authentication, "
        "alert management (SSE), drone telemetry (WebSocket), "
        "AI-powered multi-detection (human, vehicle, fire, weapon), "
        "and system settings."
    ),
    version="2.5.0",
    lifespan=lifespan,
    docs_url="/api/docs",
    redoc_url="/api/redoc",
    openapi_url="/api/openapi.json",
)

# ─── CORS ─────────────────────────────────────────────────────────────────────

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Routers ──────────────────────────────────────────────────────────────────

app.include_router(auth.router)
app.include_router(alerts.router)
app.include_router(drones.router)
app.include_router(settings_router.router)
app.include_router(health.router)
app.include_router(cameras.router)
app.include_router(detection_router.router)
