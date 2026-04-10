'use client'

import { useState, useEffect, useCallback } from 'react'
import { MagnifyingGlassIcon, ArrowPathIcon, ChartBarIcon } from '@heroicons/react/24/outline'
import { requireWorker } from '@/hooks/useWorkerGuard'
import { usePremiumFeatures } from '@/hooks/usePremiumFeatures'

interface AnalysisListItem {
  id: string
  keyword: string
  status: string
  analyzed_at: string
  summary: Record<string, unknown> | null
  created_at: string
}

interface AnalyzedPost {
  id: string
  rank: number
  post_url: string
  blog_name: string
  title: string
  title_length: number
  keyword_position: string
  body_length: number
  image_count: number
  has_video: boolean
  video_count: number
  keyword_count: number
  heading_count: number
  paragraph_count: number
  external_link_count: number
  internal_link_count: number
  comment_count: number
  like_count: number
  tag_count: number
  tags: string[]
  has_structure: boolean
  experience_level: string
  originality_level: string
  readability_level: string
  content_purpose: string
  image_quality: string
  has_cta: boolean
  tone: string
  has_ad_disclosure: boolean
  multimedia_level: string
}

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  pending: { label: '대기중', color: 'bg-gray-100 text-gray-700' },
  collecting: { label: '수집중', color: 'bg-blue-100 text-blue-700' },
  analyzing_quantitative: { label: '정량 분석중', color: 'bg-indigo-100 text-indigo-700' },
  analyzing_qualitative: { label: '정성 분석중', color: 'bg-purple-100 text-purple-700' },
  completed: { label: '완료', color: 'bg-green-100 text-green-700' },
  failed: { label: '실패', color: 'bg-red-100 text-red-700' },
}

const LEVEL_LABELS: Record<string, string> = {
  high: '상', medium: '중', low: '하',
  front: '앞', middle: '중간', end: '뒤', none: '없음',
  info: '정보제공', review: '후기/리뷰', ad: '광고',
  original: '직접촬영', stock: '무료이미지', capture: '캡처', mixed: '혼합',
  casual: '친근체', informative: '정보전달', professional: '전문적',
}

export default function KeywordAnalysis() {
  // 마케팅 프리미엄 활성화 여부 — 비활성화 사용자는 워커 체크 수행하지 않음
  const { hasPremiumFeature } = usePremiumFeatures()
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(false)
  const [analyses, setAnalyses] = useState<AnalysisListItem[]>([])
  const [selectedAnalysis, setSelectedAnalysis] = useState<AnalysisListItem | null>(null)
  const [posts, setPosts] = useState<AnalyzedPost[]>([])
  const [loadingPosts, setLoadingPosts] = useState(false)
  const [pollingJobId, setPollingJobId] = useState<string | null>(null)
  const [workerOnline, setWorkerOnline] = useState(false)

  // 분석 목록 조회
  const fetchAnalyses = useCallback(async () => {
    try {
      const res = await fetch('/api/seo/analyze')
      const data = await res.json()
      if (data.success) setAnalyses(data.analyses || [])
    } catch (err) {
      console.error('분석 목록 조회 실패:', err)
    }
  }, [])

  // 워커 상태 확인
  const checkWorkerStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/seo/worker')
      const data = await res.json()
      setWorkerOnline(data.isOnline || false)
    } catch {
      setWorkerOnline(false)
    }
  }, [])

  useEffect(() => {
    fetchAnalyses()
    checkWorkerStatus()
  }, [fetchAnalyses, checkWorkerStatus])

  // 잡 폴링
  useEffect(() => {
    if (!pollingJobId) return

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/seo/analyze?jobId=${pollingJobId}`)
        const data = await res.json()
        if (data.success) {
          if (data.job?.status === 'completed') {
            setPollingJobId(null)
            setLoading(false)
            fetchAnalyses()
            if (data.analysis) {
              loadAnalysisDetail(data.analysis.id)
            }
          } else if (data.job?.status === 'failed') {
            setPollingJobId(null)
            setLoading(false)
            fetchAnalyses()
            alert(`분석 실패: ${data.job.error_message || '알 수 없는 오류'}`)
          }
          // running/pending 상태면 계속 폴링
        }
      } catch (err) {
        console.error('폴링 오류:', err)
      }
    }, 3000)

    return () => clearInterval(interval)
  }, [pollingJobId, fetchAnalyses])

  // 분석 시작
  const startAnalysis = async () => {
    if (!keyword.trim()) return
    if (!hasPremiumFeature('marketing')) {
      alert('마케팅 자동화 프리미엄 기능이 활성화되어 있지 않습니다.')
      return
    }
    if (!await requireWorker('seo', 'SEO 키워드 분석')) return

    setLoading(true)
    try {
      const res = await fetch('/api/seo/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: keyword.trim() }),
      })
      const data = await res.json()

      if (data.success) {
        if (data.cached) {
          // 캐시된 결과
          setLoading(false)
          loadAnalysisDetail(data.analysisId)
          fetchAnalyses()
        } else if (data.inProgress) {
          // 이미 진행중 → 폴링 시작은 하지 않음
          setLoading(false)
          alert('이미 분석이 진행 중입니다.')
        } else {
          // 새 잡 생성 → 폴링 시작
          setPollingJobId(data.jobId)
        }
      } else {
        setLoading(false)
        alert(data.error || '분석 요청 실패')
      }
    } catch (err) {
      setLoading(false)
      console.error('분석 요청 실패:', err)
    }
  }

  // 분석 상세 조회
  const loadAnalysisDetail = async (analysisId: string) => {
    setLoadingPosts(true)
    try {
      const res = await fetch(`/api/seo/analyze?analysisId=${analysisId}`)
      const data = await res.json()
      if (data.success) {
        setSelectedAnalysis(data.analysis)
        setPosts(data.posts || [])
      }
    } catch (err) {
      console.error('분석 상세 조회 실패:', err)
    } finally {
      setLoadingPosts(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* 워커 상태 + 검색 입력 */}
      <div className="bg-white rounded-lg border p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">키워드 분석</h3>
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${workerOnline ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
              <span className={`w-2 h-2 rounded-full ${workerOnline ? 'bg-green-500' : 'bg-red-500'}`} />
              SEO 워커 {workerOnline ? '온라인' : '오프라인'}
            </span>
            <button onClick={() => { fetchAnalyses(); checkWorkerStatus(); }} className="p-1 hover:bg-gray-100 rounded">
              <ArrowPathIcon className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="flex gap-2">
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && startAnalysis()}
            placeholder="분석할 키워드를 입력하세요"
            className="flex-1 px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            disabled={loading}
          />
          <button
            onClick={startAnalysis}
            disabled={loading || !keyword.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {loading ? (
              <><ArrowPathIcon className="w-4 h-4 animate-spin" /> 분석중...</>
            ) : (
              <><MagnifyingGlassIcon className="w-4 h-4" /> 분석 시작</>
            )}
          </button>
        </div>

        {loading && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
            네이버 블로그 검색 → 상위 5개 글 수집 → 정량/정성 분석 진행 중... (약 1~3분 소요)
          </div>
        )}
      </div>

      {/* 분석 히스토리 */}
      <div className="bg-white rounded-lg border p-4">
        <h4 className="font-semibold mb-3">분석 히스토리</h4>
        {analyses.length === 0 ? (
          <p className="text-gray-500 text-sm">아직 분석 결과가 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {analyses.map((a) => (
              <button
                key={a.id}
                onClick={() => loadAnalysisDetail(a.id)}
                className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                  selectedAnalysis?.id === a.id ? 'border-blue-500 bg-blue-50' : 'hover:bg-gray-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ChartBarIcon className="w-4 h-4 text-gray-400" />
                    <span className="font-medium">{a.keyword}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_LABELS[a.status]?.color || 'bg-gray-100'}`}>
                      {STATUS_LABELS[a.status]?.label || a.status}
                    </span>
                    <span className="text-xs text-gray-500">
                      {new Date(a.created_at).toLocaleDateString('ko-KR')}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 분석 결과 상세 */}
      {selectedAnalysis && selectedAnalysis.status === 'completed' && (
        <div className="space-y-4">
          {loadingPosts ? (
            <div className="bg-white rounded-lg border p-8 text-center text-gray-500">
              <ArrowPathIcon className="w-6 h-6 animate-spin mx-auto mb-2" />
              결과 로딩중...
            </div>
          ) : (
            <>
              {/* 상위 5개 글 카드 */}
              <div className="bg-white rounded-lg border p-4">
                <h4 className="font-semibold mb-3">상위 {posts.length}개 글</h4>
                <div className="space-y-3">
                  {posts.map((post) => (
                    <div key={post.id} className="border rounded-lg p-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded text-xs font-bold">#{post.rank}</span>
                            <a href={post.post_url} target="_blank" rel="noopener noreferrer" className="font-medium text-blue-600 hover:underline line-clamp-1">
                              {post.title}
                            </a>
                          </div>
                          <p className="text-xs text-gray-500">{post.blog_name}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 정량 분석 테이블 */}
              <div className="bg-white rounded-lg border p-4 overflow-x-auto">
                <h4 className="font-semibold mb-3">정량 분석 (13개 항목)</h4>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="text-left p-2">항목</th>
                      {posts.map((p) => (
                        <th key={p.id} className="text-center p-2 min-w-[80px]">#{p.rank}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { label: '제목 글자수', key: 'title_length' },
                      { label: '키워드 위치', key: 'keyword_position', isLabel: true },
                      { label: '본문 글자수', key: 'body_length' },
                      { label: '이미지 수', key: 'image_count' },
                      { label: '동영상', key: 'has_video', isBool: true },
                      { label: '키워드 반복', key: 'keyword_count' },
                      { label: '소제목 수', key: 'heading_count' },
                      { label: '문단 수', key: 'paragraph_count' },
                      { label: '외부 링크', key: 'external_link_count' },
                      { label: '내부 링크', key: 'internal_link_count' },
                      { label: '댓글 수', key: 'comment_count' },
                      { label: '공감 수', key: 'like_count' },
                      { label: '태그 수', key: 'tag_count' },
                    ].map((row) => (
                      <tr key={row.key} className="border-b hover:bg-gray-50">
                        <td className="p-2 font-medium text-gray-700">{row.label}</td>
                        {posts.map((p) => {
                          const val = (p as unknown as Record<string, unknown>)[row.key];
                          let display: string;
                          if (row.isBool) display = val ? 'O' : 'X';
                          else if (row.isLabel) display = LEVEL_LABELS[String(val)] || String(val);
                          else display = typeof val === 'number' ? val.toLocaleString() : String(val ?? '-');
                          return <td key={p.id} className="text-center p-2">{display}</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 정성 분석 테이블 */}
              <div className="bg-white rounded-lg border p-4 overflow-x-auto">
                <h4 className="font-semibold mb-3">정성 분석 (10개 항목)</h4>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50">
                      <th className="text-left p-2">항목</th>
                      {posts.map((p) => (
                        <th key={p.id} className="text-center p-2 min-w-[80px]">#{p.rank}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { label: '글 구조', key: 'has_structure', isBool: true },
                      { label: '경험/후기', key: 'experience_level', isLabel: true },
                      { label: '독창성', key: 'originality_level', isLabel: true },
                      { label: '가독성', key: 'readability_level', isLabel: true },
                      { label: '글 목적', key: 'content_purpose', isLabel: true },
                      { label: '이미지 품질', key: 'image_quality', isLabel: true },
                      { label: 'CTA', key: 'has_cta', isBool: true },
                      { label: '톤/어조', key: 'tone', isLabel: true },
                      { label: '광고 표시', key: 'has_ad_disclosure', isBool: true },
                      { label: '멀티미디어', key: 'multimedia_level', isLabel: true },
                    ].map((row) => (
                      <tr key={row.key} className="border-b hover:bg-gray-50">
                        <td className="p-2 font-medium text-gray-700">{row.label}</td>
                        {posts.map((p) => {
                          const val = (p as unknown as Record<string, unknown>)[row.key];
                          let display: string;
                          if (row.isBool) display = val ? 'O' : 'X';
                          else if (row.isLabel) display = LEVEL_LABELS[String(val)] || String(val);
                          else display = String(val ?? '-');
                          return <td key={p.id} className="text-center p-2">{display}</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* 텍스트 마이닝 - 공통 반복 키워드 */}
              {selectedAnalysis.summary && (selectedAnalysis.summary as Record<string, unknown>).textMining && (
                <TextMiningSection
                  textMining={(selectedAnalysis.summary as Record<string, unknown>).textMining as TextMiningData}
                  posts={posts}
                />
              )}

              {/* 통계 요약 */}
              {selectedAnalysis.summary && (
                <div className="bg-white rounded-lg border p-4">
                  <h4 className="font-semibold mb-3">통계 요약</h4>
                  <AnalysisSummaryView summary={selectedAnalysis.summary as Record<string, unknown>} />
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

// ─── 텍스트 마이닝 타입 ───

interface TextMiningKeyword {
  keyword: string
  frequency: number
  postCount: number
  perPostFrequency?: number[]
}

interface TextMiningData {
  competitorKeywords: TextMiningKeyword[]
  recommendedKeywords: string[]
  avgBodyLength: number
  avgImageCount: number
  avgHeadingCount: number
  avgKeywordCount: number
  commonTags: string[]
  titlePatterns: string[]
}

// ─── 텍스트 마이닝 섹션 ───

function TextMiningSection({ textMining, posts }: { textMining: TextMiningData; posts: AnalyzedPost[] }) {
  const keywords = textMining.competitorKeywords || []
  if (keywords.length === 0) return null

  const maxFreq = keywords[0]?.frequency || 1

  return (
    <div className="bg-white rounded-lg border p-4 space-y-6">
      <h4 className="font-semibold text-lg">텍스트 마이닝 - 공통 반복 키워드</h4>

      {/* 키워드 히트맵 테이블 */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-gray-50">
              <th className="text-left p-2 w-8">#</th>
              <th className="text-left p-2">키워드</th>
              <th className="text-center p-2">총 빈도</th>
              <th className="text-center p-2">출현 글 수</th>
              {posts.map((p) => (
                <th key={p.id} className="text-center p-2 min-w-[50px]">#{p.rank}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {keywords.map((kw, idx) => (
              <tr key={kw.keyword} className="border-b hover:bg-gray-50">
                <td className="p-2 text-gray-400">{idx + 1}</td>
                <td className="p-2 font-medium">{kw.keyword}</td>
                <td className="text-center p-2 font-semibold text-blue-700">{kw.frequency}</td>
                <td className="text-center p-2">
                  <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-medium">
                    {kw.postCount}/{posts.length}
                  </span>
                </td>
                {(kw.perPostFrequency || []).map((freq, i) => (
                  <td key={i} className="text-center p-2">
                    <span className={`inline-block min-w-[28px] px-1.5 py-0.5 rounded text-xs font-medium ${
                      freq === 0 ? 'bg-gray-100 text-gray-400' :
                      freq <= 3 ? 'bg-blue-100 text-blue-700' :
                      freq <= 7 ? 'bg-blue-200 text-blue-800' :
                      freq <= 15 ? 'bg-blue-300 text-blue-900' :
                      'bg-blue-500 text-white'
                    }`}>
                      {freq}
                    </span>
                  </td>
                ))}
                {/* perPostFrequency가 없는 경우 빈 셀 */}
                {(!kw.perPostFrequency || kw.perPostFrequency.length === 0) && posts.map((p) => (
                  <td key={p.id} className="text-center p-2 text-gray-300">-</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 키워드 빈도 막대 그래프 (상위 10개) */}
      <div>
        <h5 className="text-sm font-semibold text-gray-600 mb-3">키워드 빈도 분포 (상위 10개)</h5>
        <div className="space-y-2">
          {keywords.slice(0, 10).map((kw) => {
            const widthPercent = Math.max((kw.frequency / maxFreq) * 100, 2)
            return (
              <div key={kw.keyword} className="flex items-center gap-2">
                <span className="w-28 text-sm truncate text-right text-gray-700">{kw.keyword}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-blue-400 to-blue-600 rounded-full h-5 flex items-center justify-end pr-2 transition-all"
                    style={{ width: `${widthPercent}%` }}
                  >
                    {widthPercent > 15 && (
                      <span className="text-white text-xs font-medium">{kw.frequency}</span>
                    )}
                  </div>
                </div>
                {widthPercent <= 15 && (
                  <span className="text-xs text-gray-500 w-8">{kw.frequency}</span>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* 공통 태그 */}
      {textMining.commonTags && textMining.commonTags.length > 0 && (
        <div>
          <h5 className="text-sm font-semibold text-gray-600 mb-2">공통 태그</h5>
          <div className="flex flex-wrap gap-1.5">
            {textMining.commonTags.map((tag) => (
              <span key={tag} className="px-2.5 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                #{tag}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* 제목 패턴 */}
      {textMining.titlePatterns && textMining.titlePatterns.length > 0 && (
        <div>
          <h5 className="text-sm font-semibold text-gray-600 mb-2">상위 글 제목 패턴</h5>
          <div className="space-y-1">
            {textMining.titlePatterns.map((title, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span className="text-gray-400 w-6 text-right">#{i + 1}</span>
                <span className="text-gray-700">{title}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 경쟁 글 통계 요약 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-blue-50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-blue-700">{textMining.avgBodyLength.toLocaleString()}</div>
          <div className="text-xs text-blue-600">평균 본문 길이(자)</div>
        </div>
        <div className="bg-indigo-50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-indigo-700">{textMining.avgImageCount}</div>
          <div className="text-xs text-indigo-600">평균 이미지 수</div>
        </div>
        <div className="bg-purple-50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-purple-700">{textMining.avgHeadingCount}</div>
          <div className="text-xs text-purple-600">평균 소제목 수</div>
        </div>
        <div className="bg-violet-50 rounded-lg p-3 text-center">
          <div className="text-2xl font-bold text-violet-700">{textMining.avgKeywordCount}</div>
          <div className="text-xs text-violet-600">평균 키워드 반복</div>
        </div>
      </div>
    </div>
  )
}

// ─── 통계 요약 뷰 ───

function AnalysisSummaryView({ summary }: { summary: Record<string, unknown> }) {
  const quant = summary.quantitative as Record<string, { avg: number; median: number; min: number; max: number }> | undefined
  if (!quant) return null

  const fieldNames: Record<string, string> = {
    titleLength: '제목 글자수', bodyLength: '본문 글자수', imageCount: '이미지 수',
    videoCount: '동영상 수', keywordCount: '키워드 반복', headingCount: '소제목 수',
    paragraphCount: '문단 수', externalLinkCount: '외부 링크', internalLinkCount: '내부 링크',
    commentCount: '댓글 수', likeCount: '공감 수', tagCount: '태그 수',
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-gray-50">
            <th className="text-left p-2">항목</th>
            <th className="text-center p-2">평균</th>
            <th className="text-center p-2">중앙값</th>
            <th className="text-center p-2">최소</th>
            <th className="text-center p-2">최대</th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(quant).map(([key, stats]) => (
            <tr key={key} className="border-b">
              <td className="p-2 font-medium">{fieldNames[key] || key}</td>
              <td className="text-center p-2">{stats.avg?.toLocaleString()}</td>
              <td className="text-center p-2">{stats.median?.toLocaleString()}</td>
              <td className="text-center p-2">{stats.min?.toLocaleString()}</td>
              <td className="text-center p-2">{stats.max?.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
