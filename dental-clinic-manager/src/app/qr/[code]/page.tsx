'use client'

/**
 * QR 코드 스캔 전용 페이지
 * 핸드폰 카메라로 QR 코드를 직접 스캔하면 이 페이지로 이동됩니다.
 * 출근은 자동 처리, 퇴근은 확인 후 처리합니다.
 */

import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { attendanceService } from '@/lib/attendanceService'

type ProcessStatus = 'loading' | 'success' | 'error' | 'confirm-checkout'

export default function QRAttendancePage() {
  const params = useParams()
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
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

    // 1. 인증 확인
    if (!user) {
      // 로그인 페이지로 직접 리디렉션 (로그인 후 다시 돌아오도록)
      router.push(`/?show=login&redirect=/qr/${code}`)
      return
    }

    // 2. 위치 정보 가져오기
    const loc = await getLocation()
    setLocation(loc)

    // 3. 오늘의 출퇴근 상태 확인
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
        { timeout: 5000, maximumAge: 0 }
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
        {isCheckIn ? '오늘도 좋은 하루 되세요 😊' : '수고하셨습니다 👋'}
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
    </div>
  )
}

// 오류 화면
function ErrorScreen({ message }: { message: string }) {
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
            • QR 코드가 최신 버전인지 확인해주세요<br />
            • QR 코드가 만료되지 않았는지 확인해주세요
          </li>
          <li>
            <strong>위치 오류:</strong><br />
            • 브라우저에서 위치 권한을 허용했는지 확인해주세요<br />
            • 병원 출입구 근처에 있는지 확인해주세요
          </li>
          <li>
            <strong>네트워크 오류:</strong><br />
            • 인터넷 연결 상태를 확인해주세요<br />
            • Wi-Fi 또는 모바일 데이터가 켜져 있는지 확인해주세요
          </li>
          <li>
            <strong>기타 문제:</strong><br />
            • 관리자에게 문의해주세요
          </li>
        </ul>
      </div>
    </div>
  )
}
