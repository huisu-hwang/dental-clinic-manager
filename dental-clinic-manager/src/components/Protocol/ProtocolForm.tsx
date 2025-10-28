'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { XMarkIcon } from '@heroicons/react/24/outline'
import ProtocolStepsEditor from './ProtocolStepsEditor'
import SmartTagInput from './SmartTagInput'
import ProtocolStepViewer from './ProtocolStepViewer'
import { dataService } from '@/lib/dataService'
import { tagSuggestionService } from '@/lib/tagSuggestionService'
import type { ProtocolCategory, ProtocolFormData, ProtocolStep } from '@/types'
import {
  buildDefaultStep,
  hasValidSteps,
  serializeStepsToHtml
} from '@/utils/protocolStepUtils'

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
  const isMountedRef = useRef(true)
  useEffect(() => {
    return () => {
      isMountedRef.current = false
    }
  }, [])

  const resolvedInitialSteps = useMemo(() => {
    if (initialData?.steps && initialData.steps.length > 0) {
      return initialData.steps
    }

    if (initialData?.content) {
      return [
        {
          id: initialData.id ? `legacy-${initialData.id}` : `legacy-${Date.now()}`,
          step_order: 0,
          title: initialData.title || '단계 1',
          content: initialData.content,
          reference_materials: initialData.steps?.[0]?.reference_materials ?? [],
          is_optional: false
        }
      ] satisfies ProtocolStep[]
    }

    return [buildDefaultStep(0)]
  }, [initialData])

  const [formData, setFormData] = useState<ProtocolFormData>({
    title: initialData?.title || '',
    category_id: initialData?.category_id || '',
    content: serializeStepsToHtml(resolvedInitialSteps),
    status: initialData?.status || 'draft',
    tags: initialData?.tags || [],
    change_summary: initialData?.change_summary || '',
    change_type: initialData?.change_type || 'minor',
    steps: resolvedInitialSteps
  })

  const [categories, setCategories] = useState<ProtocolCategory[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [clinicId, setClinicId] = useState<string>('')
  useEffect(() => {
    fetchInitialData()
  }, [])

  useEffect(() => {
    if (initialData) {
      const nextSteps =
        initialData.steps && initialData.steps.length > 0
          ? initialData.steps
          : resolvedInitialSteps

      setFormData({
        title: initialData.title || '',
        category_id: initialData.category_id || '',
        content: serializeStepsToHtml(nextSteps),
        status: initialData.status || 'draft',
        tags: initialData.tags || [],
        change_summary: initialData.change_summary || '',
        change_type: initialData.change_type || 'minor',
        steps: nextSteps
      })
    }
  }, [initialData, resolvedInitialSteps])

  const handleStepsChange = (steps: ProtocolStep[]) => {
    const html = serializeStepsToHtml(steps)
    setFormData(prev => ({
      ...prev,
      steps,
      content: html
    }))
  }

  const fetchInitialData = async () => {
    try {
      // 먼저 세션에서 클리닉 ID 가져오기
      const { data: session } = await dataService.getSession()

      if (!session?.clinicId) {
        if (isMountedRef.current) {
          setError('사용자 정보를 불러올 수 없습니다. 다시 로그인해주세요.')
        }
        return
      }

      if (isMountedRef.current) {
        setClinicId(session.clinicId)
      }

      // 클리닉 ID로 카테고리 가져오기
      const result = await dataService.getProtocolCategories(session.clinicId)

      if (result.error) {
        if (isMountedRef.current) {
          setError(`카테고리를 불러오는데 실패했습니다: ${result.error}`)
        }
      } else {
        const categoryList = (result.data as ProtocolCategory[] | undefined) ?? []

        if (isMountedRef.current) {
          setCategories(categoryList)

          // 카테고리가 없으면 안내 메시지
          if (categoryList.length === 0) {
            setError('프로토콜 카테고리가 없습니다. 관리자에게 문의하세요.')
          }
        }
      }
    } catch (error) {
      console.error('[ProtocolForm] Error fetching initial data:', error)
      if (isMountedRef.current) {
        setError('데이터를 불러오는 중 오류가 발생했습니다.')
      }
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.title.trim()) {
      setError('프로토콜 제목을 입력하세요.')
      return
    }

    if (!hasValidSteps(formData.steps)) {
      setError('최소 1개 이상의 단계에 제목과 내용을 입력하세요.')
      return
    }

    if (mode === 'edit' && !formData.change_summary?.trim()) {
      setError('변경 사항 요약을 입력하세요.')
      return
    }

    setLoading(true)
    setError('')
    let shouldClose = false

    try {
      // 태그 사용 통계 업데이트
      if (formData.tags.length > 0 && clinicId) {
        await tagSuggestionService.updateTagStatistics(
          clinicId,
          formData.tags,
          formData.category_id
        )
      }

      const stepsHtml = serializeStepsToHtml(formData.steps || [])
      await onSubmit({
        ...formData,
        content: stepsHtml,
        steps: formData.steps
      })
      shouldClose = mode === 'create'
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : '저장 중 오류가 발생했습니다.'
      if (isMountedRef.current) {
        setError(errorMessage)
      }
      console.error('프로토콜 저장 오류:', err)
    } finally {
      if (isMountedRef.current) {
        setLoading(false)
      }
      if (shouldClose) {
        onCancel()
      }
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

            <div>
              <ProtocolStepsEditor
                steps={formData.steps || []}
                onChange={handleStepsChange}
                disabled={loading}
              />
            </div>

            {formData.steps && formData.steps.length > 0 && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                <h4 className="mb-3 text-sm font-semibold text-slate-700">미리보기</h4>
                <ProtocolStepViewer steps={formData.steps} />
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
