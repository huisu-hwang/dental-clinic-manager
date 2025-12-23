'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { UserMinusIcon, BuildingOffice2Icon, ArrowRightCircleIcon } from '@heroicons/react/24/outline'
import { useAuth } from '@/contexts/AuthContext'

export default function ResignedPage() {
  const router = useRouter()
  const { user, loading, logout } = useAuth()

  useEffect(() => {
    if (!loading) {
      // user가 없으면 홈으로 리다이렉트
      if (!user) {
        router.push('/')
        return
      }

      // active 상태면 대시보드로 이동
      if (user.status === 'active') {
        router.push('/dashboard')
        return
      }

      // pending/rejected 상태면 pending-approval로 이동
      if (user.status === 'pending' || user.status === 'rejected') {
        router.push('/pending-approval')
        return
      }
    }
  }, [user, loading, router])

  const handleJoinNewClinic = () => {
    // 로그아웃 후 회원가입 페이지로 이동
    logout()
  }

  const handleLogout = () => {
    logout()
  }

  // AuthContext의 loading 중이면 로딩 표시
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  // user가 없으면 null 반환 (useEffect에서 리다이렉트 처리됨)
  if (!user) {
    return null
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center space-x-2 mb-4">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold">🦷</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-800">클리닉 매니저</h1>
          </div>
        </div>

        <div className="bg-white p-8 rounded-lg shadow-md border border-slate-200">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center">
              <UserMinusIcon className="h-10 w-10 text-slate-500" />
            </div>
          </div>

          <h2 className="text-2xl font-bold text-center text-slate-800 mb-4">
            퇴사 처리된 계정입니다
          </h2>

          <p className="text-center text-slate-600 mb-6">
            해당 병원에서 퇴사 처리되어<br />
            더 이상 병원 기능에 접근할 수 없습니다.
          </p>

          {/* 이전 소속 병원 정보 */}
          <div className="bg-slate-50 border border-slate-200 rounded-md p-4 mb-6">
            <div className="flex items-center mb-2">
              <BuildingOffice2Icon className="h-5 w-5 text-slate-500 mr-2" />
              <h3 className="font-semibold text-slate-700">이전 소속 정보</h3>
            </div>
            <div className="space-y-1 text-sm text-slate-600">
              <p><strong>이름:</strong> {user.name || '정보 없음'}</p>
              <p><strong>이메일:</strong> {user.email || '정보 없음'}</p>
              <p><strong>이전 병원:</strong> {user.clinic?.name || '정보 없음'}</p>
              <p><strong>이전 직급:</strong> {
                user.role === 'owner' ? '원장' :
                user.role === 'vice_director' ? '부원장' :
                user.role === 'manager' ? '실장' :
                user.role === 'team_leader' ? '진료팀장' :
                user.role === 'staff' ? '진료팀원' : user.role
              }</p>
            </div>
          </div>

          {/* 다른 병원 가입 안내 */}
          <div className="bg-blue-50 border border-blue-200 rounded-md p-4 mb-6">
            <div className="flex items-start">
              <ArrowRightCircleIcon className="h-5 w-5 text-blue-500 mr-2 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="font-semibold text-blue-900 mb-1">다른 병원에 가입하시겠습니까?</h3>
                <p className="text-sm text-blue-700">
                  새로운 병원에 가입하시면 해당 병원의 시스템을 이용하실 수 있습니다.
                  아래 버튼을 클릭하여 새로운 병원에 가입 신청을 진행해 주세요.
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={handleJoinNewClinic}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-md transition-colors mb-3 flex items-center justify-center"
          >
            <BuildingOffice2Icon className="h-5 w-5 mr-2" />
            다른 병원에 가입하기
          </button>

          <button
            onClick={handleLogout}
            className="w-full bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold py-3 px-4 rounded-md transition-colors"
          >
            메인화면으로 이동
          </button>
        </div>

        <div className="mt-6 text-center">
          <p className="text-sm text-slate-600">
            문의사항이 있으신가요?
          </p>
          <p className="text-sm text-slate-600">
            <a href="mailto:hiclinic.inc@gmail.com" className="text-blue-600 hover:text-blue-700">
              hiclinic.inc@gmail.com
            </a>로 문의해 주세요.
          </p>
        </div>
      </div>
    </div>
  )
}
