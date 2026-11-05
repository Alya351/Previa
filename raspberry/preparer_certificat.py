"""Prépare le certificat HTTPS de l'API AVANT son démarrage.

uvicorn charge cert.pem/key.pem avant même d'importer l'application : sur
un boîtier neuf (ou après un changement de réseau) ils n'existent pas
encore ou ne correspondent plus à l'IP, et l'API ne démarrerait pas.
Appelé par previa-api.service (ExecStartPre), depuis migration/backend/.
Ne bloque jamais le démarrage : en cas d'erreur, il se contente d'écrire
un message."""
import socket
import sys
from pathlib import Path

sys.path.insert(0, str(Path.cwd()))

try:
    from fonctionnalites.Infrastructure import generer_certificat
except Exception as exc:  # pragma: no cover
    print(f"[certificat] module introuvable depuis {Path.cwd()} : {exc}", flush=True)
    sys.exit(0)


def ip_locale() -> str:
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.settimeout(0.5)
    try:
        s.connect(("1.1.1.1", 80))
        return s.getsockname()[0]
    except Exception:
        return "127.0.0.1"
    finally:
        s.close()


dossier = Path.cwd() / "certs"
dossier.mkdir(parents=True, exist_ok=True)
cert, cle = dossier / "cert.pem", dossier / "key.pem"
ip = ip_locale()
try:
    if cert.exists() and cle.exists() and generer_certificat.couvre_deja_cette_ip(str(cert), ip):
        print(f"[certificat] déjà valide pour {ip}", flush=True)
    else:
        generer_certificat.generer(ip, str(cert), str(cle))
        print(f"[certificat] généré pour {ip}", flush=True)
except Exception as exc:
    print(f"[certificat] échec (non bloquant) : {exc}", flush=True)
