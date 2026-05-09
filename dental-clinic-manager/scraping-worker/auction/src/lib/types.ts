export type PropertyType =
  | 'apt' | 'officetel' | 'villa' | 'house'
  | 'commercial' | 'land' | 'factory' | 'forest' | 'other'

export interface ScrapedListItem {
  caseNumber: string
  itemNumber: number
  courtName: string
  courtCode: string
  propertyType: PropertyType
  sido: string | null
  sigungu: string | null
  eupmyeondong: string | null
  appraisalPrice: number
  minBidPrice: number
  failureCount: number
  nextAuctionDate: string | null
  sourceUrl: string
}

export interface ScrapedDetail extends ScrapedListItem {
  addressRoad: string | null
  addressJibun: string | null
  pnu: string | null
  landAreaM2: number | null
  buildingAreaM2: number | null
  floor: number | null
  totalFloors: number | null
  buildingYear: number | null
  bidDeposit: number | null
  noticePdfUrl: string | null
  appraisalPdfUrl: string | null
  photos: string[]
  status: 'active' | 'pending_decision' | 'sold' | 'cancelled' | 'postponed'
  soldPrice: number | null
  soldAt: string | null
}
