from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # JWT
    SECRET_KEY: str = "bsc-dop-top-secret-jwt-key-2025-change-in-prod"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480  # 8 hours per operator shift

    # CORS — allow Vite dev server
    CORS_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
    ]

    # SQLite database file
    DATABASE_URL: str = "sqlite:///./bsc_dop.db"

    # Alert SSE heartbeat interval (seconds)
    SSE_HEARTBEAT: int = 15

    # Drone telemetry broadcast interval (seconds)
    DRONE_TELEMETRY_INTERVAL: float = 3.0

    # SMTP Settings
    SMTP_EMAIL: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_SERVER: str = "smtp.gmail.com"
    SMTP_PORT: int = 587

    class Config:
        env_file = ".env"


settings = Settings()
