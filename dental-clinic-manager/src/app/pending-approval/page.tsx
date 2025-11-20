'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ClockIcon, CheckCircleIcon, XCircleIcon } from '@heroicons/react/24/outline'
import { getSupabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

export default function PendingApprovalPage() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const [clinicInfo, setClinicInfo] = useState<any>(null)
  const [checkingStatus, setCheckingStatus] = useState(false)

  useEffect(() => {
    if (!loading) {
      // user가 없으면 홈으로 리다이렉트
      if (!user) {
        router.push('/')
        return
      }

      // 이미 승인된 경우 대시보드로 이동
      if (user.status === 'active') {
        router.push('/dashboard')
        return
      }

      // clinic 정보가 없으면 조회 (한 번만)
      if (!user.clinic && !clinicInfo && user.clinic_id) {
        loadClinicInfo()
      }
    }
  }, [user, loading, router])

  const loadClinicInfo = async () => {
    if (!user?.clinic_id) return

    const supabase = getSupabase()
    if (!supabase) return

    try {
      const { data, error } = await supabase
        .from('clinics')
        .select('*')
        .eq('id', user.clinic_id)
        .single()

      if (!error && data) {
        setClinicInfo(data)
      }
    } catch (error) {
      console.error('Error loading clinic info:', error)
    }
  }

  const handleCheckStatus = async () => {
    setCheckingStatus(true)

    const supabase = getSupabase()
    if (!supabase || !user) {
      setCheckingStatus(false)
      return
    }

    try {
      const { data: userData, error } = await supabase
        .from('users')
        .select('status')
        .eq('id', user.id)
        .single()

      if (error) {
        console.error('Error checking status:', error)
        alert('상태 확인 중 오류가 발생했습니다.')
        return
      }

      // 승인된 경우 대시보드로 이동
      if (userData?.status === 'active') {
        router.push('/dashboard')
        return
      }

      // 여전히 대기 중이면 알림
      alert('아직 승인 대기 중입니다. 조금만 더 기다려주세요.')
    } catch (error) {
      console.error('Error checking status:', error)
      alert('상태 확인 중 오류가 발생했습니다.')
    } finally {
      setCheckingStatus(false)
    }
  }

  const handleGoToEmailProvider = () => {
    if (!user?.email) return

    const email = user.email
    const domain = email.substring(email.lastIndexOf('@') + 1)

    const emailProviderLinks: { [key: string]: string } = {
      'gmail.com': 'https://mail.google.com',
      'naver.com': 'https://mail.naver.com',
      'hanmail.net': 'https://mail.daum.net',
      'daum.net': 'https://mail.daum.net',
      'kakao.com': 'https://mail.daum.net',
      'nate.com': 'https://mail.nate.com',
      'icloud.com': 'https://www.icloud.com/mail',
      'me.com': 'https://www.icloud.com/mail',
      'mac.com': 'https://www.icloud.com/mail',
      'outlook.com': 'https://outlook.live.com',
      'hotmail.com': 'https://outlook.live.com',
      'live.com': 'https://outlook.live.com',
    }

    const url = emailProviderLinks[domain]

    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer')
    }
  }

  const handleLogout = async () => {
    const supabase = getSupabase()
    if (supabase) {
      await supabase.auth.signOut()
    }
    router.push('/')
  }

  // AuthContext의 loading 중이거나 user가 없으면 로딩 표시
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
          {user.status === 'rejected' ? (
            <>
              <div className="flex justify-center mb-6">
                <XCircleIcon className="h-16 w-16 text-red-500" />
              </div>
              <h2 className="text-2xl font-bold text-center text-slate-800 mb-4">
                ❌ 승인이 거절되었습니다
              </h2>
              <p className="text-center text-slate-600 mb-6">
                내부 규정으로 인해 승인이 거절되었습니다.<br />
                자세한 내용을 알고 싶으신 경우는<br />
                <a href="mailto:hiclinic.inc@gmail.com" className="text-blue-600 hover:text-blue-700 font-medium">
                  hiclinic.inc@gmail.com
                </a>로 문의 바랍니다.
              </p>
              {user.review_note && (
                <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
                  <p className="text-sm text-red-800">
                    <strong>거절 사유:</strong> {user.review_note}
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
                🕐 승인 대기 중
              </h2>
              <p className="text-center text-slate-600 mb-6">
                관리자의 승인을 기다리고 있습니다.<br />
                조금만 더 기다려주세요!
              </p>

              <div className="bg-blue-50 border border-blue-200 rounded-md p-4 mb-6">
                <h3 className="font-semibold text-blue-900 mb-2">신청 정보</h3>
                <div className="space-y-1 text-sm text-blue-800">
                  <p><strong>이름:</strong> {user.name}</p>
                  <p><strong>이메일:</strong> {user.email}</p>
                  <p><strong>신청 병원:</strong> {user.clinic?.name || clinicInfo?.name || '정보 없음'}</p>
                  <p><strong>신청 직급:</strong> {
                    user.role === 'vice_director' ? '부원장' :
                    user.role === 'manager' ? '실장' :
                    user.role === 'team_leader' ? '진료팀장' :
                    user.role === 'staff' ? '진료팀원' : user.role
                  }</p>
                  <p><strong>신청일:</strong> {new Date(user.created_at).toLocaleDateString('ko-KR')}</p>
                </div>
              </div>

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

              <button
                onClick={handleGoToEmailProvider}
                className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-md transition-colors mb-3"
              >
                이메일 확인하러 가기
              </button>
            </>
          )}

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