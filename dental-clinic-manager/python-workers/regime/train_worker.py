"""일배치 학습 워커 (Phase 2 압축판: HMM Voting 1 모델만, 6 시장).

Phase 3 에서 Kernel Markov + Reservoir Hypernet 추가하여 voting 통합.
"""
import sys
from datetime import date, timedelta
import numpy as np

from regime.config import MARKETS, MODEL_VERSION, STATES
from regime.fetchers.fred_fetcher import fetch_all_fred
from regime.fetchers.ecos_fetcher import fetch_all_ecos
from regime.fetchers.price_fetcher import fetch_prices
from regime.features.feature_engineer import compute_features
from regime.labeling import heuristic_labels
from regime.macro_loader import load_macro
from regime.models import hmm_voting
from regime.storage import upload_model
from regime.supabase_client import get_supabase


def _n_step_transition(hmm, state_map: dict, current_hidden_idx: int, n: int) -> dict:
    """HMM transmat^n 으로 N-step 전환 확률 (label 단위)."""
    T = np.linalg.matrix_power(hmm.transmat_, n)
    init = np.zeros(hmm.n_components)
    init[current_hidden_idx] = 1.0
    future_hidden = init @ T
    future_label = np.zeros(4)
    for s, lab in state_map.items():
        future_label[lab] += future_hidden[s]
    return {s: float(p) for s, p in zip(STATES, future_label)}


def train_scope(scope_type: str, scope_id: str, ticker: str, market: str) -> dict:
    """단일 scope 학습 + regime_runs/history upsert. Returns vote dict."""
    print(f"[{scope_type}/{scope_id}] start")
    since = date.today() - timedelta(days=365 * 8)
    prices = fetch_prices(ticker, market, since)
    if prices.empty:
        print(f"  skip: no prices for {ticker}")
        return {}

    macro = load_macro(since)
    feat = compute_features(prices, macro)
    if len(feat) < 200:
        print(f"  skip: features rows={len(feat)} < 200")
        return {}
    labels = heuristic_labels(feat)
    X = feat.values.astype(np.float64)

    # HMM Voting 학습
    m = hmm_voting.train(X, labels)
    path = upload_model(scope_type, scope_id, "hmm_voting", MODEL_VERSION, m)

    sb = get_supabase()
    sb.table("regime_models").upsert({
        "scope_type": scope_type, "scope_id": scope_id,
        "model_type": "hmm_voting", "model_version": MODEL_VERSION,
        "model_blob_path": path,
        "feature_config": {"features": list(feat.columns)},
        "training_samples": len(X),
        "validation_accuracy": float(m["validation_accuracy"]),
    }, on_conflict="scope_type,scope_id,model_type,model_version").execute()

    # 최신 시점 추론
    proba = hmm_voting.predict_proba(m, X)[-1]
    state_idx = int(np.argmax(proba))
    state = STATES[state_idx]
    confidence = float(proba[state_idx])
    state_probs = {s: float(p) for s, p in zip(STATES, proba)}

    # 전환 확률 (HMM transmat)
    current_hidden = int(m["hmm"].predict(X[-1:].reshape(1, -1))[0])
    transitions = {f"{h}d": _n_step_transition(m["hmm"], m["state_map"], current_hidden, h)
                   for h in [5, 10, 30]}

    today = feat.index[-1].date()
    sb.table("regime_runs").upsert({
        "scope_type": scope_type, "scope_id": scope_id,
        "as_of_date": today.isoformat(), "trigger_type": "batch",
        "current_state": state, "current_confidence": confidence,
        "state_probabilities": state_probs,
        "model_votes": {"hmm_voting": {"state": state, "confidence": confidence,
                                        "probs": state_probs}},
        "transition_probabilities": transitions,
        "data_as_of": today.isoformat(),
    }, on_conflict="scope_type,scope_id,as_of_date,trigger_type").execute()

    # History backfill (지난 5년)
    all_proba = hmm_voting.predict_proba(m, X)
    cutoff = max(0, len(feat) - 252 * 5)
    history_rows = []
    for i in range(cutoff, len(feat)):
        idx = int(np.argmax(all_proba[i]))
        history_rows.append({
            "scope_type": scope_type, "scope_id": scope_id,
            "date": feat.index[i].date().isoformat(),
            "state": STATES[idx],
            "confidence": float(all_proba[i, idx]),
        })
    for k in range(0, len(history_rows), 500):
        sb.table("regime_history").upsert(
            history_rows[k:k+500], on_conflict="scope_type,scope_id,date"
        ).execute()

    print(f"  done: state={state} conf={confidence:.2f} val_acc={m['validation_accuracy']:.3f}")
    return {"state": state, "confidence": confidence, "transitions": transitions}


def run_full_batch(scope_filter: str | None = None,
                   macro_backfill_days: int = 365 * 8) -> None:
    """일배치 — 첫 실행은 macro_backfill_days=8년, 이후 일배치는 30일로 충분."""
    today = date.today()
    print(f"== macro fetch (since {macro_backfill_days}d ago) ==")
    fred_n = fetch_all_fred(since=today - timedelta(days=macro_backfill_days))
    print(f"  FRED upsert: {fred_n}")
    try:
        ecos_n = fetch_all_ecos(since=today - timedelta(days=macro_backfill_days), until=today)
        print(f"  ECOS upsert: {ecos_n}")
    except Exception as e:
        print(f"  ECOS warn (continuing): {e}")

    print("== markets ==")
    for name, cfg in MARKETS.items():
        if scope_filter and scope_filter != name:
            continue
        try:
            train_scope("market", name, cfg["ticker"], cfg["market"])
        except Exception as e:
            print(f"  ERROR {name}: {type(e).__name__}: {e}")


if __name__ == "__main__":
    scope = sys.argv[1] if len(sys.argv) > 1 else None
    run_full_batch(scope_filter=scope)
