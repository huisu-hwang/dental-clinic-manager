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
      <div className="bg-white rounded-xl shadow-at-card border border-at-border overflow-hidden h-fit">
        <div className="bg-at-surface-alt px-4 py-3 border-b border-at-border">
          <div className="flex items-center gap-2">
            {icon}
            <h2 className="text-base font-bold text-at-text">{title}</h2>
          </div>
        </div>
        <div className="p-6 flex justify-center">
          <div className="w-6 h-6 border-4 border-at-accent border-t-transparent rounded-full animate-spin"></div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-xl shadow-at-card border border-at-border overflow-hidden h-fit">
      {/* 헤더 */}
      <div className="bg-at-surface-alt px-4 py-3 border-b border-at-border">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-base font-bold text-at-text">{title}</h2>
          <span className="ml-auto text-xs text-at-text-weak">{articles.length}건</span>
        </div>
      </div>

      {/* 기사 목록 */}
      <div className="divide-y divide-at-border">
        {articles.length === 0 ? (
          <p className="p-4 text-center text-at-text-weak text-sm">{emptyMessage}</p>
        ) : (
          articles.map((article) => (
            <a
              key={article.id}
              href={article.link}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-between px-4 py-3 hover:bg-at-surface-alt transition-colors group"
            >
              <span className="text-sm font-medium text-at-text-secondary group-hover:text-at-accent pr-3 line-clamp-2">
                {article.title}
              </span>
              <ExternalLink className="w-4 h-4 text-at-text-weak group-hover:text-at-accent shrink-0" />
            </a>
          ))
        )}
      </div>
    </div>
  )
}
