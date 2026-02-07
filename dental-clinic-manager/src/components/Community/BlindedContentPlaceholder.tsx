'use client'

import { EyeOff } from 'lucide-react'

interface BlindedContentPlaceholderProps {
  type: 'post' | 'comment'
}

export default function BlindedContentPlaceholder({ type }: BlindedContentPlaceholderProps) {
  return (
    <div className="flex items-center gap-2 py-4 px-4 bg-gray-50 rounded-lg text-gray-400">
      <EyeOff className="w-4 h-4" />
      <span className="text-sm">
        {type === 'post'
          ? '신고가 접수되어 블라인드 처리된 게시글입니다.'
          : '신고가 접수되어 블라인드 처리된 댓글입니다.'}
      </span>
    </div>
  )
}
