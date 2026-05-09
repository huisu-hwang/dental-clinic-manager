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
const SORT_OPTS = [
  { value: 'discount_desc', label: '할인율 ↓' },
  { value: 'd_day_asc',     label: 'D-day ↑' },
  { value: 'price_asc',     label: '최저가 ↑' },
  { value: 'failure_desc',  label: '유찰 ↓' },
]

const SELECT_CLS = "px-3 py-1.5 text-sm bg-at-surface border border-at-border rounded-lg"

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

  return (
    <div className="flex flex-wrap gap-2 items-center mb-4">
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

      <div className="flex-1" />

      <label className="text-sm text-at-text-secondary">정렬</label>
      <select className={SELECT_CLS} value={sp.get('sort') ?? 'discount_desc'} onChange={e => update('sort', e.target.value)}>
        {SORT_OPTS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
      </select>
    </div>
  )
}
