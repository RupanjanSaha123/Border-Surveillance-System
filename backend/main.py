"""
BSC-DOP Border Surveillance Command — FastAPI Backend
Entry point: main.py
Run with:  uvicorn main:app --reload --port 8000
"""
import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from database import create_db_and_tables, seed_operators, seed_settings
from routers import auth, alerts, drones, settings as settings_router, health, cameras


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

    yield  # application runs here

    # ── Shutdown ──
    task.cancel()
    try:
        await task
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
        "and system settings."
    ),
    version="2.4.1",
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

# Force reload

# Force reload 2
