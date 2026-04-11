'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  XMarkIcon,
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon,
  ArrowsRightLeftIcon,
  ArrowsUpDownIcon,
  ArrowPathIcon,
  SunIcon,
  AdjustmentsHorizontalIcon,
} from '@heroicons/react/24/outline'
import {
  type ImageTransforms,
  DEFAULT_TRANSFORMS,
  loadImageFromFile,
  renderPreview,
  applyImageTransforms,
} from './imageUtils'

// ============================================
// 임상 사진 편집 모달
// Canvas 기반 실시간 미리보기 + 밝기/대비/회전/반전
// ============================================

interface PhotoLike {
  id: string
  file: File
  previewUrl: string
}

interface ClinicalPhotoEditorProps {
  photo: PhotoLike
  onSave: (photoId: string, newFile: File, newPreviewUrl: string) => void
  onClose: () => void
}

export default function ClinicalPhotoEditor({
  photo,
  onSave,
  onClose,
}: ClinicalPhotoEditorProps) {
  const [transforms, setTransforms] = useState<ImageTransforms>({ ...DEFAULT_TRANSFORMS })
  const [isSaving, setIsSaving] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const imageRef = useRef<HTMLImageElement | null>(null)
  const rafRef = useRef<number | null>(null)

  // 원본 이미지 로드
  useEffect(() => {
    let cancelled = false
    loadImageFromFile(photo.file).then((img) => {
      if (!cancelled) {
        imageRef.current = img
        updatePreview()
      }
    })
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photo.file])

  // 변환 변경 시 미리보기 업데이트
  const updatePreview = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      const img = imageRef.current
      const canvas = canvasRef.current
      if (!img || !canvas) return
      renderPreview(img, transforms, canvas, 700)
    })
  }, [transforms])

  useEffect(() => {
    updatePreview()
  }, [updatePreview])

  // ESC 키로 닫기
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // 변환 업데이트 헬퍼
  const updateTransform = (partial: Partial<ImageTransforms>) => {
    setTransforms((prev) => ({ ...prev, ...partial }))
  }

  // 90도 회전
  const rotateCW = () => updateTransform({ rotation: (transforms.rotation + 90) % 360 })
  const rotateCCW = () => updateTransform({ rotation: (transforms.rotation - 90 + 360) % 360 })

  // 초기화
  const resetAll = () => setTransforms({ ...DEFAULT_TRANSFORMS })

  // 변경사항 존재 여부
  const hasChanges =
    transforms.brightness !== 0 ||
    transforms.contrast !== 0 ||
    transforms.rotation !== 0 ||
    transforms.flipH ||
    transforms.flipV

  // 저장
  const handleSave = async () => {
    const img = imageRef.current
    if (!img || !hasChanges) return

    setIsSaving(true)
    try {
      const newFile = await applyImageTransforms(img, transforms)
      const newPreviewUrl = URL.createObjectURL(newFile)
      onSave(photo.id, newFile, newPreviewUrl)
      onClose()
    } catch (err) {
      console.error('사진 편집 저장 실패:', err)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-at-border">
          <div className="flex items-center gap-2">
            <AdjustmentsHorizontalIcon className="h-5 w-5 text-indigo-600" />
            <h3 className="text-base font-semibold text-at-text">사진 편집</h3>
          </div>
          <div className="flex items-center gap-2">
            {hasChanges && (
              <button
                onClick={resetAll}
                className="px-3 py-1.5 text-xs text-at-text hover:text-at-text hover:bg-at-surface-alt rounded-xl transition-colors"
              >
                <ArrowPathIcon className="h-3.5 w-3.5 inline mr-1" />
                초기화
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-at-text hover:text-at-text hover:bg-at-surface-alt rounded-xl transition-colors"
            >
              <XMarkIcon className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* 캔버스 미리보기 */}
        <div className="flex-1 overflow-auto bg-slate-900 flex items-center justify-center p-4 min-h-[250px]">
          <canvas
            ref={canvasRef}
            className="max-w-full max-h-[350px] rounded-xl shadow-lg"
            style={{ objectFit: 'contain' }}
          />
        </div>

        {/* 편집 컨트롤 */}
        <div className="px-5 py-4 space-y-4 border-t border-at-border">
          {/* 밝기 */}
          <div className="flex items-center gap-3">
            <SunIcon className="h-4 w-4 text-at-text flex-shrink-0" />
            <label className="text-xs font-medium text-at-text w-10">밝기</label>
            <input
              type="range"
              min={-100}
              max={100}
              value={transforms.brightness}
              onChange={(e) => updateTransform({ brightness: Number(e.target.value) })}
              className="flex-1 h-1.5 bg-at-border rounded-full accent-indigo-600 cursor-pointer"
            />
            <span className="text-xs text-at-text w-10 text-right tabular-nums">
              {transforms.brightness > 0 ? '+' : ''}{transforms.brightness}
            </span>
          </div>

          {/* 대비 */}
          <div className="flex items-center gap-3">
            <AdjustmentsHorizontalIcon className="h-4 w-4 text-at-text flex-shrink-0" />
            <label className="text-xs font-medium text-at-text w-10">대비</label>
            <input
              type="range"
              min={-100}
              max={100}
              value={transforms.contrast}
              onChange={(e) => updateTransform({ contrast: Number(e.target.value) })}
              className="flex-1 h-1.5 bg-at-border rounded-full accent-indigo-600 cursor-pointer"
            />
            <span className="text-xs text-at-text w-10 text-right tabular-nums">
              {transforms.contrast > 0 ? '+' : ''}{transforms.contrast}
            </span>
          </div>

          {/* 회전 + 반전 */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={rotateCCW}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-at-text bg-at-surface-alt hover:bg-at-border rounded-xl transition-colors"
              title="반시계 90도"
            >
              <ArrowUturnLeftIcon className="h-3.5 w-3.5" />
              90°
            </button>
            <button
              onClick={rotateCW}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-at-text bg-at-surface-alt hover:bg-at-border rounded-xl transition-colors"
              title="시계 90도"
            >
              <ArrowUturnRightIcon className="h-3.5 w-3.5" />
              90°
            </button>

            <div className="w-px h-6 bg-at-border mx-1" />

            {/* 미세 회전 */}
            <label className="text-xs text-at-text">미세:</label>
            <input
              type="range"
              min={-15}
              max={15}
              step={1}
              value={transforms.rotation % 90 === 0 ? 0 : transforms.rotation % 90}
              onChange={(e) => {
                const base = Math.round(transforms.rotation / 90) * 90
                updateTransform({ rotation: base + Number(e.target.value) })
              }}
              className="w-24 h-1.5 bg-at-border rounded-full accent-indigo-600 cursor-pointer"
            />
            <span className="text-[11px] text-at-text tabular-nums w-8">
              {transforms.rotation}°
            </span>

            <div className="w-px h-6 bg-at-border mx-1" />

            <button
              onClick={() => updateTransform({ flipH: !transforms.flipH })}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl transition-colors ${
                transforms.flipH
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'bg-at-surface-alt text-at-text hover:bg-at-border'
              }`}
              title="좌우 반전"
            >
              <ArrowsRightLeftIcon className="h-3.5 w-3.5" />
              좌우
            </button>
            <button
              onClick={() => updateTransform({ flipV: !transforms.flipV })}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl transition-colors ${
                transforms.flipV
                  ? 'bg-indigo-100 text-indigo-700'
                  : 'bg-at-surface-alt text-at-text hover:bg-at-border'
              }`}
              title="상하 반전"
            >
              <ArrowsUpDownIcon className="h-3.5 w-3.5" />
              상하
            </button>
          </div>
        </div>

        {/* 하단 액션 */}
        <div className="flex items-center justify-end px-5 py-3 border-t border-at-border bg-at-surface-alt">
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium text-at-text bg-white border border-at-border hover:bg-at-surface-alt rounded-xl transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              disabled={!hasChanges || isSaving}
              className="px-4 py-2 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-colors disabled:bg-at-border disabled:cursor-not-allowed"
            >
              {isSaving ? '저장 중...' : '저장'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
