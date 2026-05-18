"""Reservoir Computing + Hypernetwork (Sun et al. 2025 적응).

ESN(Echo State Network) reservoir 로 시계열 임베딩 → Hypernetwork(MLP)가
context vector 로부터 readout weight 를 동적 생성 → 4-state 라벨 분류.

원 논문의 adaptive ensemble + hypernetwork-enhanced reservoir 핵심 아이디어를
가벼운 PyTorch + reservoirpy 조합으로 재현.

predict_proba 출력은 hmm_voting 과 동일하게 (T, 4) label-wise softmax 분포.
"""
from __future__ import annotations

import numpy as np
from sklearn.metrics import accuracy_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler

try:
    import torch
    import torch.nn as nn
    from reservoirpy.nodes import Reservoir
    _AVAILABLE = True
except Exception as _e:  # noqa: BLE001
    _AVAILABLE = False
    _IMPORT_ERROR = _e


N_LABELS = 4
RESERVOIR_UNITS = 200
HYPER_HIDDEN = 64
N_EPOCHS = 60
LR = 1e-3
CONTEXT_WINDOW = 20


def _set_inference(module) -> None:
    """torch module 추론 모드 — model.train(False) 와 동일."""
    module.train(False)


class HyperReadout(nn.Module):
    """Context vector → softmax readout weights (output_dim x reservoir_dim+1)."""

    def __init__(self, reservoir_dim: int, context_dim: int,
                 hidden: int = HYPER_HIDDEN, n_labels: int = N_LABELS):
        super().__init__()
        self.reservoir_dim = reservoir_dim
        self.n_labels = n_labels
        self.net = nn.Sequential(
            nn.Linear(context_dim, hidden),
            nn.Tanh(),
            nn.Linear(hidden, n_labels * (reservoir_dim + 1)),
        )

    def forward(self, h: torch.Tensor, ctx: torch.Tensor) -> torch.Tensor:
        # h: (T, reservoir_dim) — reservoir states
        # ctx: (T, context_dim) — recent feature mean (context)
        w = self.net(ctx).view(-1, self.n_labels, self.reservoir_dim + 1)
        h_bias = torch.cat([h, torch.ones(h.shape[0], 1, device=h.device)], dim=1)
        logits = torch.einsum("ti,tji->tj", h_bias, w)
        return logits


def _make_context(features: np.ndarray, window: int = CONTEXT_WINDOW) -> np.ndarray:
    out = np.zeros_like(features)
    for i in range(len(features)):
        lo = max(0, i - window + 1)
        out[i] = features[lo:i + 1].mean(axis=0)
    return out


def train(features: np.ndarray, labels: np.ndarray) -> dict:
    if not _AVAILABLE:
        raise RuntimeError(f"reservoir_hypernet unavailable: {_IMPORT_ERROR}")

    scaler = StandardScaler()
    Xs = scaler.fit_transform(features).astype(np.float32)
    ctx = _make_context(Xs).astype(np.float32)

    X_tr, X_te, y_tr, y_te, ctx_tr, ctx_te = train_test_split(
        Xs, labels, ctx, test_size=0.2, shuffle=False
    )

    res = Reservoir(units=RESERVOIR_UNITS, lr=0.3, sr=0.9, seed=42)
    H_tr = res.run(X_tr)
    H_te = res.run(X_te)

    device = torch.device("cpu")
    model = HyperReadout(reservoir_dim=RESERVOIR_UNITS, context_dim=Xs.shape[1]).to(device)
    optimizer = torch.optim.Adam(model.parameters(), lr=LR)
    loss_fn = nn.CrossEntropyLoss()

    h_tr = torch.from_numpy(H_tr.astype(np.float32))
    c_tr = torch.from_numpy(ctx_tr)
    y_tr_t = torch.from_numpy(y_tr.astype(np.int64))

    model.train(True)
    for _ in range(N_EPOCHS):
        optimizer.zero_grad()
        logits = model(h_tr, c_tr)
        loss = loss_fn(logits, y_tr_t)
        loss.backward()
        optimizer.step()

    _set_inference(model)
    with torch.no_grad():
        h_te = torch.from_numpy(H_te.astype(np.float32))
        c_te = torch.from_numpy(ctx_te)
        proba = torch.softmax(model(h_te, c_te), dim=1).numpy()
    y_pred = np.argmax(proba, axis=1)
    val_acc = float(accuracy_score(y_te, y_pred))

    return {
        "scaler": scaler,
        "model_state": model.state_dict(),
        "model_dims": {"reservoir": RESERVOIR_UNITS, "context": Xs.shape[1]},
        "reservoir": res,
        "validation_accuracy": val_acc,
    }


def predict_proba(bundle: dict, features: np.ndarray) -> np.ndarray:
    if not _AVAILABLE:
        raise RuntimeError(f"reservoir_hypernet unavailable: {_IMPORT_ERROR}")

    Xs = bundle["scaler"].transform(features).astype(np.float32)
    ctx = _make_context(Xs).astype(np.float32)
    res = bundle["reservoir"]
    H = res.run(Xs)

    dims = bundle["model_dims"]
    model = HyperReadout(reservoir_dim=dims["reservoir"], context_dim=dims["context"])
    model.load_state_dict(bundle["model_state"])
    _set_inference(model)
    with torch.no_grad():
        h = torch.from_numpy(H.astype(np.float32))
        c = torch.from_numpy(ctx)
        proba = torch.softmax(model(h, c), dim=1).numpy()
    return proba
