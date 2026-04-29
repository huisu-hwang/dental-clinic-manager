'use client'

import { useState, useEffect, useRef } from 'react'
import { Settings, Loader2, Check } from 'lucide-react'
import { referralService } from '@/lib/referralService'
import type { ReferralSettings } from '@/types/referral'

interface Props {
  clinicId: string
}

export default function SettingsPopover({ clinicId }: Props) {
  const [open, setOpen] = useState(false)
  const [settings, setSettings] = useState<ReferralSettings | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<number | null>(null)
  const wrapRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    referralService.getSettings(clinicId)
      .then(setSettings)
      .catch(e => console.error(e))
      .finally(() => setLoading(false))
  }, [open, clinicId])

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const update = async (patch: Partial<ReferralSettings>) => {
    if (!settings) return
    setSaving(true)
    try {
      const next = await referralService.updateSettings(clinicId, patch)
      setSettings(next)
      setSavedAt(Date.now())
      setTimeout(() => setSavedAt(s => (s && Date.now() - s >= 1500 ? null : s)), 1600)
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-1.5 rounded-lg border border-[var(--at-border)] bg-white px-3 py-2 text-sm font-medium text-[var(--at-text-secondary)] hover:bg-[var(--at-surface-hover)]"
      >
        <Settings className="h-4 w-4" />
        설정
      </button>

      {open && (
        <div className="absolute right-0 z-30 mt-2 w-80 rounded-xl border border-[var(--at-border)] bg-white p-4 shadow-[var(--shadow-at-card)]">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-[var(--at-text-primary)]">소개 정책</h3>
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin text-[var(--at-accent)]" />
            ) : savedAt ? (
              <Check className="h-4 w-4 text-[var(--at-success)]" />
            ) : null}
          </div>

          {loading || !settings ? (
            <div className="flex h-24 items-center justify-center text-[var(--at-text-weak)]">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <label htmlFor="auto-thanks" className="cursor-pointer text-[var(--at-text-primary)]">자동 감사 문자</label>
                <input
                  id="auto-thanks"
                  type="checkbox"
                  checked={settings.auto_thanks_enabled}
                  onChange={(e) => update({ auto_thanks_enabled: e.target.checked })}
                  className="h-4 w-4 rounded border-[var(--at-border)] text-[var(--at-accent)] focus:ring-[var(--at-accent)]"
                />
              </div>
              {settings.auto_thanks_enabled && (
                <div>
                  <label className="block text-xs text-[var(--at-text-secondary)]">소개 등록 후 며칠 뒤 자동 발송</label>
                  <input
                    type="number"
                    min={0}
                    max={30}
                    value={settings.auto_thanks_after_days}
                    onChange={(e) => update({ auto_thanks_after_days: Number(e.target.value) })}
                    className="mt-1 w-24 rounded-lg border border-[var(--at-border)] px-2 py-1.5 text-sm focus:border-[var(--at-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--at-accent)]"
                  />
                  <span className="ml-2 text-xs text-[var(--at-text-weak)]">일 (0=즉시 익일)</span>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2 border-t border-[var(--at-border)] pt-3">
                <div>
                  <label className="block text-xs text-[var(--at-text-secondary)]">소개자 기본 P</label>
                  <input
                    type="number"
                    min={0}
                    step={500}
                    value={settings.referrer_default_points}
                    onChange={(e) => update({ referrer_default_points: Number(e.target.value) })}
                    className="mt-1 w-full rounded-lg border border-[var(--at-border)] px-2 py-1.5 text-sm focus:border-[var(--at-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--at-accent)]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[var(--at-text-secondary)]">신환 기본 P</label>
                  <input
                    type="number"
                    min={0}
                    step={500}
                    value={settings.referee_default_points}
                    onChange={(e) => update({ referee_default_points: Number(e.target.value) })}
                    className="mt-1 w-full rounded-lg border border-[var(--at-border)] px-2 py-1.5 text-sm focus:border-[var(--at-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--at-accent)]"
                  />
                </div>
              </div>
              <p className="text-xs text-[var(--at-text-weak)]">변경 사항은 자동 저장됩니다.</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
