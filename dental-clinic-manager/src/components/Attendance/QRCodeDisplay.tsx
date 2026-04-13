'use client'

import { useState, useEffect, useRef } from 'react'
import { attendanceService } from '@/lib/attendanceService'
import { useAuth } from '@/contexts/AuthContext'
import type { AttendanceQRCode, QRCodeGenerateInput, QRCodeValidityType } from '@/types/attendance'
import { QR_CODE_VALIDITY_OPTIONS } from '@/types/attendance'
import QRCode from 'qrcode'

export default function QRCodeDisplay() {
  const { user } = useAuth()
  const [qrCode, setQrCode] = useState<AttendanceQRCode | null>(null)
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [latitude, setLatitude] = useState('')
  const [longitude, setLongitude] = useState('')
  const [radiusMeters, setRadiusMeters] = useState('100')
  const [autoRefresh, setAutoRefresh] = useState(true)
  const [validityType, setValidityType] = useState<QRCodeValidityType>('daily')
  const [customValidityDays, setCustomValidityDays] = useState('7')
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

  const generateNewQRCode = async () => {
    if (!user?.clinic_id) {
      setMessage({ type: 'error', text: '클리닉 정보를 찾을 수 없습니다.' })
      return
    }

    setLoading(true)
    setMessage(null)

    try {
      const hasLocation = latitude.trim() !== '' && longitude.trim() !== ''
      const parsedRadius = parseInt(radiusMeters, 10)
      const parsedCustomDays = parseInt(customValidityDays, 10)

      const request: QRCodeGenerateInput = {
        clinic_id: user.clinic_id,
        radius_meters: Number.isFinite(parsedRadius) ? parsedRadius : undefined,
        validity_type: validityType,
        validity_days: validityType === 'custom' && Number.isFinite(parsedCustomDays) ? parsedCustomDays : undefined,
        force_regenerate: !!qrCode, // 기존 QR 코드가 있으면 강제 재생성
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
        const successMessage = hasLocation
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
    if (!canvasRef.current || !qrCode) return

    // Canvas를 이미지 데이터로 변환
    const qrImageData = canvasRef.current.toDataURL('image/png')

    // 유효 기간 텍스트 생성
    const validityText = qrCode.valid_until && qrCode.valid_until !== qrCode.valid_date
      ? `유효 기간: ${new Date(qrCode.valid_date).toLocaleDateString('ko-KR')} ~ ${new Date(qrCode.valid_until).toLocaleDateString('ko-KR')}`
      : `유효 날짜: ${new Date(qrCode.valid_date).toLocaleDateString('ko-KR')}`

    // 새 창 열기
    const printWindow = window.open('', '_blank', 'width=400,height=600')
    if (!printWindow) {
      setMessage({ type: 'error', text: '팝업이 차단되었습니다. 팝업을 허용해주세요.' })
      return
    }

    // 인쇄용 HTML 작성
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>QR 코드 인쇄</title>
          <style>
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              display: flex;
              justify-content: center;
              align-items: center;
              min-height: 100vh;
              background: white;
            }
            .container {
              text-align: center;
              padding: 40px;
            }
            .qr-wrapper {
              display: inline-block;
              padding: 24px;
              border: 4px solid #e5e7eb;
              border-radius: 12px;
              background: white;
              margin-bottom: 24px;
            }
            .qr-image {
              width: 256px;
              height: 256px;
              image-rendering: pixelated;
            }
            .title {
              font-size: 24px;
              font-weight: 700;
              color: #111827;
              margin-bottom: 12px;
            }
            .validity {
              font-size: 14px;
              color: #4b5563;
              margin-bottom: 8px;
            }
            .radius {
              font-size: 12px;
              color: #6b7280;
            }
            @media print {
              body {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
              }
              .container {
                padding: 20px;
              }
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="qr-wrapper">
              <img src="${qrImageData}" alt="QR Code" class="qr-image" />
            </div>
            <div class="title">출퇴근 인증</div>
            <div class="validity">${validityText}</div>
            <div class="radius">인증 반경: ${qrCode.radius_meters}m 이내</div>
          </div>
          <script>
            window.onload = function() {
              setTimeout(function() {
                window.print();
                window.onafterprint = function() {
                  window.close();
                };
              }, 100);
            };
          </script>
        </body>
      </html>
    `)
    printWindow.document.close()
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div>
        <h1 className="text-2xl font-bold text-at-text">QR 코드 관리</h1>
        <p className="mt-1 text-sm text-at-text-secondary">
          직원들이 출퇴근 시 스캔할 QR 코드를 생성하고 관리합니다.
        </p>
      </div>

      {/* 현재 QR 코드 */}
      {qrCode && (
        <div className="bg-white rounded-2xl shadow-at-card p-6 print:shadow-none">
          <div className="flex justify-between items-center mb-4 print:mb-6">
            <h2 className="text-xl font-semibold">오늘의 QR 코드</h2>
            <div className="flex gap-2 print:hidden">
              <button
                onClick={copyToClipboard}
                className="px-3 py-1 text-sm bg-at-surface-alt hover:bg-at-border rounded-xl transition-colors"
              >
                복사
              </button>
              <button
                onClick={printQRCode}
                className="px-3 py-1 text-sm bg-at-surface-alt hover:bg-at-border rounded-xl transition-colors"
              >
                인쇄
              </button>
            </div>
          </div>

          {/* QR 코드 표시 영역 */}
          <div className="text-center space-y-4">
            <div className="inline-block p-8 bg-white border-4 border-at-border rounded-xl">
              <canvas
                ref={canvasRef}
                className="mx-auto"
                style={{ imageRendering: 'pixelated' }}
              />
            </div>

            <div className="text-lg font-semibold text-at-text print:text-2xl">
              출퇴근 인증
            </div>
            <div className="text-sm text-at-text-secondary">
              {qrCode.valid_until && qrCode.valid_until !== qrCode.valid_date ? (
                <>유효 기간: {new Date(qrCode.valid_date).toLocaleDateString('ko-KR')} ~ {new Date(qrCode.valid_until).toLocaleDateString('ko-KR')}</>
              ) : (
                <>유효 날짜: {new Date(qrCode.valid_date).toLocaleDateString('ko-KR')}</>
              )}
            </div>
            <div className="text-xs text-at-text-weak">
              인증 반경: {qrCode.radius_meters}m 이내
            </div>
          </div>

          {/* QR 코드 정보 */}
          <div className="mt-6 pt-6 border-t border-at-border space-y-3 print:hidden">
            <div className="flex justify-between text-sm">
              <span className="text-at-text-secondary">QR 코드 ID:</span>
              <span className="font-mono text-at-text">{qrCode.id.substring(0, 8)}...</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-at-text-secondary">생성 시간:</span>
              <span className="text-at-text">
                {new Date(qrCode.created_at).toLocaleString('ko-KR')}
              </span>
            </div>
            {qrCode.latitude && qrCode.longitude && (
              <>
                <div className="flex justify-between text-sm">
                  <span className="text-at-text-secondary">위도:</span>
                  <span className="text-at-text">{qrCode.latitude}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-at-text-secondary">경도:</span>
                  <span className="text-at-text">{qrCode.longitude}</span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* QR 코드 생성 폼 */}
      <div className="bg-white rounded-2xl shadow-at-card p-6 print:hidden">
        <h2 className="text-xl font-semibold mb-4">새 QR 코드 생성</h2>

        {message && (
          <div
            className={`mb-4 p-4 rounded-xl ${
              message.type === 'success'
                ? 'bg-at-success-bg text-green-800 border border-green-200'
                : 'bg-at-error-bg text-red-800 border border-red-200'
            }`}
          >
            {message.text}
          </div>
        )}

        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-at-text-secondary mb-2">
                위도 (Latitude)
              </label>
              <input
                type="number"
                step="0.000001"
                value={latitude}
                onChange={(e) => setLatitude(e.target.value)}
                placeholder="37.123456"
                className="w-full px-3 py-2 border border-at-border rounded-xl focus:ring-2 focus:ring-at-accent focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-at-text-secondary mb-2">
                경도 (Longitude)
              </label>
              <input
                type="number"
                step="0.000001"
                value={longitude}
                onChange={(e) => setLongitude(e.target.value)}
                placeholder="127.123456"
                className="w-full px-3 py-2 border border-at-border rounded-xl focus:ring-2 focus:ring-at-accent focus:border-transparent"
              />
            </div>
          </div>

          <p className="text-xs text-at-text-weak">
            ※ 위도와 경도는 선택 사항입니다. 입력하지 않으면 위치 검증 없이 QR 코드가 생성됩니다.
          </p>

          <div>
            <label className="block text-sm font-medium text-at-text-secondary mb-2">
              인증 반경 (미터)
            </label>
            <input
              type="number"
              value={radiusMeters}
              onChange={(e) => setRadiusMeters(e.target.value)}
              placeholder="100"
              className="w-full px-3 py-2 border border-at-border rounded-xl focus:ring-2 focus:ring-at-accent focus:border-transparent"
            />
            <p className="mt-1 text-sm text-at-text-weak">
              이 반경 내에서만 출퇴근 인증이 가능합니다.
            </p>
          </div>

          {/* QR 코드 유효 기간 설정 */}
          <div className="border-t border-at-border pt-4">
            <label className="block text-sm font-medium text-at-text-secondary mb-2">
              QR 코드 유효 기간
            </label>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <select
                value={validityType}
                onChange={(e) => setValidityType(e.target.value as QRCodeValidityType)}
                className="w-full px-3 py-2 border border-at-border rounded-xl focus:ring-2 focus:ring-at-accent focus:border-transparent"
              >
                {QR_CODE_VALIDITY_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {validityType === 'custom' && (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min="1"
                    max="365"
                    value={customValidityDays}
                    onChange={(e) => setCustomValidityDays(e.target.value)}
                    placeholder="7"
                    className="flex-1 px-3 py-2 border border-at-border rounded-xl focus:ring-2 focus:ring-at-accent focus:border-transparent"
                  />
                  <span className="text-sm text-at-text-secondary">일</span>
                </div>
              )}
            </div>
            <p className="mt-1 text-sm text-at-text-weak">
              {validityType === 'daily' && '매일 자정에 새 QR 코드가 필요합니다.'}
              {validityType === 'weekly' && '7일 동안 동일한 QR 코드를 사용할 수 있습니다.'}
              {validityType === 'monthly' && '30일 동안 동일한 QR 코드를 사용할 수 있습니다.'}
              {validityType === 'custom' && '지정한 기간 동안 동일한 QR 코드를 사용할 수 있습니다.'}
            </p>
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="autoRefresh"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="w-4 h-4 text-at-accent border-at-border rounded focus:ring-at-accent"
            />
            <label htmlFor="autoRefresh" className="ml-2 text-sm text-at-text-secondary">
              유효 기간 만료 시 자동으로 새 QR 코드 로드
            </label>
          </div>

          <button
            onClick={generateNewQRCode}
            disabled={loading}
            className="w-full py-3 bg-at-accent text-white rounded-xl font-semibold hover:bg-at-accent disabled:bg-at-border disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'QR 코드 생성 중...' : qrCode ? '새 QR 코드 재생성' : 'QR 코드 생성'}
          </button>
        </div>
      </div>

      {/* 사용 안내 */}
      <div className="bg-at-warning-bg border border-yellow-200 rounded-xl p-4 text-sm text-yellow-800 print:hidden">
        <h3 className="font-semibold mb-2">📋 사용 안내</h3>
        <ul className="space-y-1">
          <li>• QR 코드 유효 기간을 설정하여 매일/매주/매월 또는 원하는 기간 동안 사용할 수 있습니다.</li>
          <li>• 위치 정보는 출퇴근 인증 시 거리 검증에 사용됩니다.</li>
          <li>• QR 코드를 출력하여 출입구에 부착하거나 태블릿으로 표시하세요.</li>
          <li>• 인증 반경은 병원 규모에 맞게 조정하세요 (기본 100m).</li>
          <li>• 유효한 QR 코드가 있어도 필요 시 새 QR 코드로 재생성할 수 있습니다.</li>
        </ul>
      </div>
    </div>
  )
}
