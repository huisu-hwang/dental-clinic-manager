'use client'

import { useState, useEffect } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent
} from '@dnd-kit/core'
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy
} from '@dnd-kit/sortable'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  PlusIcon,
  TrashIcon,
  DocumentDuplicateIcon,
  ChevronUpIcon,
  ChevronDownIcon,
  Bars3Icon
} from '@heroicons/react/24/outline'
import EnhancedTiptapEditor from './EnhancedTiptapEditor'
import type { ProtocolStep } from '@/types'

interface ProtocolStepsEditorProps {
  steps: ProtocolStep[]
  onChange: (steps: ProtocolStep[]) => void
  disabled?: boolean
}

interface SortableStepProps {
  step: ProtocolStep
  index: number
  onUpdate: (index: number, updatedStep: ProtocolStep) => void
  onDelete: (index: number) => void
  onDuplicate: (index: number) => void
  isExpanded: boolean
  onToggleExpand: (index: number) => void
  disabled?: boolean
}

function SortableStep({
  step,
  index,
  onUpdate,
  onDelete,
  onDuplicate,
  isExpanded,
  onToggleExpand,
  disabled
}: SortableStepProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({ id: step.id || `step-${index}` })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white border border-slate-200 rounded-lg ${isDragging ? 'shadow-lg' : 'shadow-sm'}`}
    >
      {/* 단계 헤더 */}
      <div className="flex items-center justify-between p-4 border-b border-slate-200">
        <div className="flex items-center gap-3 flex-1">
          {/* 드래그 핸들 */}
          <button
            type="button"
            className="cursor-move text-slate-400 hover:text-slate-600"
            {...attributes}
            {...listeners}
            disabled={disabled}
          >
            <Bars3Icon className="h-5 w-5" />
          </button>

          {/* 단계 번호 */}
          <span className="bg-blue-100 text-blue-800 text-sm font-semibold px-2 py-1 rounded">
            Step {index + 1}
          </span>

          {/* 단계 제목 */}
          <input
            type="text"
            value={step.title}
            onChange={(e) => onUpdate(index, { ...step, title: e.target.value })}
            placeholder="단계 제목을 입력하세요"
            className="flex-1 px-3 py-1 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            disabled={disabled}
          />

          {/* 선택사항 체크박스 */}
          <label className="flex items-center gap-2 text-sm text-slate-600">
            <input
              type="checkbox"
              checked={step.is_optional || false}
              onChange={(e) => onUpdate(index, { ...step, is_optional: e.target.checked })}
              className="rounded border-slate-300"
              disabled={disabled}
            />
            선택사항
          </label>
        </div>

        {/* 액션 버튼들 */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onToggleExpand(index)}
            className="p-1.5 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors"
            title={isExpanded ? '접기' : '펼치기'}
          >
            {isExpanded ? (
              <ChevronUpIcon className="h-4 w-4" />
            ) : (
              <ChevronDownIcon className="h-4 w-4" />
            )}
          </button>
          <button
            type="button"
            onClick={() => onDuplicate(index)}
            className="p-1.5 text-blue-500 hover:text-blue-700 hover:bg-blue-50 rounded transition-colors"
            title="복제"
            disabled={disabled}
          >
            <DocumentDuplicateIcon className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => onDelete(index)}
            className="p-1.5 text-red-500 hover:text-red-700 hover:bg-red-50 rounded transition-colors"
            title="삭제"
            disabled={disabled}
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* 단계 내용 */}
      {isExpanded && (
        <div className="p-4">
          <div className="mb-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              단계 상세 내용
            </label>
            <EnhancedTiptapEditor
              content={step.content}
              onChange={(content) => onUpdate(index, { ...step, content })}
              placeholder="이 단계의 상세 내용을 작성하세요..."
              editable={!disabled}
            />
          </div>

          {/* 참고 자료 (선택사항) */}
          <div className="mt-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              참고 자료 (선택사항)
            </label>
            <textarea
              value={step.reference_materials?.[0] || ''}
              onChange={(e) => onUpdate(index, {
                ...step,
                reference_materials: e.target.value ? [e.target.value] : []
              })}
              placeholder="추가 참고 자료나 링크를 입력하세요"
              className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              rows={2}
              disabled={disabled}
            />
          </div>
        </div>
      )}
    </div>
  )
}

export default function ProtocolStepsEditor({
  steps,
  onChange,
  disabled = false
}: ProtocolStepsEditorProps) {
  const [localSteps, setLocalSteps] = useState<ProtocolStep[]>(steps)
  const [expandedSteps, setExpandedSteps] = useState<Set<number>>(new Set([0])) // 첫 단계는 기본 펼침

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  )

  useEffect(() => {
    setLocalSteps(steps)
  }, [steps])

  // 단계 추가
  const addStep = () => {
    const newStep: ProtocolStep = {
      id: `new-${Date.now()}`,
      step_order: localSteps.length,
      title: '',
      content: '<p></p>',
      reference_materials: [],
      is_optional: false
    }
    const updatedSteps = [...localSteps, newStep]
    setLocalSteps(updatedSteps)
    onChange(updatedSteps)
    setExpandedSteps(prev => new Set([...prev, localSteps.length]))
  }

  // 단계 업데이트
  const updateStep = (index: number, updatedStep: ProtocolStep) => {
    const updatedSteps = [...localSteps]
    updatedSteps[index] = { ...updatedStep, step_order: index }
    setLocalSteps(updatedSteps)
    onChange(updatedSteps)
  }

  // 단계 삭제
  const deleteStep = (index: number) => {
    if (localSteps.length <= 1) {
      alert('최소 1개 이상의 단계가 필요합니다.')
      return
    }

    const updatedSteps = localSteps.filter((_, i) => i !== index)
      .map((step, i) => ({ ...step, step_order: i }))
    setLocalSteps(updatedSteps)
    onChange(updatedSteps)

    // 확장 상태도 업데이트
    const newExpanded = new Set<number>()
    expandedSteps.forEach(idx => {
      if (idx < index) newExpanded.add(idx)
      else if (idx > index) newExpanded.add(idx - 1)
    })
    setExpandedSteps(newExpanded)
  }

  // 단계 복제
  const duplicateStep = (index: number) => {
    const stepToDuplicate = localSteps[index]
    const duplicatedStep: ProtocolStep = {
      ...stepToDuplicate,
      id: `dup-${Date.now()}`,
      title: `${stepToDuplicate.title} (복사본)`,
      content: stepToDuplicate.content || '<p></p>',
      reference_materials: stepToDuplicate.reference_materials ?? [],
      step_order: index + 1
    }

    const updatedSteps = [
      ...localSteps.slice(0, index + 1),
      duplicatedStep,
      ...localSteps.slice(index + 1)
    ].map((step, i) => ({ ...step, step_order: i }))

    setLocalSteps(updatedSteps)
    onChange(updatedSteps)
    setExpandedSteps(prev => new Set([...prev, index + 1]))
  }

  // 단계 펼침/접기
  const toggleExpand = (index: number) => {
    setExpandedSteps(prev => {
      const newSet = new Set(prev)
      if (newSet.has(index)) {
        newSet.delete(index)
      } else {
        newSet.add(index)
      }
      return newSet
    })
  }

  // 드래그 종료 핸들러
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (active.id !== over?.id) {
      const oldIndex = localSteps.findIndex(step => (step.id || `step-${localSteps.indexOf(step)}`) === active.id)
      const newIndex = localSteps.findIndex(step => (step.id || `step-${localSteps.indexOf(step)}`) === over?.id)

      const reorderedSteps = arrayMove(localSteps, oldIndex, newIndex)
        .map((step, i) => ({ ...step, step_order: i }))

      setLocalSteps(reorderedSteps)
      onChange(reorderedSteps)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-slate-800">프로토콜 단계</h3>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setExpandedSteps(new Set(localSteps.map((_, i) => i)))}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            모두 펼치기
          </button>
          <button
            type="button"
            onClick={() => setExpandedSteps(new Set())}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            모두 접기
          </button>
        </div>
      </div>

      {localSteps.length === 0 ? (
        <div className="text-center py-12 bg-slate-50 rounded-lg border-2 border-dashed border-slate-300">
          <p className="text-slate-600 mb-4">아직 추가된 단계가 없습니다</p>
          <button
            type="button"
            onClick={addStep}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
            disabled={disabled}
          >
            <PlusIcon className="h-4 w-4 mr-2" />
            첫 단계 추가하기
          </button>
        </div>
      ) : (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={localSteps.map(step => step.id || `step-${localSteps.indexOf(step)}`)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-4">
              {localSteps.map((step, index) => (
                <SortableStep
                  key={step.id || `step-${index}`}
                  step={step}
                  index={index}
                  onUpdate={updateStep}
                  onDelete={deleteStep}
                  onDuplicate={duplicateStep}
                  isExpanded={expandedSteps.has(index)}
                  onToggleExpand={toggleExpand}
                  disabled={disabled}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}

      {localSteps.length > 0 && (
        <button
          type="button"
          onClick={addStep}
          className="w-full py-3 border-2 border-dashed border-slate-300 rounded-lg text-slate-600 hover:border-blue-400 hover:text-blue-600 transition-colors flex items-center justify-center"
          disabled={disabled}
        >
          <PlusIcon className="h-5 w-5 mr-2" />
          새 단계 추가
        </button>
      )}
    </div>
  )
}