'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  XMarkIcon,
  ArrowPathIcon,
  CheckIcon,
  SparklesIcon,
  PhotoIcon,
  ArrowsPointingOutIcon,
  PencilSquareIcon,
  ArrowUturnLeftIcon,
} from '@heroicons/react/24/outline'
import {
  IMAGE_VISUAL_STYLE_LABELS,
  type ImageVisualStyle,
} from '@/types/marketing'

type EditMode = 'modify' | 'regenerate'

interface ImageEditModalProps {
  isOpen: boolean
  onClose: () => void
  image: { fileName: string; prompt: string; path?: string }
  onImageUpdated: (newImage: { fileName: string; prompt: string; path: string }) => void
}

async function fetchImageAsBase64(url: string): Promise<string> {
  const response = await fetch(url)
  const blob = await response.blob()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => {
      const base64 = (reader.result as string).split(',')[1]
      resolve(base64)
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

export default function ImageEditModal({
  isOpen,
  onClose,
  image,
  onImageUpdated,
}: ImageEditModalProps) {
  const [editMode, setEditMode] = useState<EditMode>('modify')
  const [modifyInstruction, setModifyInstruction] = useState('')
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
      setEditMode('modify')
      setModifyInstruction('')
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
    if (editMode === 'modify' && !modifyInstruction.trim()) {
      setError('수정할 내용을 입력해주세요.')
      return
    }
    if (editMode === 'regenerate' && !editedPrompt.trim()) {
      setError('프롬프트를 입력해주세요.')
      return
    }

    setIsRegenerating(true)
    setError('')

    try {
      let prompt: string
      let referenceImageBase64: string | undefined

      if (editMode === 'modify') {
        // 수정 모드: 원본 이미지 기반 + 수정 지침
        prompt = `원본 이미지 설명: ${image.prompt}\n\n수정 요청: ${modifyInstruction.trim()}\n\n위 원본 이미지를 참고하여 수정 요청 사항을 반영한 새 이미지를 생성해주세요.`

        // 원본 이미지가 있으면 base64로 변환하여 참조 이미지로 전달
        if (image.path && !image.path.startsWith('data:')) {
          try {
            referenceImageBase64 = await fetchImageAsBase64(image.path)
          } catch {
            // 이미지 로드 실패 시 프롬프트만으로 진행
          }
        } else if (image.path?.startsWith('data:')) {
          referenceImageBase64 = image.path.split(',')[1]
        }
      } else {
        // 완전 재생성 모드: 새 프롬프트로 처음부터 생성
        prompt = editedPrompt.trim()
      }

      const res = await fetch('/api/marketing/regenerate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          imageVisualStyle: selectedVisualStyle,
          ...(referenceImageBase64 ? { referenceImageBase64 } : {}),
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || '이미지 생성에 실패했습니다.')
      }

      const data = await res.json()
      setNewImage({
        fileName: data.fileName,
        prompt: editMode === 'modify' ? image.prompt : editedPrompt.trim(),
        path: data.path,
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : '이미지 생성 중 오류가 발생했습니다.')
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

  const canGenerate = editMode === 'modify'
    ? modifyInstruction.trim().length > 0
    : editedPrompt.trim().length > 0

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
          {/* 편집 모드 선택 */}
          <div className="flex rounded-xl border border-at-border overflow-hidden">
            <button
              type="button"
              onClick={() => { setEditMode('modify'); setNewImage(null); setError('') }}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors ${
                editMode === 'modify'
                  ? 'bg-indigo-600 text-white'
                  : 'text-at-text hover:bg-at-surface-alt'
              }`}
            >
              <PencilSquareIcon className="h-4 w-4" />
              원본 기반 수정
            </button>
            <button
              type="button"
              onClick={() => { setEditMode('regenerate'); setNewImage(null); setError('') }}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-medium transition-colors border-l border-at-border ${
                editMode === 'regenerate'
                  ? 'bg-indigo-600 text-white'
                  : 'text-at-text hover:bg-at-surface-alt'
              }`}
            >
              <ArrowUturnLeftIcon className="h-4 w-4" />
              완전 재생성
            </button>
          </div>

          {/* 모드 설명 */}
          <p className="text-xs text-at-text bg-at-surface-alt rounded-xl px-4 py-2.5">
            {editMode === 'modify'
              ? '기존 이미지를 참고하여 수정 사항만 적용합니다. 원본의 스타일과 구성을 최대한 유지합니다.'
              : '프롬프트를 새로 작성하여 이미지를 처음부터 다시 생성합니다.'}
          </p>

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
                {newImage ? '수정된 이미지' : '미리보기'}
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
                    <span className="text-xs">
                      {editMode === 'modify' ? '수정 내용을 입력하고' : '프롬프트를 작성하고'}
                    </span>
                    <span className="text-xs">생성 버튼을 눌러보세요</span>
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

          {/* 수정 모드: 수정 프롬프트 입력 */}
          {editMode === 'modify' && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-at-text">수정 내용</label>
              <textarea
                value={modifyInstruction}
                onChange={(e) => setModifyInstruction(e.target.value)}
                rows={3}
                placeholder="예: 배경을 파란 하늘로 바꿔줘, 치아를 더 밝게 해줘, 스타일을 좀 더 밝고 친근하게..."
                className="w-full px-3 py-2 border border-at-border rounded-xl text-sm focus:ring-2 focus:ring-at-accent focus:border-at-accent resize-none"
              />
              <p className="text-[11px] text-at-text">원본 이미지({image.prompt.slice(0, 40)}{image.prompt.length > 40 ? '...' : ''})를 기반으로 수정합니다.</p>
            </div>
          )}

          {/* 재생성 모드: 전체 프롬프트 편집 */}
          {editMode === 'regenerate' && (
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
          )}

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
              disabled={isRegenerating || !canGenerate}
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
                  {newImage
                    ? (editMode === 'modify' ? '다시 수정' : '다시 생성')
                    : (editMode === 'modify' ? '수정 생성' : '재생성')}
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
              <span className="flex-shrink-0 text-xs font-semibold text-indigo-400 uppercase tracking-wider">
                {editMode === 'modify' ? '수정된 이미지' : '새 이미지'}
              </span>
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
            <div className="flex-shrink-0 flex rounded-xl overflow-hidden border border-white/20">
              <button
                className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                  compareActiveImg === 'current' ? 'bg-white text-black' : 'text-gray-400 hover:text-white'
                }`}
                onClick={() => setCompareActiveImg('current')}
              >
                현재 이미지
              </button>
              <button
                className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
                  compareActiveImg === 'new' ? 'bg-indigo-500 text-white' : 'text-gray-400 hover:text-white'
                }`}
                onClick={() => setCompareActiveImg('new')}
              >
                {editMode === 'modify' ? '수정된 이미지' : '새 이미지'}
              </button>
            </div>

            <div className="flex-1 min-h-0 flex items-center justify-center">
              {compareActiveImg === 'current' ? (
                image.path ? (
                  <img src={image.path} alt={image.prompt} className="max-w-full max-h-full object-contain rounded-lg" />
                ) : (
                  <div className="flex flex-col items-center gap-3 text-gray-600">
                    <PhotoIcon className="h-16 w-16" />
                    <span className="text-sm">이미지 없음</span>
                  </div>
                )
              ) : (
                <img src={newImage.path} alt={newImage.prompt} className="max-w-full max-h-full object-contain rounded-lg" />
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
