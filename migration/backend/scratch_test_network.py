import socket
import subprocess

target_ip = "192.168.11.102"
port = 554

print(f"=== TESTING NETWORK TO {target_ip}:{port} ===")

# Socket test
s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.settimeout(3.0)
try:
    res = s.connect_ex((target_ip, port))
    print(f"Socket connect to {target_ip}:{port} -> result code: {res} (0 = SUCCESS)")
except Exception as e:
    print(f"Socket exception: {e}")
finally:
    s.close()

# Ping test
try:
    ping_res = subprocess.run(["ping", "-n", "2", "-w", "2000", target_ip], capture_output=True, text=True)
    print(f"Ping returncode: {ping_res.returncode}")
    print("Ping output:\n" + ping_res.stdout)
except Exception as e:
    print(f"Ping exception: {e}")
