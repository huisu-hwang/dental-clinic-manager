'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { dataService } from '@/lib/dataService'
import { UserIcon, BuildingOffice2Icon, ChartBarIcon, UsersIcon, ClockIcon, SparklesIcon } from '@heroicons/react/24/outline'
import type { UserActivityLog } from '@/types/auth'
import Header from '@/components/Layout/Header'

import AdminCategoryManager from '@/components/Community/AdminCategoryManager'
import AdminTelegramManager from '@/components/Telegram/AdminTelegramManager'
import { appConfirm, appAlert, appPrompt } from '@/components/ui/AppDialog'

type TabType = 'overview' | 'clinics' | 'users' | 'pending' | 'statistics' | 'community' | 'worker' | 'scraping'
type CommunitySubTab = 'categories' | 'telegram'

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
  const [communitySubTab, setCommunitySubTab] = useState<CommunitySubTab>('categories')

  // 활동 기록 관련 상태
  const [showActivityModal, setShowActivityModal] = useState(false)
  const [selectedUserForActivity, setSelectedUserForActivity] = useState<any>(null)
  const [activityLogs, setActivityLogs] = useState<UserActivityLog[]>([])
  const [loadingActivity, setLoadingActivity] = useState(false)
  const [activityTotal, setActivityTotal] = useState(0)

  // 사용자 편집 관련 상태
  const [showEditModal, setShowEditModal] = useState(false)
  const [editingUser, setEditingUser] = useState<any>(null)
  const [editRole, setEditRole] = useState('')
  const [editStatus, setEditStatus] = useState('')
  const [editClinicId, setEditClinicId] = useState('')
  const [savingEdit, setSavingEdit] = useState(false)

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
        await appAlert('마스터 관리자 권한이 필요합니다.')
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
      await appAlert('병원 정보를 찾을 수 없습니다.')
      return
    }

    // 해당 병원의 사용자 수 계산
    const clinicUserCount = users.filter(u => u.clinic_id === clinicId).length

    // 1단계: 상세한 경고 메시지
    const confirmed = await appConfirm(
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
    const typedName = await appPrompt(
      `정말로 삭제하시려면 병원명을 정확히 입력하세요:\n\n"${clinic.name}"`
    )

    if (typedName !== clinic.name) {
      await appAlert('병원명이 일치하지 않습니다. 삭제가 취소되었습니다.')
      return
    }

    try {
      await dataService.deleteClinic(clinicId)
      await appAlert('병원이 삭제되었습니다.')
      loadData()
    } catch (error) {
      console.error('병원 삭제 실패:', error)
      await appAlert('병원 삭제에 실패했습니다.')
    }
  }

  const handleDeleteUser = async (userId: string) => {
    // 사용자 정보 조회 (users 또는 pendingUsers에서)
    const user = users.find(u => u.id === userId) || pendingUsers.find(u => u.id === userId)
    if (!user) {
      await appAlert('사용자 정보를 찾을 수 없습니다.')
      return
    }

    // 1단계: 상세한 경고 메시지
    const confirmed = await appConfirm(
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
    const typedName = await appPrompt(
      `정말로 삭제하시려면 사용자 이름을 정확히 입력하세요:\n\n"${user.name}"`
    )

    if (typedName !== user.name) {
      await appAlert('이름이 일치하지 않습니다. 삭제가 취소되었습니다.')
      return
    }

    try {
      const result = await dataService.deleteUser(userId)
      if (result.error) {
        console.error('사용자 삭제 실패:', result.error)
        await appAlert('사용자 삭제에 실패했습니다: ' + result.error)
        return
      }
      await appAlert('사용자가 삭제되었습니다.')
      loadData()
    } catch (error) {
      console.error('사용자 삭제 실패:', error)
      await appAlert('사용자 삭제에 실패했습니다.')
    }
  }

  const handleApproveUser = async (userId: string, clinicId: string) => {
    try {
      const result = await dataService.approveUser(userId, clinicId)
      if (result.success) {
        await appAlert('사용자가 승인되었습니다.')
        loadData()
      } else {
        await appAlert('승인 실패: ' + (result.error || '알 수 없는 오류'))
      }
    } catch (error) {
      console.error('사용자 승인 실패:', error)
      await appAlert('사용자 승인에 실패했습니다.')
    }
  }

  const handleRejectUser = async (userId: string, clinicId: string) => {
    const reason = await appPrompt('거절 사유를 입력하세요:')
    if (!reason) return

    try {
      const result = await dataService.rejectUser(userId, clinicId, reason)
      if (result.success) {
        await appAlert('사용자가 거절되었습니다.')
        loadData()
      } else {
        await appAlert('거절 실패: ' + (result.error || '알 수 없는 오류'))
      }
    } catch (error) {
      console.error('사용자 거절 실패:', error)
      await appAlert('사용자 거절에 실패했습니다.')
    }
  }

  // 사용자 편집 모달 열기
  const handleEditUser = (targetUser: any) => {
    setEditingUser(targetUser)
    setEditRole(targetUser.role || '')
    setEditStatus(targetUser.status || '')
    setEditClinicId(targetUser.clinic_id || '')
    setShowEditModal(true)
  }

  // 사용자 정보 저장
  const handleSaveEdit = async () => {
    if (!editingUser) return

    setSavingEdit(true)
    try {
      const response = await fetch('/api/admin/users/update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: editingUser.id,
          role: editRole,
          status: editStatus,
          clinicId: editClinicId || null,
        })
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        await appAlert('수정 실패: ' + (result.error || '알 수 없는 오류'))
        return
      }

      await appAlert('사용자 정보가 수정되었습니다.')
      setShowEditModal(false)
      setEditingUser(null)
      loadData()
    } catch (error) {
      console.error('사용자 수정 실패:', error)
      await appAlert('사용자 수정에 실패했습니다.')
    } finally {
      setSavingEdit(false)
    }
  }

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      master_admin: '마스터 관리자',
      owner: '대표원장',
      vice_director: '부원장',
      manager: '실장',
      team_leader: '팀장',
      staff: '직원',
    }
    return labels[role] || role
  }

  const getStatusLabel = (status: string) => {
    const labels: Record<string, string> = {
      active: '활성',
      pending: '승인 대기',
      suspended: '정지',
      rejected: '거절됨',
    }
    return labels[status] || status
  }

  const handleToggleClinicStatus = async (clinicId: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'suspended' : 'active'
    const action = newStatus === 'suspended' ? '중지' : '활성화'

    if (!await appConfirm(`이 병원을 ${action}하시겠습니까?`)) {
      return
    }

    try {
      const result = await dataService.updateClinicStatus(clinicId, newStatus)
      if (result.success) {
        await appAlert(`병원이 ${action}되었습니다.`)
        loadData()
      } else {
        await appAlert(`${action} 실패: ` + (result.error || '알 수 없는 오류'))
      }
    } catch (error) {
      console.error(`병원 상태 변경 실패:`, error)
      await appAlert(`병원 ${action}에 실패했습니다.`)
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
        await appAlert('사용자 목록 조회 실패: ' + (result.error || '알 수 없는 오류'))
      }
    } catch (error) {
      console.error('사용자 목록 조회 실패:', error)
      await appAlert('사용자 목록을 불러오는데 실패했습니다.')
    } finally {
      setLoadingClinicUsers(false)
    }
  }

  // 사용자 활동 기록 조회
  const handleViewActivity = async (user: any) => {
    setSelectedUserForActivity(user)
    setShowActivityModal(true)
    setLoadingActivity(true)
    setActivityLogs([])
    setActivityTotal(0)

    try {
      const response = await fetch(`/api/admin/users/${user.id}/activity?limit=50`)
      const result = await response.json()

      if (result.data) {
        setActivityLogs(result.data.activities || [])
        setActivityTotal(result.data.total || 0)
      } else {
        console.error('활동 기록 조회 실패:', result.error)
      }
    } catch (error) {
      console.error('활동 기록 조회 실패:', error)
    } finally {
      setLoadingActivity(false)
    }
  }

  // 상대적 시간 포맷팅
  const formatRelativeTime = (dateString: string | null) => {
    if (!dateString) return '-'

    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return '방금 전'
    if (diffMins < 60) return `${diffMins}분 전`
    if (diffHours < 24) return `${diffHours}시간 전`
    if (diffDays < 7) return `${diffDays}일 전`
    return date.toLocaleDateString('ko-KR')
  }

  // 활동 타입 라벨
  const getActivityTypeLabel = (type: string) => {
    switch (type) {
      case 'login': return '로그인'
      case 'logout': return '로그아웃'
      case 'access': return '접속'
      case 'page_view': return '페이지 조회'
      case 'action': return '작업'
      default: return type
    }
  }

  // 활동 타입 색상
  const getActivityTypeColor = (type: string) => {
    switch (type) {
      case 'login': return 'bg-green-100 text-green-800'
      case 'logout': return 'bg-gray-100 text-gray-800'
      case 'access': return 'bg-teal-100 text-teal-800'
      case 'page_view': return 'bg-blue-100 text-blue-800'
      case 'action': return 'bg-purple-100 text-purple-800'
      default: return 'bg-gray-100 text-gray-800'
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
            <button
              onClick={() => setActiveTab('community')}
              className={`py-4 px-2 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'community'
                  ? 'border-purple-600 text-purple-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 inline-block mr-2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.568 3H5.25A2.25 2.25 0 0 0 3 5.25v4.318c0 .597.237 1.17.659 1.591l9.581 9.581c.699.699 1.78.872 2.607.33a18.095 18.095 0 0 0 5.223-5.223c.542-.827.369-1.908-.33-2.607L11.16 3.66A2.25 2.25 0 0 0 9.568 3Z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h.008v.008H6V6Z" />
              </svg>
              커뮤니티 관리
            </button>
            <button
              onClick={() => setActiveTab('worker')}
              className={`py-4 px-2 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'worker'
                  ? 'border-purple-600 text-purple-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <SparklesIcon className="w-5 h-5 inline-block mr-2" />
              마케팅 워커
            </button>
            <button
              onClick={() => setActiveTab('scraping')}
              className={`py-4 px-2 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'scraping'
                  ? 'border-purple-600 text-purple-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5 inline-block mr-2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 14.25h13.5m-13.5 0a3 3 0 0 1-3-3m3 3a3 3 0 1 0 6 0m-6 0H3m16.5 0a3 3 0 0 0 3-3m-3 3a3 3 0 1 1-6 0m6 0h1.5m-1.5 0H12m-8.457 3.077 1.41-.513m14.095-5.13 1.41-.513M5.106 17.785l1.15-.065M17.032 15.32l1.15-.065M6.938 4.503l.351.208m9.925 5.729.351.208M3.988 8.087l1.41.513m14.095 5.13 1.41.513M5.106 6.215l1.15.065M17.032 8.68l1.15.065" />
              </svg>
              스크래핑 워커
            </button>
            <button
              onClick={() => router.push('/master/marketing/prompts')}
              className="py-4 px-2 border-b-2 font-medium text-sm transition-colors border-transparent text-gray-500 hover:text-gray-700"
            >
              <SparklesIcon className="w-5 h-5 inline-block mr-2" />
              프롬프트 관리
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
              <p className="text-sm text-gray-500 mt-1">각 사용자의 최근 로그인 및 활동 기록을 확인할 수 있습니다.</p>
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
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">최근 로그인</th>
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
                          user.role === 'vice_director' ? 'bg-indigo-100 text-indigo-800' :
                          user.role === 'manager' ? 'bg-teal-100 text-teal-800' :
                          user.role === 'team_leader' ? 'bg-cyan-100 text-cyan-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {getRoleLabel(user.role)}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <span className={`px-2 py-1 text-xs rounded-full ${
                          user.status === 'active' ? 'bg-green-100 text-green-800' :
                          user.status === 'pending' ? 'bg-yellow-100 text-yellow-800' :
                          user.status === 'suspended' ? 'bg-orange-100 text-orange-800' :
                          user.status === 'rejected' ? 'bg-red-100 text-red-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {getStatusLabel(user.status)}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">{user.clinic?.name || '-'}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        <div className="flex items-center">
                          <ClockIcon className="w-4 h-4 mr-1 text-gray-400" />
                          <span title={user.last_login_at ? new Date(user.last_login_at).toLocaleString('ko-KR') : '기록 없음'}>
                            {formatRelativeTime(user.last_login_at)}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {new Date(user.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleViewActivity(user)}
                            className="text-blue-600 hover:text-blue-900 text-sm font-medium"
                            title="활동 기록 보기"
                          >
                            활동 기록
                          </button>
                          {user.role !== 'master_admin' && (
                            <>
                              <button
                                onClick={() => handleEditUser(user)}
                                className="text-indigo-600 hover:text-indigo-900 text-sm font-medium"
                              >
                                수정
                              </button>
                              <button
                                onClick={() => handleDeleteUser(user.id)}
                                className="text-red-600 hover:text-red-900 text-sm font-medium"
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

        {activeTab === 'worker' && <WorkerPanel />}

        {activeTab === 'scraping' && <ScrapingWorkerPanel />}

        {activeTab === 'community' && (
          <div className="bg-white rounded-lg shadow">
            <div className="p-6 border-b">
              <h2 className="text-xl font-semibold">커뮤니티 관리</h2>
              <p className="text-sm text-gray-500 mt-1">게시판 주제 관리 및 텔레그램 연동을 설정할 수 있습니다.</p>
            </div>
            {/* 커뮤니티 서브탭 */}
            <div className="border-b border-gray-200">
              <nav className="flex space-x-1 px-6 pt-2">
                <button
                  onClick={() => setCommunitySubTab('categories')}
                  className={`py-2.5 px-4 text-sm font-medium rounded-t-lg transition-colors ${
                    communitySubTab === 'categories'
                      ? 'bg-purple-50 text-purple-700 border-b-2 border-purple-600'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  주제 관리
                </button>
                <button
                  onClick={() => setCommunitySubTab('telegram')}
                  className={`py-2.5 px-4 text-sm font-medium rounded-t-lg transition-colors ${
                    communitySubTab === 'telegram'
                      ? 'bg-purple-50 text-purple-700 border-b-2 border-purple-600'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  텔레그램 연동
                </button>
              </nav>
            </div>
            <div className="p-6">
              {communitySubTab === 'categories' && <AdminCategoryManager />}
              {communitySubTab === 'telegram' && <AdminTelegramManager />}
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

      {/* 사용자 편집 모달 */}
      {showEditModal && editingUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full">
            <div className="p-6 border-b flex justify-between items-center">
              <div>
                <h2 className="text-xl font-semibold">사용자 정보 수정</h2>
                <p className="text-sm text-gray-500 mt-1">{editingUser.name} ({editingUser.email})</p>
              </div>
              <button
                onClick={() => { setShowEditModal(false); setEditingUser(null) }}
                className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
              >
                &times;
              </button>
            </div>
            <div className="p-6 space-y-5">
              {/* 역할 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">역할</label>
                <select
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="owner">대표원장</option>
                  <option value="vice_director">부원장</option>
                  <option value="manager">실장</option>
                  <option value="team_leader">팀장</option>
                  <option value="staff">직원</option>
                </select>
              </div>

              {/* 상태 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">상태</label>
                <select
                  value={editStatus}
                  onChange={(e) => setEditStatus(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="active">활성</option>
                  <option value="pending">승인 대기</option>
                  <option value="suspended">정지</option>
                  <option value="rejected">거절됨</option>
                </select>
              </div>

              {/* 소속 병원 */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">소속 병원</label>
                <select
                  value={editClinicId}
                  onChange={(e) => setEditClinicId(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="">소속 없음</option>
                  {clinics.map((clinic) => (
                    <option key={clinic.id} value={clinic.id}>{clinic.name}</option>
                  ))}
                </select>
              </div>

              {/* 변경 사항 미리보기 */}
              {(editRole !== editingUser.role || editStatus !== editingUser.status || editClinicId !== (editingUser.clinic_id || '')) && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                  <p className="text-sm font-medium text-amber-800 mb-2">변경 사항</p>
                  <ul className="text-sm text-amber-700 space-y-1">
                    {editRole !== editingUser.role && (
                      <li>역할: {getRoleLabel(editingUser.role)} → <span className="font-medium">{getRoleLabel(editRole)}</span></li>
                    )}
                    {editStatus !== editingUser.status && (
                      <li>상태: {getStatusLabel(editingUser.status)} → <span className="font-medium">{getStatusLabel(editStatus)}</span></li>
                    )}
                    {editClinicId !== (editingUser.clinic_id || '') && (
                      <li>소속: {editingUser.clinic?.name || '없음'} → <span className="font-medium">{clinics.find(c => c.id === editClinicId)?.name || '없음'}</span></li>
                    )}
                  </ul>
                </div>
              )}
            </div>
            <div className="p-6 border-t flex justify-end space-x-3">
              <button
                onClick={() => { setShowEditModal(false); setEditingUser(null) }}
                className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
              >
                취소
              </button>
              <button
                onClick={handleSaveEdit}
                disabled={savingEdit || (editRole === editingUser.role && editStatus === editingUser.status && editClinicId === (editingUser.clinic_id || ''))}
                className="px-4 py-2 text-sm text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {savingEdit ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 사용자 활동 기록 모달 */}
      {showActivityModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
            <div className="p-6 border-b flex justify-between items-center">
              <div>
                <h2 className="text-xl font-semibold">사용자 활동 기록</h2>
                <p className="text-sm text-gray-500 mt-1">
                  {selectedUserForActivity?.name} ({selectedUserForActivity?.email}) | 총 {activityTotal}건의 활동 기록
                </p>
              </div>
              <button
                onClick={() => setShowActivityModal(false)}
                className="text-gray-400 hover:text-gray-600 text-2xl font-bold"
                title="닫기"
              >
                ×
              </button>
            </div>

            {/* 사용자 요약 정보 */}
            <div className="p-4 bg-gray-50 border-b">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                  <span className="text-gray-500">역할:</span>{' '}
                  <span className="font-medium">
                    {selectedUserForActivity?.role === 'master_admin' ? '마스터' :
                     selectedUserForActivity?.role === 'owner' ? '대표원장' :
                     selectedUserForActivity?.role}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">소속 병원:</span>{' '}
                  <span className="font-medium">{selectedUserForActivity?.clinic?.name || '-'}</span>
                </div>
                <div>
                  <span className="text-gray-500">최근 로그인:</span>{' '}
                  <span className="font-medium">{formatRelativeTime(selectedUserForActivity?.last_login_at)}</span>
                </div>
                <div>
                  <span className="text-gray-500">가입일:</span>{' '}
                  <span className="font-medium">
                    {selectedUserForActivity?.created_at ? new Date(selectedUserForActivity.created_at).toLocaleDateString('ko-KR') : '-'}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-6 overflow-y-auto" style={{ maxHeight: 'calc(90vh - 280px)' }}>
              {loadingActivity ? (
                <div className="flex items-center justify-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
                </div>
              ) : activityLogs.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  <ClockIcon className="w-12 h-12 mx-auto text-gray-300 mb-4" />
                  <p>활동 기록이 없습니다.</p>
                  <p className="text-sm mt-2">사용자가 로그인하면 활동 기록이 표시됩니다.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {activityLogs.map((activity) => (
                    <div
                      key={activity.id}
                      className="flex items-start p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex-shrink-0 mr-4">
                        <span className={`px-2 py-1 text-xs rounded-full ${getActivityTypeColor(activity.activity_type)}`}>
                          {getActivityTypeLabel(activity.activity_type)}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900">
                          {activity.activity_description}
                        </p>
                        <div className="mt-1 flex items-center gap-4 text-xs text-gray-500">
                          <span title={new Date(activity.created_at).toLocaleString('ko-KR')}>
                            {new Date(activity.created_at).toLocaleString('ko-KR')}
                          </span>
                          {activity.ip_address && activity.ip_address !== 'unknown' && (
                            <span>IP: {activity.ip_address}</span>
                          )}
                        </div>
                        {activity.metadata && Object.keys(activity.metadata).length > 0 && (
                          <div className="mt-2 text-xs text-gray-500">
                            {activity.metadata.clinic_name && (
                              <span className="mr-3">병원: {activity.metadata.clinic_name}</span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 border-t bg-gray-50 flex justify-end">
              <button
                onClick={() => setShowActivityModal(false)}
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

// ─── 스크래핑 워커 제어 패널 ───
type ScrapingWorker = {
  id: string
  hostname: string
  status: 'idle' | 'busy' | 'offline'
  stop_requested: boolean
  last_heartbeat: string
  started_at: string
  current_job_id: string | null
  metadata: { node_version?: string; platform?: string; arch?: string } | null
}

type ScrapingJob = {
  id: string
  clinic_id: string
  status: string
  data_types: string[] | null
  created_at: string
  completed_at: string | null
  error_message: string | null
}

function ScrapingWorkerPanel() {
  const [data, setData] = useState<{
    workers: ScrapingWorker[]
    onlineCount: number
    pendingJobsCount: number
    recentJobs: ScrapingJob[]
  } | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isStopping, setIsStopping] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const [msg, setMsg] = useState<{ type: 'success' | 'error'; text: string; cmd?: string } | null>(null)

  const fetchStatus = async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/master/scraping-worker')
      const json = await res.json()
      if (res.ok) setData(json)
    } catch {
      console.error('스크래핑 워커 상태 조회 실패')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 15000)
    return () => clearInterval(interval)
  }, [])

  const handleStart = async () => {
    setIsStarting(true)
    setMsg(null)
    try {
      const res = await fetch('/api/master/scraping-worker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' }),
      })
      const json = await res.json()
      setMsg({
        type: json.ok ? 'success' : 'error',
        text: json.message,
        cmd: json.manualCommand,
      })
      if (json.ok) setTimeout(fetchStatus, 6000)
    } catch {
      setMsg({ type: 'error', text: '요청 실패' })
    } finally {
      setIsStarting(false)
    }
  }

  const handleStop = async () => {
    if (!confirm('스크래핑 워커를 중지하시겠습니까?\n다음 heartbeat(최대 30초) 후 중지됩니다.')) return
    setIsStopping(true)
    setMsg(null)
    try {
      const res = await fetch('/api/master/scraping-worker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop' }),
      })
      const json = await res.json()
      setMsg({ type: json.ok ? 'success' : 'error', text: json.message })
      if (json.ok) setTimeout(fetchStatus, 5000)
    } catch {
      setMsg({ type: 'error', text: '요청 실패' })
    } finally {
      setIsStopping(false)
    }
  }

  const isOnline = (data?.onlineCount ?? 0) > 0

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-700'
      case 'failed': return 'bg-red-100 text-red-700'
      case 'running': return 'bg-blue-100 text-blue-700'
      case 'pending': return 'bg-yellow-100 text-yellow-700'
      case 'cancelled': return 'bg-gray-100 text-gray-700'
      default: return 'bg-gray-100 text-gray-600'
    }
  }

  const getStatusLabel = (status: string) => {
    const map: Record<string, string> = {
      completed: '완료', failed: '실패', running: '실행중', pending: '대기', cancelled: '취소',
    }
    return map[status] || status
  }

  return (
    <div className="space-y-6">
      {/* 상태 카드 */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-semibold">홈택스 스크래핑 워커</h2>
          <button
            onClick={fetchStatus}
            disabled={isLoading}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-50"
          >
            <ClockIcon className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            새로고침
          </button>
        </div>

        {isLoading && !data ? (
          <div className="text-center py-8 text-gray-400 text-sm">로딩 중...</div>
        ) : data ? (
          <>
            {/* 온라인 상태 */}
            <div className="flex items-center gap-4 mb-6">
              <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border ${
                isOnline
                  ? 'bg-green-50 border-green-200 text-green-700'
                  : 'bg-red-50 border-red-200 text-red-700'
              }`}>
                <div className={`w-2.5 h-2.5 rounded-full ${
                  isOnline ? 'bg-green-500 animate-pulse' : 'bg-red-400'
                }`} />
                <span className="font-medium text-sm">
                  {isOnline ? `워커 실행 중 (${data.onlineCount}개)` : '워커 중지됨'}
                </span>
              </div>
            </div>

            {/* 통계 */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <div className="text-xs text-amber-600 mb-1">대기/실행 중인 동기화</div>
                <div className="text-2xl font-bold text-amber-700">{data.pendingJobsCount}건</div>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                <div className="text-xs text-blue-600 mb-1">등록된 워커</div>
                <div className="text-2xl font-bold text-blue-700">{data.workers.length}개</div>
              </div>
            </div>

            {/* 워커 목록 */}
            {data.workers.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-medium text-gray-600 mb-3">워커 상세</h3>
                <div className="space-y-2">
                  {data.workers.map((w) => {
                    const online = w.status !== 'offline' &&
                      Date.now() - new Date(w.last_heartbeat).getTime() < 2 * 60 * 1000
                    return (
                      <div key={w.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg text-sm">
                        <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                          online ? 'bg-green-500 animate-pulse' : 'bg-gray-300'
                        }`} />
                        <span className="font-mono text-xs text-gray-500 w-40 truncate">{w.id}</span>
                        <span className="text-gray-700 font-medium">{w.hostname}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs ${
                          w.status === 'busy' ? 'bg-blue-100 text-blue-700' :
                          w.status === 'idle' ? 'bg-green-100 text-green-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {w.status === 'busy' ? '처리중' : w.status === 'idle' ? '대기중' : '오프라인'}
                        </span>
                        {w.metadata?.platform && (
                          <span className="text-gray-400 text-xs">{w.metadata.platform}/{w.metadata.arch}</span>
                        )}
                        <span className="text-gray-400 text-xs ml-auto">
                          heartbeat: {formatDate(w.last_heartbeat)}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* 버튼 영역 */}
            <div className="space-y-3">
              {isOnline ? (
                <button
                  onClick={handleStop}
                  disabled={isStopping}
                  className="px-5 py-3 bg-red-50 text-red-600 border border-red-200 rounded-xl font-medium hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                >
                  {isStopping ? (
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                      <rect x="6" y="6" width="12" height="12" rx="1" />
                    </svg>
                  )}
                  워커 중지
                </button>
              ) : (
                <div className="space-y-3">
                  <button
                    onClick={handleStart}
                    disabled={isStarting}
                    className="w-full py-3 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                  >
                    {isStarting ? (
                      <>
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        워커 시작 중...
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
                        </svg>
                        워커 시작
                      </>
                    )}
                  </button>
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm">
                    <p className="font-medium text-amber-800 mb-2">수동 시작 방법 (버튼이 작동하지 않을 경우)</p>
                    <code className="block bg-amber-100 text-amber-900 px-3 py-2 rounded-lg text-xs font-mono">
                      cd scraping-worker && npm start
                    </code>
                  </div>
                </div>
              )}

              {msg && (
                <div className={`text-sm px-4 py-2.5 rounded-lg ${
                  msg.type === 'success'
                    ? 'bg-green-50 text-green-700 border border-green-200'
                    : 'bg-red-50 text-red-700 border border-red-200'
                }`}>
                  <p>{msg.text}</p>
                  {msg.cmd && (
                    <code className="block mt-2 bg-white/60 px-2 py-1 rounded text-xs font-mono">{msg.cmd}</code>
                  )}
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>

      {/* 최근 동기화 작업 */}
      {data && data.recentJobs.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">최근 동기화 작업</h3>
          <div className="space-y-2">
            {data.recentJobs.map((job) => (
              <div key={job.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg text-sm">
                <span className={`px-2 py-0.5 rounded-full text-xs flex-shrink-0 ${getStatusColor(job.status)}`}>
                  {getStatusLabel(job.status)}
                </span>
                <span className="text-gray-400 text-xs w-28 flex-shrink-0">{formatDate(job.created_at)}</span>
                <span className="text-gray-500 text-xs font-mono truncate w-32 flex-shrink-0">{job.clinic_id.slice(0, 8)}...</span>
                {job.data_types && (
                  <span className="text-gray-600 text-xs truncate flex-1">
                    {job.data_types.join(', ')}
                  </span>
                )}
                {job.error_message && (
                  <span className="text-red-500 text-xs truncate flex-1">{job.error_message}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── 마케팅 워커 제어 패널 ───
function WorkerPanel() {
  const [status, setStatus] = useState<{
    workerOnline: boolean
    workerUrl: string
    pendingCount: number
    publishedTodayCount: number
    recentLogs: {
      id: string
      platform: string
      status: string
      published_url: string | null
      error_message: string | null
      duration_seconds: number | null
      published_at: string
      item_id: string
    }[]
  } | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isTriggering, setIsTriggering] = useState(false)
  const [isStopping, setIsStopping] = useState(false)
  const [isStarting, setIsStarting] = useState(false)
  const [triggerMsg, setTriggerMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const fetchStatus = async () => {
    setIsLoading(true)
    try {
      const res = await fetch('/api/master/worker')
      const json = await res.json()
      if (res.ok) setStatus(json)
    } catch {
      console.error('워커 상태 조회 실패')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchStatus()
    const interval = setInterval(fetchStatus, 15000) // 15초마다 자동 갱신
    return () => clearInterval(interval)
  }, [])

  const handleTrigger = async () => {
    setIsTriggering(true)
    setTriggerMsg(null)
    try {
      const res = await fetch('/api/master/worker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'trigger' }),
      })
      const json = await res.json()
      if (json.workerOnline) {
        setTriggerMsg({ type: 'success', text: json.message })
        setTimeout(fetchStatus, 3000)
      } else {
        setTriggerMsg({ type: 'error', text: json.message })
      }
    } catch {
      setTriggerMsg({ type: 'error', text: '요청 실패' })
    } finally {
      setIsTriggering(false)
    }
  }

  const handleStop = async () => {
    if (!confirm('마케팅 워커를 중지하시겠습니까?\n현재 발행 중인 작업이 있다면 완료 후 종료됩니다.')) return
    setIsStopping(true)
    setTriggerMsg(null)
    try {
      const res = await fetch('/api/master/worker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop' }),
      })
      const json = await res.json()
      setTriggerMsg({ type: json.ok ? 'success' : 'error', text: json.message })
      if (json.ok) setTimeout(fetchStatus, 1500)
    } catch {
      setTriggerMsg({ type: 'error', text: '요청 실패' })
    } finally {
      setIsStopping(false)
    }
  }

  const handleStart = async () => {
    setIsStarting(true)
    setTriggerMsg(null)
    try {
      const res = await fetch('/api/master/worker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start' }),
      })
      const json = await res.json()
      setTriggerMsg({ type: json.ok ? 'success' : 'error', text: json.message })
      if (json.ok) setTimeout(fetchStatus, 6000)
    } catch {
      setTriggerMsg({ type: 'error', text: '요청 실패' })
    } finally {
      setIsStarting(false)
    }
  }

  const formatDuration = (sec: number | null) => {
    if (!sec) return '-'
    if (sec < 60) return `${sec}초`
    return `${Math.floor(sec / 60)}분 ${sec % 60}초`
  }

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }

  return (
    <div className="space-y-6">
      {/* 상태 카드 */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-semibold">마케팅 워커 상태</h2>
          <button
            onClick={fetchStatus}
            disabled={isLoading}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 transition-colors disabled:opacity-50"
          >
            <ClockIcon className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            새로고침
          </button>
        </div>

        {isLoading && !status ? (
          <div className="text-center py-8 text-gray-400 text-sm">로딩 중...</div>
        ) : status ? (
          <>
            {/* 상태 인디케이터 */}
            <div className="flex items-center gap-4 mb-6">
              <div className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border ${
                status.workerOnline
                  ? 'bg-green-50 border-green-200 text-green-700'
                  : 'bg-red-50 border-red-200 text-red-700'
              }`}>
                <div className={`w-2.5 h-2.5 rounded-full ${
                  status.workerOnline ? 'bg-green-500 animate-pulse' : 'bg-red-400'
                }`} />
                <span className="font-medium text-sm">
                  {status.workerOnline ? '워커 실행 중' : '워커 중지됨'}
                </span>
              </div>
              <span className="text-xs text-gray-400">{status.workerUrl}</span>
            </div>

            {/* 통계 */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <div className="text-xs text-amber-600 mb-1">발행 대기 중</div>
                <div className="text-2xl font-bold text-amber-700">{status.pendingCount}건</div>
              </div>
              <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                <div className="text-xs text-green-600 mb-1">오늘 발행 완료</div>
                <div className="text-2xl font-bold text-green-700">{status.publishedTodayCount}건</div>
              </div>
            </div>

            {/* 버튼 영역 */}
            <div className="space-y-3">
              <div className="flex gap-3">
                <button
                  onClick={handleTrigger}
                  disabled={isTriggering || isStopping || !status.workerOnline}
                  className="flex-1 py-3 bg-purple-600 text-white rounded-xl font-medium hover:bg-purple-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                >
                  {isTriggering ? (
                    <>
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                      처리 중...
                    </>
                  ) : (
                    <>
                      <SparklesIcon className="w-4 h-4" />
                      즉시 발행 처리
                    </>
                  )}
                </button>
                {status.workerOnline && (
                  <button
                    onClick={handleStop}
                    disabled={isStopping || isTriggering}
                    className="px-5 py-3 bg-red-50 text-red-600 border border-red-200 rounded-xl font-medium hover:bg-red-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                  >
                    {isStopping ? (
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                        <rect x="6" y="6" width="12" height="12" rx="1" />
                      </svg>
                    )}
                    중지
                  </button>
                )}
              </div>

              {triggerMsg && (
                <div className={`text-sm px-4 py-2.5 rounded-lg ${
                  triggerMsg.type === 'success'
                    ? 'bg-green-50 text-green-700 border border-green-200'
                    : 'bg-red-50 text-red-700 border border-red-200'
                }`}>
                  {triggerMsg.text}
                </div>
              )}

              {!status.workerOnline && (
                <div className="space-y-3">
                  <button
                    onClick={handleStart}
                    disabled={isStarting}
                    className="w-full py-3 bg-green-600 text-white rounded-xl font-medium hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                  >
                    {isStarting ? (
                      <>
                        <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                        워커 시작 중... (약 5초 소요)
                      </>
                    ) : (
                      <>
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
                        </svg>
                        워커 시작
                      </>
                    )}
                  </button>
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm">
                    <p className="font-medium text-amber-800 mb-2">수동 시작 방법 (버튼이 작동하지 않을 경우)</p>
                    <code className="block bg-amber-100 text-amber-900 px-3 py-2 rounded-lg text-xs font-mono">
                      cd marketing-worker && npm run dev
                    </code>
                  </div>
                </div>
              )}
            </div>
          </>
        ) : null}
      </div>

      {/* 최근 발행 로그 */}
      {status && status.recentLogs.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6">
          <h3 className="text-lg font-semibold mb-4">최근 발행 로그</h3>
          <div className="space-y-2">
            {status.recentLogs.map((log) => (
              <div key={log.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg text-sm">
                <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  log.status === 'success' ? 'bg-green-500' : 'bg-red-400'
                }`} />
                <span className="text-gray-500 text-xs w-24 flex-shrink-0">{formatDate(log.published_at)}</span>
                <span className="text-gray-600 font-medium w-20 flex-shrink-0">
                  {log.platform === 'naver_blog' ? '네이버 블로그' : log.platform}
                </span>
                <span className={`flex-shrink-0 text-xs px-2 py-0.5 rounded-full ${
                  log.status === 'success'
                    ? 'bg-green-100 text-green-700'
                    : 'bg-red-100 text-red-700'
                }`}>
                  {log.status === 'success' ? '성공' : '실패'}
                </span>
                <span className="text-gray-400 text-xs">{formatDuration(log.duration_seconds)}</span>
                {log.published_url && (
                  <a
                    href={log.published_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-500 hover:underline text-xs truncate flex-1"
                  >
                    {log.published_url}
                  </a>
                )}
                {log.error_message && (
                  <span className="text-red-500 text-xs truncate flex-1">{log.error_message}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}