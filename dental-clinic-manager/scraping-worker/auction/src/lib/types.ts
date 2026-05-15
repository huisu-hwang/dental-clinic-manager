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
  // 신규 API(searchControllerMain.on)에서 동시에 받을 수 있는 추가 정보 — optional
  addressJibun?: string | null     // "${sido} ${sigu} ${dong} ${lotno} ${buldNm}"
  buildingAreaM2?: number | null   // areaList "2193㎡" 파싱
  landAreaM2?: number | null       // 지목이 토지/임야면 areaList = 대지면적
  xCordi?: string | null
  yCordi?: string | null
  dspslUsgNm?: string | null       // 한글 용도명 (원본 보존)
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
