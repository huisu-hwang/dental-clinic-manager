'use client'

import { useState, useEffect, useMemo } from 'react'
import { X, Send, Loader2, MessageCircle } from 'lucide-react'
import { referralService } from '@/lib/referralService'

interface Props {
  clinicId: string
  open: boolean
  onClose: () => void
  referralId?: string
  referrer: { id: string; patient_name: string; phone_number: string | null } | null
  refereeName: string
  clinicName?: string
  userId?: string
  onSent: () => void
}

export default function ThanksSmsModal({ clinicId, open, onClose, referralId, referrer, refereeName, clinicName = '저희 병원', userId, onSent }: Props) {
  const [template, setTemplate] = useState<string>('')
  const [message, setMessage] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    if (!open) return
    setError(null); setSuccess(null)
    let cancelled = false
    const load = async () => {
      setLoading(true)
      try {
        const t = await referralService.getThanksTemplate(clinicId)
        if (cancelled) return
        const content = (t?.content as string | undefined) ?? `안녕하세요, ${clinicName}입니다. {{환자명}}님 덕분에 {{소개받은신환명}}님을 모실 수 있게 되어 진심으로 감사드립니다.`
        setTemplate(content)
      } catch (e) {
        console.error(e)
        setTemplate(`안녕하세요, ${clinicName}입니다. {{환자명}}님 덕분에 {{소개받은신환명}}님을 모실 수 있게 되어 진심으로 감사드립니다.`)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [open, clinicId, clinicName])

  useEffect(() => {
    if (!template || !referrer) return
    const replaced = template
      .replace(/\{\{환자명\}\}/g, referrer.patient_name)
      .replace(/\{\{소개받은신환명\}\}/g, refereeName)
      .replace(/\{\{병원명\}\}/g, clinicName)
    setMessage(replaced)
  }, [template, referrer, refereeName, clinicName])

  const byteSize = useMemo(() => new Blob([message]).size, [message])
  const msgType: 'SMS' | 'LMS' = byteSize <= 90 ? 'SMS' : 'LMS'

  const handleSend = async () => {
    if (!referrer?.phone_number) {
      setError('받는 분의 전화번호가 없습니다.')
      return
    }
    if (!message.trim()) {
      setError('문자 내용을 입력해주세요.')
      return
    }
    setSending(true); setError(null); setSuccess(null)
    try {
      const res = await fetch('/api/referrals/sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinic_id: clinicId,
          referral_id: referralId,
          recipient_dentweb_patient_id: referrer.id,
          phone_number: referrer.phone_number,
          message,
          msg_type: msgType,
          title: msgType !== 'SMS' ? '소개 감사 인사' : undefined,
          sent_by: userId,
        }),
      })
      const json = await res.json()
      if (json.success) {
        setSuccess('감사 문자가 정상 발송되었습니다.')
        onSent()
        setTimeout(() => onClose(), 900)
      } else {
        const base = json.error ?? '발송에 실패했습니다.'
        setError(json.hint ? `${base}\n→ ${json.hint}` : base)
      }
    } catch (e) {
      console.error(e)
      setError('발송 중 오류가 발생했습니다.')
    } finally {
      setSending(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4" onMouseDown={onClose}>
      <div className="w-full max-w-xl rounded-xl bg-white shadow-[var(--shadow-at-card)]" onMouseDown={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[var(--at-border)] px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--at-accent-tag)] text-[var(--at-accent)]">
              <MessageCircle className="h-4 w-4" />
            </span>
            <h2 className="text-base font-semibold text-[var(--at-text-primary)]">감사 문자 발송</h2>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-[var(--at-text-weak)] hover:bg-[var(--at-surface-hover)]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3 px-5 py-4">
          <div className="rounded-lg bg-[var(--at-surface-alt)] px-3 py-2.5 text-sm">
            <span className="text-[var(--at-text-secondary)]">받는 분: </span>
            <span className="font-medium text-[var(--at-text-primary)]">{referrer?.patient_name ?? '-'}</span>
            <span className="ml-2 text-[var(--at-text-weak)]">{referrer?.phone_number ?? '전화번호 없음'}</span>
          </div>

          {loading ? (
            <div className="flex h-32 items-center justify-center text-[var(--at-text-weak)]">
              <Loader2 className="h-5 w-5 animate-spin" />
            </div>
          ) : (
            <>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={6}
                className="w-full rounded-lg border border-[var(--at-border)] px-3 py-2.5 text-sm focus:border-[var(--at-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--at-accent)]"
              />
              <div className="flex items-center justify-between text-xs text-[var(--at-text-secondary)]">
                <span>변수 치환 완료 ({`{{환자명}}, {{소개받은신환명}}, {{병원명}}`})</span>
                <span>
                  <span className={`mr-1 rounded-full px-2 py-0.5 font-medium ${msgType === 'SMS' ? 'bg-[var(--at-success-bg)] text-[var(--at-success)]' : 'bg-[var(--at-warning-bg)] text-[var(--at-warning)]'}`}>
                    {msgType}
                  </span>
                  {byteSize}바이트
                </span>
              </div>
            </>
          )}

          {error && <div className="whitespace-pre-line rounded-lg bg-[var(--at-error-bg)] px-3 py-2 text-sm text-[var(--at-error)]">{error}</div>}
          {success && <div className="rounded-lg bg-[var(--at-success-bg)] px-3 py-2 text-sm text-[var(--at-success)]">{success}</div>}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-[var(--at-border)] px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={sending}
            className="rounded-lg border border-[var(--at-border)] bg-white px-4 py-2 text-sm font-medium text-[var(--at-text-primary)] hover:bg-[var(--at-surface-hover)] disabled:opacity-50"
          >
            닫기
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || !referrer?.phone_number}
            className="flex items-center gap-1.5 rounded-lg bg-[var(--at-accent)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--at-accent-hover)] disabled:opacity-50"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            발송하기
          </button>
        </div>
      </div>
    </div>
  )
}
