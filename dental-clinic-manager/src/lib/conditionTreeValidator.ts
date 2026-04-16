/**
 * 조건 트리 검증 유틸
 *
 * 보안: 무한 중첩/과도한 조건으로 인한 DoS 방지
 * - 최대 중첩 깊이: 5
 * - 최대 조건 수 (leaf): 20
 * - 최대 JSON 크기: 10KB
 */

import type { ConditionNode, ConditionGroup, ConditionLeaf, ComparisonOperator } from '@/types/investment'

const MAX_DEPTH = 5
const MAX_LEAVES = 20
const MAX_JSON_SIZE_BYTES = 10240  // 10KB

const VALID_OPERATORS: ComparisonOperator[] = ['>', '<', '>=', '<=', '==', 'crossOver', 'crossUnder']
const VALID_REF_TYPES = ['indicator', 'constant']

interface ValidationResult {
  valid: boolean
  error?: string
}

/**
 * 조건 트리 전체 검증
 */
export function validateConditionTree(tree: unknown): ValidationResult {
  // 1. JSON 크기 검증
  const jsonStr = JSON.stringify(tree)
  if (jsonStr.length > MAX_JSON_SIZE_BYTES) {
    return { valid: false, error: `조건 트리가 너무 큽니다 (최대 ${MAX_JSON_SIZE_BYTES / 1024}KB)` }
  }

  // 2. 구조 검증
  if (!tree || typeof tree !== 'object') {
    return { valid: false, error: '조건 트리가 올바른 형식이 아닙니다' }
  }

  const node = tree as Record<string, unknown>

  // 빈 조건 허용 (초기 상태)
  if (Object.keys(node).length === 0) {
    return { valid: true }
  }

  // 3. 재귀적 구조 검증
  let leafCount = 0

  function validate(n: unknown, depth: number): string | null {
    if (depth > MAX_DEPTH) {
      return `조건 중첩이 너무 깊습니다 (최대 ${MAX_DEPTH}단계)`
    }

    if (!n || typeof n !== 'object') {
      return '조건 노드가 올바른 형식이 아닙니다'
    }

    const obj = n as Record<string, unknown>

    if (obj.type === 'leaf') {
      leafCount++
      if (leafCount > MAX_LEAVES) {
        return `조건이 너무 많습니다 (최대 ${MAX_LEAVES}개)`
      }
      return validateLeaf(obj)
    }

    if (obj.type === 'group') {
      return validateGroup(obj, depth)
    }

    return `알 수 없는 노드 타입: ${String(obj.type)}`
  }

  function validateLeaf(leaf: Record<string, unknown>): string | null {
    // left 검증
    const leftErr = validateRef(leaf.left, 'left')
    if (leftErr) return leftErr

    // operator 검증
    if (!VALID_OPERATORS.includes(leaf.operator as ComparisonOperator)) {
      return `잘못된 연산자: ${String(leaf.operator)}`
    }

    // right 검증
    const rightErr = validateRef(leaf.right, 'right')
    if (rightErr) return rightErr

    return null
  }

  function validateRef(ref: unknown, side: string): string | null {
    if (!ref || typeof ref !== 'object') {
      return `${side} 참조가 올바르지 않습니다`
    }
    const obj = ref as Record<string, unknown>

    if (!VALID_REF_TYPES.includes(obj.type as string)) {
      return `${side} 참조 타입이 올바르지 않습니다: ${String(obj.type)}`
    }

    if (obj.type === 'indicator') {
      if (typeof obj.id !== 'string' || obj.id.length === 0 || obj.id.length > 50) {
        return `${side} 지표 ID가 올바르지 않습니다`
      }
    }

    if (obj.type === 'constant') {
      if (typeof obj.value !== 'number' || !isFinite(obj.value)) {
        return `${side} 상수값이 올바르지 않습니다`
      }
    }

    return null
  }

  function validateGroup(group: Record<string, unknown>, depth: number): string | null {
    if (group.operator !== 'AND' && group.operator !== 'OR') {
      return `잘못된 그룹 연산자: ${String(group.operator)}`
    }

    if (!Array.isArray(group.conditions)) {
      return '조건 목록이 배열이 아닙니다'
    }

    if (group.conditions.length === 0) {
      return null  // 빈 그룹 허용
    }

    for (const child of group.conditions) {
      const err = validate(child, depth + 1)
      if (err) return err
    }

    return null
  }

  const error = validate(tree, 0)
  if (error) {
    return { valid: false, error }
  }

  return { valid: true }
}

/**
 * 지표 설정 배열 검증
 * - 최대 8개 지표
 */
export function validateIndicators(indicators: unknown): ValidationResult {
  if (!Array.isArray(indicators)) {
    return { valid: false, error: '지표 목록이 배열이 아닙니다' }
  }

  if (indicators.length > 8) {
    return { valid: false, error: '지표는 최대 8개까지 설정 가능합니다' }
  }

  for (const ind of indicators) {
    if (!ind || typeof ind !== 'object') {
      return { valid: false, error: '지표 설정이 올바르지 않습니다' }
    }
    const obj = ind as Record<string, unknown>
    if (typeof obj.id !== 'string' || typeof obj.type !== 'string') {
      return { valid: false, error: '지표 id 또는 type이 누락되었습니다' }
    }
    if (obj.params && typeof obj.params !== 'object') {
      return { valid: false, error: '지표 params가 올바르지 않습니다' }
    }
  }

  return { valid: true }
}
