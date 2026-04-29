from __future__ import annotations
import hashlib
from collections import OrderedDict
from pathlib import Path
from typing import Any
import httpx


class DownloadError(Exception):
    pass


class IntegrityError(Exception):
    pass


class ModelRegistry:
    """ckpt download + sha256 verification + in-memory LRU cache."""

    def __init__(self, model_dir: str, lru_capacity: int = 2) -> None:
        self.model_dir = Path(model_dir)
        self.model_dir.mkdir(parents=True, exist_ok=True)
        self._lru: OrderedDict[str, Any] = OrderedDict()
        self._capacity = lru_capacity

    async def _fetch_bytes(self, url: str) -> bytes:
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(60.0)) as client:
                r = await client.get(url, follow_redirects=True)
                if r.status_code >= 400:
                    raise DownloadError(f"GET {url} -> {r.status_code}")
                return r.content
        except httpx.RequestError as e:
            raise DownloadError(f"network error for {url}: {e}") from e

    async def download(self, model_id: str, url: str, expected_sha256: str) -> str:
        data = await self._fetch_bytes(url)
        actual = hashlib.sha256(data).hexdigest()
        if actual != expected_sha256:
            raise IntegrityError(
                f"sha256 mismatch for {model_id}: expected {expected_sha256}, got {actual}"
            )
        target_dir = self.model_dir / actual
        target_dir.mkdir(parents=True, exist_ok=True)
        target = target_dir / "model.zip"
        target.write_bytes(data)
        return str(target)

    def _cache_set(self, key: str, value: Any) -> None:
        if key in self._lru:
            self._lru.move_to_end(key)
        self._lru[key] = value
        while len(self._lru) > self._capacity:
            self._lru.popitem(last=False)

    def _cache_get(self, key: str) -> Any | None:
        if key not in self._lru:
            return None
        self._lru.move_to_end(key)
        return self._lru[key]

    def loaded_models(self) -> list[str]:
        return list(self._lru.keys())
