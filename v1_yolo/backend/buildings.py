import json
import secrets
from pathlib import Path

DB_DIR = Path(__file__).resolve().parent.parent / "db"
BUILDINGS_FILE = DB_DIR / "buildings.json"


def _load() -> list:
    if BUILDINGS_FILE.exists():
        with open(BUILDINGS_FILE, encoding="utf-8") as f:
            return json.load(f)
    return []


def _save(buildings: list) -> None:
    BUILDINGS_FILE.parent.mkdir(exist_ok=True)
    with open(BUILDINGS_FILE, "w", encoding="utf-8") as f:
        json.dump(buildings, f, ensure_ascii=False, indent=2)


def _gen_code() -> str:
    return "-".join(secrets.token_hex(2) for _ in range(2)).upper()


class Buildings:
    def __init__(self):
        self.data = _load()
        migrated = False
        for building in self.data:
            if "code" not in building:
                building["code"] = _gen_code()
                migrated = True
        if migrated:
            _save(self.data)

    def list(self) -> list:
        return self.data

    def create_building(self, name: str) -> dict:
        building = {
            "id": secrets.token_hex(4),
            "name": name,
            "code": _gen_code(),
            "points": [],
            "cameras": [],
        }
        self.data.append(building)
        _save(self.data)
        return building

    def _get_building(self, building_id: str) -> dict | None:
        return next((b for b in self.data if b["id"] == building_id), None)

    def find_building_by_code(self, code: str) -> dict | None:
        return next((b for b in self.data if b.get("code") == code.upper()), None)

    def add_point(self, building_id: str, name: str) -> dict | None:
        building = self._get_building(building_id)
        if building is None:
            return None
        point = {"id": secrets.token_hex(4), "name": name}
        building["points"].append(point)
        _save(self.data)
        return point

    def add_camera(self, building_id: str, name: str, point_id: str | None = None) -> dict | None:
        building = self._get_building(building_id)
        if building is None:
            return None
        camera = {
            "id": secrets.token_hex(4),
            "name": name,
            "point_id": point_id,
            "code": _gen_code(),
            "building_id": building_id,
        }
        building["cameras"].append(camera)
        _save(self.data)
        return camera

    def delete_building(self, building_id: str) -> bool:
        before = len(self.data)
        self.data = [b for b in self.data if b["id"] != building_id]
        if len(self.data) == before:
            return False
        _save(self.data)
        return True

    def delete_point(self, building_id: str, point_id: str) -> bool:
        building = self._get_building(building_id)
        if building is None:
            return False
        before = len(building["points"])
        building["points"] = [p for p in building["points"] if p["id"] != point_id]
        if len(building["points"]) == before:
            return False
        _save(self.data)
        return True

    def delete_camera(self, building_id: str, camera_id: str) -> bool:
        building = self._get_building(building_id)
        if building is None:
            return False
        before = len(building["cameras"])
        building["cameras"] = [c for c in building["cameras"] if c["id"] != camera_id]
        if len(building["cameras"]) == before:
            return False
        _save(self.data)
        return True

    def find_camera_by_code(self, code: str) -> dict | None:
        for building in self.data:
            for camera in building["cameras"]:
                if camera["code"] == code.upper():
                    return {**camera, "building_name": building["name"]}
        return None

    def find_camera_by_id(self, camera_id: str) -> dict | None:
        for building in self.data:
            for camera in building["cameras"]:
                if camera["id"] == camera_id:
                    return {**camera, "building_name": building["name"]}
        return None
