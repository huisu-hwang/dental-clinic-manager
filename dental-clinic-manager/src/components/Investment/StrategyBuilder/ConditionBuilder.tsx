'use client'

import { Plus, X } from 'lucide-react'
import type {
  ConditionGroup, ConditionLeaf,
  IndicatorConfig, IndicatorRef, ConstantRef, ComparisonOperator,
} from '@/types/investment'

interface Props {
  label: string
  conditions: ConditionGroup
  onChange: (conditions: ConditionGroup) => void
  indicators: IndicatorConfig[]
}

const OPERATORS: { value: ComparisonOperator; label: string }[] = [
  { value: '>', label: '>' },
  { value: '<', label: '<' },
  { value: '>=', label: '>=' },
  { value: '<=', label: '<=' },
  { value: '==', label: '==' },
  { value: 'crossOver', label: '상향돌파' },
  { value: 'crossUnder', label: '하향돌파' },
]

/** 지표별 사용 가능한 속성 */
const INDICATOR_PROPERTIES: Record<string, string[]> = {
  MACD: ['macd', 'signal', 'histogram'],
  BB: ['upper', 'middle', 'lower'],
  STOCH: ['k', 'd'],
  ADX: ['adx', 'pdi', 'mdi'],
}

function getAvailableRefs(indicators: IndicatorConfig[]): { value: string; label: string; ref: IndicatorRef }[] {
  const refs: { value: string; label: string; ref: IndicatorRef }[] = []
  for (const ind of indicators) {
    const props = INDICATOR_PROPERTIES[ind.type]
    if (props) {
      for (const prop of props) {
        refs.push({
          value: `${ind.id}.${prop}`,
          label: `${ind.id}.${prop}`,
          ref: { type: 'indicator', id: ind.id, property: prop },
        })
      }
    } else {
      refs.push({
        value: ind.id,
        label: ind.id,
        ref: { type: 'indicator', id: ind.id },
      })
    }
  }
  return refs
}

function parseRefValue(value: string): IndicatorRef | ConstantRef {
  if (value.startsWith('const:')) {
    return { type: 'constant', value: parseFloat(value.slice(6)) || 0 }
  }
  const parts = value.split('.')
  if (parts.length === 2) {
    return { type: 'indicator', id: parts[0], property: parts[1] }
  }
  return { type: 'indicator', id: value }
}

function refToValue(ref: IndicatorRef | ConstantRef): string {
  if (ref.type === 'constant') return `const:${ref.value}`
  if (ref.property) return `${ref.id}.${ref.property}`
  return ref.id
}

export default function ConditionBuilder({ label, conditions, onChange, indicators }: Props) {
  const availableRefs = getAvailableRefs(indicators)

  const addLeaf = () => {
    if (indicators.length === 0) {
      alert('먼저 지표를 추가해주세요')
      return
    }
    const firstRef = availableRefs[0]?.ref || { type: 'indicator' as const, id: '' }
    const newLeaf: ConditionLeaf = {
      type: 'leaf',
      left: firstRef,
      operator: '>',
      right: { type: 'constant', value: 0 },
    }
    onChange({
      ...conditions,
      conditions: [...conditions.conditions, newLeaf],
    })
  }

  const removeCondition = (index: number) => {
    onChange({
      ...conditions,
      conditions: conditions.conditions.filter((_, i) => i !== index),
    })
  }

  const updateLeaf = (index: number, field: string, value: string) => {
    const updated = [...conditions.conditions]
    const leaf = updated[index] as ConditionLeaf
    if (!leaf || leaf.type !== 'leaf') return

    if (field === 'left') {
      leaf.left = parseRefValue(value)
    } else if (field === 'operator') {
      leaf.operator = value as ComparisonOperator
    } else if (field === 'right') {
      leaf.right = parseRefValue(value)
    } else if (field === 'rightConstant') {
      leaf.right = { type: 'constant', value: parseFloat(value) || 0 }
    }

    onChange({ ...conditions, conditions: updated })
  }

  const toggleOperator = () => {
    onChange({
      ...conditions,
      operator: conditions.operator === 'AND' ? 'OR' : 'AND',
    })
  }

  return (
    <div className="bg-at-surface rounded-2xl shadow-at-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold text-at-text">{label}</h2>
          <button
            onClick={toggleOperator}
            className="px-2 py-0.5 text-xs rounded-full font-mono font-bold transition-colors bg-at-accent-light text-at-accent hover:bg-at-accent hover:text-white"
          >
            {conditions.operator}
          </button>
        </div>
        <button
          onClick={addLeaf}
          className="flex items-center gap-1 px-3 py-1.5 text-sm bg-at-accent-light text-at-accent rounded-lg hover:bg-at-accent hover:text-white transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          조건 추가
        </button>
      </div>

      {conditions.conditions.length === 0 ? (
        <p className="text-sm text-at-text-weak text-center py-4">
          조건을 추가해주세요
        </p>
      ) : (
        <div className="space-y-2">
          {conditions.conditions.map((cond, index) => {
            if (cond.type !== 'leaf') return null
            const leaf = cond as ConditionLeaf
            const rightIsConstant = leaf.right.type === 'constant'

            return (
              <div key={index} className="flex items-center gap-2 p-3 rounded-xl bg-at-bg flex-wrap">
                {/* 좌항 */}
                <select
                  value={refToValue(leaf.left)}
                  onChange={e => updateLeaf(index, 'left', e.target.value)}
                  className="px-2 py-1.5 rounded-lg border border-at-border bg-at-surface text-at-text text-xs font-mono focus:outline-none focus:border-at-accent min-w-[100px]"
                >
                  {availableRefs.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>

                {/* 연산자 */}
                <select
                  value={leaf.operator}
                  onChange={e => updateLeaf(index, 'operator', e.target.value)}
                  className="px-2 py-1.5 rounded-lg border border-at-border bg-at-surface text-at-text text-xs font-mono focus:outline-none focus:border-at-accent"
                >
                  {OPERATORS.map(op => (
                    <option key={op.value} value={op.value}>{op.label}</option>
                  ))}
                </select>

                {/* 우항: 지표 또는 상수 토글 */}
                <div className="flex items-center gap-1">
                  <select
                    value={rightIsConstant ? 'constant' : 'indicator'}
                    onChange={e => {
                      if (e.target.value === 'constant') {
                        updateLeaf(index, 'rightConstant', '0')
                      } else if (availableRefs[0]) {
                        updateLeaf(index, 'right', availableRefs[0].value)
                      }
                    }}
                    className="px-1.5 py-1.5 rounded-lg border border-at-border bg-at-surface text-at-text text-xs focus:outline-none focus:border-at-accent"
                  >
                    <option value="indicator">지표</option>
                    <option value="constant">상수</option>
                  </select>

                  {rightIsConstant ? (
                    <input
                      type="number"
                      value={(leaf.right as ConstantRef).value}
                      onChange={e => updateLeaf(index, 'rightConstant', e.target.value)}
                      className="w-20 px-2 py-1.5 rounded-lg border border-at-border bg-at-surface text-at-text text-xs font-mono text-center focus:outline-none focus:border-at-accent"
                      step="any"
                    />
                  ) : (
                    <select
                      value={refToValue(leaf.right)}
                      onChange={e => updateLeaf(index, 'right', e.target.value)}
                      className="px-2 py-1.5 rounded-lg border border-at-border bg-at-surface text-at-text text-xs font-mono focus:outline-none focus:border-at-accent min-w-[100px]"
                    >
                      {availableRefs.map(r => (
                        <option key={r.value} value={r.value}>{r.label}</option>
                      ))}
                    </select>
                  )}
                </div>

                {/* 삭제 */}
                <button
                  onClick={() => removeCondition(index)}
                  className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/20 text-red-400 transition-colors ml-auto"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            )
          })}
        </div>
      )}

      {conditions.conditions.length > 1 && (
        <p className="text-xs text-at-text-weak mt-2 text-center">
          위 조건들이 모두 {conditions.operator === 'AND' ? '만족' : '하나라도 만족'}해야 신호 발생
        </p>
      )}
    </div>
  )
}
