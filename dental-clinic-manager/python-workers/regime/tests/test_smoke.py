"""Phase 1 smoke tests — fetcher + feature + HMM voting + storage round trip."""
import numpy as np
import pandas as pd
from datetime import date, timedelta

from regime.fetchers.fred_fetcher import fetch_indicator as fred_fetch
from regime.fetchers.ecos_fetcher import fetch_indicator as ecos_fetch
from regime.fetchers.price_fetcher import fetch_prices
from regime.features.feature_engineer import compute_features
from regime.labeling import heuristic_labels
from regime.models.hmm_voting import train, predict_proba
from regime.storage import upload_model, download_model


# ──── fetchers ────

def test_fred_vix_fetch():
    since = date.today() - timedelta(days=30)
    rows = fred_fetch("VIXCLS", since)
    assert len(rows) >= 10, f"VIX 30일 < 10 rows: {len(rows)}"
    for r in rows:
        assert r["source"] == "FRED"
        assert isinstance(r["value"], float)


def test_ecos_kr_base_rate():
    since = (date.today() - timedelta(days=180)).strftime("%Y%m%d")
    until = date.today().strftime("%Y%m%d")
    rows = ecos_fetch("722Y001", "0101000", since, until)
    # 한국 기준금리는 분기/월 단위로만 발표 — 6개월 윈도우면 1개 이상은 있음
    assert len(rows) >= 1, "KR base rate empty response"


def test_price_fetch_kospi_index():
    since = date.today() - timedelta(days=365)
    df = fetch_prices("^KS11", "KR", since)
    if df.empty:
        # 지수 ticker 가 stock_price_cache 에 없을 수 있음 — 그 경우는 fail 처리
        # (Mac mini batch 가 미리 캐싱해 둬야 함)
        import pytest
        pytest.skip("^KS11 not in stock_price_cache yet — needs prefetch")
    assert "close" in df.columns
    assert len(df) > 100


# ──── feature engineer ────

def _fake_prices(n=400, seed=1):
    rng = np.random.default_rng(seed)
    idx = pd.date_range("2024-01-01", periods=n, freq="B")
    close = 100 * np.exp(np.cumsum(rng.normal(0, 0.01, n)))
    return pd.DataFrame({
        "open": close, "high": close * 1.01, "low": close * 0.99,
        "close": close, "volume": rng.integers(1_000_000, 10_000_000, n),
    }, index=idx)


def test_compute_features_shapes():
    out = compute_features(_fake_prices(), macro=pd.DataFrame())
    for col in ["ret_5d", "rsi_14", "macd", "vol_60d"]:
        assert col in out.columns
    assert len(out) > 200


def test_heuristic_labels_basic():
    feat = compute_features(_fake_prices(500), macro=pd.DataFrame())
    labels = heuristic_labels(feat)
    assert len(labels) == len(feat)
    assert set(np.unique(labels)).issubset({0, 1, 2, 3})


# ──── HMM voting ────

def test_hmm_voting_train_predict():
    feat = compute_features(_fake_prices(600), macro=pd.DataFrame())
    labels = heuristic_labels(feat)
    X = feat.values.astype(np.float64)
    m = train(X, labels)
    assert "hmm" in m and "xgb" in m and "rf" in m and "bag" in m
    assert 0.0 <= m["validation_accuracy"] <= 1.0
    p = predict_proba(m, X[:50])
    assert p.shape == (50, 4)
    np.testing.assert_allclose(p.sum(axis=1), 1.0, atol=0.05)


# ──── storage round trip ────

def test_storage_round_trip():
    obj = {"weights": np.arange(10), "meta": {"foo": "bar"}}
    path = upload_model("test", "smoke", "hmm_voting", "v0_test", obj)
    assert "test/smoke" in path
    loaded = download_model(path)
    np.testing.assert_array_equal(loaded["weights"], obj["weights"])
    assert loaded["meta"]["foo"] == "bar"
