"""4-state 휴리스틱 라벨링 (학습 초기 supervision) + 현재 판단 근거 시그널."""
import numpy as np
import pandas as pd


# 임계값 — 단일 진실 원천 (labeling 과 signals 양쪽에서 공유)
THRESHOLDS = {
    "crisis_vix": 30.0,           # VIX > 30 = crisis
    "crisis_ret_20d": -0.10,      # 20일 수익률 < -10% = crisis
    "bull_ret_20d": 0.03,         # 20일 수익률 > +3% = bull (보조: 변동성 조건)
    "bear_ret_20d": -0.03,        # 20일 수익률 < -3% = bear (보조: 변동성 조건)
    "bull_vol_ratio": 1.2,        # 60일 변동성 < median × 1.2 = 안정적 → bull
    "bear_vol_ratio": 1.5,        # 60일 변동성 < median × 1.5 = bear (덜 엄격)
}


def heuristic_labels(features: pd.DataFrame) -> np.ndarray:
    """
    Returns: shape (T,) with 0=bull, 1=bear, 2=sideways, 3=crisis

    규칙 (우선순위: Crisis > Bull/Bear > Sideways):
      Crisis:   VIX > 30 OR 20일 수익률 < -10%
      Bull:     20일 수익률 > +3% AND 60일 변동성 < median × 1.2
      Bear:     20일 수익률 < -3% AND 60일 변동성 < median × 1.5
      Sideways: 나머지
    """
    ret_20d = features["ret_20d"]
    vol_60d = features["vol_60d"]
    vol_median = vol_60d.median()

    vix = features.get("VIXCLS", pd.Series(0, index=features.index))

    labels = np.full(len(features), 2)  # default sideways

    bull = (ret_20d > THRESHOLDS["bull_ret_20d"]) & (vol_60d < vol_median * THRESHOLDS["bull_vol_ratio"])
    bear = (ret_20d < THRESHOLDS["bear_ret_20d"]) & (vol_60d < vol_median * THRESHOLDS["bear_vol_ratio"])
    crisis = (vix > THRESHOLDS["crisis_vix"]) | (ret_20d < THRESHOLDS["crisis_ret_20d"])

    labels[bull.fillna(False).to_numpy()] = 0
    labels[bear.fillna(False).to_numpy()] = 1
    labels[crisis.fillna(False).to_numpy()] = 3

    return labels


def compute_current_signals(features: pd.DataFrame) -> dict:
    """현재 시점(features 마지막 행) 판단 근거 시그널 + 규칙 매칭 결과.

    UI 의 '판단 근거' 섹션 표시용으로 regime_runs.signals 에 저장.
    """
    if len(features) == 0:
        return {}

    last = features.iloc[-1]
    ret_20d = float(last["ret_20d"]) if "ret_20d" in features.columns else None
    vol_60d = float(last["vol_60d"]) if "vol_60d" in features.columns else None
    vol_median = float(features["vol_60d"].median()) if "vol_60d" in features.columns else None
    vix = float(last["VIXCLS"]) if "VIXCLS" in features.columns else None

    # 규칙 매칭 평가
    rules = []
    if vix is not None and ret_20d is not None:
        rule_crisis_vix = vix > THRESHOLDS["crisis_vix"]
        rule_crisis_ret = ret_20d < THRESHOLDS["crisis_ret_20d"]
        rule_bull_ret = ret_20d > THRESHOLDS["bull_ret_20d"]
        rule_bull_vol = vol_60d is not None and vol_median is not None and vol_60d < vol_median * THRESHOLDS["bull_vol_ratio"]
        rule_bear_ret = ret_20d < THRESHOLDS["bear_ret_20d"]
        rule_bear_vol = vol_60d is not None and vol_median is not None and vol_60d < vol_median * THRESHOLDS["bear_vol_ratio"]

        is_crisis = rule_crisis_vix or rule_crisis_ret
        is_bull = rule_bull_ret and rule_bull_vol
        is_bear = rule_bear_ret and rule_bear_vol

        # 우선순위: Crisis > Bull/Bear > Sideways
        if is_crisis:
            matched_rule = "crisis"
            if rule_crisis_vix:
                rules.append({"name": "VIX 위기 임계 초과", "ok": True, "actual": f"VIX {vix:.1f}", "threshold": f"> {THRESHOLDS['crisis_vix']}"})
            if rule_crisis_ret:
                rules.append({"name": "20일 수익률 폭락", "ok": True, "actual": f"{ret_20d*100:.2f}%", "threshold": f"< {THRESHOLDS['crisis_ret_20d']*100:.0f}%"})
        elif is_bull:
            matched_rule = "bull"
            rules.append({"name": "20일 수익률 상승", "ok": True, "actual": f"{ret_20d*100:.2f}%", "threshold": f"> +{THRESHOLDS['bull_ret_20d']*100:.0f}%"})
            rules.append({"name": "60일 변동성 안정", "ok": True, "actual": f"{vol_60d:.4f}", "threshold": f"< 중앙값×{THRESHOLDS['bull_vol_ratio']} ({(vol_median or 0)*THRESHOLDS['bull_vol_ratio']:.4f})"})
        elif is_bear:
            matched_rule = "bear"
            rules.append({"name": "20일 수익률 하락", "ok": True, "actual": f"{ret_20d*100:.2f}%", "threshold": f"< {THRESHOLDS['bear_ret_20d']*100:.0f}%"})
            rules.append({"name": "60일 변동성 (덜 엄격)", "ok": True, "actual": f"{vol_60d:.4f}", "threshold": f"< 중앙값×{THRESHOLDS['bear_vol_ratio']} ({(vol_median or 0)*THRESHOLDS['bear_vol_ratio']:.4f})"})
        else:
            matched_rule = "sideways"
            # 왜 다른 규칙에 해당 안 됐는지 설명
            rules.append({"name": "Crisis 규칙 미해당", "ok": False, "actual": f"VIX {vix:.1f}, 20일 {ret_20d*100:.2f}%", "threshold": f"VIX>{THRESHOLDS['crisis_vix']} OR 수익률<{THRESHOLDS['crisis_ret_20d']*100:.0f}%"})
            rules.append({"name": "Bull 규칙 미해당", "ok": False, "actual": f"수익률 {ret_20d*100:.2f}%, 변동성 {vol_60d:.4f}" if vol_60d else "변동성 없음", "threshold": f"수익률>+{THRESHOLDS['bull_ret_20d']*100:.0f}% AND 안정"})
            rules.append({"name": "Bear 규칙 미해당", "ok": False, "actual": f"수익률 {ret_20d*100:.2f}%", "threshold": f"수익률<{THRESHOLDS['bear_ret_20d']*100:.0f}% AND 변동성 조건"})
    else:
        matched_rule = "unknown"

    return {
        "ret_20d": ret_20d,
        "vol_60d": vol_60d,
        "vol_median": vol_median,
        "vix": vix,
        "thresholds": THRESHOLDS,
        "matched_rule": matched_rule,
        "rules": rules,
    }
