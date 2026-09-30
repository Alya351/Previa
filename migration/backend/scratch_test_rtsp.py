import subprocess
import os
import sys

from fonctionnalites.cam.camera.rtsp_service import trouver_ffmpeg

ffmpeg = trouver_ffmpeg()
url = "rtsp://admin:admin@192.168.11.102:554/11"

print(f"FFmpeg path: {ffmpeg}")
print(f"Testing URL: {url}")

transports = ["tcp", "udp", "auto"]
for t in transports:
    if t == "auto":
        cmd = [ffmpeg, "-hide_banner", "-loglevel", "warning", "-i", url, "-vframes", "1", "-an", "-f", "image2pipe", "-vcodec", "mjpeg", "-"]
    else:
        cmd = [ffmpeg, "-hide_banner", "-loglevel", "warning", "-rtsp_transport", t, "-i", url, "-vframes", "1", "-an", "-f", "image2pipe", "-vcodec", "mjpeg", "-"]
    
    try:
        proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=4)
        print(f"Transport: {t} | Exit: {proc.returncode} | Stdout len: {len(proc.stdout)} | Stderr: {proc.stderr.decode('utf-8', errors='ignore')[-200:]}")
    except Exception as e:
        print(f"Transport: {t} | Error: {e}")
