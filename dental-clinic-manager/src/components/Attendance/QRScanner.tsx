'use client'

import { useEffect, useRef, useState } from 'react'
import { Html5Qrcode } from 'html5-qrcode'

interface QRScannerProps {
  onScanSuccess: (decodedText: string) => void
  onScanError?: (error: string) => void
}

export default function QRScanner({ onScanSuccess, onScanError }: QRScannerProps) {
  const [isScanning, setIsScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scannerRef = useRef<Html5Qrcode | null>(null)
  const scannerIdRef = useRef('qr-reader-' + Math.random().toString(36).substring(7))
  const hasScannedRef = useRef(false)

  const startScanner = async () => {
    if (scannerRef.current) return

    try {
      setError(null)
      hasScannedRef.current = false
      const html5QrCode = new Html5Qrcode(scannerIdRef.current)
      scannerRef.current = html5QrCode

      await html5QrCode.start(
        { facingMode: 'environment' }, // 후면 카메라 사용
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        (decodedText) => {
          // 중복 스캔 방지
          if (hasScannedRef.current) return
          hasScannedRef.current = true

          // QR 코드 스캔 성공
          onScanSuccess(decodedText)
          stopScanner()
        },
        (errorMessage) => {
          // 스캔 중 에러 (무시해도 됨)
        }
      )
      setIsScanning(true)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '카메라를 시작할 수 없습니다.'
      setError(errorMsg)
      if (onScanError) {
        onScanError(errorMsg)
      }
    }
  }

  const stopScanner = async () => {
    if (scannerRef.current && isScanning) {
      try {
        await scannerRef.current.stop()
        scannerRef.current.clear()
        scannerRef.current = null
        setIsScanning(false)
      } catch (err) {
        console.error('Error stopping scanner:', err)
      }
    }
  }

  useEffect(() => {
    // 컴포넌트 마운트 시 자동으로 스캐너 시작
    startScanner()

    return () => {
      // 컴포넌트 언마운트 시 스캐너 정리
      if (scannerRef.current) {
        scannerRef.current.stop().catch(console.error)
      }
    }
  }, [])

  return (
    <div className="space-y-4">
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
          {error}
          <button
            onClick={startScanner}
            className="ml-2 underline hover:no-underline"
          >
            다시 시도
          </button>
        </div>
      )}

      {/* QR 스캐너 영역 - 항상 표시 */}
      <div
        id={scannerIdRef.current}
        className="rounded-lg overflow-hidden border-4 border-blue-500 bg-gray-900"
        style={{ minHeight: '300px' }}
      />

      {!error && (
        <div className="flex items-center justify-center space-x-2 text-sm text-gray-600">
          <div className="animate-pulse w-2 h-2 bg-blue-500 rounded-full"></div>
          <span>스캔 중...</span>
        </div>
      )}
    </div>
  )
}
