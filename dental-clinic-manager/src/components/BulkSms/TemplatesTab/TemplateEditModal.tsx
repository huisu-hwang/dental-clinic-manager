'use client'

import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import MessageByteCounter from '../shared/MessageByteCounter'
import type { BulkSmsTemplate } from '@/types/bulkSms'

interface Props {
  open: boolean
  template: BulkSmsTemplate | null
  onClose: () => void
  onSaved: () => void
}

export default function TemplateEditModal({ open, template, onClose, onSaved }: Props) {
  const [name, setName] = useState('')
  const [content, setContent] = useState('')
  const [isDefault, setIsDefault] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(template?.name ?? '')
    setContent(template?.content ?? '')
    setIsDefault(template?.is_default ?? false)
  }, [open, template])

  if (!open) return null

  const save = async () => {
    if (!name.trim() || !content.trim()) {
      alert('이름과 내용을 입력하세요')
      return
    }

    setSaving(true)
    const url = template ? `/api/bulk-sms/templates/${template.id}` : '/api/bulk-sms/templates'
    const method = template ? 'PATCH' : 'POST'

    try {
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), content, is_default: isDefault }),
      })
      const d = await res.json()
      setSaving(false)

      if (d.success) {
        onSaved()
      } else {
        alert(d.error || '저장 실패')
      }
    } catch (err) {
      setSaving(false)
      alert('저장 중 오류가 발생했습니다')
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200">
          <h2 className="text-lg font-semibold">
            {template ? '템플릿 수정' : '템플릿 추가'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              이름
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="예: 정기 검진 안내"
              className="w-full px-3 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:border-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              내용 (변수: {'{환자명}'}, {'{병원명}'}, {'{전화번호}'})
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="예: {환자명}님, 안녕하세요. {병원명}입니다."
              rows={6}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono focus:outline-none focus:border-blue-500"
            />
            <div className="mt-1 flex justify-end">
              <MessageByteCounter text={content} />
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={isDefault}
              onChange={(e) => setIsDefault(e.target.checked)}
              className="w-4 h-4 border-gray-300 rounded"
            />
            <span>기본 템플릿으로 설정</span>
          </label>
        </div>

        <div className="px-4 py-3 border-t border-gray-200 flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={saving}
            className="px-3 py-1.5 text-sm rounded-md border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
          >
            취소
          </button>
          <button
            onClick={save}
            disabled={saving}
            className="px-4 py-1.5 text-sm rounded-md bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </div>
  )
}
