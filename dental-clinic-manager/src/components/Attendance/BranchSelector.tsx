'use client'

/**
 * BranchSelector Component
 *
 * 지점 선택 UI 컴포넌트
 * - Tabs 형태로 지점 목록 표시
 * - "전체 지점" 옵션 지원
 * - URL 파라미터로 상태 관리
 */

import { MapPinIcon } from '@heroicons/react/24/outline'
import { useBranches } from '@/hooks/useBranches'

interface BranchSelectorProps {
  clinicId?: string
  userBranchId?: string
  userRole?: string
  showAllOption?: boolean  // "전체 지점" 옵션 표시 여부
  className?: string
}

export default function BranchSelector({
  clinicId,
  userBranchId,
  userRole,
  showAllOption = true,
  className = '',
}: BranchSelectorProps) {
  const {
    availableBranches,
    selectedBranchId,
    setSelectedBranchId,
    isLoading,
    canViewAllBranches,
  } = useBranches({
    clinicId,
    userBranchId,
    userRole,
    includeAllOption: showAllOption,
  })

  // 로딩 중
  if (isLoading) {
    return (
      <div className={`flex items-center gap-2 p-4 bg-slate-50 rounded-lg ${className}`}>
        <MapPinIcon className="w-5 h-5 text-slate-400 animate-pulse" />
        <span className="text-sm text-slate-500">지점 정보를 불러오는 중...</span>
      </div>
    )
  }

  // 지점이 없는 경우
  if (availableBranches.length === 0) {
    return (
      <div className={`flex items-center gap-2 p-4 bg-slate-50 rounded-lg ${className}`}>
        <MapPinIcon className="w-5 h-5 text-slate-400" />
        <span className="text-sm text-slate-500">등록된 지점이 없습니다.</span>
      </div>
    )
  }

  // 지점이 1개만 있고 "전체" 옵션을 표시하지 않으면 표시 안 함
  if (availableBranches.length === 1 && !showAllOption) {
    return null
  }

  return (
    <div className={`bg-white border border-slate-200 rounded-lg p-3 ${className}`}>
      <div className="flex items-center gap-2 mb-2">
        <MapPinIcon className="w-4 h-4 text-slate-600" />
        <span className="text-sm font-medium text-slate-700">지점 선택</span>
      </div>

      <div className="flex flex-wrap gap-2">
        {/* 전체 지점 옵션 */}
        {showAllOption && canViewAllBranches && (
          <button
            onClick={() => setSelectedBranchId(null)}
            className={`
              px-4 py-2 rounded-md text-sm font-medium transition-colors
              ${
                selectedBranchId === null
                  ? 'bg-blue-500 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }
            `}
          >
            전체 지점
          </button>
        )}

        {/* 개별 지점 버튼 */}
        {availableBranches.map((branch) => (
          <button
            key={branch.id}
            onClick={() => setSelectedBranchId(branch.id)}
            className={`
              px-4 py-2 rounded-md text-sm font-medium transition-colors
              ${
                selectedBranchId === branch.id
                  ? 'bg-blue-500 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }
            `}
            title={branch.address || undefined}
          >
            {branch.branch_name}
          </button>
        ))}
      </div>

      {/* 선택된 지점 정보 표시 */}
      {selectedBranchId && (
        <div className="mt-3 pt-3 border-t border-slate-200">
          {availableBranches.find((b) => b.id === selectedBranchId) && (
            <div className="text-xs text-slate-600">
              <div className="font-medium mb-1">
                {availableBranches.find((b) => b.id === selectedBranchId)?.branch_name}
              </div>
              {availableBranches.find((b) => b.id === selectedBranchId)?.address && (
                <div className="text-slate-500">
                  {availableBranches.find((b) => b.id === selectedBranchId)?.address}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
