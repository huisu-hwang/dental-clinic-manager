/**
 * 프리셋 전략 추가 메타데이터 (상세 설명, 적합 종목/시장 상황)
 *
 * presets.ts와 분리하여 전략 정의(매매 조건)와 설명/추천용 메타데이터를 격리.
 * 추천 알고리즘과 상세 페이지에서 사용.
 */

import type { MarketRegime } from '@/types/investment'

export interface PresetMetadata {
  longDescription: string
  bestFor: string[]
  marketConditions: MarketRegime[]
  typicalHolding: string
  pros: string[]
  cons: string[]
  source: string
}

export const PRESET_METADATA: Record<string, PresetMetadata> = {
  'rsi-oversold': {
    longDescription:
      'RSI(14)가 30 이하로 진입한 후 과매도 반등을 노리는 평균 회귀 전략. 가격이 단기 급락 후 통계적 평균으로 회귀하는 경향을 활용한다. RSI가 70 이상 과매수에 도달하면 매도하여 차익을 실현한다.',
    bestFor: ['변동성 큰 중대형주', '횡보 구간의 종목', '시장 ETF'],
    marketConditions: ['sideways', 'oversold-bounce', 'high-volatility'],
    typicalHolding: '수일~2주',
    pros: ['진입 시그널이 명확하고 단순', '횡보장에서 효과적', '평균 회귀 통계 근거'],
    cons: ['하락 추세에서 연속 손절 발생', '강한 추세 종목에서 조기 매도', '뉴스 충격에 취약'],
    source: 'J. Welles Wilder (1978, "New Concepts in Technical Trading Systems")',
  },
  'golden-cross': {
    longDescription:
      'SMA 20일선이 SMA 50일선을 상향 돌파(골든크로스)하면 매수, 반대로 하향 돌파(데드크로스) 시 매도. 추세의 시작 포착에 사용되는 가장 고전적인 추세 추종 전략.',
    bestFor: ['장기 추세가 명확한 대형주', '지수 ETF', '시가총액 큰 우량주'],
    marketConditions: ['weak-uptrend', 'strong-uptrend'],
    typicalHolding: '1~3개월',
    pros: ['단순하고 직관적', '큰 추세를 놓치지 않음', '심리적으로 따르기 쉬움'],
    cons: ['후행성이 강함 (이미 상승 후 진입)', '횡보장에서 잦은 가짜 신호', '날카로운 추세 변화에 늦음'],
    source: '고전 추세 추종 (Donchian, Dow Theory 계열)',
  },
  'bb-bounce': {
    longDescription:
      '가격이 볼린저 밴드 하단(평균 - 2σ)에 닿고 RSI가 35 미만이면 매수. 통계적 가격 분포에서 양 극단 시점에서의 평균 회귀를 활용하는 전략.',
    bestFor: ['중대형주', '낮은~중간 변동성 종목'],
    marketConditions: ['sideways', 'oversold-bounce'],
    typicalHolding: '수일',
    pros: ['통계적 근거가 강함', 'RSI 결합으로 가짜 신호 ↓', '진입/청산 명확'],
    cons: ['추세 발생 시 손절 빈번', '저유동성 종목에서 노이즈 많음'],
    source: 'John Bollinger (1980s, Bollinger Bands)',
  },
  'macd-signal': {
    longDescription:
      'MACD 라인이 시그널 라인을 상향 돌파(골든크로스)하면 모멘텀 전환 매수 신호로, 하향 돌파 시 매도. 추세와 모멘텀의 변화를 동시에 포착.',
    bestFor: ['중대형 추세 종목', 'ETF', '거래량 풍부한 종목'],
    marketConditions: ['weak-uptrend', 'strong-uptrend'],
    typicalHolding: '2주~2개월',
    pros: ['모멘텀과 추세를 결합', '시그널 발생 빈도 적당', '시각적으로 직관'],
    cons: ['횡보장에서 가짜 신호 다수', '후행성 (이미 추세 진행 후 진입)'],
    source: 'Gerald Appel (1970s, MACD 창시)',
  },
  'panic-buy': {
    longDescription:
      '시장 패닉으로 RSI가 25 이하 극단 과매도에 진입하면 매수, RSI 60 회복 시 익절. 대중과 반대로 행동하는 contrarian(역행) 전략의 가장 단순한 형태.',
    bestFor: ['대형 우량주(부실주 제외)', '시장 폭락 후 회복 가능 종목'],
    marketConditions: ['oversold-bounce', 'high-volatility'],
    typicalHolding: '1~3주',
    pros: ['공포 시점 저점 매수', '높은 기대 수익', '명확한 진입 기준'],
    cons: ['Falling knife 위험 (계속 떨어질 수 있음)', '근본적 부실 종목엔 회복 안 됨'],
    source: 'Contrarian Investing — David Dreman (1979)',
  },
  'fomo-avoid': {
    longDescription:
      'RSI < 50 + Williams %R 과매도(-80 이하)일 때 매수, 과열 신호 시 매도. 대중의 FOMO(Fear of Missing Out) 매수를 회피하면서 조정 구간 진입을 노린다.',
    bestFor: ['추세는 명확하나 단기 조정 중인 종목'],
    marketConditions: ['weak-uptrend', 'oversold-bounce'],
    typicalHolding: '1~3주',
    pros: ['조정 후 반등 포착', '두 지표 cross-check로 정확도 ↑'],
    cons: ['추세 약한 종목엔 부적합', '진입 빈도가 낮음'],
    source: 'Larry Williams + 일반 contrarian 결합',
  },
  'contrarian-extreme': {
    longDescription:
      'RSI/Stochastic/Williams %R 3개 지표가 동시에 극단 과매도일 때만 매수, 1개라도 과매수면 매도. 대중이 모두 매도하는 시점을 포착하는 강한 contrarian.',
    bestFor: ['시가총액 큰 대형주', '체력 강한 우량주'],
    marketConditions: ['oversold-bounce', 'high-volatility'],
    typicalHolding: '2~4주',
    pros: ['삼중 필터로 가짜 신호 최소화', '강한 contrarian 시그널'],
    cons: ['진입 기회가 매우 드뭄', 'Falling knife 위험 동반'],
    source: 'Contrarian + Multi-indicator confirmation',
  },
  'bb-panic-bounce': {
    longDescription:
      'RSI < 30 + CCI < -100 동시 충족 시 매수. 볼린저 밴드 하단을 이탈한 패닉 구간에서 통계적 반등을 노리는 contrarian 변형.',
    bestFor: ['중대형 우량주', '시가총액 상위 ETF'],
    marketConditions: ['oversold-bounce', 'high-volatility'],
    typicalHolding: '수일~2주',
    pros: ['패닉 저점 포착', 'BB + CCI 두 지표 cross-check'],
    cons: ['하락 추세 시 손절 빈번', '신호 발생 빈도 낮음'],
    source: 'BB + CCI 결합 — 일반화된 contrarian',
  },
  'fear-greed-index': {
    longDescription:
      'RSI/BB/Volume/Momentum을 합성한 자체 공포/탐욕 지수(0~100)가 20 이하 극단 공포일 때 매수, 80 이상 극단 탐욕일 때 매도. CNN Fear & Greed 지수의 종목 단위 변형.',
    bestFor: ['지수 ETF', '대형주', '거래량 풍부한 종목'],
    marketConditions: ['oversold-bounce', 'overbought', 'high-volatility'],
    typicalHolding: '2~6주',
    pros: ['시장 심리 기반', '단일 지표 단순 적용'],
    cons: ['지수 정의에 의존', '시그널 빈도 낮음'],
    source: 'CNN Fear & Greed Index 모방',
  },
  'smart-money-trend': {
    longDescription:
      'CMF + Wyckoff Spring/Upthrust 합성 지표(SMI > 30) 매집 구간 진입, -20 이하 분산 시 청산. 거래량과 가격 액션으로 기관(스마트머니) 자금 흐름을 추정하는 중기 전략.',
    bestFor: ['기관 매매 활발한 대형주', '거래량 풍부한 종목'],
    marketConditions: ['weak-uptrend', 'strong-uptrend'],
    typicalHolding: '2주~2개월',
    pros: ['거래량 기반 신뢰성', '추세 초기 진입 가능'],
    cons: ['저거래량 종목에서 부정확', '단기 변동에 취약'],
    source: 'Wyckoff (1930s) + Chaikin Money Flow 결합',
  },
  'smart-money-daily-pulse': {
    longDescription:
      '일일 매집 펄스(0~100)가 50 초과 시 강한 매집 신호로 매수, 다음날 펄스 약화 시 빠르게 청산. 1~3일 내 단타 회전.',
    bestFor: ['거래량 큰 종목', '뉴스/이벤트로 자금 유입 종목'],
    marketConditions: ['high-volatility', 'strong-uptrend'],
    typicalHolding: '1~3일',
    pros: ['빠른 자본 회전', '일일 매집 정밀 포착'],
    cons: ['수수료 영향 큼', '잦은 신호로 피로'],
    source: '거래량/가격 액션 기반 자체 지표',
  },
  'smart-money-combo': {
    longDescription:
      '중기 매집 추세(SMI > 30) + 당일 매집 강세(Pulse > 30) 동시 충족 시에만 진입. 두 지표가 모두 양호해야 하므로 정밀도가 높음.',
    bestFor: ['거래량 매우 높은 대형주'],
    marketConditions: ['strong-uptrend'],
    typicalHolding: '1~2주',
    pros: ['이중 필터로 정확도 ↑', '추세 + 모멘텀 결합'],
    cons: ['진입 기회 드뭄', '두 조건 모두 충족 어려움'],
    source: '스마트머니 합성 (Wyckoff + CMF + Pulse)',
  },
  'fear-greed-conservative': {
    longDescription:
      '공포 지수 ≤25 + SMA(5)가 SMA(20) 상향 돌파(반등 확인) 두 조건 모두 만족 시 매수. 패닉 매수의 위험을 줄이는 보수적 변형.',
    bestFor: ['중대형 우량주', '시장 ETF'],
    marketConditions: ['oversold-bounce'],
    typicalHolding: '2~6주',
    pros: ['반등 확인 후 진입 → Falling knife 회피', '공포 시점 저점 활용'],
    cons: ['진입 타이밍 늦음 (반등 일부 놓침)', '시그널 빈도 낮음'],
    source: 'Fear & Greed + SMA 크로스 결합',
  },
  'day-vwap-bounce': {
    longDescription:
      '5분봉 RSI < 35 과매도일 때 매수, RSI 60 또는 분봉 펄스 약화 시 청산. VWAP 아래에서 반등 노리는 단타.',
    bestFor: ['거래량 매우 큰 종목', '대형주'],
    marketConditions: ['high-volatility'],
    typicalHolding: '수십 분~1시간',
    pros: ['빠른 진입/청산', 'VWAP 기준의 명확한 매매'],
    cons: ['수수료 영향 큼', '슬리피지 발생 시 마이너스'],
    source: 'VWAP + RSI — 기관 단타 변형',
  },
  'day-orb-breakout': {
    longDescription:
      '장 시작 30분 동안 형성된 고점(Opening Range)을 돌파하는 강한 매집 펄스(>40) 발생 시 매수, 펄스 0 이하 약화 시 청산.',
    bestFor: ['거래량 활발한 종목', '뉴스 갭업 종목'],
    marketConditions: ['high-volatility', 'strong-uptrend'],
    typicalHolding: '30분~2시간',
    pros: ['초반 모멘텀 활용', '명확한 진입 기준'],
    cons: ['갭다운/거짓 돌파 리스크', '오전장 한정'],
    source: 'Toby Crabel — Opening Range Breakout (1990s)',
  },
  'day-closing-pressure': {
    longDescription:
      '장 마감 30분 거래량 급증(점유율 25% 이상) + 매집 펄스 강세(>30) 시 매수, 다음날 시가 청산. 마감 매집 효과를 활용하는 오버나잇 단타.',
    bestFor: ['하루 거래량 큰 종목', 'ETF/지수'],
    marketConditions: ['high-volatility', 'strong-uptrend'],
    typicalHolding: '오버나잇~다음날 시초',
    pros: ['장 마감 기관 매집 포착', '단순한 청산 규칙'],
    cons: ['갭다운 리스크', '오버나잇 위험 노출'],
    source: '거래량 분포 + 자체 펄스',
  },
  'tsmom-12m': {
    longDescription:
      '가격이 252일(1년) 평균 위 + RSI > 50 매수. 거의 모든 자산군(주식/채권/원자재/통화)에서 검증된 가장 강건한 추세 효과를 이용.',
    bestFor: ['장기 추세 강한 자산', '지수 ETF', '광범위 자산배분'],
    marketConditions: ['weak-uptrend', 'strong-uptrend'],
    typicalHolding: '수개월~연 단위',
    pros: ['학술적으로 가장 강건', '거시 자산배분에 적합', '단순 명확'],
    cons: ['진입 빈도 낮음', '대규모 조정 시 청산 늦음'],
    source: 'Moskowitz, Ooi, Pedersen (2012, JFE "Time Series Momentum")',
  },
  'faber-200ma': {
    longDescription:
      '가격이 200일 이동평균을 상향 돌파 시 매수, 하향 이탈 시 매도. 자산배분에서 큰 손실(drawdown) 회피용 클래식 룰.',
    bestFor: ['장기 보유용 ETF', '대형 우량주', '지수'],
    marketConditions: ['weak-uptrend', 'strong-uptrend'],
    typicalHolding: '수개월',
    pros: ['매우 단순/실행 용이', '큰 손실 회피 효과', '학술적 검증'],
    cons: ['횡보장 가짜 신호', '거래 빈도 낮음'],
    source: 'Mebane Faber (2007 "A Quantitative Approach to Tactical Asset Allocation")',
  },
  'connors-rsi2': {
    longDescription:
      '장기 상승 추세(가격 > SMA 200) 종목에서 RSI(2) < 10 극단 과매도 시 매수, SMA(5) 상향 돌파 시 청산. 70%+ 승률로 유명한 단기 평균 회귀 전략.',
    bestFor: ['추세가 강한 대형주', '안정적 ETF'],
    marketConditions: ['weak-uptrend', 'strong-uptrend'],
    typicalHolding: '2~7일',
    pros: ['역사적 70%+ 승률', '명확한 룰', '단기 회전 가능'],
    cons: ['진입 빈도 낮음', '최근 효과 다소 감소(연구)'],
    source: 'Larry Connors (2008 "Short Term Trading Strategies That Work")',
  },
  'elder-triple-screen': {
    longDescription:
      '장기 추세(가격 > SMA 50) + 중기 모멘텀(MACD 히스토그램 > 0) + 단기 진입(RSI < 50) 3중 필터 통과 시 매수. 추세/모멘텀/조정을 모두 결합.',
    bestFor: ['중대형 추세 종목', 'ETF'],
    marketConditions: ['weak-uptrend', 'strong-uptrend'],
    typicalHolding: '1~3개월',
    pros: ['3중 필터로 정확도 ↑', '추세+모멘텀+조정 결합'],
    cons: ['진입 기회 적음', '느린 신호'],
    source: 'Dr. Alexander Elder (1986 "Trading for a Living")',
  },
  'bb-breakout': {
    longDescription:
      '가격이 상단 밴드 상향 돌파 시 매수(추세 폭발), 중심선(SMA 20) 하향 이탈 시 청산. 평균 회귀 BB의 추세 추종형 변형.',
    bestFor: ['변동성 확장 국면 종목', '뉴스/이벤트 종목'],
    marketConditions: ['high-volatility', 'strong-uptrend'],
    typicalHolding: '수일~수주',
    pros: ['변동성 폭발 포착', '명확한 청산 기준'],
    cons: ['거짓 돌파 위험', '조정 시 빠른 손절 필요'],
    source: 'John Bollinger 변형 (Volatility Breakout)',
  },
  'macd-histogram-reversal': {
    longDescription:
      'MACD 히스토그램이 0선을 양수로 돌파 시 매수(모멘텀 가속), 음수로 이탈 시 매도. 단순 시그널 크로스보다 빠른 반응성.',
    bestFor: ['중대형 추세 종목', '거래량 풍부한 종목'],
    marketConditions: ['weak-uptrend', 'strong-uptrend'],
    typicalHolding: '2주~2개월',
    pros: ['빠른 모멘텀 반응', '신호 크로스보다 선행'],
    cons: ['횡보장 가짜 신호 多', '즉각 반전 시 손실'],
    source: 'Gerald Appel — MACD 변형',
  },
}
