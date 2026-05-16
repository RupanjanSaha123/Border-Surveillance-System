import os
import logging
import time
import numpy as np
from dataclasses import dataclass, field
from typing import List, Optional, Tuple

import openvino
from ultralytics import YOLO
from ai.config import ai_config

logger = logging.getLogger("bsc.detector_yolo")


@dataclass
class Detection:
    """Single object detection result."""
    class_id: int
    class_name: str
    category: str         # "person" | "vehicle" | "weapon"
    confidence: float
    bbox: Tuple[int, int, int, int]  # (x1, y1, x2, y2)
    center: Tuple[int, int] = (0, 0)

    def __post_init__(self):
        x1, y1, x2, y2 = self.bbox
        self.center = ((x1 + x2) // 2, (y1 + y2) // 2)


class YOLODetector:
    """
    Human + Vehicle + Knife detection using YOLOv8.
    Strictly uses OpenVINO GPU (Intel Arc) for inference.
    """

    def __init__(self):
        self._model = None
        self._device = "GPU"
        self._model_path = ai_config.YOLO_MODEL
        self._loaded = False
        self._inference_time: float = 0.0

        # Merge all target classes
        self._target_classes = {}
        self._target_classes.update(ai_config.PERSON_CLASSES)
        self._target_classes.update(ai_config.VEHICLE_CLASSES)
        self._target_classes.update(ai_config.WEAPON_CLASSES)

    def load(self) -> bool:
        """Load the YOLO model strictly with OpenVINO GPU backend."""
        try:
            logger.info(f"Loading YOLO model with GPU: {self._model_path}")
            
            if not self._try_openvino():
                raise RuntimeError("Failed to initialize OpenVINO GPU backend")

            return True

        except Exception as e:
            logger.error(f"CRITICAL: Failed to load AI GPU Engine: {e}")
            return False

    def _try_openvino(self) -> bool:
        """Force load model with OpenVINO GPU backend."""
        try:
            core = openvino.Core()
            devices = core.available_devices
            logger.info(f"OpenVINO devices available: {devices}")

            if "GPU" not in devices:
                logger.error("No Intel GPU detected for OpenVINO acceleration!")
                return False

            model_stem = self._model_path.replace(".pt", "_openvino_model")

            # Search for already-exported OpenVINO model
            search_paths = [
                os.path.join(ai_config.MODELS_DIR, model_stem),
                os.path.join(os.path.dirname(ai_config.MODELS_DIR), model_stem),
                os.path.join(os.getcwd(), model_stem),
            ]

            ov_model_dir = None
            for p in search_paths:
                if os.path.exists(p):
                    ov_model_dir = p
                    break

            if ov_model_dir is None:
                logger.info("Exporting YOLO to OpenVINO GPU format...")
                os.makedirs(ai_config.MODELS_DIR, exist_ok=True)
                base_model = YOLO(self._model_path)
                export_path = base_model.export(format="openvino", half=True) # Use FP16 for GPU
                ov_model_dir = str(export_path) if export_path else search_paths[0]

            # Load OpenVINO model
            self._model = YOLO(ov_model_dir, task="detect")
            self._device = "GPU"
            self._loaded = True
            logger.info("AI GPU Engine successfully initialized on Intel Arc")
            return True

        except Exception as e:
            logger.warning(f"OpenVINO GPU initialization failed: {e}")
            return False


    def detect(self, frame: np.ndarray) -> List[Detection]:
        """
        Run detection on a frame.
        Returns list of Detection objects for persons, vehicles, and knives.
        """
        if not self._loaded or self._model is None:
            return []

        try:
            t0 = time.time()

            results = self._model.predict(
                frame,
                conf=0.25, # Global min threshold for sensitivity
                classes=list(self._target_classes.keys()),
                verbose=False
            )

            self._inference_time = time.time() - t0

            detections: List[Detection] = []

            if not results or len(results) == 0:
                return detections

            result = results[0]
            if result.boxes is None:
                return detections

            boxes = result.boxes
            for i in range(len(boxes)):
                cls_id = int(boxes.cls[i].item())
                conf = float(boxes.conf[i].item())
                x1, y1, x2, y2 = boxes.xyxy[i].tolist()
                bbox = (int(x1), int(y1), int(x2), int(y2))

                class_name = self._target_classes.get(cls_id, "unknown")

                # Determine category and apply per-category threshold
                if cls_id in ai_config.PERSON_CLASSES:
                    if conf < ai_config.PERSON_CONF:
                        continue
                    category = "person"
                elif cls_id in ai_config.VEHICLE_CLASSES:
                    if conf < ai_config.VEHICLE_CONF:
                        continue
                    category = "vehicle"
                elif cls_id in ai_config.WEAPON_CLASSES:
                    if conf < ai_config.WEAPON_CONF:
                        continue
                    category = "weapon"
                else:
                    continue

                detections.append(Detection(
                    class_id=cls_id,
                    class_name=class_name,
                    category=category,
                    confidence=conf,
                    bbox=bbox,
                ))

            return detections

        except Exception as e:
            logger.error(f"Detection error: {e}")
            return []

    @property
    def inference_time_ms(self) -> float:
        return self._inference_time * 1000

    @property
    def is_loaded(self) -> bool:
        return self._loaded

    @property
    def device_info(self) -> str:
        return self._device
