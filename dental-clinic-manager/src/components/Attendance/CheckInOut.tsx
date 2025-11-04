'use client'

import { useState, useEffect } from 'react'
import { attendanceService } from '@/lib/attendanceService'
import { useAuth } from '@/contexts/AuthContext'
import QRScanner from './QRScanner'
import type { AttendanceRecord } from '@/types/attendance'
import { ATTENDANCE_STATUS_NAMES, ATTENDANCE_STATUS_COLORS } from '@/types/attendance'

export default function CheckInOut() {
  const { user } = useAuth()
  const [todayRecord, setTodayRecord] = useState<AttendanceRecord | null>(null)
  const [qrCode, setQrCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [currentTime, setCurrentTime] = useState(new Date())
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null)
  const [locationError, setLocationError] = useState<string | null>(null)
  const [showScanner, setShowScanner] = useState(false)
  const [scannerMode, setScannerMode] = useState<'check-in' | 'check-out' | null>(null)

  // 실시간 시계
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(new Date())
    }, 1000)
    return () => clearInterval(timer)
  }, [])

  // 위치 정보 가져오기
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          })
          setLocationError(null)
        },
        (error: GeolocationPositionError) => {
          let errorMessage = '위치 정보를 가져올 수 없습니다. 잠시 후 다시 시도해주세요.'
          if (error.code === 1) { // PERMISSION_DENIED
            errorMessage = '위치 정보 권한이 필요합니다. 브라우저 설정에서 위치 권한을 허용해주세요.'
          } else if (error.code === 2) { // POSITION_UNAVAILABLE
            errorMessage = '현재 위치를 확인할 수 없습니다. 네트워크나 GPS 상태를 확인해주세요.'
          } else if (error.code === 3) { // TIMEOUT
            errorMessage = '위치 정보를 가져오는 데 시간이 초과되었습니다. 다시 시도해주세요.'
          }
          
          setMessage({ type: 'error', text: errorMessage });
          setLocationError(errorMessage) // 기존 locationError 상태도 유지
        },
        {
          timeout: 10000, // 10초 타임아웃
          enableHighAccuracy: false, // 빠른 응답 우선
          maximumAge: 60000, // 1분간 캐시 사용
        }
      )
    } else {
      setLocationError('이 브라우저는 위치 서비스를 지원하지 않습니다.')
    }
  }, [])

  // 오늘의 출퇴근 기록 로드
  useEffect(() => {
    if (user?.id) {
      loadTodayAttendance()
    }
  }, [user])

  const loadTodayAttendance = async () => {
    if (!user?.id) return

    try {
      const result = await attendanceService.getTodayAttendance(user.id)
      if (result.success && result.record) {
        setTodayRecord(result.record)
      } else {
        setTodayRecord(null)
      }
    } catch (error) {
      console.error('[CheckInOut] Error loading today attendance:', error)
    }
  }

  const handleCheckIn = async (code?: string) => {
    const qrCodeToUse = code || qrCode.trim()

    if (!user?.id || !qrCodeToUse) {
      setMessage({ type: 'error', text: 'QR 코드를 입력해주세요.' })
      return
    }

    setLoading(true)
    setMessage(null)

    try {
      const today = new Date().toISOString().split('T')[0]
      const result = await attendanceService.checkIn({
        user_id: user.id,
        qr_code: qrCodeToUse,
        work_date: today,
        latitude: location?.latitude,
        longitude: location?.longitude,
      })

      if (result.success) {
        setMessage({ type: 'success', text: '출근 처리되었습니다!' })
        setTodayRecord(result.record || null)
        setQrCode('')
        await loadTodayAttendance()
      } else {
        setMessage({ type: 'error', text: result.message || '출근 처리 실패' })
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || '출근 처리 중 오류가 발생했습니다.' })
    } finally {
      setLoading(false)
    }
  }

  const handleCheckOut = async (code?: string) => {
    const qrCodeToUse = code || qrCode.trim()

    if (!user?.id || !qrCodeToUse) {
      setMessage({ type: 'error', text: 'QR 코드를 입력해주세요.' })
      return
    }

    setLoading(true)
    setMessage(null)

    try {
      const today = new Date().toISOString().split('T')[0]
      const result = await attendanceService.checkOut({
        user_id: user.id,
        qr_code: qrCodeToUse,
        work_date: today,
        latitude: location?.latitude,
        longitude: location?.longitude,
      })

      if (result.success) {
        setMessage({ type: 'success', text: '퇴근 처리되었습니다!' })
        setTodayRecord(result.record || null)
        setQrCode('')
        await loadTodayAttendance()
      } else {
        setMessage({ type: 'error', text: result.message || '퇴근 처리 실패' })
      }
    } catch (error: any) {
      setMessage({ type: 'error', text: error.message || '퇴근 처리 중 오류가 발생했습니다.' })
    } finally {
      setLoading(false)
    }
  }

  const handleQRScanSuccess = async (code: string) => {
    console.log('[CheckInOut] QR Code scanned:', code)
    setScannerMode(null) // 모달 닫기

    // 스캔된 QR 코드로 자동으로 출근/퇴근 처리
    if (scannerMode === 'check-in') {
      await handleCheckIn(code)
    } else if (scannerMode === 'check-out') {
      await handleCheckOut(code)
    }
  }

  const openScannerForCheckIn = () => {
    if (isCheckedIn || isCheckedOut) return
    setScannerMode('check-in')
  }

  const openScannerForCheckOut = () => {
    if (!isCheckedIn || isCheckedOut) return
    setScannerMode('check-out')
  }

  const formatTime = (dateString: string | null | undefined) => {
    if (!dateString) return '-'
    const date = new Date(dateString)
    return date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
  }

  const calculateWorkingMinutes = () => {
    if (!todayRecord?.check_in_time) return 0
    const checkInTime = new Date(todayRecord.check_in_time)
    const now = todayRecord.check_out_time ? new Date(todayRecord.check_out_time) : new Date()
    return Math.floor((now.getTime() - checkInTime.getTime()) / (1000 * 60))
  }

  const formatMinutes = (minutes: number) => {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    return `${hours}시간 ${mins}분`
  }

  const isCheckedIn = !!todayRecord?.check_in_time && !todayRecord?.check_out_time
  const isCheckedOut = !!todayRecord?.check_out_time
  const workingMinutes = calculateWorkingMinutes()

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      {/* 현재 시간 표시 */}
      <div className="bg-gradient-to-r from-blue-500 to-blue-600 text-white rounded-lg p-6 text-center">
        <div className="text-sm opacity-90 mb-2">
          {currentTime.toLocaleDateString('ko-KR', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            weekday: 'long'
          })}
        </div>
        <div className="text-5xl font-bold mb-2">
          {currentTime.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </div>
        <div className="text-sm opacity-90">
          {user?.name}님, 안녕하세요!
        </div>
      </div>

      {/* 오늘의 출퇴근 상태 */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <h2 className="text-xl font-semibold mb-4">오늘의 출퇴근 현황</h2>

        {todayRecord ? (
          <div className="space-y-4">
            {/* 상태 배지 */}
            <div className="flex items-center justify-between">
              <span className="text-gray-600">상태</span>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${ATTENDANCE_STATUS_COLORS[todayRecord.status]}`}>
                {ATTENDANCE_STATUS_NAMES[todayRecord.status]}
              </span>
            </div>

            {/* 출근 시간 */}
            <div className="flex items-center justify-between">
              <span className="text-gray-600">출근 시간</span>
              <span className="font-semibold">{formatTime(todayRecord.check_in_time)}</span>
            </div>

            {/* 예정 출근 시간 */}
            {todayRecord.scheduled_start && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">예정 출근</span>
                <span className="text-gray-500">{todayRecord.scheduled_start.substring(0, 5)}</span>
              </div>
            )}

            {/* 퇴근 시간 */}
            <div className="flex items-center justify-between">
              <span className="text-gray-600">퇴근 시간</span>
              <span className="font-semibold">{formatTime(todayRecord.check_out_time)}</span>
            </div>

            {/* 예정 퇴근 시간 */}
            {todayRecord.scheduled_end && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-500">예정 퇴근</span>
                <span className="text-gray-500">{todayRecord.scheduled_end.substring(0, 5)}</span>
              </div>
            )}

            {/* 근무 시간 */}
            {isCheckedIn && (
              <div className="flex items-center justify-between">
                <span className="text-gray-600">현재 근무 시간</span>
                <span className="font-semibold text-blue-600">{formatMinutes(workingMinutes)}</span>
              </div>
            )}

            {isCheckedOut && todayRecord.total_work_minutes && (
              <div className="flex items-center justify-between">
                <span className="text-gray-600">총 근무 시간</span>
                <span className="font-semibold text-blue-600">{formatMinutes(todayRecord.total_work_minutes)}</span>
              </div>
            )}

            {/* 지각/조퇴/초과근무 */}
            {todayRecord.late_minutes > 0 && (
              <div className="flex items-center justify-between text-yellow-600">
                <span>지각</span>
                <span className="font-semibold">{todayRecord.late_minutes}분</span>
              </div>
            )}
            {todayRecord.early_leave_minutes > 0 && (
              <div className="flex items-center justify-between text-orange-600">
                <span>조퇴</span>
                <span className="font-semibold">{todayRecord.early_leave_minutes}분</span>
              </div>
            )}
            {todayRecord.overtime_minutes > 0 && (
              <div className="flex items-center justify-between text-green-600">
                <span>초과근무</span>
                <span className="font-semibold">{todayRecord.overtime_minutes}분</span>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center text-gray-500 py-8">
            아직 출근하지 않았습니다.
          </div>
        )}
      </div>

      {/* 위치 정보 상태 */}
      {locationError && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800">
          ⚠️ {locationError}
        </div>
      )}

      {location && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-800">
          ✓ 위치 정보가 활성화되었습니다.
        </div>
      )}

      {/* QR 코드 입력 및 출퇴근 버튼 */}
      <div className="bg-white rounded-lg shadow-md p-6 space-y-4">
        <h2 className="text-xl font-semibold mb-4">출퇴근 체크</h2>

        {/* 메시지 표시 */}
        {message && (
          <div
            className={`p-4 rounded-lg ${
              message.type === 'success'
                ? 'bg-green-50 text-green-800 border border-green-200'
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}
          >
            {message.text}
          </div>
        )}

        {/* QR 스캔 버튼 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            onClick={openScannerForCheckIn}
            disabled={loading || isCheckedIn || isCheckedOut}
            className={`py-6 rounded-lg font-semibold text-white transition-colors flex flex-col items-center justify-center space-y-2 ${
              loading || isCheckedIn || isCheckedOut
                ? 'bg-gray-300 cursor-not-allowed'
                : 'bg-blue-500 hover:bg-blue-600 active:bg-blue-700'
            }`}
          >
            <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="text-lg">QR 스캔 출근</span>
          </button>

          <button
            onClick={openScannerForCheckOut}
            disabled={loading || !isCheckedIn || isCheckedOut}
            className={`py-6 rounded-lg font-semibold text-white transition-colors flex flex-col items-center justify-center space-y-2 ${
              loading || !isCheckedIn || isCheckedOut
                ? 'bg-gray-300 cursor-not-allowed'
                : 'bg-green-500 hover:bg-green-600 active:bg-green-700'
            }`}
          >
            <svg className="w-12 h-12" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
            <span className="text-lg">QR 스캔 퇴근</span>
          </button>
        </div>

        {/* 안내 메시지 */}
        <div className="text-sm text-gray-600 space-y-1 mt-6">
          <p>• 출근/퇴근 버튼을 클릭하면 QR 코드 스캐너가 실행됩니다.</p>
          <p>• QR 코드를 카메라에 비추면 자동으로 출퇴근 처리됩니다.</p>
          <p>• 출근 시간은 근무 스케줄에 따라 자동으로 지각 여부가 판단됩니다.</p>
          <p>• 퇴근 시간은 초과근무 또는 조퇴 여부가 자동으로 계산됩니다.</p>
          <p>• 위치 정보는 출퇴근 인증에 사용되며 저장되지 않습니다.</p>
        </div>
      </div>

      {/* QR 스캐너 모달 */}
      {scannerMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75">
          <div className="bg-white rounded-lg p-6 max-w-lg w-full mx-4">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xl font-semibold">
                {scannerMode === 'check-in' ? '출근 QR 스캔' : '퇴근 QR 스캔'}
              </h3>
              <button
                onClick={() => setScannerMode(null)}
                className="text-gray-500 hover:text-gray-700"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <QRScanner
              onScanSuccess={handleQRScanSuccess}
              onScanError={(error) => {
                setMessage({ type: 'error', text: error })
                setScannerMode(null)
              }}
            />

            <div className="mt-4 text-center text-sm text-gray-600">
              QR 코드를 카메라에 비춰주세요
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
