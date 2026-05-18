"""Feature engineer: 가격 + 매크로 → 모델 input matrix."""
import numpy as np
import pandas as pd


def compute_features(prices: pd.DataFrame, macro: pd.DataFrame) -> pd.DataFrame:
    """
    prices: index=date, columns=[open,high,low,close,volume]
    macro:  index=date, columns=[indicator_id1, indicator_id2, ...]
    return: feature matrix (index=date, dropna 적용)
    """
    out = pd.DataFrame(index=prices.index)
    close = prices["close"].astype(float)
    ret = close.pct_change()

    # 가격 기반 지표
    out["ret_1d"] = ret
    out["ret_5d"] = close.pct_change(5)
    out["ret_20d"] = close.pct_change(20)
    out["vol_20d"] = ret.rolling(20).std()
    out["vol_60d"] = ret.rolling(60).std()

    # RSI(14)
    delta = close.diff()
    up = delta.clip(lower=0).rolling(14).mean()
    down = -delta.clip(upper=0).rolling(14).mean()
    rs = up / (down + 1e-9)
    out["rsi_14"] = 100 - 100 / (1 + rs)

    # MACD
    ema12 = close.ewm(span=12, adjust=False).mean()
    ema26 = close.ewm(span=26, adjust=False).mean()
    out["macd"] = ema12 - ema26
    out["macd_signal"] = out["macd"].ewm(span=9, adjust=False).mean()

    # 거래량 변화율
    out["vol_change"] = prices["volume"].pct_change(5).replace([np.inf, -np.inf], np.nan)

    # 매크로 join (영업일 정렬 후 forward fill)
    if not macro.empty:
        m = macro.reindex(prices.index, method="ffill")
        out = out.join(m, how="left")

    return out.dropna()
