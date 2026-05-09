export type PropertyType =
  | 'apt' | 'officetel' | 'villa' | 'house'
  | 'commercial' | 'land' | 'factory' | 'forest' | 'other'

export type AuctionStatus = 'active' | 'pending_decision' | 'sold' | 'cancelled' | 'postponed'

export type MatchConfidence = 'high' | 'mid' | 'low'

export interface AuctionItem {
  id: string
  case_number: string
  item_number: number
  court_name: string
  court_code: string
  property_type: PropertyType
  address_road: string | null
  address_jibun: string | null
  sido: string | null
  sigungu: string | null
  eupmyeondong: string | null
  pnu: string | null
  land_area_m2: number | null
  building_area_m2: number | null
  floor: number | null
  total_floors: number | null
  building_year: number | null
  appraisal_price: number
  min_bid_price: number
  bid_deposit: number | null
  failure_count: number
  discount_rate: number | null
  next_auction_date: string | null
  status: AuctionStatus
  sold_price: number | null
  sold_at: string | null
  source_url: string | null
  notice_pdf_url: string | null
  appraisal_pdf_url: string | null
  photos: string[]
  first_seen_at: string
  last_synced_at: string
}

export interface MarketPrice {
  source: string
  matched_complex: string | null
  median_price_3m: number | null
  trade_count_3m: number | null
  median_price_12m: number | null
  last_trade_date: string | null
  match_confidence: MatchConfidence
}

/** 1차 — 객관 지표 */
export interface RoiPrimary {
  discount_rate_pct: number          // (감정가-최저가)/감정가 × 100
  failure_count: number
  round_no: number                   // failure_count + 1
  d_day: number | null               // null = 매각기일 미정
  bid_deposit: number                // min_bid_price × 0.1
  price_per_m2: number | null        // 면적 0/null이면 null
}

/** 2차 — 시세 매칭 ROI (있는 경우) */
export interface RoiSecondary {
  expected_market_price: number
  expected_resale_profit: number
  market_discount_rate_pct: number
  simple_roi_pct: number
  match_confidence: MatchConfidence
  extra_costs: ExtraCosts
}

/** 3차 — 임대 시뮬 (사용자 입력) */
export interface RoiTertiary {
  total_investment: number
  annual_net_rent: number
  rental_yield_pct: number
  payback_years: number | null       // 0이면 null
}

export interface ExtraCosts {
  acquisition_tax: number
  registration_fee: number
  vacancy_cost: number
  repair_cost: number
  unpaid_dues: number
}

export interface SimulatorInput {
  bid_price: number
  monthly_rent: number
  monthly_management_cost: number
  annual_property_tax: number
  repair_cost: number
  unpaid_dues: number
  is_multi_owner: boolean
}
