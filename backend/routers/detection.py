"""
Detection Router — AI detection API endpoints.
  POST   /api/detection/cameras          — register camera for AI
  DELETE /api/detection/cameras/{id}     — remove camera from AI
  GET    /api/detection/cameras          — list AI-monitored cameras
  GET    /api/detection/status           — AI engine status
  GET    /api/detection/results          — current detection results
  GET    /api/detection/results/{id}     — detection results for one camera
  GET    /api/detection/stream/{id}      — AI-annotated MJPEG stream
  WS     /api/detection/ws              — live detection events WebSocket
  POST   /api/detection/test/upload      — upload test video
  PATCH  /api/detection/config           — update AI settings
"""
import asyncio
import json
import time
import logging

import cv2
import numpy as np
from fastapi import APIRouter, HTTPException, Query, WebSocket, WebSocketDisconnect, UploadFile, File
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional

from ai.engine import detection_engine
from ai.config import ai_config

logger = logging.getLogger("bsc.detection_router")
router = APIRouter(prefix="/api/detection", tags=["detection"])

# ─── WebSocket subscribers ────────────────────────────────────────────────────
_ws_clients: list[WebSocket] = []


# ─── Request/Response models ─────────────────────────────────────────────────

class CameraRegistration(BaseModel):
    camera_id: str
    url: str
    sector: str = "UNKNOWN"


class AIConfigUpdate(BaseModel):
    person_conf: Optional[float] = None
    vehicle_conf: Optional[float] = None
    fire_conf: Optional[float] = None
    weapon_conf: Optional[float] = None
    alert_cooldown: Optional[int] = None
    alert_enabled: Optional[bool] = None
    frame_skip: Optional[int] = None
    detection_fps: Optional[float] = None


# ─── Camera Management ───────────────────────────────────────────────────────

@router.post("/cameras")
async def register_camera(body: CameraRegistration):
    """Register a camera for AI detection processing."""
    success = detection_engine.add_camera(
        body.camera_id, body.url, body.sector
    )
    if not success:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to add camera. Max cameras: {ai_config.MAX_CAMERAS}",
        )
    return {
        "message": f"Camera {body.camera_id} registered for AI detection",
        "camera_id": body.camera_id,
        "url": body.url,
        "sector": body.sector,
    }


@router.delete("/cameras/{camera_id}")
async def unregister_camera(camera_id: str):
    """Remove a camera from AI detection."""
    detection_engine.remove_camera(camera_id)
    return {"message": f"Camera {camera_id} removed from AI detection"}


@router.get("/cameras")
async def list_ai_cameras():
    """List all cameras registered for AI detection."""
    statuses = detection_engine.pipeline.get_all_statuses()
    return {
        "cameras": list(statuses.values()),
        "count": len(statuses),
    }


# ─── Detection Results ───────────────────────────────────────────────────────

@router.get("/status")
async def get_ai_status():
    """Get AI engine status and performance metrics."""
    return detection_engine.get_status()


@router.get("/results")
async def get_all_results():
    """Get current detection results for all cameras."""
    return detection_engine.get_all_detections()


@router.get("/results/{camera_id}")
async def get_camera_results(camera_id: str):
    """Get current detection results for a specific camera."""
    return detection_engine.get_detections(camera_id)


# ─── AI-Annotated MJPEG Stream ───────────────────────────────────────────────

async def _ai_frame_generator(camera_id: str):
    """
    Generate MJPEG frames with AI annotations for a specific camera.
    Falls back to 'NO AI FEED' placeholder when no annotated frame available.
    """
    # Create placeholder frame
    placeholder = np.zeros((480, 640, 3), dtype=np.uint8)
    cv2.putText(placeholder, "AI PROCESSING...", (140, 230),
                cv2.FONT_HERSHEY_SIMPLEX, 1.2, (0, 255, 0), 2)
    cv2.putText(placeholder, f"Camera: {camera_id}", (180, 280),
                cv2.FONT_HERSHEY_SIMPLEX, 0.6, (100, 100, 100), 1)
    _, ph_jpeg = cv2.imencode('.jpg', placeholder)
    placeholder_bytes = (
        b'--frame\r\nContent-Type: image/jpeg\r\n\r\n'
        + ph_jpeg.tobytes() + b'\r\n'
    )

    while True:
        frame = detection_engine.get_annotated_frame(camera_id)
        if frame is not None:
            ret, buffer = cv2.imencode(
                '.jpg', frame,
                [int(cv2.IMWRITE_JPEG_QUALITY), ai_config.JPEG_QUALITY],
            )
            if ret:
                yield (
                    b'--frame\r\nContent-Type: image/jpeg\r\n\r\n'
                    + buffer.tobytes() + b'\r\n'
                )
            else:
                yield placeholder_bytes
        else:
            yield placeholder_bytes

        await asyncio.sleep(0.033)  # ~30 FPS output


@router.get("/stream/{camera_id}")
async def ai_stream(camera_id: str):
    """
    AI-annotated MJPEG video stream for a camera.
    Shows bounding boxes, labels, and detection HUD.
    """
    return StreamingResponse(
        _ai_frame_generator(camera_id),
        media_type="multipart/x-mixed-replace; boundary=frame",
    )


# ─── WebSocket for live detection data ────────────────────────────────────────

@router.websocket("/ws")
async def detection_ws(websocket: WebSocket):
    """
    WebSocket for real-time detection data.
    Pushes detection events for all cameras.
    Auth: pass token as query param ?token=<JWT>
    """
    from auth import decode_token
    token = websocket.query_params.get("token")
    if not token or decode_token(token) is None:
        await websocket.close(code=4001, reason="Unauthorized")
        return

    await websocket.accept()
    _ws_clients.append(websocket)
    logger.info("Detection WebSocket client connected")

    # Send initial status
    try:
        await websocket.send_text(json.dumps({
            "type": "status",
            "data": detection_engine.get_status(),
        }))
    except Exception:
        pass

    try:
        while True:
            # Push detection updates every 500ms
            all_dets = detection_engine.get_all_detections()
            status = detection_engine.get_status()
            await websocket.send_text(json.dumps({
                "type": "detections",
                "data": all_dets,
                "status": {
                    "running": status["running"],
                    "device": status["device"],
                    "yolo_ms": status["yolo_inference_ms"],
                    "cameras": status["cameras"],
                },
            }))
            await asyncio.sleep(0.5)

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error(f"Detection WS error: {e}")
    finally:
        if websocket in _ws_clients:
            _ws_clients.remove(websocket)


# ─── Test Endpoint ────────────────────────────────────────────────────────────

@router.post("/test/upload")
async def test_video_upload(file: UploadFile = File(...)):
    """
    Upload a test video/image for detection testing.
    Returns detection results for the uploaded file.
    """
    content = await file.read()
    np_arr = np.frombuffer(content, np.uint8)

    if file.content_type and file.content_type.startswith("image"):
        frame = cv2.imdecode(np_arr, cv2.IMREAD_COLOR)
        if frame is None:
            raise HTTPException(400, "Invalid image file")

        # Run detections
        yolo_dets = detection_engine.yolo.detect(frame)
        fire_dets = detection_engine.fire_detector.detect(frame, "test")
        weapon_dets = detection_engine.weapon_detector.validate(
            yolo_dets, frame, "test"
        )

        return {
            "type": "image",
            "detections": {
                "persons": [
                    {"class": d.class_name, "confidence": d.confidence, "bbox": d.bbox}
                    for d in yolo_dets if d.category == "person"
                ],
                "vehicles": [
                    {"class": d.class_name, "confidence": d.confidence, "bbox": d.bbox}
                    for d in yolo_dets if d.category == "vehicle"
                ],
                "fire": [
                    {"confidence": f.confidence, "bbox": f.bbox, "label": f.label}
                    for f in fire_dets
                ],
                "weapons": [
                    {"class": w.class_name, "confidence": w.confidence, "bbox": w.bbox,
                     "near_person": w.near_person}
                    for w in weapon_dets
                ],
            },
            "counts": {
                "humans": len([d for d in yolo_dets if d.category == "person"]),
                "vehicles": len([d for d in yolo_dets if d.category == "vehicle"]),
                "fire": len(fire_dets) > 0,
                "weapons": len(weapon_dets),
            },
        }

    raise HTTPException(400, "Unsupported file type. Use image files.")


# ─── AI Config Update ────────────────────────────────────────────────────────

@router.patch("/config")
async def update_ai_config(body: AIConfigUpdate):
    """Update AI detection configuration at runtime."""
    updates = body.model_dump(exclude_unset=True)

    if "person_conf" in updates:
        ai_config.PERSON_CONF = updates["person_conf"]
    if "vehicle_conf" in updates:
        ai_config.VEHICLE_CONF = updates["vehicle_conf"]
    if "fire_conf" in updates:
        ai_config.FIRE_CONF = updates["fire_conf"]
    if "weapon_conf" in updates:
        ai_config.WEAPON_CONF = updates["weapon_conf"]
    if "alert_cooldown" in updates:
        ai_config.ALERT_COOLDOWN = updates["alert_cooldown"]
    if "alert_enabled" in updates:
        ai_config.ALERT_ENABLED = updates["alert_enabled"]
    if "frame_skip" in updates:
        ai_config.FRAME_SKIP = updates["frame_skip"]
    if "detection_fps" in updates:
        ai_config.DETECTION_FPS = updates["detection_fps"]

    return {
        "message": "AI config updated",
        "config": {
            "person_conf": ai_config.PERSON_CONF,
            "vehicle_conf": ai_config.VEHICLE_CONF,
            "fire_conf": ai_config.FIRE_CONF,
            "weapon_conf": ai_config.WEAPON_CONF,
            "alert_cooldown": ai_config.ALERT_COOLDOWN,
            "alert_enabled": ai_config.ALERT_ENABLED,
            "frame_skip": ai_config.FRAME_SKIP,
            "detection_fps": ai_config.DETECTION_FPS,
        },
    }


# ─── Detection History (Phase 4) ─────────────────────────────────────────────

@router.get("/history")
async def get_detection_history(
    camera_id: Optional[str] = Query(None, description="Filter by camera"),
    limit: int = Query(50, ge=1, le=500),
    skip: int = Query(0, ge=0),
    fire_only: bool = Query(False, description="Show only fire events"),
    weapons_only: bool = Query(False, description="Show only weapon events"),
):
    """
    Query detection history from the database.
    Supports filtering by camera, fire events, and weapon events.
    """
    from database import DetectionLog, engine as db_engine
    from sqlmodel import Session, select, col

    with Session(db_engine) as session:
        stmt = select(DetectionLog).order_by(col(DetectionLog.timestamp).desc())

        if camera_id:
            stmt = stmt.where(DetectionLog.camera_id == camera_id)
        if fire_only:
            stmt = stmt.where(DetectionLog.fire == True)
        if weapons_only:
            stmt = stmt.where(DetectionLog.weapons > 0)

        stmt = stmt.offset(skip).limit(limit)
        results = session.exec(stmt).all()

        return {
            "history": [
                {
                    "id": r.id,
                    "timestamp": r.timestamp.isoformat(),
                    "camera_id": r.camera_id,
                    "sector": r.sector,
                    "humans": r.humans,
                    "vehicles": r.vehicles,
                    "fire": r.fire,
                    "weapons": r.weapons,
                    "avg_confidence": r.avg_confidence,
                    "detection_fps": r.detection_fps,
                    "moving_objects": json.loads(r.moving_objects),
                    "alert_generated": r.alert_generated,
                }
                for r in results
            ],
            "count": len(results),
            "skip": skip,
            "limit": limit,
        }


@router.get("/history/stats")
async def get_detection_stats(
    hours: int = Query(24, ge=1, le=168, description="Hours to look back"),
):
    """Get aggregate detection statistics over the specified time window."""
    from database import DetectionLog, engine as db_engine
    from sqlmodel import Session, select, col, func
    from datetime import datetime, timedelta

    cutoff = datetime.utcnow() - timedelta(hours=hours)

    with Session(db_engine) as session:
        stmt = select(DetectionLog).where(DetectionLog.timestamp >= cutoff)
        results = session.exec(stmt).all()

        total = len(results)
        if total == 0:
            return {
                "hours": hours, "total_snapshots": 0,
                "total_humans": 0, "total_vehicles": 0,
                "fire_events": 0, "weapon_events": 0,
                "alerts_generated": 0, "cameras": [],
            }

        cameras = set()
        total_humans = total_vehicles = fire_events = weapon_events = alerts = 0
        for r in results:
            cameras.add(r.camera_id)
            total_humans += r.humans
            total_vehicles += r.vehicles
            if r.fire:
                fire_events += 1
            weapon_events += r.weapons
            if r.alert_generated:
                alerts += 1

        return {
            "hours": hours,
            "total_snapshots": total,
            "total_humans": total_humans,
            "total_vehicles": total_vehicles,
            "fire_events": fire_events,
            "weapon_events": weapon_events,
            "alerts_generated": alerts,
            "cameras": list(cameras),
        }


# ─── Video Replay Test (Phase 4) ─────────────────────────────────────────────

@router.post("/test/video")
async def test_video_replay(file: UploadFile = File(...)):
    """
    Upload a video file for AI detection testing (replay mode).
    Processes the first 30 frames and returns aggregated results.
    """
    import tempfile
    import os

    content = await file.read()

    if not file.content_type or not file.content_type.startswith("video"):
        raise HTTPException(400, "Upload a video file (mp4, avi, etc.)")

    # Write to a temporary file for OpenCV processing
    tmp_dir = os.path.join(os.path.dirname(os.path.dirname(__file__)), "scratch")
    os.makedirs(tmp_dir, exist_ok=True)
    tmp_path = os.path.join(tmp_dir, f"test_video_{int(time.time())}.mp4")

    try:
        with open(tmp_path, "wb") as f:
            f.write(content)

        cap = cv2.VideoCapture(tmp_path)
        if not cap.isOpened():
            raise HTTPException(400, "Could not open video file")

        fps = cap.get(cv2.CAP_PROP_FPS) or 30
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        max_test_frames = min(30, total_frames)

        all_detections = []
        frame_results = []
        frame_idx = 0

        while frame_idx < max_test_frames:
            ret, frame = cap.read()
            if not ret:
                break

            yolo_dets = detection_engine.yolo.detect(frame)
            fire_dets = detection_engine.fire_detector.detect(frame, "test_video")
            weapon_dets = detection_engine.weapon_detector.validate(
                yolo_dets, frame, "test_video"
            )

            humans = len([d for d in yolo_dets if d.category == "person"])
            vehicles = len([d for d in yolo_dets if d.category == "vehicle"])
            fire = len(fire_dets) > 0
            weapons = len(weapon_dets)

            frame_results.append({
                "frame": frame_idx,
                "humans": humans,
                "vehicles": vehicles,
                "fire": fire,
                "weapons": weapons,
                "detections": len(yolo_dets) + len(fire_dets) + len(weapon_dets),
            })

            frame_idx += 1

        cap.release()

        # Aggregate
        total_humans = sum(r["humans"] for r in frame_results)
        total_vehicles = sum(r["vehicles"] for r in frame_results)
        fire_frames = sum(1 for r in frame_results if r["fire"])
        total_weapons = sum(r["weapons"] for r in frame_results)

        return {
            "type": "video",
            "filename": file.filename,
            "video_fps": fps,
            "total_frames": total_frames,
            "analyzed_frames": len(frame_results),
            "summary": {
                "total_humans_detected": total_humans,
                "total_vehicles_detected": total_vehicles,
                "fire_detected_frames": fire_frames,
                "total_weapons_detected": total_weapons,
                "max_concurrent_humans": max((r["humans"] for r in frame_results), default=0),
                "max_concurrent_vehicles": max((r["vehicles"] for r in frame_results), default=0),
            },
            "per_frame": frame_results,
        }
    finally:
        # Cleanup temp file
        try:
            os.remove(tmp_path)
        except Exception:
            pass


# ─── Performance Tuning (Phase 4) ────────────────────────────────────────────

@router.post("/performance/tune")
async def auto_tune_performance():
    """
    Automatically tune AI detection performance based on current load.
    Adjusts frame_skip and detection_fps for optimal throughput.
    """
    status = detection_engine.get_status()
    num_cameras = status["cameras"]
    yolo_ms = status["yolo_inference_ms"]

    # Auto-tuning logic
    if num_cameras == 0:
        return {"message": "No cameras registered", "tuning": "skipped"}

    old_skip = ai_config.FRAME_SKIP
    old_fps = ai_config.DETECTION_FPS

    if yolo_ms > 200:
        # Very slow inference — increase skip, lower FPS
        ai_config.FRAME_SKIP = max(5, num_cameras * 2)
        ai_config.DETECTION_FPS = 4.0
    elif yolo_ms > 100:
        # Moderate — balance
        ai_config.FRAME_SKIP = max(3, num_cameras)
        ai_config.DETECTION_FPS = 6.0
    elif yolo_ms > 50:
        # Good performance
        ai_config.FRAME_SKIP = 2
        ai_config.DETECTION_FPS = 10.0
    else:
        # Excellent (GPU)
        ai_config.FRAME_SKIP = 1
        ai_config.DETECTION_FPS = 15.0

    return {
        "message": "Performance auto-tuned",
        "inference_ms": yolo_ms,
        "cameras": num_cameras,
        "old": {"frame_skip": old_skip, "detection_fps": old_fps},
        "new": {"frame_skip": ai_config.FRAME_SKIP, "detection_fps": ai_config.DETECTION_FPS},
    }


# ─── Detection History Logger (Background Task) ──────────────────────────────

_log_interval = 5  # seconds between DB snapshots

async def detection_history_logger():
    """Background task that periodically saves detection snapshots to DB."""
    from database import DetectionLog, engine as db_engine
    from sqlmodel import Session

    while True:
        await asyncio.sleep(_log_interval)
        try:
            all_dets = detection_engine.get_all_detections()
            if not all_dets:
                continue

            with Session(db_engine) as session:
                for cam_id, data in all_dets.items():
                    # Only log if there are actual detections
                    if data["humans"] > 0 or data["vehicles"] > 0 or data["fire"] or data["weapons"] > 0:
                        log = DetectionLog(
                            camera_id=cam_id,
                            sector=detection_engine._camera_sectors.get(cam_id, "UNKNOWN"),
                            humans=data["humans"],
                            vehicles=data["vehicles"],
                            fire=data["fire"],
                            weapons=data["weapons"],
                            avg_confidence=0.0,
                            detection_fps=data["detection_fps"],
                            moving_objects=json.dumps(data.get("moving_objects", [])),
                            alert_generated=False,
                        )
                        session.add(log)
                session.commit()
        except Exception as e:
            logger.error(f"Detection history logger error: {e}")
