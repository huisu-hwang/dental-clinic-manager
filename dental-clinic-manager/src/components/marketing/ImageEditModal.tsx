'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  XMarkIcon,
  ArrowPathIcon,
  CheckIcon,
  SparklesIcon,
  PhotoIcon,
  ArrowsPointingOutIcon,
} from '@heroicons/react/24/outline'
import {
  IMAGE_VISUAL_STYLE_LABELS,
  type ImageVisualStyle,
} from '@/types/marketing'

interface ImageEditModalProps {
  isOpen: boolean
  onClose: () => void
  image: { fileName: string; prompt: string; path?: string }
  onImageUpdated: (newImage: { fileName: string; prompt: string; path: string }) => void
}

export default function ImageEditModal({
  isOpen,
  onClose,
  image,
  onImageUpdated,
}: ImageEditModalProps) {
  const [editedPrompt, setEditedPrompt] = useState(image.prompt)
  const [selectedVisualStyle, setSelectedVisualStyle] = useState<ImageVisualStyle>('realistic')
  const [isRegenerating, setIsRegenerating] = useState(false)
  const [newImage, setNewImage] = useState<{ fileName: string; prompt: string; path: string } | null>(null)
  const [error, setError] = useState('')
  const [compareOpen, setCompareOpen] = useState(false)
  const [compareActiveImg, setCompareActiveImg] = useState<'current' | 'new'>('current')

  // 모달 열릴 때 상태 초기화
  useEffect(() => {
    if (isOpen) {
      setEditedPrompt(image.prompt)
      setNewImage(null)
      setError('')
      setIsRegenerating(false)
      setCompareOpen(false)
      setCompareActiveImg('current')
    }
  }, [isOpen, image.prompt])

  // ESC 키로 비교 오버레이 닫기
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === 'Escape' && compareOpen) {
      setCompareOpen(false)
    }
  }, [compareOpen])

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  const handleRegenerate = async () => {
    if (!editedPrompt.trim()) {
      setError('프롬프트를 입력해주세요.')
      return
    }

    setIsRegenerating(true)
    setError('')

    try {
      const res = await fetch('/api/marketing/regenerate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: editedPrompt.trim(),
          imageVisualStyle: selectedVisualStyle,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || '이미지 재생성에 실패했습니다.')
      }

      const data = await res.json()
      setNewImage({
        fileName: data.fileName,
        prompt: data.prompt,
        path: data.path,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : '이미지 재생성 중 오류가 발생했습니다.')
    } finally {
      setIsRegenerating(false)
    }
  }

  const handleApply = () => {
    if (newImage) {
      onImageUpdated(newImage)
      onClose()
    }
  }

  const handleOpenCompare = () => {
    setCompareActiveImg('current')
    setCompareOpen(true)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 배경 오버레이 */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* 모달 본체 */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl mx-4 max-h-[90vh] overflow-y-auto">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-at-border">
          <div className="flex items-center gap-2">
            <PhotoIcon className="h-5 w-5 text-indigo-600" />
            <h3 className="text-lg font-semibold text-at-text">이미지 편집</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-at-text hover:text-at-text hover:bg-at-surface-alt rounded-xl transition-colors"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* 이미지 비교 영역 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* 현재 이미지 */}
            <div className="space-y-2">
              <span className="text-xs font-medium text-at-text">현재 이미지</span>
              <div
                className={`relative aspect-square sm:aspect-[4/3] rounded-xl border border-at-border overflow-hidden bg-at-surface-alt ${image.path && newImage ? 'cursor-pointer group' : ''}`}
                onClick={image.path && newImage ? handleOpenCompare : undefined}
                title={image.path && newImage ? '클릭하여 비교 보기' : undefined}
              >
                {image.path ? (
                  <>
                    <img
                      src={image.path}
                      alt={image.prompt}
                      className="w-full h-full object-cover"
                    />
                    {newImage && (
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/30">
                        <span className="text-white text-xs font-medium bg-black/50 px-3 py-1.5 rounded-lg">비교 보기</span>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex items-center justify-center h-full text-at-text">
                    <PhotoIcon className="h-12 w-12" />
                  </div>
                )}
              </div>
              <p className="text-[11px] text-at-text truncate" title={image.fileName}>
                {image.fileName}
              </p>
            </div>

            {/* 새 이미지 (재생성 후) */}
            <div className="space-y-2">
              <span className="text-xs font-medium text-at-text">
                {newImage ? '새 이미지' : '재생성 미리보기'}
              </span>
              <div className="relative aspect-square sm:aspect-[4/3] rounded-xl border border-dashed border-at-border overflow-hidden bg-at-surface-alt">
                {isRegenerating ? (
                  <div className="flex flex-col items-center justify-center h-full gap-3">
                    <div className="relative">
                      <div className="w-10 h-10 border-3 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
                    </div>
                    <span className="text-xs text-at-text">이미지 생성 중...</span>
                    <span className="text-[10px] text-at-text">30초 정도 소요됩니다</span>
                  </div>
                ) : newImage ? (
                  <div className="group relative w-full h-full">
                    <img
                      src={newImage.path}
                      alt={newImage.prompt}
                      className="w-full h-full object-cover"
                    />
                    {/* 호버 오버레이 버튼 */}
                    <div className="absolute inset-0 flex items-end justify-end p-2 opacity-0 group-hover:opacity-100 transition-opacity bg-gradient-to-t from-black/50 to-transparent">
                      <button
                        type="button"
                        onClick={handleOpenCompare}
                        className="flex items-center gap-1.5 bg-white/90 hover:bg-white text-slate-700 rounded-lg px-2.5 py-1.5 text-xs font-medium shadow-sm transition-colors"
                      >
                        <ArrowsPointingOutIcon className="h-3.5 w-3.5" />
                        나란히 비교
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center h-full gap-2 text-at-text">
                    <SparklesIcon className="h-10 w-10" />
                    <span className="text-xs">프롬프트를 수정하고</span>
                    <span className="text-xs">재생성 해보세요</span>
                  </div>
                )}
              </div>
              {newImage && (
                <p className="text-[11px] text-at-text truncate" title={newImage.fileName}>
                  {newImage.fileName}
                </p>
              )}
            </div>
          </div>

          {/* 프롬프트 편집 */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-at-text">이미지 프롬프트</label>
            <textarea
              value={editedPrompt}
              onChange={(e) => setEditedPrompt(e.target.value)}
              rows={3}
              placeholder="생성할 이미지를 설명해주세요..."
              className="w-full px-3 py-2 border border-at-border rounded-xl text-sm focus:ring-2 focus:ring-at-accent focus:border-at-accent resize-none"
            />
          </div>

          {/* 시각적 스타일 선택 */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-at-text">시각적 스타일</label>
            <div className="grid grid-cols-3 gap-2">
              {(Object.entries(IMAGE_VISUAL_STYLE_LABELS) as [ImageVisualStyle, { label: string; description: string; emoji: string }][]).map(
                ([value, { label, emoji }]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setSelectedVisualStyle(value)}
                    disabled={isRegenerating}
                    className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-left transition-all text-sm ${
                      selectedVisualStyle === value
                        ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500'
                        : 'border-at-border hover:border-at-border hover:bg-at-surface-alt'
                    } ${isRegenerating ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    <span>{emoji}</span>
                    <span className={`font-medium ${selectedVisualStyle === value ? 'text-indigo-700' : 'text-at-text'}`}>
                      {label}
                    </span>
                  </button>
                )
              )}
            </div>
          </div>

          {/* 에러 메시지 */}
          {error && (
            <div className="bg-at-error-bg border border-red-200 rounded-xl px-3 py-2 text-sm text-at-error">
              {error}
            </div>
          )}

          {/* 액션 버튼 */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleRegenerate}
              disabled={isRegenerating || !editedPrompt.trim()}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 disabled:bg-at-border disabled:cursor-not-allowed transition-colors text-sm font-medium"
            >
              {isRegenerating ? (
                <>
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  생성 중...
                </>
              ) : (
                <>
                  <ArrowPathIcon className="h-4 w-4" />
                  {newImage ? '다시 생성' : '재생성'}
                </>
              )}
            </button>

            {newImage && (
              <button
                onClick={handleOpenCompare}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl hover:bg-slate-200 transition-colors text-sm font-medium"
              >
                <ArrowsPointingOutIcon className="h-4 w-4" />
                비교
              </button>
            )}

            {newImage && (
              <button
                onClick={handleApply}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors text-sm font-medium"
              >
                <CheckIcon className="h-4 w-4" />
                적용
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 풀스크린 비교 오버레이 */}
      {compareOpen && newImage && (
        <div
          className="fixed inset-0 z-[60] bg-black/95 flex flex-col"
          onClick={() => setCompareOpen(false)}
        >
          {/* 헤더 */}
          <div
            className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2">
              <ArrowsPointingOutIcon className="h-5 w-5 text-white/70" />
              <span className="text-white font-semibold">이미지 비교</span>
            </div>
            <button
              className="p-2 text-white/70 hover:text-white transition-colors rounded-lg hover:bg-white/10"
              onClick={() => setCompareOpen(false)}
            >
              <XMarkIcon className="h-6 w-6" />
            </button>
          </div>

          {/* 데스크탑: 나란히 비교 */}
          <div
            className="hidden md:flex flex-1 min-h-0 gap-0"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 현재 이미지 패널 */}
            <div className="flex-1 flex flex-col gap-3 p-6">
              <span className="flex-shrink-0 text-xs font-semibold text-gray-400 uppercase tracking-wider">현재 이미지</span>
              <div className="flex-1 min-h-0 flex items-center justify-center">
                {image.path ? (
                  <img
                    src={image.path}
                    alt={image.prompt}
                    className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-3 text-gray-600">
                    <PhotoIcon className="h-16 w-16" />
                    <span className="text-sm">이미지 없음</span>
                  </div>
                )}
              </div>
              <p className="flex-shrink-0 text-xs text-gray-500 truncate text-center" title={image.fileName}>
                {image.fileName}
              </p>
            </div>

            {/* 구분선 */}
            <div className="w-px bg-white/20 self-stretch" />

            {/* 새 이미지 패널 */}
            <div className="flex-1 flex flex-col gap-3 p-6">
              <span className="flex-shrink-0 text-xs font-semibold text-indigo-400 uppercase tracking-wider">새 이미지</span>
              <div className="flex-1 min-h-0 flex items-center justify-center">
                <img
                  src={newImage.path}
                  alt={newImage.prompt}
                  className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
                />
              </div>
              <p className="flex-shrink-0 text-xs text-gray-500 truncate text-center" title={newImage.fileName}>
                {newImage.fileName}
              </p>
            </div>
          </div>

          {/* 모바일: 탭 전환 */}
          <div
            className="md:hidden flex flex-col flex-1 min-h-0 p-4 gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 탭 버튼 */}
            <div className="flex-shrink-0 flex rounded-xl overflow-hidden border border-white/20">
              <button
                className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                  compareActiveImg === 'current'
                    ? 'bg-white text-black'
                    : 'text-gray-400 hover:text-white'
                }`}
                onClick={() => setCompareActiveImg('current')}
              >
                현재 이미지
              </button>
              <button
                className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                  compareActiveImg === 'new'
                    ? 'bg-indigo-500 text-white'
                    : 'text-gray-400 hover:text-white'
                }`}
                onClick={() => setCompareActiveImg('new')}
              >
                새 이미지
              </button>
            </div>

            {/* 이미지 */}
            <div className="flex-1 min-h-0 flex items-center justify-center">
              {compareActiveImg === 'current' ? (
                image.path ? (
                  <img
                    src={image.path}
                    alt={image.prompt}
                    className="max-w-full max-h-full object-contain rounded-lg"
                  />
                ) : (
                  <div className="flex flex-col items-center gap-3 text-gray-600">
                    <PhotoIcon className="h-16 w-16" />
                    <span className="text-sm">이미지 없음</span>
                  </div>
                )
              ) : (
                <img
                  src={newImage.path}
                  alt={newImage.prompt}
                  className="max-w-full max-h-full object-contain rounded-lg"
                />
              )}
            </div>
          </div>

          {/* 하단 액션 바 */}
          <div
            className="flex-shrink-0 flex items-center justify-center gap-4 px-6 py-4 border-t border-white/10"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setCompareOpen(false)}
              className="px-5 py-2.5 text-sm font-medium text-gray-300 hover:text-white rounded-xl border border-white/20 hover:bg-white/10 transition-colors"
            >
              닫기
            </button>
            <button
              onClick={handleApply}
              className="flex items-center gap-2 px-6 py-2.5 bg-green-600 text-white rounded-xl hover:bg-green-700 transition-colors text-sm font-medium"
            >
              <CheckIcon className="h-4 w-4" />
              이 이미지 적용
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
