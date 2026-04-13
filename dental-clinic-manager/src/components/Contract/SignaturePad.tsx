'use client'

/**
 * SignaturePad Component
 * Electronic signature capture component with touch and mouse support
 */

import { useRef, useState, useEffect } from 'react'
import { appAlert } from '@/components/ui/AppDialog'

interface SignaturePadProps {
  onSave: (signatureData: string) => void
  onCancel?: () => void
  defaultSignature?: string
  width?: number
  height?: number
  disabled?: boolean
}

export default function SignaturePad({
  onSave,
  onCancel,
  defaultSignature,
  width = 500,
  height = 200,
  disabled = false
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [isEmpty, setIsEmpty] = useState(true)
  const [context, setContext] = useState<CanvasRenderingContext2D | null>(null)

  // Initialize canvas with proper sizing
  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    // Get actual container size
    const rect = container.getBoundingClientRect()
    const actualWidth = rect.width
    const actualHeight = Math.min(height, actualWidth * (height / width)) // Maintain aspect ratio

    // Set canvas internal resolution to match display size exactly
    // This ensures 1:1 pixel mapping and prevents scaling issues
    canvas.width = actualWidth
    canvas.height = actualHeight

    // Configure drawing context
    ctx.strokeStyle = '#000000'
    ctx.lineWidth = 2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    setContext(ctx)

    // Load default signature if provided
    if (defaultSignature) {
      const img = new Image()
      img.onload = () => {
        ctx.drawImage(img, 0, 0, actualWidth, actualHeight)
        setIsEmpty(false)
      }
      img.src = defaultSignature
    }
  }, [width, height, defaultSignature])

  // Get coordinates from mouse or touch event
  const getCoordinates = (e: React.MouseEvent | React.TouchEvent): { x: number; y: number } | null => {
    const canvas = canvasRef.current
    if (!canvas) return null

    const rect = canvas.getBoundingClientRect()

    // Since canvas internal resolution matches display size (1:1), no scaling needed
    if ('touches' in e) {
      // Touch event
      const touch = e.touches[0]
      return {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top
      }
    } else {
      // Mouse event
      return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
      }
    }
  }

  // Start drawing
  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (disabled || !context) return

    const coords = getCoordinates(e)
    if (!coords) return

    setIsDrawing(true)
    context.beginPath()
    context.moveTo(coords.x, coords.y)

    // Prevent scrolling on touch devices
    if ('touches' in e) {
      e.preventDefault()
    }
  }

  // Draw
  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || disabled || !context) return

    const coords = getCoordinates(e)
    if (!coords) return

    context.lineTo(coords.x, coords.y)
    context.stroke()
    setIsEmpty(false)

    // Prevent scrolling on touch devices
    if ('touches' in e) {
      e.preventDefault()
    }
  }

  // Stop drawing
  const stopDrawing = () => {
    if (!context) return
    setIsDrawing(false)
    context.closePath()
  }

  // Clear signature
  const clearSignature = () => {
    if (!context || disabled) return
    const canvas = canvasRef.current
    if (!canvas) return

    context.clearRect(0, 0, canvas.width, canvas.height)
    setIsEmpty(true)
  }

  // Save signature
  const saveSignature = async () => {
    if (isEmpty) {
      await appAlert('서명을 작성해주세요.')
      return
    }

    const canvas = canvasRef.current
    if (!canvas) return

    // Convert canvas to base64 image
    const signatureData = canvas.toDataURL('image/png')
    onSave(signatureData)
  }

  return (
    <div className="signature-pad-container">
      <div className="mb-4">
        <h3 className="text-lg font-semibold mb-2">전자 서명</h3>
        <p className="text-sm text-at-text-secondary">
          아래 영역에 서명을 작성해주세요. (마우스 또는 터치)
        </p>
      </div>

      {/* Signature Canvas */}
      <div
        ref={containerRef}
        className="border-2 border-at-border rounded-lg overflow-hidden bg-white mb-4"
        style={{ maxWidth: `${width}px`, aspectRatio: `${width}/${height}` }}
      >
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className={`cursor-crosshair ${disabled ? 'opacity-50' : ''}`}
          style={{ display: 'block', touchAction: 'none', width: '100%', height: '100%' }}
        />
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={clearSignature}
          disabled={disabled || isEmpty}
          className="px-4 py-2 bg-at-border text-at-text-secondary rounded-lg hover:bg-at-border disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          지우기
        </button>

        <button
          type="button"
          onClick={saveSignature}
          disabled={disabled || isEmpty}
          className="px-6 py-2 bg-at-accent text-white rounded-lg hover:bg-at-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
        >
          서명 완료
        </button>

        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={disabled}
            className="px-4 py-2 bg-white border border-at-border text-at-text-secondary rounded-lg hover:bg-at-surface-alt disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            취소
          </button>
        )}
      </div>

      {/* Security Notice */}
      <div className="mt-4 p-3 bg-at-accent-light border border-at-border rounded-lg">
        <p className="text-xs text-at-accent">
          <span className="font-semibold">🔒 보안 안내:</span> 서명 데이터는 암호화되어 안전하게 저장되며,
          IP 주소와 타임스탬프가 함께 기록됩니다.
        </p>
      </div>
    </div>
  )
}
