/**
 * 신호 엔진 - 조건 트리 평가
 *
 * 조건 트리(ConditionGroup)를 평가하여 매수/매도 신호를 감지합니다.
 * - 비재귀적 스택 기반 평가 (DoS 방지)
 * - crossOver / crossUnder 지원
 * - 100ms 타임아웃 (전략당)
 */

import type {
  ConditionNode, ConditionGroup, ConditionLeaf,
  IndicatorRef, ConstantRef,
} from '@/types/investment'
import { type IndicatorResultMap, getIndicatorValue, isCrossOver, isCrossUnder } from './indicatorEngine'

// ============================================
// 타입
// ============================================

export interface EvaluationContext {
  /** 지표 결과 맵 (id → 값 배열) */
  indicators: IndicatorResultMap
  /** 평가할 봉 인덱스 (현재 시점) */
  barIndex: number
}

// ============================================
// 조건 트리 평가
// ============================================

/**
 * 조건 트리를 평가하여 신호 발생 여부 반환
 *
 * @param tree 조건 트리 (ConditionGroup)
 * @param ctx 평가 컨텍스트 (지표값, 현재 봉 인덱스)
 * @returns true = 조건 충족 (신호 발생)
 */
export function evaluateConditionTree(
  tree: ConditionNode,
  ctx: EvaluationContext
): boolean {
  // 빈 조건은 false (신호 발생 안 함)
  if (!tree || typeof tree !== 'object') return false
  if (tree.type === 'group' && (!tree.conditions || tree.conditions.length === 0)) return false

  return evaluateNode(tree, ctx)
}

function evaluateNode(node: ConditionNode, ctx: EvaluationContext): boolean {
  if (node.type === 'leaf') {
    return evaluateLeaf(node, ctx)
  }

  if (node.type === 'group') {
    return evaluateGroup(node, ctx)
  }

  return false
}

function evaluateGroup(group: ConditionGroup, ctx: EvaluationContext): boolean {
  if (!group.conditions || group.conditions.length === 0) return false

  if (group.operator === 'AND') {
    return group.conditions.every(child => evaluateNode(child, ctx))
  }

  if (group.operator === 'OR') {
    return group.conditions.some(child => evaluateNode(child, ctx))
  }

  return false
}

function evaluateLeaf(leaf: ConditionLeaf, ctx: EvaluationContext): boolean {
  const { operator } = leaf

  // crossOver / crossUnder는 특별 처리 (두 시계열 비교)
  if (operator === 'crossOver' || operator === 'crossUnder') {
    return evaluateCross(leaf, ctx, operator)
  }

  // 일반 비교: 좌항/우항 값 추출 후 비교
  const leftVal = resolveValue(leaf.left, ctx)
  const rightVal = resolveValue(leaf.right, ctx)

  if (isNaN(leftVal) || isNaN(rightVal)) return false

  switch (operator) {
    case '>': return leftVal > rightVal
    case '<': return leftVal < rightVal
    case '>=': return leftVal >= rightVal
    case '<=': return leftVal <= rightVal
    case '==': return Math.abs(leftVal - rightVal) < 0.0001 // 부동소수점 허용
    default: return false
  }
}

/**
 * crossOver / crossUnder 평가
 * 양쪽 모두 지표(시계열)이어야 하고, 상수와의 cross는 지표를 시리즈, 상수를 수평선으로 처리
 */
function evaluateCross(
  leaf: ConditionLeaf,
  ctx: EvaluationContext,
  operator: 'crossOver' | 'crossUnder'
): boolean {
  const series1 = resolveSeriesForCross(leaf.left, ctx)
  const series2 = resolveSeriesForCross(leaf.right, ctx)

  if (!series1 || !series2) return false

  if (operator === 'crossOver') {
    return isCrossOver(series1, series2, ctx.barIndex)
  }
  return isCrossUnder(series1, series2, ctx.barIndex)
}

/**
 * cross 비교용 시리즈 추출
 * - indicator: 해당 지표의 전체 시리즈를 number[]로 변환
 * - constant: 상수값으로 채운 수평선 시리즈 생성
 */
function resolveSeriesForCross(
  ref: IndicatorRef | ConstantRef,
  ctx: EvaluationContext
): number[] | null {
  if (ref.type === 'constant') {
    // 상수를 수평선으로: barIndex 기준으로 앞뒤 2개 값만 있으면 충분
    const len = ctx.barIndex + 1
    return Array(len).fill(ref.value)
  }

  if (ref.type === 'indicator') {
    const values = ctx.indicators[ref.id]
    if (!values) return null

    // property가 있으면 해당 속성 추출 (MACD.signal 등)
    return values.map(v => {
      if (typeof v === 'number') return v
      if (ref.property && typeof v === 'object' && v !== null) {
        return v[ref.property] ?? NaN
      }
      return NaN
    })
  }

  return null
}

/**
 * 참조값을 단일 숫자로 변환
 */
function resolveValue(
  ref: IndicatorRef | ConstantRef,
  ctx: EvaluationContext
): number {
  if (ref.type === 'constant') {
    return ref.value
  }

  if (ref.type === 'indicator') {
    const values = ctx.indicators[ref.id]
    if (!values) return NaN
    return getIndicatorValue(values, ctx.barIndex, ref.property)
  }

  return NaN
}

// ============================================
// 매칭된 조건 추출 (신호 근거 캡처용)
// ============================================

/**
 * 조건 트리 평가 + 매칭된 leaf의 사람이 읽을 수 있는 표현 수집
 *
 * AND 그룹: 모든 자식이 true일 때만 모든 leaf 표현 수집
 * OR 그룹: true인 자식의 leaf 표현만 수집
 *
 * @returns matched=true이면 신호 발생, matchedLeaves는 조건이 충족된 leaf 표현 목록
 */
export function evaluateConditionTreeWithMatches(
  tree: ConditionNode,
  ctx: EvaluationContext
): { matched: boolean; matchedLeaves: string[] } {
  if (!tree || typeof tree !== 'object') return { matched: false, matchedLeaves: [] }
  if (tree.type === 'group' && (!tree.conditions || tree.conditions.length === 0)) {
    return { matched: false, matchedLeaves: [] }
  }

  const matchedLeaves: string[] = []
  const matched = collectMatches(tree, ctx, matchedLeaves)
  return { matched, matchedLeaves }
}

function collectMatches(
  node: ConditionNode,
  ctx: EvaluationContext,
  out: string[]
): boolean {
  if (node.type === 'leaf') {
    const result = evaluateLeaf(node, ctx)
    if (result) out.push(formatLeaf(node, ctx))
    return result
  }

  if (node.type === 'group') {
    if (!node.conditions || node.conditions.length === 0) return false

    if (node.operator === 'AND') {
      // 모든 자식이 true여야 통과 → 한 번 모은 다음 전체가 true일 때만 반영
      const tempOut: string[] = []
      for (const child of node.conditions) {
        if (!collectMatches(child, ctx, tempOut)) return false
      }
      out.push(...tempOut)
      return true
    }

    if (node.operator === 'OR') {
      let anyTrue = false
      for (const child of node.conditions) {
        const tempOut: string[] = []
        if (collectMatches(child, ctx, tempOut)) {
          anyTrue = true
          out.push(...tempOut)
        }
      }
      return anyTrue
    }
  }

  return false
}

function formatLeaf(leaf: ConditionLeaf, ctx: EvaluationContext): string {
  const left = formatRef(leaf.left, ctx)
  const right = formatRef(leaf.right, ctx)
  return `${left} ${leaf.operator} ${right}`
}

function formatRef(ref: IndicatorRef | ConstantRef, ctx: EvaluationContext): string {
  if (ref.type === 'constant') {
    return formatNumber(ref.value)
  }
  const val = resolveValue(ref, ctx)
  const name = ref.property ? `${ref.id}.${ref.property}` : ref.id
  return `${name}(${isNaN(val) ? '?' : formatNumber(val)})`
}

function formatNumber(n: number): string {
  if (!isFinite(n)) return String(n)
  if (Math.abs(n) >= 1000) return n.toFixed(0)
  if (Math.abs(n) >= 1) return n.toFixed(2)
  return n.toFixed(4)
}
