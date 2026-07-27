from collections import Counter

# nano/medium/pose/seg voient les mêmes objets que xlarge : ne pas les recompter.
GENERIC_SOURCE = "xlarge"
DANGER_ROLES = ["threat", "fire", "fight", "fall"]
INFO_ROLES = ["plate", "ppe", "clothing"]

# Pluriels irréguliers rencontrés dans nos labels — le reste prend un "s" par défaut.
IRREGULAR_PLURALS = {
    "couteau": "couteaux",
    "cheval": "chevaux",
    "animal": "animaux",
}


def _pluralize(label: str, count: int) -> str:
    if count == 1:
        return label
    return IRREGULAR_PLURALS.get(label, label + "s")


def extract_facts(results: dict, persons: list | None = None) -> dict:
    facts = [d["label"] for d in results[GENERIC_SOURCE]["detections"]]

    danger_facts = []
    for role_id in DANGER_ROLES:
        danger_facts += [d["label"] for d in results[role_id]["detections"]]

    info_facts = []
    for role_id in INFO_ROLES:
        info_facts += [d["label"] for d in results[role_id]["detections"]]

    known_names = [
        d["name"]
        for d in results.get("face", {}).get("detections", [])
        if d.get("status") == "known" and d.get("name")
    ]

    unauthorized = [
        f"{d['name']} (« {d.get('point_name') or 'ce point'} »)"
        for d in results.get("face", {}).get("detections", [])
        if d.get("status") == "known" and d.get("name") and d.get("unauthorized")
    ]

    loitering = []
    for p in persons or []:
        if not p.get("loitering"):
            continue
        minutes = round(p["dwell_seconds"] / 60)
        signalement = ", ".join(p["description"]) if p["description"] else None
        parts = [p["label"]]
        if p.get("gender") and p["label"] == "individu non identifié":
            parts = [p["gender"]]
        if signalement:
            parts.append(f"({signalement})")
        if p.get("expression") and p["expression"] != "neutre":
            parts.append(f"— air {p['expression']}")
        who = " ".join(parts)
        where = f" près de « {p['point_name']} »" if p.get("point_name") else ""
        loitering.append(f"{who}, présent{where} depuis {minutes} min")

    return {
        "facts": facts,
        "danger": danger_facts,
        "info": info_facts,
        "names": known_names,
        "unauthorized": unauthorized,
        "loitering": loitering,
    }


def _counted_list(labels: list) -> str:
    counts = Counter(labels)
    parts = [f"{n} {_pluralize(label, n)}" for label, n in sorted(counts.items())]
    return ", ".join(parts)


def _describe(f: dict) -> str:
    """Construit une phrase strictement à partir des faits donnés — aucune génération
    libre, donc aucune invention possible. Chaque mot vient directement des données."""
    parts = []

    if f["danger"]:
        parts.append("⚠️ Danger détecté : " + _counted_list(f["danger"]) + ".")

    if f["unauthorized"]:
        parts.append("🚫 Présence non autorisée : " + ", ".join(f["unauthorized"]) + ".")

    if f["loitering"]:
        parts.append("🕵️ Présence prolongée (rôdeur potentiel) : " + " ; ".join(f["loitering"]) + ".")

    # Les personnes reconnues par leur nom sont déjà comptées dans "personne" côté
    # détection générique : on les retire pour ne pas les mentionner deux fois.
    remaining_facts = list(f["facts"])
    if f["names"]:
        parts.append(", ".join(f["names"]) + (" est présent." if len(f["names"]) == 1 else " sont présents."))
        for _ in f["names"]:
            if "personne" in remaining_facts:
                remaining_facts.remove("personne")

    if remaining_facts:
        parts.append("Détecté : " + _counted_list(remaining_facts) + ".")

    if f["info"]:
        parts.append(_counted_list(f["info"]).capitalize() + " détectée." if len(f["info"]) == 1 else _counted_list(f["info"]).capitalize() + " détectées.")

    if not parts:
        return "Rien de particulier à signaler."

    return " ".join(parts)


def summarize(results: dict, persons: list | None = None) -> str:
    return _describe(extract_facts(results, persons))


def summarize_building(camera_facts: dict) -> str:
    """camera_facts: {nom_caméra: (résultats bruts, personnes fusionnées)}"""
    lines = []
    any_activity = False

    for camera_name, (results, persons) in camera_facts.items():
        f = extract_facts(results, persons)
        description = _describe(f)
        if description != "Rien de particulier à signaler.":
            any_activity = True
        lines.append(f"{camera_name} : {description}")

    if not any_activity:
        return "Rien de particulier à signaler sur l'ensemble du bâtiment."

    return " | ".join(lines)
