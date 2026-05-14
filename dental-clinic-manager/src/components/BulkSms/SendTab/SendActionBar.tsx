'use client'

import { useState } from 'react'
import { Send, Clock, FlaskConical } from 'lucide-react'

interface Props {
  canSend: boolean
  onTestSend: (phone: string) => Promise<void>
  onSubmitImmediate: () => void
  onSubmitScheduled: (scheduledAtIso: string) => void
}

export default function SendActionBar({ canSend, onTestSend, onSubmitImmediate, onSubmitScheduled }: Props) {
  const [mode, setMode] = useState<'immediate' | 'scheduled'>('immediate')
  const [scheduledLocal, setScheduledLocal] = useState('')
  const [testPhone, setTestPhone] = useState('')
  const [testing, setTesting] = useState(false)
  const [testMsg, setTestMsg] = useState<string | null>(null)

  const handleTest = async () => {
    if (!testPhone) return
    setTesting(true)
    setTestMsg(null)
    try {
      await onTestSend(testPhone)
      setTestMsg('테스트 발송 완료')
    } catch (e) {
      setTestMsg(`실패: ${(e as Error).message}`)
    } finally {
      setTesting(false)
    }
  }

  const handleSubmit = () => {
    if (mode === 'immediate') onSubmitImmediate()
    else {
      if (!scheduledLocal) return
      const iso = new Date(scheduledLocal).toISOString()
      onSubmitScheduled(iso)
    }
  }

  return (
    <div className="bg-[var(--at-surface)] border border-[var(--at-border)] rounded-xl p-4 space-y-3">
      <div>
        <label className="block text-xs text-[var(--at-text-secondary)] mb-1.5 flex items-center gap-1">
          <FlaskConical className="w-3.5 h-3.5" /> 테스트 발송 (본인 번호)
        </label>
        <div className="flex gap-2">
          <input
            type="tel"
            value={testPhone}
            onChange={e => setTestPhone(e.target.value)}
            placeholder="010-0000-0000"
            className="flex-1 px-3 py-1.5 border border-[var(--at-border)] rounded-lg text-sm"
          />
          <button
            type="button"
            onClick={handleTest}
            disabled={testing || !testPhone}
            className="px-3 py-1.5 text-sm rounded-lg border border-[var(--at-border)] hover:bg-[var(--at-surface-alt)] disabled:opacity-50"
          >
            {testing ? '발송 중' : '테스트'}
          </button>
        </div>
        {testMsg && <p className="mt-1 text-xs text-[var(--at-text-secondary)]">{testMsg}</p>}
      </div>

      <hr className="border-[var(--at-border)]" />

      <div>
        <label className="block text-xs text-[var(--at-text-secondary)] mb-1.5">발송 방식</label>
        <div className="flex gap-2">
          {[
            { v: 'immediate', label: '즉시 발송', icon: Send },
            { v: 'scheduled', label: '예약 발송', icon: Clock },
          ].map(opt => (
            <button
              key={opt.v}
              type="button"
              onClick={() => setMode(opt.v as 'immediate' | 'scheduled')}
              className={`flex-1 py-2 text-sm rounded-lg border flex items-center justify-center gap-1.5 ${
                mode === opt.v ? 'bg-[var(--at-accent-tag)] border-[var(--at-accent)] text-[var(--at-accent)]' : 'bg-white border-[var(--at-border)] text-[var(--at-text-primary)]'
              }`}
            >
              <opt.icon className="w-4 h-4" />
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {mode === 'scheduled' && (
        <input
          type="datetime-local"
          value={scheduledLocal}
          onChange={e => setScheduledLocal(e.target.value)}
          className="w-full px-3 py-1.5 border border-[var(--at-border)] rounded-lg text-sm"
        />
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={!canSend || (mode === 'scheduled' && !scheduledLocal)}
        className="w-full py-2.5 bg-[var(--at-accent)] text-white rounded-lg text-sm font-semibold hover:opacity-90 disabled:opacity-50"
      >
        {mode === 'immediate' ? '발송하기' : '예약하기'}
      </button>
    </div>
  )
}
