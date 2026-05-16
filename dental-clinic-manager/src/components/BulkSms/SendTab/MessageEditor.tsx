'use client'

import { useEffect, useState } from 'react'
import { FileText, Sparkles } from 'lucide-react'
import MessageByteCounter from '@/components/BulkSms/shared/MessageByteCounter'
import AiGenerateModal from './AiGenerateModal'
import type { BulkSmsTemplate } from '@/types/bulkSms'

interface Props {
  message: string
  onMessageChange: (v: string) => void
  title: string
  onTitleChange: (v: string) => void
}

export default function MessageEditor({ message, onMessageChange, title, onTitleChange }: Props) {
  const [templates, setTemplates] = useState<BulkSmsTemplate[]>([])
  const [selectedId, setSelectedId] = useState<string>('')
  const [aiOpen, setAiOpen] = useState(false)

  useEffect(() => {
    fetch('/api/bulk-sms/templates')
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setTemplates(d.templates)
          const def = (d.templates as BulkSmsTemplate[]).find(t => t.is_default)
          if (def && !message) {
            setSelectedId(def.id)
            onMessageChange(def.content)
          }
        }
      })
      // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selectTemplate = (id: string) => {
    setSelectedId(id)
    const t = templates.find(x => x.id === id)
    if (t) onMessageChange(t.content)
  }

  const insertVariable = (v: string) => onMessageChange(message + v)

  return (
    <div className="bg-[var(--at-surface)] border border-[var(--at-border)] rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-[var(--at-text-secondary)]" />
          <h3 className="font-medium text-[var(--at-text-primary)]">메시지 작성</h3>
        </div>
        <button
          type="button"
          onClick={() => setAiOpen(true)}
          className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg bg-[var(--at-accent-tag)] text-[var(--at-accent)] hover:opacity-90"
        >
          <Sparkles className="w-3.5 h-3.5" />
          AI로 작성
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <label className="block text-xs text-[var(--at-text-secondary)] mb-1">제목 (LMS만 표시)</label>
          <input
            type="text"
            value={title}
            onChange={e => onTitleChange(e.target.value)}
            placeholder="예: 5월 가정의달 안내"
            className="w-full px-3 py-1.5 border border-[var(--at-border)] rounded-lg text-sm"
          />
        </div>

        <div>
          <label className="block text-xs text-[var(--at-text-secondary)] mb-1">템플릿 불러오기</label>
          <select
            value={selectedId}
            onChange={e => selectTemplate(e.target.value)}
            className="w-full px-3 py-1.5 border border-[var(--at-border)] rounded-lg text-sm bg-white"
          >
            <option value="">템플릿 선택…</option>
            {templates.map(t => (
              <option key={t.id} value={t.id}>{t.name}{t.is_default ? ' (기본)' : ''}</option>
            ))}
          </select>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-xs text-[var(--at-text-secondary)]">본문</label>
            <div className="flex gap-1">
              {['{환자명}', '{병원명}', '{전화번호}'].map(v => (
                <button
                  key={v}
                  type="button"
                  onClick={() => insertVariable(v)}
                  className="text-xs px-2 py-0.5 rounded border border-[var(--at-border)] text-[var(--at-text-primary)] hover:bg-[var(--at-surface-alt)]"
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
          <textarea
            value={message}
            onChange={e => onMessageChange(e.target.value)}
            rows={6}
            placeholder="안녕하세요 {환자명}님, {병원명}입니다."
            className="w-full px-3 py-2 border border-[var(--at-border)] rounded-lg text-sm font-mono"
          />
          <div className="mt-1 flex justify-end">
            <MessageByteCounter text={message} />
          </div>
        </div>
      </div>

      <AiGenerateModal
        open={aiOpen}
        onClose={() => setAiOpen(false)}
        onSelect={(content) => {
          onMessageChange(content)
          setSelectedId('')
        }}
      />
    </div>
  )
}
