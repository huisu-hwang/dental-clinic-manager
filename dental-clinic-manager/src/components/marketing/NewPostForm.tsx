'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  SparklesIcon,
  DocumentCheckIcon,
  PhotoIcon,
  CheckCircleIcon,
  PencilIcon,
  XMarkIcon,
  PlusIcon,
  CloudArrowUpIcon,
  CalendarDaysIcon,
  AdjustmentsHorizontalIcon,
  PaintBrushIcon,
  MegaphoneIcon,
} from '@heroicons/react/24/outline'
import {
  TONE_LABELS,
  POST_TYPE_LABELS,
  DEFAULT_PLATFORM_PRESETS,
  IMAGE_STYLE_LABELS,
  IMAGE_VISUAL_STYLE_LABELS,
  type PostType,
  type ToneType,
  type PlatformOptions,
  type GeneratedContent,
  type ImageStyleOption,
  type ImageVisualStyle,
  type PlatformContent,
  type ClinicalPhotoInput,
} from '@/types/marketing'
import dynamic from 'next/dynamic'
import ScheduleModal from '@/components/marketing/ScheduleModal'
import ImageEditModal from '@/components/marketing/ImageEditModal'
import ClinicalForm, { type ClinicalFormData } from '@/components/marketing/clinical/ClinicalForm'
import ClinicalPhotoEditor from '@/components/marketing/clinical/ClinicalPhotoEditor'
import { useAIGeneration, type GeneratedResultType } from '@/contexts/AIGenerationContext'

const ContentEditor = dynamic(() => import('@/components/marketing/ContentEditor'), { ssr: false })

// ── 섹션 헤더 (연차관리 페이지와 동일한 패턴) ──
function SectionHeader({
  number,
  title,
  icon: Icon,
  iconColor = 'text-at-accent',
  iconBg = 'bg-at-accent-light',
}: {
  number: number
  title: string
  icon: React.ElementType
  iconColor?: string
  iconBg?: string
}) {
  return (
    <div className="flex items-center space-x-3 pb-3 mb-4 border-b border-at-border">
      <div className={`flex items-center justify-center w-8 h-8 rounded-lg ${iconBg} ${iconColor}`}>
        <Icon className="w-4 h-4" />
      </div>
      <h3 className="text-base font-semibold text-at-text">
        <span className="text-at-accent mr-1">{number}.</span>
        {title}
      </h3>
    </div>
  )
}

interface NewPostFormProps {
  onClose: () => void
  onComplete?: () => void
}

export default function NewPostForm({ onClose, onComplete }: NewPostFormProps) {
  const aiGen = useAIGeneration()

  // ── 입력 폼 상태 ──
  const [topic, setTopic] = useState('')
  const [keyword, setKeyword] = useState('')
  const [postType, setPostType] = useState<PostType>('informational')
  const [tone, setTone] = useState<ToneType>('friendly')
  const [useResearch, setUseResearch] = useState(false)
  const [factCheck, setFactCheck] = useState(false)
  const [useSeoAnalysis, setUseSeoAnalysis] = useState(false)
  const [platforms, setPlatforms] = useState<PlatformOptions>(DEFAULT_PLATFORM_PRESETS.informational)
  const [imageStyle, setImageStyle] = useState<ImageStyleOption>('infographic_only')
  const [imageVisualStyle, setImageVisualStyle] = useState<ImageVisualStyle>('realistic')
  const [imageCount, setImageCount] = useState(3)
  const [referenceImageBase64, setReferenceImageBase64] = useState<string>('')
  const [referenceImagePreview, setReferenceImagePreview] = useState<string>('')
  const [clinicalData, setClinicalData] = useState<ClinicalFormData | null>(null)

  // ── 생성 / 저장 상태 (컨텍스트에서 가져옴) ──
  const isGenerating = aiGen.isGenerating
  const generationProgress = aiGen.generationProgress
  const generationStep = aiGen.generationStep
  const [generatedResult, setGeneratedResult] = useState<GeneratedResultType | null>(null)
  const [savedItemId, setSavedItemId] = useState<string | null>(null)
  const [isSavingDraft, setIsSavingDraft] = useState(false)
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [isScheduling, setIsScheduling] = useState(false)
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [error, setError] = useState('')

  // ── 편집 상태 ──
  const [editedTitle, setEditedTitle] = useState('')
  const [editedBody, setEditedBody] = useState('')
  const [editedHashtags, setEditedHashtags] = useState<string[]>([])
  const [isEditingBody, setIsEditingBody] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [newHashtagInput, setNewHashtagInput] = useState('')
  const [isAddingHashtag, setIsAddingHashtag] = useState(false)
  const hashtagInputRef = useRef<HTMLInputElement>(null)

  // ── 이미지 편집 상태 ──
  const [editingImageIndex, setEditingImageIndex] = useState<number | null>(null)
  const [editingImage, setEditingImage] = useState<{ fileName: string; prompt: string; path: string } | null>(null)
  // ── 임상 사진 편집 상태 ──
  const [editingClinicalImage, setEditingClinicalImage] = useState<{ id: string; file?: File | null; previewUrl: string; imageIndex: number } | null>(null)
  // 임상 사진 URL → File 맵 (세션 내 편집용, fetch 없이 File 접근)
  const clinicalPhotoFileMapRef = useRef<Map<string, File>>(new Map())

  // 저장 메시지 3초 후 자동 제거
  useEffect(() => {
    if (!saveMessage) return
    const t = setTimeout(() => setSaveMessage(null), 3000)
    return () => clearTimeout(t)
  }, [saveMessage])

  // 해시태그 추가 인풋 포커스
  useEffect(() => {
    if (isAddingHashtag) {
      hashtagInputRef.current?.focus()
    }
  }, [isAddingHashtag])

  const handlePostTypeChange = (type: PostType) => {
    setPostType(type)
    setPlatforms(DEFAULT_PLATFORM_PRESETS[type])
  }

  // 컨텍스트에서 결과가 오면 로컬 상태에 반영
  const handleResult = useCallback((result: GeneratedResultType) => {
    setGeneratedResult(result)
    setEditedTitle(result.title)
    setEditedBody(result.body)
    setEditedHashtags(result.hashtags || [])
    if (result.savedItemId) {
      setSavedItemId(result.savedItemId)
    }
    setSaveMessage({ type: 'success', text: '자동 저장되었습니다.' })
  }, [])

  // 결과 콜백 등록
  useEffect(() => {
    aiGen.onResultCallback.current = handleResult
    return () => {
      aiGen.onResultCallback.current = null
    }
  }, [aiGen.onResultCallback, handleResult])

  // 컨텍스트의 에러를 로컬 에러에 반영
  useEffect(() => {
    if (aiGen.generationError) {
      setError(aiGen.generationError)
    }
  }, [aiGen.generationError])

  // 이미 컨텍스트에 결과가 있으면 로컬 상태에 반영 (페이지 복귀 시)
  useEffect(() => {
    if (aiGen.generatedResult && !generatedResult) {
      handleResult(aiGen.generatedResult)
    }
  }, [aiGen.generatedResult, generatedResult, handleResult])

  // File → base64 변환 유틸
  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        resolve(result.split(',')[1] || '')
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })

  // ── AI 글 생성 (컨텍스트 통해 SSE 스트리밍) ──
  const handleGenerate = async () => {
    if (!topic || !keyword) {
      setError('주제와 키워드를 입력해주세요.')
      return
    }

    setError('')
    setIsEditingBody(false)
    setHasUnsavedChanges(false)

    if (postType === 'clinical') {
      // 임상글 검증
      if (!clinicalData) {
        setError('임상 정보를 입력해주세요.')
        return
      }
      if (!clinicalData.patientConsent) {
        setError('환자 동의서 확인이 필요합니다.')
        return
      }
      const uploadedPhotos = clinicalData.photos.filter((p) => p.uploadedUrl)
      if (uploadedPhotos.length === 0) {
        setError('최소 1장의 임상 사진을 업로드해주세요.')
        return
      }

      // 사진을 base64로 변환 + URL→File 맵 갱신
      clinicalPhotoFileMapRef.current.clear()
      const photosWithBase64: ClinicalPhotoInput[] = await Promise.all(
        uploadedPhotos.map(async (photo) => {
          // URL→File 맵 저장 (이후 편집 시 fetch 없이 사용)
          clinicalPhotoFileMapRef.current.set(photo.uploadedUrl!, photo.file)
          return {
            photo_type: photo.type,
            file_path: photo.uploadedUrl!,
            base64: await fileToBase64(photo.file),
            media_type: photo.file.type || 'image/jpeg',
            caption: photo.caption,
            sort_order: photo.sort_order,
          }
        })
      )

      aiGen.startGeneration({
        topic, keyword, postType,
        tone: clinicalData.tone,
        useResearch: clinicalData.useResearch,
        factCheck, useSeoAnalysis, platforms,
        imageStyle, imageVisualStyle,
        imageCount: 0, // 임상글은 AI 이미지 생성 스킵
        clinical: {
          procedureType: clinicalData.procedureType,
          procedureDetail: clinicalData.procedureDetail || undefined,
          duration: clinicalData.duration || undefined,
          patientAge: clinicalData.patientAge || undefined,
          patientGender: clinicalData.patientGender || undefined,
          chiefComplaint: clinicalData.chiefComplaint || undefined,
          selectedTeeth: clinicalData.selectedTeeth.length > 0 ? clinicalData.selectedTeeth : undefined,
          patientConsent: clinicalData.patientConsent,
          photos: photosWithBase64,
        },
      })
    } else {
      aiGen.startGeneration({
        topic, keyword, postType, tone, useResearch, factCheck, useSeoAnalysis, platforms,
        imageStyle, imageVisualStyle, imageCount,
        referenceImageBase64: imageStyle === 'use_own_image' ? referenceImageBase64 : undefined,
      })
    }
  }

  // ── 수동 임시 저장 ──
  const handleSaveDraft = async () => {
    if (!savedItemId) return
    setIsSavingDraft(true)
    try {
      const updatedContent: GeneratedResultType = {
        ...generatedResult!,
        title: editedTitle,
        body: editedBody,
        hashtags: editedHashtags,
      }
      const res = await fetch(`/api/marketing/posts/${savedItemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: editedTitle, generatedContent: updatedContent }),
      })
      if (!res.ok) throw new Error('저장 실패')
      setHasUnsavedChanges(false)
      setSaveMessage({ type: 'success', text: '저장되었습니다.' })
    } catch {
      setSaveMessage({ type: 'error', text: '저장에 실패했습니다. 다시 시도해주세요.' })
    } finally {
      setIsSavingDraft(false)
    }
  }

  // ── 발행 처리 (공통) ──
  const handlePublish = async (targetDate: string, targetTime: string, isImmediate: boolean) => {
    if (!generatedResult) return
    setIsScheduling(true)
    try {
      const updatedContent: GeneratedResultType = {
        ...generatedResult,
        title: editedTitle,
        body: editedBody,
        hashtags: editedHashtags,
      }

      if (savedItemId) {
        const res = await fetch(`/api/marketing/posts/${savedItemId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: editedTitle,
            generatedContent: updatedContent,
            status: 'scheduled',
            publishDate: targetDate,
            publishTime: targetTime,
          }),
        })
        if (!res.ok) throw new Error('저장 실패')
      } else {
        const saveRes = await fetch('/api/marketing/posts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: editedTitle,
            topic,
            keyword,
            postType,
            tone,
            useResearch,
            factCheck,
            platforms,
            publishDate: targetDate,
            publishTime: targetTime,
            generatedContent: updatedContent,
          }),
        })
        if (!saveRes.ok) throw new Error('저장 실패')
        const saveJson = await saveRes.json()
        const patchRes = await fetch(`/api/marketing/posts/${saveJson.data.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'scheduled' }),
        })
        if (!patchRes.ok) throw new Error('예약 실패')
      }

      try {
        await fetch('/api/marketing/publish/trigger', { method: 'POST' })
      } catch {
        // 워커 미실행 시 5분 내 자동 처리
      }

      const msg = isImmediate
        ? '바로 발행이 시작됩니다! 마케팅 워커가 곧 발행합니다.'
        : `${targetDate} ${targetTime}에 발행이 예약되었습니다.`
      setSaveMessage({ type: 'success', text: msg })
      setTimeout(() => {
        onComplete ? onComplete() : onClose()
      }, 1500)
    } catch (err) {
      setSaveMessage({ type: 'error', text: err instanceof Error ? err.message : '발행에 실패했습니다.' })
      setIsScheduling(false)
    }
  }

  const handlePublishNow = () => {
    const today = new Date().toISOString().split('T')[0]
    const now = new Date().toTimeString().slice(0, 5)
    handlePublish(today, now, true)
  }

  const handleScheduleConfirm = (date: string, time: string) => {
    setShowScheduleModal(false)
    handlePublish(date, time, false)
  }

  // ── 해시태그 관리 ──
  const removeHashtag = (index: number) => {
    setEditedHashtags(editedHashtags.filter((_, i) => i !== index))
    setHasUnsavedChanges(true)
  }

  const confirmAddHashtag = () => {
    const tag = newHashtagInput.trim().replace(/^#/, '')
    if (tag && !editedHashtags.includes(tag)) {
      setEditedHashtags([...editedHashtags, tag])
      setHasUnsavedChanges(true)
    }
    setNewHashtagInput('')
    setIsAddingHashtag(false)
  }

  // ── 이미지 편집 ──
  const handleImageEdit = useCallback((imageIndex: number, currentImage: { fileName: string; prompt: string; path: string }) => {
    // 임상글: ClinicalPhotoEditor로 편집
    if (postType === 'clinical' && generatedResult?.generatedImages) {
      const img = generatedResult.generatedImages[imageIndex]
      if (img?.path) {
        // 세션 내 맵에서 File 조회 (CORS 없이 즉시)
        const file = clinicalPhotoFileMapRef.current.get(img.path) ?? null
        setEditingClinicalImage({
          id: `clinical_${imageIndex}`,
          file,
          previewUrl: img.path,
          imageIndex,
        })
        return
      }
    }
    // 일반 글: ImageEditModal
    setEditingImageIndex(imageIndex)
    setEditingImage(currentImage)
  }, [postType, generatedResult])

  const handleImageUpdated = useCallback((newImage: { fileName: string; prompt: string; path: string }) => {
    if (editingImageIndex === null || !generatedResult) return

    // generatedImages 배열 업데이트
    const updatedImages = [...(generatedResult.generatedImages || [])]
    updatedImages[editingImageIndex] = {
      fileName: newImage.fileName,
      prompt: newImage.prompt,
      path: newImage.path,
    }

    // generatedResult 업데이트
    setGeneratedResult({
      ...generatedResult,
      generatedImages: updatedImages,
    })

    // 본문의 [IMAGE:] 마커에서 프롬프트가 변경된 경우 업데이트
    const oldPrompt = editingImage?.prompt
    if (oldPrompt && oldPrompt !== newImage.prompt) {
      const updatedBody = editedBody.replace(
        `[IMAGE: ${oldPrompt}]`,
        `[IMAGE: ${newImage.prompt}]`
      )
      setEditedBody(updatedBody)
    }

    setHasUnsavedChanges(true)
    setEditingImageIndex(null)
    setEditingImage(null)
  }, [editingImageIndex, editingImage, generatedResult, editedBody])

  return (
    <div className="max-w-4xl space-y-8">

      {/* ── 1. 기본 정보 ── */}
      <section>
        <SectionHeader number={1} title="기본 정보" icon={SparklesIcon} />
        <fieldset disabled={isGenerating} className={`space-y-4 transition-opacity ${isGenerating ? 'opacity-60' : ''}`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-at-text-secondary mb-1.5">주제 <span className="text-at-error">*</span></label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="예: 스케일링 후 주의사항"
                className="w-full px-3 py-2 border border-at-border rounded-lg focus:ring-2 focus:ring-at-accent focus:border-at-accent text-sm disabled:bg-at-surface-alt disabled:cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-at-text-secondary mb-1.5">타겟 키워드 <span className="text-at-error">*</span></label>
              <input
                type="text"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="예: 스케일링 주의사항"
                className="w-full px-3 py-2 border border-at-border rounded-lg focus:ring-2 focus:ring-at-accent focus:border-at-accent text-sm disabled:bg-at-surface-alt disabled:cursor-not-allowed"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-at-text-secondary mb-1.5">글 유형</label>
              <select
                value={postType}
                onChange={(e) => handlePostTypeChange(e.target.value as PostType)}
                className="w-full px-3 py-2 border border-at-border rounded-lg focus:ring-2 focus:ring-at-accent focus:border-at-accent text-sm disabled:bg-at-surface-alt disabled:cursor-not-allowed"
              >
                {Object.entries(POST_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-at-text-secondary mb-1.5">어투</label>
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value as ToneType)}
                className="w-full px-3 py-2 border border-at-border rounded-lg focus:ring-2 focus:ring-at-accent focus:border-at-accent text-sm disabled:bg-at-surface-alt disabled:cursor-not-allowed"
              >
                {Object.entries(TONE_LABELS).map(([value, { label, description }]) => (
                  <option key={value} value={value}>{label} — {description}</option>
                ))}
              </select>
            </div>
          </div>
        </fieldset>
      </section>

      {/* 임상글 폼 (postType === 'clinical' 일 때만 표시) */}
      {postType === 'clinical' && (
        <fieldset disabled={isGenerating} className={`transition-opacity ${isGenerating ? 'opacity-60' : ''}`}>
          <ClinicalForm
            onChange={setClinicalData}
            isGenerating={isGenerating}
          />
        </fieldset>
      )}

      {/* ── 2. 품질 옵션 (임상글이 아닐 때만) ── */}
      {postType !== 'clinical' && (
        <section>
          <SectionHeader number={2} title="품질 옵션" icon={AdjustmentsHorizontalIcon} iconColor="text-amber-600" iconBg="bg-amber-50" />
          <fieldset disabled={isGenerating} className={`space-y-3 transition-opacity ${isGenerating ? 'opacity-60' : ''}`}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <label className={`flex items-start gap-3 p-4 rounded-xl border border-at-border hover:bg-at-surface-alt transition-colors ${isGenerating ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                <input type="checkbox" checked={useResearch} onChange={(e) => setUseResearch(e.target.checked)} className="mt-0.5 w-4 h-4 text-at-accent border-at-border rounded focus:ring-at-accent disabled:cursor-not-allowed" />
                <div>
                  <p className="text-sm font-medium text-at-text">논문 인용</p>
                  <p className="text-xs text-at-text-weak mt-0.5">관련 학술 논문을 검색하여 인용</p>
                </div>
              </label>
              <label className={`flex items-start gap-3 p-4 rounded-xl border border-at-border hover:bg-at-surface-alt transition-colors ${isGenerating ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                <input type="checkbox" checked={factCheck} onChange={(e) => setFactCheck(e.target.checked)} className="mt-0.5 w-4 h-4 text-at-accent border-at-border rounded focus:ring-at-accent disabled:cursor-not-allowed" />
                <div>
                  <p className="text-sm font-medium text-at-text">팩트체크</p>
                  <p className="text-xs text-at-text-weak mt-0.5">생성된 글의 사실 여부를 검증</p>
                </div>
              </label>
              <label className={`flex items-start gap-3 p-4 rounded-xl border border-at-border hover:bg-at-surface-alt transition-colors ${isGenerating ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                <input type="checkbox" checked={useSeoAnalysis} onChange={(e) => setUseSeoAnalysis(e.target.checked)} className="mt-0.5 w-4 h-4 text-at-accent border-at-border rounded focus:ring-at-accent disabled:cursor-not-allowed" />
                <div>
                  <p className="text-sm font-medium text-at-text">SEO 분석</p>
                  <p className="text-xs text-at-text-weak mt-0.5">경쟁 글 분석 후 핵심 키워드 자동 반영</p>
                </div>
              </label>
            </div>
          </fieldset>
        </section>
      )}

      {/* ── 3. 이미지 옵션 (임상글이 아닐 때만) ── */}
      {postType !== 'clinical' && (
        <section>
          <SectionHeader number={3} title="이미지 옵션" icon={PaintBrushIcon} iconColor="text-emerald-600" iconBg="bg-emerald-50" />
          <fieldset disabled={isGenerating} className={`space-y-5 transition-opacity ${isGenerating ? 'opacity-60' : ''}`}>
            <div>
              <label className="block text-sm font-medium text-at-text-secondary mb-2">이미지 개수</label>
              <div className="flex items-center gap-2 flex-wrap">
                {[0, 1, 2, 3, 4, 5].map((n) => (
                  <button key={n} type="button" onClick={() => setImageCount(n)}
                    className={`w-9 h-9 rounded-lg text-sm font-semibold transition-colors ${imageCount === n ? 'bg-at-accent text-white' : 'bg-at-surface-alt text-at-text-secondary border border-at-border hover:bg-at-border'}`}>
                    {n}
                  </button>
                ))}
                <span className="text-xs text-at-text-weak ml-1">{imageCount === 0 ? '이미지 없이 글만 생성' : `최대 ${imageCount}개`}</span>
              </div>
            </div>

            {imageCount > 0 && (
              <>
                <div className="border-t border-at-border" />
                <div className="space-y-2.5">
                  <label className="block text-sm font-medium text-at-text-secondary">이미지 스타일</label>
                  {(Object.entries(IMAGE_STYLE_LABELS) as [ImageStyleOption, { label: string; description: string }][]).map(
                    ([value, { label, description }]) => (
                      <label key={value} className="flex items-start gap-3 cursor-pointer">
                        <input type="radio" name="imageStyle" value={value} checked={imageStyle === value}
                          onChange={() => { setImageStyle(value); if (value !== 'use_own_image') { setReferenceImageBase64(''); setReferenceImagePreview('') } }}
                          className="mt-0.5 w-4 h-4 text-at-accent border-at-border focus:ring-at-accent" />
                        <div>
                          <span className="text-sm font-medium text-at-text">{label}</span>
                          <span className="text-xs text-at-text-weak ml-2">{description}</span>
                        </div>
                      </label>
                    )
                  )}
                </div>

                {imageStyle === 'use_own_image' && (
                  <div className="ml-7 p-4 bg-at-surface-alt rounded-xl border border-at-border space-y-2">
                    <label className="block text-xs font-medium text-at-text-secondary">참조 이미지 업로드</label>
                    <div className="flex items-center gap-3">
                      <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 border border-at-border text-at-text-secondary rounded-lg hover:bg-white transition-colors text-xs font-medium">
                        <PhotoIcon className="h-4 w-4" />
                        이미지 선택
                        <input type="file" accept="image/*" className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (!file) return
                            if (file.size > 5 * 1024 * 1024) { setError('이미지 파일은 5MB 이하만 업로드 가능합니다.'); return }
                            const reader = new FileReader()
                            reader.onload = () => {
                              const result = reader.result as string
                              setReferenceImagePreview(result)
                              setReferenceImageBase64(result.split(',')[1] || '')
                            }
                            reader.readAsDataURL(file)
                          }} />
                      </label>
                      {referenceImagePreview && (
                        <button onClick={() => { setReferenceImageBase64(''); setReferenceImagePreview('') }} className="text-xs text-at-error hover:underline">삭제</button>
                      )}
                    </div>
                    {referenceImagePreview && (
                      <div className="w-16 h-16 rounded-lg overflow-hidden border border-at-border">
                        <img src={referenceImagePreview} alt="참조 이미지" className="w-full h-full object-cover" />
                      </div>
                    )}
                    {!referenceImageBase64 && <p className="text-xs text-at-warning">인물 이미지를 업로드해주세요</p>}
                  </div>
                )}

                <div className="border-t border-at-border" />
                <div>
                  <label className="block text-sm font-medium text-at-text-secondary mb-2">시각적 스타일</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {(Object.entries(IMAGE_VISUAL_STYLE_LABELS) as [ImageVisualStyle, { label: string; description: string; emoji: string }][]).map(
                      ([value, { label, description, emoji }]) => (
                        <button key={value} type="button" onClick={() => setImageVisualStyle(value)}
                          className={`flex flex-col items-start gap-1 p-3 rounded-xl border text-left transition-all ${imageVisualStyle === value ? 'border-at-accent bg-at-accent-light' : 'border-at-border hover:bg-at-surface-alt'}`}>
                          <span className="text-lg">{emoji}</span>
                          <span className={`text-xs font-medium ${imageVisualStyle === value ? 'text-at-accent' : 'text-at-text-secondary'}`}>{label}</span>
                          <span className="text-[10px] text-at-text-weak leading-tight">{description}</span>
                        </button>
                      )
                    )}
                  </div>
                </div>
              </>
            )}
          </fieldset>
        </section>
      )}

      {/* ── 4. 배포 플랫폼 ── */}
      <section>
        <SectionHeader number={4} title="배포 플랫폼" icon={MegaphoneIcon} iconColor="text-purple-600" iconBg="bg-purple-50" />
        <fieldset disabled={isGenerating} className={`transition-opacity ${isGenerating ? 'opacity-60' : ''}`}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(['naverBlog', 'instagram', 'facebook', 'threads'] as const).map((key) => (
              <label key={key} className={`flex items-center gap-2.5 p-3.5 rounded-xl border transition-colors ${platforms[key] ? 'border-at-accent bg-at-accent-light' : 'border-at-border hover:bg-at-surface-alt'} ${isGenerating ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                <input type="checkbox" checked={platforms[key]} onChange={(e) => setPlatforms({ ...platforms, [key]: e.target.checked })} className="w-4 h-4 text-at-accent border-at-border rounded focus:ring-at-accent" />
                <span className={`text-xs font-medium ${platforms[key] ? 'text-at-accent' : 'text-at-text-secondary'}`}>
                  {key === 'naverBlog' ? '네이버 블로그' : key === 'instagram' ? '인스타그램' : key === 'facebook' ? '페이스북' : '쓰레드'}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      {/* 에러 */}
      {error && (
        <div className="bg-at-error-bg border border-red-200 rounded-xl p-4 text-sm text-at-error">
          {error}
        </div>
      )}

      {/* 생성 버튼 / 진행 상태 바 */}
      {isGenerating ? (
        <div className="bg-white rounded-xl border border-at-border p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-at-text">{generationStep}</span>
            <span className="text-sm font-bold text-indigo-600">{generationProgress}%</span>
          </div>
          <div className="relative h-3 bg-at-surface-alt rounded-full overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${generationProgress}%` }}
            />
          </div>
          <div className="flex justify-between text-xs">
            {[
              ...(useSeoAnalysis ? [{ label: 'SEO 분석', threshold: 1 }] : []),
              { label: '글 작성', threshold: 5 },
              { label: '이미지 생성', threshold: 55 },
              { label: '저장', threshold: 95 },
              { label: '완료', threshold: 100 },
            ].map(({ label, threshold }) => (
              <span
                key={label}
                className={`transition-colors duration-300 ${
                  generationProgress >= threshold
                    ? threshold === 100
                      ? 'text-green-500 font-semibold'
                      : 'text-indigo-500 font-semibold'
                    : 'text-at-text'
                }`}
              >
                {generationProgress >= threshold ? '✓ ' : ''}{label}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <button
          onClick={handleGenerate}
          disabled={!topic || !keyword || (postType === 'clinical' && (!clinicalData?.patientConsent || !clinicalData?.procedureType || !clinicalData?.photos.some(p => p.uploadedUrl)))}
          className="w-full py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:bg-at-border disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
        >
          <SparklesIcon className="h-5 w-5" />
          {postType === 'clinical'
            ? (generatedResult ? '임상글 다시 생성' : '임상글 생성')
            : (generatedResult ? '다시 생성' : 'AI 글 생성')
          }
        </button>
      )}

      {/* ── 5. 생성 결과 ── */}
      {generatedResult && (
        <section className="space-y-5">
          {/* 결과 헤더 */}
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-at-border">
            <div className="flex items-center space-x-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600">
                <DocumentCheckIcon className="w-4 h-4" />
              </div>
              <h3 className="text-base font-semibold text-at-text">
                <span className="text-at-accent mr-1">5.</span>
                생성 결과
              </h3>
              {savedItemId && !hasUnsavedChanges && (
                <span className="flex items-center gap-1 text-xs text-at-success bg-at-success-bg px-2 py-0.5 rounded-full">
                  <CheckCircleIcon className="h-3.5 w-3.5" />
                  저장됨
                </span>
              )}
              {hasUnsavedChanges && (
                <span className="flex items-center gap-1 text-xs text-at-warning bg-at-warning-bg px-2 py-0.5 rounded-full">
                  <PencilIcon className="h-3.5 w-3.5" />
                  미저장
                </span>
              )}
            </div>
            <div className="flex gap-3 text-xs text-at-text-weak">
              <span>{generatedResult.wordCount}자</span>
              <span>키워드 {generatedResult.keywordCount}회</span>
            </div>
          </div>

          {/* 저장 메시지 */}
          {saveMessage && (
            <div className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm ${
              saveMessage.type === 'success'
                ? 'bg-at-success-bg text-at-success'
                : 'bg-at-error-bg text-at-error'
            }`}>
              {saveMessage.type === 'success'
                ? <CheckCircleIcon className="h-4 w-4 flex-shrink-0" />
                : <XMarkIcon className="h-4 w-4 flex-shrink-0" />
              }
              {saveMessage.text}
            </div>
          )}

          {/* 제목 (편집 가능) */}
          <div>
            <label className="block text-sm font-medium text-at-text mb-1.5">제목</label>
            <input
              type="text"
              value={editedTitle}
              onChange={(e) => {
                setEditedTitle(e.target.value)
                setHasUnsavedChanges(true)
              }}
              className="w-full text-lg font-bold text-at-text border border-at-border rounded-xl px-3 py-2 focus:ring-2 focus:ring-at-accent focus:border-at-accent bg-at-surface-alt/50"
            />
          </div>

          {/* 본문 (WYSIWYG 에디터) */}
          <div>
            <label className="block text-sm font-medium text-at-text mb-2">본문</label>
            <ContentEditor
              body={editedBody}
              images={generatedResult.generatedImages}
              onChange={(newBody) => {
                setEditedBody(newBody)
                setHasUnsavedChanges(true)
              }}
              onImageEdit={handleImageEdit}
            />
          </div>

          {/* 해시태그 (편집 가능) */}
          <div>
            <label className="block text-sm font-medium text-at-text mb-2">해시태그</label>
            <div className="flex flex-wrap gap-2 items-center">
              {editedHashtags.map((tag, i) => (
                <span
                  key={i}
                  className="flex items-center gap-1 px-2.5 py-1 bg-indigo-50 text-indigo-600 text-xs rounded-full font-medium"
                >
                  #{tag}
                  <button
                    onClick={() => removeHashtag(i)}
                    className="text-indigo-300 hover:text-red-400 transition-colors ml-0.5"
                    title="삭제"
                  >
                    <XMarkIcon className="h-3 w-3" />
                  </button>
                </span>
              ))}

              {isAddingHashtag ? (
                <div className="flex items-center gap-1">
                  <span className="text-indigo-400 text-xs">#</span>
                  <input
                    ref={hashtagInputRef}
                    type="text"
                    value={newHashtagInput}
                    onChange={(e) => setNewHashtagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); confirmAddHashtag() }
                      if (e.key === 'Escape') { setIsAddingHashtag(false); setNewHashtagInput('') }
                    }}
                    onBlur={confirmAddHashtag}
                    placeholder="태그 입력"
                    className="w-24 text-xs border border-indigo-300 rounded-full px-2 py-1 focus:outline-none focus:ring-1 focus:ring-at-accent"
                  />
                </div>
              ) : (
                <button
                  onClick={() => setIsAddingHashtag(true)}
                  className="flex items-center gap-1 px-2.5 py-1 border border-dashed border-indigo-300 text-indigo-400 text-xs rounded-full hover:bg-indigo-50 transition-colors"
                >
                  <PlusIcon className="h-3 w-3" />
                  추가
                </button>
              )}
            </div>
          </div>

          {/* 플랫폼별 생성 결과 */}
          {generatedResult.platformContent && (
            <div className="space-y-3">
              <label className="block text-sm font-medium text-at-text">플랫폼별 글</label>

              {generatedResult.platformContent.instagram && (
                <div className="border border-pink-200 bg-pink-50/50 rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-pink-600">Instagram</span>
                    <span className="text-[10px] text-pink-400">1:1 정사각형</span>
                  </div>
                  {generatedResult.platformContent.instagram.images?.length > 0 && generatedResult.platformContent.instagram.images[0]?.path && (
                    <div className="flex gap-2 overflow-x-auto pb-1">
                      {generatedResult.platformContent.instagram.images.filter(img => img.path).map((img, i) => (
                        <img key={i} src={img.path} alt={img.fileName} className="w-24 h-24 rounded-xl object-cover border border-pink-200 flex-shrink-0" />
                      ))}
                    </div>
                  )}
                  <p className="text-xs text-at-text whitespace-pre-wrap leading-5">
                    {generatedResult.platformContent.instagram.caption}
                  </p>
                  {generatedResult.platformContent.instagram.hashtags.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {generatedResult.platformContent.instagram.hashtags.map((tag, i) => (
                        <span key={i} className="text-[10px] text-pink-500">#{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {generatedResult.platformContent.facebook && (
                <div className="border border-at-border bg-at-accent-light/50 rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-at-accent">Facebook</span>
                    <span className="text-[10px] text-at-accent">가로형 OG</span>
                  </div>
                  {generatedResult.platformContent.facebook.images && generatedResult.platformContent.facebook.images.length > 0 && generatedResult.platformContent.facebook.images[0]?.path && (
                    <img src={generatedResult.platformContent.facebook.images[0].path} alt="Facebook" className="w-full h-32 rounded-xl object-cover border border-at-border" />
                  )}
                  <p className="text-xs text-at-text whitespace-pre-wrap leading-5">
                    {generatedResult.platformContent.facebook.message}
                  </p>
                  {generatedResult.platformContent.facebook.hashtags.length > 0 && (
                    <div className="flex flex-wrap gap-1 pt-1">
                      {generatedResult.platformContent.facebook.hashtags.map((tag, i) => (
                        <span key={i} className="text-[10px] text-at-accent">#{tag}</span>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {generatedResult.platformContent.threads && (
                <div className="border border-at-border bg-at-surface-alt/50 rounded-xl p-3 space-y-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-at-text">Threads</span>
                    <span className="text-[10px] text-at-text">미니멀</span>
                  </div>
                  {generatedResult.platformContent.threads.image?.path && (
                    <img src={generatedResult.platformContent.threads.image.path} alt="Threads" className="w-24 h-24 rounded-xl object-cover border border-at-border" />
                  )}
                  <p className="text-xs text-at-text whitespace-pre-wrap leading-5">
                    {generatedResult.platformContent.threads.text}
                  </p>
                </div>
              )}
            </div>
          )}

          {/* 액션 버튼 */}
          <div className="space-y-3 pt-2">
            {savedItemId && hasUnsavedChanges && (
              <button
                onClick={handleSaveDraft}
                disabled={isSavingDraft}
                className="flex items-center justify-center gap-2 px-4 py-2 border border-blue-300 text-at-accent rounded-xl hover:bg-at-accent-light transition-colors text-sm font-medium disabled:opacity-60 w-full"
              >
                {isSavingDraft ? (
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <CloudArrowUpIcon className="h-4 w-4" />
                )}
                임시 저장
              </button>
            )}

            <div className="flex gap-3">
              <button
                onClick={handlePublishNow}
                disabled={isScheduling || !generatedResult}
                className="flex-1 py-2.5 bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:bg-at-border disabled:cursor-not-allowed transition-colors text-sm font-medium flex items-center justify-center gap-2"
              >
                {isScheduling ? (
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                ) : (
                  <DocumentCheckIcon className="h-4 w-4" />
                )}
                바로 발행
              </button>
              <button
                onClick={() => setShowScheduleModal(true)}
                disabled={isScheduling || !generatedResult}
                className="flex-1 py-2.5 bg-at-accent text-white rounded-xl hover:bg-at-accent-hover disabled:bg-at-border disabled:cursor-not-allowed transition-colors text-sm font-medium flex items-center justify-center gap-2"
              >
                <CalendarDaysIcon className="h-4 w-4" />
                예약 발행
              </button>
            </div>

            <ScheduleModal
              isOpen={showScheduleModal}
              onClose={() => setShowScheduleModal(false)}
              onConfirm={handleScheduleConfirm}
              isLoading={isScheduling}
            />

            {/* AI 이미지 편집 모달 (일반 글) */}
            {editingImage && (
              <ImageEditModal
                isOpen={editingImage !== null}
                onClose={() => {
                  setEditingImageIndex(null)
                  setEditingImage(null)
                }}
                image={editingImage}
                onImageUpdated={handleImageUpdated}
              />
            )}

            {/* 임상 사진 편집 모달 */}
            {editingClinicalImage && (
              <ClinicalPhotoEditor
                photo={editingClinicalImage}
                onSave={async (photoId, newFile, newPreviewUrl) => {
                  const idx = editingClinicalImage.imageIndex
                  if (!generatedResult?.generatedImages) return

                  // Storage에 재업로드
                  const formData = new FormData()
                  formData.append('file', newFile)
                  formData.append('photo_type', 'before')
                  try {
                    const res = await fetch('/api/marketing/clinical-photos/upload', {
                      method: 'POST',
                      body: formData,
                    })
                    if (res.ok) {
                      const { url } = await res.json()
                      // generatedImages 업데이트
                      const updatedImages = [...generatedResult.generatedImages!]
                      const oldPath = updatedImages[idx]?.path
                      updatedImages[idx] = { ...updatedImages[idx], path: url }
                      setGeneratedResult({ ...generatedResult, generatedImages: updatedImages })

                      // 본문의 이미지 URL 교체
                      if (oldPath) {
                        setEditedBody(editedBody.replace(oldPath, url))
                      }
                      setHasUnsavedChanges(true)
                    }
                  } catch (err) {
                    console.error('임상 사진 재업로드 실패:', err)
                  }
                  setEditingClinicalImage(null)
                }}
                onClose={() => setEditingClinicalImage(null)}
              />
            )}
          </div>
        </section>
      )}
    </div>
  )
}

// ─── 본문 렌더러 ───

function RenderedBody({
  body,
  images,
}: {
  body: string
  images?: { fileName: string; prompt: string; path?: string }[]
}) {
  const lines = body.split('\n')
  const elements: React.ReactNode[] = []
  let paragraphBuffer: string[] = []
  let key = 0
  const usedImageIndices = new Set<number>()
  let fallbackIndex = 0

  const findImage = (prompt: string) => {
    if (!images || images.length === 0) return undefined
    const exactIdx = images.findIndex((img, i) => !usedImageIndices.has(i) && img.prompt === prompt)
    if (exactIdx >= 0) { usedImageIndices.add(exactIdx); return images[exactIdx] }
    const partialIdx = images.findIndex((img, i) => !usedImageIndices.has(i) && (img.prompt.includes(prompt.slice(0, 10)) || prompt.includes(img.prompt.slice(0, 10))))
    if (partialIdx >= 0) { usedImageIndices.add(partialIdx); return images[partialIdx] }
    while (fallbackIndex < images.length && usedImageIndices.has(fallbackIndex)) fallbackIndex++
    if (fallbackIndex < images.length) { usedImageIndices.add(fallbackIndex); return images[fallbackIndex++] }
    return undefined
  }

  const flushParagraph = () => {
    if (paragraphBuffer.length > 0) {
      const text = paragraphBuffer.join('\n').trim()
      if (text) {
        elements.push(
          <p key={key++} className="text-sm leading-7 text-at-text mb-3">
            {renderInlineFormatting(text)}
          </p>
        )
      }
      paragraphBuffer = []
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()

    if (/\[IMAGE:\s*.+?\]/.test(trimmed)) {
      flushParagraph()
      const match = trimmed.match(/\[IMAGE:\s*(.+?)\]/)
      const prompt = match ? match[1] : ''
      const currentImage = findImage(prompt)

      if (currentImage?.path) {
        elements.push(
          <div key={key++} className="my-4">
            <img
              src={currentImage.path}
              alt={currentImage.prompt || prompt}
              className="w-full rounded-xl border border-at-border shadow-sm"
            />
            <p className="text-xs text-at-text mt-1.5 text-center">{currentImage.fileName || prompt}</p>
          </div>
        )
      } else {
        elements.push(
          <div key={key++} className="my-4 rounded-xl border-2 border-dashed border-at-border bg-at-surface-alt p-6 flex flex-col items-center justify-center gap-2">
            <PhotoIcon className="h-10 w-10 text-at-text" />
            <span className="text-xs text-at-text text-center">{prompt}</span>
            <span className="text-[10px] text-at-text">이미지 생성에 실패했습니다</span>
          </div>
        )
      }
      continue
    }

    if (trimmed.startsWith('### ')) {
      flushParagraph()
      elements.push(
        <h4 key={key++} className="text-base font-semibold text-at-text mt-5 mb-2">
          {trimmed.replace(/^###\s+/, '')}
        </h4>
      )
      continue
    }

    if (trimmed.startsWith('## ')) {
      flushParagraph()
      elements.push(
        <h3 key={key++} className="text-lg font-bold text-at-text mt-6 mb-3 pb-2 border-b border-at-border">
          {trimmed.replace(/^##\s+/, '')}
        </h3>
      )
      continue
    }

    if (/^[-─━]{3,}$/.test(trimmed)) {
      flushParagraph()
      elements.push(<hr key={key++} className="my-4 border-at-border" />)
      continue
    }

    if (/^[-*]\s+/.test(trimmed)) {
      flushParagraph()
      elements.push(
        <div key={key++} className="flex gap-2 mb-1.5 ml-1">
          <span className="text-indigo-400 mt-1 text-xs">●</span>
          <span className="text-sm leading-6 text-at-text flex-1">
            {renderInlineFormatting(trimmed.replace(/^[-*]\s+/, ''))}
          </span>
        </div>
      )
      continue
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      flushParagraph()
      const num = trimmed.match(/^(\d+)\./)?.[1]
      elements.push(
        <div key={key++} className="flex gap-2 mb-1.5 ml-1">
          <span className="text-indigo-500 font-semibold text-sm min-w-[1.2rem]">{num}.</span>
          <span className="text-sm leading-6 text-at-text flex-1">
            {renderInlineFormatting(trimmed.replace(/^\d+\.\s+/, ''))}
          </span>
        </div>
      )
      continue
    }

    if (!trimmed) {
      flushParagraph()
      continue
    }

    paragraphBuffer.push(line)
  }

  flushParagraph()

  return <div>{elements}</div>
}

function renderInlineFormatting(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-semibold text-at-text">{part.slice(2, -2)}</strong>
    }
    return part
  })
}
