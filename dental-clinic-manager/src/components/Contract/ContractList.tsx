'use client'

/**
 * ContractList Component
 * Displays list of employment contracts with filtering and search
 */

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { contractService } from '@/lib/contractService'
import type { EmploymentContract, ContractStatus, ContractListFilters } from '@/types/contract'
import type { UserProfile } from '@/contexts/AuthContext'

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
  draft: 'bg-gray-100 text-gray-800',
  pending_employee_signature: 'bg-yellow-100 text-yellow-800',
  pending_employer_signature: 'bg-blue-100 text-blue-800',
  completed: 'bg-green-100 text-green-800',
  cancelled: 'bg-red-100 text-red-800'
}

export default function ContractList({ currentUser, clinicId }: ContractListProps) {
  const router = useRouter()
  const [contracts, setContracts] = useState<EmploymentContract[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filters, setFilters] = useState<ContractListFilters>({
    status: undefined,
    employee_user_id: undefined,
    search: undefined
  })
  const [deleteModalOpen, setDeleteModalOpen] = useState(false)
  const [contractToDelete, setContractToDelete] = useState<EmploymentContract | null>(null)
  const [deleting, setDeleting] = useState(false)

  // Load contracts
  useEffect(() => {
    const abortController = new AbortController()
    let isMounted = true

    const loadContracts = async () => {
      if (!isMounted) return

      setLoading(true)
      setError(null)

      try {
        console.log('[ContractList] Loading contracts...')
        const response = await contractService.getContracts(clinicId, filters)

        if (!isMounted) {
          console.log('[ContractList] Component unmounted, ignoring response')
          return
        }

        if (response.error) {
          // Session expired - redirect to login
          if (response.error === 'SESSION_EXPIRED' ||
              response.error.includes('인증 세션이 만료')) {
            console.error('[ContractList] Session expired, redirecting to login...')
            alert('세션이 만료되었습니다. 다시 로그인해주세요.')

            // Clear all session data
            localStorage.removeItem('dental_auth')
            localStorage.removeItem('dental_user')
            sessionStorage.removeItem('dental_auth')
            sessionStorage.removeItem('dental_user')

            // Redirect to home
            window.location.href = '/'
            return
          }

          setError(response.error)
        } else {
          setContracts(response.contracts || [])
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
  }, [clinicId, filters.status, filters.employee_user_id, filters.search])

  const loadContracts = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await contractService.getContracts(clinicId, filters)

      if (response.error) {
        // Session expired - redirect to login
        if (response.error === 'SESSION_EXPIRED' ||
            response.error.includes('인증 세션이 만료')) {
          console.error('[ContractList] Session expired, redirecting to login...')
          alert('세션이 만료되었습니다. 다시 로그인해주세요.')

          // Clear all session data
          localStorage.removeItem('dental_auth')
          localStorage.removeItem('dental_user')
          sessionStorage.removeItem('dental_auth')
          sessionStorage.removeItem('dental_user')

          // Redirect to home
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
    } finally {
      setLoading(false)
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
        alert(`삭제 실패: ${response.error}`)
      } else {
        alert('계약서가 삭제되었습니다.')
        // Refresh the list
        loadContracts()
      }
    } catch (err) {
      console.error('[ContractList] Delete error:', err)
      alert('계약서 삭제 중 오류가 발생했습니다.')
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
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">근로계약서 관리</h1>
          <p className="text-gray-600 mt-1">직원들의 근로계약서를 관리하고 서명하세요.</p>
        </div>
        {(currentUser.role === 'owner' || currentUser.role === 'manager') && (
          <button
            onClick={handleCreateNew}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            + 새 계약서 작성
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Search */}
          <div className="flex-1">
            <input
              type="text"
              placeholder="직원 이름으로 검색..."
              onChange={handleSearch}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Status Filter */}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => handleStatusFilter('all')}
              className={`px-4 py-2 rounded-lg transition-colors ${
                filters.status === undefined
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              전체
            </button>
            {(Object.keys(STATUS_LABELS) as ContractStatus[]).map(status => (
              <button
                key={status}
                onClick={() => handleStatusFilter(status)}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  filters.status === status
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {STATUS_LABELS[status]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Contract List */}
      {contracts.length === 0 ? (
        <div className="bg-white p-12 rounded-lg shadow border border-gray-200 text-center">
          <div className="text-gray-400 text-5xl mb-4">📄</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">근로계약서가 없습니다</h3>
          <p className="text-gray-600 mb-4">
            {filters.status || filters.search
              ? '검색 조건에 맞는 계약서가 없습니다.'
              : '새로운 근로계약서를 작성해보세요.'}
          </p>
          {(currentUser.role === 'owner' || currentUser.role === 'manager') && !filters.status && !filters.search && (
            <button
              onClick={handleCreateNew}
              className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
            >
              첫 계약서 작성하기
            </button>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  직원명
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  근로 기간
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  기본급
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  상태
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  작성일
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  작업
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {contracts.map(contract => (
                <tr
                  key={contract.id}
                  className="hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => handleContractClick(contract.id)}
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      {contract.contract_data.employee_name}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
                      {formatDate(contract.contract_data.employment_period_start)}
                      {contract.contract_data.employment_period_end && (
                        <> ~ {formatDate(contract.contract_data.employment_period_end)}</>
                      )}
                      {contract.contract_data.is_permanent && (
                        <span className="ml-2 text-blue-600 font-medium">(무기한)</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-900">
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
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {formatDate(contract.created_at)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex gap-2">
                      <button
                        onClick={e => {
                          e.stopPropagation()
                          handleContractClick(contract.id)
                        }}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        보기
                      </button>
                      {contract.status === 'cancelled' && (currentUser.role === 'owner' || currentUser.role === 'manager') && (
                        <>
                          <span className="text-gray-300">|</span>
                          <button
                            onClick={e => handleDeleteClick(contract, e)}
                            className="text-red-600 hover:text-red-900"
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

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-white p-4 rounded-lg shadow border border-gray-200">
          <p className="text-sm text-gray-600">전체</p>
          <p className="text-2xl font-bold text-gray-900">{contracts.length}</p>
        </div>
        {(Object.keys(STATUS_LABELS) as ContractStatus[]).map(status => (
          <div key={status} className="bg-white p-4 rounded-lg shadow border border-gray-200">
            <p className="text-sm text-gray-600">{STATUS_LABELS[status]}</p>
            <p className="text-2xl font-bold text-gray-900">
              {contracts.filter(c => c.status === status).length}
            </p>
          </div>
        ))}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteModalOpen && contractToDelete && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-bold text-gray-900 mb-4">계약서 삭제 확인</h3>
            <div className="mb-6">
              <p className="text-gray-700 mb-4">
                취소된 계약서를 영구적으로 삭제하시겠습니까?
                <br />
                <span className="text-red-600 font-semibold">삭제된 데이터는 복구할 수 없습니다.</span>
              </p>
              <div className="bg-gray-50 p-4 rounded border border-gray-200">
                <p className="text-sm text-gray-600 mb-1">
                  <span className="font-semibold">직원명:</span> {contractToDelete.contract_data.employee_name}
                </p>
                <p className="text-sm text-gray-600">
                  <span className="font-semibold">계약 기간:</span>{' '}
                  {formatDate(contractToDelete.contract_data.employment_period_start)}
                  {contractToDelete.contract_data.employment_period_end && (
                    <> ~ {formatDate(contractToDelete.contract_data.employment_period_end)}</>
                  )}
                  {contractToDelete.contract_data.is_permanent && (
                    <span className="ml-2 text-blue-600">(무기한)</span>
                  )}
                </p>
              </div>
            </div>
            <div className="flex gap-3 justify-end">
              <button
                onClick={handleCancelDelete}
                disabled={deleting}
                className="px-4 py-2 text-gray-700 bg-gray-100 rounded hover:bg-gray-200 disabled:opacity-50"
              >
                취소
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
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
    </div>
  )
}
