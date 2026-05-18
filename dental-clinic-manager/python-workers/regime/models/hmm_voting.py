"""HMM Voting Ensemble — Gupta et al. 2025 충실 재현.

4개 분류기 (HMM + XGBoost + RandomForest + Bagging) soft voting.
"""
import numpy as np
from hmmlearn.hmm import GaussianHMM
from xgboost import XGBClassifier
from sklearn.ensemble import RandomForestClassifier, BaggingClassifier
from sklearn.tree import DecisionTreeClassifier
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score


N_LABELS = 4


def _hmm_state_to_label_map(hmm: GaussianHMM, X: np.ndarray, y: np.ndarray) -> dict:
    """HMM hidden state 0..K-1 → 라벨 0..3 다수결 매핑."""
    states = hmm.predict(X)
    mapping = {}
    for s in range(hmm.n_components):
        idxs = np.where(states == s)[0]
        if len(idxs) == 0:
            mapping[s] = 2  # sideways fallback
        else:
            counts = np.bincount(y[idxs], minlength=N_LABELS)
            mapping[s] = int(np.argmax(counts))
    return mapping


def _hmm_label_proba(hmm: GaussianHMM, state_map: dict, X: np.ndarray) -> np.ndarray:
    """HMM posterior(state) → label-wise probability."""
    state_proba = hmm.predict_proba(X)  # (T, n_components)
    out = np.zeros((len(X), N_LABELS))
    for s, lab in state_map.items():
        out[:, lab] += state_proba[:, s]
    # 정규화 (이미 합 1이지만 안전)
    row_sum = out.sum(axis=1, keepdims=True)
    out = out / np.where(row_sum == 0, 1, row_sum)
    return out


def _padded_proba(model, X: np.ndarray) -> np.ndarray:
    """sklearn-style classifier 의 predict_proba 를 (T, N_LABELS) 로 패딩.

    분류기는 학습 시 본 classes_ 만 출력하므로 데이터에 일부 라벨이 없으면
    shape 가 (T, k<N_LABELS) 가 되어 HMM 의 (T, N_LABELS) 와 평균 불가.
    빠진 라벨 위치를 0 확률로 채운다.
    """
    raw = model.predict_proba(X)
    out = np.zeros((len(X), N_LABELS))
    for i, c in enumerate(model.classes_):
        out[:, int(c)] = raw[:, i]
    return out


def _vote_argmax(hmm, state_map, xgb, rf, bag, X: np.ndarray) -> np.ndarray:
    probs = np.stack([
        _hmm_label_proba(hmm, state_map, X),
        _padded_proba(xgb, X),
        _padded_proba(rf, X),
        _padded_proba(bag, X),
    ])  # (4, T, N_LABELS)
    avg = probs.mean(axis=0)
    return np.argmax(avg, axis=1)


def train(features: np.ndarray, labels: np.ndarray, n_states: int = N_LABELS) -> dict:
    """4개 분류기 학습 + HMM state-to-label 매핑. Returns model bundle dict."""
    # 시계열 안전: shuffle=False
    X_tr, X_te, y_tr, y_te = train_test_split(features, labels, test_size=0.2, shuffle=False)

    hmm = GaussianHMM(
        n_components=n_states, covariance_type="full",
        n_iter=200, random_state=42,
    )
    hmm.fit(X_tr)
    state_map = _hmm_state_to_label_map(hmm, X_tr, y_tr)

    xgb = XGBClassifier(
        n_estimators=200, max_depth=5, random_state=42,
    ).fit(X_tr, y_tr)
    rf = RandomForestClassifier(n_estimators=300, random_state=42).fit(X_tr, y_tr)
    bag = BaggingClassifier(
        estimator=DecisionTreeClassifier(),
        n_estimators=100, random_state=42,
    ).fit(X_tr, y_tr)

    y_pred = _vote_argmax(hmm, state_map, xgb, rf, bag, X_te)
    val_acc = float(accuracy_score(y_te, y_pred))

    return {
        "hmm": hmm, "state_map": state_map,
        "xgb": xgb, "rf": rf, "bag": bag,
        "validation_accuracy": val_acc,
    }


def predict_proba(models: dict, features: np.ndarray) -> np.ndarray:
    """4-state 확률 분포. shape (T, 4)."""
    probs = np.stack([
        _hmm_label_proba(models["hmm"], models["state_map"], features),
        _padded_proba(models["xgb"], features),
        _padded_proba(models["rf"], features),
        _padded_proba(models["bag"], features),
    ])  # (4, T, N_LABELS)
    return probs.mean(axis=0)
