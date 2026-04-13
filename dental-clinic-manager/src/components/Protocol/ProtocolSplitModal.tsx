'use client'

import { useState, useMemo } from 'react'
import {
  XMarkIcon,
  ScissorsIcon,
  PlusIcon,
  TrashIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  CheckIcon,
} from '@heroicons/react/24/outline'
import type { Protocol, ProtocolStep, ProtocolFormData } from '@/types'

// 분할 그룹 (섹션별 분할 모드에서 사용)
interface SplitGroup {
  id: string
  title: string
  stepIndices: number[] // 원본 steps 배열의 인덱스
}

// 분할 결과 미리보기 아이템
interface SplitPreviewItem {
  title: string
  steps: ProtocolStep[]
}

type SplitMode = 'individual' | 'section'

interface ProtocolSplitModalProps {
  protocol: Protocol
  onSplit: (splitItems: ProtocolFormData[], archiveOriginal: boolean) => Promise<void>
  onClose: () => void
}

export default function ProtocolSplitModal({
  protocol,
  onSplit,
  onClose,
}: ProtocolSplitModalProps) {
  const steps = protocol.currentVersion?.steps || []
  const [mode, setMode] = useState<SplitMode>('section')
  const [groups, setGroups] = useState<SplitGroup[]>(() => {
    // 기본: 모든 스텝을 하나의 그룹으로
    if (steps.length === 0) return []
    return [{
      id: crypto.randomUUID(),
      title: `${protocol.title} (1)`,
      stepIndices: steps.map((_, i) => i),
    }]
  })
  const [archiveOriginal, setArchiveOriginal] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // 개별 분할 모드: 각 스텝의 제목 편집
  const [individualTitles, setIndividualTitles] = useState<string[]>(() =>
    steps.map((step, i) => `${protocol.title} - ${step.title || `단계 ${i + 1}`}`)
  )

  // 미할당 스텝 인덱스
  const assignedIndices = useMemo(() => {
    const set = new Set<number>()
    groups.forEach(g => g.stepIndices.forEach(i => set.add(i)))
    return set
  }, [groups])

  const unassignedIndices = useMemo(() => {
    return steps.map((_, i) => i).filter(i => !assignedIndices.has(i))
  }, [steps, assignedIndices])

  // 분할 결과 미리보기
  const previewItems: SplitPreviewItem[] = useMemo(() => {
    if (mode === 'individual') {
      return steps.map((step, i) => ({
        title: individualTitles[i],
        steps: [{ ...step, step_order: 1 }],
      }))
    }
    // 섹션 모드
    return groups
      .filter(g => g.stepIndices.length > 0)
      .map(g => ({
        title: g.title,
        steps: g.stepIndices
          .sort((a, b) => a - b)
          .map((idx, order) => ({ ...steps[idx], step_order: order + 1 })),
      }))
  }, [mode, steps, groups, individualTitles])

  // 새 그룹 추가
  const addGroup = () => {
    const newIndex = groups.length + 1
    setGroups(prev => [
      ...prev,
      {
        id: crypto.randomUUID(),
        title: `${protocol.title} (${newIndex})`,
        stepIndices: [],
      },
    ])
  }

  // 그룹 삭제
  const removeGroup = (groupId: string) => {
    setGroups(prev => prev.filter(g => g.id !== groupId))
  }

  // 그룹 제목 변경
  const updateGroupTitle = (groupId: string, title: string) => {
    setGroups(prev => prev.map(g => g.id === groupId ? { ...g, title } : g))
  }

  // 스텝을 그룹에 추가
  const addStepToGroup = (groupId: string, stepIndex: number) => {
    setGroups(prev => prev.map(g => {
      if (g.id !== groupId) return g
      if (g.stepIndices.includes(stepIndex)) return g
      return { ...g, stepIndices: [...g.stepIndices, stepIndex].sort((a, b) => a - b) }
    }))
  }

  // 스텝을 그룹에서 제거
  const removeStepFromGroup = (groupId: string, stepIndex: number) => {
    setGroups(prev => prev.map(g => {
      if (g.id !== groupId) return g
      return { ...g, stepIndices: g.stepIndices.filter(i => i !== stepIndex) }
    }))
  }

  // 미할당 스텝을 모두 새 그룹에 배정
  const assignAllUnassigned = () => {
    if (unassignedIndices.length === 0) return
    setGroups(prev => [
      ...prev,
      {
        id: crypto.randomUUID(),
        title: `${protocol.title} (${prev.length + 1})`,
        stepIndices: [...unassignedIndices],
      },
    ])
  }

  // 개별 분할: 스텝별로 자동 그룹 생성
  const splitAllIndividually = () => {
    setMode('individual')
  }

  // 분할 실행
  const handleSplit = async () => {
    if (previewItems.length < 2) {
      setError('최소 2개 이상의 프로토콜로 분할해야 합니다.')
      return
    }

    // 제목 중복 체크
    const titles = previewItems.map(p => p.title.trim())
    if (titles.some(t => !t)) {
      setError('모든 프로토콜의 제목을 입력해주세요.')
      return
    }

    setError('')
    setSubmitting(true)

    try {
      const splitFormData: ProtocolFormData[] = previewItems.map(item => ({
        title: item.title.trim(),
        category_id: protocol.category_id,
        clinic_id: protocol.clinic_id,
        content: '',
        status: 'draft' as const,
        tags: [...(protocol.tags || [])],
        change_summary: `"${protocol.title}" 프로토콜에서 분할됨`,
        change_type: 'major' as const,
        steps: item.steps,
      }))

      await onSplit(splitFormData, archiveOriginal)
    } catch (err) {
      console.error('프로토콜 분할 오류:', err)
      setError(err instanceof Error ? err.message : '프로토콜 분할 중 오류가 발생했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  if (steps.length < 2) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
        <div className="bg-white rounded-2xl shadow-at-card max-w-md w-full p-6">
          <h3 className="text-lg font-bold text-at-text mb-3">분할 불가</h3>
          <p className="text-at-text-secondary mb-4">
            프로토콜을 분할하려면 최소 2개 이상의 단계가 필요합니다.
            현재 {steps.length}개의 단계가 있습니다.
          </p>
          <button
            onClick={onClose}
            className="w-full px-4 py-2 bg-at-accent text-white rounded-xl hover:bg-at-accent-hover"
          >
            닫기
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-at-card max-w-4xl w-full my-8 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-at-border flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-orange-50 rounded-xl flex items-center justify-center">
              <ScissorsIcon className="w-5 h-5 text-orange-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-at-text">프로토콜 분할</h2>
              <p className="text-sm text-at-text-weak">{protocol.title} ({steps.length}단계)</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 text-at-text-weak hover:text-at-text-secondary">
            <XMarkIcon className="h-6 w-6" />
          </button>
        </div>

        {/* Mode Toggle */}
        <div className="px-5 pt-4 flex-shrink-0">
          <div className="flex bg-at-surface-alt rounded-xl p-1 gap-1">
            <button
              onClick={() => setMode('section')}
              className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                mode === 'section'
                  ? 'bg-white text-at-accent shadow-sm'
                  : 'text-at-text-secondary hover:text-at-text'
              }`}
            >
              섹션별 분할
            </button>
            <button
              onClick={() => setMode('individual')}
              className={`flex-1 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                mode === 'individual'
                  ? 'bg-white text-at-accent shadow-sm'
                  : 'text-at-text-secondary hover:text-at-text'
              }`}
            >
              개별 분할
            </button>
          </div>
        </div>

        {/* 안내문 */}
        <div className="px-5 pt-3 flex-shrink-0">
          {mode === 'section' ? (
            <div className="bg-at-tag border border-at-accent/20 rounded-xl p-3">
              <p className="text-sm font-semibold text-at-text mb-1">섹션별 분할 안내</p>
              <ol className="text-xs text-at-text-secondary space-y-0.5 list-decimal list-inside">
                <li><strong>&quot;새 그룹 추가&quot;</strong> 버튼으로 분할할 프로토콜 그룹을 만드세요.</li>
                <li>각 그룹에 원하는 단계들을 <strong>추가</strong>하여 묶으세요.</li>
                <li>그룹 제목을 수정하면 새 프로토콜의 제목이 됩니다.</li>
                <li>최소 <strong>2개 이상의 그룹</strong>으로 나누어야 분할할 수 있습니다.</li>
              </ol>
            </div>
          ) : (
            <div className="bg-at-tag border border-at-accent/20 rounded-xl p-3">
              <p className="text-sm font-semibold text-at-text mb-1">개별 분할 안내</p>
              <ol className="text-xs text-at-text-secondary space-y-0.5 list-decimal list-inside">
                <li>각 단계가 <strong>독립된 프로토콜</strong>로 자동 분할됩니다.</li>
                <li>각 프로토콜의 <strong>제목을 자유롭게 수정</strong>할 수 있습니다.</li>
                <li>분할된 프로토콜은 <strong>초안(draft)</strong> 상태로 생성되며, 원본의 카테고리와 태그가 유지됩니다.</li>
              </ol>
            </div>
          )}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {mode === 'section' ? (
            /* 섹션별 분할 모드 */
            <div className="space-y-4">
              {/* 미할당 스텝 */}
              {unassignedIndices.length > 0 && (
                <div className="border border-amber-200 bg-at-warning-bg rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-semibold text-amber-800">
                      미할당 단계 ({unassignedIndices.length})
                    </h4>
                    <button
                      onClick={assignAllUnassigned}
                      className="text-xs px-2.5 py-1 bg-amber-100 text-amber-700 rounded-lg hover:bg-amber-200 transition-colors"
                    >
                      새 그룹으로 모두 이동
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {unassignedIndices.map(idx => (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 bg-white border border-amber-200 rounded-lg text-xs text-at-text-secondary"
                      >
                        <span className="font-semibold text-at-warning">Step {idx + 1}</span>
                        <span className="truncate max-w-[120px]">{steps[idx].title || `단계 ${idx + 1}`}</span>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* 그룹 목록 */}
              {groups.map((group, groupIndex) => (
                <div key={group.id} className="border border-at-border rounded-xl">
                  {/* 그룹 헤더 */}
                  <div className="flex items-center gap-3 px-4 py-3 bg-at-surface-alt border-b border-at-border rounded-t-xl">
                    <span className="text-sm font-bold text-at-accent flex-shrink-0">
                      프로토콜 {groupIndex + 1}
                    </span>
                    <input
                      type="text"
                      value={group.title}
                      onChange={e => updateGroupTitle(group.id, e.target.value)}
                      className="flex-1 px-2 py-1 text-sm border border-at-border rounded-lg focus:ring-at-accent focus:border-at-accent"
                      placeholder="프로토콜 제목 입력"
                    />
                    {groups.length > 1 && (
                      <button
                        onClick={() => removeGroup(group.id)}
                        className="p-1 text-at-error hover:bg-at-error-bg rounded-lg"
                        title="그룹 삭제"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* 그룹 내 스텝 */}
                  <div className="p-3 space-y-1.5">
                    {group.stepIndices.length === 0 ? (
                      <p className="text-xs text-at-text-weak text-center py-4">
                        아래에서 단계를 선택하여 추가하세요
                      </p>
                    ) : (
                      group.stepIndices.sort((a, b) => a - b).map(idx => (
                        <div
                          key={idx}
                          className="flex items-center gap-2 px-3 py-2 bg-at-tag border border-at-accent/20 rounded-lg"
                        >
                          <span className="text-xs font-semibold text-at-accent flex-shrink-0">
                            Step {idx + 1}
                          </span>
                          <span className="text-sm text-at-text-secondary truncate flex-1">
                            {steps[idx].title || `단계 ${idx + 1}`}
                          </span>
                          {steps[idx].is_optional && (
                            <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded-full flex-shrink-0">
                              선택
                            </span>
                          )}
                          <button
                            onClick={() => removeStepFromGroup(group.id, idx)}
                            className="p-0.5 text-at-text-weak hover:text-at-error"
                            title="제거"
                          >
                            <XMarkIcon className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))
                    )}

                    {/* 미할당 스텝 추가 드롭다운 */}
                    {unassignedIndices.length > 0 && (
                      <div className="pt-2 border-t border-at-border">
                        <p className="text-xs text-at-text-weak mb-1.5">단계 추가:</p>
                        <div className="flex flex-wrap gap-1.5">
                          {unassignedIndices.map(idx => (
                            <button
                              key={idx}
                              onClick={() => addStepToGroup(group.id, idx)}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs bg-white border border-at-border rounded-lg hover:border-at-accent hover:bg-at-accent-light transition-colors"
                            >
                              <PlusIcon className="w-3 h-3 text-at-accent" />
                              <span className="font-medium text-at-accent">Step {idx + 1}</span>
                              <span className="text-at-text-weak truncate max-w-[80px]">{steps[idx].title}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {/* 그룹 추가 버튼 */}
              <button
                onClick={addGroup}
                className="flex items-center justify-center gap-2 w-full px-4 py-3 border-2 border-dashed border-at-border rounded-xl text-sm text-at-text-secondary hover:border-at-accent hover:text-at-accent hover:bg-at-accent-light/30 transition-colors"
              >
                <PlusIcon className="w-4 h-4" />
                새 그룹 추가
              </button>
            </div>
          ) : (
            /* 개별 분할 모드 */
            <div className="space-y-3">
              {steps.map((step, i) => (
                <div key={i} className="border border-at-border rounded-xl p-3">
                  <div className="flex items-start gap-3">
                    <span className="text-xs font-bold text-at-accent bg-at-tag px-2 py-1 rounded-lg flex-shrink-0 mt-0.5">
                      Step {i + 1}
                    </span>
                    <div className="flex-1 space-y-2">
                      <input
                        type="text"
                        value={individualTitles[i]}
                        onChange={e => {
                          const newTitles = [...individualTitles]
                          newTitles[i] = e.target.value
                          setIndividualTitles(newTitles)
                        }}
                        className="w-full px-2 py-1.5 text-sm border border-at-border rounded-lg focus:ring-at-accent focus:border-at-accent"
                        placeholder="프로토콜 제목"
                      />
                      <p className="text-xs text-at-text-weak truncate">
                        원본 단계: {step.title || `단계 ${i + 1}`}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 옵션 */}
          <div className="border-t border-at-border pt-4">
            <label className="flex items-center gap-3 cursor-pointer">
              <div
                className={`w-5 h-5 rounded-lg border-2 flex items-center justify-center transition-colors ${
                  archiveOriginal
                    ? 'bg-at-accent border-at-accent'
                    : 'border-at-border bg-white'
                }`}
                onClick={() => setArchiveOriginal(!archiveOriginal)}
              >
                {archiveOriginal && <CheckIcon className="w-3.5 h-3.5 text-white" />}
              </div>
              <div>
                <span className="text-sm font-medium text-at-text-secondary">원본 프로토콜 보관처리</span>
                <p className="text-xs text-at-text-weak">분할 후 원본 프로토콜을 &quot;보관됨&quot; 상태로 변경합니다.</p>
              </div>
            </label>
          </div>

          {/* 미리보기 요약 */}
          <div className="bg-at-surface-alt rounded-xl p-4 border border-at-border">
            <h4 className="text-sm font-semibold text-at-text-secondary mb-2">분할 결과 미리보기</h4>
            {previewItems.length === 0 ? (
              <p className="text-xs text-at-text-weak">분할할 그룹을 설정해주세요.</p>
            ) : (
              <div className="space-y-2">
                {previewItems.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 text-sm">
                    <span className="font-bold text-at-accent flex-shrink-0">{i + 1}.</span>
                    <span className="text-at-text-secondary truncate">{item.title}</span>
                    <span className="text-xs text-at-text-weak flex-shrink-0">({item.steps.length}단계)</span>
                  </div>
                ))}
                <div className="pt-2 border-t border-at-border text-xs text-at-text-weak">
                  총 {previewItems.length}개의 새 프로토콜이 생성됩니다.
                  {archiveOriginal && ' 원본은 보관처리됩니다.'}
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="bg-at-error-bg border border-red-200 text-at-error px-4 py-3 rounded-xl text-sm">
              {error}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-5 border-t border-at-border flex-shrink-0">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-at-text-secondary bg-white border border-at-border rounded-xl hover:bg-at-surface-hover disabled:opacity-50"
          >
            취소
          </button>
          <button
            onClick={handleSplit}
            disabled={submitting || previewItems.length < 2}
            className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-xl hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent"></div>
                분할 중...
              </>
            ) : (
              <>
                <ScissorsIcon className="w-4 h-4" />
                {previewItems.length}개로 분할
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
