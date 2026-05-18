"""4-state 휴리스틱 라벨링 (학습 초기 supervision)."""
import numpy as np
import pandas as pd


def heuristic_labels(features: pd.DataFrame) -> np.ndarray:
    """
    Returns: shape (T,) with 0=bull, 1=bear, 2=sideways, 3=crisis

    규칙:
      Bull:     20일 수익률 > +3%, 60일 변동성 < median × 1.2
      Bear:     20일 수익률 < -3%, 60일 변동성 < median × 1.5
      Crisis:   VIX > 30 OR 20일 수익률 < -10%
      Sideways: 나머지
    """
    ret_20d = features["ret_20d"]
    vol_60d = features["vol_60d"]
    vol_median = vol_60d.median()

    vix = features.get("VIXCLS", pd.Series(0, index=features.index))

    labels = np.full(len(features), 2)  # default sideways

    bull = (ret_20d > 0.03) & (vol_60d < vol_median * 1.2)
    bear = (ret_20d < -0.03) & (vol_60d < vol_median * 1.5)
    crisis = (vix > 30) | (ret_20d < -0.10)

    labels[bull.fillna(False).to_numpy()] = 0
    labels[bear.fillna(False).to_numpy()] = 1
    labels[crisis.fillna(False).to_numpy()] = 3  # crisis 가 bear 보다 우선

    return labels
