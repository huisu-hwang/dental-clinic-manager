'use client'

import { useState } from 'react'
import { Heart, Bookmark } from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface TelegramBoardPostActionsProps {
  isLiked: boolean
  isScraped: boolean
  likeCount: number
  scrapCount: number
  onToggleLike: () => Promise<void>
  onToggleScrap: () => Promise<void>
}

export default function TelegramBoardPostActions({
  isLiked, isScraped, likeCount, scrapCount,
  onToggleLike, onToggleScrap,
}: TelegramBoardPostActionsProps) {
  const [liking, setLiking] = useState(false)
  const [scraping, setScraping] = useState(false)

  const handleLike = async () => {
    setLiking(true)
    await onToggleLike()
    setLiking(false)
  }

  const handleScrap = async () => {
    setScraping(true)
    await onToggleScrap()
    setScraping(false)
  }

  return (
    <div className="flex items-center gap-2 py-3 border-t border-b border-at-border">
      <Button
        variant="outline"
        size="sm"
        onClick={handleLike}
        disabled={liking}
        className={isLiked ? 'text-red-500 border-at-border bg-at-error-bg' : ''}
      >
        <Heart className={`w-4 h-4 mr-1.5 ${isLiked ? 'fill-red-500' : ''}`} />
        좋아요 {likeCount > 0 && likeCount}
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={handleScrap}
        disabled={scraping}
        className={isScraped ? 'text-yellow-600 border-at-border bg-yellow-50' : ''}
      >
        <Bookmark className={`w-4 h-4 mr-1.5 ${isScraped ? 'fill-yellow-500' : ''}`} />
        스크랩 {scrapCount > 0 && scrapCount}
      </Button>
    </div>
  )
}
