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
    Yields a 'No Signal' placeholder if the stream fails.
    """
    print(f"[*] Initializing camera stream: {url}")
    loop = asyncio.get_event_loop()
    
    # Create a "No Signal" placeholder frame
    import numpy as np
    placeholder_frame = np.zeros((480, 640, 3), dtype=np.uint8)
    cv2.putText(placeholder_frame, "NO SIGNAL", (180, 240), 
                cv2.FONT_HERSHEY_SIMPLEX, 2, (0, 0, 255), 3)
    cv2.putText(placeholder_frame, url, (50, 450), 
                cv2.FONT_HERSHEY_SIMPLEX, 0.5, (100, 100, 100), 1)
    _, placeholder_jpeg = cv2.imencode('.jpg', placeholder_frame)
    placeholder_bytes = (b'--frame\r\n'
                         b'Content-Type: image/jpeg\r\n\r\n' + placeholder_jpeg.tobytes() + b'\r\n')

    cap = None
    try:
        # Initial attempt
        cap = await loop.run_in_executor(None, cv2.VideoCapture, url)
        if url.startswith("rtsp"):
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)

        retry_count = 0
        while True:
            success = False
            frame = None
            
            if cap and cap.isOpened():
                success, frame = await loop.run_in_executor(None, cap.read)
            
            if not success:
                retry_count += 1
                if retry_count % 50 == 0: # Log every ~2 seconds
                    print(f"[!] Stream {url} unreachable. Retrying...")
                
                # Re-attempt connection occasionally
                if retry_count % 250 == 0:
                    if cap: cap.release()
                    cap = await loop.run_in_executor(None, cv2.VideoCapture, url)
                
                yield placeholder_bytes
                await asyncio.sleep(0.04) # Maintain 25fps even for placeholder
                continue

            retry_count = 0 
            ret, buffer = cv2.imencode('.jpg', frame, [int(cv2.IMWRITE_JPEG_QUALITY), 75])
            if not ret:
                yield placeholder_bytes
                continue

            yield (b'--frame\r\n'
                   b'Content-Type: image/jpeg\r\n\r\n' + buffer.tobytes() + b'\r\n')
            
            await asyncio.sleep(0.03) # ~30 FPS
            
    except asyncio.CancelledError:
        print(f"[*] Stream task cancelled for {url}")
    except Exception as e:
        print(f"[ERROR] Streaming exception for {url}: {e}")
    finally:
        if cap:
            cap.release()
            print(f"[*] Released camera resource: {url}")


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

