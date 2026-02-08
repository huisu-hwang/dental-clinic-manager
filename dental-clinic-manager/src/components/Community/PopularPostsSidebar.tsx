'use client'

import { useState, useEffect } from 'react'
import { TrendingUp, Heart } from 'lucide-react'
import { communityPostService } from '@/lib/communityService'
import type { CommunityPost } from '@/types/community'
import { COMMUNITY_CATEGORY_LABELS } from '@/types/community'

interface PopularPostsSidebarProps {
  onPostClick: (post: CommunityPost) => void
  labelMap?: Record<string, string>
}

export default function PopularPostsSidebar({ onPostClick, labelMap }: PopularPostsSidebarProps) {
  const labels = labelMap || COMMUNITY_CATEGORY_LABELS
  const [posts, setPosts] = useState<CommunityPost[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetch = async () => {
      const { data } = await communityPostService.getPopularPosts(5)
      setPosts(data || [])
      setLoading(false)
    }
    fetch()
  }, [])

  if (loading || posts.length === 0) return null

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-center gap-2 mb-3">
        <TrendingUp className="w-4 h-4 text-orange-500" />
        <h3 className="text-sm font-semibold text-gray-900">인기 게시글</h3>
      </div>
      <div className="space-y-2">
        {posts.map((post, index) => (
          <div
            key={post.id}
            onClick={() => onPostClick(post)}
            className="flex items-start gap-2 cursor-pointer hover:bg-gray-50 rounded-lg p-2 -mx-2 transition-colors"
          >
            <span className="text-xs font-bold text-gray-300 mt-0.5 w-4">{index + 1}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-800 truncate">{post.title}</p>
              <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-400">
                <span>{labels[post.category] || post.category}</span>
                <span className="flex items-center gap-0.5">
                  <Heart className="w-3 h-3" />{post.like_count}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
