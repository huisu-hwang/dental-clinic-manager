"""일배치 학습 워커 — Phase 3-A: HMM Voting + Kernel Markov + Reservoir Hypernet.

3개 모델 학습 + soft voting 으로 ensemble 확률 산출.
실패한 모델은 votes 에서 제외하고 남은 모델로만 평균.

macOS 에서 BLAS/joblib 멀티프로세싱 fork 와 reservoirpy 가 충돌하여 hang 됨.
import 전 단일 스레드 강제 → 학습 안정성 확보 (전체 학습이 1분 내 완료되므로
스레드 제한이 성능에 영향 없음).
"""
import os
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")
os.environ.setdefault("OBJC_DISABLE_INITIALIZE_FORK_SAFETY", "YES")

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
from regime.models import hmm_voting, kernel_markov, reservoir_hypernet
from regime.storage import upload_model
from regime.supabase_client import get_supabase


MODEL_REGISTRY = [
    ("hmm_voting", hmm_voting),
    ("kernel_markov", kernel_markov),
    ("reservoir_hypernet", reservoir_hypernet),
]


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


def _train_one_model(name: str, module, X: np.ndarray, labels: np.ndarray,
                     scope_type: str, scope_id: str, feature_cols: list) -> tuple[dict | None, np.ndarray | None]:
    """모델 학습 + storage upload + regime_models upsert. 실패 시 (None, None)."""
    try:
        m = module.train(X, labels)
        path = upload_model(scope_type, scope_id, name, MODEL_VERSION, m)
        sb = get_supabase()
        sb.table("regime_models").upsert({
            "scope_type": scope_type, "scope_id": scope_id,
            "model_type": name, "model_version": MODEL_VERSION,
            "model_blob_path": path,
            "feature_config": {"features": feature_cols},
            "training_samples": len(X),
            "validation_accuracy": float(m["validation_accuracy"]),
        }, on_conflict="scope_type,scope_id,model_type,model_version").execute()
        proba = module.predict_proba(m, X)
        return m, proba
    except Exception as e:
        print(f"  WARN {name} skipped: {type(e).__name__}: {e}")
        return None, None


def train_scope(scope_type: str, scope_id: str, ticker: str, market: str) -> dict:
    """단일 scope 학습 + regime_runs/history upsert. Returns ensemble dict."""
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
    feature_cols = list(feat.columns)

    # 3개 모델 학습 (옵셔널)
    trained: dict[str, tuple] = {}
    for name, module in MODEL_REGISTRY:
        m, all_proba = _train_one_model(name, module, X, labels, scope_type, scope_id, feature_cols)
        if m is not None and all_proba is not None:
            trained[name] = (m, all_proba)

    if not trained:
        print(f"  ERROR: no model succeeded for {scope_id}")
        return {}

    # 앙상블 평균
    stacked = np.stack([p for _m, p in trained.values()])  # (M, T, 4)
    ensemble_proba = stacked.mean(axis=0)

    last_proba = ensemble_proba[-1]
    state_idx = int(np.argmax(last_proba))
    state = STATES[state_idx]
    confidence = float(last_proba[state_idx])
    state_probs = {s: float(p) for s, p in zip(STATES, last_proba)}

    # 모델별 vote (마지막 시점)
    model_votes = {}
    for name, (_m, p) in trained.items():
        last = p[-1]
        idx = int(np.argmax(last))
        model_votes[name] = {
            "state": STATES[idx],
            "confidence": float(last[idx]),
            "probs": {s: float(v) for s, v in zip(STATES, last)},
        }

    # 전환 확률 (HMM transmat 기반 — hmm_voting 의 HMM 사용)
    transitions = {}
    if "hmm_voting" in trained:
        m_hmm = trained["hmm_voting"][0]
        current_hidden = int(m_hmm["hmm"].predict(X[-1:].reshape(1, -1))[0])
        transitions = {f"{h}d": _n_step_transition(m_hmm["hmm"], m_hmm["state_map"],
                                                    current_hidden, h)
                       for h in [5, 10, 30]}

    today = feat.index[-1].date()
    sb = get_supabase()
    sb.table("regime_runs").upsert({
        "scope_type": scope_type, "scope_id": scope_id,
        "as_of_date": today.isoformat(), "trigger_type": "batch",
        "current_state": state, "current_confidence": confidence,
        "state_probabilities": state_probs,
        "model_votes": model_votes,
        "transition_probabilities": transitions,
        "data_as_of": today.isoformat(),
    }, on_conflict="scope_type,scope_id,as_of_date,trigger_type").execute()

    # History backfill (지난 5년) — 앙상블 평균 기준
    cutoff = max(0, len(feat) - 252 * 5)
    history_rows = []
    for i in range(cutoff, len(feat)):
        idx = int(np.argmax(ensemble_proba[i]))
        history_rows.append({
            "scope_type": scope_type, "scope_id": scope_id,
            "date": feat.index[i].date().isoformat(),
            "state": STATES[idx],
            "confidence": float(ensemble_proba[i, idx]),
        })
    for k in range(0, len(history_rows), 500):
        sb.table("regime_history").upsert(
            history_rows[k:k+500], on_conflict="scope_type,scope_id,date"
        ).execute()

    acc_summary = ", ".join(f"{n}={t[0]['validation_accuracy']:.2f}" for n, t in trained.items())
    print(f"  done: state={state} conf={confidence:.2f} models=[{acc_summary}]")
    return {"state": state, "confidence": confidence, "transitions": transitions,
            "n_models": len(trained)}


def process_queued_jobs(limit: int = 20) -> None:
    """사용자 ticker 분석 큐 처리. regime_jobs.status='queued' 인 ticker 학습."""
    sb = get_supabase()
    rows = sb.table("regime_jobs").select("*").eq("status", "queued").eq(
        "job_type", "ticker_analyze"
    ).order("requested_at").limit(limit).execute().data or []
    if not rows:
        print("  no queued ticker jobs")
        return
    print(f"== process {len(rows)} queued ticker jobs ==")
    for job in rows:
        job_id = job["id"]
        ticker = job.get("scope_id", "")
        # ticker 자체에 market 정보가 없으면 휴리스틱: 6자리 숫자 → KR, 그 외 → US
        market = "KR" if ticker.isdigit() and len(ticker) == 6 else "US"
        sb.table("regime_jobs").update({
            "status": "running",
            "started_at": "now()",
        }).eq("id", job_id).execute()
        try:
            train_scope("ticker", ticker, ticker, market)
            sb.table("regime_jobs").update({
                "status": "done",
                "finished_at": "now()",
            }).eq("id", job_id).execute()
        except Exception as e:
            err = f"{type(e).__name__}: {e}"
            print(f"  ERROR ticker {ticker}: {err}")
            sb.table("regime_jobs").update({
                "status": "failed",
                "finished_at": "now()",
                "error": err,
            }).eq("id", job_id).execute()


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

    # 시장 학습 후 사용자 ticker 큐 처리
    process_queued_jobs()


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "jobs":
        process_queued_jobs(limit=int(sys.argv[2]) if len(sys.argv) > 2 else 20)
    else:
        scope = sys.argv[1] if len(sys.argv) > 1 else None
        run_full_batch(scope_filter=scope)
