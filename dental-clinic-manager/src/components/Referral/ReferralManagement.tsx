'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { Heart, TrendingUp, AlertTriangle, Crown, Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { referralService } from '@/lib/referralService'
import type { PatientReferralWithPatients, ReferralKpi, PatientSearchResult } from '@/types/referral'
import ReferralListTab from './ReferralListTab'
import ReferrerRankingTab from './ReferrerRankingTab'
import ReferralAddModal from './ReferralAddModal'
import ThanksSmsModal from './ThanksSmsModal'
import PointAdjustModal from './PointAdjustModal'

type TabKey = 'list' | 'ranking'

export default function ReferralManagement() {
  const { user } = useAuth()
  const clinicId = user?.clinic_id ?? ''
  const clinicName = user?.hospital_name ?? '저희 병원'

  const [activeTab, setActiveTab] = useState<TabKey>('list')
  const [refreshKey, setRefreshKey] = useState(0)
  const [kpi, setKpi] = useState<ReferralKpi | null>(null)
  const [kpiLoading, setKpiLoading] = useState(false)

  // Modals
  const [addOpen, setAddOpen] = useState(false)
  const [thanksTarget, setThanksTarget] = useState<{ referralId?: string; referrer: { id: string; patient_name: string; phone_number: string | null } | null; refereeName: string } | null>(null)
  const [pointTarget, setPointTarget] = useState<{ referralId?: string; patient: { id: string; patient_name: string }; defaultDelta?: number; defaultReason?: 'referral_reward' | 'referral_welcome' | 'manual_add' | 'manual_use'; defaultNote?: string } | null>(null)

  const loadKpi = useCallback(async () => {
    if (!clinicId) return
    setKpiLoading(true)
    try {
      setKpi(await referralService.kpi(clinicId))
    } catch (e) {
      console.error(e)
    } finally {
      setKpiLoading(false)
    }
  }, [clinicId])

  useEffect(() => { loadKpi() }, [loadKpi, refreshKey])

  const triggerRefresh = () => setRefreshKey(k => k + 1)

  const handleSendThanks = (r: PatientReferralWithPatients) => {
    if (!r.referrer) return
    setThanksTarget({
      referralId: r.id,
      referrer: { id: r.referrer.id, patient_name: r.referrer.patient_name, phone_number: r.referrer.phone_number },
      refereeName: r.referee?.patient_name ?? '신환',
    })
  }

  const handleAddPoints = (r: PatientReferralWithPatients) => {
    if (!r.referrer) return
    setPointTarget({
      referralId: r.id,
      patient: { id: r.referrer.id, patient_name: r.referrer.patient_name },
      defaultReason: 'referral_reward',
      defaultNote: `${r.referee?.patient_name ?? '신환'}님 소개 감사`,
    })
  }

  const handleCreated = (referralId: string, referrer: PatientSearchResult, referee: PatientSearchResult) => {
    triggerRefresh()
    setAddOpen(false)
    setTimeout(() => {
      const dlg = window.confirm(
        `등록 완료!\n\n${referrer.patient_name}님께 감사 문자를 바로 발송하시겠습니까?\n(취소하면 포인트/선물 적립 화면으로 이동)`
      )
      if (dlg) {
        setThanksTarget({
          referralId,
          referrer: { id: referrer.id, patient_name: referrer.patient_name, phone_number: referrer.phone_number },
          refereeName: referee.patient_name,
        })
      } else {
        setPointTarget({
          referralId,
          patient: { id: referrer.id, patient_name: referrer.patient_name },
          defaultReason: 'referral_reward',
          defaultNote: `${referee.patient_name}님 소개 감사`,
        })
      }
    }, 80)
  }

  const monthlyDelta = useMemo(() => {
    if (!kpi) return 0
    return kpi.monthly_count - kpi.monthly_count_prev
  }, [kpi])

  if (!clinicId) {
    return <div className="py-16 text-center text-sm text-[var(--at-text-weak)]">병원 정보를 불러오는 중입니다…</div>
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--at-accent-tag)] text-[var(--at-accent)]">
            <Heart className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-lg font-semibold text-[var(--at-text-primary)]">소개환자 관리</h1>
            <p className="text-xs text-[var(--at-text-secondary)]">소개해주신 분과 신환을 한 곳에서 관리하고 감사 문자·포인트·선물을 적립합니다.</p>
          </div>
        </div>
      </div>

      {/* KPI 카드 */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KpiCard
          icon={<Heart className="h-4 w-4" />}
          label="이번 달 소개"
          value={kpi ? `${kpi.monthly_count}건` : '—'}
          delta={kpi ? (monthlyDelta > 0 ? `+${monthlyDelta} vs 지난달` : monthlyDelta < 0 ? `${monthlyDelta} vs 지난달` : '동일') : ''}
          tone="accent"
          loading={kpiLoading}
        />
        <KpiCard
          icon={<Crown className="h-4 w-4" />}
          label="소개왕 1위"
          value={kpi?.top_referrer ? kpi.top_referrer.patient_name : '없음'}
          delta={kpi?.top_referrer ? `${kpi.top_referrer.referral_count}건 누적` : ''}
          tone="purple"
          loading={kpiLoading}
        />
        <KpiCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="첫 결제 전환율"
          value={kpi ? `${kpi.conversion_rate}%` : '—'}
          delta="누적 기준"
          tone="success"
          loading={kpiLoading}
        />
        <KpiCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="매칭 필요"
          value={kpi ? `${kpi.pending_link_count}건` : '—'}
          delta="최근 90일 신환 중"
          tone="warning"
          loading={kpiLoading}
        />
      </div>

      {/* 탭 */}
      <div className="flex items-center gap-1 border-b border-[var(--at-border)]">
        {([
          { k: 'list', label: '소개 내역' },
          { k: 'ranking', label: '소개왕 랭킹' },
        ] as const).map(t => (
          <button
            key={t.k}
            onClick={() => setActiveTab(t.k)}
            className={`relative px-4 py-2.5 text-sm font-medium transition ${
              activeTab === t.k
                ? 'text-[var(--at-accent)]'
                : 'text-[var(--at-text-secondary)] hover:text-[var(--at-text-primary)]'
            }`}
          >
            {t.label}
            {activeTab === t.k && (
              <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-[var(--at-accent)]" />
            )}
          </button>
        ))}
      </div>

      {activeTab === 'list' && (
        <ReferralListTab
          clinicId={clinicId}
          refreshKey={refreshKey}
          onSendThanks={handleSendThanks}
          onAddPoints={handleAddPoints}
          onAddReferral={() => setAddOpen(true)}
          onDeleted={triggerRefresh}
        />
      )}
      {activeTab === 'ranking' && (
        <ReferrerRankingTab clinicId={clinicId} refreshKey={refreshKey} />
      )}

      <ReferralAddModal
        clinicId={clinicId}
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={handleCreated}
      />
      <ThanksSmsModal
        clinicId={clinicId}
        open={!!thanksTarget}
        onClose={() => setThanksTarget(null)}
        referralId={thanksTarget?.referralId}
        referrer={thanksTarget?.referrer ?? null}
        refereeName={thanksTarget?.refereeName ?? '신환'}
        clinicName={clinicName}
        userId={user?.id}
        onSent={triggerRefresh}
      />
      <PointAdjustModal
        clinicId={clinicId}
        open={!!pointTarget}
        onClose={() => setPointTarget(null)}
        patient={pointTarget?.patient ?? null}
        referralId={pointTarget?.referralId}
        defaultDelta={pointTarget?.defaultDelta}
        defaultReason={pointTarget?.defaultReason}
        defaultNote={pointTarget?.defaultNote}
        onSaved={triggerRefresh}
      />
    </div>
  )
}

interface KpiCardProps {
  icon: React.ReactNode
  label: string
  value: string
  delta: string
  tone: 'accent' | 'success' | 'warning' | 'purple'
  loading?: boolean
}

function KpiCard({ icon, label, value, delta, tone, loading }: KpiCardProps) {
  const toneMap = {
    accent: 'bg-[var(--at-accent-tag)] text-[var(--at-accent)]',
    success: 'bg-[var(--at-success-bg)] text-[var(--at-success)]',
    warning: 'bg-[var(--at-warning-bg)] text-[var(--at-warning)]',
    purple: 'bg-[#f3eaff] text-[var(--at-purple)]',
  } as const
  return (
    <div className="rounded-xl border border-[var(--at-border)] bg-white p-4 shadow-[var(--shadow-at-soft)]">
      <div className="mb-2 flex items-center gap-2">
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${toneMap[tone]}`}>{icon}</span>
        <span className="text-xs font-medium text-[var(--at-text-secondary)]">{label}</span>
      </div>
      <div className="flex items-end justify-between">
        <span className="text-xl font-semibold text-[var(--at-text-primary)] truncate">
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : value}
        </span>
        {delta && <span className="text-xs text-[var(--at-text-weak)] truncate">{delta}</span>}
      </div>
    </div>
  )
}
