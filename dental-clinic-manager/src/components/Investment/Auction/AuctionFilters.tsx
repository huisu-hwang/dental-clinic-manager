'use client'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'

const PROPERTY_OPTS: Array<{ value: string; label: string }> = [
  { value: '', label: '전체 용도' },
  { value: 'apt', label: '아파트' },
  { value: 'officetel', label: '오피스텔' },
  { value: 'villa', label: '빌라' },
  { value: 'house', label: '단독주택' },
  { value: 'commercial', label: '상가' },
  { value: 'land', label: '토지' },
  { value: 'factory', label: '공장' },
  { value: 'forest', label: '임야' },
]

const SIDO_OPTS = ['', '서울특별시', '경기도', '인천광역시', '부산광역시', '대구광역시', '광주광역시', '대전광역시', '울산광역시', '세종특별자치시', '강원특별자치도', '충청북도', '충청남도', '전북특별자치도', '전라남도', '경상북도', '경상남도', '제주특별자치도']

const DISCOUNT_OPTS = [0, 10, 20, 30, 40, 50]
const FAILURE_OPTS = [0, 1, 2, 3]
const DDAY_OPTS = [0, 7, 14, 30]
// 감정가 단위: 원. 5천만~50억 범위에서 자주 쓰이는 임계값.
const APPRAISAL_OPTS: Array<{ value: number; label: string }> = [
  { value: 50_000_000,    label: '5천만' },
  { value: 100_000_000,   label: '1억' },
  { value: 200_000_000,   label: '2억' },
  { value: 300_000_000,   label: '3억' },
  { value: 500_000_000,   label: '5억' },
  { value: 700_000_000,   label: '7억' },
  { value: 1_000_000_000, label: '10억' },
  { value: 2_000_000_000, label: '20억' },
  { value: 3_000_000_000, label: '30억' },
  { value: 5_000_000_000, label: '50억' },
]
const SORT_OPTS = [
  { value: 'discount_desc', label: '할인율 ↓' },
  { value: 'd_day_asc',     label: 'D-day ↑' },
  { value: 'price_asc',     label: '최저가 ↑' },
  { value: 'failure_desc',  label: '유찰 ↓' },
]

const SELECT_CLS = "h-9 px-3 text-[13px] font-medium text-at-text bg-at-surface border border-at-border rounded-lg hover:border-at-accent/50 focus:outline-none focus:border-at-accent focus:ring-2 focus:ring-at-accent/15 transition-colors cursor-pointer"

export function AuctionFilters() {
  const router = useRouter()
  const pathname = usePathname()
  const sp = useSearchParams()

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(sp.toString())
    if (value) next.set(key, value); else next.delete(key)
    next.delete('cursor')
    router.replace(`${pathname}?${next.toString()}`)
  }

  const hasFilters = ['sido', 'propertyType', 'minDiscountPct', 'minFailureCount', 'maxDDay', 'minAppraisalPrice', 'maxAppraisalPrice']
    .some(k => sp.get(k))

  const reset = () => {
    const next = new URLSearchParams()
    // 정렬은 보존
    const sort = sp.get('sort')
    if (sort) next.set('sort', sort)
    // 외부 컨텍스트 파라미터 보존
    const tab = sp.get('tab'); if (tab) next.set('tab', tab)
    const sub = sp.get('sub'); if (sub) next.set('sub', sub)
    router.replace(`${pathname}?${next.toString()}`)
  }

  return (
    <div className="bg-at-surface border border-at-border rounded-2xl shadow-at-card p-3 sm:p-4 mb-4">
      <div className="flex flex-wrap gap-2 items-center">
        <select className={SELECT_CLS} value={sp.get('sido') ?? ''} onChange={e => update('sido', e.target.value)}>
          {SIDO_OPTS.map(s => <option key={s} value={s}>{s || '전체 지역'}</option>)}
        </select>
        <select className={SELECT_CLS} value={sp.get('propertyType') ?? ''} onChange={e => update('propertyType', e.target.value)}>
          {PROPERTY_OPTS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <select className={SELECT_CLS} value={sp.get('minDiscountPct') ?? ''} onChange={e => update('minDiscountPct', e.target.value)}>
          <option value="">할인율 무관</option>
          {DISCOUNT_OPTS.map(d => <option key={d} value={d}>{d}% 이상</option>)}
        </select>
        <select className={SELECT_CLS} value={sp.get('minFailureCount') ?? ''} onChange={e => update('minFailureCount', e.target.value)}>
          <option value="">유찰 무관</option>
          {FAILURE_OPTS.map(d => <option key={d} value={d}>{d}회 이상</option>)}
        </select>
        <select className={SELECT_CLS} value={sp.get('maxDDay') ?? ''} onChange={e => update('maxDDay', e.target.value)}>
          <option value="">기일 무관</option>
          {DDAY_OPTS.map(d => <option key={d} value={d}>{d === 0 ? '오늘' : `D-${d} 이내`}</option>)}
        </select>
        <select className={SELECT_CLS} value={sp.get('minAppraisalPrice') ?? ''} onChange={e => update('minAppraisalPrice', e.target.value)}>
          <option value="">감정가 하한 무관</option>
          {APPRAISAL_OPTS.map(o => <option key={o.value} value={o.value}>{o.label} 이상</option>)}
        </select>
        <select className={SELECT_CLS} value={sp.get('maxAppraisalPrice') ?? ''} onChange={e => update('maxAppraisalPrice', e.target.value)}>
          <option value="">감정가 상한 무관</option>
          {APPRAISAL_OPTS.map(o => <option key={o.value} value={o.value}>{o.label} 이하</option>)}
        </select>

        {hasFilters && (
          <button
            type="button"
            onClick={reset}
            className="h-9 px-3 text-[13px] font-semibold text-at-text-secondary hover:text-at-text border border-at-border rounded-lg hover:bg-at-surface-alt transition-colors"
          >
            필터 초기화
          </button>
        )}

        <div className="flex-1" />

        <div className="flex items-center gap-2 ml-auto">
          <span className="text-[12px] font-semibold text-at-text-weak">정렬</span>
          <select className={SELECT_CLS} value={sp.get('sort') ?? 'discount_desc'} onChange={e => update('sort', e.target.value)}>
            {SORT_OPTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
      </div>
    </div>
  )
}
