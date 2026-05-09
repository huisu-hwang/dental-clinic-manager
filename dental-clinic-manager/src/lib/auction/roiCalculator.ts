import type {
  AuctionItem, MarketPrice, RoiPrimary, RoiSecondary, RoiTertiary,
  ExtraCosts, SimulatorInput, PropertyType
} from '@/types/auction'

export function calculatePrimary(item: AuctionItem, todayISO: string): RoiPrimary {
  const discount = (item.appraisal_price - item.min_bid_price) / item.appraisal_price * 100
  const round_no = item.failure_count + 1
  const d_day = item.next_auction_date
    ? Math.round((new Date(item.next_auction_date).getTime() - new Date(todayISO).getTime()) / 86_400_000)
    : null
  const bid_deposit = item.bid_deposit ?? Math.round(item.min_bid_price * 0.1)
  const price_per_m2 = item.building_area_m2 && item.building_area_m2 > 0
    ? Math.round(item.min_bid_price / item.building_area_m2)
    : null
  return {
    discount_rate_pct: Math.round(discount * 100) / 100,
    failure_count: item.failure_count,
    round_no,
    d_day,
    bid_deposit,
    price_per_m2,
  }
}

interface ExtraCostInput {
  propertyType: PropertyType
  isMultiOwner: boolean
  bidPrice: number
  vacancyCost?: number
  repairCost?: number
  unpaidDues?: number
}

const ACQUISITION_TAX_RATES: Record<PropertyType, { single: number; multi: number }> = {
  apt:        { single: 0.046, multi: 0.12 },
  officetel:  { single: 0.046, multi: 0.046 },
  villa:      { single: 0.046, multi: 0.12 },
  house:      { single: 0.046, multi: 0.12 },
  commercial: { single: 0.046, multi: 0.046 },
  land:       { single: 0.046, multi: 0.046 },
  factory:    { single: 0.046, multi: 0.046 },
  forest:     { single: 0.046, multi: 0.046 },
  other:      { single: 0.046, multi: 0.046 },
}

export function calculateExtraCosts(input: ExtraCostInput): ExtraCosts {
  const rate = ACQUISITION_TAX_RATES[input.propertyType]
  const taxRate = input.isMultiOwner ? rate.multi : rate.single
  return {
    acquisition_tax: Math.round(input.bidPrice * taxRate),
    registration_fee: Math.round(input.bidPrice * 0.007),
    vacancy_cost: input.vacancyCost ?? 0,
    repair_cost: input.repairCost ?? 0,
    unpaid_dues: input.unpaidDues ?? 0,
  }
}

export function calculateSecondary(
  item: AuctionItem,
  market: MarketPrice,
  opts: { isMultiOwner: boolean; vacancyCost?: number; repairCost?: number; unpaidDues?: number }
): RoiSecondary | null {
  const expected = market.median_price_3m ?? market.median_price_12m
  if (!expected) return null
  const extras = calculateExtraCosts({
    propertyType: item.property_type,
    isMultiOwner: opts.isMultiOwner,
    bidPrice: item.min_bid_price,
    vacancyCost: opts.vacancyCost,
    repairCost: opts.repairCost,
    unpaidDues: opts.unpaidDues,
  })
  const totalCost = item.min_bid_price + extras.acquisition_tax + extras.registration_fee + extras.vacancy_cost + extras.repair_cost + extras.unpaid_dues
  const profit = expected - totalCost
  const marketDiscount = (expected - item.min_bid_price) / expected * 100
  const simpleRoi = profit / totalCost * 100
  return {
    expected_market_price: expected,
    expected_resale_profit: profit,
    market_discount_rate_pct: Math.round(marketDiscount * 100) / 100,
    simple_roi_pct: Math.round(simpleRoi * 100) / 100,
    match_confidence: market.match_confidence,
    extra_costs: extras,
  }
}

export function calculateTertiary(item: AuctionItem, input: SimulatorInput): RoiTertiary {
  const extras = calculateExtraCosts({
    propertyType: item.property_type,
    isMultiOwner: input.is_multi_owner,
    bidPrice: input.bid_price,
    repairCost: input.repair_cost,
    unpaidDues: input.unpaid_dues,
  })
  const totalInvestment = input.bid_price + extras.acquisition_tax + extras.registration_fee + extras.repair_cost + extras.unpaid_dues
  const annualNetRent = (input.monthly_rent - input.monthly_management_cost) * 12 - input.annual_property_tax
  const rentalYield = totalInvestment > 0 ? annualNetRent / totalInvestment * 100 : 0
  const paybackYears = annualNetRent > 0 ? totalInvestment / annualNetRent : null
  return {
    total_investment: totalInvestment,
    annual_net_rent: annualNetRent,
    rental_yield_pct: Math.round(rentalYield * 100) / 100,
    payback_years: paybackYears !== null ? Math.round(paybackYears * 100) / 100 : null,
  }
}
