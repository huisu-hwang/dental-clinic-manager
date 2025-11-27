'use client'

import { useState, useEffect, useRef } from 'react'
import { attendanceService } from '@/lib/attendanceService'
import { useAuth } from '@/contexts/AuthContext'
import type { AttendanceQRCode, QRCodeGenerateInput, QRCodeRefreshPeriod } from '@/types/attendance'
import { QR_REFRESH_PERIOD_NAMES } from '@/types/attendance'
import QRCode from 'qrcode'

export default function QRCodeDisplay() {
  const { user } = useAuth()
  const [qrCode, setQrCode] = useState<AttendanceQRCode | null>(null)
  const [loading, setLoading] = useState(false)
  const [regenerating, setRegenerating] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [radiusMeters, setRadiusMeters] = useState('100')
  const [refreshPeriod, setRefreshPeriod] = useState<QRCodeRefreshPeriod>('daily')
  const [autoRefresh, setAutoRefresh] = useState(true)
  const canvasRef = useRef<HTMLCanvasElement>(null)

  // 현재 위치 가져오기
  useEffect(() => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setLatitude(position.coords.latitude.toFixed(6))
          setLongitude(position.coords.longitude.toFixed(6))
        },
        (error) => {
          console.error('[QRCodeDisplay] Location error:', error)
        }
      )
    }
  }, [])

  // QR 코드 로드
  useEffect(() => {
    if (user?.clinic_id) {
      loadQRCode()
    }
  }, [user])

  // 자동 새로고침 (자정 넘어가면 새 QR 생성)
  useEffect(() => {
    if (!autoRefresh) return

    const checkMidnight = setInterval(() => {
      const now = new Date()
      if (now.getHours() === 0 && now.getMinutes() === 0) {
        loadQRCode()
      }
    }, 60000) // 1분마다 체크

    return () => clearInterval(checkMidnight)
  }, [autoRefresh])

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
            console.error('[QRCodeDisplay] QR code generation error:', error)
          }
        }
      )
    }
  }, [qrCode])

  const loadQRCode = async () => {
    if (!user?.clinic_id) return

    setLoading(true)
    setMessage(null)

    try {
      const result = await attendanceService.getQRCodeForToday(user.clinic_id)
      if (result.success && result.qrCode) {
        setQrCode(result.qrCode)
      } else {
        setQrCode(null)
      }
    } catch (error) {
      console.error('[QRCodeDisplay] Error loading QR code:', error)
    } finally {
      setLoading(false)
    }
  }

  const generateNewQRCode = async (forceRegenerate: boolean = false) => {
    if (!user?.clinic_id) {
      setMessage({ type: 'error', text: '클리닉 정보를 찾을 수 없습니다.' })
      return
    }

    if (forceRegenerate) {
      setRegenerating(true)
    } else {
      setLoading(true)
    }
    setMessage(null)

    try {
      const hasLocation = latitude.trim() !== '' && longitude.trim() !== ''
      const parsedRadius = parseInt(radiusMeters, 10)

      const request: QRCodeGenerateInput = {
        clinic_id: user.clinic_id,
        radius_meters: Number.isFinite(parsedRadius) ? parsedRadius : undefined,
        refresh_period: refreshPeriod,
        force_regenerate: forceRegenerate,
      }

      if (hasLocation) {
        request.latitude = parseFloat(latitude)
        request.longitude = parseFloat(longitude)
      }

      // 타임아웃 설정 (10초)
      const qrCodePromise = attendanceService.generateDailyQRCode(request)

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('QR code generation timeout')), 10000)
      )

      const result = await Promise.race([qrCodePromise, timeoutPromise]) as any

      if (result.success && result.qrCode) {
        setQrCode(result.qrCode)
        const successMessage = forceRegenerate
          ? 'QR 코드가 재생성되었습니다!'
          : hasLocation
            ? 'QR 코드가 생성되었습니다!'
            : 'QR 코드가 생성되었습니다. 위치 검증을 사용하려면 위도와 경도를 입력해주세요.'
        setMessage({ type: 'success', text: successMessage })
      } else {
        setMessage({ type: 'error', text: result.error || 'QR 코드 생성 실패' })
      }
    } catch (error: any) {
      if (error.message === 'QR code generation timeout') {
        setMessage({ type: 'error', text: 'QR 코드 생성 시간이 초과되었습니다. 네트워크 연결을 확인하거나 다시 시도해주세요.' })
      } else {
        setMessage({ type: 'error', text: error.message || 'QR 코드 생성 중 오류가 발생했습니다.' })
      }
    } finally {
      setLoading(false)
      setRegenerating(false)
    }
  }

  const handleForceRegenerate = () => {
    if (window.confirm('현재 QR 코드를 무효화하고 새로운 QR 코드를 생성합니다.\n이 작업은 되돌릴 수 없습니다. 계속하시겠습니까?')) {
      generateNewQRCode(true)
    }
  }

  const copyToClipboard = async () => {
    if (!qrCode?.qr_code) return

    try {
      // 최신 Clipboard API 시도
      await navigator.clipboard.writeText(qrCode.qr_code)
      setMessage({ type: 'success', text: 'QR 코드가 클립보드에 복사되었습니다!' })
    } catch (err) {
      console.warn('Clipboard API failed, falling back to execCommand:', err)

      // 폴백: document.execCommand 사용
      const textArea = document.createElement('textarea')
      textArea.value = qrCode.qr_code
      textArea.style.position = 'fixed' // 화면에 보이지 않게 처리
      textArea.style.left = '-9999px'
      document.body.appendChild(textArea)
      textArea.focus()
      textArea.select()

      try {
        const successful = document.execCommand('copy')
        if (successful) {
          setMessage({ type: 'success', text: 'QR 코드가 클립보드에 복사되었습니다!' })
        } else {
          setMessage({ type: 'error', text: '클립보드 복사에 실패했습니다.' })
        }
      } catch (execErr) {
        console.error('Fallback execCommand failed:', execErr)
        setMessage({ type: 'error', text: '클립보드 복사에 실패했습니다.' })
      }

      document.body.removeChild(textArea)
    }

    setTimeout(() => setMessage(null), 3000)
  }

  const printQRCode = () => {
    window.print()
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* 헤더 */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">QR 코드 관리</h1>
        <p className="mt-1 text-sm text-gray-600">
          직원들이 출퇴근 시 스캔할 QR 코드를 생성하고 관리합니다.
        </p>
      </div>

      {/* 현재 QR 코드 */}
      {qrCode && (
        <div className="bg-white rounded-lg shadow-md p-6 print:shadow-none">
          <div className="flex justify-between items-center mb-4 print:mb-6">
            <h2 className="text-xl font-semibold">현재 QR 코드</h2>
            <div className="flex gap-2 print:hidden">
              <button
                onClick={handleForceRegenerate}
                disabled={regenerating}
                className="px-3 py-1 text-sm bg-red-100 hover:bg-red-200 text-red-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {regenerating ? '재생성 중...' : '즉시 재생성'}
              </button>
              <button
                onClick={copyToClipboard}
                className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                복사
              </button>
              <button
                onClick={printQRCode}
                className="px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
              >
                인쇄
              </button>
            </div>
          </div>

          {/* QR 코드 표시 영역 */}
          <div className="text-center space-y-4">
            <div className="inline-block p-8 bg-white border-4 border-gray-200 rounded-lg">
              <canvas
                ref={canvasRef}
                className="mx-auto"
                style={{ imageRendering: 'pixelated' }}
              />
            </div>

            <div className="text-lg font-semibold text-gray-900 print:text-2xl">
              출퇴근 인증
            </div>
            <div className="text-sm text-gray-600">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 mr-2">
                {QR_REFRESH_PERIOD_NAMES[qrCode.refresh_period as QRCodeRefreshPeriod] || '매일'}
              </span>
              유효 기간: {new Date(qrCode.valid_date).toLocaleDateString('ko-KR')} ~ {new Date(qrCode.valid_until).toLocaleDateString('ko-KR')}
            </div>
            <div className="text-xs text-gray-500">
              인증 반경: {qrCode.radius_meters}m 이내
            </div>
          </div>

          {/* QR 코드 정보 */}
          <div className="mt-6 pt-6 border-t border-gray-200 space-y-3 print:hidden">
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">QR 코드 ID:</span>
              <span className="font-mono text-gray-900">{qrCode.id.substring(0, 8)}...</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-600">생성 시간:</span>
              <span className="text-gray-900">
                {new Date(qrCode.created_at).toLocaleString('ko-KR')}
              </span>
            </div>
            {qrCode.latitude && qrCode.longitude && (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">위도:</span>
                  <span className="text-gray-900">{qrCode.latitude}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">경도:</span>
                  <span className="text-gray-900">{qrCode.longitude}</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* QR 코드 생성 폼 */}
      <div className="bg-white rounded-lg shadow-md p-6 print:hidden">
        <h2 className="text-xl font-semibold mb-4">새 QR 코드 생성</h2>

        {message && (
          <div
            className={`mb-4 p-4 rounded-lg ${
              message.type === 'success'
                ? 'bg-green-50 text-green-800 border border-green-200'
                : 'bg-red-50 text-red-800 border border-red-200'
            }`}
          >
            {message.text}
          </div>
        )}

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                위도 (Latitude)
              </label>
              <input
                type="number"
                step="0.000001"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                placeholder="37.123456"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                경도 (Longitude)
              </label>
              <input
                type="number"
                step="0.000001"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                placeholder="127.123456"
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          </div>

          <p className="text-xs text-gray-500">
            ※ 위도와 경도는 선택 사항입니다. 입력하지 않으면 위치 검증 없이 QR 코드가 생성됩니다.
          </p>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              인증 반경 (미터)
            </label>
            <input
              type="number"
              value={radiusMeters}
              onChange={(e) => setRadiusMeters(e.target.value)}
              placeholder="100"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="mt-1 text-sm text-gray-500">
              이 반경 내에서만 출퇴근 인증이 가능합니다.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              QR 코드 갱신 주기
            </label>
            <select
              value={refreshPeriod}
              onChange={(e) => setRefreshPeriod(e.target.value as QRCodeRefreshPeriod)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white"
            >
              <option value="daily">매일 (하루마다)</option>
              <option value="weekly">매주 (일주일마다)</option>
              <option value="monthly">매월 (한달마다)</option>
              <option value="yearly">매년 (일년마다)</option>
            </select>
            <p className="mt-1 text-sm text-gray-500">
              설정한 주기에 따라 QR 코드가 자동으로 만료됩니다.
            </p>
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="autoRefresh"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
            />
            <label htmlFor="autoRefresh" className="ml-2 text-sm text-gray-700">
              유효기간 만료 시 자동으로 새 QR 코드 생성
            </label>
          </div>

          <button
            onClick={() => generateNewQRCode(false)}
            disabled={loading}
            className="w-full py-3 bg-blue-500 text-white rounded-lg font-semibold hover:bg-blue-600 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'QR 코드 생성 중...' : qrCode ? '새 QR 코드 생성' : 'QR 코드 생성'}
          </button>
        </div>
      </div>

      {/* 사용 안내 */}
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800 print:hidden">
        <h3 className="font-semibold mb-2">사용 안내</h3>
        <ul className="space-y-1">
          <li>• QR 코드는 설정한 갱신 주기에 따라 유효 기간이 결정됩니다.</li>
          <li>• <strong>매일</strong>: 하루 동안만 유효 (기존 방식)</li>
          <li>• <strong>매주</strong>: 7일간 유효</li>
          <li>• <strong>매월</strong>: 30일간 유효</li>
          <li>• <strong>매년</strong>: 365일간 유효</li>
          <li>• <strong>즉시 재생성</strong> 버튼을 누르면 현재 QR 코드를 무효화하고 새 코드를 생성합니다.</li>
          <li>• 위치 정보는 출퇴근 인증 시 거리 검증에 사용됩니다.</li>
          <li>• QR 코드를 출력하여 출입구에 부착하거나 태블릿으로 표시하세요.</li>
        </ul>
      </div>
    </div>
  )
}
