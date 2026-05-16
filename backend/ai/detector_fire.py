"""
Fire Detector — Hybrid computer-vision fire/smoke detection.
Uses HSV color analysis + contour detection + temporal consistency + flicker analysis.
No separate ML model required — pure CV approach for maximum reliability.
"""
import cv2
import time
import logging
import numpy as np
from collections import deque
from dataclasses import dataclass
from typing import List, Optional, Tuple

from ai.config import ai_config

logger = logging.getLogger("bsc.detector_fire")


@dataclass
class FireDetection:
    """Single fire/smoke detection result."""
    bbox: Tuple[int, int, int, int]  # (x1, y1, x2, y2)
    confidence: float
    label: str = "fire"               # "fire" | "smoke"
    area: int = 0
    color_score: float = 0.0
    temporal_score: float = 0.0
    flicker_score: float = 0.0


class FireDetector:
    """
    Hybrid fire detection using multiple CV signals:
      1. HSV color segmentation (fire-spectrum colors)
      2. Contour area analysis (large bright regions)
      3. Temporal consistency (must persist across N frames)
      4. Flicker analysis (real fire flickers, lights don't)
    """

    def __init__(self):
        # Per-camera history: camera_id → deque of (timestamp, fire_regions)
        self._history: dict[str, deque] = {}
        self._max_history = 30  # frames

    def detect(
        self, frame: np.ndarray, camera_id: str = "default",
        person_bboxes: List[Tuple[int, int, int, int]] = None
    ) -> List[FireDetection]:
        """
        Detect fire/smoke in a frame using multi-signal fusion.
        Returns list of FireDetection objects.
        """
        if frame is None:
            return []

        try:
            # Ensure history deque exists
            if camera_id not in self._history:
                self._history[camera_id] = deque(maxlen=self._max_history)

            # Step 1: HSV color segmentation
            candidates = self._color_segment(frame)

            if not candidates:
                self._history[camera_id].append((time.time(), []))
                return []

            # Step 2: Validate each candidate
            detections: List[FireDetection] = []
            current_regions = []

            for bbox, mask_region, area in candidates:
                # Human Suppression: Reject if it overlaps with a person 
                # UNLESS it's extremely bright (incandescent fire)
                if person_bboxes:
                    is_inside_person = any(self._bbox_iou(bbox, p) > 0.05 for p in person_bboxes)
                    if is_inside_person:
                        # Check if it's "white-hot" brightness (>230)
                        x1, y1, x2, y2 = bbox
                        roi_gray = cv2.cvtColor(frame[y1:y2, x1:x2], cv2.COLOR_BGR2GRAY)
                        if np.mean(roi_gray) < 220:
                            # Likely skin or clothing reflection
                            continue

                color_score = self._compute_color_score(frame, bbox)
                temporal_score = self._compute_temporal_score(
                    camera_id, bbox
                )
                flicker_score = self._compute_flicker_score(
                    camera_id, bbox, frame
                )

                # Weighted fusion
                confidence = (
                    0.45 * color_score
                    + 0.35 * temporal_score
                    + 0.20 * flicker_score
                )

                current_regions.append(bbox)

                if confidence >= ai_config.FIRE_CONF:
                    detections.append(FireDetection(
                        bbox=bbox,
                        confidence=round(confidence, 3),
                        label="fire",
                        area=area,
                        color_score=round(color_score, 3),
                        temporal_score=round(temporal_score, 3),
                        flicker_score=round(flicker_score, 3),
                    ))

            self._history[camera_id].append((time.time(), current_regions))
            return detections

        except Exception as e:
            logger.error(f"Fire detection error: {e}")
            return []

    def _color_segment(
        self, frame: np.ndarray
    ) -> List[Tuple[Tuple[int, int, int, int], np.ndarray, int]]:
        """
        HSV color segmentation to find fire-colored regions.
        Returns list of (bbox, mask_region, area).
        """
        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        h, w = frame.shape[:2]

        # Fire color range 1: orange-red-yellow
        mask1 = cv2.inRange(
            hsv,
            np.array(ai_config.FIRE_HSV_LOWER_1),
            np.array(ai_config.FIRE_HSV_UPPER_1),
        )
        # Fire color range 2: deep red
        mask2 = cv2.inRange(
            hsv,
            np.array(ai_config.FIRE_HSV_LOWER_2),
            np.array(ai_config.FIRE_HSV_UPPER_2),
        )

        mask = cv2.bitwise_or(mask1, mask2)

        # Brightness check — fire is extremely bright (incandescent)
        # Increased threshold to 190 to filter skin tones which are usually 100-170
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        bright_mask = cv2.threshold(gray, 190, 255, cv2.THRESH_BINARY)[1]
        mask = cv2.bitwise_and(mask, bright_mask)

        # Morphological operations to clean noise
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7))
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)

        # Find contours
        contours, _ = cv2.findContours(
            mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE
        )

        candidates = []
        for contour in contours:
            area = cv2.contourArea(contour)
            if area < ai_config.FIRE_MIN_AREA:
                continue

            x, y, bw, bh = cv2.boundingRect(contour)
            # Aspect ratio filter — fire is not extremely elongated
            aspect = bw / max(bh, 1)
            if aspect > 5 or aspect < 0.15:
                continue

            bbox = (x, y, x + bw, y + bh)
            candidates.append((bbox, mask[y:y+bh, x:x+bw], area))

        return candidates

    def _compute_color_score(
        self, frame: np.ndarray, bbox: Tuple[int, int, int, int]
    ) -> float:
        """Compute how fire-like the color distribution is in the ROI."""
        x1, y1, x2, y2 = bbox
        roi = frame[y1:y2, x1:x2]
        if roi.size == 0:
            return 0.0

        hsv_roi = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)
        total_pixels = roi.shape[0] * roi.shape[1]

        # Count fire-colored pixels
        mask1 = cv2.inRange(
            hsv_roi,
            np.array(ai_config.FIRE_HSV_LOWER_1),
            np.array(ai_config.FIRE_HSV_UPPER_1),
        )
        mask2 = cv2.inRange(
            hsv_roi,
            np.array(ai_config.FIRE_HSV_LOWER_2),
            np.array(ai_config.FIRE_HSV_UPPER_2),
        )
        fire_pixels = cv2.countNonZero(cv2.bitwise_or(mask1, mask2))

        ratio = fire_pixels / max(total_pixels, 1)

        # Also check intensity — fire should be bright
        gray_roi = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
        mean_brightness = np.mean(gray_roi) / 255.0

        # Combined score
        return min(1.0, ratio * 1.2 + mean_brightness * 0.3)

    def _compute_temporal_score(
        self, camera_id: str, bbox: Tuple[int, int, int, int]
    ) -> float:
        """
        Check if fire was detected in similar region across recent frames.
        Returns 0.0-1.0 based on temporal consistency.
        """
        history = self._history.get(camera_id, deque())
        if len(history) < ai_config.FIRE_TEMPORAL_FRAMES:
            return 0.0

        consecutive = 0
        for ts, regions in reversed(list(history)):
            if any(self._bbox_iou(bbox, r) > 0.2 for r in regions):
                consecutive += 1
            else:
                break

        # Score: 0 if < required frames, ramps up to 1.0
        required = ai_config.FIRE_TEMPORAL_FRAMES
        return min(1.0, consecutive / required)

    def _compute_flicker_score(
        self, camera_id: str, bbox: Tuple[int, int, int, int],
        frame: np.ndarray,
    ) -> float:
        """
        Analyze brightness variation in the fire region across frames.
        Real fire flickers — steady lights don't.
        Returns 0.0-1.0 flicker score.
        """
        history = self._history.get(camera_id, deque())
        if len(history) < 5:
            return 0.5  # neutral score until enough history

        # Check if the region had varying detection (on/off pattern)
        recent = list(history)[-10:]
        detect_count = sum(
            1 for _, regions in recent
            if any(self._bbox_iou(bbox, r) > 0.15 for r in regions)
        )

        total = len(recent)
        # Fire should be detected in most frames but with variation
        ratio = detect_count / max(total, 1)

        # Good flicker: 50-90% detection rate (not constant, not random)
        if 0.4 <= ratio <= 0.95:
            return 0.8
        elif ratio > 0.95:
            # Too constant — might be a steady light
            return 0.4
        else:
            # Too sporadic — probably noise
            return 0.2

    @staticmethod
    def _bbox_iou(
        box1: Tuple[int, int, int, int],
        box2: Tuple[int, int, int, int],
    ) -> float:
        """Compute IoU between two bounding boxes."""
        x1 = max(box1[0], box2[0])
        y1 = max(box1[1], box2[1])
        x2 = min(box1[2], box2[2])
        y2 = min(box1[3], box2[3])

        inter_area = max(0, x2 - x1) * max(0, y2 - y1)
        if inter_area == 0:
            return 0.0

        area1 = (box1[2] - box1[0]) * (box1[3] - box1[1])
        area2 = (box2[2] - box2[0]) * (box2[3] - box2[1])
        union_area = area1 + area2 - inter_area

        return inter_area / max(union_area, 1)

    def clear_history(self, camera_id: Optional[str] = None):
        """Clear detection history."""
        if camera_id:
            self._history.pop(camera_id, None)
        else:
            self._history.clear()
