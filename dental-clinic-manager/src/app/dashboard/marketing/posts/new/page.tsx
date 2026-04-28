'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
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
  ClockIcon,
  HashtagIcon,
  AdjustmentsHorizontalIcon,
  MegaphoneIcon,
  PaintBrushIcon,
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
  type ImageStyleOption,
  type ImageVisualStyle,
} from '@/types/marketing'
import dynamic from 'next/dynamic'
import { useAIGeneration, type GeneratedResultType } from '@/contexts/AIGenerationContext'
import { requireWorker } from '@/hooks/useWorkerGuard'
import { usePremiumFeatures } from '@/hooks/usePremiumFeatures'
import { useSeoPreview } from '@/hooks/useSeoPreview'

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

export default function NewMarketingPostPage() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const aiGen = useAIGeneration()
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
  const [targetWordCount, setTargetWordCount] = useState<number>(1500)
  const [useSeoAnalysis, setUseSeoAnalysis] = useState(false)
  const seoPreview = useSeoPreview()
  const seoResult = seoPreview.result
  const [referenceImageBase64, setReferenceImageBase64] = useState<string>('')
  const [referenceImagePreview, setReferenceImagePreview] = useState<string>('')

  // ── 생성 / 저장 상태 ──
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
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [newHashtagInput, setNewHashtagInput] = useState('')
  const [isAddingHashtag, setIsAddingHashtag] = useState(false)
  const hashtagInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!saveMessage) return
    const t = setTimeout(() => setSaveMessage(null), 3000)
    return () => clearTimeout(t)
  }, [saveMessage])

  useEffect(() => {
    if (isAddingHashtag) hashtagInputRef.current?.focus()
  }, [isAddingHashtag])

  const handlePostTypeChange = (type: PostType) => {
    setPostType(type)
    setPlatforms(DEFAULT_PLATFORM_PRESETS[type])
  }

  // ── SEO 분석 미리보기 ──
  const runSeoPreview = useCallback(() => {
    if (!keyword.trim()) return
    setUseSeoAnalysis(true)
    seoPreview.start(keyword)
  }, [keyword, seoPreview])

  const applySeoRecommendations = () => {
    if (!seoResult) return
    const recommendedImages = Math.min(5, Math.max(0, Math.round(seoResult.avgImageCount)))
    const recommendedLength = Math.max(1000, Math.round(seoResult.avgBodyLength / 100) * 100)
    setImageCount(recommendedImages)
    setTargetWordCount(recommendedLength)
  }

  const handleResult = useCallback(async (result: GeneratedResultType) => {
    setGeneratedResult(result)
    setEditedTitle(result.title)
    setEditedBody(result.body)
    setEditedHashtags(result.hashtags || [])
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
          body: JSON.stringify({ title: result.title, topic, keyword, postType, tone, useResearch, factCheck, platforms, generatedContent: result }),
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

  useEffect(() => {
    aiGen.onResultCallback.current = handleResult
    return () => { aiGen.onResultCallback.current = null }
  }, [aiGen.onResultCallback, handleResult])

  useEffect(() => {
    if (aiGen.generationError) setError(aiGen.generationError)
  }, [aiGen.generationError])

  useEffect(() => {
    if (aiGen.generatedResult && !generatedResult) handleResult(aiGen.generatedResult)
  }, [aiGen.generatedResult, generatedResult, handleResult])

  const handleGenerate = async () => {
    if (!hasPremiumFeature('marketing')) { setError('마케팅 자동화 프리미엄 기능이 활성화되어 있지 않습니다.'); return }
    if (!await requireWorker('marketing', 'AI 글 생성')) return
    if (!topic || !keyword) { setError('주제와 키워드를 입력해주세요.'); return }
    setError('')
    setHasUnsavedChanges(false)
    aiGen.startGeneration({
      topic, keyword, postType, tone, useResearch, factCheck, useSeoAnalysis, platforms,
      imageStyle, imageVisualStyle, imageCount, targetWordCount,
      referenceImageBase64: imageStyle === 'use_own_image' ? referenceImageBase64 : undefined,
    })
  }

  const handleSaveDraft = async () => {
    if (!savedItemId) return
    setIsSavingDraft(true)
    try {
      const updatedContent: GeneratedResultType = { ...generatedResult!, title: editedTitle, body: editedBody, hashtags: editedHashtags }
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

  const handlePublish = async (targetDate: string, targetTime: string, isImmediate: boolean) => {
    if (!generatedResult) return
    if (!hasPremiumFeature('marketing')) { setError('마케팅 자동화 프리미엄 기능이 활성화되어 있지 않습니다.'); return }
    if (!await requireWorker('marketing', '글 발행')) return
    setIsScheduling(true)
    try {
      const updatedContent: GeneratedResultType = { ...generatedResult, title: editedTitle, body: editedBody, hashtags: editedHashtags }
      if (savedItemId) {
        const res = await fetch(`/api/marketing/posts/${savedItemId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: editedTitle, generatedContent: updatedContent, status: 'scheduled', publishDate: targetDate, publishTime: targetTime }),
        })
        if (!res.ok) throw new Error('저장 실패')
      } else {
        const saveRes = await fetch('/api/marketing/posts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: editedTitle, topic, keyword, postType, tone, useResearch, factCheck, platforms, publishDate: targetDate, publishTime: targetTime, generatedContent: updatedContent }),
        })
        if (!saveRes.ok) throw new Error('저장 실패')
        const saveJson = await saveRes.json()
        const patchRes = await fetch(`/api/marketing/posts/${saveJson.data.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'scheduled' }) })
        if (!patchRes.ok) throw new Error('예약 실패')
      }
      try { await fetch('/api/marketing/publish/trigger', { method: 'POST' }) } catch { /* 무시 */ }
      setSaveMessage({ type: 'success', text: isImmediate ? '바로 발행이 시작됩니다!' : `${targetDate} ${targetTime}에 발행이 예약되었습니다.` })
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
    if (!scheduleDate || !scheduleTime) { setSaveMessage({ type: 'error', text: '날짜와 시간을 선택해주세요.' }); return }
    handlePublish(scheduleDate, scheduleTime, false)
  }

  const removeHashtag = (index: number) => {
    setEditedHashtags(editedHashtags.filter((_, i) => i !== index))
    setHasUnsavedChanges(true)
  }

  const confirmAddHashtag = () => {
    const tag = newHashtagInput.trim().replace(/^#/, '')
    if (tag && !editedHashtags.includes(tag)) { setEditedHashtags([...editedHashtags, tag]); setHasUnsavedChanges(true) }
    setNewHashtagInput('')
    setIsAddingHashtag(false)
  }

  if (loading || !user) return null

  const isFormDisabled = isGenerating

  return (
    <div className="p-4 sm:p-6 space-y-8">

      {/* ── 1. 기본 정보 ── */}
      <section>
        <SectionHeader number={1} title="기본 정보" icon={SparklesIcon} />
        <fieldset disabled={isFormDisabled} className={`space-y-4 transition-opacity ${isFormDisabled ? 'opacity-50' : ''}`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-at-text-secondary mb-1.5">
                주제 <span className="text-at-error">*</span>
              </label>
              <input
                type="text"
                value={topic}
                onChange={(e) => setTopic(e.target.value)}
                placeholder="예: 스케일링 후 주의사항"
                className="w-full px-3 py-2 border border-at-border rounded-lg focus:ring-2 focus:ring-at-accent focus:border-at-accent text-sm disabled:bg-at-surface-alt disabled:cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-at-text-secondary mb-1.5">
                타겟 키워드 <span className="text-at-error">*</span>
              </label>
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

      {/* ── 2. 품질 옵션 ── */}
      <section>
        <SectionHeader number={2} title="품질 옵션" icon={AdjustmentsHorizontalIcon} iconColor="text-amber-600" iconBg="bg-amber-50" />
        <fieldset disabled={isFormDisabled} className={`transition-opacity ${isFormDisabled ? 'opacity-50' : ''}`}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className={`flex items-start gap-3 p-4 rounded-xl border border-at-border hover:bg-at-surface-alt transition-colors ${isFormDisabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
              <input
                type="checkbox"
                checked={useResearch}
                onChange={(e) => setUseResearch(e.target.checked)}
                className="mt-0.5 w-4 h-4 text-at-accent border-at-border rounded focus:ring-at-accent"
              />
              <div>
                <p className="text-sm font-medium text-at-text">논문 인용</p>
                <p className="text-xs text-at-text-weak mt-0.5">관련 학술 논문을 검색하여 인용합니다</p>
              </div>
            </label>
            <label className={`flex items-start gap-3 p-4 rounded-xl border border-at-border hover:bg-at-surface-alt transition-colors ${isFormDisabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
              <input
                type="checkbox"
                checked={factCheck}
                onChange={(e) => setFactCheck(e.target.checked)}
                className="mt-0.5 w-4 h-4 text-at-accent border-at-border rounded focus:ring-at-accent"
              />
              <div>
                <p className="text-sm font-medium text-at-text">팩트체크</p>
                <p className="text-xs text-at-text-weak mt-0.5">생성된 글의 사실 여부를 검증합니다</p>
              </div>
            </label>
          </div>

          {/* SEO 분석 미리보기 */}
          <div className="mt-4 p-4 rounded-xl border border-at-border bg-at-surface-alt/50 space-y-3">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-at-text">경쟁 글 분석 미리보기</p>
                <p className="text-xs text-at-text-weak mt-0.5">
                  상위 노출 글의 평균 글자수·이미지 수를 확인한 뒤 글 길이와 이미지 개수를 직접 정할 수 있습니다.
                </p>
              </div>
              <button
                type="button"
                onClick={runSeoPreview}
                disabled={seoPreview.isBusy || !keyword.trim() || isFormDisabled}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-at-border disabled:cursor-not-allowed transition-colors"
                title={!keyword.trim() ? '키워드를 먼저 입력해주세요' : 'SEO 분석을 실행하여 상위 노출 글의 권장값을 확인합니다'}
              >
                {seoPreview.isBusy ? '분석 중...' : (seoResult ? '다시 분석' : '분석 실행')}
              </button>
            </div>

            {/* 진행률 바 (분석 중) */}
            {seoPreview.isBusy && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-at-text-secondary">{seoPreview.step || '분석 중...'}</span>
                  <span className="font-semibold text-indigo-600">{seoPreview.progress}%</span>
                </div>
                <div className="relative h-2 bg-at-border rounded-full overflow-hidden">
                  <div
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${seoPreview.progress}%` }}
                  />
                </div>
                <p className="text-[10px] text-at-text-weak">분석은 보통 30초~1분 정도 걸리며, 페이지를 떠나지 않으셔도 됩니다.</p>
              </div>
            )}

            {seoPreview.status === 'failed' && seoPreview.error && (
              <p className="text-xs text-at-error">{seoPreview.error}</p>
            )}

            {seoResult && (
              <div className="space-y-3">
                <p className="text-[11px] text-at-text-weak">키워드 “{seoPreview.appliedKeyword}” 상위 노출 글 분석 결과</p>
                <div className="grid grid-cols-3 gap-2">
                  <div className="rounded-lg bg-white border border-at-border p-2.5">
                    <p className="text-[10px] text-at-text-weak">평균 글자수</p>
                    <p className="text-sm font-semibold text-at-text mt-0.5">{seoResult.avgBodyLength.toLocaleString()}자</p>
                  </div>
                  <div className="rounded-lg bg-white border border-at-border p-2.5">
                    <p className="text-[10px] text-at-text-weak">평균 이미지</p>
                    <p className="text-sm font-semibold text-at-text mt-0.5">{seoResult.avgImageCount.toFixed(1)}장</p>
                  </div>
                  <div className="rounded-lg bg-white border border-at-border p-2.5">
                    <p className="text-[10px] text-at-text-weak">평균 소제목</p>
                    <p className="text-sm font-semibold text-at-text mt-0.5">{seoResult.avgHeadingCount.toFixed(1)}개</p>
                  </div>
                </div>

                {seoResult.recommendedKeywords && seoResult.recommendedKeywords.length > 0 && (
                  <div>
                    <p className="text-[11px] font-medium text-at-text-secondary mb-1">추천 키워드 (자동 반영)</p>
                    <div className="flex flex-wrap gap-1.5">
                      {seoResult.recommendedKeywords.slice(0, 8).map((kw) => (
                        <span key={kw} className="inline-flex px-2 py-0.5 text-[11px] rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
                          {kw}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={applySeoRecommendations}
                    disabled={isFormDisabled}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-at-border disabled:cursor-not-allowed transition-colors"
                  >
                    권장값을 글 길이/이미지에 적용
                  </button>
                  <span className="text-[11px] text-at-text-weak">
                    → 글자수 {Math.max(1000, Math.round(seoResult.avgBodyLength / 100) * 100).toLocaleString()}자, 이미지 {Math.min(5, Math.max(0, Math.round(seoResult.avgImageCount)))}장
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* 목표 글자수 */}
          <div className="mt-4">
            <label className="block text-sm font-medium text-at-text-secondary mb-1.5">
              목표 글자수
              {seoResult && (
                <span className="ml-2 text-[11px] text-at-text-weak">
                  (경쟁 평균 {seoResult.avgBodyLength.toLocaleString()}자)
                </span>
              )}
            </label>
            <div className="flex items-center gap-3">
              <input
                type="range"
                min={1000}
                max={3500}
                step={100}
                value={targetWordCount}
                onChange={(e) => setTargetWordCount(Number(e.target.value))}
                disabled={isFormDisabled}
                className="flex-1 h-2 accent-at-accent cursor-pointer disabled:cursor-not-allowed"
              />
              <input
                type="number"
                min={1000}
                max={5000}
                step={100}
                value={targetWordCount}
                onChange={(e) => {
                  const v = Number(e.target.value)
                  if (Number.isFinite(v)) setTargetWordCount(Math.max(500, Math.min(5000, v)))
                }}
                disabled={isFormDisabled}
                className="w-24 px-2 py-1.5 border border-at-border rounded-lg text-sm focus:ring-2 focus:ring-at-accent focus:border-at-accent disabled:bg-at-surface-alt"
              />
              <span className="text-xs text-at-text-weak">자</span>
            </div>
            <p className="text-[11px] text-at-text-weak mt-1">
              권장 1,500~2,500자. SEO 분석 결과의 평균 글자수에 맞추면 상위 노출 가능성이 높아집니다.
            </p>
          </div>
        </fieldset>
      </section>

      {/* ── 3. 이미지 옵션 ── */}
      <section>
        <SectionHeader number={3} title="이미지 옵션" icon={PaintBrushIcon} iconColor="text-emerald-600" iconBg="bg-emerald-50" />
        <fieldset disabled={isFormDisabled} className={`space-y-5 transition-opacity ${isFormDisabled ? 'opacity-50' : ''}`}>
          {/* 이미지 개수 */}
          <div>
            <label className="block text-sm font-medium text-at-text-secondary mb-2">
              이미지 개수
              {seoResult && (
                <span className="ml-2 text-[11px] text-at-text-weak">(경쟁 평균 {seoResult.avgImageCount.toFixed(1)}장)</span>
              )}
            </label>
            <div className="flex items-center gap-2 flex-wrap">
              {[0, 1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setImageCount(n)}
                  className={`w-9 h-9 rounded-lg text-sm font-semibold transition-colors ${
                    imageCount === n
                      ? 'bg-at-accent text-white'
                      : 'bg-at-surface-alt text-at-text-secondary border border-at-border hover:bg-at-border'
                  }`}
                >
                  {n}
                </button>
              ))}
              <span className="text-xs text-at-text-weak ml-1">
                {imageCount === 0 ? '이미지 없이 글만 생성' : `최대 ${imageCount}개`}
              </span>
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
                      <input
                        type="radio"
                        name="imageStyle"
                        value={value}
                        checked={imageStyle === value}
                        onChange={() => {
                          setImageStyle(value)
                          if (value !== 'use_own_image') { setReferenceImageBase64(''); setReferenceImagePreview('') }
                        }}
                        className="mt-0.5 w-4 h-4 text-at-accent border-at-border focus:ring-at-accent"
                      />
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
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
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
                        }}
                      />
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
                      <button
                        key={value}
                        type="button"
                        onClick={() => setImageVisualStyle(value)}
                        className={`flex flex-col items-start gap-1 p-3 rounded-xl border text-left transition-all ${
                          imageVisualStyle === value ? 'border-at-accent bg-at-accent-light' : 'border-at-border hover:bg-at-surface-alt'
                        }`}
                      >
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

      {/* ── 4. 배포 플랫폼 ── */}
      <section>
        <SectionHeader number={4} title="배포 플랫폼" icon={MegaphoneIcon} iconColor="text-purple-600" iconBg="bg-purple-50" />
        <fieldset disabled={isFormDisabled} className={`transition-opacity ${isFormDisabled ? 'opacity-50' : ''}`}>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {(['naverBlog', 'instagram', 'facebook', 'threads'] as const).map((key) => (
              <label key={key} className={`flex items-center gap-2.5 p-3.5 rounded-xl border transition-colors ${
                platforms[key] ? 'border-at-accent bg-at-accent-light' : 'border-at-border hover:bg-at-surface-alt'
              } ${isFormDisabled ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                <input
                  type="checkbox"
                  checked={platforms[key]}
                  onChange={(e) => setPlatforms({ ...platforms, [key]: e.target.checked })}
                  className="w-4 h-4 text-at-accent border-at-border rounded focus:ring-at-accent"
                />
                <span className={`text-xs font-medium ${platforms[key] ? 'text-at-accent' : 'text-at-text-secondary'}`}>
                  {key === 'naverBlog' ? '네이버 블로그' : key === 'instagram' ? '인스타그램' : key === 'facebook' ? '페이스북' : '쓰레드'}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
      </section>

      {/* 에러 메시지 */}
      {error && (
        <div className="bg-at-error-bg border border-red-200 text-at-error px-4 py-3 rounded-xl text-sm flex items-center gap-2">
          <XMarkIcon className="h-4 w-4 flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-at-error flex-shrink-0 ml-auto">×</button>
        </div>
      )}

      {/* ── 생성 버튼 / 진행 상태 ── */}
      {isGenerating ? (
        <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-at-border p-5 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-at-text-secondary">{generationStep}</span>
            <span className="text-sm font-bold text-at-accent">{generationProgress}%</span>
          </div>
          <div className="relative h-2.5 bg-white rounded-full overflow-hidden border border-at-border">
            <div
              className="absolute inset-y-0 left-0 bg-gradient-to-r from-at-accent to-purple-500 rounded-full transition-all duration-500 ease-out"
              style={{ width: `${generationProgress}%` }}
            />
          </div>
          <div className="flex justify-between text-xs">
            {[{ label: '글 작성', threshold: 5 }, { label: '이미지 생성', threshold: 55 }, { label: '저장', threshold: 95 }, { label: '완료', threshold: 100 }].map(({ label, threshold }) => (
              <span key={label} className={`transition-colors duration-300 ${
                generationProgress >= threshold ? (threshold === 100 ? 'text-at-success font-semibold' : 'text-at-accent font-semibold') : 'text-at-text-weak'
              }`}>
                {generationProgress >= threshold ? '✓ ' : ''}{label}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <button
          onClick={handleGenerate}
          disabled={!topic || !keyword}
          className="w-full py-3 bg-at-accent text-white rounded-xl font-medium hover:bg-at-accent-hover disabled:bg-at-border disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2 text-sm"
        >
          <SparklesIcon className="h-5 w-5" />
          {generatedResult ? '다시 생성' : 'AI 글 생성하기'}
        </button>
      )}

      {/* ── 5. 생성 결과 ── */}
      {generatedResult && (
        <section>
          <div className="flex items-center justify-between pb-3 mb-4 border-b border-at-border">
            <div className="flex items-center space-x-3">
              <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600">
                <DocumentCheckIcon className="w-4 h-4" />
              </div>
              <h3 className="text-base font-semibold text-at-text">
                <span className="text-at-accent mr-1">5.</span>
                생성 결과
              </h3>
            </div>
            <div className="flex items-center gap-3">
              {savedItemId && !hasUnsavedChanges && (
                <span className="flex items-center gap-1 text-xs text-at-success bg-at-success-bg px-2 py-1 rounded-full">
                  <CheckCircleIcon className="h-3.5 w-3.5" />
                  저장됨
                </span>
              )}
              {hasUnsavedChanges && (
                <span className="flex items-center gap-1 text-xs text-at-warning bg-at-warning-bg px-2 py-1 rounded-full">
                  <PencilIcon className="h-3.5 w-3.5" />
                  미저장
                </span>
              )}
              <div className="flex gap-3 text-xs text-at-text-weak">
                <span>{generatedResult.wordCount}자</span>
                <span>키워드 {generatedResult.keywordCount}회</span>
              </div>
            </div>
          </div>

          <div className="space-y-5">
            {/* 저장 메시지 */}
            {saveMessage && (
              <div className={`flex items-center gap-2 px-4 py-3 rounded-xl text-sm ${
                saveMessage.type === 'success' ? 'bg-at-success-bg text-at-success border border-green-200' : 'bg-at-error-bg text-at-error border border-red-200'
              }`}>
                {saveMessage.type === 'success' ? <CheckCircleIcon className="h-4 w-4 flex-shrink-0" /> : <XMarkIcon className="h-4 w-4 flex-shrink-0" />}
                {saveMessage.text}
              </div>
            )}

            {/* 제목 */}
            <div>
              <label className="block text-sm font-medium text-at-text-secondary mb-1.5">제목</label>
              <input
                type="text"
                value={editedTitle}
                onChange={(e) => { setEditedTitle(e.target.value); setHasUnsavedChanges(true) }}
                className="w-full text-base font-bold text-at-text border border-at-border rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-at-accent focus:border-at-accent bg-white"
              />
            </div>

            {/* 본문 */}
            <div>
              <label className="block text-sm font-medium text-at-text-secondary mb-1.5">본문</label>
              <ContentEditor
                body={editedBody}
                images={generatedResult.generatedImages}
                onChange={(newBody) => { setEditedBody(newBody); setHasUnsavedChanges(true) }}
              />
            </div>

            {/* 해시태그 */}
            <div>
              <div className="flex items-center gap-1.5 mb-2">
                <HashtagIcon className="h-4 w-4 text-at-text-weak" />
                <label className="text-sm font-medium text-at-text-secondary">해시태그</label>
              </div>
              <div className="flex flex-wrap gap-2 items-center">
                {editedHashtags.map((tag, i) => (
                  <span key={i} className="flex items-center gap-1 px-3 py-1 bg-at-accent-light text-at-accent text-xs rounded-full font-medium">
                    #{tag}
                    <button onClick={() => removeHashtag(i)} className="text-at-accent/50 hover:text-at-error transition-colors ml-0.5">
                      <XMarkIcon className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                {isAddingHashtag ? (
                  <div className="flex items-center gap-1">
                    <span className="text-at-text-weak text-xs">#</span>
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
                      className="w-24 text-xs border border-at-border rounded-full px-2 py-1 focus:outline-none focus:ring-1 focus:ring-at-accent"
                    />
                  </div>
                ) : (
                  <button
                    onClick={() => setIsAddingHashtag(true)}
                    className="flex items-center gap-1 px-2.5 py-1 border border-dashed border-at-border text-at-text-weak text-xs rounded-full hover:bg-at-surface-alt transition-colors"
                  >
                    <PlusIcon className="h-3 w-3" />
                    추가
                  </button>
                )}
              </div>
            </div>

            {/* 액션 버튼 */}
            <div className="space-y-3 pt-2 border-t border-at-border">
              {savedItemId && hasUnsavedChanges && (
                <button
                  onClick={handleSaveDraft}
                  disabled={isSavingDraft}
                  className="flex items-center justify-center gap-2 w-full px-4 py-2.5 border border-at-border text-at-text-secondary rounded-xl hover:bg-at-surface-alt transition-colors text-sm font-medium disabled:opacity-60 mt-3"
                >
                  {isSavingDraft ? (
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : <CloudArrowUpIcon className="h-4 w-4" />}
                  임시 저장
                </button>
              )}

              <div className={`flex gap-3 ${savedItemId && hasUnsavedChanges ? '' : 'mt-3'}`}>
                <button
                  onClick={handlePublishNow}
                  disabled={isScheduling || !generatedResult}
                  className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:bg-at-border disabled:cursor-not-allowed transition-colors text-sm font-medium flex items-center justify-center gap-2"
                >
                  {isScheduling && !showSchedulePicker ? (
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : <DocumentCheckIcon className="h-4 w-4" />}
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
                  className={`flex-1 py-2.5 rounded-xl transition-colors text-sm font-medium flex items-center justify-center gap-2 ${
                    showSchedulePicker ? 'bg-at-accent text-white' : 'bg-at-accent-light text-at-accent hover:bg-at-tag'
                  } disabled:bg-at-border disabled:cursor-not-allowed`}
                >
                  <CalendarDaysIcon className="h-4 w-4" />
                  예약 발행
                </button>
              </div>

              {showSchedulePicker && (
                <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl border border-at-border p-4 space-y-3">
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
                    className="w-full py-2.5 bg-at-accent text-white rounded-xl hover:bg-at-accent-hover disabled:bg-at-border disabled:cursor-not-allowed transition-colors text-sm font-medium flex items-center justify-center gap-2"
                  >
                    {isScheduling ? (
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : <CalendarDaysIcon className="h-4 w-4" />}
                    {scheduleDate} {scheduleTime} 예약 확인
                  </button>
                </div>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
