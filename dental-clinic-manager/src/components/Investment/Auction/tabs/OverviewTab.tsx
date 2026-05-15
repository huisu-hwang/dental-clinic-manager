'use client'
import type { AuctionItem, MarketPrice } from '@/types/auction'

interface Props {
  item: AuctionItem
  market: MarketPrice | null
}

const fmt = (n: number | null) => n === null ? '-' : new Intl.NumberFormat('ko-KR').format(n)

const PROPERTY_LABEL: Record<string, string> = {
  apt: '아파트', officetel: '오피스텔', villa: '빌라', house: '단독주택',
  commercial: '상가', land: '토지', factory: '공장', forest: '임야', other: '기타'
}

export function OverviewTab({ item, market }: Props) {
  const ratio = market?.median_price_3m
    ? Math.round(item.min_bid_price / market.median_price_3m * 100)
    : null

  return (
    <div className="space-y-4 md:space-y-5">
      <section className="bg-at-surface rounded-2xl p-4 md:p-5 border border-at-border shadow-at-card">
        <h3 className="text-base font-bold mb-3 text-at-text">물건 정보</h3>
        <dl className="grid grid-cols-2 gap-x-3 gap-y-2.5 text-[14px] md:text-sm">
          <Dt>용도</Dt><Dd>{PROPERTY_LABEL[item.property_type] ?? '기타'}</Dd>
          <Dt>주소(도로명)</Dt><Dd>{item.address_road ?? '-'}</Dd>
          <Dt>주소(지번)</Dt><Dd>{item.address_jibun ?? '-'}</Dd>
          <Dt>대지면적</Dt><Dd>{item.land_area_m2 ? `${item.land_area_m2}㎡` : '-'}</Dd>
          <Dt>건물면적</Dt><Dd>{item.building_area_m2 ? `${item.building_area_m2}㎡` : '-'}</Dd>
          <Dt>층</Dt><Dd>{item.floor ?? '-'} / {item.total_floors ?? '-'}층</Dd>
          <Dt>준공년도</Dt><Dd>{item.building_year ?? '-'}</Dd>
        </dl>
      </section>

      <section className="bg-at-surface rounded-2xl p-4 md:p-5 border border-at-border shadow-at-card">
        <h3 className="text-base font-bold mb-3 text-at-text">시세 비교</h3>
        {market ? (
          <div className="space-y-3">
            <Bar label="감정가" value={item.appraisal_price} max={Math.max(item.appraisal_price, market.median_price_3m ?? 0)} />
            <Bar label="시세 (3개월 중위)" value={market.median_price_3m ?? 0} max={Math.max(item.appraisal_price, market.median_price_3m ?? 0)} accent="blue" />
            <Bar label="최저입찰가" value={item.min_bid_price} max={Math.max(item.appraisal_price, market.median_price_3m ?? 0)} accent="emerald" />
            {ratio !== null && (
              <p className="text-[14px] md:text-sm text-at-text mt-3 leading-relaxed">
                최저입찰가는 시세의 <strong>{ratio}%</strong> 수준입니다.
                매칭 신뢰도: <strong>{market.match_confidence}</strong> ({market.matched_complex ?? '-'}, 거래 {market.trade_count_3m ?? 0}건)
              </p>
            )}
          </div>
        ) : (
          <p className="text-[14px] md:text-sm text-at-text-secondary leading-relaxed">
            이 물건은 자동 시세 매칭이 불가능합니다 (토지/공장 등). 시뮬레이터 탭에서 직접 시세를 입력해 수익률을 계산해 보세요.
          </p>
        )}
      </section>

      {item.photos.length > 0 && (
        <section className="bg-at-surface rounded-2xl p-4 md:p-5 border border-at-border shadow-at-card">
          <h3 className="text-base font-bold mb-3 text-at-text">사진</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {item.photos.map((url, i) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={i} src={url} alt={`사진 ${i+1}`} className="rounded-xl w-full h-40 object-cover border border-at-border" />
            ))}
          </div>
        </section>
      )}

      <p className="text-[13px] md:text-xs text-at-text-secondary px-1 leading-relaxed">
        ※ 본 정보는 투자 판단의 보조 자료이며, 최종 판단의 책임은 사용자에게 있습니다.
      </p>
    </div>
  )
}

const Dt = (p: { children: React.ReactNode }) => <dt className="text-at-text-weak font-medium">{p.children}</dt>
const Dd = (p: { children: React.ReactNode }) => <dd className="font-semibold text-at-text break-words">{p.children}</dd>

function Bar({ label, value, max, accent }: { label: string; value: number; max: number; accent?: 'blue'|'emerald' }) {
  const pct = max > 0 ? Math.round(value / max * 100) : 0
  const color = accent === 'emerald' ? 'bg-[var(--at-success)]'
              : accent === 'blue'    ? 'bg-at-accent'
              :                        'bg-at-text-weak'
  return (
    <div>
      <div className="flex justify-between text-[13px] md:text-xs mb-1.5">
        <span className="text-at-text font-medium">{label}</span>
        <span className="text-at-text font-bold tabular-nums">{fmt(value)}원</span>
      </div>
      <div className="h-2.5 rounded-full bg-at-surface-alt overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}
