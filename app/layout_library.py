"""Persistent, shareable office layout assets for My Virtual Office."""

from __future__ import annotations

import copy
import json
import math
import os
import re
import uuid
from datetime import datetime, timezone


LAYOUT_FORMAT = "my-virtual-office-layout"
LAYOUT_VERSION = 1
DEFAULT_LAYOUT_ID = "default-office"
MAX_LAYOUTS = 200
MAX_FURNITURE = 1000
MAX_WALLS = 500
MAX_CANVAS_SIZE = 20000


class LayoutValidationError(ValueError):
    """Raised when a layout asset is malformed or unsafe to store."""


def _utc_now():
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def _text(value, field, max_length, required=False):
    result = str(value or "").strip()
    if required and not result:
        raise LayoutValidationError(f"{field} is required")
    if len(result) > max_length:
        raise LayoutValidationError(f"{field} must be {max_length} characters or fewer")
    return result


def _number(value, field, minimum=-MAX_CANVAS_SIZE, maximum=MAX_CANVAS_SIZE):
    if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
        raise LayoutValidationError(f"{field} must be a finite number")
    if value < minimum or value > maximum:
        raise LayoutValidationError(f"{field} is outside the supported range")
    return value


def _positive_number(value, field):
    return _number(value, field, minimum=1, maximum=MAX_CANVAS_SIZE)


def _slug(value):
    return re.sub(r"[^a-z0-9]+", "-", str(value or "").lower()).strip("-")[:48]


def _safe_json_copy(value, field):
    try:
        return json.loads(json.dumps(value, allow_nan=False))
    except (TypeError, ValueError) as exc:
        raise LayoutValidationError(f"{field} must contain JSON-compatible values") from exc


def normalize_layout(asset, *, assign_id=False):
    """Validate and return the canonical v1 layout representation."""
    if not isinstance(asset, dict):
        raise LayoutValidationError("Layout must be a JSON object")
    if asset.get("format") not in (None, LAYOUT_FORMAT):
        raise LayoutValidationError("Unsupported layout format")
    try:
        version = int(asset.get("version", LAYOUT_VERSION))
    except (TypeError, ValueError) as exc:
        raise LayoutValidationError("Layout version must be a number") from exc
    if version != LAYOUT_VERSION:
        raise LayoutValidationError(f"Unsupported layout version: {version}")

    name = _text(asset.get("name"), "name", 80, required=True)
    kind = str(asset.get("kind") or "selection").strip().lower()
    if kind not in {"selection", "office"}:
        raise LayoutValidationError("kind must be 'selection' or 'office'")

    bounds = asset.get("bounds")
    if not isinstance(bounds, dict):
        raise LayoutValidationError("bounds is required")
    normalized_bounds = {
        "width": _positive_number(bounds.get("width"), "bounds.width"),
        "height": _positive_number(bounds.get("height"), "bounds.height"),
    }

    objects = asset.get("objects")
    if not isinstance(objects, dict):
        raise LayoutValidationError("objects is required")
    furniture = objects.get("furniture", [])
    walls = objects.get("walls", [])
    if not isinstance(furniture, list) or len(furniture) > MAX_FURNITURE:
        raise LayoutValidationError(f"objects.furniture must contain at most {MAX_FURNITURE} items")
    if not isinstance(walls, list) or len(walls) > MAX_WALLS:
        raise LayoutValidationError(f"objects.walls must contain at most {MAX_WALLS} walls")
    if not furniture and not walls:
        raise LayoutValidationError("Layout must contain at least one object")

    normalized_furniture = []
    for index, raw in enumerate(furniture):
        if not isinstance(raw, dict):
            raise LayoutValidationError(f"Furniture item {index + 1} must be an object")
        item = _safe_json_copy(raw, f"Furniture item {index + 1}")
        item["type"] = _text(item.get("type"), f"Furniture item {index + 1} type", 64, required=True)
        item["x"] = _number(item.get("x"), f"Furniture item {index + 1} x")
        item["y"] = _number(item.get("y"), f"Furniture item {index + 1} y")
        item.pop("assignedTo", None)
        item.pop("id", None)
        normalized_furniture.append(item)

    normalized_walls = []
    for index, raw in enumerate(walls):
        if not isinstance(raw, dict):
            raise LayoutValidationError(f"Wall {index + 1} must be an object")
        wall = _safe_json_copy(raw, f"Wall {index + 1}")
        for key in ("x1", "y1", "x2", "y2"):
            wall[key] = _number(wall.get(key), f"Wall {index + 1} {key}")
        normalized_walls.append(wall)

    normalized = {
        "format": LAYOUT_FORMAT,
        "version": LAYOUT_VERSION,
        "id": _slug(asset.get("id")),
        "name": name,
        "description": _text(asset.get("description"), "description", 500),
        "author": _text(asset.get("author"), "author", 80),
        "kind": kind,
        "createdAt": _text(asset.get("createdAt"), "createdAt", 64) or _utc_now(),
        "updatedAt": _text(asset.get("updatedAt"), "updatedAt", 64) or _utc_now(),
        "bounds": normalized_bounds,
        "objects": {
            "furniture": normalized_furniture,
            "walls": normalized_walls,
        },
    }

    if kind == "office":
        canvas = asset.get("canvas")
        if not isinstance(canvas, dict):
            raise LayoutValidationError("Full-office layouts require canvas dimensions")
        normalized["canvas"] = {
            "width": _positive_number(canvas.get("width"), "canvas.width"),
            "height": _positive_number(canvas.get("height"), "canvas.height"),
        }
        environment = asset.get("environment", {})
        if not isinstance(environment, dict):
            raise LayoutValidationError("environment must be an object")
        normalized["environment"] = _safe_json_copy(environment, "environment")

    if assign_id or not normalized["id"] or normalized["id"] == DEFAULT_LAYOUT_ID:
        base = _slug(name) or "layout"
        normalized["id"] = f"{base}-{uuid.uuid4().hex[:8]}"
    return normalized


def build_default_layout(default_config):
    """Turn the bundled starter office into the immutable default layout."""
    if not isinstance(default_config, dict):
        raise LayoutValidationError("Bundled default office config is invalid")
    walls = copy.deepcopy(default_config.get("walls") or {})
    interior = walls.pop("interior", [])
    width = default_config.get("canvasWidth", 1000)
    height = default_config.get("canvasHeight", 700)
    asset = normalize_layout({
        "format": LAYOUT_FORMAT,
        "version": LAYOUT_VERSION,
        "id": "bundled-default",
        "name": "Default Office",
        "description": "The original office layout included with My Virtual Office.",
        "author": "My Virtual Office",
        "kind": "office",
        "createdAt": "2026-01-01T00:00:00Z",
        "bounds": {"width": width, "height": height},
        "canvas": {"width": width, "height": height},
        "environment": {
            "walls": walls,
            "floor": copy.deepcopy(default_config.get("floor") or {}),
        },
        "objects": {
            "furniture": copy.deepcopy(default_config.get("furniture") or []),
            "walls": interior,
        },
    })
    asset["id"] = DEFAULT_LAYOUT_ID
    asset["source"] = "bundled"
    asset["readOnly"] = True
    asset["updatedAt"] = asset["createdAt"]
    return asset


class LayoutLibrary:
    def __init__(self, data_dir, default_config_path):
        self.layout_dir = os.path.join(data_dir, "layouts")
        self.default_config_path = default_config_path

    def _default(self):
        with open(self.default_config_path, "r", encoding="utf-8") as handle:
            return build_default_layout(json.load(handle))

    def _path(self, layout_id):
        safe_id = _slug(layout_id)
        if not safe_id or safe_id != layout_id or safe_id == DEFAULT_LAYOUT_ID:
            raise LayoutValidationError("Invalid layout id")
        return os.path.join(self.layout_dir, f"{safe_id}.json")

    def _metadata(self, asset):
        return {
            key: copy.deepcopy(asset.get(key))
            for key in (
                "id", "name", "description", "author", "kind", "createdAt",
                "updatedAt", "bounds", "source", "readOnly"
            )
            if key in asset
        } | {
            "counts": {
                "furniture": len((asset.get("objects") or {}).get("furniture") or []),
                "walls": len((asset.get("objects") or {}).get("walls") or []),
            }
        }

    def list(self):
        assets = [self._metadata(self._default())]
        try:
            names = sorted(os.listdir(self.layout_dir))
        except FileNotFoundError:
            names = []
        for name in names:
            if not name.endswith(".json"):
                continue
            try:
                with open(os.path.join(self.layout_dir, name), "r", encoding="utf-8") as handle:
                    asset = normalize_layout(json.load(handle))
                asset["source"] = "local"
                assets.append(self._metadata(asset))
            except (OSError, json.JSONDecodeError, LayoutValidationError):
                continue
        assets[1:] = sorted(assets[1:], key=lambda item: item.get("updatedAt", ""), reverse=True)
        return assets

    def get(self, layout_id):
        if layout_id == DEFAULT_LAYOUT_ID:
            return self._default()
        with open(self._path(layout_id), "r", encoding="utf-8") as handle:
            asset = normalize_layout(json.load(handle))
        asset["source"] = "local"
        return asset

    def save(self, raw_asset):
        os.makedirs(self.layout_dir, exist_ok=True)
        if len([name for name in os.listdir(self.layout_dir) if name.endswith(".json")]) >= MAX_LAYOUTS:
            raise LayoutValidationError(f"Layout library is limited to {MAX_LAYOUTS} assets")
        asset = normalize_layout(raw_asset, assign_id=True)
        asset["updatedAt"] = _utc_now()
        asset["source"] = "local"
        path = self._path(asset["id"])
        tmp_path = f"{path}.tmp-{os.getpid()}"
        with open(tmp_path, "w", encoding="utf-8") as handle:
            json.dump(asset, handle, indent=2, ensure_ascii=False, allow_nan=False)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp_path, path)
        try:
            os.chmod(path, 0o644)
        except OSError:
            pass
        return asset

    def delete(self, layout_id):
        path = self._path(layout_id)
        os.unlink(path)
