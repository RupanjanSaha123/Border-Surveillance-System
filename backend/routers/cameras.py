"""
Cameras router — Provides an MJPEG proxy for various stream types (RTSP, HTTP, etc.)
Allows browsers to view RTSP streams by transcoding them on the fly.
"""
import asyncio
import cv2
from fastapi import APIRouter, Query, HTTPException
from fastapi.responses import StreamingResponse

router = APIRouter(prefix="/api/cameras", tags=["cameras"])

async def frame_generator(url: str):
    """
    Captures frames from the given URL using OpenCV.
    Supports RTSP, HTTP MJPEG, and other formats handled by OpenCV.
    """
    print(f"[*] Starting camera stream: {url}")
    loop = asyncio.get_event_loop()
    
    # Initialize capture in a separate thread to avoid blocking the event loop
    cap = await loop.run_in_executor(None, cv2.VideoCapture, url)
    
    # Set buffer size to minimum for low latency (especially important for RTSP)
    if url.startswith("rtsp"):
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

    try:
        retry_count = 0
        while True:
            # Read frame
            success, frame = await loop.run_in_executor(None, cap.read)
            
            if not success:
                retry_count += 1
                print(f"[!] Stream disconnected for {url}. Attempting reconnect ({retry_count})...")
                cap.release()
                await asyncio.sleep(2) # Wait before reconnecting
                cap = await loop.run_in_executor(None, cv2.VideoCapture, url)
                if retry_count > 10:
                    print(f"[ERROR] Persistent failure for {url}. Stopping stream.")
                    break
                continue

            retry_count = 0 # Reset on success
            
            # Encode as JPEG
            ret, buffer = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), 75])
            if not ret:
                continue

            # Yield frame in MJPEG format
            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')
            
            # Control frame rate (~20-25 FPS)
            await asyncio.sleep(0.04)
            
    except asyncio.CancelledError:
        print(f"[*] Stream cancelled for {url}")
        cap.release()
    except Exception as e:
        print(f"[ERROR] Streaming error for {url}: {e}")
        cap.release()

@router.get("/stream")
async def stream_camera(url: str = Query(..., description="The camera URL (rtsp, http, etc.)")):
    """
    Proxies a camera stream to MJPEG for browser compatibility.
    """
    if not url:
        raise HTTPException(status_code=400, detail="URL is required")
        
    return StreamingResponse(
        frame_generator(url),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )

