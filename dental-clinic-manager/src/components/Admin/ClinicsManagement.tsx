'use client'

import { useState, useEffect } from 'react'
import {
  BuildingOfficeIcon,
  UserGroupIcon,
  CreditCardIcon,
  ChartBarIcon,
  CheckCircleIcon,
  XCircleIcon,
  ExclamationCircleIcon,
  MagnifyingGlassIcon,
  FunnelIcon
} from '@heroicons/react/24/outline'
import { getSupabase } from '@/lib/supabase'
import type { Clinic, SubscriptionTier } from '@/types/auth'

interface ExtendedClinic extends Clinic {
  userCount?: number
  lastActivity?: Date
  totalRevenue?: number
}

export default function ClinicsManagement() {
  const [clinics, setClinics] = useState<ExtendedClinic[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'suspended' | 'cancelled'>('all')
  const [filterTier, setFilterTier] = useState<'all' | 'basic' | 'professional' | 'enterprise'>('all')
  const [selectedClinic, setSelectedClinic] = useState<ExtendedClinic | null>(null)
  const [showDetails, setShowDetails] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // Statistics
  const [stats, setStats] = useState({
    totalClinics: 0,
    activeClinics: 0,
    totalUsers: 0,
    monthlyRevenue: 0
  })

  useEffect(() => {
    fetchClinics()
    fetchStatistics()
  }, [])

  const fetchClinics = async () => {
    setLoading(true)
    setError('')
    const supabase = getSupabase()

    if (!supabase) {
      console.error('Supabase client not initialized')
      setError('데이터베이스 연결에 실패했습니다.')
      setLoading(false)
      return
    }

    try {
      // First, fetch all clinics
      const { data: clinicsData, error: clinicsError } = await supabase
        .from('clinics')
        .select('*')
        .order('created_at', { ascending: false })

      if (clinicsError) {
        console.error('Error fetching clinics:', clinicsError)

        // Check if table doesn't exist and create sample data
        if (clinicsError.message?.includes('relation') || clinicsError.message?.includes('does not exist')) {
          console.log('Clinics table not found, using sample data')
          const sampleClinics: ExtendedClinic[] = [
            {
              id: 'clinic-1',
              name: '하얀치과',
              owner_name: '김원장',
              address: '서울시 송파구 풍납동 152-28 3층',
              phone: '02-477-2878',
              email: 'whitedc0902@gmail.com',
              business_number: '123-45-67890',
              subscription_tier: 'professional',
              subscription_expires_at: '2024-12-31',
              max_users: 10,
              status: 'active',
              is_public: true,
              allow_join_requests: true,
              created_at: '2024-01-15',
              updated_at: '2024-09-20',
              userCount: 5
            },
            {
              id: 'clinic-2',
              name: '서울대학교 치과병원',
              owner_name: '이원장',
              address: '서울시 종로구 대학로 101',
              phone: '02-2072-2114',
              email: 'info@snudh.org',
              business_number: '234-56-78901',
              subscription_tier: 'enterprise',
              subscription_expires_at: '2025-03-31',
              max_users: 50,
              status: 'active',
              is_public: true,
              allow_join_requests: true,
              created_at: '2024-02-01',
              updated_at: '2024-09-15',
              userCount: 25
            }
          ]
          setClinics(sampleClinics)
        } else {
          setError('병원 목록을 불러오는데 실패했습니다: ' + clinicsError.message)
        }
      } else if (clinicsData && clinicsData.length > 0) {
        // For each clinic, get user count
        const clinicsWithUserCount = await Promise.all(
          clinicsData.map(async (clinic: any) => {
            const { count } = await supabase
              .from('users')
              .select('*', { count: 'exact', head: true })
              .eq('clinic_id', clinic.id)

            return {
              ...clinic,
              userCount: count || 0
            }
          })
        )

        // Transform data
        const transformedClinics: ExtendedClinic[] = clinicsWithUserCount.map((c: any) => ({
          id: c.id,
          name: c.name,
          owner_name: c.owner_name,
          address: c.address,
          phone: c.phone,
          email: c.email,
          business_number: c.business_number,
          subscription_tier: c.subscription_tier || 'basic',
          subscription_expires_at: c.subscription_expires_at,
          max_users: c.max_users || 5,
          status: c.status || 'active',
          is_public: c.is_public || false,
          allow_join_requests: c.allow_join_requests || false,
          created_at: c.created_at,
          updated_at: c.updated_at,
          userCount: c.userCount
        }))

        setClinics(transformedClinics)
        console.log(`Successfully fetched ${transformedClinics.length} clinics`)
      } else {
        // No clinics in database
        console.log('No clinics found in database')
        setClinics([])
      }
    } catch (err) {
      console.error('Unexpected error:', err)
      setError('병원 목록을 불러오는 중 예상치 못한 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const fetchStatistics = async () => {
    const supabase = getSupabase()

    if (!supabase) {
      console.error('Supabase client not initialized for statistics')
      return
    }

    try {
      // Get total clinics
      const { count: totalClinics, error: totalError } = await supabase
        .from('clinics')
        .select('*', { count: 'exact', head: true })

      if (totalError) {
        console.error('Error fetching total clinics:', totalError)
        // Set default values if error
        setStats({
          totalClinics: 0,
          activeClinics: 0,
          totalUsers: 0,
          monthlyRevenue: 0
        })
        return
      }

      // Get active clinics
      const { count: activeClinics, error: activeError } = await supabase
        .from('clinics')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'active')

      if (activeError) {
        console.error('Error fetching active clinics:', activeError)
      }

      // Get total users
      const { count: totalUsers, error: usersError } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })

      if (usersError) {
        console.error('Error fetching users:', usersError)
      }

      // Calculate monthly revenue based on subscription tiers
      const { data: clinicsForRevenue, error: revenueError } = await supabase
        .from('clinics')
        .select('subscription_tier, status')
        .eq('status', 'active')

      let monthlyRevenue = 0
      if (!revenueError && clinicsForRevenue) {
        const tierPrices = {
          basic: 50000,
          professional: 150000,
          enterprise: 500000
        }

        monthlyRevenue = clinicsForRevenue.reduce((total, clinic: any) => {
          const tier = clinic.subscription_tier || 'basic'
          return total + (tierPrices[tier as keyof typeof tierPrices] || 0)
        }, 0)
      }

      setStats({
        totalClinics: totalClinics || 0,
        activeClinics: activeClinics || 0,
        totalUsers: totalUsers || 0,
        monthlyRevenue: monthlyRevenue
      })
    } catch (err) {
      console.error('Unexpected error fetching statistics:', err)
      setStats({
        totalClinics: 0,
        activeClinics: 0,
        totalUsers: 0,
        monthlyRevenue: 0
      })
    }
  }

  const handleUpdateClinicStatus = async (clinicId: string, newStatus: 'active' | 'suspended' | 'cancelled') => {
    const supabase = getSupabase()
    if (!supabase) return

    try {
      const { error } = await (supabase as any)
        .from('clinics')
        .update({ status: newStatus })
        .eq('id', clinicId)

      if (error) {
        setError('상태 업데이트에 실패했습니다.')
      } else {
        setSuccess(`병원 상태가 ${newStatus}로 변경되었습니다.`)
        fetchClinics()
        setShowDetails(false)
      }
    } catch (err) {
      setError('상태 업데이트 중 오류가 발생했습니다.')
    }
  }

  const handleUpdateSubscription = async (
    clinicId: string,
    tier: SubscriptionTier,
    maxUsers: number,
    expiresAt?: Date
  ) => {
    const supabase = getSupabase()
    if (!supabase) return

    try {
      const updateData: any = {
        subscription_tier: tier,
        max_users: maxUsers
      }

      if (expiresAt) {
        updateData.subscription_expires_at = expiresAt.toISOString()
      }

      const { error } = await (supabase as any)
        .from('clinics')
        .update(updateData)
        .eq('id', clinicId)

      if (error) {
        setError('구독 정보 업데이트에 실패했습니다.')
      } else {
        setSuccess('구독 정보가 업데이트되었습니다.')
        fetchClinics()
      }
    } catch (err) {
      setError('구독 정보 업데이트 중 오류가 발생했습니다.')
    }
  }

  // Filter clinics based on search and filters
  const filteredClinics = clinics.filter(clinic => {
    const matchesSearch =
      clinic.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      clinic.owner_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      clinic.email.toLowerCase().includes(searchQuery.toLowerCase())

    const matchesStatus = filterStatus === 'all' || clinic.status === filterStatus
    const matchesTier = filterTier === 'all' || clinic.subscription_tier === filterTier

    return matchesSearch && matchesStatus && matchesTier
  })

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            <CheckCircleIcon className="w-3 h-3 mr-1" />
            활성
          </span>
        )
      case 'suspended':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
            <ExclamationCircleIcon className="w-3 h-3 mr-1" />
            정지
          </span>
        )
      case 'cancelled':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
            <XCircleIcon className="w-3 h-3 mr-1" />
            취소
          </span>
        )
      default:
        return null
    }
  }

  const getTierBadge = (tier: string) => {
    const badges = {
      basic: 'bg-slate-100 text-slate-800',
      professional: 'bg-blue-100 text-blue-800',
      enterprise: 'bg-purple-100 text-purple-800'
    }
    const labels = {
      basic: '기본',
      professional: '프로페셔널',
      enterprise: '엔터프라이즈'
    }
    return (
      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${badges[tier as keyof typeof badges] || 'bg-gray-100 text-gray-800'}`}>
        {labels[tier as keyof typeof labels] || tier}
      </span>
    )
  }

  return (
    <div className="space-y-6">
      {/* Statistics Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <BuildingOfficeIcon className="h-8 w-8 text-blue-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-slate-600">전체 병원</p>
              <p className="text-2xl font-bold text-slate-900">{stats.totalClinics}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <CheckCircleIcon className="h-8 w-8 text-green-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-slate-600">활성 병원</p>
              <p className="text-2xl font-bold text-slate-900">{stats.activeClinics}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <UserGroupIcon className="h-8 w-8 text-indigo-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-slate-600">전체 사용자</p>
              <p className="text-2xl font-bold text-slate-900">{stats.totalUsers}</p>
            </div>
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <CreditCardIcon className="h-8 w-8 text-purple-600" />
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-slate-600">월 매출</p>
              <p className="text-2xl font-bold text-slate-900">₩{stats.monthlyRevenue.toLocaleString()}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="bg-white rounded-lg shadow-sm border border-slate-200">
        <div className="p-6 border-b border-slate-200">
          <h2 className="text-xl font-bold text-slate-800">병원 관리</h2>

          {/* Search and Filters */}
          <div className="mt-4 flex flex-col md:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-400" />
                <input
                  type="text"
                  placeholder="병원명, 원장명, 이메일로 검색..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
                className="px-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">모든 상태</option>
                <option value="active">활성</option>
                <option value="suspended">정지</option>
                <option value="cancelled">취소</option>
              </select>

              <select
                value={filterTier}
                onChange={(e) => setFilterTier(e.target.value as any)}
                className="px-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">모든 플랜</option>
                <option value="basic">기본</option>
                <option value="professional">프로페셔널</option>
                <option value="enterprise">엔터프라이즈</option>
              </select>
            </div>
          </div>
        </div>

        {error && (
          <div className="p-4 bg-red-50 border-b border-red-200">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        {success && (
          <div className="p-4 bg-green-50 border-b border-green-200">
            <p className="text-green-600 text-sm">{success}</p>
          </div>
        )}

        {/* Clinics Table */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  병원 정보
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  구독
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  사용자
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  상태
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  등록일
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  작업
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-6 py-4 text-center">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
                  </td>
                </tr>
              ) : filteredClinics.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-6 py-4 text-center text-slate-500">
                    검색 결과가 없습니다.
                  </td>
                </tr>
              ) : (
                filteredClinics.map((clinic) => (
                  <tr key={clinic.id} className="hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <div>
                        <div className="text-sm font-medium text-slate-900">{clinic.name}</div>
                        <div className="text-sm text-slate-500">{clinic.owner_name}</div>
                        <div className="text-xs text-slate-400">{clinic.email}</div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div>
                        {getTierBadge(clinic.subscription_tier)}
                        {clinic.subscription_expires_at && (
                          <div className="text-xs text-slate-500 mt-1">
                            만료: {new Date(clinic.subscription_expires_at).toLocaleDateString('ko-KR')}
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-slate-900">
                        {clinic.userCount || 0} / {clinic.max_users}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      {getStatusBadge(clinic.status)}
                    </td>
                    <td className="px-6 py-4 text-sm text-slate-500">
                      {new Date(clinic.created_at).toLocaleDateString('ko-KR')}
                    </td>
                    <td className="px-6 py-4">
                      <button
                        onClick={() => {
                          setSelectedClinic(clinic)
                          setShowDetails(true)
                        }}
                        className="text-blue-600 hover:text-blue-900 text-sm font-medium"
                      >
                        상세보기
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Clinic Details Modal */}
      {showDetails && selectedClinic && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-slate-800 mb-4">병원 상세 정보</h3>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700">병원명</label>
                  <p className="mt-1 text-sm text-slate-900">{selectedClinic.name}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">원장</label>
                  <p className="mt-1 text-sm text-slate-900">{selectedClinic.owner_name}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">이메일</label>
                  <p className="mt-1 text-sm text-slate-900">{selectedClinic.email}</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700">전화번호</label>
                  <p className="mt-1 text-sm text-slate-900">{selectedClinic.phone}</p>
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-700">주소</label>
                  <p className="mt-1 text-sm text-slate-900">{selectedClinic.address}</p>
                </div>
                {selectedClinic.business_number && (
                  <div>
                    <label className="block text-sm font-medium text-slate-700">사업자번호</label>
                    <p className="mt-1 text-sm text-slate-900">{selectedClinic.business_number}</p>
                  </div>
                )}
              </div>

              <div className="border-t pt-4">
                <h4 className="font-medium text-slate-800 mb-2">구독 정보</h4>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700">현재 플랜</label>
                    <select
                      value={selectedClinic.subscription_tier}
                      onChange={(e) => {
                        const newClinic = { ...selectedClinic, subscription_tier: e.target.value as SubscriptionTier }
                        setSelectedClinic(newClinic)
                      }}
                      className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-md"
                    >
                      <option value="basic">기본</option>
                      <option value="professional">프로페셔널</option>
                      <option value="enterprise">엔터프라이즈</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">최대 사용자</label>
                    <input
                      type="number"
                      value={selectedClinic.max_users}
                      onChange={(e) => {
                        const newClinic = { ...selectedClinic, max_users: parseInt(e.target.value) }
                        setSelectedClinic(newClinic)
                      }}
                      className="mt-1 w-full px-3 py-2 border border-slate-300 rounded-md"
                    />
                  </div>
                </div>
                <button
                  onClick={() => handleUpdateSubscription(
                    selectedClinic.id,
                    selectedClinic.subscription_tier as SubscriptionTier,
                    selectedClinic.max_users
                  )}
                  className="mt-2 bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
                >
                  구독 정보 업데이트
                </button>
              </div>

              <div className="border-t pt-4">
                <h4 className="font-medium text-slate-800 mb-2">상태 관리</h4>
                <div className="flex gap-2">
                  {selectedClinic.status !== 'active' && (
                    <button
                      onClick={() => handleUpdateClinicStatus(selectedClinic.id, 'active')}
                      className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700"
                    >
                      활성화
                    </button>
                  )}
                  {selectedClinic.status !== 'suspended' && (
                    <button
                      onClick={() => handleUpdateClinicStatus(selectedClinic.id, 'suspended')}
                      className="bg-yellow-600 text-white px-4 py-2 rounded-md hover:bg-yellow-700"
                    >
                      정지
                    </button>
                  )}
                  {selectedClinic.status !== 'cancelled' && (
                    <button
                      onClick={() => handleUpdateClinicStatus(selectedClinic.id, 'cancelled')}
                      className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700"
                    >
                      취소
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={() => setShowDetails(false)}
                className="bg-slate-200 text-slate-800 px-4 py-2 rounded-md hover:bg-slate-300"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}