"""Module de Gestion Thermique & Anti-Surchauffe pour Raspberry Pi 4 (PREVIA Edge AI).

Surveille en continu la température du processeur (CPU/SoC) et adapte dynamiquement 
la fréquence d'analyse et la résolution d'inférence pour éviter le bridage thermique 
(thermal throttling) et maintenir le Raspberry Pi 4 au-dessous de 70°C.
"""
import os
import subprocess
import time
from pathlib import Path

# Niveaux de température (°C)
SEUIL_TIEDE_C = 65.0       # Passage en mode Éco Thermique
SEUIL_SURCHAUFFE_C = 75.0   # Passage en mode Protection Critique

_derniere_mesure_ts = 0.0
_temperature_cache_c = 45.0


def obtenir_temperature_celsius() -> float:
    """Lit la température actuelle du processeur (compatible Raspberry Pi Linux et Windows)."""
    global _derniere_mesure_ts, _temperature_cache_c
    now = time.time()
    if now - _derniere_mesure_ts < 5.0:  # Cache de 5 secondes pour économiser les appels système
        return _temperature_cache_c

    _derniere_mesure_ts = now
    temp_c = 45.0  # Valeur par défaut PC / Environnement sans capteur

    # 1. Lecture directe Linux Raspberry Pi (/sys/class/thermal/thermal_zone0/temp)
    zone_thermal = Path("/sys/class/thermal/thermal_zone0/temp")
    if zone_thermal.exists():
        try:
            val_milli = float(zone_thermal.read_text().strip())
            temp_c = val_milli / 1000.0
            _temperature_cache_c = temp_c
            return temp_c
        except Exception:
            pass

    # 2. Commandes vcgencmd (Raspberry Pi OS)
    try:
        res = subprocess.run(["vcgencmd", "measure_temp"], capture_output=True, text=True, timeout=2)
        if res.returncode == 0 and "temp=" in res.stdout:
            val_str = res.stdout.strip().replace("temp=", "").replace("'C", "")
            temp_c = float(val_str)
            _temperature_cache_c = temp_c
            return temp_c
    except Exception:
        pass

    _temperature_cache_c = temp_c
    return temp_c


def obtenir_profil_thermique() -> dict:
    """Renvoie le profil d'inférence recommandé selon la température du processeur."""
    temp = obtenir_temperature_celsius()

    if temp >= SEUIL_SURCHAUFFE_C:
        return {
            "temperature_celsius": round(temp, 1),
            "regime": "PROTECTION_SURCHAUFFE",
            "intervalle_analyse_sec": 2.5,
            "max_dim_px": 360,
            "skip_segmentation_vetements": True,
            "surchauffe_active": True,
            "message": "⚠️ Température élevée (>75°C) : Inférence allégée pour refroidir le Pi."
        }
    elif temp >= SEUIL_TIEDE_C:
        return {
            "temperature_celsius": round(temp, 1),
            "regime": "ECO_TIEDE",
            "intervalle_analyse_sec": 1.2,
            "max_dim_px": 480,
            "skip_segmentation_vetements": True,
            "surchauffe_active": False,
            "message": "⚡ Température tiède (>65°C) : Mode éco-thermique actif."
        }
    else:
        return {
            "temperature_celsius": round(temp, 1),
            "regime": "NOMINAL",
            "intervalle_analyse_sec": 0.6,
            "max_dim_px": 640,
            "skip_segmentation_vetements": False,
            "surchauffe_active": False,
            "message": "🟢 Température normale (<65°C) : Performances maximales."
        }
