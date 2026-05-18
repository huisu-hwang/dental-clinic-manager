"""Kernel Markov Regime — RHINE (Xu et al. 2024) 적응 구현.

비선형 표현을 위한 KernelPCA → reduced features → GaussianHMM regime switching.
원 논문의 kernel embedding + Markov switching 아이디어를 가벼운 라이브러리
조합으로 재현.

predict_proba 출력은 hmm_voting 과 동일하게 (T, 4) label-wise 분포.
"""
from __future__ import annotations

import numpy as np
from hmmlearn.hmm import GaussianHMM
from sklearn.decomposition import KernelPCA
from sklearn.metrics import accuracy_score
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import StandardScaler


N_LABELS = 4
N_KERNEL_COMPONENTS = 6


def _state_to_label_map(hmm: GaussianHMM, X: np.ndarray, y: np.ndarray) -> dict:
    states = hmm.predict(X)
    mapping = {}
    for s in range(hmm.n_components):
        idxs = np.where(states == s)[0]
        if len(idxs) == 0:
            mapping[s] = 2
        else:
            counts = np.bincount(y[idxs], minlength=N_LABELS)
            mapping[s] = int(np.argmax(counts))
    return mapping


def _label_proba(hmm: GaussianHMM, state_map: dict, X: np.ndarray) -> np.ndarray:
    sp = hmm.predict_proba(X)
    out = np.zeros((len(X), N_LABELS))
    for s, lab in state_map.items():
        out[:, lab] += sp[:, s]
    rs = out.sum(axis=1, keepdims=True)
    return out / np.where(rs == 0, 1, rs)


def train(features: np.ndarray, labels: np.ndarray,
          n_states: int = N_LABELS, kernel: str = "rbf") -> dict:
    """KernelPCA 비선형 임베딩 + HMM regime switching 학습."""
    scaler = StandardScaler()
    Xs = scaler.fit_transform(features)

    # 학습 비용 절감: 1500 row 초과 시 가장 최근 1500 으로
    Xs_kernel_train = Xs[-1500:] if len(Xs) > 1500 else Xs
    kpca = KernelPCA(n_components=N_KERNEL_COMPONENTS, kernel=kernel,
                     gamma=None, random_state=42)
    kpca.fit(Xs_kernel_train)
    X_emb = kpca.transform(Xs)

    X_tr, X_te, y_tr, y_te = train_test_split(X_emb, labels, test_size=0.2, shuffle=False)
    hmm = GaussianHMM(
        n_components=n_states, covariance_type="diag",
        n_iter=200, random_state=42,
    )
    hmm.fit(X_tr)
    state_map = _state_to_label_map(hmm, X_tr, y_tr)

    proba = _label_proba(hmm, state_map, X_te)
    y_pred = np.argmax(proba, axis=1)
    val_acc = float(accuracy_score(y_te, y_pred))

    return {
        "scaler": scaler,
        "kpca": kpca,
        "hmm": hmm,
        "state_map": state_map,
        "validation_accuracy": val_acc,
    }


def predict_proba(model: dict, features: np.ndarray) -> np.ndarray:
    Xs = model["scaler"].transform(features)
    X_emb = model["kpca"].transform(Xs)
    return _label_proba(model["hmm"], model["state_map"], X_emb)


def predict_nstep_transitions(model: dict, features: np.ndarray, horizons: list[int]) -> dict[int, np.ndarray]:
    """Kernel embedding 공간에서 학습된 HMM 의 transmat^n 으로 N-step 전이.

    RHINE(Xu 2024) 의 핵심: 비선형 표현 공간에서 Markov 체인을 학습 → 단순
    원본-feature HMM 보다 비선형 동학을 더 잘 잡음.

    Returns: {horizon: (4,) label-wise probability}
    """
    if len(features) == 0:
        return {h: np.full(N_LABELS, 1.0 / N_LABELS) for h in horizons}

    Xs = model["scaler"].transform(features)
    X_emb = model["kpca"].transform(Xs)
    hmm = model["hmm"]
    state_map = model["state_map"]

    # 마지막 시점의 hidden state (kernel-embedded HMM 기준)
    current_hidden = int(hmm.predict(X_emb[-1:].reshape(1, -1))[0])

    out = {}
    for n in horizons:
        T = np.linalg.matrix_power(hmm.transmat_, n)
        init = np.zeros(hmm.n_components)
        init[current_hidden] = 1.0
        future_hidden = init @ T
        future_label = np.zeros(N_LABELS)
        for s, lab in state_map.items():
            future_label[lab] += future_hidden[s]
        out[n] = future_label
    return out
