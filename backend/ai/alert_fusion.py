"""
Alert Fusion Engine — Intelligent alert generation with cooldown and severity.
Generates human-readable surveillance alerts from detection results.
"""
import time
import logging
from collections import defaultdict
from dataclasses import dataclass, field
from typing import List, Optional

from ai.config import ai_config

logger = logging.getLogger("bsc.alert_fusion")


@dataclass
class AlertEvent:
    """Generated surveillance alert."""
    severity: str        # "low" | "medium" | "high" | "critical" | "emergency"
    alert_type: str      # Maps to existing DB: "critical" | "warning"
    description: str     # Human-readable description
    threat: str          # Short threat label for DB
    camera_id: str
    timestamp: float
    detections: dict     # {humans: N, vehicles: N, fire: bool, weapons: N}
    moving_objects: list  # List of moving object descriptions
    confidence: float
    sector: str = "UNKNOWN"


class AlertFusionEngine:
    """
    Generates intelligent alerts based on combined detection results.
    Features:
      - Severity escalation based on threat combination
      - Cooldown system to prevent alert spam
      - Natural language alert descriptions
      - Minimum confidence thresholds
    """

    def __init__(self):
        # Cooldown tracking: (camera_id, alert_key) → last_alert_time
        self._cooldowns: dict[tuple, float] = {}
        self._alert_history: list[AlertEvent] = []

    def process(
        self,
        camera_id: str,
        humans: int,
        vehicles: int,
        fire: bool,
        weapons: int,
        moving_objects: list,
        avg_confidence: float,
        sector: str = "UNKNOWN",
    ) -> Optional[AlertEvent]:
        """
        Evaluate detections and generate an alert if warranted.
        Returns AlertEvent if alert should be triggered, None otherwise.
        """
        if not ai_config.ALERT_ENABLED:
            return None

        # Nothing detected
        if humans == 0 and vehicles == 0 and not fire and weapons == 0:
            return None

        # Determine severity and generate description
        severity = self._compute_severity(humans, vehicles, fire, weapons)
        description = self._generate_description(
            humans, vehicles, fire, weapons, moving_objects
        )
        threat = self._generate_threat_label(humans, vehicles, fire, weapons)

        # Map severity to alert_type for existing DB compatibility
        alert_type = "critical" if severity in ("critical", "emergency", "high") else "warning"

        # Check cooldown
        alert_key = (camera_id, threat)
        if not self._check_cooldown(alert_key):
            return None

        # Only alert on significant detections
        if severity == "low" and not fire and weapons == 0:
            return None

        alert = AlertEvent(
            severity=severity,
            alert_type=alert_type,
            description=description,
            threat=threat,
            camera_id=camera_id,
            timestamp=time.time(),
            detections={
                "humans": humans,
                "vehicles": vehicles,
                "fire": fire,
                "weapons": weapons,
            },
            moving_objects=moving_objects,
            confidence=round(avg_confidence, 3),
            sector=sector,
        )

        # Record cooldown
        self._cooldowns[alert_key] = time.time()
        self._alert_history.append(alert)

        # Keep history bounded
        if len(self._alert_history) > 200:
            self._alert_history = self._alert_history[-100:]

        return alert

    def _compute_severity(
        self, humans: int, vehicles: int, fire: bool, weapons: int
    ) -> str:
        """
        Compute threat severity based on detection combination.

        Severity Matrix:
          - Human only           → medium
          - Vehicle only         → medium
          - Fire only            → high
          - Weapon only          → high
          - Human + weapon       → critical
          - Human + fire         → emergency
          - Fire + vehicle       → high
          - Human + vehicle      → medium
          - Weapon + vehicle     → critical
          - Fire + weapon        → emergency
          - 3+ categories        → emergency
          - All 4                → emergency
        """
        categories = sum([
            humans > 0,
            vehicles > 0,
            fire,
            weapons > 0,
        ])

        # 3+ categories → always emergency
        if categories >= 3:
            return "emergency"

        # 2 categories
        if categories == 2:
            if weapons > 0 and humans > 0:
                return "critical"
            if fire and humans > 0:
                return "emergency"
            if weapons > 0 and vehicles > 0:
                return "critical"
            if fire and weapons > 0:
                return "emergency"
            if fire and vehicles > 0:
                return "high"
            if humans > 0 and vehicles > 0:
                return "medium"

        # Single category
        if weapons > 0:
            return "high"
        if fire:
            return "high"
        if humans >= 3:
            return "medium"
        if humans > 0:
            return "medium"
        if vehicles > 0:
            return "medium"

        return "low"

    def _generate_description(
        self,
        humans: int,
        vehicles: int,
        fire: bool,
        weapons: int,
        moving_objects: list,
    ) -> str:
        """Generate a human-readable alert description."""
        parts = []

        # Humans
        if humans > 0:
            moving_humans = [
                m for m in moving_objects if m.get("category") == "person"
            ]
            if moving_humans:
                dirs = [m.get("direction", "") for m in moving_humans]
                dir_str = dirs[0] if dirs else "detected"
                if humans == 1:
                    parts.append(f"1 human moving ({dir_str})")
                else:
                    parts.append(f"{humans} humans detected, {len(moving_humans)} moving")
            else:
                if humans == 1:
                    parts.append("1 human detected")
                else:
                    parts.append(f"{humans} humans detected")

        # Vehicles
        if vehicles > 0:
            moving_vehs = [
                m for m in moving_objects if m.get("category") == "vehicle"
            ]
            if moving_vehs:
                if vehicles == 1:
                    parts.append("Vehicle approaching")
                else:
                    parts.append(f"{vehicles} vehicles detected, {len(moving_vehs)} moving")
            else:
                if vehicles == 1:
                    parts.append("Vehicle detected")
                else:
                    parts.append(f"{vehicles} vehicles detected")

        # Fire
        if fire:
            parts.append("Fire/smoke detected in surveillance zone")

        # Weapons
        if weapons > 0:
            if humans > 0:
                parts.append(f"Weapon detected near human")
            else:
                parts.append(f"Weapon detected")

        # Build contextual alerts
        if weapons > 0 and humans > 0 and fire:
            return f"⚠ CRITICAL: Armed individual near fire — {', '.join(parts)}"
        if weapons > 0 and humans > 0:
            return f"⚠ DANGER: {', '.join(parts)}"
        if fire and humans > 0:
            return f"🔥 EMERGENCY: {', '.join(parts)}"
        if fire:
            return f"🔥 {', '.join(parts)}"

        return " | ".join(parts)

    def _generate_threat_label(
        self, humans: int, vehicles: int, fire: bool, weapons: int
    ) -> str:
        """Generate a short threat label for the DB."""
        labels = []
        if weapons > 0:
            labels.append("Armed Threat")
        if fire:
            labels.append("Fire Detected")
        if humans > 0:
            labels.append(f"{humans} Human{'s' if humans > 1 else ''}")
        if vehicles > 0:
            labels.append(f"Vehicle{'s' if vehicles > 1 else ''}")

        return " + ".join(labels) if labels else "AI Detection"

    def _check_cooldown(self, alert_key: tuple) -> bool:
        """Check if enough time has passed since last alert of this type."""
        last_time = self._cooldowns.get(alert_key, 0)
        return (time.time() - last_time) >= ai_config.ALERT_COOLDOWN

    def clear_cooldowns(self):
        self._cooldowns.clear()

    @property
    def alert_count(self) -> int:
        return len(self._alert_history)
