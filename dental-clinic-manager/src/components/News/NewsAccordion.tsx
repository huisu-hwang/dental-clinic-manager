'use client'

import { ExternalLink } from 'lucide-react'

interface NewsArticle {
  id: number
  title: string
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
            <a
              key={article.id}
              href={article.link}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors group"
            >
              <span className="text-sm font-medium text-slate-700 group-hover:text-blue-600 pr-3 line-clamp-2">
                {article.title}
              </span>
              <ExternalLink className="w-4 h-4 text-slate-300 group-hover:text-blue-500 shrink-0" />
            </a>
          ))
        )}
      </div>
    </div>
  )
}
