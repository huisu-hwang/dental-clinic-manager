'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/navigation'
import {
  ArrowLeftIcon,
  SparklesIcon,
  DocumentCheckIcon,
  PhotoIcon,
} from '@heroicons/react/24/outline'
import {
  TONE_LABELS,
  POST_TYPE_LABELS,
  DEFAULT_PLATFORM_PRESETS,
  type PostType,
  type ToneType,
  type PlatformOptions,
  type GeneratedContent,
  type ImageMarker,
} from '@/types/marketing'
import Header from '@/components/Layout/Header'
import TabNavigation from '@/components/Layout/TabNavigation'
import { getTabRoute } from '@/utils/tabRouting'

export default function NewMarketingPostPage() {
  const { user, logout, loading } = useAuth()
  const router = useRouter()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  const [topic, setTopic] = useState('')
  const [keyword, setKeyword] = useState('')
  const [postType, setPostType] = useState<PostType>('informational')
  const [tone, setTone] = useState<ToneType>('friendly')
  const [useResearch, setUseResearch] = useState(false)
  const [factCheck, setFactCheck] = useState(false)
  const [platforms, setPlatforms] = useState<PlatformOptions>(DEFAULT_PLATFORM_PRESETS.informational)

  const [isGenerating, setIsGenerating] = useState(false)
  const [generatedResult, setGeneratedResult] = useState<GeneratedContent | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!loading && !user) {
      router.push('/auth')
    }
  }, [user, loading, router])

  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isMobileMenuOpen])

  const handleMainTabChange = (tab: string) => {
    if (tab === 'marketing') return
    router.push(getTabRoute(tab))
  }

  // 글 유형 변경 시 기본 플랫폼 프리셋 적용
  const handlePostTypeChange = (type: PostType) => {
    setPostType(type)
    setPlatforms(DEFAULT_PLATFORM_PRESETS[type])
  }

  // AI 글 생성
  const handleGenerate = async () => {
    if (!topic || !keyword) {
      setError('주제와 키워드를 입력해주세요.')
      return
    }

    setIsGenerating(true)
    setError('')
    setGeneratedResult(null)

    try {
      const res = await fetch('/api/marketing/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic,
          keyword,
          postType,
          tone,
          useResearch,
          factCheck,
          platforms,
        }),
      })

      const json = await res.json()
      if (!res.ok) throw new Error(json.error || '글 생성 실패')

      setGeneratedResult(json.data)
    } catch (err) {
      setError(err instanceof Error ? err.message : '글 생성 중 오류가 발생했습니다.')
    } finally {
      setIsGenerating(false)
    }
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
      {/* Header - 상단 고정 */}
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

      {/* 모바일 메뉴 오버레이 */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* 좌측 사이드바 */}
      <aside
        className={`
          fixed top-14 w-64 lg:w-56 h-[calc(100vh-3.5rem)] bg-white border-r border-slate-200 z-20 overflow-y-auto py-3 px-3
          transition-transform duration-300 ease-in-out
          lg:left-[max(0px,calc(50%-700px))]
          ${isMobileMenuOpen ? 'translate-x-0 left-0' : '-translate-x-full left-0 lg:translate-x-0'}
        `}
      >
        <TabNavigation
          activeTab="marketing"
          onTabChange={handleMainTabChange}
        />
      </aside>

      {/* 메인 콘텐츠 */}
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

            {/* 생성 버튼 */}
            <button
              onClick={handleGenerate}
              disabled={isGenerating || !topic || !keyword}
              className="w-full py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {isGenerating ? (
                <>
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  AI가 글을 생성하고 있습니다...
                </>
              ) : (
                <>
                  <SparklesIcon className="h-5 w-5" />
                  AI 글 생성
                </>
              )}
            </button>

            {/* 생성 결과 미리보기 */}
            {generatedResult && (
              <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-semibold text-slate-800">생성 결과</h2>
                  <div className="flex gap-3 text-xs text-slate-400">
                    <span>글자수: {generatedResult.wordCount}자</span>
                    <span>키워드: {generatedResult.keywordCount}회</span>
                  </div>
                </div>

                <div>
                  <div className="text-sm font-medium text-slate-500 mb-1">제목</div>
                  <div className="text-xl font-bold text-slate-800 border-b border-slate-200 pb-3">
                    {generatedResult.title}
                  </div>
                </div>

                <div>
                  <div className="text-sm font-medium text-slate-500 mb-2">본문</div>
                  <div className="border border-slate-100 rounded-lg p-5 max-h-[600px] overflow-y-auto bg-slate-50/30">
                    <RenderedBody body={generatedResult.body} />
                  </div>
                </div>

                {/* 해시태그 */}
                {generatedResult.hashtags && generatedResult.hashtags.length > 0 && (
                  <div>
                    <div className="text-sm font-medium text-slate-500 mb-2">해시태그</div>
                    <div className="flex flex-wrap gap-2">
                      {generatedResult.hashtags.map((tag, i) => (
                        <span key={i} className="px-2.5 py-1 bg-indigo-50 text-indigo-600 text-xs rounded-full font-medium">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    onClick={handleGenerate}
                    className="flex-1 py-2 border border-slate-300 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors text-sm font-medium"
                  >
                    다시 생성
                  </button>
                  <button className="flex-1 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium flex items-center justify-center gap-2">
                    <DocumentCheckIcon className="h-4 w-4" />
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

// ─── 본문 렌더러: 마크다운 구조 + 이미지 마커 표시 ───

function RenderedBody({ body }: { body: string }) {
  const lines = body.split('\n')
  const elements: React.ReactNode[] = []
  let paragraphBuffer: string[] = []
  let key = 0

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

    // [IMAGE: ...] 마커 → 이미지 플레이스홀더
    if (/\[IMAGE:\s*.+?\]/.test(trimmed)) {
      flushParagraph()
      const match = trimmed.match(/\[IMAGE:\s*(.+?)\]/)
      const prompt = match ? match[1] : ''
      elements.push(
        <div key={key++} className="my-4 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-6 flex flex-col items-center justify-center gap-2">
          <PhotoIcon className="h-10 w-10 text-slate-400" />
          <span className="text-xs text-slate-500 text-center">{prompt}</span>
          <span className="text-[10px] text-slate-400">발행 시 AI 이미지가 자동 생성됩니다</span>
        </div>
      )
      continue
    }

    // ### 소소제목
    if (trimmed.startsWith('### ')) {
      flushParagraph()
      elements.push(
        <h4 key={key++} className="text-base font-semibold text-slate-800 mt-5 mb-2">
          {trimmed.replace(/^###\s+/, '')}
        </h4>
      )
      continue
    }

    // ## 소제목
    if (trimmed.startsWith('## ')) {
      flushParagraph()
      elements.push(
        <h3 key={key++} className="text-lg font-bold text-slate-800 mt-6 mb-3 pb-2 border-b border-slate-200">
          {trimmed.replace(/^##\s+/, '')}
        </h3>
      )
      continue
    }

    // 구분선
    if (/^[-─━]{3,}$/.test(trimmed)) {
      flushParagraph()
      elements.push(<hr key={key++} className="my-4 border-slate-200" />)
      continue
    }

    // 리스트 항목 (- 또는 *)
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

    // 숫자 리스트 (1. 2. 등)
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

    // 빈 줄 → 단락 구분
    if (!trimmed) {
      flushParagraph()
      continue
    }

    // 일반 텍스트 → 단락 버퍼에 추가
    paragraphBuffer.push(line)
  }

  flushParagraph()

  return <div>{elements}</div>
}

// ─── 인라인 서식 (볼드, 이탤릭) ───

function renderInlineFormatting(text: string): React.ReactNode {
  // **볼드** 처리
  const parts = text.split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="font-semibold text-slate-800">{part.slice(2, -2)}</strong>
    }
    return part
  })
}
