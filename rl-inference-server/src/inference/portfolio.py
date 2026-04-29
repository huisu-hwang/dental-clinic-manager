from __future__ import annotations
import time
import numpy as np
from src.adapters.sb3 import SB3Adapter
from src.schemas import PredictRequest, PortfolioPredictResponse


class PortfolioInferenceEngine:
    def __init__(self, adapter: SB3Adapter) -> None:
        self._adapter = adapter

    def run(self, req: PredictRequest) -> PortfolioPredictResponse:
        t0 = time.time()
        tickers = sorted(req.ohlcv.keys())
        windows = []
        for t in tickers:
            rows = req.ohlcv[t]
            if len(rows) < req.state_window:
                raise ValueError(f"insufficient OHLCV for {t}: need {req.state_window}, got {len(rows)}")
            closes = [row.close for row in rows[-req.state_window:]]
            windows.append(closes)
        obs = np.array(windows, dtype=np.float32).flatten()

        try:
            action, logits = self._adapter.predict_with_logits(obs)
            confidence = self._adapter.compute_confidence(logits)
            raw = np.asarray(action, dtype=np.float32).ravel()
        except Exception:
            # obs-shape mismatch or any SB3/gym error → equal-weight fallback
            raw = np.array([], dtype=np.float32)
            confidence = 0.0

        if raw.size != len(tickers):
            # dimension mismatch: equal split + low confidence
            weights = {t: 1.0 / len(tickers) for t in tickers}
            # Dimension mismatch fallback: equal split + zero confidence.
            # (fake 1.0 forbidden — see SB3Adapter.compute_confidence contract)
            confidence = 0.0
        else:
            clipped = np.clip(raw, 0.0, None)
            s = clipped.sum()
            if s <= 0:
                weights = {t: 1.0 / len(tickers) for t in tickers}
            else:
                normalized = clipped / s
                weights = {t: float(w) for t, w in zip(tickers, normalized)}

        return PortfolioPredictResponse(
            weights=weights,
            confidence=float(confidence),
            raw_action=raw.tolist(),
            metadata={
                "model_id": req.model_id,
                "algorithm": req.algorithm,
                "latency_ms": round((time.time() - t0) * 1000, 2),
                "n_tickers": len(tickers),
            },
        )
