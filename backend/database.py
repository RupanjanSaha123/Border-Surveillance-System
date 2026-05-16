"""
Database models + engine setup using SQLModel (SQLAlchemy + Pydantic).
"""
from datetime import datetime
from typing import Optional
from sqlmodel import Field, SQLModel, create_engine, Session, select
from config import settings

engine = create_engine(
    settings.DATABASE_URL,
    connect_args={"check_same_thread": False},  # needed for SQLite
    echo=False,
)


# ─── Models ──────────────────────────────────────────────────────────────────

class Alert(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    timestamp: datetime = Field(default_factory=datetime.utcnow)
    sector: str           # ALPHA | BRAVO | CHARLIE | DELTA
    threat: str           # e.g. "Unidentified Movement"
    camera: str           # e.g. "CAM-01"
    lat: float
    lng: float
    alert_type: str       # "critical" | "warning"
    acknowledged: bool = Field(default=False)
    acknowledged_by: Optional[str] = Field(default=None)   # operator call sign


class Operator(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    officer_id: str = Field(unique=True, index=True)
    name: str = Field(default="Unknown")
    email: str = Field(default="")
    call_sign: str = Field(default="RECRUIT")
    unit_code: str = Field(default="UNASSIGNED")
    hashed_password: str
    is_active: bool = Field(default=True)
    is_verified: bool = Field(default=False)
    otp: Optional[str] = Field(default=None)


class DetectionLog(SQLModel, table=True):
    """Persisted AI detection event for analytics and history."""
    id: Optional[int] = Field(default=None, primary_key=True)
    timestamp: datetime = Field(default_factory=datetime.utcnow, index=True)
    camera_id: str = Field(index=True)            # e.g. "CAM-01"
    sector: str = Field(default="UNKNOWN")
    humans: int = Field(default=0)
    vehicles: int = Field(default=0)
    fire: bool = Field(default=False)
    weapons: int = Field(default=0)
    avg_confidence: float = Field(default=0.0)
    detection_fps: float = Field(default=0.0)
    moving_objects: str = Field(default="[]")      # JSON-encoded list
    alert_generated: bool = Field(default=False)


class SystemSettings(SQLModel, table=True):
    """One-row table holding the current operational config."""
    id: Optional[int] = Field(default=None, primary_key=True)
    drones_online: int = Field(default=12)
    alert_sensitivity: int = Field(default=75)      # 0–100
    scan_interval: int = Field(default=5)            # seconds
    audio_alerts: bool = Field(default=True)
    auto_track: bool = Field(default=True)
    night_vision: bool = Field(default=False)
    encryption_level: str = Field(default="AES-256")
    stream_quality: str = Field(default="HD")


# ─── Helpers ─────────────────────────────────────────────────────────────────

def get_session():
    with Session(engine) as session:
        yield session


def create_db_and_tables():
    SQLModel.metadata.create_all(engine)


def seed_operators():
    """
    Insert the two default operators that match the frontend credentials.
    Passwords are bcrypt-hashed.
    """
    from passlib.context import CryptContext
    pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")

    operators = [
        Operator(
            officer_id="IND-ARMY-001",
            call_sign="CMDR. RAJPUT",
            unit_code="SEC-ALPHA",
            hashed_password=pwd_ctx.hash("SecurePass@1"),
            is_verified=True,
        ),
        Operator(
            officer_id="IND-ARMY-002",
            name="MAJ. SHARMA",
            email="sharma@bsc.gov.in",
            call_sign="MAJ. SHARMA",
            unit_code="SEC-BRAVO",
            hashed_password=pwd_ctx.hash("SecurePass@2"),
            is_verified=True,
        ),
    ]

    with Session(engine) as session:
        for op in operators:
            existing = session.exec(
                select(Operator).where(Operator.officer_id == op.officer_id)
            ).first()
            if not existing:
                session.add(op)
        session.commit()


def seed_settings():
    """Insert default system settings row if not present."""
    with Session(engine) as session:
        existing = session.exec(select(SystemSettings)).first()
        if not existing:
            session.add(SystemSettings())
            session.commit()
