import cv2
import subprocess
import time

ip = "192.168.11.102"
auth = "admin:admin"

stream_paths = [
    f"rtsp://{auth}@{ip}:554/11",
    f"rtsp://{auth}@{ip}:554/12",
    f"rtsp://{auth}@{ip}:554/1",
    f"rtsp://{auth}@{ip}:554/2",
    f"rtsp://{auth}@{ip}:554/ch0_0.264",
    f"rtsp://{auth}@{ip}:554/Streaming/Channels/101",
    f"rtsp://{auth}@{ip}:554/Streaming/Channels/102",
    f"rtsp://{auth}@{ip}:554/h264Preview_01_main",
    f"rtsp://{auth}@{ip}:554/live/ch0",
]

print("=== TESTING RTSP URL PATHS FOR CAMERA ===")
for url in stream_paths:
    print(f"Testing OpenCV on: {url} ...")
    cap = cv2.VideoCapture(url)
    t0 = time.time()
    opened = cap.isOpened()
    ret = False
    shape = None
    if opened:
        ret, frame = cap.read()
        if ret and frame is not None:
            shape = frame.shape
    cap.release()
    print(f"  Result -> Opened: {opened} | Ret: {ret} | Shape: {shape} | Time: {time.time()-t0:.2f}s")
