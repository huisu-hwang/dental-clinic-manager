'use client'

import { useState, useEffect, useRef } from 'react'
import { attendanceService } from '@/lib/attendanceService'
import { useAuth } from '@/contexts/AuthContext'
import type { AttendanceQRCode, QRCodeRefreshPeriod } from '@/types/attendance'
import { QR_REFRESH_PERIOD_NAMES } from '@/types/attendance'
import QRCode from 'qrcode'

/**
 * QR 코드 보기 컴포넌트 (일반 직원용)
 * 관리 기능 없이 현재 유효한 QR 코드를 표시합니다.
 */
export default function QRCodeView() {
  const { user } = useAuth()
  const [qrCode, setQrCode] = useState<AttendanceQRCode | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // QR 코드 로드
  useEffect(() => {
    if (user?.clinic_id) {
      loadQRCode()
    }
  }, [user])

  // QR 코드를 canvas에 그리기
  useEffect(() => {
    if (qrCode?.qr_code && canvasRef.current) {
      QRCode.toCanvas(
        canvasRef.current,
        qrCode.qr_code,
        {
          width: 256,
          margin: 2,
          color: {
            dark: '#000000',
            light: '#FFFFFF'
          }
        },
        (error) => {
          if (error) {
            console.error('[QRCodeView] QR code generation error:', error)
          }
        }
      )
    }
  }, [qrCode])

  const loadQRCode = async () => {
    if (!user?.clinic_id) return

    setLoading(true)
    setError(null)

    try {
      const result = await attendanceService.getQRCodeForToday(user.clinic_id)
      if (result.success && result.qrCode) {
        setQrCode(result.qrCode)
      } else {
        setError('현재 유효한 QR 코드가 없습니다. 관리자에게 문의하세요.')
        setQrCode(null)
      }
    } catch (err) {
      console.error('[QRCodeView] Error loading QR code:', err)
      setError('QR 코드를 불러오는 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  // 남은 유효 기간 계산
  const getRemainingDays = () => {
    if (!qrCode?.valid_until) return null
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const validUntil = new Date(qrCode.valid_until)
    validUntil.setHours(0, 0, 0, 0)
    const diffTime = validUntil.getTime() - today.getTime()
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24))
    return diffDays
  }

  const remainingDays = getRemainingDays()

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">QR 코드를 불러오는 중...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto p-6">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
          <svg className="w-12 h-12 text-yellow-500 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          <h3 className="text-lg font-semibold text-yellow-800 mb-2">QR 코드 없음</h3>
          <p className="text-yellow-700">{error}</p>
          <button
            onClick={loadQRCode}
            className="mt-4 px-4 py-2 bg-yellow-100 hover:bg-yellow-200 text-yellow-800 rounded-lg transition-colors"
          >
            다시 시도
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      {/* 헤더 */}
      <div className="text-center mb-6">
        <h1 className="text-2xl font-bold text-gray-900">출퇴근 QR 코드</h1>
        <p className="mt-1 text-sm text-gray-600">
          아래 QR 코드를 스캔하여 출퇴근을 인증하세요.
        </p>
      </div>

      {/* QR 코드 표시 */}
      {qrCode && (
        <div className="bg-white rounded-lg shadow-md p-6">
          {/* QR 코드 이미지 */}
          <div className="text-center space-y-4">
            <div className="inline-block p-8 bg-white border-4 border-blue-200 rounded-lg shadow-inner">
              <canvas
                ref={canvasRef}
                className="mx-auto"
                style={{ imageRendering: 'pixelated' }}
              />
            </div>

            <div className="text-xl font-bold text-gray-900">
              출퇴근 인증
            </div>

            {/* 유효 기간 정보 */}
            <div className="space-y-2">
              <div className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                {QR_REFRESH_PERIOD_NAMES[qrCode.refresh_period as QRCodeRefreshPeriod] || '매일'} 갱신
              </div>

              <div className="text-sm text-gray-600">
                유효 기간: {new Date(qrCode.valid_date).toLocaleDateString('ko-KR')} ~ {new Date(qrCode.valid_until).toLocaleDateString('ko-KR')}
              </div>

              {/* 남은 기간 표시 */}
              {remainingDays !== null && (
                <div className={`text-sm font-medium ${
                  remainingDays <= 1 ? 'text-red-600' :
                  remainingDays <= 3 ? 'text-yellow-600' :
                  'text-green-600'
                }`}>
                  {remainingDays === 0 ? (
                    '오늘 만료됩니다'
                  ) : remainingDays === 1 ? (
                    '내일 만료됩니다'
                  ) : (
                    `${remainingDays}일 후 만료`
                  )}
                </div>
              )}
            </div>

            {/* 위치 정보 */}
            {qrCode.latitude && qrCode.longitude && (
              <div className="text-xs text-gray-500">
                인증 반경: {qrCode.radius_meters}m 이내
              </div>
            )}
          </div>

          {/* 안내 메시지 */}
          <div className="mt-6 pt-6 border-t border-gray-200">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h4 className="text-sm font-semibold text-blue-800 mb-2">사용 방법</h4>
              <ul className="text-sm text-blue-700 space-y-1">
                <li>1. 휴대폰 카메라 앱을 열어 QR 코드를 스캔하세요.</li>
                <li>2. 스캔하면 자동으로 출근 또는 퇴근 처리됩니다.</li>
                <li>3. 위치 확인이 필요한 경우 위치 권한을 허용해주세요.</li>
              </ul>
            </div>
          </div>

          {/* 새로고침 버튼 */}
          <div className="mt-4 text-center">
            <button
              onClick={loadQRCode}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <svg className="w-4 h-4 inline-block mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              새로고침
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
