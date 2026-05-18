"""End-to-end smoke: SPY (S&P500 proxy) 으로 실제 파이프라인 검증.

KR 시장 인덱스는 stock_price_cache 에 없으므로 SPY 로 미국 시장 파이프라인 검증.
KR 인덱스는 추후 yahoo-finance2 direct fetch 추가 후 동작.
"""
import pytest
from datetime import date, timedelta
import numpy as np

from regime.fetchers.fred_fetcher import fetch_all_fred
from regime.fetchers.price_fetcher import fetch_prices
from regime.features.feature_engineer import compute_features
from regime.labeling import heuristic_labels
from regime.models.hmm_voting import train, predict_proba
from regime.storage import upload_model, download_model
from regime.supabase_client import get_supabase
from regime.macro_loader import load_macro
from regime.config import MODEL_VERSION


@pytest.mark.slow
def test_end_to_end_spy():
    """SPY 8년치 가격 + 매크로 → 학습 → 추론 → Supabase regime_runs 저장."""
    # 1. Macro 8년치 fetch (incremental — 이미 있는 일자는 upsert no-op)
    today = date.today()
    inserted = fetch_all_fred(today - timedelta(days=365 * 8))
    print(f"\n[E2E] FRED upsert rows={inserted}")
    assert inserted >= 0

    # 2. 가격 + 매크로 결합 → features
    since = today - timedelta(days=365 * 8)
    prices = fetch_prices("SPY", "US", since)
    assert not prices.empty, "SPY 가격 캐시 없음"
    assert len(prices) > 1000, f"SPY 가격 데이터 부족: {len(prices)} rows"

    macro = load_macro(since)
    feat = compute_features(prices, macro)
    assert len(feat) > 500
    labels = heuristic_labels(feat)
    X = feat.values.astype(np.float64)
    print(f"\n[E2E] features shape={X.shape}, labels dist={np.bincount(labels, minlength=4)}")

    # 3. HMM Voting 학습
    m = train(X, labels)
    print(f"[E2E] validation_accuracy={m['validation_accuracy']:.3f}")
    assert m["validation_accuracy"] > 0.50  # 4-state 랜덤 baseline = 0.25

    # 4. Storage 업로드 + 다운로드
    path = upload_model("market", "SPY", "hmm_voting", MODEL_VERSION + "_test", m)
    print(f"[E2E] uploaded to {path}")
    loaded = download_model(path)
    assert "hmm" in loaded

    # 5. 최신 시점 추론
    proba = predict_proba(loaded, X)[-1]
    assert proba.shape == (4,)
    assert abs(proba.sum() - 1.0) < 0.05
    state_idx = int(np.argmax(proba))
    states = ["bull", "bear", "sideways", "crisis"]
    print(f"[E2E] SPY current regime: {states[state_idx]} (conf={proba[state_idx]:.2f})")
    print(f"[E2E] state probabilities: {dict(zip(states, proba.round(3)))}")

    # 6. regime_runs 저장
    sb = get_supabase()
    sb.table("regime_runs").upsert({
        "scope_type": "market",
        "scope_id": "SPY",
        "as_of_date": feat.index[-1].date().isoformat(),
        "trigger_type": "batch",
        "current_state": states[state_idx],
        "current_confidence": float(proba[state_idx]),
        "state_probabilities": {s: float(p) for s, p in zip(states, proba)},
        "model_votes": {"hmm_voting": {"state": states[state_idx],
                                       "confidence": float(proba[state_idx]),
                                       "probs": {s: float(p) for s, p in zip(states, proba)}}},
        "transition_probabilities": {},
        "data_as_of": feat.index[-1].date().isoformat(),
    }, on_conflict="scope_type,scope_id,as_of_date,trigger_type").execute()

    # 7. Supabase 검증
    saved = sb.table("regime_runs").select("*").eq(
        "scope_type", "market").eq("scope_id", "SPY").order(
        "as_of_date", desc=True).limit(1).execute().data
    assert len(saved) == 1
    assert saved[0]["current_state"] == states[state_idx]
    print(f"[E2E] regime_runs row id={saved[0]['id']} saved OK")
