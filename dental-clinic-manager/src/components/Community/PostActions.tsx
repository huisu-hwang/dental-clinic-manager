'use client'

import { useState } from 'react'
import { Heart, Bookmark, Flag, Share2 } from 'lucide-react'
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
    <div className="flex items-center gap-2 py-3 border-t border-b border-gray-100">
      <Button
        variant="outline"
        size="sm"
        onClick={handleLike}
        disabled={liking}
        className={isLiked ? 'text-red-500 border-red-200 bg-red-50' : ''}
      >
        <Heart className={`w-4 h-4 mr-1.5 ${isLiked ? 'fill-red-500' : ''}`} />
        좋아요 {likeCount > 0 && likeCount}
      </Button>
      <Button
        variant="outline"
        size="sm"
        onClick={handleBookmark}
        disabled={bookmarking}
        className={isBookmarked ? 'text-yellow-600 border-yellow-200 bg-yellow-50' : ''}
      >
        <Bookmark className={`w-4 h-4 mr-1.5 ${isBookmarked ? 'fill-yellow-500' : ''}`} />
        북마크 {bookmarkCount > 0 && bookmarkCount}
      </Button>
      <div className="flex-1" />
      <Button variant="outline" size="sm" onClick={onReport} className="text-gray-400">
        <Flag className="w-4 h-4 mr-1.5" />신고
      </Button>
    </div>
  )
}
