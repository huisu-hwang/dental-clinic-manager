'use client'

import { useState, useEffect } from 'react'
import { XMarkIcon, PlusIcon } from '@heroicons/react/24/outline'
import TiptapEditor from './TiptapEditor'
import { dataService } from '@/lib/dataService'
import type { ProtocolCategory, ProtocolFormData } from '@/types'

interface ProtocolFormProps {
  initialData?: ProtocolFormData & { id?: string }
  onSubmit: (data: ProtocolFormData) => Promise<void>
  onCancel: () => void
  mode: 'create' | 'edit'
}

export default function ProtocolForm({
  initialData,
  onSubmit,
  onCancel,
  mode
}: ProtocolFormProps) {
  const [formData, setFormData] = useState<ProtocolFormData>({
    title: initialData?.title || '',
    category_id: initialData?.category_id || '',
    content: initialData?.content || '',
    status: initialData?.status || 'draft',
    tags: initialData?.tags || [],
    change_summary: initialData?.change_summary || '',
    change_type: initialData?.change_type || 'minor'
  })

  const [categories, setCategories] = useState<ProtocolCategory[]>([])
  const [tagInput, setTagInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetchCategories()
  }, [])

  const fetchCategories = async () => {
    const result = await dataService.getProtocolCategories()
    if (result.error) {
      setError('카테고리를 불러오는데 실패했습니다.')
    } else {
      setCategories(result.data || [])
    }
  }

  const handleAddTag = () => {
    const trimmedTag = tagInput.trim()
    if (trimmedTag && !formData.tags.includes(trimmedTag)) {
      setFormData({
        ...formData,
        tags: [...formData.tags, trimmedTag]
      })
      setTagInput('')
    }
  }

  const handleRemoveTag = (tagToRemove: string) => {
    setFormData({
      ...formData,
      tags: formData.tags.filter(tag => tag !== tagToRemove)
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.title.trim()) {
      setError('프로토콜 제목을 입력하세요.')
      return
    }

    if (!formData.content.trim() || formData.content === '<p></p>') {
      setError('프로토콜 내용을 입력하세요.')
      return
    }

    if (mode === 'edit' && !formData.change_summary?.trim()) {
      setError('변경 사항 요약을 입력하세요.')
      return
    }

    setLoading(true)
    setError('')

    try {
      await onSubmit(formData)
    } catch (err) {
      setError('저장 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full my-8">
        <form onSubmit={handleSubmit}>
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-slate-200">
            <h2 className="text-2xl font-bold text-slate-800">
              {mode === 'create' ? '새 프로토콜 작성' : '프로토콜 수정'}
            </h2>
            <button
              type="button"
              onClick={onCancel}
              className="text-slate-400 hover:text-slate-600"
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 space-y-6 max-h-[calc(100vh-250px)] overflow-y-auto">
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md text-sm">
                {error}
              </div>
            )}

            {/* Title */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                프로토콜 제목 *
              </label>
              <input
                type="text"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                className="w-full p-3 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                placeholder="예: 임플란트 식립 프로토콜"
                required
              />
            </div>

            {/* Category and Status */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  카테고리
                </label>
                <select
                  value={formData.category_id}
                  onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                  className="w-full p-3 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">카테고리 없음</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  상태
                </label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as any })}
                  className="w-full p-3 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="draft">작성중</option>
                  <option value="active">활성</option>
                  <option value="archived">보관됨</option>
                </select>
              </div>
            </div>

            {/* Tags */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                태그
              </label>
              <div className="flex gap-2 mb-2">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      handleAddTag()
                    }
                  }}
                  className="flex-1 p-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  placeholder="태그 입력 후 엔터"
                />
                <button
                  type="button"
                  onClick={handleAddTag}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md flex items-center"
                >
                  <PlusIcon className="h-4 w-4" />
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {formData.tags.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-blue-100 text-blue-800"
                  >
                    {tag}
                    <button
                      type="button"
                      onClick={() => handleRemoveTag(tag)}
                      className="ml-2 hover:text-blue-600"
                    >
                      <XMarkIcon className="h-4 w-4" />
                    </button>
                  </span>
                ))}
              </div>
            </div>

            {/* Content Editor */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                프로토콜 내용 *
              </label>
              <TiptapEditor
                content={formData.content}
                onChange={(content) => setFormData({ ...formData, content })}
              />
            </div>

            {/* Change Summary (for edit mode) */}
            {mode === 'edit' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    변경 유형 *
                  </label>
                  <select
                    value={formData.change_type}
                    onChange={(e) => setFormData({ ...formData, change_type: e.target.value as any })}
                    className="w-full p-3 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="minor">소규모 수정 (Minor)</option>
                    <option value="major">대규모 수정 (Major)</option>
                  </select>
                  <p className="text-xs text-slate-500 mt-1">
                    Major: 주요 내용 변경 시 버전 증가 (예: 1.0 → 2.0), Minor: 소규모 수정 시 (예: 1.0 → 1.1)
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    변경 사항 요약 *
                  </label>
                  <textarea
                    value={formData.change_summary}
                    onChange={(e) => setFormData({ ...formData, change_summary: e.target.value })}
                    className="w-full p-3 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    rows={3}
                    placeholder="이번 수정에서 변경된 내용을 간단히 설명하세요."
                    required
                  />
                </div>
              </>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-6 border-t border-slate-200">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 text-slate-700 bg-white border border-slate-300 rounded-md hover:bg-slate-50"
              disabled={loading}
            >
              취소
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:bg-blue-400"
              disabled={loading}
            >
              {loading ? '저장 중...' : mode === 'create' ? '프로토콜 생성' : '변경 사항 저장'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
