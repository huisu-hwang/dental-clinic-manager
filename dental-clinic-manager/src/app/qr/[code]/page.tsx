'use client'

/**
 * QR 코드 스캔 전용 페이지
 * 핸드폰 카메라로 QR 코드를 직접 스캔하면 이 페이지로 이동됩니다.
 * 자동으로 출근/퇴근 처리를 수행합니다.
 */

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { attendanceService } from '@/lib/attendanceService'

type ProcessStatus = 'loading' | 'success' | 'error'

export default function QRAttendancePage() {
  const params = useParams()
  const router = useRouter()
  const { user } = useAuth()
  const [status, setStatus] = useState<ProcessStatus>('loading')
  const [message, setMessage] = useState('')
  const [actionType, setActionType] = useState<'check-in' | 'check-out' | 'error'>('check-in')

  useEffect(() => {
    processAttendance()
  }, [params.code, user])

  const processAttendance = async () => {
    const code = params.code as string

    // 1. 인증 확인
    if (!user) {
      // 로그인 페이지로 리디렉션 (로그인 후 다시 돌아오도록)
      router.push(`/?redirect=/qr/${code}`)
      return
    }

    // 2. 위치 정보 가져오기
    const location = await getLocation()

    // 3. 자동 출퇴근 처리
    try {
      const result = await attendanceService.autoCheckInOut({
        user_id: user.id,
        qr_code: code,
        latitude: location?.latitude,
        longitude: location?.longitude,
        device_info: getDeviceInfo(),
      })

      if (result.success) {
        setStatus('success')
        setMessage(result.message || '처리되었습니다.')

        // 메시지로부터 출근/퇴근 판단
        if (result.message?.includes('출근')) {
          setActionType('check-in')
        } else if (result.message?.includes('퇴근')) {
          setActionType('check-out')
        }
      } else {
        setStatus('error')
        setMessage(result.message || '처리 실패')
        setActionType('error')
      }
    } catch (error: any) {
      console.error('[QRAttendancePage] Error:', error)
      setStatus('error')
      setMessage(error.message || '알 수 없는 오류가 발생했습니다.')
      setActionType('error')
    }
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
        {status === 'loading' && <LoadingScreen />}
        {status === 'success' && <SuccessScreen message={message} actionType={actionType} />}
        {status === 'error' && <ErrorScreen message={message} />}
      </div>
    </div>
  )
}

// 로딩 화면
function LoadingScreen() {
  return (
    <div className="bg-white rounded-2xl shadow-xl p-8 text-center">
      <div className="flex justify-center mb-6">
        <div className="relative">
          <div className="w-20 h-20 border-4 border-blue-200 rounded-full"></div>
          <div className="absolute top-0 left-0 w-20 h-20 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      </div>
      <h2 className="text-2xl font-bold text-gray-800 mb-2">처리 중...</h2>
      <p className="text-gray-600">출퇴근 정보를 확인하고 있습니다.</p>
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
        <h3 className="font-semibold text-yellow-800 mb-2">해결 방법:</h3>
        <ul className="space-y-1 text-yellow-700">
          <li>• QR 코드가 유효한지 확인해주세요</li>
          <li>• 위치 권한을 허용했는지 확인해주세요</li>
          <li>• 병원 근처에 있는지 확인해주세요</li>
          <li>• 관리자에게 문의해주세요</li>
        </ul>
      </div>
    </div>
  )
}
