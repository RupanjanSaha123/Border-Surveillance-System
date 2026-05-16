"""
Weapon Detector — Enhanced weapon detection with human proximity validation.
Uses COCO knife class from YOLO + optional custom weapon model.
Multi-frame confirmation to reduce false positives.
"""
import logging
import time
from collections import deque
from dataclasses import dataclass
from typing import List, Optional, Tuple

import numpy as np

from ai.config import ai_config
from ai.detector_yolo import Detection

logger = logging.getLogger("bsc.detector_weapon")


@dataclass
class WeaponDetection:
    """Validated weapon detection result."""
    bbox: Tuple[int, int, int, int]
    confidence: float
    class_name: str          # "knife", "pistol", "rifle", etc.
    near_person: bool        # Whether a person is nearby
    confirmed: bool          # Multi-frame confirmed
    raw_confidence: float    # Original YOLO confidence
    proximity_score: float   # How close to nearest person
    temporal_score: float    # Multi-frame consistency


class WeaponDetector:
    """
    Weapon detection with false positive suppression.
    Validation pipeline:
      1. YOLO detects knife (class 43) or custom model detects weapons
      2. Human proximity check — weapons only valid near people
      3. Multi-frame confirmation — must appear in N consecutive frames
      4. Size validation — weapon must be proportional to nearby person
    """

    def __init__(self):
        self._custom_model = None
        self._custom_loaded = False
        # Per-camera detection history for temporal validation
        self._history: dict[str, deque] = {}
        self._max_history = 20

    def load_custom_model(self) -> bool:
        """Load a custom weapon detection model if available."""
        if not ai_config.WEAPON_MODEL:
            logger.info("No custom weapon model configured, using COCO knife class")
            return False

        try:
            import os
            model_path = ai_config.WEAPON_MODEL
            if not os.path.exists(model_path):
                logger.warning(f"Weapon model not found: {model_path}")
                return False

            from ultralytics import YOLO
            self._custom_model = YOLO(model_path)
            self._custom_loaded = True
            logger.info(f"Custom weapon model loaded: {model_path}")
            return True

        except Exception as e:
            logger.error(f"Failed to load weapon model: {e}")
            return False

    def validate(
        self,
        yolo_detections: List[Detection],
        frame: np.ndarray,
        camera_id: str = "default",
    ) -> List[WeaponDetection]:
        """
        Validate weapon detections from YOLO output.
        Applies proximity, temporal, and size checks.
        """
        if camera_id not in self._history:
            self._history[camera_id] = deque(maxlen=self._max_history)

        # Separate persons and weapon candidates from YOLO output
        persons = [d for d in yolo_detections if d.category == "person"]
        weapon_candidates = [d for d in yolo_detections if d.category == "weapon"]

        # Also run custom model if loaded
        if self._custom_loaded and self._custom_model is not None:
            custom_detections = self._run_custom_model(frame)
            weapon_candidates.extend(custom_detections)

        if not weapon_candidates:
            self._history[camera_id].append((time.time(), []))
            return []

        validated: List[WeaponDetection] = []
        current_bboxes = []

        for weapon in weapon_candidates:
            # Step 1: Human proximity check
            proximity_score, near_person = self._check_proximity(
                weapon.bbox, persons
            )

            # Step 2: Size validation
            if persons:
                if not self._validate_size(weapon.bbox, persons):
                    continue

            # Step 3: Temporal consistency
            temporal_score = self._check_temporal(camera_id, weapon.bbox)

            # Step 4: Compute final confidence
            base_conf = weapon.confidence

            # Boost if near person, penalize if isolated
            if near_person:
                proximity_factor = 1.0 + (proximity_score * 0.3)
            else:
                proximity_factor = 0.5  # Significant penalty

            # Boost for temporal consistency
            temporal_factor = 0.6 + (temporal_score * 0.4)

            final_conf = base_conf * proximity_factor * temporal_factor
            final_conf = min(1.0, final_conf)

            confirmed = temporal_score >= 0.8

            current_bboxes.append(weapon.bbox)

            if final_conf >= ai_config.WEAPON_CONF:
                validated.append(WeaponDetection(
                    bbox=weapon.bbox,
                    confidence=round(final_conf, 3),
                    class_name=weapon.class_name,
                    near_person=near_person,
                    confirmed=confirmed,
                    raw_confidence=round(base_conf, 3),
                    proximity_score=round(proximity_score, 3),
                    temporal_score=round(temporal_score, 3),
                ))

        self._history[camera_id].append((time.time(), current_bboxes))
        return validated

    def _check_proximity(
        self,
        weapon_bbox: Tuple[int, int, int, int],
        persons: List[Detection],
    ) -> Tuple[float, bool]:
        """Check if weapon is near any detected person."""
        if not persons:
            return 0.0, False

        max_iou = 0.0
        min_dist = float("inf")
        wx = (weapon_bbox[0] + weapon_bbox[2]) / 2
        wy = (weapon_bbox[1] + weapon_bbox[3]) / 2

        for person in persons:
            iou = self._bbox_iou(weapon_bbox, person.bbox)
            max_iou = max(max_iou, iou)

            # Center distance
            px = (person.bbox[0] + person.bbox[2]) / 2
            py = (person.bbox[1] + person.bbox[3]) / 2
            dist = ((wx - px) ** 2 + (wy - py) ** 2) ** 0.5

            # Normalize by person height
            person_h = person.bbox[3] - person.bbox[1]
            norm_dist = dist / max(person_h, 1)
            min_dist = min(min_dist, norm_dist)

        near = max_iou > ai_config.WEAPON_PROXIMITY_IOU or min_dist < 2.0
        proximity_score = max(max_iou, 1.0 / max(min_dist, 0.1))
        proximity_score = min(1.0, proximity_score)

        return proximity_score, near

    def _validate_size(
        self,
        weapon_bbox: Tuple[int, int, int, int],
        persons: List[Detection],
    ) -> bool:
        """Check weapon is proportionally sized relative to nearby persons."""
        w_width = weapon_bbox[2] - weapon_bbox[0]
        w_height = weapon_bbox[3] - weapon_bbox[1]
        w_area = w_width * w_height

        for person in persons:
            p_width = person.bbox[2] - person.bbox[0]
            p_height = person.bbox[3] - person.bbox[1]
            p_area = p_width * p_height

            # Weapon should be 1-40% of person area
            ratio = w_area / max(p_area, 1)
            if 0.005 <= ratio <= 0.5:
                return True

        return False

    def _check_temporal(
        self, camera_id: str, bbox: Tuple[int, int, int, int]
    ) -> float:
        """Check multi-frame consistency of weapon detection."""
        history = self._history.get(camera_id, deque())
        if len(history) < ai_config.WEAPON_TEMPORAL_FRAMES:
            return 0.0

        consecutive = 0
        for ts, bboxes in reversed(list(history)):
            if any(self._bbox_iou(bbox, b) > 0.2 for b in bboxes):
                consecutive += 1
            else:
                break

        required = ai_config.WEAPON_TEMPORAL_FRAMES
        return min(1.0, consecutive / required)

    def _run_custom_model(self, frame: np.ndarray) -> List[Detection]:
        """Run custom weapon model if loaded."""
        if not self._custom_loaded or self._custom_model is None:
            return []

        try:
            results = self._custom_model.predict(
                frame, conf=0.3, verbose=False
            )
            detections = []
            if results and results[0].boxes is not None:
                boxes = results[0].boxes
                names = results[0].names
                for i in range(len(boxes)):
                    cls_id = int(boxes.cls[i].item())
                    conf = float(boxes.conf[i].item())
                    x1, y1, x2, y2 = boxes.xyxy[i].tolist()
                    name = names.get(cls_id, "weapon")
                    detections.append(Detection(
                        class_id=cls_id,
                        class_name=name,
                        category="weapon",
                        confidence=conf,
                        bbox=(int(x1), int(y1), int(x2), int(y2)),
                    ))
            return detections
        except Exception as e:
            logger.error(f"Custom weapon model error: {e}")
            return []

    @staticmethod
    def _bbox_iou(b1, b2) -> float:
        x1 = max(b1[0], b2[0])
        y1 = max(b1[1], b2[1])
        x2 = min(b1[2], b2[2])
        y2 = min(b1[3], b2[3])
        inter = max(0, x2 - x1) * max(0, y2 - y1)
        if inter == 0:
            return 0.0
        a1 = (b1[2] - b1[0]) * (b1[3] - b1[1])
        a2 = (b2[2] - b2[0]) * (b2[3] - b2[1])
        return inter / max(a1 + a2 - inter, 1)

    def clear_history(self, camera_id: Optional[str] = None):
        if camera_id:
            self._history.pop(camera_id, None)
        else:
            self._history.clear()
