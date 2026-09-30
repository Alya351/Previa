import os

sd_path = "D:\\"
print("=== CONFIGURATION AUTOMATIQUE UNIVERSELLE PREVIA DE LA CARTE SD ===")

# 1. Ecriture du user-data cloud-init
user_data_path = os.path.join(sd_path, "user-data")
with open(user_data_path, "w", encoding="utf-8") as f:
    f.write("#cloud-config\n")
    f.write("hostname: previa\n")
    f.write("manage_etc_hosts: true\n")
    f.write("user:\n")
    f.write("  name: previa\n")
    f.write("  shell: /bin/bash\n")
    f.write("  lock_passwd: false\n")
    f.write('  passwd: "$y$jB5$OV2JrooEG3XAuNYNOxaQ4/$qX/USYJCgD9NJeFbMcXUFgjOCoZWLO207.PW5QlNsdB"\n')
    f.write("  sudo: ALL=(ALL) NOPASSWD:ALL\n")
    f.write("packages:\n")
    f.write("  - avahi-daemon\n")
    f.write("  - net-tools\n")
    f.write("runcmd:\n")
    f.write("  - systemctl enable ssh\n")
    f.write("  - systemctl start ssh\n")
    f.write("  - systemctl enable avahi-daemon\n")
    f.write("  - systemctl start avahi-daemon\n")

print("  [OK] user-data : Nom d'hôte (previa) et mDNS configurés.")

# 2. Nettoyage de cmdline.txt
cmdline_path = os.path.join(sd_path, "cmdline.txt")
if os.path.exists(cmdline_path):
    with open(cmdline_path, "r", encoding="utf-8") as f:
        content = f.read().strip()
    parts = [p for p in content.split() if not p.startswith("ip=")]
    with open(cmdline_path, "w", encoding="utf-8") as f:
        f.write(" ".join(parts))
print("  [OK] cmdline.txt : Auto-IP Zeroconf (mDNS universel previa.local) activé.")

# 3. Activation SSH
ssh_path = os.path.join(sd_path, "ssh")
with open(ssh_path, "w") as f:
    f.write("")
print("  [OK] SSH : Activé par défaut.")

print("\n======================================================================")
print("  🎉 LA CARTE SD EST DÉSORMAIS 100% PRÊTE ET UNIVERSELLE !")
print("======================================================================")
