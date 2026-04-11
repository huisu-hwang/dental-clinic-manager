'use client'

import { useState, useEffect, useCallback } from 'react'
import { ArrowPathIcon, ScaleIcon, ExclamationTriangleIcon, CheckCircleIcon } from '@heroicons/react/24/outline'

interface CompareListItem {
  id: string
  keyword: string
  my_post_url: string
  overall_score: number
  analyzed_at: string
  created_at: string
}

interface GapItem {
  category: string
  item: string
  myValue: string | number
  competitorAvg: string | number
  gap: string
  priority: 'critical' | 'high' | 'medium' | 'low'
  suggestion: string
}

interface CompareDetail {
  id: string
  keyword: string
  my_post_url: string
  my_post_data: Record<string, unknown>
  gaps: GapItem[]
  overall_score: number
}

const PRIORITY_STYLES: Record<string, { label: string; color: string; icon: string }> = {
  critical: { label: '심각', color: 'bg-at-error-bg text-at-error border-red-200', icon: '🔴' },
  high: { label: '높음', color: 'bg-orange-100 text-orange-700 border-orange-200', icon: '🟠' },
  medium: { label: '보통', color: 'bg-yellow-100 text-yellow-700 border-yellow-200', icon: '🟡' },
  low: { label: '낮음', color: 'bg-at-success-bg text-at-success border-green-200', icon: '🟢' },
}

export default function CompetitorCompare() {
  const [keyword, setKeyword] = useState('')
  const [myPostUrl, setMyPostUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<CompareListItem[]>([])
  const [selectedResult, setSelectedResult] = useState<CompareDetail | null>(null)
  const [pollingJobId, setPollingJobId] = useState<string | null>(null)

  const fetchResults = useCallback(async () => {
    try {
      const res = await fetch('/api/seo/compare')
      const data = await res.json()
      if (data.success) setResults(data.results || [])
    } catch (err) {
      console.error('비교 목록 조회 실패:', err)
    }
  }, [])

  useEffect(() => {
    fetchResults()
  }, [fetchResults])

  // 잡 폴링
  useEffect(() => {
    if (!pollingJobId) return

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/seo/compare?jobId=${pollingJobId}`)
        const data = await res.json()
        if (data.success) {
          if (data.job?.status === 'completed') {
            setPollingJobId(null)
            setLoading(false)
            fetchResults()
            if (data.compareResult) {
              setSelectedResult(data.compareResult)
            }
          } else if (data.job?.status === 'failed') {
            setPollingJobId(null)
            setLoading(false)
            alert(`비교 분석 실패: ${data.job.error_message || '알 수 없는 오류'}`)
          }
        }
      } catch (err) {
        console.error('폴링 오류:', err)
      }
    }, 3000)

    return () => clearInterval(interval)
  }, [pollingJobId, fetchResults])

  const startCompare = async () => {
    if (!keyword.trim() || !myPostUrl.trim()) return

    setLoading(true)
    try {
      const res = await fetch('/api/seo/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keyword: keyword.trim(), myPostUrl: myPostUrl.trim() }),
      })
      const data = await res.json()

      if (data.success) {
        setPollingJobId(data.jobId)
      } else {
        setLoading(false)
        alert(data.error || '비교 요청 실패')
      }
    } catch (err) {
      setLoading(false)
      console.error('비교 요청 실패:', err)
    }
  }

  const loadDetail = async (compareId: string) => {
    try {
      const res = await fetch(`/api/seo/compare?compareId=${compareId}`)
      const data = await res.json()
      if (data.success && data.result) {
        setSelectedResult(data.result)
      }
    } catch (err) {
      console.error('비교 상세 조회 실패:', err)
    }
  }

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-at-success'
    if (score >= 60) return 'text-at-warning'
    if (score >= 40) return 'text-orange-600'
    return 'text-at-error'
  }

  return (
    <div className="space-y-6">
      {/* 입력 영역 */}
      <div className="bg-white rounded-lg border p-4 space-y-4">
        <h3 className="text-lg font-semibold">경쟁 블로그 비교</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-at-text-secondary mb-1">키워드</label>
            <input
              type="text"
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="검색 키워드"
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-at-accent"
              disabled={loading}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-at-text-secondary mb-1">내 블로그 글 URL</label>
            <input
              type="text"
              value={myPostUrl}
              onChange={(e) => setMyPostUrl(e.target.value)}
              placeholder="https://blog.naver.com/..."
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-at-accent"
              disabled={loading}
            />
          </div>
        </div>
        <button
          onClick={startCompare}
          disabled={loading || !keyword.trim() || !myPostUrl.trim()}
          className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {loading ? (
            <><ArrowPathIcon className="w-4 h-4 animate-spin" /> 분석중...</>
          ) : (
            <><ScaleIcon className="w-4 h-4" /> 비교 분석</>
          )}
        </button>

        {loading && (
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 text-sm text-indigo-700">
            상위 글 + 내 글 분석 → GAP 비교 진행 중... (약 2~5분 소요)
          </div>
        )}
      </div>

      {/* 비교 히스토리 */}
      <div className="bg-white rounded-lg border p-4">
        <h4 className="font-semibold mb-3">비교 히스토리</h4>
        {results.length === 0 ? (
          <p className="text-at-text-weak text-sm">아직 비교 결과가 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {results.map((r) => (
              <button
                key={r.id}
                onClick={() => loadDetail(r.id)}
                className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                  selectedResult?.id === r.id ? 'border-indigo-500 bg-indigo-50' : 'hover:bg-at-surface-alt'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium">{r.keyword}</span>
                    <span className="text-xs text-at-text-weak ml-2">{r.my_post_url}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-lg font-bold ${getScoreColor(r.overall_score)}`}>
                      {r.overall_score}점
                    </span>
                    <span className="text-xs text-at-text-weak">
                      {new Date(r.created_at).toLocaleDateString('ko-KR')}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 비교 결과 상세 */}
      {selectedResult && (
        <div className="space-y-4">
          {/* 종합 점수 */}
          <div className="bg-white rounded-lg border p-6 text-center">
            <h4 className="text-sm text-at-text-weak mb-2">종합 점수</h4>
            <div className={`text-5xl font-bold ${getScoreColor(selectedResult.overall_score)}`}>
              {selectedResult.overall_score}
              <span className="text-lg text-at-text-weak">/100</span>
            </div>
            <p className="text-sm text-at-text-weak mt-2">
              {selectedResult.overall_score >= 80 ? '경쟁력이 높습니다!' :
               selectedResult.overall_score >= 60 ? '개선 여지가 있습니다.' :
               selectedResult.overall_score >= 40 ? '상당한 개선이 필요합니다.' :
               '시급한 개선이 필요합니다.'}
            </p>
          </div>

          {/* GAP 목록 */}
          <div className="bg-white rounded-lg border p-4">
            <h4 className="font-semibold mb-3">개선 포인트 (GAP 분석)</h4>
            {selectedResult.gaps && selectedResult.gaps.length > 0 ? (
              <div className="space-y-3">
                {selectedResult.gaps.map((gap, idx) => {
                  const style = PRIORITY_STYLES[gap.priority] || PRIORITY_STYLES.medium
                  return (
                    <div key={idx} className={`border rounded-lg p-3 ${style.color}`}>
                      <div className="flex items-start gap-2">
                        <span className="text-lg">{style.icon}</span>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <span className="font-semibold">{gap.item}</span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-white bg-opacity-60">
                              {style.label}
                            </span>
                          </div>
                          <p className="text-sm mt-1">{gap.gap}</p>
                          <div className="flex gap-4 text-xs mt-1">
                            <span>내 값: <strong>{gap.myValue}</strong></span>
                            <span>경쟁 평균: <strong>{gap.competitorAvg}</strong></span>
                          </div>
                          <div className="mt-2 bg-white bg-opacity-50 rounded p-2 text-sm">
                            <CheckCircleIcon className="w-4 h-4 inline mr-1" />
                            {gap.suggestion}
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="text-center py-4 text-at-text-weak">
                <CheckCircleIcon className="w-8 h-8 mx-auto mb-2 text-green-500" />
                <p>모든 항목이 경쟁 수준 이상입니다!</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
