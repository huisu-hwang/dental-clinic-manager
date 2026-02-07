'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, Plus, ChevronLeft, ChevronRight, AlertCircle, MessageCircle, TrendingUp } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { communityPostService } from '@/lib/communityService'
import type { CommunityPost, CommunityCategory } from '@/types/community'
import CategoryFilter from './CategoryFilter'
import CommunityPostCard from './CommunityPostCard'

interface CommunityPostListProps {
  profileId: string | null
  isBanned: boolean
  onPostClick: (post: CommunityPost) => void
  onNewPost: () => void
}

export default function CommunityPostList({ profileId, isBanned, onPostClick, onNewPost }: CommunityPostListProps) {
  const [posts, setPosts] = useState<CommunityPost[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<CommunityCategory | ''>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [sort, setSort] = useState<'latest' | 'popular'>('latest')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const ITEMS_PER_PAGE = 20

  const fetchPosts = useCallback(async () => {
    setLoading(true)
    setError(null)

    const { data, total: totalCount, error: fetchError } = await communityPostService.getPosts({
      category: selectedCategory || undefined,
      search: searchQuery || undefined,
      sort,
      limit: ITEMS_PER_PAGE,
      offset: (page - 1) * ITEMS_PER_PAGE,
    })

    if (fetchError) {
      setError(fetchError)
    } else {
      setPosts(data || [])
      setTotal(totalCount)
    }
    setLoading(false)
  }, [selectedCategory, searchQuery, sort, page])

  useEffect(() => {
    fetchPosts()
  }, [fetchPosts])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
    fetchPosts()
  }

  const totalPages = Math.ceil(total / ITEMS_PER_PAGE)

  return (
    <div className="space-y-4">
      {/* 상단 액션 바 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setSort('latest'); setPage(1) }}
            className={`text-sm font-medium px-3 py-1 rounded-lg ${sort === 'latest' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'}`}
          >
            <MessageCircle className="w-3.5 h-3.5 inline mr-1" />최신
          </button>
          <button
            onClick={() => { setSort('popular'); setPage(1) }}
            className={`text-sm font-medium px-3 py-1 rounded-lg ${sort === 'popular' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100'}`}
          >
            <TrendingUp className="w-3.5 h-3.5 inline mr-1" />인기
          </button>
        </div>
        {profileId && !isBanned && (
          <Button onClick={onNewPost} className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            글쓰기
          </Button>
        )}
      </div>

      {/* 카테고리 필터 */}
      <CategoryFilter selected={selectedCategory} onChange={(cat) => { setSelectedCategory(cat); setPage(1) }} />

      {/* 검색 */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input
            type="text"
            placeholder="제목 또는 내용 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-10"
          />
        </div>
        <Button type="submit" variant="outline">검색</Button>
      </form>

      {/* 에러 */}
      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 text-red-700 rounded-lg">
          <AlertCircle className="w-5 h-5" /><span>{error}</span>
        </div>
      )}

      {/* 목록 */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : posts.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <MessageCircle className="w-12 h-12 mx-auto mb-4 text-gray-300" />
          <p>게시글이 없습니다.</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-lg border border-gray-200">
            {posts.map((post) => (
              <CommunityPostCard key={post.id} post={post} onClick={onPostClick} />
            ))}
          </div>

          {/* 페이지네이션 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm text-gray-600">{page} / {totalPages}</span>
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
