import hashlib
from pathlib import Path
import pytest
from src.model_registry import ModelRegistry, DownloadError, IntegrityError


def make_dummy_bytes(n: int = 1024) -> bytes:
    return bytes((i % 256 for i in range(n)))


@pytest.mark.asyncio
async def test_download_writes_to_sha256_subdir(tmp_path, monkeypatch):
    payload = make_dummy_bytes()
    expected_sha = hashlib.sha256(payload).hexdigest()
    registry = ModelRegistry(model_dir=str(tmp_path))

    async def fake_fetch(url: str) -> bytes:
        return payload

    monkeypatch.setattr(registry, "_fetch_bytes", fake_fetch)
    path = await registry.download("model-1", "https://example.com/x.zip", expected_sha)
    p = Path(path)
    assert p.exists()
    assert expected_sha in str(p)


@pytest.mark.asyncio
async def test_download_rejects_sha_mismatch(tmp_path, monkeypatch):
    payload = make_dummy_bytes()
    bad_sha = "0" * 64
    registry = ModelRegistry(model_dir=str(tmp_path))

    async def fake_fetch(url: str) -> bytes:
        return payload

    monkeypatch.setattr(registry, "_fetch_bytes", fake_fetch)
    with pytest.raises(IntegrityError):
        await registry.download("model-1", "https://example.com/x.zip", bad_sha)


def test_lru_evicts_oldest_when_capacity_exceeded():
    registry = ModelRegistry(model_dir="/tmp", lru_capacity=2)
    registry._cache_set("a", "obj-a")
    registry._cache_set("b", "obj-b")
    registry._cache_set("c", "obj-c")  # 'a' should be evicted
    assert registry._cache_get("a") is None
    assert registry._cache_get("b") == "obj-b"
    assert registry._cache_get("c") == "obj-c"


def test_loaded_models_returns_cached_keys():
    registry = ModelRegistry(model_dir="/tmp", lru_capacity=2)
    registry._cache_set("a", "obj-a")
    registry._cache_set("b", "obj-b")
    assert sorted(registry.loaded_models()) == ["a", "b"]


import hashlib

def test_download_endpoint_writes_file_and_returns_path(tmp_path, monkeypatch):
    monkeypatch.setenv("RL_API_KEY", "test-key")
    monkeypatch.setenv("MODEL_DIR", str(tmp_path))
    from src.main import app, registry
    from fastapi.testclient import TestClient

    payload = b"fake-model-bytes"
    expected = hashlib.sha256(payload).hexdigest()

    async def fake_fetch(_url: str) -> bytes:
        return payload

    monkeypatch.setattr(registry, "_fetch_bytes", fake_fetch)

    client = TestClient(app)
    body = {
        "model_id": "m1",
        "checkpoint_url": "https://example.com/m.zip",
        "checkpoint_sha256": expected,
    }
    resp = client.post("/models/download", headers={"X-RL-API-KEY": "test-key"}, json=body)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "path" in data
    assert expected in data["path"]


def test_download_endpoint_502_on_network_error(tmp_path, monkeypatch):
    """If httpx fails (timeout / connect error), endpoint should return 502 not 500."""
    monkeypatch.setenv("RL_API_KEY", "test-key")
    monkeypatch.setenv("MODEL_DIR", str(tmp_path))
    from src.main import app, registry
    from fastapi.testclient import TestClient

    async def fake_fetch_raises(_url: str) -> bytes:
        # Simulate the wrapped DownloadError path
        from src.model_registry import DownloadError
        raise DownloadError("network error: simulated timeout")

    monkeypatch.setattr(registry, "_fetch_bytes", fake_fetch_raises)

    client = TestClient(app)
    body = {"model_id": "m_net_err", "checkpoint_url": "https://nope.invalid/x.zip", "checkpoint_sha256": "0" * 64}
    resp = client.post("/models/download", headers={"X-RL-API-KEY": "test-key"}, json=body)
    assert resp.status_code == 502, resp.text


def test_adapter_cache_public_api():
    from src.model_registry import ModelRegistry
    registry = ModelRegistry(model_dir="/tmp", lru_capacity=2)
    assert registry.get_adapter("a") is None
    registry.put_adapter("a", "ADAPTER_A")
    registry.put_adapter("b", "ADAPTER_B")
    assert registry.get_adapter("a") == "ADAPTER_A"
    assert registry.get_adapter("b") == "ADAPTER_B"
    # LRU eviction
    registry.put_adapter("c", "ADAPTER_C")
    assert registry.get_adapter("a") is None  # 'a' evicted (least recent)
    assert registry.get_adapter("b") == "ADAPTER_B"
    assert registry.get_adapter("c") == "ADAPTER_C"
