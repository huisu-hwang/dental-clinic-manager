/**
 * 미국 주요 종목 한글 매핑 (Yahoo Finance 한글 검색 미지원 대응)
 *
 * 구성: S&P 500 상위 + 주요 관심주 + 한국 투자자 선호 ETF
 */

import { searchTickerDict } from './krTickerDict'

export interface USTickerEntry {
  ticker: string
  name: string  // 영문 정식 명칭
  alias?: string[]  // 한글 별칭 + 영문 약칭
  exchange?: string
}

export const US_TICKER_DICT: USTickerEntry[] = [
  // 빅테크 (Mega Cap)
  { ticker: 'AAPL', name: 'Apple Inc.', alias: ['애플', 'apple'], exchange: 'NMS' },
  { ticker: 'MSFT', name: 'Microsoft Corp.', alias: ['마이크로소프트', 'microsoft', 'MS'], exchange: 'NMS' },
  { ticker: 'GOOGL', name: 'Alphabet Inc. (Class A)', alias: ['구글', '알파벳', 'google', 'alphabet'], exchange: 'NMS' },
  { ticker: 'GOOG', name: 'Alphabet Inc. (Class C)', alias: ['구글', '알파벳', 'google', 'alphabet'], exchange: 'NMS' },
  { ticker: 'AMZN', name: 'Amazon.com Inc.', alias: ['아마존', 'amazon'], exchange: 'NMS' },
  { ticker: 'META', name: 'Meta Platforms Inc.', alias: ['메타', '페이스북', 'facebook', 'meta'], exchange: 'NMS' },
  { ticker: 'NVDA', name: 'NVIDIA Corp.', alias: ['엔비디아', 'nvidia'], exchange: 'NMS' },
  { ticker: 'TSLA', name: 'Tesla Inc.', alias: ['테슬라', 'tesla'], exchange: 'NMS' },

  // 반도체
  { ticker: 'AMD', name: 'Advanced Micro Devices', alias: ['에이엠디', 'amd'], exchange: 'NMS' },
  { ticker: 'INTC', name: 'Intel Corp.', alias: ['인텔', 'intel'], exchange: 'NMS' },
  { ticker: 'TSM', name: 'Taiwan Semiconductor', alias: ['TSMC', '타이완반도체', 'tsmc', 'taiwan semi'], exchange: 'NYQ' },
  { ticker: 'QCOM', name: 'Qualcomm Inc.', alias: ['퀄컴', 'qualcomm'], exchange: 'NMS' },
  { ticker: 'AVGO', name: 'Broadcom Inc.', alias: ['브로드컴', 'broadcom'], exchange: 'NMS' },
  { ticker: 'MU', name: 'Micron Technology', alias: ['마이크론', 'micron'], exchange: 'NMS' },
  { ticker: 'TXN', name: 'Texas Instruments', alias: ['텍사스인스트루먼트', 'texas instruments', 'TI'], exchange: 'NMS' },
  { ticker: 'AMAT', name: 'Applied Materials', alias: ['어플라이드머티리얼즈', 'applied materials'], exchange: 'NMS' },
  { ticker: 'ASML', name: 'ASML Holding NV', alias: ['ASML', '에이에스엠엘'], exchange: 'NMS' },
  { ticker: 'LRCX', name: 'Lam Research Corp.', alias: ['램리서치', 'lam research'], exchange: 'NMS' },

  // 금융
  { ticker: 'JPM', name: 'JPMorgan Chase & Co.', alias: ['JP모건', '제이피모건', 'jpmorgan', 'jp morgan'], exchange: 'NYQ' },
  { ticker: 'BAC', name: 'Bank of America', alias: ['뱅크오브아메리카', '뱅크오브어메리카', 'bank of america', 'BoA'], exchange: 'NYQ' },
  { ticker: 'WFC', name: 'Wells Fargo & Co.', alias: ['웰스파고', 'wells fargo'], exchange: 'NYQ' },
  { ticker: 'GS', name: 'Goldman Sachs Group', alias: ['골드만삭스', 'goldman sachs'], exchange: 'NYQ' },
  { ticker: 'MS', name: 'Morgan Stanley', alias: ['모건스탠리', 'morgan stanley'], exchange: 'NYQ' },
  { ticker: 'BRK.B', name: 'Berkshire Hathaway (Class B)', alias: ['버크셔해서웨이', '버크셔', 'berkshire', 'buffett'], exchange: 'NYQ' },
  { ticker: 'V', name: 'Visa Inc.', alias: ['비자', 'visa'], exchange: 'NYQ' },
  { ticker: 'MA', name: 'Mastercard Inc.', alias: ['마스터카드', 'mastercard'], exchange: 'NYQ' },
  { ticker: 'PYPL', name: 'PayPal Holdings', alias: ['페이팔', 'paypal'], exchange: 'NMS' },
  { ticker: 'AXP', name: 'American Express', alias: ['아메리칸익스프레스', 'american express', 'amex'], exchange: 'NYQ' },

  // 헬스케어
  { ticker: 'JNJ', name: 'Johnson & Johnson', alias: ['존슨앤존슨', 'johnson & johnson', 'JNJ'], exchange: 'NYQ' },
  { ticker: 'PFE', name: 'Pfizer Inc.', alias: ['화이자', 'pfizer'], exchange: 'NYQ' },
  { ticker: 'MRNA', name: 'Moderna Inc.', alias: ['모더나', 'moderna'], exchange: 'NMS' },
  { ticker: 'LLY', name: 'Eli Lilly and Co.', alias: ['일라이릴리', '릴리', 'eli lilly', 'lilly'], exchange: 'NYQ' },
  { ticker: 'UNH', name: 'UnitedHealth Group', alias: ['유나이티드헬스', 'unitedhealth'], exchange: 'NYQ' },
  { ticker: 'ABBV', name: 'AbbVie Inc.', alias: ['애브비', 'abbvie'], exchange: 'NYQ' },
  { ticker: 'MRK', name: 'Merck & Co.', alias: ['머크', 'merck'], exchange: 'NYQ' },

  // 소비재/리테일
  { ticker: 'WMT', name: 'Walmart Inc.', alias: ['월마트', 'walmart'], exchange: 'NYQ' },
  { ticker: 'COST', name: 'Costco Wholesale', alias: ['코스트코', 'costco'], exchange: 'NMS' },
  { ticker: 'HD', name: 'Home Depot Inc.', alias: ['홈디포', 'home depot'], exchange: 'NYQ' },
  { ticker: 'TGT', name: 'Target Corp.', alias: ['타겟', 'target'], exchange: 'NYQ' },
  { ticker: 'NKE', name: 'Nike Inc.', alias: ['나이키', 'nike'], exchange: 'NYQ' },
  { ticker: 'MCD', name: "McDonald's Corp.", alias: ['맥도날드', 'mcdonalds'], exchange: 'NYQ' },
  { ticker: 'SBUX', name: 'Starbucks Corp.', alias: ['스타벅스', 'starbucks'], exchange: 'NMS' },
  { ticker: 'KO', name: 'Coca-Cola Co.', alias: ['코카콜라', 'coca-cola', 'coke'], exchange: 'NYQ' },
  { ticker: 'PEP', name: 'PepsiCo Inc.', alias: ['펩시', '펩시코', 'pepsi', 'pepsico'], exchange: 'NMS' },
  { ticker: 'PG', name: 'Procter & Gamble', alias: ['P&G', 'procter gamble', '프록터앤갬블'], exchange: 'NYQ' },
  { ticker: 'LULU', name: 'Lululemon Athletica', alias: ['룰루레몬', 'lululemon'], exchange: 'NMS' },

  // 엔터테인먼트/미디어
  { ticker: 'DIS', name: 'Walt Disney Co.', alias: ['디즈니', 'disney'], exchange: 'NYQ' },
  { ticker: 'NFLX', name: 'Netflix Inc.', alias: ['넷플릭스', 'netflix'], exchange: 'NMS' },
  { ticker: 'SPOT', name: 'Spotify Technology', alias: ['스포티파이', 'spotify'], exchange: 'NYQ' },
  { ticker: 'RBLX', name: 'Roblox Corp.', alias: ['로블록스', 'roblox'], exchange: 'NYQ' },

  // 에너지
  { ticker: 'XOM', name: 'Exxon Mobil Corp.', alias: ['엑슨모빌', 'exxon', 'exxonmobil'], exchange: 'NYQ' },
  { ticker: 'CVX', name: 'Chevron Corp.', alias: ['셰브론', 'chevron'], exchange: 'NYQ' },
  { ticker: 'COP', name: 'ConocoPhillips', alias: ['코노코필립스', 'conoco phillips'], exchange: 'NYQ' },

  // 전기차/자동차
  { ticker: 'F', name: 'Ford Motor Co.', alias: ['포드', 'ford'], exchange: 'NYQ' },
  { ticker: 'GM', name: 'General Motors', alias: ['GM', '제너럴모터스', 'general motors'], exchange: 'NYQ' },
  { ticker: 'RIVN', name: 'Rivian Automotive', alias: ['리비안', 'rivian'], exchange: 'NMS' },
  { ticker: 'LCID', name: 'Lucid Group', alias: ['루시드', 'lucid'], exchange: 'NMS' },
  { ticker: 'NIO', name: 'NIO Inc.', alias: ['니오', 'nio', '중국전기차'], exchange: 'NYQ' },
  { ticker: 'XPEV', name: 'XPeng Inc.', alias: ['샤오펑', 'xpeng'], exchange: 'NYQ' },
  { ticker: 'LI', name: 'Li Auto Inc.', alias: ['리오토', 'li auto'], exchange: 'NMS' },

  // 소프트웨어/클라우드
  { ticker: 'CRM', name: 'Salesforce Inc.', alias: ['세일즈포스', 'salesforce'], exchange: 'NYQ' },
  { ticker: 'ORCL', name: 'Oracle Corp.', alias: ['오라클', 'oracle'], exchange: 'NYQ' },
  { ticker: 'ADBE', name: 'Adobe Inc.', alias: ['어도비', 'adobe'], exchange: 'NMS' },
  { ticker: 'NOW', name: 'ServiceNow Inc.', alias: ['서비스나우', 'servicenow'], exchange: 'NYQ' },
  { ticker: 'IBM', name: 'IBM Corp.', alias: ['IBM', '아이비엠'], exchange: 'NYQ' },
  { ticker: 'CSCO', name: 'Cisco Systems Inc.', alias: ['시스코', 'cisco'], exchange: 'NMS' },
  { ticker: 'INTU', name: 'Intuit Inc.', alias: ['인튜이트', 'intuit'], exchange: 'NMS' },
  { ticker: 'SHOP', name: 'Shopify Inc.', alias: ['쇼피파이', 'shopify'], exchange: 'NMS' },
  { ticker: 'PLTR', name: 'Palantir Technologies', alias: ['팔란티어', 'palantir'], exchange: 'NYQ' },
  { ticker: 'SNOW', name: 'Snowflake Inc.', alias: ['스노우플레이크', 'snowflake'], exchange: 'NYQ' },
  { ticker: 'NET', name: 'Cloudflare Inc.', alias: ['클라우드플레어', 'cloudflare'], exchange: 'NYQ' },
  { ticker: 'ZM', name: 'Zoom Video', alias: ['줌', 'zoom'], exchange: 'NMS' },

  // 통신/네트워크
  { ticker: 'VZ', name: 'Verizon Communications', alias: ['버라이즌', 'verizon'], exchange: 'NYQ' },
  { ticker: 'T', name: 'AT&T Inc.', alias: ['AT&T', '에이티앤티'], exchange: 'NYQ' },
  { ticker: 'TMUS', name: 'T-Mobile US Inc.', alias: ['티모바일', 't-mobile'], exchange: 'NMS' },

  // 항공/여행
  { ticker: 'BA', name: 'Boeing Co.', alias: ['보잉', 'boeing'], exchange: 'NYQ' },
  { ticker: 'UBER', name: 'Uber Technologies', alias: ['우버', 'uber'], exchange: 'NYQ' },
  { ticker: 'ABNB', name: 'Airbnb Inc.', alias: ['에어비앤비', 'airbnb'], exchange: 'NMS' },
  { ticker: 'DAL', name: 'Delta Air Lines', alias: ['델타항공', 'delta airlines'], exchange: 'NYQ' },

  // 암호화폐 관련
  { ticker: 'COIN', name: 'Coinbase Global', alias: ['코인베이스', 'coinbase'], exchange: 'NMS' },
  { ticker: 'MSTR', name: 'MicroStrategy Inc.', alias: ['마이크로스트래티지', 'microstrategy'], exchange: 'NMS' },

  // 주요 ETF (한국 투자자 선호)
  { ticker: 'SPY', name: 'SPDR S&P 500 ETF', alias: ['SPY', 'S&P500 ETF', '에스앤피 ETF'], exchange: 'PCX' },
  { ticker: 'VOO', name: 'Vanguard S&P 500 ETF', alias: ['VOO', '뱅가드 S&P500'], exchange: 'PCX' },
  { ticker: 'QQQ', name: 'Invesco QQQ Trust', alias: ['QQQ', '나스닥 ETF', '나스닥100'], exchange: 'NMS' },
  { ticker: 'VTI', name: 'Vanguard Total Stock Market ETF', alias: ['VTI', '뱅가드 전체시장'], exchange: 'PCX' },
  { ticker: 'DIA', name: 'SPDR Dow Jones Industrial Average ETF', alias: ['DIA', '다우 ETF'], exchange: 'PCX' },
  { ticker: 'IWM', name: 'iShares Russell 2000 ETF', alias: ['IWM', '러셀 2000', 'russell'], exchange: 'PCX' },
  { ticker: 'ARKK', name: 'ARK Innovation ETF', alias: ['ARKK', 'ARK 혁신 ETF', '캐시우드'], exchange: 'PCX' },
  { ticker: 'TQQQ', name: 'ProShares UltraPro QQQ (3x)', alias: ['TQQQ', '나스닥 3배', '3배 레버리지'], exchange: 'NMS' },
  { ticker: 'SQQQ', name: 'ProShares UltraPro Short QQQ (3x Inverse)', alias: ['SQQQ', '나스닥 3배 인버스', '나스닥 숏'], exchange: 'NMS' },
  { ticker: 'SCHD', name: 'Schwab U.S. Dividend Equity ETF', alias: ['SCHD', '슈왑 배당 ETF', '배당 ETF'], exchange: 'PCX' },
  { ticker: 'VYM', name: 'Vanguard High Dividend Yield ETF', alias: ['VYM', '뱅가드 고배당'], exchange: 'PCX' },
  { ticker: 'JEPI', name: 'JPMorgan Equity Premium Income ETF', alias: ['JEPI', 'JP모건 프리미엄 인컴'], exchange: 'PCX' },
  { ticker: 'GLD', name: 'SPDR Gold Shares', alias: ['GLD', '금 ETF', 'gold'], exchange: 'PCX' },
  { ticker: 'TLT', name: '20+ Year Treasury Bond ETF', alias: ['TLT', '장기채권 ETF', '미국채'], exchange: 'NMS' },
  { ticker: 'SOXL', name: 'Direxion Semiconductor Bull 3x', alias: ['SOXL', '반도체 3배', '반도체 레버리지'], exchange: 'PCX' },
  { ticker: 'SOXS', name: 'Direxion Semiconductor Bear 3x', alias: ['SOXS', '반도체 3배 인버스'], exchange: 'PCX' },
]

/**
 * 한글/영문 쿼리로 미국 종목 검색
 */
export function searchUSTicker(query: string, limit = 10): USTickerEntry[] {
  return searchTickerDict(US_TICKER_DICT, query, limit)
}
