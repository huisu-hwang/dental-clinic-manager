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

  const startScanner = async () => {
    if (scannerRef.current) return

    try {
      setError(null)
      const html5QrCode = new Html5Qrcode(scannerIdRef.current)
      scannerRef.current = html5QrCode

      await html5QrCode.start(
        { facingMode: 'environment' }, // 후면 카메라 사용
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
        },
        (decodedText) => {
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
    return () => {
      // 컴포넌트 언마운트 시 스캐너 정리
      if (scannerRef.current) {
        scannerRef.current.stop().catch(console.error)
      }
    }
  }, [])

  return (
    <div className="space-y-4">
      {!isScanning ? (
        <button
          onClick={startScanner}
          className="w-full py-3 px-4 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-lg transition-colors flex items-center justify-center space-x-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span>QR 코드 스캔</span>
        </button>
      ) : (
        <button
          onClick={stopScanner}
          className="w-full py-3 px-4 bg-red-500 hover:bg-red-600 text-white font-semibold rounded-lg transition-colors"
        >
          스캔 중지
        </button>
      )}

      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-800">
          {error}
        </div>
      )}

      {/* QR 스캐너 영역 */}
      <div
        id={scannerIdRef.current}
        className={`${isScanning ? 'block' : 'hidden'} rounded-lg overflow-hidden border-2 border-blue-500`}
      />

      {isScanning && (
        <div className="text-sm text-gray-600 text-center">
          QR 코드를 카메라에 비춰주세요
        </div>
      )}
    </div>
  )
}
