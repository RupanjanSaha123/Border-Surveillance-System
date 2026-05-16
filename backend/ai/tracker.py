"""
Object Tracker — Simple IOU-based multi-object tracker with movement analysis.
Assigns persistent IDs and tracks movement direction/speed.
"""
import time
import logging
from collections import deque
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

from ai.config import ai_config
from ai.detector_yolo import Detection

logger = logging.getLogger("bsc.tracker")


@dataclass
class TrackedObject:
    """Object with persistent ID and movement history."""
    track_id: int
    class_name: str
    category: str
    bbox: Tuple[int, int, int, int]
    confidence: float
    center: Tuple[int, int]
    age: int = 0                  # Frames since first seen
    missed: int = 0               # Consecutive frames not detected
    is_moving: bool = False
    speed: float = 0.0            # Pixels per frame
    direction: str = "stationary" # "left","right","up","down","approaching","retreating"
    positions: deque = field(default_factory=lambda: deque(maxlen=30))

    def update(self, detection: Detection):
        self.bbox = detection.bbox
        self.confidence = detection.confidence
        self.center = detection.center
        self.class_name = detection.class_name
        self.age += 1
        self.missed = 0
        self.positions.append((self.center, time.time()))
        self._compute_movement()

    def mark_missed(self):
        self.missed += 1
        self.age += 1

    def _compute_movement(self):
        if len(self.positions) < 3:
            self.is_moving = False
            self.speed = 0.0
            self.direction = "stationary"
            return

        positions = list(self.positions)
        recent = positions[-5:]  # Last 5 positions

        # Compute average displacement
        total_dx, total_dy = 0.0, 0.0
        for i in range(1, len(recent)):
            (x1, y1), _ = recent[i - 1]
            (x2, y2), _ = recent[i]
            total_dx += x2 - x1
            total_dy += y2 - y1

        n = len(recent) - 1
        avg_dx = total_dx / n
        avg_dy = total_dy / n
        self.speed = (avg_dx**2 + avg_dy**2) ** 0.5

        if self.speed < ai_config.MOVEMENT_THRESHOLD:
            self.is_moving = False
            self.direction = "stationary"
            return

        self.is_moving = True

        # Determine direction
        if abs(avg_dx) > abs(avg_dy):
            self.direction = "right" if avg_dx > 0 else "left"
        else:
            self.direction = "down" if avg_dy > 0 else "up"

        # Approximate approaching/retreating based on bbox size change
        if len(positions) >= 10:
            old_bbox = positions[-10][0] if len(positions) >= 10 else positions[0][0]
            # Use current bbox area vs old position (rough estimate)
            w = self.bbox[2] - self.bbox[0]
            h = self.bbox[3] - self.bbox[1]
            area = w * h
            if area > 0 and self.speed > ai_config.MOVEMENT_THRESHOLD * 2:
                if avg_dy > 0 and abs(avg_dy) > abs(avg_dx) * 1.5:
                    self.direction = "approaching"
                elif avg_dy < 0 and abs(avg_dy) > abs(avg_dx) * 1.5:
                    self.direction = "retreating"


class ObjectTracker:
    """
    Simple IOU-based multi-object tracker.
    Assigns persistent IDs across frames for persons and vehicles.
    """

    def __init__(self):
        self._tracks: Dict[int, TrackedObject] = {}
        self._next_id = 1
        self._iou_threshold = ai_config.TRACKER_IOU_THRESHOLD
        self._max_age = ai_config.TRACKER_MAX_AGE

    def update(self, detections: List[Detection]) -> List[TrackedObject]:
        """
        Match new detections to existing tracks using IOU.
        Returns list of active tracked objects.
        """
        if not detections:
            # Mark all tracks as missed
            dead_ids = []
            for tid, track in self._tracks.items():
                track.mark_missed()
                if track.missed > self._max_age:
                    dead_ids.append(tid)
            for tid in dead_ids:
                del self._tracks[tid]
            return list(self._tracks.values())

        # Build cost matrix (IOU between tracks and detections)
        track_ids = list(self._tracks.keys())
        tracks = [self._tracks[tid] for tid in track_ids]

        matched_tracks = set()
        matched_dets = set()

        if tracks and detections:
            iou_matrix = []
            for track in tracks:
                row = []
                for det in detections:
                    iou = self._compute_iou(track.bbox, det.bbox)
                    # Only match same category
                    if track.category != det.category:
                        iou = 0.0
                    row.append(iou)
                iou_matrix.append(row)

            # Greedy matching (simple but effective)
            while True:
                best_iou = 0
                best_t, best_d = -1, -1
                for t_idx, row in enumerate(iou_matrix):
                    if t_idx in matched_tracks:
                        continue
                    for d_idx, iou in enumerate(row):
                        if d_idx in matched_dets:
                            continue
                        if iou > best_iou:
                            best_iou = iou
                            best_t, best_d = t_idx, d_idx

                if best_iou < self._iou_threshold:
                    break

                matched_tracks.add(best_t)
                matched_dets.add(best_d)
                tracks[best_t].update(detections[best_d])

        # Mark unmatched tracks
        dead_ids = []
        for t_idx, tid in enumerate(track_ids):
            if t_idx not in matched_tracks:
                self._tracks[tid].mark_missed()
                if self._tracks[tid].missed > self._max_age:
                    dead_ids.append(tid)
        for tid in dead_ids:
            del self._tracks[tid]

        # Create new tracks for unmatched detections
        for d_idx, det in enumerate(detections):
            if d_idx not in matched_dets:
                track = TrackedObject(
                    track_id=self._next_id,
                    class_name=det.class_name,
                    category=det.category,
                    bbox=det.bbox,
                    confidence=det.confidence,
                    center=det.center,
                )
                track.positions.append((det.center, time.time()))
                self._tracks[self._next_id] = track
                self._next_id += 1

        return [t for t in self._tracks.values() if t.missed == 0]

    def get_all_tracks(self) -> List[TrackedObject]:
        return list(self._tracks.values())

    def get_movement_summary(self) -> dict:
        """Summarize moving objects."""
        moving = [t for t in self._tracks.values() if t.is_moving and t.missed == 0]
        return {
            "moving_count": len(moving),
            "moving_objects": [
                {
                    "id": t.track_id,
                    "class": t.class_name,
                    "category": t.category,
                    "direction": t.direction,
                    "speed": round(t.speed, 1),
                }
                for t in moving
            ],
        }

    def reset(self):
        self._tracks.clear()
        self._next_id = 1

    @staticmethod
    def _compute_iou(b1, b2) -> float:
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
