'use client'
import { useState } from 'react'
import { Sparkles, Loader2 } from 'lucide-react'

interface Rights {
  base_right_type: string | null
  base_right_date: string | null
  has_senior_tenant: boolean | null
  tenant_count: number | null
  total_deposit: number | null
  unsettled_taxes: number | null
  risk_flags: Record<string, boolean>
  parse_status: string | null
}

interface AiComment {
  summary: string
  risk_score: number | null
  bullet_points: string[] | null
  generated_at: string
  cached?: boolean
}

interface Props {
  itemId: string
  rights: Rights | null
  initialAi: AiComment | null
}

const fmt = (n: number | null) => n === null ? '-' : new Intl.NumberFormat('ko-KR').format(n)

export function RightsTab({ itemId, rights, initialAi }: Props) {
  const [ai, setAi] = useState<AiComment | null>(initialAi)
  const [loading, setLoading] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const callAi = async () => {
    setLoading(true)
    setErr(null)
    try {
      const r = await fetch(`/api/auction/ai-comment/${itemId}`, { method: 'POST' })
      const j = await r.json()
      if (!r.ok) {
        setErr(`오류: ${j.error}${j.detail ? ` (${j.detail})` : ''}`)
      } else {
        setAi(j)
      }
    } catch (e: any) {
      setErr(`네트워크 오류: ${e?.message ?? e}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <section className="bg-at-surface rounded-2xl p-4 md:p-5 border border-at-border shadow-at-card">
        <h3 className="text-base font-semibold mb-3 text-at-text">자동 추출 권리분석</h3>
        {rights ? (
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-[14px] md:text-sm">
            <Dt>말소기준권리</Dt>
            <Dd>{rights.base_right_type ?? '미확인'} {rights.base_right_date && `(${rights.base_right_date})`}</Dd>
            <Dt>대항력 임차인</Dt>
            <Dd className={rights.has_senior_tenant ? 'text-rose-600 font-bold' : ''}>
              {rights.has_senior_tenant === null ? '미확인' : rights.has_senior_tenant ? '있음 (인수 위험)' : '없음'}
            </Dd>
            <Dt>임차인 수</Dt>
            <Dd>{rights.tenant_count ?? '-'}명</Dd>
            <Dt>임차보증금 합계</Dt>
            <Dd>{fmt(rights.total_deposit)}원</Dd>
            <Dt>체납 추정</Dt>
            <Dd>{fmt(rights.unsettled_taxes)}원</Dd>
            <Dt>파싱 상태</Dt>
            <Dd>{rights.parse_status ?? '-'}</Dd>
          </dl>
        ) : (
          <p className="text-[14px] md:text-sm text-at-text-secondary">권리분석 데이터가 아직 수집되지 않았습니다.</p>
        )}
      </section>

      <section className="bg-at-surface rounded-2xl p-4 md:p-5 border border-at-border shadow-at-card">
        <div className="flex justify-between items-center mb-3 gap-2">
          <h3 className="text-base font-semibold text-at-text">AI 권리분석 코멘트</h3>
          <button
            onClick={callAi}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-at-accent-light text-at-accent text-sm font-semibold disabled:opacity-50 shrink-0"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
            {ai ? '재생성' : 'AI 분석 실행'}
          </button>
        </div>

        {err && <p className="text-[14px] md:text-sm text-rose-600 mb-2 font-medium">{err}</p>}

        {ai ? (
          <div className="space-y-3">
            {ai.risk_score !== null && (
              <div className="flex items-center gap-2">
                <span className="text-[14px] md:text-sm text-at-text font-medium">위험도</span>
                <div className="flex-1 h-2.5 bg-at-surface-alt rounded-full overflow-hidden">
                  <div
                    className={`h-full ${ai.risk_score >= 70 ? 'bg-rose-500' : ai.risk_score >= 40 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                    style={{ width: `${ai.risk_score}%` }}
                  />
                </div>
                <span className="text-[14px] md:text-sm font-bold tabular-nums text-at-text">{ai.risk_score}/100</span>
              </div>
            )}
            <p className="text-[15px] md:text-sm leading-relaxed whitespace-pre-line text-at-text">{ai.summary}</p>
            {ai.bullet_points && ai.bullet_points.length > 0 && (
              <ul className="text-[14px] md:text-sm space-y-1 list-disc list-inside text-at-text">
                {ai.bullet_points.map((b, i) => <li key={i}>{b}</li>)}
              </ul>
            )}
            <p className="text-[13px] md:text-xs text-at-text-secondary">
              생성: {new Date(ai.generated_at).toLocaleString('ko-KR')} {ai.cached && '(캐시)'}
            </p>
          </div>
        ) : (
          <p className="text-[14px] md:text-sm text-at-text-secondary">버튼을 눌러 AI 권리분석을 받아보세요. 결과는 24시간 캐싱됩니다.</p>
        )}

        <p className="text-[13px] md:text-xs text-at-text-secondary mt-4 leading-relaxed">
          ※ AI 코멘트는 보조 자료입니다. 최종 투자 판단의 책임은 사용자에게 있으며, 등기부등본 원본을 반드시 확인하세요.
        </p>
      </section>
    </div>
  )
}

const Dt = (p: { children: React.ReactNode }) => <dt className="text-at-text-secondary">{p.children}</dt>
const Dd = (p: { children: React.ReactNode; className?: string }) => <dd className={`font-semibold text-at-text break-words ${p.className ?? ''}`}>{p.children}</dd>
