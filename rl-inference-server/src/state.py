import hashlib
import json


def hash_state(payload: dict) -> str:
    """Deterministic SHA256 of state input."""
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()
