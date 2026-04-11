'use client'

import { useState, useCallback, useRef } from 'react'

// ============================================
// 인터랙티브 치아 차트 (FDI 번호 체계)
// 클릭 또는 드래그로 시술 부위 선택
// ============================================

interface ToothChartProps {
  selectedTeeth: number[]
  onChange: (teeth: number[]) => void
  disabled?: boolean
}

// FDI 치아 번호 체계
// 상악 우측: 18-11 / 상악 좌측: 21-28
// 하악 우측: 48-41 / 하악 좌측: 31-38
const UPPER_RIGHT = [18, 17, 16, 15, 14, 13, 12, 11]
const UPPER_LEFT = [21, 22, 23, 24, 25, 26, 27, 28]
const LOWER_RIGHT = [48, 47, 46, 45, 44, 43, 42, 41]
const LOWER_LEFT = [31, 32, 33, 34, 35, 36, 37, 38]

// 치아 이름 매핑
const TOOTH_NAMES: Record<number, string> = {
  // 상악 우측
  18: '상악 우측 제3대구치', 17: '상악 우측 제2대구치', 16: '상악 우측 제1대구치',
  15: '상악 우측 제2소구치', 14: '상악 우측 제1소구치', 13: '상악 우측 견치',
  12: '상악 우측 측절치', 11: '상악 우측 중절치',
  // 상악 좌측
  21: '상악 좌측 중절치', 22: '상악 좌측 측절치', 23: '상악 좌측 견치',
  24: '상악 좌측 제1소구치', 25: '상악 좌측 제2소구치', 26: '상악 좌측 제1대구치',
  27: '상악 좌측 제2대구치', 28: '상악 좌측 제3대구치',
  // 하악 좌측
  31: '하악 좌측 중절치', 32: '하악 좌측 측절치', 33: '하악 좌측 견치',
  34: '하악 좌측 제1소구치', 35: '하악 좌측 제2소구치', 36: '하악 좌측 제1대구치',
  37: '하악 좌측 제2대구치', 38: '하악 좌측 제3대구치',
  // 하악 우측
  41: '하악 우측 중절치', 42: '하악 우측 측절치', 43: '하악 우측 견치',
  44: '하악 우측 제1소구치', 45: '하악 우측 제2소구치', 46: '하악 우측 제1대구치',
  47: '하악 우측 제2대구치', 48: '하악 우측 제3대구치',
}

// 치아 모양 SVG path (간략화된 치아 아웃라인)
// 구치(어금니), 소구치, 견치, 절치별로 다른 모양
function getToothPath(num: number, isUpper: boolean): string {
  const toothNum = num % 10 // 1-8
  if (toothNum >= 6) {
    // 대구치 (넓고 큰 사각형)
    return isUpper
      ? 'M4,2 C4,0 28,0 28,2 L30,14 C30,18 2,18 2,14 Z'
      : 'M2,2 C2,-1 30,-1 30,2 L28,14 C28,18 4,18 4,14 Z'
  }
  if (toothNum >= 4) {
    // 소구치 (중간 크기)
    return isUpper
      ? 'M6,2 C6,0 26,0 26,2 L27,14 C27,17 5,17 5,14 Z'
      : 'M5,2 C5,0 27,0 27,2 L26,14 C26,17 6,17 6,14 Z'
  }
  if (toothNum === 3) {
    // 견치 (뾰족한 형태)
    return isUpper
      ? 'M8,1 C8,0 24,0 24,1 L26,10 C26,17 6,17 6,10 Z'
      : 'M6,1 C6,-1 26,-1 26,1 L24,10 C24,17 8,17 8,10 Z'
  }
  // 절치 (좁고 긴 형태)
  return isUpper
    ? 'M9,1 C9,0 23,0 23,1 L24,12 C24,16 8,16 8,12 Z'
    : 'M8,2 C8,0 24,0 24,2 L23,12 C23,16 9,16 9,12 Z'
}

// 개별 치아 컴포넌트
function Tooth({
  num,
  isUpper,
  isSelected,
  onMouseDown,
  onMouseEnter,
  disabled,
}: {
  num: number
  isUpper: boolean
  isSelected: boolean
  onMouseDown: (num: number) => void
  onMouseEnter: (num: number) => void
  disabled?: boolean
}) {
  const path = getToothPath(num, isUpper)

  return (
    <g
      onMouseDown={(e) => {
        e.preventDefault()
        if (!disabled) onMouseDown(num)
      }}
      onMouseEnter={() => {
        if (!disabled) onMouseEnter(num)
      }}
      className={disabled ? 'cursor-not-allowed' : 'cursor-pointer'}
    >
      <path
        d={path}
        fill={isSelected ? '#818cf8' : '#f1f5f9'}
        stroke={isSelected ? '#4f46e5' : '#cbd5e1'}
        strokeWidth={isSelected ? 1.5 : 1}
        className="transition-colors duration-150"
      />
      <text
        x="16"
        y={isUpper ? '24' : '-4'}
        textAnchor="middle"
        fontSize="7"
        fill={isSelected ? '#4f46e5' : '#94a3b8'}
        fontWeight={isSelected ? 600 : 400}
        className="select-none pointer-events-none"
      >
        {num}
      </text>
    </g>
  )
}

export default function ToothChart({ selectedTeeth, onChange, disabled }: ToothChartProps) {
  const [isDragging, setIsDragging] = useState(false)
  const dragModeRef = useRef<'select' | 'deselect'>('select')
  const [hoveredTooth, setHoveredTooth] = useState<number | null>(null)

  const toggleTooth = useCallback(
    (num: number) => {
      if (selectedTeeth.includes(num)) {
        onChange(selectedTeeth.filter((t) => t !== num))
      } else {
        onChange([...selectedTeeth, num])
      }
    },
    [selectedTeeth, onChange]
  )

  const handleMouseDown = useCallback(
    (num: number) => {
      setIsDragging(true)
      // 드래그 시작 시: 이미 선택된 치아면 해제 모드, 아니면 선택 모드
      const isCurrentlySelected = selectedTeeth.includes(num)
      dragModeRef.current = isCurrentlySelected ? 'deselect' : 'select'
      toggleTooth(num)
    },
    [selectedTeeth, toggleTooth]
  )

  const handleMouseEnter = useCallback(
    (num: number) => {
      setHoveredTooth(num)
      if (!isDragging) return
      const isCurrentlySelected = selectedTeeth.includes(num)
      if (dragModeRef.current === 'select' && !isCurrentlySelected) {
        onChange([...selectedTeeth, num])
      } else if (dragModeRef.current === 'deselect' && isCurrentlySelected) {
        onChange(selectedTeeth.filter((t) => t !== num))
      }
    },
    [isDragging, selectedTeeth, onChange]
  )

  const handleMouseUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  const clearAll = () => onChange([])

  // 영역별 빠른 선택
  const selectRegion = (teeth: number[]) => {
    const allSelected = teeth.every((t) => selectedTeeth.includes(t))
    if (allSelected) {
      onChange(selectedTeeth.filter((t) => !teeth.includes(t)))
    } else {
      const newTeeth = new Set([...selectedTeeth, ...teeth])
      onChange(Array.from(newTeeth))
    }
  }

  // 치아 행 렌더링
  const renderRow = (teeth: number[], isUpper: boolean) => (
    <g>
      {teeth.map((num, i) => (
        <g key={num} transform={`translate(${i * 36}, 0)`}>
          <Tooth
            num={num}
            isUpper={isUpper}
            isSelected={selectedTeeth.includes(num)}
            onMouseDown={handleMouseDown}
            onMouseEnter={handleMouseEnter}
            disabled={disabled}
          />
        </g>
      ))}
    </g>
  )

  const selectedNames = selectedTeeth
    .sort((a, b) => a - b)
    .map((t) => `#${t}`)
    .join(', ')

  return (
    <div
      className="space-y-3"
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-at-text-secondary">시술 부위</h4>
        <div className="flex items-center gap-2">
          {selectedTeeth.length > 0 && (
            <button
              type="button"
              onClick={clearAll}
              disabled={disabled}
              className="text-xs text-red-400 hover:text-at-error transition-colors disabled:opacity-50"
            >
              초기화
            </button>
          )}
        </div>
      </div>

      {/* 영역 빠른 선택 버튼 */}
      <div className="flex flex-wrap gap-1.5">
        {[
          { label: '상악 우측', teeth: UPPER_RIGHT },
          { label: '상악 좌측', teeth: UPPER_LEFT },
          { label: '하악 우측', teeth: LOWER_RIGHT },
          { label: '하악 좌측', teeth: LOWER_LEFT },
          { label: '상악 전치', teeth: [13, 12, 11, 21, 22, 23] },
          { label: '하악 전치', teeth: [33, 32, 31, 41, 42, 43] },
        ].map(({ label, teeth }) => {
          const allSelected = teeth.every((t) => selectedTeeth.includes(t))
          return (
            <button
              key={label}
              type="button"
              onClick={() => selectRegion(teeth)}
              disabled={disabled}
              className={`px-2 py-0.5 text-[11px] rounded-full border transition-colors disabled:opacity-50 ${
                allSelected
                  ? 'bg-indigo-100 border-indigo-300 text-indigo-700'
                  : 'bg-white border-at-border text-at-text-weak hover:border-indigo-300 hover:text-indigo-600'
              }`}
            >
              {label}
            </button>
          )
        })}
      </div>

      {/* 치아 차트 SVG */}
      <div className="bg-at-surface-alt rounded-xl border border-at-border p-4 select-none">
        <svg
          viewBox="0 -10 580 110"
          className="w-full"
          style={{ touchAction: 'none' }}
        >
          {/* 상악 라벨 */}
          <text x="290" y="-2" textAnchor="middle" fontSize="8" fill="#94a3b8" fontWeight="500">상악 (Maxilla)</text>

          {/* 중앙선 */}
          <line x1="290" y1="6" x2="290" y2="88" stroke="#e2e8f0" strokeWidth="1" strokeDasharray="3,3" />

          {/* R / L 라벨 */}
          <text x="4" y="50" fontSize="9" fill="#cbd5e1" fontWeight="600">R</text>
          <text x="570" y="50" fontSize="9" fill="#cbd5e1" fontWeight="600">L</text>

          {/* 상악 우측 (18-11): 왼쪽에서 오른쪽) */}
          <g transform="translate(14, 8)">
            {renderRow(UPPER_RIGHT, true)}
          </g>

          {/* 상악 좌측 (21-28): 중앙선 오른쪽 */}
          <g transform="translate(302, 8)">
            {renderRow(UPPER_LEFT, true)}
          </g>

          {/* 하악 우측 (48-41): 왼쪽에서 오른쪽 */}
          <g transform="translate(14, 58)">
            {renderRow(LOWER_RIGHT, false)}
          </g>

          {/* 하악 좌측 (31-38): 중앙선 오른쪽 */}
          <g transform="translate(302, 58)">
            {renderRow(LOWER_LEFT, false)}
          </g>

          {/* 하악 라벨 */}
          <text x="290" y="100" textAnchor="middle" fontSize="8" fill="#94a3b8" fontWeight="500">하악 (Mandible)</text>
        </svg>
      </div>

      {/* 호버 정보 */}
      {hoveredTooth && (
        <p className="text-xs text-at-text-weak text-center">
          #{hoveredTooth} {TOOTH_NAMES[hoveredTooth] || ''}
        </p>
      )}

      {/* 선택된 치아 표시 */}
      {selectedTeeth.length > 0 && (
        <div className="flex items-start gap-2">
          <span className="text-xs text-at-text-weak whitespace-nowrap mt-0.5">선택:</span>
          <div className="flex flex-wrap gap-1">
            {selectedTeeth.sort((a, b) => a - b).map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-indigo-100 text-indigo-700 text-[11px] rounded font-medium"
              >
                #{t}
                <button
                  type="button"
                  onClick={() => toggleTooth(t)}
                  disabled={disabled}
                  className="text-indigo-400 hover:text-red-500 ml-0.5"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        </div>
      )}

      <p className="text-[11px] text-at-text-weak">
        치아를 클릭하거나 드래그하여 시술 부위를 선택하세요. 영역 버튼으로 빠르게 선택할 수 있습니다.
      </p>
    </div>
  )
}

// 선택된 치아 번호를 읽기 쉬운 텍스트로 변환 (프롬프트용)
export function formatSelectedTeeth(teeth: number[]): string {
  if (teeth.length === 0) return ''
  const sorted = [...teeth].sort((a, b) => a - b)
  return sorted.map((t) => `#${t}(${TOOTH_NAMES[t] || ''})`).join(', ')
}
