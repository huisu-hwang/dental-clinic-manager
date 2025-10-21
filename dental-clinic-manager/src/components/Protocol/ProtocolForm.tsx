'use client'

import { useState, useEffect } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import EnhancedTiptapEditor from './EnhancedTiptapEditor'
import ProtocolStepsEditor from './ProtocolStepsEditor'
import SmartTagInput from './SmartTagInput'
import { dataService } from '@/lib/dataService'
import { tagSuggestionService } from '@/lib/tagSuggestionService'
import type { ProtocolCategory, ProtocolFormData, ProtocolStep } from '@/types'

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
    change_type: initialData?.change_type || 'minor',
    steps: initialData?.steps || []
  })

  const [categories, setCategories] = useState<ProtocolCategory[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState<'editor' | 'steps'>('editor')
  const [clinicId, setClinicId] = useState<string>('')

  useEffect(() => {
    fetchInitialData()
  }, [])

  const fetchInitialData = async () => {
    // 카테고리 가져오기
    const result = await dataService.getProtocolCategories()
    if (result.error) {
      setError('카테고리를 불러오는데 실패했습니다.')
    } else {
      setCategories(result.data || [])
    }

    // 현재 클리닉 ID 가져오기 (세션에서)
    const { data: session } = await dataService.getSession()
    if (session?.clinicId) {
      setClinicId(session.clinicId)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.title.trim()) {
      setError('프로토콜 제목을 입력하세요.')
      return
    }

    // 에디터 탭이 활성화된 경우 content 검증
    if (activeTab === 'editor') {
      if (!formData.content.trim() || formData.content === '<p></p>') {
        setError('프로토콜 내용을 입력하세요.')
        return
      }
    }

    // 단계별 탭이 활성화된 경우 steps 검증
    if (activeTab === 'steps') {
      if (!formData.steps || formData.steps.length === 0) {
        setError('최소 1개 이상의 단계를 추가하세요.')
        return
      }

      const invalidStep = formData.steps.find(step => !step.title.trim() || !step.content.trim())
      if (invalidStep) {
        setError('모든 단계에 제목과 내용을 입력하세요.')
        return
      }
    }

    if (mode === 'edit' && !formData.change_summary?.trim()) {
      setError('변경 사항 요약을 입력하세요.')
      return
    }

    setLoading(true)
    setError('')

    try {
      // 태그 사용 통계 업데이트
      if (formData.tags.length > 0 && clinicId) {
        await tagSuggestionService.updateTagStatistics(
          clinicId,
          formData.tags,
          formData.category_id
        )
      }

      await onSubmit(formData)
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '저장 중 오류가 발생했습니다.'
      setError(errorMessage)
      console.error('프로토콜 저장 오류:', err)
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

            {/* Content Mode Tabs */}
            <div className="border-b border-slate-200">
              <div className="flex space-x-8">
                <button
                  type="button"
                  onClick={() => setActiveTab('editor')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'editor'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                  }`}
                >
                  통합 에디터
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('steps')}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === 'steps'
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
                  }`}
                >
                  단계별 작성
                </button>
              </div>
            </div>

            {/* Content Editor or Steps Editor */}
            {activeTab === 'editor' ? (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  프로토콜 내용 *
                </label>
                <EnhancedTiptapEditor
                  content={formData.content}
                  onChange={(content) => setFormData({ ...formData, content })}
                  placeholder="프로토콜 내용을 작성하세요..."
                  editable={true}
                />
              </div>
            ) : (
              <div>
                <ProtocolStepsEditor
                  steps={formData.steps || []}
                  onChange={(steps) => setFormData({ ...formData, steps })}
                  disabled={loading}
                />
              </div>
            )}

            {/* Smart Tag Input */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                태그
              </label>
              <SmartTagInput
                value={formData.tags}
                onChange={(tags) => setFormData({ ...formData, tags })}
                title={formData.title}
                categoryId={formData.category_id}
                clinicId={clinicId}
                disabled={loading}
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
