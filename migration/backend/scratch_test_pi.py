import paramiko, sys

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('192.168.137.233', username='previa', password='Sentinel2k26')

sftp = ssh.open_sftp()
with sftp.file('/tmp/test_rotations.py', 'w') as f:
    f.write("""
import cv2, numpy as np
from fonctionnalites.DetectionPrincipal import on_voit_qui

cap = cv2.VideoCapture('rtsp://admin:admin@192.168.11.121:8554/live')
ret, frame = cap.read()
cap.release()

if ret and frame is not None:
    net = on_voit_qui._get_onnx_yolo()
    
    # 0 deg
    d0 = on_voit_qui._detect_persons_yolo_onnx(net, frame, conf_threshold=0.25)
    print("0 deg detections:", len(d0), d0)
    
    # 90 deg clockwise (cv2.ROTATE_90_CLOCKWISE)
    f90 = cv2.rotate(frame, cv2.ROTATE_90_CLOCKWISE)
    d90 = on_voit_qui._detect_persons_yolo_onnx(net, f90, conf_threshold=0.25)
    print("90 deg detections:", len(d90), d90)

    # 180 deg (cv2.ROTATE_180)
    f180 = cv2.rotate(frame, cv2.ROTATE_180)
    d180 = on_voit_qui._detect_persons_yolo_onnx(net, f180, conf_threshold=0.25)
    print("180 deg detections:", len(d180), d180)
    
    # 270 deg / 90 counter-clockwise (cv2.ROTATE_90_COUNTERCLOCKWISE)
    f270 = cv2.rotate(frame, cv2.ROTATE_90_COUNTERCLOCKWISE)
    d270 = on_voit_qui._detect_persons_yolo_onnx(net, f270, conf_threshold=0.25)
    print("270 deg detections:", len(d270), d270)
""")
sftp.close()

stdin, stdout, stderr = ssh.exec_command('PYTHONPATH=/home/previa/tech-impact/migration/backend python3 /tmp/test_rotations.py')
sys.stdout.buffer.write(stdout.read())
sys.stdout.flush()
ssh.close()
