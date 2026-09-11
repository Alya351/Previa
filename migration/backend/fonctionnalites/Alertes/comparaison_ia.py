"""Appelle l'API locale de comparaison de comportements (voir
../traiteComportement/, README.md) pour obtenir un second avis, validé
par une base de référence de comportements normaux/suspects, en
complément du jugement géométrique déjà en place ici (rodeur.py,
abandonne.py, qui_fait_quoi.py).

Appelé UNIQUEMENT quand un comportement se CONFIRME (changement d'état
déjà journalisé dans 'historique/{pid}') — pas à chaque image, pour ne
pas ajouter un aller-retour réseau à chaque cycle d'analyse.

Ne doit JAMAIS bloquer ni faire planter le pipeline principal si
traiteComportement n'est pas lancé : toute erreur (service éteint,
timeout...) est avalée et renvoie simplement None, comme le fait déjà le
reste du projet pour Firebase (voir les try/except "indisponible" dans
rodeur.py, abandonne.py...)."""
import requests

COMPARAISON_URL = "http://127.0.0.1:8020/compare"
# En régime normal, un appel prend 15-50ms (mesuré en conditions
# réelles) — 3s laisse une vraie marge sans pour autant risquer de
# ralentir sérieusement /qui si jamais traiteComportement est occupé.
COMPARAISON_TIMEOUT_S = 3.0


def comparer(phrase: str) -> dict | None:
    try:
        r = requests.post(COMPARAISON_URL, json={"comportement": phrase}, timeout=COMPARAISON_TIMEOUT_S)
        if r.status_code != 200:
            return None
        data = r.json()
        return {
            "resultat": data.get("resultat"),
            "confiance": data.get("confiance"),
            "type_comportement": data.get("type_comportement"),
        }
    except Exception as exc:
        print(f"[comparaison_ia] traiteComportement indisponible (pas grave, on continue sans) : {exc}", flush=True)
        return None
