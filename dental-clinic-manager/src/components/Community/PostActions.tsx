'use client'

import { useState } from 'react'
import { Heart, Bookmark, Flag } from 'lucide-react'
import { Button } from '@/components/ui/Button'

interface PostActionsProps {
  isLiked: boolean
  isBookmarked: boolean
  likeCount: number
  bookmarkCount: number
  onToggleLike: () => Promise<void>
  onToggleBookmark: () => Promise<void>
  onReport: () => void
}

export default function PostActions({
  isLiked, isBookmarked, likeCount, bookmarkCount,
  onToggleLike, onToggleBookmark, onReport,
}: PostActionsProps) {
  const [liking, setLiking] = useState(false)
  const [bookmarking, setBookmarking] = useState(false)

  const handleLike = async () => {
    setLiking(true)
    await onToggleLike()
    setLiking(false)
  }

  const handleBookmark = async () => {
    setBookmarking(true)
    await onToggleBookmark()
    setBookmarking(false)
  }

  return (
    <div className="flex items-center gap-2 py-3 border-t border-b border-at-border">
      <Button
        variant="outline"
        size="sm"
        onClick={handleLike}
        disabled={liking}
        className={
          isLiked
            ? 'bg-at-error-bg text-at-error border-at-error hover:bg-at-error-bg hover:text-at-error'
            : 'bg-white text-at-text-secondary hover:bg-at-error-bg hover:text-at-error hover:border-at-error'
        }
      >
        <Heart className={`w-4 h-4 mr-1.5 ${isLiked ? 'fill-at-error' : ''}`} />
        좋아요 {likeCount > 0 && likeCount}
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={handleBookmark}
        disabled={bookmarking}
        className={
          isBookmarked
            ? 'bg-at-warning-bg text-at-warning border-at-warning hover:bg-at-warning-bg hover:text-at-warning'
            : 'bg-white text-at-text-secondary hover:bg-at-warning-bg hover:text-at-warning hover:border-at-warning'
        }
      >
        <Bookmark className={`w-4 h-4 mr-1.5 ${isBookmarked ? 'fill-at-warning' : ''}`} />
        스크랩 {bookmarkCount > 0 && bookmarkCount}
      </Button>
      <div className="flex-1" />
      <Button
        variant="outline"
        size="sm"
        onClick={onReport}
        className="bg-white text-at-error border-at-error/40 hover:bg-at-error-bg hover:text-at-error hover:border-at-error"
      >
        <Flag className="w-4 h-4 mr-1.5" />신고
      </Button>
    </div>
  )
}
