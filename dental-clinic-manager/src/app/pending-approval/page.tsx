'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ClockIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline'
import { getSupabase } from '@/lib/supabase'

export default function PendingApprovalPage() {
  const router = useRouter()
  const [userInfo, setUserInfo] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [checkingStatus, setCheckingStatus] = useState(false)

  useEffect(() => {
    checkUserStatus()
  }, [])

  const checkUserStatus = async () => {
    setLoading(true)
    const supabase = getSupabase()
    if (!supabase) {
      router.push('/')
      return
    }

    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/')
        return
      }

      const { data: userData, error } = await supabase
        .from('users')
        .select(`
          *,
          clinics (*)
        `)
        .eq('id', user.id)
        .single()

      if (error || !userData) {
        router.push('/')
        return
      }

      // 이미 승인된 경우 대시보드로 이동
      if ((userData as any).status === 'active') {
        router.push('/dashboard')
        return
      }

      // 거절된 경우
      if ((userData as any).status === 'rejected') {
        setUserInfo({ ...(userData as any), status: 'rejected' })
      } else {
        setUserInfo(userData as any)
      }
    } catch (error) {
      console.error('Error checking status:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleCheckStatus = async () => {
    setCheckingStatus(true)
    await checkUserStatus()
    setCheckingStatus(false)
  }

  const handleLogout = async () => {
    const supabase = getSupabase()
    if (supabase) {
      await supabase.auth.signOut()
    }
    router.push('/')
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center space-x-2 mb-4">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold">🦷</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-800">덴탈매니저</h1>
          </div>
        </div>

        <div className="bg-white p-8 rounded-lg shadow-md border border-slate-200">
          {userInfo?.status === 'rejected' ? (
            <>
              <div className="flex justify-center mb-6">
                <XCircleIcon className="h-16 w-16 text-red-500" />
              </div>
              <h2 className="text-2xl font-bold text-center text-slate-800 mb-4">
                가입 신청이 거절되었습니다
              </h2>
              <p className="text-center text-slate-600 mb-6">
                죄송합니다. 병원 관리자가 회원가입 신청을 거절하였습니다.
              </p>
              {userInfo.review_note && (
                <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
                  <p className="text-sm text-red-800">
                    <strong>거절 사유:</strong> {userInfo.review_note}
                  </p>
                </div>
              )}
            </>
          ) : (
            <>
              <div className="flex justify-center mb-6">
                <ClockIcon className="h-16 w-16 text-blue-500" />
              </div>
              <h2 className="text-2xl font-bold text-center text-slate-800 mb-4">
                승인 대기 중
              </h2>
              <p className="text-center text-slate-600 mb-6">
                회원가입 신청이 접수되었습니다.<br />
                병원 관리자의 승인을 기다리고 있습니다.
              </p>

              {userInfo && (
                <div className="bg-blue-50 border border-blue-200 rounded-md p-4 mb-6">
                  <h3 className="font-semibold text-blue-900 mb-2">신청 정보</h3>
                  <div className="space-y-1 text-sm text-blue-800">
                    <p><strong>이름:</strong> {userInfo.name}</p>
                    <p><strong>이메일:</strong> {userInfo.email}</p>
                    <p><strong>신청 병원:</strong> {userInfo.clinics?.name || '정보 없음'}</p>
                    <p><strong>신청 직급:</strong> {
                      userInfo.role === 'vice_director' ? '부원장' :
                      userInfo.role === 'manager' ? '실장' :
                      userInfo.role === 'team_leader' ? '진료팀장' :
                      userInfo.role === 'staff' ? '진료팀원' : userInfo.role
                    }</p>
                    <p><strong>신청일:</strong> {new Date(userInfo.created_at).toLocaleDateString('ko-KR')}</p>
                  </div>
                </div>
              )}

              <div className="bg-gray-50 border border-gray-200 rounded-md p-4 mb-6">
                <p className="text-sm text-gray-700">
                  <CheckCircleIcon className="h-4 w-4 inline mr-1 text-green-600" />
                  승인이 완료되면 이메일로 알림을 받으실 수 있습니다.
                </p>
                <p className="text-sm text-gray-700 mt-2">
                  <CheckCircleIcon className="h-4 w-4 inline mr-1 text-green-600" />
                  승인 후 모든 기능을 사용하실 수 있습니다.
                </p>
              </div>

              <button
                onClick={handleCheckStatus}
                disabled={checkingStatus}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold py-3 px-4 rounded-md transition-colors mb-3"
              >
                {checkingStatus ? '확인 중...' : '승인 상태 확인'}
              </button>
            </>
          )}

          <button
            onClick={handleLogout}
            className="w-full bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold py-3 px-4 rounded-md transition-colors"
          >
            로그아웃
          </button>
        </div>

        <div className="mt-6 text-center">
          <p className="text-sm text-slate-600">
            문의사항이 있으신가요?
          </p>
          <p className="text-sm text-slate-600">
            병원 관리자에게 직접 문의해 주세요.
          </p>
        </div>
      </div>
    </div>
  )
}