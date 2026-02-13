'use client'

/**
 * QR 코드 스캔 전용 페이지
 * 핸드폰 카메라로 QR 코드를 직접 스캔하면 이 페이지로 이동됩니다.
 * 출근은 자동 처리, 퇴근은 확인 후 처리합니다.
 *
 * 비로그인 상태에서 QR 스캔 시 인라인 로그인 폼을 표시하여
 * 로그인 후 자동으로 출퇴근 처리합니다.
 */

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { createClient } from '@/lib/supabase/client'
import { attendanceService } from '@/lib/attendanceService'
import { dataService } from '@/lib/dataService'
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline'

type ProcessStatus = 'loading' | 'success' | 'error' | 'confirm-checkout' | 'needs-login'

export default function QRAttendancePage() {
  const params = useParams()
  const router = useRouter()
  const { user, loading: authLoading, login } = useAuth()
  const [status, setStatus] = useState<ProcessStatus>('loading')
  const [message, setMessage] = useState('')
  const [actionType, setActionType] = useState<'check-in' | 'check-out' | 'error'>('check-in')
  const [checkInTime, setCheckInTime] = useState<string | null>(null)
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null)
  const hasProcessed = useRef(false)

  useEffect(() => {
    // 인증 상태 확인 중이면 대기
    if (authLoading) {
      console.log('[QRAttendancePage] Auth loading, waiting...')
      return
    }

    // 중복 실행 방지
    if (hasProcessed.current) {
      return
    }

    hasProcessed.current = true
    processAttendance()
  }, [params.code, user, authLoading])

  const processAttendance = async () => {
    const code = params.code as string

    // 1. AuthContext 인증 확인
    if (!user) {
      console.log('[QRAttendancePage] No user in AuthContext, showing login form')
      setStatus('needs-login')
      return
    }

    // 2. 실제 Supabase 세션 유효성 확인
    // (localStorage에서 복원된 만료 세션으로 인한 RLS 오류 방지)
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        console.warn('[QRAttendancePage] AuthContext has user but Supabase session is invalid')
        setStatus('needs-login')
        return
      }
    } catch (e) {
      console.error('[QRAttendancePage] Failed to verify Supabase session:', e)
      setStatus('needs-login')
      return
    }

    // 3. 위치 정보 가져오기
    const loc = await getLocation()
    setLocation(loc)

    // 4. 오늘의 출퇴근 상태 확인
    try {
      const todayResult = await attendanceService.getTodayAttendance(user.id)
      const todayRecord = todayResult.record

      // 이미 퇴근한 경우
      if (todayRecord?.check_out_time) {
        setStatus('error')
        setMessage('오늘 이미 퇴근하셨습니다.')
        setActionType('error')
        return
      }

      // 출근한 상태 → 퇴근 확인 화면 표시
      if (todayRecord?.check_in_time && !todayRecord?.check_out_time) {
        setCheckInTime(todayRecord.check_in_time)
        setStatus('confirm-checkout')
        return
      }

      // 미출근 → 출근 처리
      // 한국 시간 기준 오늘 날짜 (UTC 사용 시 오전 0시~8시59분에 전날로 계산되는 문제 해결)
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
      const result = await attendanceService.checkIn({
        user_id: user.id,
        qr_code: code,
        work_date: today,
        latitude: loc?.latitude,
        longitude: loc?.longitude,
        device_info: getDeviceInfo(),
      })

      if (result.success) {
        setStatus('success')
        setMessage(result.message || '출근 처리되었습니다.')
        setActionType('check-in')
      } else {
        setStatus('error')
        setMessage(result.message || '출근 처리 실패')
        setActionType('error')
      }
    } catch (error: any) {
      console.error('[QRAttendancePage] Error:', error)

      // 인증 관련 오류 감지 → 로그인 화면 표시
      const errorMsg = error.message || ''
      if (
        error.code === 'PGRST301' ||
        errorMsg.includes('JWT') ||
        errorMsg.includes('token') ||
        errorMsg.includes('auth') ||
        errorMsg.includes('permission') ||
        errorMsg.includes('row-level security')
      ) {
        console.warn('[QRAttendancePage] Auth-related error detected, showing login form')
        setStatus('needs-login')
        return
      }

      setStatus('error')

      // 오류 메시지를 더 명확하게 표시
      let errorMessage = '알 수 없는 오류가 발생했습니다.'
      if (error.message) {
        errorMessage = error.message
      } else if (error.code === 'PGRST116') {
        errorMessage = 'QR 코드를 찾을 수 없습니다. 올바른 QR 코드인지 확인해주세요.'
      } else if (error.code === 'PGRST301') {
        errorMessage = '데이터베이스 연결에 실패했습니다. 네트워크 연결을 확인해주세요.'
      } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
        errorMessage = '네트워크 연결에 문제가 있습니다. 인터넷 연결을 확인해주세요.'
      }

      setMessage(errorMessage)
      setActionType('error')
    }
  }

  // 퇴근 확인 후 처리
  const handleConfirmCheckout = async () => {
    if (!user) return

    const code = params.code as string
    setStatus('loading')

    try {
      // 한국 시간 기준 오늘 날짜 (UTC 사용 시 오전 0시~8시59분에 전날로 계산되는 문제 해결)
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
      const result = await attendanceService.checkOut({
        user_id: user.id,
        qr_code: code,
        work_date: today,
        latitude: location?.latitude,
        longitude: location?.longitude,
        device_info: getDeviceInfo(),
      })

      if (result.success) {
        setStatus('success')
        setMessage(result.message || '퇴근 처리되었습니다.')
        setActionType('check-out')
      } else {
        setStatus('error')
        setMessage(result.message || '퇴근 처리 실패')
        setActionType('error')
      }
    } catch (error: any) {
      console.error('[QRAttendancePage] Checkout error:', error)
      setStatus('error')

      // 오류 메시지를 더 명확하게 표시
      let errorMessage = '퇴근 처리 중 알 수 없는 오류가 발생했습니다.'
      if (error.message) {
        errorMessage = error.message
      } else if (error.code === 'PGRST301') {
        errorMessage = '데이터베이스 연결에 실패했습니다. 네트워크 연결을 확인해주세요.'
      } else if (error.name === 'TypeError' && error.message.includes('fetch')) {
        errorMessage = '네트워크 연결에 문제가 있습니다. 인터넷 연결을 확인해주세요.'
      }

      setMessage(errorMessage)
      setActionType('error')
    }
  }

  // 퇴근 취소
  const handleCancelCheckout = () => {
    // 페이지 닫기 또는 이전 페이지로 이동
    window.close()
    // window.close()가 작동하지 않으면 메인 페이지로 이동
    setTimeout(() => {
      router.push('/attendance')
    }, 100)
  }

  // 로그인 성공 핸들러 - 페이지 리로드로 새 세션으로 출퇴근 처리
  const handleLoginSuccess = () => {
    window.location.reload()
  }

  // 위치 정보 가져오기
  const getLocation = (): Promise<{ latitude: number; longitude: number } | null> => {
    return new Promise((resolve) => {
      if (!navigator.geolocation) {
        console.warn('[QRAttendancePage] Geolocation not supported')
        resolve(null)
        return
      }

      navigator.geolocation.getCurrentPosition(
        (position) => {
          resolve({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          })
        },
        (error) => {
          console.error('[QRAttendancePage] Location error:', error)
          resolve(null)
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
      )
    })
  }

  // 디바이스 정보 가져오기
  const getDeviceInfo = (): string => {
    return navigator.userAgent
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-blue-100 flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {status === 'loading' && <LoadingScreen isAuthLoading={authLoading} />}
        {status === 'needs-login' && (
          <InlineLoginScreen onLoginSuccess={handleLoginSuccess} />
        )}
        {status === 'confirm-checkout' && (
          <ConfirmCheckoutScreen
            checkInTime={checkInTime}
            onConfirm={handleConfirmCheckout}
            onCancel={handleCancelCheckout}
          />
        )}
        {status === 'success' && <SuccessScreen message={message} actionType={actionType} />}
        {status === 'error' && <ErrorScreen message={message} />}
      </div>
    </div>
  )
}

// 인라인 로그인 화면 (QR 출퇴근 전용)
function InlineLoginScreen({ onLoginSuccess }: { onLoginSuccess: () => void }) {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const autoLoginAttempted = useRef(false)

  // 저장된 로그인 정보 불러오기 + 자동 로그인
  useEffect(() => {
    const savedEmail = localStorage.getItem('savedLoginEmail')
    const savedPassword = localStorage.getItem('savedLoginPassword')
    const savedAutoLogin = localStorage.getItem('autoLogin') === 'true'

    if (savedEmail) setEmail(savedEmail)
    if (savedPassword) setPassword(savedPassword)

    // 자동 로그인이 활성화되어 있고 저장된 정보가 있으면 자동 로그인 시도
    if (savedAutoLogin && savedEmail && savedPassword && !autoLoginAttempted.current) {
      autoLoginAttempted.current = true
      handleAutoLogin(savedEmail, savedPassword)
    }
  }, [])

  const handleAutoLogin = async (savedEmail: string, savedPassword: string) => {
    setLoading(true)
    setError('')
    try {
      await performLogin(savedEmail, savedPassword)
    } catch {
      // 자동 로그인 실패 시 수동 입력으로 전환
      setLoading(false)
    }
  }

  const performLogin = async (loginEmail: string, loginPassword: string) => {
    const supabase = createClient()

    // 기존 세션 클리어
    try {
      await Promise.race([
        supabase.auth.signOut(),
        new Promise(resolve => setTimeout(resolve, 3000))
      ])
    } catch { /* 무시 */ }

    // 로그인 시도
    const { data: authData, error: authError } = await Promise.race([
      supabase.auth.signInWithPassword({
        email: loginEmail,
        password: loginPassword,
      }),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Login timeout')), 30000)
      )
    ]) as any

    if (authError) {
      if (authError.message?.includes('Invalid login credentials')) {
        throw new Error('이메일 또는 비밀번호가 올바르지 않습니다.')
      } else if (authError.message?.includes('Email not confirmed')) {
        throw new Error('이메일 인증이 완료되지 않았습니다.')
      }
      throw new Error('로그인 중 오류가 발생했습니다.')
    }

    if (!authData?.user) {
      throw new Error('사용자 정보를 가져오지 못했습니다.')
    }

    // 프로필 조회
    const result = await dataService.getUserProfileById(authData.user.id)
    if (!result.success || !result.data) {
      await supabase.auth.signOut()
      throw new Error('프로필 정보를 불러오는 데 실패했습니다.')
    }

    // 병원 상태 검증
    if (result.data.clinic?.status === 'suspended') {
      await supabase.auth.signOut()
      throw new Error('소속 병원이 중지되었습니다. 관리자에게 문의해주세요.')
    }

    // 사용자 상태 검증
    if (result.data.status === 'pending' || result.data.status === 'rejected') {
      throw new Error('계정 승인 대기 중입니다. 관리자에게 문의해주세요.')
    }

    if (result.data.status === 'resigned') {
      throw new Error('퇴사 처리된 계정입니다.')
    }

    // AuthContext 업데이트
    login(loginEmail, result.data)

    // 로그인 정보 저장
    localStorage.setItem('savedLoginEmail', loginEmail)
    localStorage.setItem('savedLoginPassword', loginPassword)

    // 약간의 대기 후 페이지 리로드
    await new Promise(resolve => setTimeout(resolve, 100))
    onLoginSuccess()
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!email.trim()) {
      setError('이메일 주소를 입력해주세요.')
      return
    }

    if (!password) {
      setError('비밀번호를 입력해주세요.')
      return
    }

    setLoading(true)
    try {
      await performLogin(email, password)
    } catch (err: any) {
      setError(err.message || '로그인 중 오류가 발생했습니다.')
      setLoading(false)
    }
  }

  return (
    <div className="bg-white rounded-2xl shadow-xl p-8">
      {/* 아이콘 */}
      <div className="flex justify-center mb-6">
        <div className="w-24 h-24 bg-blue-100 rounded-full flex items-center justify-center">
          <svg
            className="w-16 h-16 text-blue-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
            />
          </svg>
        </div>
      </div>

      {/* 제목 */}
      <h2 className="text-2xl font-bold text-gray-800 mb-2 text-center">로그인 필요</h2>
      <p className="text-gray-600 mb-6 text-center">
        출퇴근 체크를 위해 로그인해주세요.
      </p>

      {/* 자동 로그인 시도 중 */}
      {loading && autoLoginAttempted.current && !error && (
        <div className="text-center py-4">
          <div className="relative inline-block">
            <div className="w-12 h-12 border-4 border-blue-200 rounded-full"></div>
            <div className="absolute top-0 left-0 w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
          </div>
          <p className="text-gray-600 mt-3">자동 로그인 중...</p>
        </div>
      )}

      {/* 로그인 폼 */}
      {(!loading || error) && (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="qr-email" className="block text-sm font-medium text-gray-700 mb-1">
              이메일
            </label>
            <input
              type="email"
              id="qr-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="email@example.com"
              disabled={loading}
              autoComplete="email"
            />
          </div>

          <div className="relative">
            <label htmlFor="qr-password" className="block text-sm font-medium text-gray-700 mb-1">
              비밀번호
            </label>
            <input
              type={showPassword ? 'text' : 'password'}
              id="qr-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 pr-12"
              placeholder="비밀번호 입력"
              disabled={loading}
              autoComplete="current-password"
            />
            <button
              type="button"
              className="absolute right-3 top-9 p-1"
              onClick={() => setShowPassword(!showPassword)}
              tabIndex={-1}
            >
              {showPassword ? (
                <EyeSlashIcon className="h-5 w-5 text-gray-400" />
              ) : (
                <EyeIcon className="h-5 w-5 text-gray-400" />
              )}
            </button>
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white font-semibold rounded-lg transition-colors text-lg"
          >
            {loading ? '로그인 중...' : '로그인하고 출퇴근 체크'}
          </button>
        </form>
      )}
    </div>
  )
}

// 퇴근 확인 화면
function ConfirmCheckoutScreen({
  checkInTime,
  onConfirm,
  onCancel,
}: {
  checkInTime: string | null
  onConfirm: () => void
  onCancel: () => void
}) {
  const formatTime = (dateString: string | null) => {
    if (!dateString) return '-'
    const date = new Date(dateString)
    return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
  }

  const calculateWorkingTime = () => {
    if (!checkInTime) return '-'
    const checkIn = new Date(checkInTime)
    const now = new Date()
    const diffMs = now.getTime() - checkIn.getTime()
    const hours = Math.floor(diffMs / (1000 * 60 * 60))
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))
    return `${hours}시간 ${minutes}분`
  }

  return (
    <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
      {/* 아이콘 */}
      <div className="flex justify-center mb-6">
        <div className="w-24 h-24 bg-orange-100 rounded-full flex items-center justify-center">
          <svg
            className="w-16 h-16 text-orange-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
        </div>
      </div>

      {/* 제목 */}
      <h2 className="text-2xl font-bold text-gray-800 mb-2">퇴근 하시겠습니까?</h2>
      <p className="text-gray-600 mb-6">퇴근 처리 전 확인해주세요.</p>

      {/* 근무 정보 */}
      <div className="bg-gray-50 rounded-lg p-4 mb-6 text-left">
        <div className="flex justify-between py-2 border-b border-gray-200">
          <span className="text-gray-600">출근 시간</span>
          <span className="font-semibold text-gray-800">{formatTime(checkInTime)}</span>
        </div>
        <div className="flex justify-between py-2 border-b border-gray-200">
          <span className="text-gray-600">현재 시간</span>
          <span className="font-semibold text-gray-800">
            {new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        <div className="flex justify-between py-2">
          <span className="text-gray-600">근무 시간</span>
          <span className="font-semibold text-blue-600">{calculateWorkingTime()}</span>
        </div>
      </div>

      {/* 버튼 */}
      <div className="space-y-3">
        <button
          onClick={onConfirm}
          className="w-full py-4 bg-green-500 hover:bg-green-600 text-white font-semibold rounded-lg transition-colors text-lg"
        >
          퇴근하기
        </button>
        <button
          onClick={onCancel}
          className="w-full py-4 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold rounded-lg transition-colors"
        >
          취소
        </button>
      </div>
    </div>
  )
}

// 로딩 화면
function LoadingScreen({ isAuthLoading }: { isAuthLoading: boolean }) {
  return (
    <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
      <div className="flex justify-center mb-6">
        <div className="relative">
          <div className="w-20 h-20 border-4 border-blue-200 rounded-full"></div>
          <div className="absolute top-0 left-0 w-20 h-20 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      </div>
      <h2 className="text-2xl font-bold text-gray-800 mb-2">
        {isAuthLoading ? '인증 확인 중...' : '처리 중...'}
      </h2>
      <p className="text-gray-600">
        {isAuthLoading ? '로그인 상태를 확인하고 있습니다.' : '출퇴근 정보를 확인하고 있습니다.'}
      </p>
    </div>
  )
}

// 성공 화면
function SuccessScreen({ message, actionType }: { message: string; actionType: string }) {
  const isCheckIn = actionType === 'check-in'
  const [countdown, setCountdown] = useState(10)
  const router = useRouter()

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          // 창 닫기 시도
          window.close()
          // window.close()가 작동하지 않으면 메인 페이지로 이동
          setTimeout(() => {
            router.push('/attendance')
          }, 100)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [router])

  return (
    <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
      {/* 아이콘 */}
      <div className="flex justify-center mb-6">
        <div className={`w-24 h-24 rounded-full flex items-center justify-center ${
          isCheckIn ? 'bg-green-100' : 'bg-blue-100'
        }`}>
          <svg
            className={`w-16 h-16 ${isCheckIn ? 'text-green-500' : 'text-blue-500'}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        </div>
      </div>

      {/* 메시지 */}
      <h2 className="text-3xl font-bold text-gray-800 mb-4">
        {isCheckIn ? '출근 완료!' : '퇴근 완료!'}
      </h2>
      <p className="text-lg text-gray-600 mb-2">{message}</p>
      <p className="text-sm text-gray-500">
        {isCheckIn ? '오늘도 좋은 하루 되세요' : '수고하셨습니다'}
      </p>

      {/* 시간 표시 */}
      <div className="mt-6 pt-6 border-t border-gray-200">
        <p className="text-sm text-gray-500">
          {new Date().toLocaleString('ko-KR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
          })}
        </p>
      </div>

      {/* 자동 닫힘 안내 */}
      <div className="mt-4 text-sm text-gray-400">
        {countdown}초 후 자동으로 닫힙니다
      </div>
    </div>
  )
}

// 오류 화면
function ErrorScreen({ message }: { message: string }) {
  const [countdown, setCountdown] = useState(10)
  const router = useRouter()

  useEffect(() => {
    const timer = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          // 창 닫기 시도
          window.close()
          // window.close()가 작동하지 않으면 메인 페이지로 이동
          setTimeout(() => {
            router.push('/attendance')
          }, 100)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [router])

  return (
    <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
      {/* 아이콘 */}
      <div className="flex justify-center mb-6">
        <div className="w-24 h-24 bg-red-100 rounded-full flex items-center justify-center">
          <svg
            className="w-16 h-16 text-red-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </div>
      </div>

      {/* 메시지 */}
      <h2 className="text-3xl font-bold text-gray-800 mb-4">처리 실패</h2>
      <p className="text-lg text-gray-600 mb-6">{message}</p>

      {/* 안내 */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-left">
        <h3 className="font-semibold text-yellow-800 mb-2">문제 해결 가이드:</h3>
        <ul className="space-y-2 text-yellow-700">
          <li>
            <strong>QR 코드 오류:</strong><br />
            - QR 코드가 최신 버전인지 확인해주세요<br />
            - QR 코드가 만료되지 않았는지 확인해주세요
          </li>
          <li>
            <strong>위치 오류:</strong><br />
            - 브라우저에서 위치 권한을 허용했는지 확인해주세요<br />
            - 병원 출입구 근처에 있는지 확인해주세요
          </li>
          <li>
            <strong>네트워크 오류:</strong><br />
            - 인터넷 연결 상태를 확인해주세요<br />
            - Wi-Fi 또는 모바일 데이터가 켜져 있는지 확인해주세요
          </li>
          <li>
            <strong>기타 문제:</strong><br />
            - 관리자에게 문의해주세요
          </li>
        </ul>
      </div>

      {/* 자동 닫힘 안내 */}
      <div className="mt-4 text-sm text-gray-400">
        {countdown}초 후 자동으로 닫힙니다
      </div>
    </div>
  )
}
