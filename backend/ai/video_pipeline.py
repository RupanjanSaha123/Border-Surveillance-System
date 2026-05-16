"""
Video Pipeline — Thread-safe camera capture with auto-reconnect.
Each camera runs in its own thread, storing the latest frame in a buffer.
"""
import cv2
import time
import threading
import logging
import numpy as np
from dataclasses import dataclass
from typing import Optional, Dict

from ai.config import ai_config

logger = logging.getLogger("bsc.video_pipeline")


@dataclass
class CameraStatus:
    camera_id: str
    url: str
    connected: bool = False
    fps: float = 0.0
    frame_count: int = 0
    last_frame_time: float = 0.0
    error: Optional[str] = None
    reconnect_count: int = 0


class CameraCapture:
    """
    Thread-safe single camera capture with auto-reconnect.
    Continuously reads frames and stores the latest one.
    """

    def __init__(self, camera_id: str, url: str):
        self.camera_id = camera_id
        self.url = url
        self._lock = threading.Lock()
        self._frame: Optional[np.ndarray] = None
        self._running = False
        self._thread: Optional[threading.Thread] = None
        self._cap: Optional[cv2.VideoCapture] = None
        self._status = CameraStatus(camera_id=camera_id, url=url)
        self._fps_counter = _FPSCounter()

    def start(self):
        """Start the capture thread."""
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(
            target=self._capture_loop,
            name=f"capture-{self.camera_id}",
            daemon=True,
        )
        self._thread.start()
        logger.info(f"[{self.camera_id}] Capture started for {self.url}")

    def stop(self):
        """Stop the capture thread and release resources."""
        self._running = False
        if self._thread:
            self._thread.join(timeout=5)
            self._thread = None
        self._release_capture()
        logger.info(f"[{self.camera_id}] Capture stopped")

    def get_frame(self) -> Optional[np.ndarray]:
        """Get the latest captured frame (thread-safe)."""
        with self._lock:
            return self._frame.copy() if self._frame is not None else None

    def get_status(self) -> CameraStatus:
        """Get current camera status."""
        with self._lock:
            self._status.fps = self._fps_counter.fps
            return CameraStatus(
                camera_id=self._status.camera_id,
                url=self._status.url,
                connected=self._status.connected,
                fps=self._status.fps,
                frame_count=self._status.frame_count,
                last_frame_time=self._status.last_frame_time,
                error=self._status.error,
                reconnect_count=self._status.reconnect_count,
            )

    def update_url(self, new_url: str):
        """Change the camera URL (triggers reconnect)."""
        self.url = new_url
        with self._lock:
            self._status.url = new_url
        self._release_capture()
        logger.info(f"[{self.camera_id}] URL updated to {new_url}")

    def _capture_loop(self):
        """Main capture loop running in a background thread."""
        while self._running:
            try:
                if not self._connect():
                    time.sleep(ai_config.CAPTURE_RECONNECT_INTERVAL)
                    continue

                while self._running and self._cap and self._cap.isOpened():
                    ret, frame = self._cap.read()
                    if not ret:
                        with self._lock:
                            self._status.connected = False
                            self._status.error = "Frame read failed"
                        logger.warning(f"[{self.camera_id}] Frame read failed, reconnecting...")
                        break

                    with self._lock:
                        self._frame = frame
                        self._status.connected = True
                        self._status.frame_count += 1
                        self._status.last_frame_time = time.time()
                        self._status.error = None

                    self._fps_counter.tick()

                    # Small sleep to prevent CPU spinning
                    time.sleep(0.01)

            except Exception as e:
                logger.error(f"[{self.camera_id}] Capture error: {e}")
                with self._lock:
                    self._status.connected = False
                    self._status.error = str(e)

            # Reconnect delay
            if self._running:
                self._release_capture()
                with self._lock:
                    self._status.reconnect_count += 1
                time.sleep(ai_config.CAPTURE_RECONNECT_INTERVAL)

    def _connect(self) -> bool:
        """Attempt to connect to the camera."""
        try:
            self._release_capture()
            logger.info(f"[{self.camera_id}] Connecting to {self.url}...")
            cap = cv2.VideoCapture(self.url)

            if self.url.startswith("rtsp"):
                cap.set(cv2.CAP_PROP_BUFFERSIZE, ai_config.CAPTURE_BUFFER_SIZE)

            if not cap.isOpened():
                with self._lock:
                    self._status.error = "Failed to open stream"
                logger.warning(f"[{self.camera_id}] Failed to open {self.url}")
                return False

            self._cap = cap
            with self._lock:
                self._status.connected = True
                self._status.error = None
            logger.info(f"[{self.camera_id}] Connected successfully")
            return True

        except Exception as e:
            with self._lock:
                self._status.error = str(e)
            return False

    def _release_capture(self):
        """Release OpenCV capture safely."""
        if self._cap:
            try:
                self._cap.release()
            except Exception:
                pass
            self._cap = None


class VideoPipeline:
    """
    Manages multiple camera captures.
    Provides thread-safe access to latest frames from all cameras.
    """

    def __init__(self):
        self._cameras: Dict[str, CameraCapture] = {}
        self._lock = threading.Lock()

    def add_camera(self, camera_id: str, url: str) -> bool:
        """Register and start a camera capture."""
        with self._lock:
            if camera_id in self._cameras:
                # Update URL if camera already exists
                self._cameras[camera_id].update_url(url)
                return True

            if len(self._cameras) >= ai_config.MAX_CAMERAS:
                logger.warning(f"Max cameras ({ai_config.MAX_CAMERAS}) reached")
                return False

            cap = CameraCapture(camera_id, url)
            self._cameras[camera_id] = cap
            cap.start()
            return True

    def remove_camera(self, camera_id: str):
        """Stop and remove a camera capture."""
        with self._lock:
            cap = self._cameras.pop(camera_id, None)
        if cap:
            cap.stop()

    def get_frame(self, camera_id: str) -> Optional[np.ndarray]:
        """Get the latest frame from a specific camera."""
        with self._lock:
            cap = self._cameras.get(camera_id)
        return cap.get_frame() if cap else None

    def get_all_statuses(self) -> Dict[str, dict]:
        """Get status of all cameras."""
        with self._lock:
            cameras = list(self._cameras.items())
        return {
            cid: {
                "camera_id": s.camera_id,
                "url": s.url,
                "connected": s.connected,
                "fps": round(s.fps, 1),
                "frame_count": s.frame_count,
                "error": s.error,
                "reconnect_count": s.reconnect_count,
            }
            for cid, cap in cameras
            for s in [cap.get_status()]
        }

    def get_camera_ids(self) -> list:
        """Get list of registered camera IDs."""
        with self._lock:
            return list(self._cameras.keys())

    def stop_all(self):
        """Stop all camera captures."""
        with self._lock:
            cameras = list(self._cameras.values())
            self._cameras.clear()
        for cap in cameras:
            cap.stop()


class _FPSCounter:
    """Simple FPS counter using a sliding window."""

    def __init__(self, window: float = 2.0):
        self._window = window
        self._times: list[float] = []
        self.fps: float = 0.0

    def tick(self):
        now = time.time()
        self._times.append(now)
        cutoff = now - self._window
        self._times = [t for t in self._times if t > cutoff]
        self.fps = len(self._times) / self._window if self._times else 0.0
