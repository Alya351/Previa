import os

sd_path = "D:\\"
print("=== INJECTION AUTOMATIQUE WI-FI ET SSH SUR CARTE SD ===")

if os.path.exists(sd_path):
    wpa_file = os.path.join(sd_path, "wpa_supplicant.conf")
    with open(wpa_file, "w", encoding="utf-8") as f:
        f.write("country=BF\n")
        f.write("ctrl_interface=DIR=/var/run/wpa_supplicant GROUP=netdev\n")
        f.write("update_config=1\n\n")
        f.write("network={\n")
        f.write('    ssid="Redmi 13C"\n')
        f.write('    psk="Alya12345"\n')
        f.write("    key_mgmt=WPA-PSK\n")
        f.write("}\n")
    print("✅ 1. Fichier Wi-Fi (Redmi 13C) ré-injecté avec succès sur la carte SD !")

    ssh_file = os.path.join(sd_path, "ssh")
    with open(ssh_file, "w") as f:
        f.write("")
    print("✅ 2. Drapeau SSH ré-activé sur la carte SD !")
else:
    print("ℹ️ La carte SD est actuellement insérée dans le Raspberry Pi.")
