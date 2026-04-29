'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { Heart, ChevronRight } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { usePermissions } from '@/hooks/usePermissions'
import { referralService } from '@/lib/referralService'

export default function ReferralPendingWidget() {
  const { user } = useAuth()
  const { hasPermission } = usePermissions()
  const [pending, setPending] = useState(0)
  const [monthly, setMonthly] = useState(0)
  const [loading, setLoading] = useState(true)

  const canView = hasPermission('referral_view')
  const clinicId = user?.clinic_id

  useEffect(() => {
    if (!canView || !clinicId) { setLoading(false); return }
    let cancelled = false
    referralService.kpi(clinicId)
      .then(k => {
        if (cancelled) return
        setPending(k.pending_link_count)
        setMonthly(k.monthly_count)
      })
      .catch(e => console.error(e))
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [canView, clinicId])

  if (!canView || loading) return null

  return (
    <Link
      href="/dashboard?tab=referral"
      className="group block rounded-2xl border border-at-border bg-white p-4 transition hover:border-at-accent hover:shadow-[var(--shadow-at-card)]"
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-at-accent-light text-at-accent">
            <Heart className="h-5 w-5" />
          </span>
          <div>
            <div className="text-sm font-semibold text-at-text">소개환자 관리</div>
            <div className="mt-0.5 flex items-center gap-2 text-xs text-at-text-secondary">
              <span>이번 달 <span className="font-semibold text-at-text">{monthly}건</span></span>
              {pending > 0 ? (
                <>
                  <span className="text-at-text-weak">·</span>
                  <span className="rounded-full bg-[var(--at-warning-bg)] px-2 py-0.5 font-medium text-[var(--at-warning)]">
                    매칭 필요 {pending}건
                  </span>
                </>
              ) : (
                <>
                  <span className="text-at-text-weak">·</span>
                  <span className="text-at-text-weak">소개해주신 분께 감사 표시하기</span>
                </>
              )}
            </div>
          </div>
        </div>
        <ChevronRight className="h-4 w-4 text-at-text-weak transition group-hover:text-at-accent group-hover:translate-x-0.5" />
      </div>
    </Link>
  )
}
