"""Yahoo Finance 직접 fetch — 시장 지수용 (^KS11, ^GSPC 등 stock_price_cache 미포함).

stock_price_cache 는 개별 종목/ETF 중심으로 관리되므로 시장 지수는 별도로 다운로드.
결과는 stock_price_cache 에 저장하지 않고 직접 DataFrame 반환 (학습/추론 시 use).
"""
import pandas as pd
import yfinance as yf
from datetime import date


def fetch_index_prices(yahoo_ticker: str, since: date) -> pd.DataFrame:
    """
    yahoo-finance 에서 시장지수 일봉 fetch.
    Returns: DataFrame (index=date, columns=[open, high, low, close, volume])
    """
    tk = yf.Ticker(yahoo_ticker)
    hist = tk.history(start=since.isoformat(), interval="1d", auto_adjust=False)
    if hist.empty:
        return pd.DataFrame()
    df = hist.rename(columns={
        "Open": "open", "High": "high", "Low": "low",
        "Close": "close", "Volume": "volume",
    })[["open", "high", "low", "close", "volume"]]
    df.index = pd.to_datetime(df.index.date)
    df.index.name = "date"
    return df.dropna()
