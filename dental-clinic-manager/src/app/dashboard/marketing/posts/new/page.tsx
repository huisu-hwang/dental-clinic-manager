'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import {
  ArrowLeftIcon,
  SparklesIcon,
  DocumentCheckIcon,
  PhotoIcon,
  CheckCircleIcon,
  PencilIcon,
  EyeIcon,
  XMarkIcon,
  PlusIcon,
  CloudArrowUpIcon,
  CalendarDaysIcon,
  ClockIcon,
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
} from '@/types/marketing'
import dynamic from 'next/dynamic'
import { useAIGeneration, type GeneratedResultType } from '@/contexts/AIGenerationContext'
import { requireWorker } from '@/hooks/useWorkerGuard'
import { usePremiumFeatures } from '@/hooks/usePremiumFeatures'

const ContentEditor = dynamic(() => import('@/components/marketing/ContentEditor'), { ssr: false })

export default function NewMarketingPostPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const aiGen = useAIGeneration()
  // 마케팅 프리미엄 활성화 여부 — 비활성화 사용자는 워커 체크 수행하지 않음
  const { hasPremiumFeature } = usePremiumFeatures()

  // ── 입력 폼 상태 ──
  const [topic, setTopic] = useState('')
  const [keyword, setKeyword] = useState('')
  const [postType, setPostType] = useState<PostType>('informational')
  const [tone, setTone] = useState<ToneType>('friendly')
  const [useResearch, setUseResearch] = useState(false)
  const [factCheck, setFactCheck] = useState(false)
  const [platforms, setPlatforms] = useState<PlatformOptions>(DEFAULT_PLATFORM_PRESETS.informational)
  const [imageStyle, setImageStyle] = useState<ImageStyleOption>('infographic_only')
  const [imageVisualStyle, setImageVisualStyle] = useState<ImageVisualStyle>('realistic')
  const [imageCount, setImageCount] = useState(3)
  const [referenceImageBase64, setReferenceImageBase64] = useState<string>('')
  const [referenceImagePreview, setReferenceImagePreview] = useState<string>('')

  // ── 생성 / 저장 상태 (컨텍스트에서 가져옴) ──
  const isGenerating = aiGen.isGenerating
  const generationProgress = aiGen.generationProgress
  const generationStep = aiGen.generationStep
  const [generatedResult, setGeneratedResult] = useState<GeneratedResultType | null>(null)
  const [savedItemId, setSavedItemId] = useState<string | null>(null)
  const [isSavingDraft, setIsSavingDraft] = useState(false)
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [isScheduling, setIsScheduling] = useState(false)
  const [showSchedulePicker, setShowSchedulePicker] = useState(false)
  const [scheduleDate, setScheduleDate] = useState('')
  const [scheduleTime, setScheduleTime] = useState('09:00')
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

  // 컨텍스트에서 결과가 오면 로컬 상태에 반영 + 자동 저장
  const handleResult = useCallback(async (result: GeneratedResultType) => {
    setGeneratedResult(result)
    setEditedTitle(result.title)
    setEditedBody(result.body)
    setEditedHashtags(result.hashtags || [])

    // 자동 DB 저장
    try {
      if (savedItemId) {
        await fetch(`/api/marketing/posts/${savedItemId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ generatedContent: result }),
        })
        setSaveMessage({ type: 'success', text: '임시 저장되었습니다.' })
      } else {
        const saveRes = await fetch('/api/marketing/posts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: result.title,
            topic,
            keyword,
            postType,
            tone,
            useResearch,
            factCheck,
            platforms,
            generatedContent: result,
          }),
        })
        if (saveRes.ok) {
          const saveJson = await saveRes.json()
          setSavedItemId(saveJson.data.id)
          setSaveMessage({ type: 'success', text: '임시 저장되었습니다.' })
        }
      }
    } catch (saveErr) {
      console.error('자동 저장 실패:', saveErr)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedItemId, topic, keyword, postType, tone, useResearch, factCheck, platforms])

  // 결과 콜백 등록
  useEffect(() => {
    aiGen.onResultCallback.current = handleResult
    return () => {
      aiGen.onResultCallback.current = null
    }
  }, [aiGen.onResultCallback, handleResult])

  // 컨텍스트 에러 반영
  useEffect(() => {
    if (aiGen.generationError) {
      setError(aiGen.generationError)
    }
  }, [aiGen.generationError])

  // 이미 컨텍스트에 결과가 있으면 반영 (페이지 복귀 시)
  useEffect(() => {
    if (aiGen.generatedResult && !generatedResult) {
      handleResult(aiGen.generatedResult)
    }
  }, [aiGen.generatedResult, generatedResult, handleResult])

  // ── AI 글 생성 (컨텍스트 통해 SSE 스트리밍) ──
  const handleGenerate = async () => {
    if (!hasPremiumFeature('marketing')) {
      setError('마케팅 자동화 프리미엄 기능이 활성화되어 있지 않습니다.')
      return
    }
    if (!await requireWorker('marketing', 'AI 글 생성')) return
    if (!topic || !keyword) {
      setError('주제와 키워드를 입력해주세요.')
      return
    }

    setError('')
    setIsEditingBody(false)
    setHasUnsavedChanges(false)

    aiGen.startGeneration({
      topic, keyword, postType, tone, useResearch, factCheck, useSeoAnalysis: false, platforms,
      imageStyle, imageVisualStyle, imageCount,
      referenceImageBase64: imageStyle === 'use_own_image' ? referenceImageBase64 : undefined,
    })
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
    if (!hasPremiumFeature('marketing')) {
      setError('마케팅 자동화 프리미엄 기능이 활성화되어 있지 않습니다.')
      return
    }
    if (!await requireWorker('marketing', '글 발행')) return
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

      // 마케팅 워커에 즉시 발행 트리거 (실패해도 진행)
      try {
        await fetch('/api/marketing/publish/trigger', { method: 'POST' })
      } catch {
        // 워커 미실행 시 5분 내 자동 처리
      }

      const msg = isImmediate
        ? '바로 발행이 시작됩니다! 마케팅 워커가 곧 발행합니다.'
        : `${targetDate} ${targetTime}에 발행이 예약되었습니다.`
      setSaveMessage({ type: 'success', text: msg })
      setTimeout(() => router.push('/dashboard/marketing'), 1500)
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

  const handleScheduleConfirm = () => {
    if (!scheduleDate || !scheduleTime) {
      setSaveMessage({ type: 'error', text: '날짜와 시간을 선택해주세요.' })
      return
    }
    handlePublish(scheduleDate, scheduleTime, false)
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

  if (loading || !user) {
    return null
  }

  return (
    <div className="p-4 sm:p-6 bg-white min-h-screen">
      {/* 페이지 헤더 */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push('/dashboard/marketing')}
          className="p-2 text-at-text-weak hover:text-at-text-secondary transition-colors rounded-lg hover:bg-at-surface-alt"
        >
          <ArrowLeftIcon className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-bold text-at-text">새 글 작성</h1>
      </div>

      <div className="max-w-4xl space-y-6">
            {/* 기본 정보 */}
            <fieldset disabled={isGenerating} className={`bg-white rounded-xl border border-at-border p-6 space-y-4 transition-opacity ${isGenerating ? 'opacity-60' : ''}`}>
              <h2 className="text-lg font-semibold text-at-text">기본 정보</h2>

              <div>
                <label className="block text-sm font-medium text-at-text-secondary mb-1">주제 *</label>
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="예: 스케일링 후 주의사항"
                  className="w-full px-3 py-2 border border-at-border rounded-lg focus:ring-2 focus:ring-at-accent focus:border-at-accent text-sm disabled:bg-at-surface-alt disabled:cursor-not-allowed"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-at-text-secondary mb-1">타겟 키워드 *</label>
                <input
                  type="text"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="예: 스케일링 주의사항"
                  className="w-full px-3 py-2 border border-at-border rounded-lg focus:ring-2 focus:ring-at-accent focus:border-at-accent text-sm disabled:bg-at-surface-alt disabled:cursor-not-allowed"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-at-text-secondary mb-1">글 유형</label>
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
                  <label className="block text-sm font-medium text-at-text-secondary mb-1">어투</label>
                  <select
                    value={tone}
                    onChange={(e) => setTone(e.target.value as ToneType)}
                    className="w-full px-3 py-2 border border-at-border rounded-lg focus:ring-2 focus:ring-at-accent focus:border-at-accent text-sm disabled:bg-at-surface-alt disabled:cursor-not-allowed"
                  >
                    {Object.entries(TONE_LABELS).map(([value, { label, description }]) => (
                      <option key={value} value={value}>{label} - {description}</option>
                    ))}
                  </select>
                </div>
              </div>
            </fieldset>

            {/* 품질 옵션 */}
            <fieldset disabled={isGenerating} className={`bg-white rounded-xl border border-at-border p-6 space-y-3 transition-opacity ${isGenerating ? 'opacity-60' : ''}`}>
              <h2 className="text-lg font-semibold text-at-text">품질 옵션</h2>
              <label className={`flex items-center gap-3 ${isGenerating ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                <input
                  type="checkbox"
                  checked={useResearch}
                  onChange={(e) => setUseResearch(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 border-at-border rounded focus:ring-at-accent disabled:cursor-not-allowed"
                />
                <div>
                  <span className="text-sm font-medium text-at-text-secondary">논문 인용</span>
                  <span className="text-xs text-at-text-weak ml-2">관련 학술 논문을 검색하여 인용</span>
                </div>
              </label>
              <label className={`flex items-center gap-3 ${isGenerating ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                <input
                  type="checkbox"
                  checked={factCheck}
                  onChange={(e) => setFactCheck(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 border-at-border rounded focus:ring-at-accent disabled:cursor-not-allowed"
                />
                <div>
                  <span className="text-sm font-medium text-at-text-secondary">팩트체크</span>
                  <span className="text-xs text-at-text-weak ml-2">생성된 글의 사실 여부를 검증</span>
                </div>
              </label>
            </fieldset>

            {/* 이미지 옵션 */}
            <fieldset disabled={isGenerating} className={`bg-white rounded-xl border border-at-border p-6 space-y-3 transition-opacity ${isGenerating ? 'opacity-60' : ''}`}>
              <h2 className="text-lg font-semibold text-at-text">이미지 옵션</h2>
              <p className="text-xs text-at-text-weak">이미지 개수와 스타일을 설정하세요</p>

              {/* 이미지 개수 */}
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-at-text-secondary min-w-[80px]">이미지 개수</label>
                <div className="flex items-center gap-2">
                  {[0, 1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setImageCount(n)}
                      className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                        imageCount === n
                          ? 'bg-indigo-600 text-white'
                          : 'bg-at-surface-alt text-at-text-secondary hover:bg-at-border'
                      }`}
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <span className="text-xs text-at-text-weak">{imageCount === 0 ? '이미지 없이 글만 생성' : `최대 ${imageCount}개`}</span>
              </div>

              {imageCount > 0 && <hr className="border-at-border" />}
              {imageCount > 0 && (Object.entries(IMAGE_STYLE_LABELS) as [ImageStyleOption, { label: string; description: string }][]).map(
                ([value, { label, description }]) => (
                  <label key={value} className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="radio"
                      name="imageStyle"
                      value={value}
                      checked={imageStyle === value}
                      onChange={() => {
                        setImageStyle(value)
                        if (value !== 'use_own_image') {
                          setReferenceImageBase64('')
                          setReferenceImagePreview('')
                        }
                      }}
                      className="mt-0.5 w-4 h-4 text-indigo-600 border-at-border focus:ring-at-accent"
                    />
                    <div>
                      <span className="text-sm font-medium text-at-text-secondary">{label}</span>
                      <span className="text-xs text-at-text-weak ml-2">{description}</span>
                    </div>
                  </label>
                )
              )}

              {/* 참조 이미지 업로드 (본인 이미지 활용 선택 시) */}
              {imageCount > 0 && imageStyle === 'use_own_image' && (
                <div className="ml-7 mt-2 space-y-2">
                  <label className="block text-xs font-medium text-at-text-secondary">참조 이미지 업로드</label>
                  <div className="flex items-center gap-3">
                    <label className="cursor-pointer inline-flex items-center gap-2 px-3 py-1.5 border border-indigo-300 text-indigo-600 rounded-lg hover:bg-indigo-50 transition-colors text-xs font-medium">
                      <PhotoIcon className="h-4 w-4" />
                      이미지 선택
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0]
                          if (!file) return
                          if (file.size > 5 * 1024 * 1024) {
                            setError('이미지 파일은 5MB 이하만 업로드 가능합니다.')
                            return
                          }
                          const reader = new FileReader()
                          reader.onload = () => {
                            const result = reader.result as string
                            setReferenceImagePreview(result)
                            const base64 = result.split(',')[1] || ''
                            setReferenceImageBase64(base64)
                          }
                          reader.readAsDataURL(file)
                        }}
                      />
                    </label>
                    {referenceImagePreview && (
                      <button
                        onClick={() => {
                          setReferenceImageBase64('')
                          setReferenceImagePreview('')
                        }}
                        className="text-xs text-red-400 hover:text-at-error transition-colors"
                      >
                        삭제
                      </button>
                    )}
                  </div>
                  {referenceImagePreview && (
                    <div className="relative w-20 h-20 rounded-lg overflow-hidden border border-at-border">
                      <img
                        src={referenceImagePreview}
                        alt="참조 이미지"
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  {!referenceImageBase64 && (
                    <p className="text-xs text-amber-500">인물 이미지를 업로드해주세요</p>
                  )}
                </div>
              )}

              {/* 시각적 스타일 */}
              {imageCount > 0 && (
                <>
                  <hr className="border-at-border" />
                  <label className="text-sm font-medium text-at-text-secondary">시각적 스타일</label>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    {(Object.entries(IMAGE_VISUAL_STYLE_LABELS) as [ImageVisualStyle, { label: string; description: string; emoji: string }][]).map(
                      ([value, { label, description, emoji }]) => (
                        <button
                          key={value}
                          type="button"
                          onClick={() => setImageVisualStyle(value)}
                          className={`flex flex-col items-start gap-1 p-3 rounded-lg border text-left transition-all ${
                            imageVisualStyle === value
                              ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500'
                              : 'border-at-border hover:border-at-border hover:bg-at-surface-alt'
                          }`}
                        >
                          <span className="text-lg">{emoji}</span>
                          <span className={`text-sm font-medium ${imageVisualStyle === value ? 'text-indigo-700' : 'text-at-text-secondary'}`}>{label}</span>
                          <span className="text-[11px] text-at-text-weak leading-tight">{description}</span>
                        </button>
                      )
                    )}
                  </div>
                </>
              )}
            </fieldset>

            {/* 배포 플랫폼 */}
            <fieldset disabled={isGenerating} className={`bg-white rounded-xl border border-at-border p-6 space-y-3 transition-opacity ${isGenerating ? 'opacity-60' : ''}`}>
              <h2 className="text-lg font-semibold text-at-text">배포 플랫폼</h2>
              {(['naverBlog', 'instagram', 'facebook', 'threads'] as const).map((key) => (
                <label key={key} className={`flex items-center gap-3 ${isGenerating ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                  <input
                    type="checkbox"
                    checked={platforms[key]}
                    onChange={(e) => setPlatforms({ ...platforms, [key]: e.target.checked })}
                    className="w-4 h-4 text-indigo-600 border-at-border rounded focus:ring-at-accent disabled:cursor-not-allowed"
                  />
                  <span className="text-sm text-at-text-secondary">
                    {key === 'naverBlog' ? '네이버 블로그' :
                     key === 'instagram' ? '인스타그램' :
                     key === 'facebook' ? '페이스북' : '쓰레드'}
                  </span>
                </label>
              ))}
            </fieldset>

            {/* 에러 */}
            {error && (
              <div className="bg-at-error-bg border border-red-200 rounded-xl p-4 text-sm text-at-error">
                {error}
              </div>
            )}

            {/* 생성 버튼 / 진행 상태 바 (둘 중 하나만 표시) */}
            {isGenerating ? (
              <div className="bg-white rounded-xl border border-at-border p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-at-text-secondary">{generationStep}</span>
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
                          : 'text-at-text-weak'
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
                disabled={!topic || !keyword}
                className="w-full py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:bg-at-border disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                <SparklesIcon className="h-5 w-5" />
                {generatedResult ? '다시 생성' : 'AI 글 생성'}
              </button>
            )}

            {/* 생성 결과 */}
            {generatedResult && (
              <div className="bg-white rounded-xl border border-at-border p-6 space-y-5">
                {/* 결과 헤더 */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <h2 className="text-lg font-semibold text-at-text">생성 결과</h2>
                    {savedItemId && !hasUnsavedChanges && (
                      <span className="flex items-center gap-1 text-xs text-at-success bg-at-success-bg px-2 py-0.5 rounded-full">
                        <CheckCircleIcon className="h-3.5 w-3.5" />
                        저장됨
                      </span>
                    )}
                    {hasUnsavedChanges && (
                      <span className="flex items-center gap-1 text-xs text-at-warning bg-at-warning-bg px-2 py-0.5 rounded-full">
                        <PencilIcon className="h-3.5 w-3.5" />
                        미저장 변경사항
                      </span>
                    )}
                  </div>
                  <div className="flex gap-3 text-xs text-at-text-weak">
                    <span>글자수: {generatedResult.wordCount}자</span>
                    <span>키워드: {generatedResult.keywordCount}회</span>
                  </div>
                </div>

                {/* 저장 메시지 */}
                {saveMessage && (
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
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
                  <label className="block text-sm font-medium text-at-text-weak mb-1.5">제목</label>
                  <input
                    type="text"
                    value={editedTitle}
                    onChange={(e) => {
                      setEditedTitle(e.target.value)
                      setHasUnsavedChanges(true)
                    }}
                    className="w-full text-lg font-bold text-at-text border border-at-border rounded-lg px-3 py-2 focus:ring-2 focus:ring-at-accent focus:border-at-accent bg-at-surface-alt/50"
                  />
                </div>

                {/* 본문 (WYSIWYG 에디터) */}
                <div>
                  <label className="block text-sm font-medium text-at-text-weak mb-2">본문</label>
                  <ContentEditor
                    body={editedBody}
                    images={generatedResult.generatedImages}
                    onChange={(newBody) => {
                      setEditedBody(newBody)
                      setHasUnsavedChanges(true)
                    }}
                  />
                </div>

                {/* 해시태그 (편집 가능) */}
                <div>
                  <label className="block text-sm font-medium text-at-text-weak mb-2">해시태그</label>
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
                          className="w-24 text-xs border border-indigo-300 rounded-full px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-400"
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

                {/* 액션 버튼 */}
                <div className="space-y-3 pt-2">
                  {savedItemId && hasUnsavedChanges && (
                    <button
                      onClick={handleSaveDraft}
                      disabled={isSavingDraft}
                      className="flex items-center justify-center gap-2 px-4 py-2 border border-blue-300 text-at-accent rounded-lg hover:bg-at-accent-light transition-colors text-sm font-medium disabled:opacity-60 w-full"
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
                      className="flex-1 py-2.5 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-at-border disabled:cursor-not-allowed transition-colors text-sm font-medium flex items-center justify-center gap-2"
                    >
                      {isScheduling && !showSchedulePicker ? (
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
                      onClick={() => {
                        setShowSchedulePicker(!showSchedulePicker)
                        if (!scheduleDate) {
                          const tomorrow = new Date()
                          tomorrow.setDate(tomorrow.getDate() + 1)
                          setScheduleDate(tomorrow.toISOString().split('T')[0])
                        }
                      }}
                      disabled={isScheduling || !generatedResult}
                      className={`flex-1 py-2.5 rounded-lg transition-colors text-sm font-medium flex items-center justify-center gap-2 ${
                        showSchedulePicker
                          ? 'bg-blue-700 text-white'
                          : 'bg-at-accent text-white hover:bg-at-accent-hover'
                      } disabled:bg-at-border disabled:cursor-not-allowed`}
                    >
                      <CalendarDaysIcon className="h-4 w-4" />
                      예약 발행
                    </button>
                  </div>

                  {showSchedulePicker && (
                    <div className="bg-at-accent-light rounded-xl border border-at-border p-4 space-y-3 animate-in fade-in duration-200">
                      <div className="flex items-center gap-2 text-sm font-medium text-at-accent">
                        <ClockIcon className="h-4 w-4" />
                        발행 일시 설정
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-at-accent mb-1">날짜</label>
                          <input
                            type="date"
                            value={scheduleDate}
                            min={new Date().toISOString().split('T')[0]}
                            onChange={(e) => setScheduleDate(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-at-border rounded-lg focus:ring-2 focus:ring-at-accent focus:border-at-accent bg-white"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-at-accent mb-1">시간</label>
                          <input
                            type="time"
                            value={scheduleTime}
                            onChange={(e) => setScheduleTime(e.target.value)}
                            className="w-full px-3 py-2 text-sm border border-at-border rounded-lg focus:ring-2 focus:ring-at-accent focus:border-at-accent bg-white"
                          />
                        </div>
                      </div>
                      <button
                        onClick={handleScheduleConfirm}
                        disabled={isScheduling || !scheduleDate || !scheduleTime}
                        className="w-full py-2 bg-at-accent text-white rounded-lg hover:bg-at-accent-hover disabled:bg-at-border disabled:cursor-not-allowed transition-colors text-sm font-medium flex items-center justify-center gap-2"
                      >
                        {isScheduling ? (
                          <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                          </svg>
                        ) : (
                          <CalendarDaysIcon className="h-4 w-4" />
                        )}
                        {scheduleDate} {scheduleTime} 예약 확인
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
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
  // 프롬프트 텍스트로 이미지 매칭 (순차 인덱스 폴백)
  const usedImageIndices = new Set<number>()
  let fallbackIndex = 0

  const findImage = (prompt: string) => {
    if (!images || images.length === 0) return undefined
    // 1차: 프롬프트 텍스트로 정확 매칭
    const exactIdx = images.findIndex((img, i) => !usedImageIndices.has(i) && img.prompt === prompt)
    if (exactIdx >= 0) { usedImageIndices.add(exactIdx); return images[exactIdx] }
    // 2차: 부분 매칭
    const partialIdx = images.findIndex((img, i) => !usedImageIndices.has(i) && (img.prompt.includes(prompt.slice(0, 10)) || prompt.includes(img.prompt.slice(0, 10))))
    if (partialIdx >= 0) { usedImageIndices.add(partialIdx); return images[partialIdx] }
    // 3차: 순차 폴백
    while (fallbackIndex < images.length && usedImageIndices.has(fallbackIndex)) fallbackIndex++
    if (fallbackIndex < images.length) { usedImageIndices.add(fallbackIndex); return images[fallbackIndex++] }
    return undefined
  }

  const flushParagraph = () => {
    if (paragraphBuffer.length > 0) {
      const text = paragraphBuffer.join('\n').trim()
      if (text) {
        elements.push(
          <p key={key++} className="text-sm leading-7 text-at-text-secondary mb-3">
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
            <p className="text-xs text-at-text-weak mt-1.5 text-center">{currentImage.fileName || prompt}</p>
          </div>
        )
      } else {
        elements.push(
          <div key={key++} className="my-4 rounded-xl border-2 border-dashed border-at-border bg-at-surface-alt p-6 flex flex-col items-center justify-center gap-2">
            <PhotoIcon className="h-10 w-10 text-at-text-weak" />
            <span className="text-xs text-at-text-weak text-center">{prompt}</span>
            <span className="text-[10px] text-at-text-weak">이미지 생성에 실패했습니다</span>
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
          <span className="text-sm leading-6 text-at-text-secondary flex-1">
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
          <span className="text-sm leading-6 text-at-text-secondary flex-1">
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
