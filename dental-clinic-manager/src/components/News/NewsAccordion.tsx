'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp, ExternalLink, Sparkles } from 'lucide-react'

interface NewsArticle {
  id: number
  title: string
  summary: string | null
  link: string
  category: string
  created_at: string
}

interface NewsAccordionProps {
  title: string
  icon?: React.ReactNode
  articles: NewsArticle[]
  loading?: boolean
  emptyMessage?: string
}

export default function NewsAccordion({
  title,
  icon,
  articles,
  loading = false,
  emptyMessage = '기사가 없습니다.'
}: NewsAccordionProps) {
  const [openId, setOpenId] = useState<number | null>(null)

  const toggle = (id: number) => {
    setOpenId(openId === id ? null : id)
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden h-fit">
        <div className="bg-slate-50 px-4 py-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            {icon}
            <h2 className="text-base font-bold text-slate-800">{title}</h2>
          </div>
        </div>
        <div className="p-6 flex justify-center">
          <div className="w-6 h-6 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden h-fit">
      {/* 헤더 */}
      <div className="bg-slate-50 px-4 py-3 border-b border-slate-100">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-base font-bold text-slate-800">{title}</h2>
          <span className="ml-auto text-xs text-slate-400">{articles.length}건</span>
        </div>
      </div>

      {/* 기사 목록 */}
      <div className="divide-y divide-slate-100">
        {articles.length === 0 ? (
          <p className="p-4 text-center text-slate-400 text-sm">{emptyMessage}</p>
        ) : (
          articles.map((article) => (
            <div key={article.id} className="group">
              {/* 기사 제목 버튼 */}
              <button
                onClick={() => toggle(article.id)}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-slate-50 transition-colors"
              >
                <span
                  className={`text-sm font-medium pr-3 line-clamp-2 ${
                    openId === article.id ? 'text-blue-600' : 'text-slate-700'
                  }`}
                >
                  {article.title}
                </span>
                {openId === article.id ? (
                  <ChevronUp className="w-4 h-4 text-blue-500 shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                )}
              </button>

              {/* AI 요약문 영역 (확장) */}
              {openId === article.id && (
                <div className="px-4 pb-4 pt-1 bg-slate-50/70">
                  {/* 요약 카드 */}
                  <div className="bg-white p-3 rounded-lg border border-slate-200 text-sm text-slate-600 leading-relaxed mb-3">
                    <div className="flex items-center gap-1.5 mb-2">
                      <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                      <span className="font-bold text-slate-800 text-xs">AI 요약</span>
                    </div>
                    <p className="text-slate-600">
                      {article.summary || '요약을 불러오는 중입니다...'}
                    </p>
                  </div>

                  {/* 원문 보기 버튼 */}
                  <div className="flex justify-end">
                    <a
                      href={article.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 px-3 py-2 rounded-lg transition-colors"
                    >
                      전체 기사 보기
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
