'use client'

import { useState, useEffect, useRef } from 'react'
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
} from '@heroicons/react/24/outline'
import {
  TONE_LABELS,
  POST_TYPE_LABELS,
  DEFAULT_PLATFORM_PRESETS,
  type PostType,
  type ToneType,
  type PlatformOptions,
  type GeneratedContent,
} from '@/types/marketing'
import Header from '@/components/Layout/Header'
import TabNavigation from '@/components/Layout/TabNavigation'
import { getTabRoute } from '@/utils/tabRouting'
import ContentEditor from '@/components/marketing/ContentEditor'

type GeneratedResultType = GeneratedContent & {
  generatedImages?: { fileName: string; prompt: string; path?: string }[]
}

export default function NewMarketingPostPage() {
  const { user, logout, loading } = useAuth()
  const router = useRouter()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  // ── 입력 폼 상태 ──
  const [topic, setTopic] = useState('')
  const [keyword, setKeyword] = useState('')
  const [postType, setPostType] = useState<PostType>('informational')
  const [tone, setTone] = useState<ToneType>('friendly')
  const [useResearch, setUseResearch] = useState(false)
  const [factCheck, setFactCheck] = useState(false)
  const [platforms, setPlatforms] = useState<PlatformOptions>(DEFAULT_PLATFORM_PRESETS.informational)

  // ── 생성 / 저장 상태 ──
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationProgress, setGenerationProgress] = useState(0)
  const [generationStep, setGenerationStep] = useState('')
  const [generatedResult, setGeneratedResult] = useState<GeneratedResultType | null>(null)
  const [savedItemId, setSavedItemId] = useState<string | null>(null)
  const [isSavingDraft, setIsSavingDraft] = useState(false)
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [isScheduling, setIsScheduling] = useState(false)
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

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth')
    }
  }, [user, loading, router])

  useEffect(() => {
    document.body.style.overflow = isMobileMenuOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [isMobileMenuOpen])

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

  const handleMainTabChange = (tab: string) => {
    if (tab === 'marketing') return
    router.push(getTabRoute(tab))
  }

  const handlePostTypeChange = (type: PostType) => {
    setPostType(type)
    setPlatforms(DEFAULT_PLATFORM_PRESETS[type])
  }

  // ── AI 글 생성 + 자동 저장 (SSE 스트리밍) ──
  const handleGenerate = async () => {
    if (!topic || !keyword) {
      setError('주제와 키워드를 입력해주세요.')
      return
    }

    setIsGenerating(true)
    setGenerationProgress(0)
    setGenerationStep('준비 중...')
    setError('')
    setIsEditingBody(false)
    setHasUnsavedChanges(false)

    try {
      const res = await fetch('/api/marketing/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topic, keyword, postType, tone, useResearch, factCheck, platforms }),
      })

      if (!res.ok || !res.body) {
        // Vercel 인프라 오류 시 plain text 응답일 수 있으므로 text()로 읽기
        const text = await res.text()
        let errorMessage = '글 생성 실패'
        try {
          const json = JSON.parse(text)
          errorMessage = json.error || errorMessage
        } catch {
          errorMessage = text.length > 100 ? text.slice(0, 100) + '...' : text || errorMessage
        }
        throw new Error(errorMessage)
      }

      // SSE 스트림 읽기
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const data = JSON.parse(line.slice(6))

            if (data.heartbeat) continue // keepalive 무시
            if (data.error) throw new Error(data.error)

            if (data.progress !== undefined) setGenerationProgress(data.progress)
            if (data.step) setGenerationStep(data.step)

            if (data.result) {
              const result: GeneratedResultType = data.result
              setGeneratedResult(result)
              setEditedTitle(result.title)
              setEditedBody(result.body)
              setEditedHashtags(result.hashtags || [])

              // 자동 DB 저장 (비차단)
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
            }
          } catch (parseErr) {
            if (parseErr instanceof Error && parseErr.message !== 'Unexpected end of JSON input') {
              throw parseErr
            }
          }
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '글 생성 중 오류가 발생했습니다.')
    } finally {
      setIsGenerating(false)
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

  // ── 발행 예약 ──
  const handleSchedule = async () => {
    if (!generatedResult) return
    setIsScheduling(true)
    try {
      const updatedContent: GeneratedResultType = {
        ...generatedResult,
        title: editedTitle,
        body: editedBody,
        hashtags: editedHashtags,
      }

      const today = new Date().toISOString().split('T')[0]
      const now = new Date().toTimeString().slice(0, 5) // HH:MM

      if (savedItemId) {
        // 기존 항목 업데이트 + 즉시 발행 가능하도록 시간 설정
        const res = await fetch(`/api/marketing/posts/${savedItemId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: editedTitle,
            generatedContent: updatedContent,
            status: 'scheduled',
            publishDate: today,
            publishTime: now,
          }),
        })
        if (!res.ok) throw new Error('저장 실패')
      } else {
        // savedItemId 없으면 새로 생성하면서 예약
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
            publishDate: today,
            publishTime: now,
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

      setSaveMessage({ type: 'success', text: '발행 예약이 완료되었습니다! 마케팅 워커가 곧 발행합니다.' })
      setTimeout(() => router.push('/admin/marketing'), 1500)
    } catch (err) {
      setSaveMessage({ type: 'error', text: err instanceof Error ? err.message : '발행 예약에 실패했습니다.' })
      setIsScheduling(false)
    }
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
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">로딩 중...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-100">
      {/* Header */}
      <div className="fixed top-0 left-0 right-0 z-30 h-14 bg-white border-b border-slate-200">
        <div className="max-w-[1400px] mx-auto h-full px-3 sm:px-6 flex items-center">
          <Header
            dbStatus="connected"
            user={user}
            onLogout={() => logout()}
            onMenuToggle={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            isMenuOpen={isMobileMenuOpen}
          />
        </div>
      </div>

      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      <aside
        className={`
          fixed top-14 w-64 lg:w-56 h-[calc(100vh-3.5rem)] bg-white border-r border-slate-200 z-20 overflow-y-auto py-3 px-3
          transition-transform duration-300 ease-in-out
          lg:left-[max(0px,calc(50%-700px))]
          ${isMobileMenuOpen ? 'translate-x-0 left-0' : '-translate-x-full left-0 lg:translate-x-0'}
        `}
      >
        <TabNavigation activeTab="marketing" onTabChange={handleMainTabChange} />
      </aside>

      <div className="pt-14">
        <main className="max-w-[1400px] mx-auto px-3 sm:px-4 lg:pl-60 lg:pr-6 pt-4 pb-6">
          {/* 페이지 헤더 */}
          <div className="flex items-center gap-3 mb-6">
            <button
              onClick={() => router.push('/admin/marketing')}
              className="p-2 text-slate-400 hover:text-slate-600 transition-colors rounded-lg hover:bg-white"
            >
              <ArrowLeftIcon className="h-5 w-5" />
            </button>
            <h1 className="text-xl font-bold text-slate-800">새 글 작성</h1>
          </div>

          <div className="max-w-4xl space-y-6">
            {/* 기본 정보 */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
              <h2 className="text-lg font-semibold text-slate-800">기본 정보</h2>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">주제 *</label>
                <input
                  type="text"
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="예: 스케일링 후 주의사항"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">타겟 키워드 *</label>
                <input
                  type="text"
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="예: 스케일링 주의사항"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">글 유형</label>
                  <select
                    value={postType}
                    onChange={(e) => handlePostTypeChange(e.target.value as PostType)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                  >
                    {Object.entries(POST_TYPE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">어투</label>
                  <select
                    value={tone}
                    onChange={(e) => setTone(e.target.value as ToneType)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 text-sm"
                  >
                    {Object.entries(TONE_LABELS).map(([value, { label, description }]) => (
                      <option key={value} value={value}>{label} - {description}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* 품질 옵션 */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-3">
              <h2 className="text-lg font-semibold text-slate-800">품질 옵션</h2>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={useResearch}
                  onChange={(e) => setUseResearch(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                />
                <div>
                  <span className="text-sm font-medium text-slate-700">논문 인용</span>
                  <span className="text-xs text-slate-400 ml-2">관련 학술 논문을 검색하여 인용</span>
                </div>
              </label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={factCheck}
                  onChange={(e) => setFactCheck(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                />
                <div>
                  <span className="text-sm font-medium text-slate-700">팩트체크</span>
                  <span className="text-xs text-slate-400 ml-2">생성된 글의 사실 여부를 검증</span>
                </div>
              </label>
            </div>

            {/* 배포 플랫폼 */}
            <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-3">
              <h2 className="text-lg font-semibold text-slate-800">배포 플랫폼</h2>
              {(['naverBlog', 'instagram', 'facebook', 'threads'] as const).map((key) => (
                <label key={key} className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={platforms[key]}
                    onChange={(e) => setPlatforms({ ...platforms, [key]: e.target.checked })}
                    className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                  />
                  <span className="text-sm text-slate-700">
                    {key === 'naverBlog' ? '네이버 블로그' :
                     key === 'instagram' ? '인스타그램' :
                     key === 'facebook' ? '페이스북' : '쓰레드'}
                  </span>
                </label>
              ))}
            </div>

            {/* 에러 */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-600">
                {error}
              </div>
            )}

            {/* 생성 버튼 / 진행 상태 바 (둘 중 하나만 표시) */}
            {isGenerating ? (
              <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-700">{generationStep}</span>
                  <span className="text-sm font-bold text-indigo-600">{generationProgress}%</span>
                </div>
                <div className="relative h-3 bg-slate-100 rounded-full overflow-hidden">
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
                          : 'text-slate-400'
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
                className="w-full py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                <SparklesIcon className="h-5 w-5" />
                {generatedResult ? '다시 생성' : 'AI 글 생성'}
              </button>
            )}

            {/* 생성 결과 */}
            {generatedResult && (
              <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
                {/* 결과 헤더 */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <h2 className="text-lg font-semibold text-slate-800">생성 결과</h2>
                    {savedItemId && !hasUnsavedChanges && (
                      <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                        <CheckCircleIcon className="h-3.5 w-3.5" />
                        저장됨
                      </span>
                    )}
                    {hasUnsavedChanges && (
                      <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                        <PencilIcon className="h-3.5 w-3.5" />
                        미저장 변경사항
                      </span>
                    )}
                  </div>
                  <div className="flex gap-3 text-xs text-slate-400">
                    <span>글자수: {generatedResult.wordCount}자</span>
                    <span>키워드: {generatedResult.keywordCount}회</span>
                  </div>
                </div>

                {/* 저장 메시지 */}
                {saveMessage && (
                  <div className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm ${
                    saveMessage.type === 'success'
                      ? 'bg-green-50 text-green-700'
                      : 'bg-red-50 text-red-700'
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
                  <label className="block text-sm font-medium text-slate-500 mb-1.5">제목</label>
                  <input
                    type="text"
                    value={editedTitle}
                    onChange={(e) => {
                      setEditedTitle(e.target.value)
                      setHasUnsavedChanges(true)
                    }}
                    className="w-full text-lg font-bold text-slate-800 border border-slate-200 rounded-lg px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 bg-slate-50/50"
                  />
                </div>

                {/* 본문 (WYSIWYG 에디터) */}
                <div>
                  <label className="block text-sm font-medium text-slate-500 mb-2">본문</label>
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
                  <label className="block text-sm font-medium text-slate-500 mb-2">해시태그</label>
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
                <div className="flex gap-3 pt-2">
                  {savedItemId && hasUnsavedChanges && (
                    <button
                      onClick={handleSaveDraft}
                      disabled={isSavingDraft}
                      className="flex items-center justify-center gap-2 px-4 py-2 border border-blue-300 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors text-sm font-medium disabled:opacity-60"
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
                  <button
                    onClick={handleSchedule}
                    disabled={isScheduling || !generatedResult}
                    className="flex-1 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors text-sm font-medium flex items-center justify-center gap-2"
                  >
                    {isScheduling ? (
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    ) : (
                      <DocumentCheckIcon className="h-4 w-4" />
                    )}
                    발행 예약
                  </button>
                </div>
              </div>
            )}
          </div>
        </main>
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
          <p key={key++} className="text-sm leading-7 text-slate-700 mb-3">
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
              className="w-full rounded-xl border border-slate-200 shadow-sm"
            />
            <p className="text-xs text-slate-400 mt-1.5 text-center">{currentImage.fileName || prompt}</p>
          </div>
        )
      } else {
        elements.push(
          <div key={key++} className="my-4 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 flex flex-col items-center justify-center gap-2">
            <PhotoIcon className="h-10 w-10 text-slate-400" />
            <span className="text-xs text-slate-500 text-center">{prompt}</span>
            <span className="text-[10px] text-slate-400">이미지 생성에 실패했습니다</span>
          </div>
        )
      }
      continue
    }

    if (trimmed.startsWith('### ')) {
      flushParagraph()
      elements.push(
        <h4 key={key++} className="text-base font-semibold text-slate-800 mt-5 mb-2">
          {trimmed.replace(/^###\s+/, '')}
        </h4>
      )
      continue
    }

    if (trimmed.startsWith('## ')) {
      flushParagraph()
      elements.push(
        <h3 key={key++} className="text-lg font-bold text-slate-800 mt-6 mb-3 pb-2 border-b border-slate-200">
          {trimmed.replace(/^##\s+/, '')}
        </h3>
      )
      continue
    }

    if (/^[-─━]{3,}$/.test(trimmed)) {
      flushParagraph()
      elements.push(<hr key={key++} className="my-4 border-slate-200" />)
      continue
    }

    if (/^[-*]\s+/.test(trimmed)) {
      flushParagraph()
      elements.push(
        <div key={key++} className="flex gap-2 mb-1.5 ml-1">
          <span className="text-indigo-400 mt-1 text-xs">●</span>
          <span className="text-sm leading-6 text-slate-700 flex-1">
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
          <span className="text-sm leading-6 text-slate-700 flex-1">
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
      return <strong key={i} className="font-semibold text-slate-800">{part.slice(2, -2)}</strong>
    }
    return part
  })
}
