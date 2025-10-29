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

  // Load contracts
  useEffect(() => {
    loadContracts()
  }, [clinicId, filters])

  const loadContracts = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await contractService.getContracts(clinicId, filters)

      if (response.error) {
        setError(response.error)
      } else {
        setContracts(response.contracts || [])
      }
    } catch (err) {
      console.error('Failed to load contracts:', err)
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
                    <button
                      onClick={e => {
                        e.stopPropagation()
                        handleContractClick(contract.id)
                      }}
                      className="text-blue-600 hover:text-blue-900"
                    >
                      보기
                    </button>
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
    </div>
  )
}
