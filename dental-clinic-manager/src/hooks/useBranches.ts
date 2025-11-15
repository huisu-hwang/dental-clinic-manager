/**
 * useBranches Hook
 *
 * 지점 관리 및 선택 상태를 관리하는 커스텀 훅
 * - URL 파라미터로 선택된 지점 상태 관리
 * - 지점 목록 조회 및 캐싱
 * - 권한별 지점 접근 제어
 */

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { getBranches } from '@/lib/branchService'
import type { ClinicBranch } from '@/types/branch'

interface UseBranchesOptions {
  clinicId?: string
  includeAllOption?: boolean  // "전체 지점" 옵션 포함 여부
  userBranchId?: string       // 사용자의 primary_branch_id (권한 제어용)
  userRole?: string           // 사용자 역할 (권한 제어용)
}

interface UseBranchesReturn {
  branches: ClinicBranch[]
  selectedBranchId: string | null  // null = "전체"
  selectedBranch: ClinicBranch | null
  isLoading: boolean
  error: string | null
  setSelectedBranchId: (branchId: string | null) => void
  availableBranches: ClinicBranch[]  // 권한에 따라 필터링된 지점 목록
  canViewAllBranches: boolean
}

export function useBranches(options: UseBranchesOptions = {}): UseBranchesReturn {
  const {
    clinicId,
    includeAllOption = true,
    userBranchId,
    userRole,
  } = options

  const router = useRouter()
  const searchParams = useSearchParams()

  const [branches, setBranches] = useState<ClinicBranch[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // URL 파라미터에서 선택된 지점 ID 가져오기
  const urlBranchId = searchParams.get('branch')
  const [selectedBranchId, setSelectedBranchIdState] = useState<string | null>(
    urlBranchId || null
  )

  // 권한 확인: 모든 지점을 볼 수 있는지
  const canViewAllBranches =
    userRole === 'owner' ||
    userRole === 'manager' ||
    !userRole  // role이 없으면 일단 허용 (로그인 전 등)

  // 지점 목록 로드
  useEffect(() => {
    console.log('[useBranches] clinicId:', clinicId, 'userBranchId:', userBranchId, 'userRole:', userRole)

    if (!clinicId) {
      console.log('[useBranches] No clinicId provided, skipping load')
      setIsLoading(false)
      return
    }

    const loadBranches = async () => {
      setIsLoading(true)
      setError(null)

      console.log('[useBranches] Loading branches for clinic:', clinicId)
      const result = await getBranches({
        clinic_id: clinicId,
        is_active: true
      })

      console.log('[useBranches] Result.success:', result.success)
      console.log('[useBranches] Result.branches length:', result.branches?.length)
      console.log('[useBranches] Result.branches data:', JSON.stringify(result.branches))
      console.log('[useBranches] Result.error:', result.error)

      if (result.success && result.branches) {
        console.log('[useBranches] Loaded branches:', result.branches.length)
        setBranches(result.branches)
      } else {
        console.error('[useBranches] Error loading branches:', result.error)
        setError(result.error || '지점 목록을 불러올 수 없습니다.')
        setBranches([])
      }

      setIsLoading(false)
    }

    loadBranches()
  }, [clinicId])

  // URL 파라미터 동기화
  useEffect(() => {
    setSelectedBranchIdState(urlBranchId || null)
  }, [urlBranchId])

  // 선택된 지점 객체
  const selectedBranch = selectedBranchId
    ? branches.find((b) => b.id === selectedBranchId) || null
    : null

  // 권한에 따라 사용 가능한 지점 필터링
  const availableBranches = canViewAllBranches
    ? branches
    : branches.filter((b) => b.id === userBranchId)

  // 지점 선택 함수 (URL 파라미터 업데이트)
  const setSelectedBranchId = (branchId: string | null) => {
    const params = new URLSearchParams(searchParams.toString())

    if (branchId) {
      params.set('branch', branchId)
    } else {
      params.delete('branch')
    }

    const newUrl = `?${params.toString()}`
    router.push(newUrl, { scroll: false })
    setSelectedBranchIdState(branchId)
  }

  return {
    branches,
    selectedBranchId,
    selectedBranch,
    isLoading,
    error,
    setSelectedBranchId,
    availableBranches,
    canViewAllBranches,
  }
}
