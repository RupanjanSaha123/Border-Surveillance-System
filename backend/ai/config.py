"""
AI Detection Configuration.
Centralized settings for all detection modules.
"""
import os
from dataclasses import dataclass, field
from typing import Optional


@dataclass
class AIConfig:
    """Configuration for the AI detection engine."""

    # ── Model Settings ────────────────────────────────────────────────────────
    YOLO_MODEL: str = "yolov8n.pt"  # Auto-downloads from Ultralytics hub
    WEAPON_MODEL: Optional[str] = None  # Path to custom weapon .pt model
    MODELS_DIR: str = os.path.join(os.path.dirname(__file__), "models")

    # ── Device Settings ───────────────────────────────────────────────────────
    # "auto" → tries OpenVINO GPU → OpenVINO CPU → PyTorch CPU
    DEVICE: str = "auto"

    # ── Detection Thresholds ──────────────────────────────────────────────────
    PERSON_CONF: float = 0.25
    VEHICLE_CONF: float = 0.25
    FIRE_CONF: float = 0.50
    WEAPON_CONF: float = 0.45

    # ── COCO Class IDs ────────────────────────────────────────────────────────
    PERSON_CLASSES: dict = field(default_factory=lambda: {0: "person"})
    VEHICLE_CLASSES: dict = field(default_factory=lambda: {
        1: "bicycle", 2: "car", 3: "motorcycle", 5: "bus", 7: "truck",
    })
    WEAPON_CLASSES: dict = field(default_factory=lambda: {43: "knife"})

    # ── Fire Detection (CV-based) ─────────────────────────────────────────────
    FIRE_HSV_LOWER_1: tuple = (0, 80, 180)     # Red-orange flame
    FIRE_HSV_UPPER_1: tuple = (25, 255, 255)
    FIRE_HSV_LOWER_2: tuple = (160, 80, 180)    # Deep red flame
    FIRE_HSV_UPPER_2: tuple = (180, 255, 255)
    FIRE_MIN_AREA: int = 800                     # Min pixel area for fire ROI
    FIRE_TEMPORAL_FRAMES: int = 3                # Consecutive frames required
    FIRE_FLICKER_MIN_HZ: float = 1.0
    FIRE_FLICKER_MAX_HZ: float = 15.0

    # ── Weapon Validation ─────────────────────────────────────────────────────
    WEAPON_PROXIMITY_IOU: float = 0.05   # Min overlap with person bbox
    WEAPON_TEMPORAL_FRAMES: int = 3       # Consecutive frames required

    # ── Tracker Settings ──────────────────────────────────────────────────────
    TRACKER_IOU_THRESHOLD: float = 0.3
    TRACKER_MAX_AGE: int = 15             # Frames before track is lost
    MOVEMENT_THRESHOLD: float = 5.0       # Pixels/frame to count as moving

    # ── Engine Settings ───────────────────────────────────────────────────────
    MAX_CAMERAS: int = 4
    DETECTION_FPS: float = 8.0            # Target detection FPS per camera
    FRAME_SKIP: int = 3                   # Process every Nth frame
    JPEG_QUALITY: int = 80
    ANNOTATED_FRAME_BUFFER: int = 2

    # ── Alert Settings ────────────────────────────────────────────────────────
    ALERT_COOLDOWN: int = 15              # Seconds between same-type alerts
    ALERT_ENABLED: bool = True

    # ── Capture Settings ──────────────────────────────────────────────────────
    CAPTURE_RECONNECT_INTERVAL: float = 5.0   # Seconds between reconnect
    CAPTURE_BUFFER_SIZE: int = 1               # OpenCV buffer size
    CAPTURE_TIMEOUT: float = 10.0              # Seconds before timeout


# Global singleton
ai_config = AIConfig()
