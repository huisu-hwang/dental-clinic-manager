'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { dataService } from '@/lib/dataService'
import { UserIcon, BuildingOffice2Icon, ChartBarIcon, UsersIcon } from '@heroicons/react/24/outline'
import Header from '@/components/Layout/Header'

type TabType = 'overview' | 'clinics' | 'users' | 'pending' | 'statistics'

export default function MasterAdminPage() {
  const router = useRouter()
  const { user, loading, logout } = useAuth()
  const [activeTab, setActiveTab] = useState<TabType>('pending')
  const [clinics, setClinics] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [pendingUsers, setPendingUsers] = useState<any[]>([])
  const [statistics, setStatistics] = useState({
    totalClinics: 0,
    totalUsers: 0,
    totalPatients: 0,
    totalAppointments: 0
  })
  const [loadingData, setLoadingData] = useState(true)
  const [dataError, setDataError] = useState<string | null>(null)
  const [selectedClinic, setSelectedClinic] = useState<any>(null)
  const [showUsersModal, setShowUsersModal] = useState(false)
  const [clinicUsers, setClinicUsers] = useState<any[]>([])
  const [loadingClinicUsers, setLoadingClinicUsers] = useState(false)

  // 권한 체크
  useEffect(() => {
    if (!loading) {
      if (!user) {
        router.push('/')
        return
      }

      // 마스터 권한 체크
      checkMasterPermission()
    }
  }, [user, loading, router])

  const checkMasterPermission = async () => {
    try {
      console.log('[Master] Checking permission for user:', user)

      // localStorage에서 직접 확인 (빠른 체크)
      if (user?.role === 'master_admin') {
        console.log('[Master] User is master_admin, loading data...')
        loadData()
        return
      }

      // Supabase에서 다시 확인
      const result = await dataService.getUserProfile()
      const userData = result?.data as any
      console.log('[Master] User profile from DB:', userData)

      if (userData?.role !== 'master_admin') {
        alert('마스터 관리자 권한이 필요합니다.')
        router.push('/dashboard')
        return
      }
      loadData()
    } catch (error) {
      console.error('[Master] 권한 확인 실패:', error)
      // 에러가 발생해도 user.role이 master_admin이면 진행
      if (user?.role === 'master_admin') {
        console.log('[Master] Error occurred but user is master_admin, proceeding...')
        loadData()
      } else {
        router.push('/dashboard')
      }
    }
  }

  const loadData = async () => {
    setLoadingData(true)
    setDataError(null)
    try {
      console.log('[Master] Loading data...')

      // 병원 목록 조회
      const clinicsResult = await dataService.getAllClinics()
      console.log('[Master] Clinics result:', clinicsResult)
      setClinics(clinicsResult?.data || [])

      // 사용자 목록 조회 (이메일 인증 상태 포함)
      // Admin API Route를 통해 서버에서 조회 (SERVICE_ROLE_KEY 사용)
      const response = await fetch('/api/admin/users')
      const usersResult = await response.json()
      console.log('[Master] Users result:', usersResult)

      // API 에러 체크
      if (!response.ok || usersResult?.error) {
        const errorMsg = usersResult?.error || 'Unknown error'
        console.error('[Master] API Error:', errorMsg)

        // 환경 변수 누락 에러인지 확인
        if (errorMsg.includes('Missing Supabase credentials') ||
            errorMsg.includes('Server configuration error')) {
          setDataError('⚠️ 서버 설정 오류: Vercel 환경 변수가 올바르게 설정되지 않았습니다.\n\nVERCEL_SERVICE_ROLE_KEY 환경 변수를 확인해주세요.')
        } else {
          setDataError(`⚠️ 데이터를 불러오는데 실패했습니다.\n\n오류: ${errorMsg}`)
        }

        setClinics([])
        setUsers([])
        setPendingUsers([])
        return
      }

      const allUsers = usersResult?.data || []
      setUsers(allUsers)

      // 승인 대기 중인 사용자 필터링
      console.log('[Master] Total users loaded:', allUsers.length)
      console.log('[Master] All users:', allUsers.map((u: any) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        status: u.status,
        role: u.role,
        clinic_id: u.clinic_id,
        clinic_name: u.clinic?.name
      })))
      console.log('[Master] Users by status:', {
        pending: allUsers.filter((u: any) => u.status === 'pending').length,
        active: allUsers.filter((u: any) => u.status === 'active').length,
        rejected: allUsers.filter((u: any) => u.status === 'rejected').length,
        suspended: allUsers.filter((u: any) => u.status === 'suspended').length,
        other: allUsers.filter((u: any) => !['pending', 'active', 'rejected', 'suspended'].includes(u.status)).length
      })

      const pending = allUsers.filter((u: any) => u.status === 'pending')
      setPendingUsers(pending)
      console.log('[Master] Pending users:', pending.length)
      console.log('[Master] Pending users details:', pending)

      // 통계 데이터 조회
      const statsResult = await dataService.getSystemStatistics()
      console.log('[Master] Statistics result:', statsResult)
      if (statsResult?.data) {
        setStatistics(statsResult.data)
      }

      console.log('[Master] Data loaded successfully')
    } catch (error) {
      console.error('[Master] 데이터 로드 실패:', error)

      // 네트워크 에러인지 확인
      if (error instanceof TypeError && error.message.includes('fetch')) {
        setDataError('⚠️ 네트워크 연결 오류\n\n서버에 연결할 수 없습니다. 인터넷 연결을 확인해주세요.')
      } else {
        setDataError('⚠️ 예상치 못한 오류가 발생했습니다.\n\n콘솔 로그를 확인해주세요.')
      }

      setClinics([])
      setUsers([])
      setPendingUsers([])
    } finally {
      setLoadingData(false)
    }
  }

  const handleDeleteClinic = async (clinicId: string) => {
    // 병원 정보 조회
    const clinic = clinics.find(c => c.id === clinicId)
    if (!clinic) {
      alert('병원 정보를 찾을 수 없습니다.')
      return
    }

    // 해당 병원의 사용자 수 계산
    const clinicUserCount = users.filter(u => u.clinic_id === clinicId).length

    // 1단계: 상세한 경고 메시지
    const confirmed = confirm(
      `⚠️ 병원 삭제 경고 ⚠️\n\n` +
      `병원명: ${clinic.name}\n` +
      `소속 사용자 수: ${clinicUserCount}명\n\n` +
      `삭제될 데이터:\n` +
      `- 병원 정보\n` +
      `- 소속 직원 ${clinicUserCount}명의 계정 (인증 정보 포함)\n` +
      `- 모든 환자 정보\n` +
      `- 모든 예약 기록\n` +
      `- 모든 근태 기록\n` +
      `- 모든 근로계약서\n` +
      `- 기타 모든 관련 데이터\n\n` +
      `⚠️ 이 작업은 되돌릴 수 없습니다! ⚠️\n\n` +
      `계속하시겠습니까?`
    )

    if (!confirmed) {
      return
    }

    // 2단계: 병원명 타이핑 확인 (실수 방지)
    const typedName = prompt(
      `정말로 삭제하시려면 병원명을 정확히 입력하세요:\n\n"${clinic.name}"`
    )

    if (typedName !== clinic.name) {
      alert('병원명이 일치하지 않습니다. 삭제가 취소되었습니다.')
      return
    }

    try {
      await dataService.deleteClinic(clinicId)
      alert('병원이 삭제되었습니다.')
      loadData()
    } catch (error) {
      console.error('병원 삭제 실패:', error)
      alert('병원 삭제에 실패했습니다.')
    }
  }

  const handleDeleteUser = async (userId: string) => {
    // 사용자 정보 조회 (users 또는 pendingUsers에서)
    const user = users.find(u => u.id === userId) || pendingUsers.find(u => u.id === userId)
    if (!user) {
      alert('사용자 정보를 찾을 수 없습니다.')
      return
    }

    // 1단계: 상세한 경고 메시지
    const confirmed = confirm(
      `⚠️ 사용자 삭제 경고 ⚠️\n\n` +
      `이름: ${user.name}\n` +
      `이메일: ${user.email}\n` +
      `역할: ${user.role}\n` +
      `소속: ${user.clinic?.name || '미지정'}\n\n` +
      `삭제될 데이터:\n` +
      `- 사용자 계정 (인증 정보 포함)\n` +
      `- 근태 기록\n` +
      `- 근로계약서\n` +
      `- 기타 모든 관련 데이터\n\n` +
      `⚠️ 이 작업은 되돌릴 수 없습니다! ⚠️\n\n` +
      `계속하시겠습니까?`
    )

    if (!confirmed) {
      return
    }

    // 2단계: 이름 타이핑 확인 (실수 방지)
    const typedName = prompt(
      `정말로 삭제하시려면 사용자 이름을 정확히 입력하세요:\n\n"${user.name}"`
    )

    if (typedName !== user.name) {
      alert('이름이 일치하지 않습니다. 삭제가 취소되었습니다.')
      return
    }

    try {
      const result = await dataService.deleteUser(userId)
      if (result.error) {
        console.error('사용자 삭제 실패:', result.error)
        alert('사용자 삭제에 실패했습니다: ' + result.error)
        return
      }
      alert('사용자가 삭제되었습니다.')
      loadData()
    } catch (error) {
      console.error('사용자 삭제 실패:', error)
      alert('사용자 삭제에 실패했습니다.')
    }
  }

  const handleApproveUser = async (userId: string, clinicId: string) => {
    try {
      const result = await dataService.approveUser(userId, clinicId)
      if (result.success) {
        alert('사용자가 승인되었습니다.')
        loadData()
      } else {
        alert('승인 실패: ' + (result.error || '알 수 없는 오류'))
      }
    } catch (error) {
      console.error('사용자 승인 실패:', error)
      alert('사용자 승인에 실패했습니다.')
    }
  }

  const handleRejectUser = async (userId: string, clinicId: string) => {
    const reason = prompt('거절 사유를 입력하세요:')
    if (!reason) return

    try {
      const result = await dataService.rejectUser(userId, clinicId, reason)
      if (result.success) {
        alert('사용자가 거절되었습니다.')
        loadData()
      } else {
        alert('거절 실패: ' + (result.error || '알 수 없는 오류'))
      }
    } catch (error) {
      console.error('사용자 거절 실패:', error)
      alert('사용자 거절에 실패했습니다.')
    }
  }

  const handleToggleClinicStatus = async (clinicId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'suspended' : 'active'
    const action = newStatus === 'suspended' ? '중지' : '활성화'

    if (!confirm(`이 병원을 ${action}하시겠습니까?`)) {
      return
    }

    try {
      const result = await dataService.updateClinicStatus(clinicId, newStatus)
      if (result.success) {
        alert(`병원이 ${action}되었습니다.`)
        loadData()
      } else {
        alert(`${action} 실패: ` + (result.error || '알 수 없는 오류'))
      }
    } catch (error) {
      console.error(`병원 상태 변경 실패:`, error)
      alert(`병원 ${action}에 실패했습니다.`)
    }
  }

  const handleViewClinicUsers = async (clinic: any) => {
    setSelectedClinic(clinic)
    setShowUsersModal(true)
    setLoadingClinicUsers(true)
    setClinicUsers([])

    try {
      const result = await dataService.getUsersByClinic(clinic.id)
      if (result.data) {
        setClinicUsers(result.data)
      } else {
        alert('사용자 목록 조회 실패: ' + (result.error || '알 수 없는 오류'))
      }
    } catch (error) {
      console.error('사용자 목록 조회 실패:', error)
      alert('사용자 목록을 불러오는데 실패했습니다.')
    } finally {
      setLoadingClinicUsers(false)
    }
  }

  if (loading || loadingData) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header Component */}
      <div className="max-w-7xl mx-auto px-4 py-4">
        <Header
          dbStatus="connected"
          user={user}
          onLogout={logout}
        />
      </div>

      {/* 헤더 */}
      <div className="bg-gradient-to-r from-purple-600 to-purple-700 text-white">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold">마스터 관리자 대시보드</h1>
              <p className="text-purple-100">시스템 전체 관리</p>
            </div>
            <button
              onClick={() => router.push('/dashboard')}
              className="bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg transition-colors"
            >
              일반 대시보드로
            </button>
          </div>
        </div>
      </div>

      {/* 탭 메뉴 */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex space-x-8">
            <button
              onClick={() => setActiveTab('pending')}
              className={`py-4 px-2 border-b-2 font-medium text-sm transition-colors relative ${
                activeTab === 'pending'
                  ? 'border-purple-600 text-purple-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <UserIcon className="w-5 h-5 inline-block mr-2" />
              승인 대기
              {pendingUsers.length > 0 && (
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {pendingUsers.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab('overview')}
              className={`py-4 px-2 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'overview'
                  ? 'border-purple-600 text-purple-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <ChartBarIcon className="w-5 h-5 inline-block mr-2" />
              개요
            </button>
            <button
              onClick={() => setActiveTab('clinics')}
              className={`py-4 px-2 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'clinics'
                  ? 'border-purple-600 text-purple-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <BuildingOffice2Icon className="w-5 h-5 inline-block mr-2" />
              병원 관리
            </button>
            <button
              onClick={() => setActiveTab('users')}
              className={`py-4 px-2 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'users'
                  ? 'border-purple-600 text-purple-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <UsersIcon className="w-5 h-5 inline-block mr-2" />
              사용자 관리
            </button>
            <button
              onClick={() => setActiveTab('statistics')}
              className={`py-4 px-2 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'statistics'
                  ? 'border-purple-600 text-purple-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <ChartBarIcon className="w-5 h-5 inline-block mr-2" />
              통계
            </button>
          </div>
        </div>
      </div>

      {/* 컨텐츠 영역 */}
      <div className="max-w-7xl mx-auto px-4 py-8">
        {activeTab === 'pending' && (
          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b">
              <h2 className="text-xl font-semibold">승인 대기 중인 사용자</h2>
              <p className="text-sm text-gray-500 mt-1">새로 가입한 사용자를 승인하거나 거절할 수 있습니다.</p>
            </div>
            {dataError ? (
              <div className="p-8">
                <div className="bg-red-50 border-2 border-red-300 rounded-lg p-6">
                  <div className="flex items-start">
                    <div className="flex-shrink-0">
                      <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                      </svg>
                    </div>
                    <div className="ml-3 flex-1">
                      <h3 className="text-lg font-medium text-red-800 mb-2">데이터 로드 실패</h3>
                      <p className="text-sm text-red-700 whitespace-pre-line">{dataError}</p>
                      <div className="mt-4">
                        <button
                          onClick={loadData}
                          className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-md text-sm font-medium transition-colors"
                        >
                          다시 시도
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : pendingUsers.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                승인 대기 중인 사용자가 없습니다.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">이름</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">이메일</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">이메일 인증</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">전화번호</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">소속 병원</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">역할</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">가입일</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">작업</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {pendingUsers.map((user) => (
                      <tr key={user.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 text-sm font-medium text-gray-900">{user.name}</td>
                        <td className="px-6 py-4 text-sm text-gray-500">{user.email}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            user.email_verified
                              ? 'bg-green-100 text-green-800'
                              : 'bg-yellow-100 text-yellow-800'
                          }`}>
                            {user.email_verified ? '✓ 인증완료' : '⚠️ 미인증'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">{user.phone || '-'}</td>
                        <td className="px-6 py-4 text-sm text-gray-500">{user.clinic?.name || '-'}</td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            user.role === 'owner' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'
                          }`}>
                            {user.role === 'owner' ? '대표원장' : user.role}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {new Date(user.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4">
                          <div className="flex space-x-2">
                            <button
                              onClick={() => handleApproveUser(user.id, user.clinic_id)}
                              className="bg-green-600 hover:bg-green-700 text-white px-3 py-1 rounded text-sm font-medium"
                            >
                              승인
                            </button>
                            <button
                              onClick={() => handleRejectUser(user.id, user.clinic_id)}
                              className="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm font-medium"
                            >
                              거절
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {activeTab === 'overview' && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-sm font-medium text-gray-500">총 병원 수</h3>
              <p className="text-3xl font-bold text-purple-600 mt-2">{clinics.length}</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-sm font-medium text-gray-500">총 사용자 수</h3>
              <p className="text-3xl font-bold text-blue-600 mt-2">{users.length}</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-sm font-medium text-gray-500">총 환자 수</h3>
              <p className="text-3xl font-bold text-green-600 mt-2">{statistics.totalPatients}</p>
            </div>
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-sm font-medium text-gray-500">총 예약 수</h3>
              <p className="text-3xl font-bold text-orange-600 mt-2">{statistics.totalAppointments}</p>
            </div>
          </div>
        )}

        {activeTab === 'clinics' && (
          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b">
              <h2 className="text-xl font-semibold">병원 목록</h2>
              <p className="text-sm text-gray-500 mt-1">병원 계정을 관리하고 상태를 변경할 수 있습니다.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">병원명</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">대표자</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">이메일</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">전화번호</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">상태</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">공개 여부</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">작업</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {clinics.map((clinic) => (
                    <tr key={clinic.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">{clinic.name}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">{clinic.owner_name}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">{clinic.email}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">{clinic.phone}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          clinic.status === 'suspended'
                            ? 'bg-red-100 text-red-800'
                            : 'bg-green-100 text-green-800'
                        }`}>
                          {clinic.status === 'suspended' ? '중지됨' : '활성'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          clinic.is_public ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-800'
                        }`}>
                          {clinic.is_public ? '공개' : '비공개'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleViewClinicUsers(clinic)}
                            className="text-blue-600 hover:text-blue-900 text-sm font-medium"
                            title="병원 회원 보기"
                          >
                            회원 보기
                          </button>
                          <button
                            onClick={() => handleToggleClinicStatus(clinic.id, clinic.status || 'active')}
                            className={`text-sm font-medium ${
                              clinic.status === 'suspended'
                                ? 'text-green-600 hover:text-green-900'
                                : 'text-orange-600 hover:text-orange-900'
                            }`}
                            title={clinic.status === 'suspended' ? '활성화' : '중지'}
                          >
                            {clinic.status === 'suspended' ? '활성화' : '중지'}
                          </button>
                          <button
                            onClick={() => handleDeleteClinic(clinic.id)}
                            className="text-red-600 hover:text-red-900 text-sm font-medium"
                            title="병원 삭제"
                          >
                            삭제
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'users' && (
          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b">
              <h2 className="text-xl font-semibold">사용자 목록</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">이름</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">이메일</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">역할</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">상태</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">소속 병원</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">생성일</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">작업</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {users.map((user) => (
                    <tr key={user.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">{user.name}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">{user.email}</td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          user.role === 'master_admin' ? 'bg-purple-100 text-purple-800' :
                          user.role === 'owner' ? 'bg-blue-100 text-blue-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {user.role === 'master_admin' ? '마스터' :
                           user.role === 'owner' ? '대표원장' :
                           user.role}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          user.status === 'active' ? 'bg-green-100 text-green-800' :
                          user.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                          user.status === 'rejected' ? 'bg-red-100 text-red-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {user.status === 'active' ? '활성' :
                           user.status === 'pending' ? '승인 대기' :
                           user.status === 'rejected' ? '거절됨' :
                           user.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">{user.clinic?.name || '-'}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {new Date(user.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4">
                        {user.role !== 'master_admin' && (
                          <button
                            onClick={() => handleDeleteUser(user.id)}
                            className="text-red-600 hover:text-red-900 text-sm font-medium"
                          >
                            삭제
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {activeTab === 'statistics' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-semibold mb-4">병원별 통계</h3>
              <div className="space-y-4">
                {clinics.slice(0, 5).map((clinic) => (
                  <div key={clinic.id} className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">{clinic.name}</span>
                    <span className="text-sm font-medium">{clinic.patients_count || 0} 환자</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white p-6 rounded-lg shadow">
              <h3 className="text-lg font-semibold mb-4">사용자 역할 분포</h3>
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">마스터 관리자</span>
                  <span className="text-sm font-medium">{users.filter(u => u.role === 'master_admin').length}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">대표원장</span>
                  <span className="text-sm font-medium">{users.filter(u => u.role === 'owner').length}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-gray-600">직원</span>
                  <span className="text-sm font-medium">{users.filter(u => u.role === 'staff').length}</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 병원 회원 목록 모달 */}
      {showUsersModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="p-6 border-b flex justify-between items-center">
              <div>
                <h2 className="text-xl font-semibold">{selectedClinic?.name} - 회원 목록</h2>
                <p className="text-sm text-gray-500 mt-1">
                  대표자: {selectedClinic?.owner_name} | 총 {clinicUsers.length}명
                </p>
              </div>
              <button
                onClick={() => setShowUsersModal(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
                title="닫기"
              >
                ×
              </button>
            </div>
            <div className="p-6 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 140px)' }}>
              {loadingClinicUsers ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                </div>
              ) : clinicUsers.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  등록된 회원이 없습니다.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">이름</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">이메일</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">전화번호</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">역할</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">상태</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">가입일</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {clinicUsers.map((user) => (
                        <tr key={user.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm font-medium text-gray-900">{user.name}</td>
                          <td className="px-4 py-3 text-sm text-gray-500">{user.email}</td>
                          <td className="px-4 py-3 text-sm text-gray-500">{user.phone || '-'}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 text-xs rounded-full ${
                              user.role === 'owner'
                                ? 'bg-blue-100 text-blue-800'
                                : user.role === 'vice_director'
                                ? 'bg-purple-100 text-purple-800'
                                : user.role === 'manager'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}>
                              {user.role === 'owner'
                                ? '대표원장'
                                : user.role === 'vice_director'
                                ? '부원장'
                                : user.role === 'manager'
                                ? '실장'
                                : user.role}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 text-xs rounded-full ${
                              user.status === 'active'
                                ? 'bg-green-100 text-green-800'
                                : user.status === 'pending'
                                ? 'bg-yellow-100 text-yellow-800'
                                : user.status === 'rejected'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}>
                              {user.status === 'active'
                                ? '활성'
                                : user.status === 'pending'
                                ? '승인 대기'
                                : user.status === 'rejected'
                                ? '거절됨'
                                : user.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-500">
                            {new Date(user.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="p-4 border-t bg-gray-50 flex justify-end">
              <button
                onClick={() => setShowUsersModal(false)}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded-lg font-medium transition-colors"
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