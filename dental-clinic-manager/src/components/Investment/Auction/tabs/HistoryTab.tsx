'use client'
import { useEffect, useState } from 'react'
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

interface HistoryRow {
  round_no: number
  scheduled_date: string
  min_bid_price: number
  result: string | null
  sold_price: number | null
  bid_count: number | null
}

interface ComplexStats {
  sample_count: number
  avg_sold_to_appraisal_pct: number | null
  avg_bid_count: number | null
}

interface Props {
  itemId: string
  history: HistoryRow[]
}

const fmt = (n: number | null) => n === null ? '-' : new Intl.NumberFormat('ko-KR').format(n)

const RESULT_LABEL: Record<string, string> = {
  failed: '유찰', sold: '낙찰', cancelled: '취소', postponed: '변경', pending: '예정'
}

export function HistoryTab({ itemId, history }: Props) {
  const [stats, setStats] = useState<ComplexStats | null>(null)
  const [statsErr, setStatsErr] = useState<string | null>(null)
  useEffect(() => {
    setStats(null)
    setStatsErr(null)
    fetch(`/api/auction/items/${itemId}/complex-stats`)
      .then(async r => {
        const j = await r.json().catch(() => ({}))
        if (!r.ok || typeof j?.sample_count !== 'number') {
          setStatsErr(j?.error ?? `통계를 불러오지 못했습니다 (HTTP ${r.status})`)
          return
        }
        setStats(j)
      })
      .catch(e => setStatsErr(`통계를 불러오지 못했습니다: ${e?.message ?? e}`))
  }, [itemId])

  const chartData = history.map(h => ({
    회차: `${h.round_no}차`,
    최저가: Math.round(h.min_bid_price / 10_000),
  }))

  return (
    <div className="space-y-4">
      <section className="bg-at-surface rounded-2xl p-4 md:p-5 border border-at-border shadow-at-card">
        <h3 className="text-base font-semibold mb-3 text-at-text">회차별 변동</h3>
        {history.length === 0 ? (
          <p className="text-[14px] md:text-sm text-at-text-secondary leading-relaxed">
            이 물건의 회차별 가격 변동·낙찰 이력이 아직 수집되지 않았습니다.
            <br />
            <span className="text-[13px] md:text-xs text-at-text-weak">법원경매정보의 사건 상세에서 직접 확인하실 수 있습니다 (첨부 탭의 &quot;법원경매정보 원문&quot; 링크).</span>
          </p>
        ) : (
          <>
            <div className="h-48 mb-4">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                  <XAxis dataKey="회차" fontSize={12} />
                  <YAxis fontSize={12} tickFormatter={(v) => `${(v/10_000).toFixed(0)}억`} />
                  <Tooltip formatter={(v) => `${fmt(Number(v) * 10_000)}원`} />
                  <Line type="monotone" dataKey="최저가" stroke="#3b82f6" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* 모바일: 카드 리스트 */}
            <ul className="md:hidden space-y-2">
              {history.map(h => (
                <li key={h.round_no} className="rounded-xl border border-at-border bg-at-surface-alt p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[15px] font-bold text-at-text">{h.round_no}차</span>
                    <span className="text-[13px] text-at-text-secondary">{h.scheduled_date}</span>
                  </div>
                  <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-[14px]">
                    <dt className="text-at-text-secondary">최저가</dt>
                    <dd className="text-right font-semibold text-at-text tabular-nums">{fmt(h.min_bid_price)}원</dd>
                    <dt className="text-at-text-secondary">결과</dt>
                    <dd className="text-right font-semibold text-at-text">{h.result ? RESULT_LABEL[h.result] ?? h.result : '-'}</dd>
                    <dt className="text-at-text-secondary">낙찰가</dt>
                    <dd className="text-right font-semibold text-at-text tabular-nums">{fmt(h.sold_price)}원</dd>
                    <dt className="text-at-text-secondary">응찰자</dt>
                    <dd className="text-right font-semibold text-at-text tabular-nums">{h.bid_count ?? '-'}명</dd>
                  </dl>
                </li>
              ))}
            </ul>

            {/* 데스크톱: 테이블 */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-at-text-secondary text-left">
                  <tr>
                    <th className="py-1">회차</th>
                    <th>예정일</th>
                    <th className="text-right">최저가</th>
                    <th>결과</th>
                    <th className="text-right">낙찰가</th>
                    <th className="text-right">응찰자</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map(h => (
                    <tr key={h.round_no} className="border-t border-at-border">
                      <td className="py-2 font-semibold">{h.round_no}차</td>
                      <td>{h.scheduled_date}</td>
                      <td className="text-right tabular-nums font-medium">{fmt(h.min_bid_price)}원</td>
                      <td>{h.result ? RESULT_LABEL[h.result] ?? h.result : '-'}</td>
                      <td className="text-right tabular-nums font-medium">{fmt(h.sold_price)}원</td>
                      <td className="text-right tabular-nums">{h.bid_count ?? '-'}명</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>

      <section className="bg-at-surface rounded-2xl p-4 md:p-5 border border-at-border shadow-at-card">
        <h3 className="text-base font-semibold mb-3 text-at-text">동일 동·용도 낙찰 통계 (최근 6개월)</h3>
        {statsErr ? (
          <p className="text-[14px] md:text-sm text-rose-600">{statsErr}</p>
        ) : !stats ? (
          <p className="text-[14px] md:text-sm text-at-text-secondary">로딩 중...</p>
        ) : stats.sample_count === 0 ? (
          <p className="text-[14px] md:text-sm text-at-text-secondary leading-relaxed">
            동일 동·용도의 최근 6개월 낙찰 표본이 없습니다.
            <br />
            <span className="text-[13px] md:text-xs text-at-text-weak">표본은 낙찰 이력이 수집된 매물에서 자동 집계됩니다.</span>
          </p>
        ) : (
          <dl className="grid grid-cols-3 gap-2 sm:gap-4 text-[14px] md:text-sm">
            <div>
              <dt className="text-[13px] md:text-sm text-at-text-secondary">표본</dt>
              <dd className="text-lg font-bold text-at-text tabular-nums">{stats.sample_count}건</dd>
            </div>
            <div>
              <dt className="text-[13px] md:text-sm text-at-text-secondary">평균 낙찰가율</dt>
              <dd className="text-lg font-bold text-at-text tabular-nums">{stats.avg_sold_to_appraisal_pct?.toFixed(1) ?? '-'}%</dd>
            </div>
            <div>
              <dt className="text-[13px] md:text-sm text-at-text-secondary">평균 응찰자</dt>
              <dd className="text-lg font-bold text-at-text tabular-nums">{stats.avg_bid_count?.toFixed(1) ?? '-'}명</dd>
            </div>
          </dl>
        )}
      </section>
    </div>
  )
}
