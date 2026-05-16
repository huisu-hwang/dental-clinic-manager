'use client'
import { ExternalLink, MapPin } from 'lucide-react'
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

// 면적·층·준공년도 등은 매물 목록 API에서 받지 못해 다수 매물이 null인 상태.
// 표에 "-"만 쌓이는 것보다, 가용한 값만 보여주고 부재 안내는 별도 줄에서 처리한다.

export function OverviewTab({ item, market }: Props) {
  const fields: Array<{ label: string; value: string | null }> = [
    { label: '용도', value: PROPERTY_LABEL[item.property_type] ?? '기타' },
    { label: '주소(지번)', value: item.address_jibun },
    { label: '주소(도로명)', value: item.address_road },
    { label: '대지면적', value: item.land_area_m2 ? `${formatNumber(item.land_area_m2)}㎡ (${pyeong(item.land_area_m2)}평)` : null },
    { label: '건물면적', value: item.building_area_m2 ? `${formatNumber(item.building_area_m2)}㎡ (${pyeong(item.building_area_m2)}평)` : null },
    { label: '층', value: item.floor !== null && item.total_floors !== null ? `${item.floor} / ${item.total_floors}층` : null },
    { label: '준공년도', value: item.building_year ? `${item.building_year}년` : null },
  ]
  const shown = fields.filter(f => f.value !== null && f.value !== '')
  const missingCount = fields.length - shown.length

  const mapQuery = item.address_jibun ?? `${item.sido ?? ''} ${item.sigungu ?? ''} ${item.eupmyeondong ?? ''}`.trim()
  const kakaoMapUrl = mapQuery ? `https://map.kakao.com/?q=${encodeURIComponent(mapQuery)}` : null
  const naverMapUrl = mapQuery ? `https://map.naver.com/p/search/${encodeURIComponent(mapQuery)}` : null

  const marketMax = market ? Math.max(item.appraisal_price, market.median_price_3m ?? market.median_price_12m ?? 0) : item.appraisal_price
  const marketDisplay = market?.median_price_3m ?? market?.median_price_12m ?? null
  const marketLabel = market?.median_price_3m !== null && market?.median_price_3m !== undefined
    ? '시세 (3개월 중위)'
    : market?.median_price_12m !== null && market?.median_price_12m !== undefined
      ? '시세 (12개월 중위)'
      : null
  const ratio = marketDisplay ? Math.round(item.min_bid_price / marketDisplay * 100) : null

  return (
    <div className="space-y-4 md:space-y-5">
      <section className="bg-at-surface rounded-2xl p-4 md:p-5 border border-at-border shadow-at-card">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-at-text">물건 정보</h3>
          {(kakaoMapUrl || naverMapUrl) && (
            <div className="flex gap-2">
              {kakaoMapUrl && (
                <a
                  href={kakaoMapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-at-surface-alt hover:bg-at-surface-hover border border-at-border text-[12px] md:text-xs font-semibold text-at-text"
                >
                  <MapPin className="w-3.5 h-3.5" />
                  카카오맵
                </a>
              )}
              {naverMapUrl && (
                <a
                  href={naverMapUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-at-surface-alt hover:bg-at-surface-hover border border-at-border text-[12px] md:text-xs font-semibold text-at-text"
                >
                  <MapPin className="w-3.5 h-3.5" />
                  네이버맵
                </a>
              )}
            </div>
          )}
        </div>
        <dl className="grid grid-cols-[auto_1fr] sm:grid-cols-[120px_1fr] gap-x-3 gap-y-2.5 text-[14px] md:text-sm">
          {shown.map(f => (
            <div key={f.label} className="contents">
              <Dt>{f.label}</Dt>
              <Dd>{f.value}</Dd>
            </div>
          ))}
        </dl>
        {missingCount > 0 && (
          <p className="text-[12px] md:text-xs text-at-text-weak mt-3 pt-3 border-t border-at-border leading-relaxed">
            ※ {missingCount}개 항목(도로명 주소·면적·층·준공년도 등)은 법원경매정보 검색 API에서 제공하지 않습니다.
            첨부 탭의 &quot;법원경매정보 원문&quot; 링크 또는 위 지도 링크에서 확인하실 수 있습니다.
          </p>
        )}
      </section>

      <section className="bg-at-surface rounded-2xl p-4 md:p-5 border border-at-border shadow-at-card">
        <h3 className="text-base font-bold mb-3 text-at-text">사건 정보</h3>
        <dl className="grid grid-cols-[auto_1fr] sm:grid-cols-[120px_1fr] gap-x-3 gap-y-2.5 text-[14px] md:text-sm">
          <Dt>사건번호</Dt>
          <Dd>
            {item.source_url ? (
              <a
                href={item.source_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-at-accent hover:underline"
              >
                {item.case_number}
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            ) : item.case_number}
          </Dd>
          <Dt>관할법원</Dt><Dd>{item.court_name}</Dd>
          <Dt>물건번호</Dt><Dd>{item.item_number}</Dd>
          <Dt>유찰 횟수</Dt><Dd>{item.failure_count}회</Dd>
          <Dt>매각기일</Dt><Dd>{item.next_auction_date ?? '미정'}</Dd>
        </dl>
      </section>

      <section className="bg-at-surface rounded-2xl p-4 md:p-5 border border-at-border shadow-at-card">
        <h3 className="text-base font-bold mb-3 text-at-text">시세 비교</h3>
        {market && marketDisplay ? (
          <div className="space-y-3">
            <Bar label="감정가" value={item.appraisal_price} max={marketMax} />
            <Bar label={marketLabel ?? '시세'} value={marketDisplay} max={marketMax} accent="blue" />
            <Bar label="최저입찰가" value={item.min_bid_price} max={marketMax} accent="emerald" />
            {ratio !== null && (
              <p className="text-[14px] md:text-sm text-at-text mt-3 leading-relaxed">
                최저입찰가는 시세의 <strong>{ratio}%</strong> 수준입니다.{' '}
                매칭 신뢰도 <strong>{market.match_confidence}</strong>
                {market.matched_complex && ` · ${market.matched_complex}`}
                {typeof market.trade_count_3m === 'number' && ` · 최근 3개월 거래 ${market.trade_count_3m}건`}
              </p>
            )}
          </div>
        ) : market ? (
          <p className="text-[14px] md:text-sm text-at-text-secondary leading-relaxed">
            동일 단지의 최근 거래가 없어 시세 매칭에 실패했습니다.
            시뮬레이터 탭의 &quot;예상 시세 직접 입력&quot;으로 추정 시세를 넣어 수익률을 계산할 수 있습니다.
          </p>
        ) : (
          <p className="text-[14px] md:text-sm text-at-text-secondary leading-relaxed">
            국토부 실거래가 자동 매칭은 면적·단지명이 확보된 아파트·오피스텔·빌라에서만 동작합니다.
            토지·상가·공장 등은 시뮬레이터 탭에서 직접 시세를 입력해 수익률을 계산해 보세요.
          </p>
        )}
      </section>

      <p className="text-[13px] md:text-xs text-at-text-secondary px-1 leading-relaxed">
        ※ 본 정보는 투자 판단의 보조 자료이며, 최종 판단의 책임은 사용자에게 있습니다.
      </p>
    </div>
  )
}

function formatNumber(n: number): string {
  return new Intl.NumberFormat('ko-KR', { maximumFractionDigits: 2 }).format(n)
}

function pyeong(m2: number): string {
  return (m2 * 0.3025).toFixed(1)
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
