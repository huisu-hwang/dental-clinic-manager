'use client'

import { useState, useEffect, useCallback } from 'react'
import { ArrowPathIcon, DocumentTextIcon, DocumentArrowDownIcon } from '@heroicons/react/24/outline'

interface AnalysisItem {
  id: string
  keyword: string
  status: string
  analyzed_at: string
  created_at: string
}

interface ReportListItem {
  id: string
  title: string
  total_keywords: number
  total_posts: number
  generated_at: string
  created_at: string
}

interface ReportDetail {
  id: string
  title: string
  total_keywords: number
  total_posts: number
  report_content: {
    overview: string
    keywords: string[]
    quantitativeInsights: string
    qualitativeInsights: string
    commonPatterns: string[]
    recommendations: string[]
    aggregatedSummary: Record<string, { avg: number; median: number; min: number; max: number }>
  }
  generated_at: string
}

export default function SeoReport() {
  const [analyses, setAnalyses] = useState<AnalysisItem[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [title, setTitle] = useState('')
  const [loading, setLoading] = useState(false)
  const [reports, setReports] = useState<ReportListItem[]>([])
  const [selectedReport, setSelectedReport] = useState<ReportDetail | null>(null)

  const fetchAnalyses = useCallback(async () => {
    try {
      const res = await fetch('/api/seo/analyze')
      const data = await res.json()
      if (data.success) {
        setAnalyses((data.analyses || []).filter((a: AnalysisItem) => a.status === 'completed'))
      }
    } catch (err) {
      console.error('분석 목록 조회 실패:', err)
    }
  }, [])

  const fetchReports = useCallback(async () => {
    try {
      const res = await fetch('/api/seo/report')
      const data = await res.json()
      if (data.success) setReports(data.reports || [])
    } catch (err) {
      console.error('보고서 목록 조회 실패:', err)
    }
  }, [])

  useEffect(() => {
    fetchAnalyses()
    fetchReports()
  }, [fetchAnalyses, fetchReports])

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const generateReport = async () => {
    if (selectedIds.size === 0) return

    setLoading(true)
    try {
      const res = await fetch('/api/seo/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          analysisIds: Array.from(selectedIds),
          title: title.trim() || undefined,
        }),
      })
      const data = await res.json()

      if (data.success && data.report) {
        setSelectedReport(data.report)
        fetchReports()
        setSelectedIds(new Set())
        setTitle('')
      } else {
        alert(data.error || '보고서 생성 실패')
      }
    } catch (err) {
      console.error('보고서 생성 실패:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadReport = async (reportId: string) => {
    try {
      const res = await fetch(`/api/seo/report?reportId=${reportId}`)
      const data = await res.json()
      if (data.success && data.report) {
        setSelectedReport(data.report)
      }
    } catch (err) {
      console.error('보고서 조회 실패:', err)
    }
  }

  return (
    <div className="space-y-6">
      {/* 보고서 생성 */}
      <div className="bg-white rounded-lg border p-4 space-y-4">
        <h3 className="text-lg font-semibold">종합 보고서 생성</h3>

        <div>
          <label className="block text-sm font-medium text-at-text-secondary mb-1">보고서 제목 (선택)</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: 3월 치과 키워드 SEO 분석 보고서"
            className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-at-accent"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-at-text-secondary mb-2">포함할 분석 결과 선택</label>
          {analyses.length === 0 ? (
            <p className="text-at-text-weak text-sm">완료된 분석 결과가 없습니다. 먼저 키워드 분석을 실행하세요.</p>
          ) : (
            <div className="space-y-1 max-h-60 overflow-y-auto border rounded-lg p-2">
              {analyses.map((a) => (
                <label
                  key={a.id}
                  className={`flex items-center gap-2 px-3 py-2 rounded cursor-pointer transition-colors ${
                    selectedIds.has(a.id) ? 'bg-at-accent-light border border-at-border' : 'hover:bg-at-surface-alt'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.has(a.id)}
                    onChange={() => toggleSelect(a.id)}
                    className="rounded border-at-border text-at-accent focus:ring-at-accent"
                  />
                  <span className="font-medium">{a.keyword}</span>
                  <span className="text-xs text-at-text-weak ml-auto">
                    {new Date(a.created_at).toLocaleDateString('ko-KR')}
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>

        <button
          onClick={generateReport}
          disabled={loading || selectedIds.size === 0}
          className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          {loading ? (
            <><ArrowPathIcon className="w-4 h-4 animate-spin" /> 생성중...</>
          ) : (
            <><DocumentTextIcon className="w-4 h-4" /> 보고서 생성 ({selectedIds.size}개 선택)</>
          )}
        </button>
      </div>

      {/* 보고서 히스토리 */}
      <div className="bg-white rounded-lg border p-4">
        <h4 className="font-semibold mb-3">보고서 히스토리</h4>
        {reports.length === 0 ? (
          <p className="text-at-text-weak text-sm">아직 보고서가 없습니다.</p>
        ) : (
          <div className="space-y-2">
            {reports.map((r) => (
              <button
                key={r.id}
                onClick={() => loadReport(r.id)}
                className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                  selectedReport?.id === r.id ? 'border-purple-500 bg-purple-50' : 'hover:bg-at-surface-alt'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <DocumentArrowDownIcon className="w-4 h-4 text-at-text-weak" />
                    <span className="font-medium">{r.title}</span>
                  </div>
                  <div className="text-xs text-at-text-weak">
                    {r.total_keywords}개 키워드 · {r.total_posts}개 글 · {new Date(r.created_at).toLocaleDateString('ko-KR')}
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 보고서 상세 */}
      {selectedReport && selectedReport.report_content && (
        <div className="bg-white rounded-lg border p-6 space-y-6">
          <div className="border-b pb-4">
            <h3 className="text-xl font-bold">{selectedReport.title}</h3>
            <p className="text-sm text-at-text-weak mt-1">
              생성일: {new Date(selectedReport.generated_at).toLocaleString('ko-KR')} ·
              {selectedReport.total_keywords}개 키워드 · {selectedReport.total_posts}개 글 분석
            </p>
          </div>

          {/* 개요 */}
          <div>
            <h4 className="font-semibold text-lg mb-2">개요</h4>
            <p className="text-at-text-secondary">{selectedReport.report_content.overview}</p>
            {selectedReport.report_content.keywords && (
              <div className="flex flex-wrap gap-1 mt-2">
                {selectedReport.report_content.keywords.map((kw, i) => (
                  <span key={i} className="px-2 py-0.5 bg-at-surface-alt text-at-text-secondary rounded-full text-xs">
                    {kw}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* 공통 패턴 */}
          {selectedReport.report_content.commonPatterns && selectedReport.report_content.commonPatterns.length > 0 && (
            <div>
              <h4 className="font-semibold text-lg mb-2">상위 노출 공통 패턴</h4>
              <ul className="space-y-1">
                {selectedReport.report_content.commonPatterns.map((p, i) => (
                  <li key={i} className="flex items-start gap-2 text-at-text-secondary">
                    <span className="text-at-accent mt-0.5">•</span>
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 정량 인사이트 */}
          {selectedReport.report_content.quantitativeInsights && (
            <div>
              <h4 className="font-semibold text-lg mb-2">정량 지표 분석</h4>
              <div className="prose prose-sm max-w-none">
                <pre className="whitespace-pre-wrap text-sm bg-at-surface-alt p-4 rounded-lg">
                  {selectedReport.report_content.quantitativeInsights}
                </pre>
              </div>
            </div>
          )}

          {/* 정성 인사이트 */}
          {selectedReport.report_content.qualitativeInsights && (
            <div>
              <h4 className="font-semibold text-lg mb-2">정성 지표 분석</h4>
              <div className="prose prose-sm max-w-none">
                <pre className="whitespace-pre-wrap text-sm bg-at-surface-alt p-4 rounded-lg">
                  {selectedReport.report_content.qualitativeInsights}
                </pre>
              </div>
            </div>
          )}

          {/* 권장 사항 */}
          {selectedReport.report_content.recommendations && selectedReport.report_content.recommendations.length > 0 && (
            <div className="bg-at-success-bg border border-green-200 rounded-lg p-4">
              <h4 className="font-semibold text-lg mb-2 text-green-800">권장 사항</h4>
              <ol className="space-y-2">
                {selectedReport.report_content.recommendations.map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-green-800">
                    <span className="font-bold text-at-success min-w-[20px]">{i + 1}.</span>
                    {r}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
