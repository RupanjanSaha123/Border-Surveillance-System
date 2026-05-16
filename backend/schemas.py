"""
Pydantic request/response schemas (separate from the SQLModel DB models).
"""
from datetime import datetime
from typing import Optional
from pydantic import BaseModel


# ─── Auth ─────────────────────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    officerId: str
    password: str
    unitCode: str


class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    officer_id: str
    call_sign: str
    unit_code: str
    login_time: datetime


class RegisterRequest(BaseModel):
    name: str
    email: str
    officerId: str
    password: str
    confirmPassword: str


class VerifyOtpRequest(BaseModel):
    officerId: str
    otp: str


# ─── Alerts ───────────────────────────────────────────────────────────────────

class AlertCreate(BaseModel):
    sector: str
    threat: str
    camera: str
    lat: float
    lng: float
    alert_type: str   # "critical" | "warning"


class AlertRead(BaseModel):
    id: int
    timestamp: datetime
    sector: str
    threat: str
    camera: str
    lat: float
    lng: float
    alert_type: str
    acknowledged: bool
    acknowledged_by: Optional[str] = None

    class Config:
        from_attributes = True


class AcknowledgeRequest(BaseModel):
    call_sign: str


# ─── Drones ───────────────────────────────────────────────────────────────────

class DroneTelemetry(BaseModel):
    id: int
    name: str
    lat: float
    lng: float
    alt: float
    signal: int        # 0–100 %
    battery: int       # 0–100 %
    temp: float        # °C
    wind: float        # m/s
    status: str        # "ACTIVE" | "RTB" | "OFFLINE"
    threat: str        # "CLEAR" | threat description


# ─── Settings ─────────────────────────────────────────────────────────────────

class SettingsRead(BaseModel):
    drones_online: int
    alert_sensitivity: int
    scan_interval: int
    audio_alerts: bool
    auto_track: bool
    night_vision: bool
    encryption_level: str
    stream_quality: str

    class Config:
        from_attributes = True


class SettingsUpdate(BaseModel):
    drones_online: Optional[int] = None
    alert_sensitivity: Optional[int] = None
    scan_interval: Optional[int] = None
    audio_alerts: Optional[bool] = None
    auto_track: Optional[bool] = None
    night_vision: Optional[bool] = None
    encryption_level: Optional[str] = None
    stream_quality: Optional[str] = None


# ─── System Health ────────────────────────────────────────────────────────────

class SystemHealth(BaseModel):
    status: str          # "operational" | "degraded"
    drones_online: int
    sat_link: str        # "SECURE" | "DEGRADED"
    power_level: int     # 0–100 %
    uptime_seconds: int
    active_alerts: int
    version: str
