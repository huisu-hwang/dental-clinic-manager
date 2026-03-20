'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import {
  ArrowLeftIcon,
  SparklesIcon,
  BeakerIcon,
  ClockIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  PhotoIcon,
} from '@heroicons/react/24/outline'
import type { MarketingPrompt, PromptCategory } from '@/types/marketing'

type GeneratedImage = {
  fileName: string
  prompt: string
  path: string
}

type TestResult = {
  category: PromptCategory
  // content/transform/quality
  title?: string
  body?: string
  wordCount?: number
  keywordCount?: number
  hashtags?: string[]
  // images (content + image category)
  images?: GeneratedImage[]
}

const CATEGORY_LABELS: Record<PromptCategory, string> = {
  content: '글 생성',
  image: '이미지 생성',
  transform: '플랫폼 변환',
  quality: '품질 검증',
}

// body 텍스트를 [IMAGE: ...] 마커 기준으로 분리
function parseBodySegments(body: string, images: GeneratedImage[]) {
  const parts: Array<{ type: 'text' | 'image'; text?: string; image?: GeneratedImage; prompt?: string }> = []
  const imageRegex = /\[IMAGE:\s*(.+?)\]/g
  let lastIndex = 0
  let match
  let imageIdx = 0

  while ((match = imageRegex.exec(body)) !== null) {
    if (match.index > lastIndex) {
      parts.push({ type: 'text', text: body.slice(lastIndex, match.index) })
    }
    const prompt = match[1].trim()
    const img = images[imageIdx] || null
    parts.push({ type: 'image', image: img || undefined, prompt })
    imageIdx++
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < body.length) {
    parts.push({ type: 'text', text: body.slice(lastIndex) })
  }
  return parts
}

export default function PromptManagementPage() {
  const { user } = useAuth()
  const router = useRouter()

  const [activeCategory, setActiveCategory] = useState<PromptCategory>('content')
  const [prompts, setPrompts] = useState<MarketingPrompt[]>([])
  const [selectedPrompt, setSelectedPrompt] = useState<MarketingPrompt | null>(null)
  const [editedContent, setEditedContent] = useState('')
  const [changeNote, setChangeNote] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // 테스트 샌드박스
  const [showTest, setShowTest] = useState(false)
  const [testTopic, setTestTopic] = useState('')
  const [testKeyword, setTestKeyword] = useState('')
  const [testTone, setTestTone] = useState('friendly')
  const [testImagePrompt, setTestImagePrompt] = useState('')
  const [isTesting, setIsTesting] = useState(false)
  const [testResult, setTestResult] = useState<TestResult | null>(null)
  const [testError, setTestError] = useState<string | null>(null)

  // 권한 체크
  useEffect(() => {
    if (user && user.role !== 'master_admin' && user.role !== 'owner') {
      router.push('/dashboard')
    }
  }, [user, router])

  // 프롬프트 목록 로딩
  const loadPrompts = useCallback(async () => {
    try {
      const res = await fetch(`/api/marketing/prompts?category=${activeCategory}`)
      const json = await res.json()
      if (res.ok) {
        setPrompts(json.data || [])
        setSelectedPrompt(null)
        setEditedContent('')
      }
    } catch (err) {
      console.error('프롬프트 로딩 실패:', err)
    }
  }, [activeCategory])

  // user 객체 대신 user.id(string) 사용:
  // 테스트 실행 중 Supabase 토큰 갱신 시 user 객체 참조가 변경되면
  // loadPrompts()가 재실행되어 selectedPrompt가 초기화되는 버그 방지
  useEffect(() => {
    if (user?.id) loadPrompts()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, activeCategory, loadPrompts])

  // 프롬프트 선택
  const handleSelectPrompt = (prompt: MarketingPrompt) => {
    setSelectedPrompt(prompt)
    setEditedContent(prompt.system_prompt)
    setChangeNote('')
    setSaveMessage(null)
    setShowTest(false)
    setTestResult(null)
    setTestError(null)
  }

  // 프롬프트 저장
  const handleSave = async () => {
    if (!selectedPrompt || editedContent === selectedPrompt.system_prompt) return

    setIsSaving(true)
    setSaveMessage(null)

    try {
      const res = await fetch('/api/marketing/prompts', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          promptId: selectedPrompt.id,
          systemPrompt: editedContent,
          changeNote,
        }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error)

      setSaveMessage({ type: 'success', text: `v${json.data.version} 저장 완료` })
      await loadPrompts()
      setSelectedPrompt(json.data)
    } catch (err) {
      setSaveMessage({ type: 'error', text: err instanceof Error ? err.message : '저장 실패' })
    } finally {
      setIsSaving(false)
    }
  }

  // 프롬프트 테스트
  const handleTest = async () => {
    if (!selectedPrompt) return
    if (activeCategory === 'image' && !testImagePrompt) return
    if (activeCategory !== 'image' && (!testTopic || !testKeyword)) return

    setIsTesting(true)
    setTestResult(null)
    setTestError(null)

    try {
      const postType = selectedPrompt.prompt_key.includes('clinical') ? 'clinical'
        : selectedPrompt.prompt_key.includes('promotional') ? 'promotional'
        : 'informational'

      const res = await fetch('/api/marketing/prompts/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: testTopic,
          keyword: testKeyword,
          tone: testTone,
          postType,
          customSystemPrompt: editedContent,
          category: activeCategory,
          imagePrompt: testImagePrompt,
        }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error)

      setTestResult({
        category: json.data.category,
        title: json.data.title,
        body: json.data.body,
        wordCount: json.data.wordCount,
        keywordCount: json.data.keywordCount,
        hashtags: json.data.hashtags,
        images: json.data.images || [],
      })
    } catch (err) {
      setTestError(err instanceof Error ? err.message : '테스트 실패')
    } finally {
      setIsTesting(false)
    }
  }

  if (!user) return null

  return (
    <div className="min-h-screen bg-slate-50">
      {/* 헤더 */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center h-16 gap-4">
            <button onClick={() => router.back()} className="p-2 text-slate-400 hover:text-slate-600">
              <ArrowLeftIcon className="h-5 w-5" />
            </button>
            <SparklesIcon className="h-5 w-5 text-purple-600" />
            <h1 className="text-xl font-bold text-slate-800">프롬프트 관리</h1>
            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">마스터 전용</span>
          </div>
        </div>
      </div>

      {/* 카테고리 탭 */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <nav className="flex gap-1">
            {(Object.entries(CATEGORY_LABELS) as [PromptCategory, string][]).map(([key, label]) => (
              <button
                key={key}
                onClick={() => setActiveCategory(key)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeCategory === key
                    ? 'border-purple-600 text-purple-600'
                    : 'border-transparent text-slate-500 hover:text-slate-700'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="grid grid-cols-12 gap-6">
          {/* 좌측: 프롬프트 목록 */}
          <div className="col-span-4 space-y-2">
            {prompts.length === 0 ? (
              <div className="bg-white rounded-xl border border-slate-200 p-6 text-center text-slate-400 text-sm">
                프롬프트가 없습니다. 초기 시드 데이터를 삽입해주세요.
              </div>
            ) : (
              prompts.map((prompt) => (
                <button
                  key={prompt.id}
                  onClick={() => handleSelectPrompt(prompt)}
                  className={`w-full text-left p-4 rounded-xl border transition-colors ${
                    selectedPrompt?.id === prompt.id
                      ? 'bg-purple-50 border-purple-300'
                      : 'bg-white border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="font-medium text-sm text-slate-800">{prompt.name}</div>
                  <div className="text-xs text-slate-400 mt-1">
                    {prompt.prompt_key} | v{prompt.version}
                  </div>
                </button>
              ))
            )}
          </div>

          {/* 우측: 에디터 */}
          <div className="col-span-8">
            {selectedPrompt ? (
              <div className="space-y-4">
                {/* 프롬프트 정보 */}
                <div className="bg-white rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h3 className="font-semibold text-slate-800">{selectedPrompt.name}</h3>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {selectedPrompt.prompt_key} | 버전 {selectedPrompt.version} | 변수: {selectedPrompt.variables.join(', ')}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => { setShowTest(!showTest); setTestResult(null); setTestError(null) }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-300 rounded-lg text-slate-600 hover:bg-slate-50"
                      >
                        <BeakerIcon className="h-3.5 w-3.5" />
                        테스트
                      </button>
                      <button
                        onClick={handleSave}
                        disabled={isSaving || editedContent === selectedPrompt.system_prompt}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-slate-300 disabled:cursor-not-allowed"
                      >
                        {isSaving ? '저장중...' : '저장'}
                      </button>
                    </div>
                  </div>

                  {/* 변경 사유 */}
                  {editedContent !== selectedPrompt.system_prompt && (
                    <input
                      type="text"
                      value={changeNote}
                      onChange={(e) => setChangeNote(e.target.value)}
                      placeholder="변경 사유 (선택)"
                      className="w-full px-3 py-1.5 text-xs border border-slate-200 rounded-lg mb-3"
                    />
                  )}

                  {/* 저장 메시지 */}
                  {saveMessage && (
                    <div className={`flex items-center gap-2 text-xs p-2 rounded-lg mb-3 ${
                      saveMessage.type === 'success' ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'
                    }`}>
                      {saveMessage.type === 'success' ? <CheckCircleIcon className="h-4 w-4" /> : <ExclamationTriangleIcon className="h-4 w-4" />}
                      {saveMessage.text}
                    </div>
                  )}

                  {/* 에디터 */}
                  <textarea
                    value={editedContent}
                    onChange={(e) => setEditedContent(e.target.value)}
                    rows={20}
                    className="w-full px-4 py-3 text-sm font-mono border border-slate-200 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-purple-500 resize-y"
                    spellCheck={false}
                  />
                </div>

                {/* 테스트 샌드박스 */}
                {showTest && (
                  <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-4">
                    <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                      <BeakerIcon className="h-4 w-4 text-amber-500" />
                      프롬프트 테스트
                      <span className="text-xs font-normal text-slate-400 ml-1">
                        {editedContent !== selectedPrompt.system_prompt
                          ? '(편집 중인 미저장 버전으로 테스트)'
                          : '(저장된 버전으로 테스트)'}
                      </span>
                    </div>

                    {/* 카테고리별 입력 */}
                    {activeCategory === 'image' ? (
                      <input
                        type="text"
                        value={testImagePrompt}
                        onChange={(e) => setTestImagePrompt(e.target.value)}
                        placeholder="이미지 설명 (예: 임플란트 시술 과정을 보여주는 3D 일러스트)"
                        className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg"
                      />
                    ) : (
                      <div className="grid grid-cols-3 gap-3">
                        <input
                          type="text"
                          value={testTopic}
                          onChange={(e) => setTestTopic(e.target.value)}
                          placeholder="주제 (예: 임플란트 관리법)"
                          className="px-3 py-2 text-sm border border-slate-200 rounded-lg"
                        />
                        <input
                          type="text"
                          value={testKeyword}
                          onChange={(e) => setTestKeyword(e.target.value)}
                          placeholder="키워드 (예: 임플란트)"
                          className="px-3 py-2 text-sm border border-slate-200 rounded-lg"
                        />
                        <select
                          value={testTone}
                          onChange={(e) => setTestTone(e.target.value)}
                          className="px-3 py-2 text-sm border border-slate-200 rounded-lg"
                        >
                          <option value="friendly">친근체</option>
                          <option value="polite">정중체</option>
                          <option value="casual">구어체</option>
                          <option value="expert">전문가</option>
                          <option value="warm">공감체</option>
                        </select>
                      </div>
                    )}

                    <button
                      onClick={handleTest}
                      disabled={
                        isTesting ||
                        (activeCategory === 'image' ? !testImagePrompt : (!testTopic || !testKeyword))
                      }
                      className="w-full py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 disabled:bg-slate-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                      {isTesting ? (
                        <>
                          <ClockIcon className="h-4 w-4 animate-spin" />
                          {activeCategory === 'image' ? '이미지 생성 중... (30~60초 소요)' : '글 생성 중... (이미지 포함 시 1~2분 소요)'}
                        </>
                      ) : '테스트 실행'}
                    </button>

                    {/* 에러 */}
                    {testError && (
                      <div className="flex items-center gap-2 text-xs p-3 rounded-lg bg-red-50 text-red-600">
                        <ExclamationTriangleIcon className="h-4 w-4 flex-shrink-0" />
                        {testError}
                      </div>
                    )}

                    {/* 결과 */}
                    {testResult && (
                      <TestResultView result={testResult} />
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400">
                <SparklesIcon className="h-10 w-10 mx-auto mb-3" />
                <p className="text-sm">왼쪽에서 프롬프트를 선택하세요</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── 테스트 결과 컴포넌트 ───

function TestResultView({ result }: { result: TestResult }) {
  const images = result.images || []

  if (result.category === 'image') {
    return (
      <div className="border border-slate-200 rounded-lg p-4 space-y-3">
        <div className="text-xs font-medium text-slate-500">이미지 생성 결과</div>
        {images.length === 0 ? (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <PhotoIcon className="h-4 w-4" />
            이미지 생성에 실패했습니다.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {images.map((img, i) => (
              <ImageCard key={i} img={img} />
            ))}
          </div>
        )}
      </div>
    )
  }

  // content / transform / quality
  const bodySegments = result.body
    ? parseBodySegments(result.body, images)
    : []

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      {/* 통계 바 */}
      <div className="flex gap-4 px-4 py-2 bg-slate-50 border-b border-slate-200 text-xs text-slate-500">
        <span>글자수: <strong className="text-slate-700">{result.wordCount?.toLocaleString()}자</strong></span>
        <span>키워드: <strong className="text-slate-700">{result.keywordCount}회</strong></span>
        <span>이미지: <strong className="text-slate-700">{images.length}/{(result.body?.match(/\[IMAGE:/g) || []).length}장</strong></span>
        {(result.hashtags?.length ?? 0) > 0 && (
          <span>해시태그: <strong className="text-slate-700">{result.hashtags!.length}개</strong></span>
        )}
      </div>

      {/* 제목 */}
      {result.title && (
        <div className="px-4 py-3 border-b border-slate-200">
          <div className="text-xs text-slate-400 mb-1">제목</div>
          <div className="text-sm font-bold text-slate-800">{result.title}</div>
        </div>
      )}

      {/* 본문 (이미지 인라인 렌더링) */}
      <div className="px-4 py-3 max-h-[600px] overflow-y-auto space-y-3">
        {bodySegments.map((seg, i) => {
          if (seg.type === 'text') {
            return (
              <div key={i} className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                {seg.text}
              </div>
            )
          }
          // image segment
          return (
            <div key={i} className="my-2">
              {seg.image ? (
                <ImageCard img={seg.image} compact />
              ) : (
                <div className="flex items-center gap-2 px-3 py-2 bg-slate-100 rounded-lg text-xs text-slate-400">
                  <PhotoIcon className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate">[이미지 생성 실패] {seg.prompt}</span>
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* 해시태그 */}
      {(result.hashtags?.length ?? 0) > 0 && (
        <div className="px-4 py-3 border-t border-slate-200 flex flex-wrap gap-1.5">
          {result.hashtags!.map((tag, i) => (
            <span key={i} className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">
              #{tag}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}

function ImageCard({ img, compact }: { img: GeneratedImage; compact?: boolean }) {
  return (
    <div className={`rounded-lg overflow-hidden border border-slate-200 ${compact ? '' : ''}`}>
      <div className="relative bg-slate-100" style={{ paddingBottom: compact ? '56.25%' : '66.67%' }}>
        <Image
          src={img.path}
          alt={img.prompt}
          fill
          className="object-cover"
          unoptimized={img.path.startsWith('data:')}
        />
      </div>
      <div className="px-2 py-1.5 bg-white">
        <div className="text-xs text-slate-400 truncate">{img.fileName}</div>
        <div className="text-xs text-slate-500 mt-0.5 line-clamp-2">{img.prompt}</div>
      </div>
    </div>
  )
}
