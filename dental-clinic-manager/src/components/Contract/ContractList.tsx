'use client'

/**
 * ContractList Component
 * Displays list of employment contracts with filtering and search
 */

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Plus, Search } from 'lucide-react'
import { contractService } from '@/lib/contractService'
import type { EmploymentContract, ContractStatus, ContractListFilters } from '@/types/contract'
import type { UserProfile } from '@/contexts/AuthContext'
import { checkSecuritySession, setSecuritySession } from '@/lib/securitySession'
import PasswordVerificationModal from '@/components/Security/PasswordVerificationModal'
import { appAlert } from '@/components/ui/AppDialog'

interface ContractListProps {
  currentUser: UserProfile
  clinicId: string
}

const STATUS_LABELS: Record<ContractStatus, string> = {
  draft: '임시저장',
  pending_employee_signature: '직원 서명 대기',
  pending_employer_signature: '원장 서명 대기',
  completed: '완료',
  cancelled: '취소됨'
}

const STATUS_COLORS: Record<ContractStatus, string> = {
  draft: 'bg-at-surface-alt text-at-text',
  pending_employee_signature: 'bg-yellow-100 text-yellow-800',
  pending_employer_signature: 'bg-at-tag text-at-accent',
  completed: 'bg-at-success-bg text-green-800',
  cancelled: 'bg-at-error-bg text-red-800'
}

export default function ContractList({ currentUser, clinicId }: ContractListProps) {
  const router = useRouter()
  const [contracts, setContracts] = useState<EmploymentContract[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // 대표원장만 전체 계약서 조회, 나머지는 본인 계약서만
  const isFullAccessRole = currentUser.role === 'owner'
  const [filters, setFilters] = useState<ContractListFilters>({
    status: undefined,
    employee_user_id: isFullAccessRole ? undefined : currentUser.id,
    search: undefined
  })
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [contractToDelete, setContractToDelete] = useState<EmploymentContract | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Security verification state
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [isVerified, setIsVerified] = useState(false)

  // Check security session on mount
  useEffect(() => {
    console.log('[ContractList] Checking security session...')
    const hasValidSession = checkSecuritySession('contract')

    if (hasValidSession) {
      console.log('[ContractList] Valid security session found')
      setIsVerified(true)
    } else {
      console.log('[ContractList] No valid security session, showing password modal')
      setShowPasswordModal(true)
      setLoading(false)
    }
  }, [])

  // Handle successful password verification
  const handlePasswordVerified = () => {
    console.log('[ContractList] Password verified, creating security session')
    setSecuritySession('contract')
    setShowPasswordModal(false)
    setIsVerified(true)
    setLoading(true)
  }

  // Handle password verification cancel
  const handlePasswordCancel = () => {
    console.log('[ContractList] Password verification cancelled, redirecting to dashboard')
    router.push('/dashboard')
  }

  // Load contracts
  useEffect(() => {
    if (!isVerified) {
      console.log('[ContractList] Not verified yet, skipping contract load')
      return
    }
    const abortController = new AbortController()
    let isMounted = true

    const loadContracts = async () => {
      if (!isMounted) return

      setError(null)

      try {
        console.log('[ContractList] Loading contracts...')
        console.log('[ContractList] Current user role:', currentUser?.role)

        const response = await contractService.getContracts(clinicId, filters)

        if (!isMounted) {
          console.log('[ContractList] Component unmounted, ignoring response')
          return
        }

        if (response.error) {
          if (response.error === 'SESSION_EXPIRED' ||
              response.error.includes('인증 세션이 만료')) {
            console.error('[ContractList] Session expired, redirecting to login...')
            await appAlert('세션이 만료되었습니다. 다시 로그인해주세요.')

            localStorage.removeItem('dental_auth')
            localStorage.removeItem('dental_user')
            sessionStorage.removeItem('dental_auth')
            sessionStorage.removeItem('dental_user')

            window.location.href = '/'
            return
          }

          setError(response.error)
        } else {
          const contracts = response.contracts || []
          setContracts(contracts)

          console.log('[ContractList] Loaded contracts:', contracts.length)
          const cancelledContracts = contracts.filter(c => c.status === 'cancelled')
          console.log('[ContractList] Cancelled contracts:', cancelledContracts.length)
          if (cancelledContracts.length > 0) {
            console.log('[ContractList] Sample cancelled contract:', {
              id: cancelledContracts[0].id,
              employee: cancelledContracts[0].contract_data.employee_name,
              status: cancelledContracts[0].status
            })
          }
        }
      } catch (err) {
        if (!isMounted) return

        console.error('[ContractList] Failed to load contracts:', err)
        setError('근로계약서 목록을 불러오는 중 오류가 발생했습니다.')
      } finally {
        if (isMounted) {
          setLoading(false)
        }
      }
    }

    loadContracts()

    return () => {
      isMounted = false
      abortController.abort()
      console.log('[ContractList] Cleanup: aborted pending requests')
    }
  }, [clinicId, filters.status, filters.employee_user_id, filters.search, isVerified])

  const loadContracts = async () => {
    setError(null)

    try {
      const response = await contractService.getContracts(clinicId, filters)

      if (response.error) {
        if (response.error === 'SESSION_EXPIRED' ||
            response.error.includes('인증 세션이 만료')) {
          console.error('[ContractList] Session expired, redirecting to login...')
          await appAlert('세션이 만료되었습니다. 다시 로그인해주세요.')

          localStorage.removeItem('dental_auth')
          localStorage.removeItem('dental_user')
          sessionStorage.removeItem('dental_auth')
          sessionStorage.removeItem('dental_user')

          window.location.href = '/'
          return
        }

        setError(response.error)
      } else {
        setContracts(response.contracts || [])
      }
    } catch (err) {
      console.error('[ContractList] Failed to load contracts:', err)
      setError('근로계약서 목록을 불러오는 중 오류가 발생했습니다.')
    }
  }

  const handleStatusFilter = (status: ContractStatus | 'all') => {
    setFilters(prev => ({
      ...prev,
      status: status === 'all' ? undefined : status
    }))
  }

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const search = e.target.value
    setFilters(prev => ({
      ...prev,
      search: search || undefined
    }))
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  const formatSalary = (amount: number) => {
    return new Intl.NumberFormat('ko-KR', {
      style: 'currency',
      currency: 'KRW'
    }).format(amount)
  }

  const handleContractClick = (contractId: string) => {
    router.push(`/dashboard/contracts/${contractId}`)
  }

  const handleCreateNew = () => {
    router.push('/dashboard/contracts/new')
  }

  const handleDeleteClick = (contract: EmploymentContract, e: React.MouseEvent) => {
    e.stopPropagation()
    setContractToDelete(contract)
    setDeleteModalOpen(true)
  }

  const handleConfirmDelete = async () => {
    if (!contractToDelete) return

    setDeleting(true)

    try {
      console.log('[ContractList] Deleting contract:', contractToDelete.id)
      const response = await contractService.deleteContract(contractToDelete.id, currentUser.id)

      if (response.error) {
        await appAlert(`삭제 실패: ${response.error}`)
      } else {
        await appAlert('계약서가 삭제되었습니다.')
        await loadContracts()
      }
    } catch (err) {
      console.error('[ContractList] Delete error:', err)
      await appAlert('계약서 삭제 중 오류가 발생했습니다.')
    } finally {
      setDeleting(false)
      setDeleteModalOpen(false)
      setContractToDelete(null)
    }
  }

  const handleCancelDelete = () => {
    setDeleteModalOpen(false)
    setContractToDelete(null)
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-at-accent"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 bg-at-error-bg border border-red-200 rounded-xl">
        <p className="text-red-800">{error}</p>
        <button
          onClick={loadContracts}
          className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
        >
          다시 시도
        </button>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 bg-white min-h-screen">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-at-accent-light rounded-xl flex items-center justify-center">
            <FileText className="w-5 h-5 text-at-accent" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-at-text">근로계약서 관리</h2>
            <p className="text-at-text text-sm">Employment Contract Management</p>
          </div>
        </div>
        {(currentUser.role === 'owner' || currentUser.role === 'manager') && (
          <button
            onClick={handleCreateNew}
            className="flex items-center px-4 py-2 bg-at-accent hover:bg-at-accent-hover text-white text-sm font-medium rounded-xl transition-colors"
          >
            <Plus className="w-4 h-4 mr-2" />
            새 계약서 작성
          </button>
        )}
      </div>

      {/* 필터 영역 */}
      <div className="bg-at-surface-alt rounded-xl p-4">
        <div className="flex flex-col md:flex-row gap-4">
          {/* 검색 */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-at-text" />
            <input
              type="text"
              placeholder="직원 이름으로 검색..."
              onChange={handleSearch}
              className="w-full pl-10 pr-4 py-2 border border-at-border rounded-xl focus:ring-2 focus:ring-at-accent focus:border-transparent"
            />
          </div>

          {/* 상태 필터 */}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => handleStatusFilter('all')}
              className={`px-4 py-2 rounded-xl transition-colors text-sm font-medium ${
                filters.status === undefined
                  ? 'bg-at-accent text-white'
                  : 'bg-white text-at-text border border-at-border hover:bg-at-surface-alt'
              }`}
            >
              전체
            </button>
            {(Object.keys(STATUS_LABELS) as ContractStatus[]).map(status => (
              <button
                key={status}
                onClick={() => handleStatusFilter(status)}
                className={`px-4 py-2 rounded-xl transition-colors text-sm font-medium ${
                  filters.status === status
                    ? 'bg-at-accent text-white'
                    : 'bg-white text-at-text border border-at-border hover:bg-at-surface-alt'
                }`}
              >
                {STATUS_LABELS[status]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* 콘텐츠 영역 */}
      <div>
        {/* 계약서 목록 */}
        {contracts.length === 0 ? (
          <div className="text-center py-12 bg-at-surface-alt rounded-xl">
            <FileText className="w-12 h-12 text-at-text mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-at-text mb-2">근로계약서가 없습니다</h3>
            <p className="text-at-text mb-4">
              {filters.status || filters.search
                ? '검색 조건에 맞는 계약서가 없습니다.'
                : '새로운 근로계약서를 작성해보세요.'}
            </p>
            {(currentUser.role === 'owner' || currentUser.role === 'manager') && !filters.status && !filters.search && (
              <button
                onClick={handleCreateNew}
                className="inline-flex items-center px-6 py-3 bg-at-accent text-white rounded-xl hover:bg-at-accent-hover transition-colors font-medium"
              >
                <Plus className="w-4 h-4 mr-2" />
                첫 계약서 작성하기
              </button>
            )}
          </div>
        ) : (
          <div className="border border-at-border rounded-xl overflow-hidden">
            <table className="w-full">
              <thead className="bg-at-surface-alt border-b border-at-border">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-at-text uppercase tracking-wider">
                    직원명
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-at-text uppercase tracking-wider">
                    근로 기간
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-at-text uppercase tracking-wider">
                    기본급
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-at-text uppercase tracking-wider">
                    상태
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-at-text uppercase tracking-wider">
                    작성일
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-at-text uppercase tracking-wider">
                    작업
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-at-border">
                {contracts.map(contract => (
                  <tr
                    key={contract.id}
                    className="hover:bg-at-surface-alt cursor-pointer transition-colors"
                    onClick={() => handleContractClick(contract.id)}
                  >
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-at-text">
                        {contract.contract_data.employee_name}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-at-text">
                        {formatDate(contract.contract_data.employment_period_start)}
                        {contract.contract_data.employment_period_end && (
                          <> ~ {formatDate(contract.contract_data.employment_period_end)}</>
                        )}
                        {contract.contract_data.is_permanent && (
                          <span className="ml-2 text-at-accent font-medium">(무기한)</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-at-text">
                        {formatSalary(contract.contract_data.salary_base)}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                          STATUS_COLORS[contract.status]
                        }`}
                      >
                        {STATUS_LABELS[contract.status]}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-at-text">
                      {formatDate(contract.created_at)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex gap-2">
                        <button
                          onClick={e => {
                            e.stopPropagation()
                            handleContractClick(contract.id)
                          }}
                          className="text-at-accent hover:text-at-accent"
                        >
                          보기
                        </button>
                        {contract.status === 'cancelled' && (currentUser?.role === 'owner' || currentUser?.role === 'manager') && (
                          <>
                            <span className="text-at-text">|</span>
                            <button
                              onClick={e => handleDeleteClick(contract, e)}
                              className="text-at-error hover:text-red-900"
                            >
                              삭제
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* 통계 */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mt-6">
          <div className="bg-at-surface-alt p-4 rounded-xl border border-at-border">
            <p className="text-sm text-at-text">전체</p>
            <p className="text-2xl font-bold text-at-text">{contracts.length}</p>
          </div>
          {(Object.keys(STATUS_LABELS) as ContractStatus[]).map(status => (
            <div key={status} className="bg-at-surface-alt p-4 rounded-xl border border-at-border">
              <p className="text-sm text-at-text">{STATUS_LABELS[status]}</p>
              <p className="text-2xl font-bold text-at-text">
                {contracts.filter(c => c.status === status).length}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {deleteModalOpen && contractToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-bold text-at-text mb-4">계약서 삭제 확인</h3>
            <div className="mb-6">
              <p className="text-at-text mb-4">
                취소된 계약서를 영구적으로 삭제하시겠습니까?
                <br />
                <span className="text-at-error font-semibold">삭제된 데이터는 복구할 수 없습니다.</span>
              </p>
              <div className="bg-at-surface-alt p-4 rounded-xl border border-at-border">
                <p className="text-sm text-at-text mb-1">
                  <span className="font-semibold">직원명:</span> {contractToDelete.contract_data.employee_name}
                </p>
                <p className="text-sm text-at-text">
                  <span className="font-semibold">계약 기간:</span>{' '}
                  {formatDate(contractToDelete.contract_data.employment_period_start)}
                  {contractToDelete.contract_data.employment_period_end && (
                    <> ~ {formatDate(contractToDelete.contract_data.employment_period_end)}</>
                  )}
                  {contractToDelete.contract_data.is_permanent && (
                    <span className="ml-2 text-at-accent">(무기한)</span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={handleCancelDelete}
                disabled={deleting}
                className="px-4 py-2 text-at-text bg-at-surface-alt rounded-xl hover:bg-at-border disabled:opacity-50"
              >
                취소
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
              >
                {deleting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                    삭제 중...
                  </>
                ) : (
                  '삭제'
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Password Verification Modal */}
      <PasswordVerificationModal
        isOpen={showPasswordModal}
        onVerified={handlePasswordVerified}
        onCancel={handlePasswordCancel}
        purpose="contract"
      />
    </div>
  )
}
