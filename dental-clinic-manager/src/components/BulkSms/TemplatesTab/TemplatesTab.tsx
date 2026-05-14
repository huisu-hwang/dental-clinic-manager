'use client'

import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import TemplateEditModal from './TemplateEditModal'
import type { BulkSmsTemplate } from '@/types/bulkSms'

export default function TemplatesTab() {
  const [templates, setTemplates] = useState<BulkSmsTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState<BulkSmsTemplate | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/bulk-sms/templates')
      const d = await res.json()
      if (d.success) {
        setTemplates(d.templates || [])
      }
    } catch (err) {
      console.error('Failed to load templates:', err)
    }
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const remove = async (id: string) => {
    if (!confirm('이 템플릿을 삭제하시겠습니까?')) return

    try {
      const res = await fetch(`/api/bulk-sms/templates/${id}`, { method: 'DELETE' })
      const d = await res.json()

      if (d.success) {
        load()
      } else {
        alert(d.error || '삭제 실패')
      }
    } catch (err) {
      alert('삭제 중 오류가 발생했습니다')
    }
  }

  return (
    <>
      <div className="flex justify-end mb-4">
        <button
          onClick={() => {
            setEditing(null)
            setModalOpen(true)
          }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-4 h-4" />
          템플릿 추가
        </button>
      </div>

      {loading ? (
        <div className="p-8 text-center text-sm text-gray-400">불러오는 중...</div>
      ) : templates.length === 0 ? (
        <div className="p-8 text-center text-sm text-gray-400">
          등록된 템플릿이 없습니다.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => (
            <div
              key={t.id}
              className="bg-white border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
            >
              <div className="flex items-start justify-between gap-2 mb-3">
                <div className="flex-1">
                  <h4 className="font-medium text-gray-900 text-sm">{t.name}</h4>
                  {t.is_default && (
                    <span className="inline-block mt-1 text-xs px-2 py-0.5 bg-blue-100 text-blue-700 rounded">
                      기본 템플릿
                    </span>
                  )}
                </div>
                <div className="flex gap-1">
                  <button
                    onClick={() => {
                      setEditing(t)
                      setModalOpen(true)
                    }}
                    className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                    title="편집"
                  >
                    <Pencil className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => remove(t.id)}
                    className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                    title="삭제"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <pre className="text-xs text-gray-600 whitespace-pre-wrap font-sans line-clamp-4 break-words">
                {t.content}
              </pre>
            </div>
          ))}
        </div>
      )}

      <TemplateEditModal
        open={modalOpen}
        template={editing}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          setModalOpen(false)
          load()
        }}
      />
    </>
  )
}
