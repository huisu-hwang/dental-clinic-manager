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
