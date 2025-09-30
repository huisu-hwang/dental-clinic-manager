'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { dataService } from '@/lib/dataService'
import { UserIcon, BuildingOffice2Icon, ChartBarIcon, UsersIcon } from '@heroicons/react/24/outline'

type TabType = 'overview' | 'clinics' | 'users' | 'statistics'

export default function MasterAdminPage() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const [activeTab, setActiveTab] = useState<TabType>('overview')
  const [clinics, setClinics] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [statistics, setStatistics] = useState({
    totalClinics: 0,
    totalUsers: 0,
    totalPatients: 0,
    totalAppointments: 0
  })
  const [loadingData, setLoadingData] = useState(true)

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
      const result = await dataService.getUserProfile()
      const userData = result?.data as any
      if (userData?.role !== 'master') {
        alert('마스터 관리자 권한이 필요합니다.')
        router.push('/dashboard')
        return
      }
      loadData()
    } catch (error) {
      console.error('권한 확인 실패:', error)
      router.push('/dashboard')
    }
  }

  const loadData = async () => {
    setLoadingData(true)
    try {
      // 병원 목록 조회
      const { data: clinicsData } = await dataService.getAllClinics()
      setClinics(clinicsData || [])

      // 사용자 목록 조회
      const { data: usersData } = await dataService.getAllUsers()
      setUsers(usersData || [])

      // 통계 데이터 조회
      const { data: stats } = await dataService.getSystemStatistics()
      if (stats) {
        setStatistics(stats)
      }
    } catch (error) {
      console.error('데이터 로드 실패:', error)
    } finally {
      setLoadingData(false)
    }
  }

  const handleDeleteClinic = async (clinicId: string) => {
    if (!confirm('정말로 이 병원과 모든 관련 데이터를 삭제하시겠습니까?')) {
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
    if (!confirm('정말로 이 사용자를 삭제하시겠습니까?')) {
      return
    }

    try {
      await dataService.deleteUser(userId)
      alert('사용자가 삭제되었습니다.')
      loadData()
    } catch (error) {
      console.error('사용자 삭제 실패:', error)
      alert('사용자 삭제에 실패했습니다.')
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
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">병원명</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">대표자</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">이메일</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">전화번호</th>
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
                          clinic.is_public ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                        }`}>
                          {clinic.is_public ? '공개' : '비공개'}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        <button
                          onClick={() => handleDeleteClinic(clinic.id)}
                          className="text-red-600 hover:text-red-900 text-sm font-medium"
                        >
                          삭제
                        </button>
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
                          user.role === 'master' ? 'bg-purple-100 text-purple-800' :
                          user.role === 'owner' ? 'bg-blue-100 text-blue-800' :
                          'bg-gray-100 text-gray-800'
                        }`}>
                          {user.role === 'master' ? '마스터' :
                           user.role === 'owner' ? '대표원장' :
                           user.role}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-500">{user.clinic?.name || '-'}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {new Date(user.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4">
                        {user.role !== 'master' && (
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
                  <span className="text-sm font-medium">{users.filter(u => u.role === 'master').length}</span>
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
    </div>
  )
}