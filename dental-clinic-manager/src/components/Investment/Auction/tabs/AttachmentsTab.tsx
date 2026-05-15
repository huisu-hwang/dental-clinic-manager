'use client'
import { ExternalLink, FileText } from 'lucide-react'
import type { AuctionItem } from '@/types/auction'

interface Props { item: AuctionItem }

export function AttachmentsTab({ item }: Props) {
  const items = [
    { label: '매각물건명세서', url: item.notice_pdf_url },
    { label: '감정평가서', url: item.appraisal_pdf_url },
    { label: '법원경매정보 원문', url: item.source_url },
  ].filter(x => x.url)

  if (items.length === 0) {
    return <p className="text-[14px] md:text-sm text-at-text-secondary py-8 text-center">첨부된 자료가 없습니다.</p>
  }

  return (
    <div className="bg-at-surface rounded-2xl p-4 md:p-5 border border-at-border space-y-2">
      {items.map((it) => (
        <a
          key={it.label}
          href={it.url!}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-at-surface-hover"
        >
          <FileText className="w-5 h-5 text-at-accent shrink-0" />
          <span className="flex-1 text-[15px] md:text-sm font-semibold text-at-text">{it.label}</span>
          <ExternalLink className="w-4 h-4 text-at-text-secondary" />
        </a>
      ))}
      <p className="text-[13px] md:text-xs text-at-text-secondary mt-3">※ 외부 링크는 새 창으로 열립니다.</p>
    </div>
  )
}
