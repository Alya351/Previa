import socket
from concurrent.futures import ThreadPoolExecutor

subnet = "192.168.1."
port = 554
open_ips = []

def check_ip(i):
    ip = f"{subnet}{i}"
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(0.3)
    try:
        if s.connect_ex((ip, port)) == 0:
            print(f"FOUND OPEN RTSP PORT 554 AT: {ip}")
            open_ips.append(ip)
    except Exception:
        pass
    finally:
        s.close()

print(f"Scanning {subnet}1..254 for RTSP Port 554...")
with ThreadPoolExecutor(max_workers=50) as executor:
    executor.map(check_ip, range(1, 255))

print(f"Scan complete. Open RTSP IPs on 192.168.1.x: {open_ips}")
