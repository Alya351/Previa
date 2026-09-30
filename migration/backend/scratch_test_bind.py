import socket

target_ip = "192.168.11.102"
local_ip = "192.168.11.100"
port = 554

print(f"=== TESTING BINDING TO LOCAL IP {local_ip} -> {target_ip}:{port} ===")

s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
s.settimeout(4.0)
try:
    s.bind((local_ip, 0))
    res = s.connect_ex((target_ip, port))
    print(f"Bound to {local_ip} -> connect_ex({target_ip}, {port}) = {res} (0 = SUCCESS)")
except Exception as e:
    print(f"Exception: {e}")
finally:
    s.close()
