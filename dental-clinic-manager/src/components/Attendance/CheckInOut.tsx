'use client'

import { useState, useEffect } from 'react'
import { Clock, MapPin, Camera, AlertCircle, CheckCircle2 } from 'lucide-react'
import { attendanceService } from '@/lib/attendanceService'
import { useAuth } from '@/contexts/AuthContext'
import QRScanner from './QRScanner'
import type { AttendanceRecord } from '@/types/attendance'
import { ATTENDANCE_STATUS_NAMES, ATTENDANCE_STATUS_COLORS } from '@/types/attendance'

// 섹션 헤더 컴포넌트
const SectionHeader = ({ number, title, icon: Icon }: { number: number; title: string; icon: React.ElementType }) => (
  <div className="flex items-center space-x-3 pb-3 mb-4 border-b border-slate-200">
    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-50 text-blue-600">
      <Icon className="w-4 h-4" />
    </div>
    <h3 className="text-base font-semibold text-slate-800">
      <span className="text-blue-600 mr-1">{number}.</span>
      {title}
    </h3>
  </div>
)

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
  const [showCheckoutConfirm, setShowCheckoutConfirm] = useState(false)
  const [pendingCheckoutCode, setPendingCheckoutCode] = useState<string | null>(null)

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
      // 한국 시간 기준 오늘 날짜 (UTC 사용 시 오전 0시~8시59분에 전날로 계산되는 문제 해결)
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
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

        // 팀 출근 현황 업데이트 이벤트 발송
        window.dispatchEvent(new CustomEvent('attendance-updated'))
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
      // 한국 시간 기준 오늘 날짜 (UTC 사용 시 오전 0시~8시59분에 전날로 계산되는 문제 해결)
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' })
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

        // 팀 출근 현황 업데이트 이벤트 발송
        window.dispatchEvent(new CustomEvent('attendance-updated'))
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
    const currentMode = scannerMode
    setScannerMode(null) // 스캐너 모달 닫기

    // 스캔된 QR 코드로 출근/퇴근 처리
    if (currentMode === 'check-in') {
      await handleCheckIn(code)
    } else if (currentMode === 'check-out') {
      // 퇴근은 확인 절차를 거침
      setPendingCheckoutCode(code)
      setShowCheckoutConfirm(true)
    }
  }

  // 퇴근 확인 후 처리
  const handleConfirmCheckout = async () => {
    if (pendingCheckoutCode) {
      setShowCheckoutConfirm(false)
      await handleCheckOut(pendingCheckoutCode)
      setPendingCheckoutCode(null)
    }
  }

  // 퇴근 취소
  const handleCancelCheckout = () => {
    setShowCheckoutConfirm(false)
    setPendingCheckoutCode(null)
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
    <div className="max-w-3xl mx-auto space-y-6">
      {/* 섹션 1: 현재 시간 */}
      <div>
        <SectionHeader number={1} title="현재 시간" icon={Clock} />
        <div className="bg-gradient-to-r from-slate-700 to-slate-800 text-white rounded-lg p-6 text-center">
          <div className="text-sm opacity-90 mb-2">
            {currentTime.toLocaleDateString('ko-KR', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
              weekday: 'long'
            })}
          </div>
          <div className="text-5xl font-bold mb-2 font-mono">
            {currentTime.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </div>
          <div className="text-sm opacity-90">
            {user?.name}님, 안녕하세요!
          </div>
        </div>
      </div>

      {/* 섹션 2: 오늘의 출퇴근 현황 */}
      <div>
        <SectionHeader number={2} title="오늘의 출퇴근 현황" icon={Clock} />
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          {todayRecord ? (
            <table className="w-full text-sm">
              <tbody className="divide-y divide-slate-200">
                <tr className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-600 w-1/3">상태</td>
                  <td className="px-4 py-3">
                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${ATTENDANCE_STATUS_COLORS[todayRecord.status]}`}>
                      {ATTENDANCE_STATUS_NAMES[todayRecord.status]}
                    </span>
                  </td>
                </tr>
                <tr className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-600">출근 시간</td>
                  <td className="px-4 py-3 font-semibold text-slate-800">
                    {formatTime(todayRecord.check_in_time)}
                    {todayRecord.scheduled_start && (
                      <span className="ml-2 text-xs text-slate-400">(예정: {todayRecord.scheduled_start.substring(0, 5)})</span>
                    )}
                  </td>
                </tr>
                <tr className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-600">퇴근 시간</td>
                  <td className="px-4 py-3 font-semibold text-slate-800">
                    {formatTime(todayRecord.check_out_time)}
                    {todayRecord.scheduled_end && (
                      <span className="ml-2 text-xs text-slate-400">(예정: {todayRecord.scheduled_end.substring(0, 5)})</span>
                    )}
                  </td>
                </tr>
                {isCheckedIn && (
                  <tr className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-600">현재 근무 시간</td>
                    <td className="px-4 py-3 font-semibold text-blue-600">{formatMinutes(workingMinutes)}</td>
                  </tr>
                )}
                {isCheckedOut && todayRecord.total_work_minutes && (
                  <tr className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-600">총 근무 시간</td>
                    <td className="px-4 py-3 font-semibold text-blue-600">{formatMinutes(todayRecord.total_work_minutes)}</td>
                  </tr>
                )}
                {(todayRecord.late_minutes > 0 || todayRecord.early_leave_minutes > 0 || todayRecord.overtime_minutes > 0) && (
                  <tr className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium text-slate-600">비고</td>
                    <td className="px-4 py-3 space-x-2">
                      {todayRecord.late_minutes > 0 && (
                        <span className="text-yellow-600 font-medium">지각 {todayRecord.late_minutes}분</span>
                      )}
                      {todayRecord.early_leave_minutes > 0 && (
                        <span className="text-orange-600 font-medium">조퇴 {todayRecord.early_leave_minutes}분</span>
                      )}
                      {todayRecord.overtime_minutes > 0 && (
                        <span className="text-green-600 font-medium">초과근무 {todayRecord.overtime_minutes}분</span>
                      )}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          ) : (
            <div className="text-center text-slate-500 py-8">
              아직 출근하지 않았습니다.
            </div>
          )}
        </div>
      </div>

      {/* 섹션 3: 위치 정보 */}
      <div>
        <SectionHeader number={3} title="위치 정보" icon={MapPin} />
        {locationError && (
          <div className="flex items-center space-x-2 bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            <span>{locationError}</span>
          </div>
        )}
        {location && (
          <div className="flex items-center space-x-2 bg-green-50 border border-green-200 rounded-lg p-4 text-sm text-green-800">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            <span>위치 정보가 활성화되었습니다.</span>
          </div>
        )}
      </div>

      {/* 섹션 4: 출퇴근 체크 */}
      <div>
        <SectionHeader number={4} title="출퇴근 체크" icon={Camera} />

        {/* 메시지 표시 */}
        {message && (
          <div
            className={`mb-4 p-4 rounded-lg flex items-center space-x-2 ${
              message.type === 'success'
                ? 'bg-green-50 text-green-800 border border-green-200'
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}
          >
            {message.type === 'success' ? (
              <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
            )}
            <span>{message.text}</span>
          </div>
        )}

        {/* QR 스캔 버튼 */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <button
            onClick={openScannerForCheckIn}
            disabled={loading || isCheckedIn || isCheckedOut}
            className={`py-6 rounded-lg font-semibold text-white transition-all flex flex-col items-center justify-center space-y-2 ${
              loading || isCheckedIn || isCheckedOut
                ? 'bg-slate-300 cursor-not-allowed'
                : 'bg-blue-500 hover:bg-blue-600 active:bg-blue-700 shadow-md hover:shadow-lg'
            }`}
          >
            <Camera className="w-10 h-10" />
            <span className="text-lg">QR 스캔 출근</span>
          </button>

          <button
            onClick={openScannerForCheckOut}
            disabled={loading || !isCheckedIn || isCheckedOut}
            className={`py-6 rounded-lg font-semibold text-white transition-all flex flex-col items-center justify-center space-y-2 ${
              loading || !isCheckedIn || isCheckedOut
                ? 'bg-slate-300 cursor-not-allowed'
                : 'bg-green-500 hover:bg-green-600 active:bg-green-700 shadow-md hover:shadow-lg'
            }`}
          >
            <Camera className="w-10 h-10" />
            <span className="text-lg">QR 스캔 퇴근</span>
          </button>
        </div>

        {/* 안내 메시지 */}
        <div className="mt-4 p-4 bg-slate-50 rounded-lg border border-slate-200">
          <p className="text-xs font-medium text-slate-600 mb-2">안내사항</p>
          <ul className="text-xs text-slate-500 space-y-1 list-disc list-inside">
            <li>출근/퇴근 버튼을 클릭하면 QR 코드 스캐너가 실행됩니다.</li>
            <li>QR 코드를 카메라에 비추면 자동으로 출퇴근 처리됩니다.</li>
            <li>출근 시간은 근무 스케줄에 따라 자동으로 지각 여부가 판단됩니다.</li>
            <li>위치 정보는 출퇴근 인증에 사용되며 저장되지 않습니다.</li>
          </ul>
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

      {/* 퇴근 확인 모달 */}
      {showCheckoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75">
          <div className="bg-white rounded-2xl p-8 max-w-md w-full mx-4 text-center">
            {/* 아이콘 */}
            <div className="flex justify-center mb-6">
              <div className="w-20 h-20 bg-orange-100 rounded-full flex items-center justify-center">
                <Clock className="w-12 h-12 text-orange-500" />
              </div>
            </div>

            {/* 제목 */}
            <h3 className="text-2xl font-bold text-gray-800 mb-2">퇴근 하시겠습니까?</h3>
            <p className="text-gray-600 mb-6">퇴근 처리 전 확인해주세요.</p>

            {/* 근무 정보 */}
            <div className="bg-gray-50 rounded-lg p-4 mb-6 text-left">
              <div className="flex justify-between py-2 border-b border-gray-200">
                <span className="text-gray-600">출근 시간</span>
                <span className="font-semibold text-gray-800">{formatTime(todayRecord?.check_in_time)}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-gray-200">
                <span className="text-gray-600">현재 시간</span>
                <span className="font-semibold text-gray-800">
                  {currentTime.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-gray-600">근무 시간</span>
                <span className="font-semibold text-blue-600">{formatMinutes(workingMinutes)}</span>
              </div>
            </div>

            {/* 버튼 */}
            <div className="space-y-3">
              <button
                onClick={handleConfirmCheckout}
                disabled={loading}
                className="w-full py-4 bg-green-500 hover:bg-green-600 disabled:bg-gray-300 text-white font-semibold rounded-lg transition-colors text-lg"
              >
                {loading ? '처리 중...' : '퇴근하기'}
              </button>
              <button
                onClick={handleCancelCheckout}
                disabled={loading}
                className="w-full py-3 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold rounded-lg transition-colors"
              >
                취소
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
