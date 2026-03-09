'use client'

import { useState, useEffect, useCallback } from 'react'
import { Search, Plus, ChevronLeft, ChevronRight, AlertCircle, MessageCircle, TrendingUp, Heart, Bookmark } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { communityPostService } from '@/lib/communityService'
import type { CommunityPost, CommunityCategory, CommunityCategoryItem } from '@/types/community'
import CategoryFilter from './CategoryFilter'
import CommunityPostCard from './CommunityPostCard'

interface CommunityPostListProps {
  profileId: string | null
  isBanned: boolean
  isLoggedIn?: boolean
  categories: CommunityCategoryItem[]
  labelMap: Record<string, string>
  colorMap: Record<string, string>
  onPostClick: (post: CommunityPost) => void
  onNewPost: () => void
}

export default function CommunityPostList({ profileId, isBanned, isLoggedIn, categories, labelMap, colorMap, onPostClick, onNewPost }: CommunityPostListProps) {
  const [posts, setPosts] = useState<CommunityPost[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<CommunityCategory | ''>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [sort, setSort] = useState<'latest' | 'popular' | 'my_likes' | 'my_scraps'>('latest')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const ITEMS_PER_PAGE = 20

  const fetchPosts = useCallback(async () => {
    setError(null)

    if (sort === 'my_likes') {
      if (!profileId) {
        setPosts([])
        setTotal(0)
        setLoading(false)
        return
      }
      const { data, total: totalCount, error: fetchError } = await communityPostService.getMyLikes(profileId, {
        limit: ITEMS_PER_PAGE,
        offset: (page - 1) * ITEMS_PER_PAGE,
      })
      if (fetchError) {
        setError(fetchError)
      } else {
        setPosts(data || [])
        setTotal(totalCount)
      }
    } else if (sort === 'my_scraps') {
      if (!profileId) {
        setPosts([])
        setTotal(0)
        setLoading(false)
        return
      }
      const { data, total: totalCount, error: fetchError } = await communityPostService.getMyBookmarks(profileId, {
        limit: ITEMS_PER_PAGE,
        offset: (page - 1) * ITEMS_PER_PAGE,
      })
      if (fetchError) {
        setError(fetchError)
      } else {
        setPosts(data || [])
        setTotal(totalCount)
      }
    } else {
      const { data, total: totalCount, error: fetchError } = await communityPostService.getPosts({
        category: selectedCategory || undefined,
        search: searchQuery || undefined,
        sort: sort as 'latest' | 'popular',
        limit: ITEMS_PER_PAGE,
        offset: (page - 1) * ITEMS_PER_PAGE,
      })
      if (fetchError) {
        setError(fetchError)
      } else {
        setPosts(data || [])
        setTotal(totalCount)
      }
    }
    setLoading(false)
  }, [selectedCategory, searchQuery, sort, page, profileId])

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
          {(isLoggedIn || profileId) && (
            <>
              <span className="w-px h-4 bg-gray-200 mx-0.5" />
              <button
                onClick={() => { setSort('my_likes'); setPage(1) }}
                className={`text-sm font-medium px-3 py-1 rounded-lg ${sort === 'my_likes' ? 'bg-red-500 text-white' : 'text-gray-500 hover:bg-gray-100'}`}
              >
                <Heart className="w-3.5 h-3.5 inline mr-1" />내 좋아요
              </button>
              <button
                onClick={() => { setSort('my_scraps'); setPage(1) }}
                className={`text-sm font-medium px-3 py-1 rounded-lg ${sort === 'my_scraps' ? 'bg-yellow-500 text-white' : 'text-gray-500 hover:bg-gray-100'}`}
              >
                <Bookmark className="w-3.5 h-3.5 inline mr-1" />내 스크랩
              </button>
            </>
          )}
        </div>
        <div className="flex items-center gap-3">
          {!loading && (
            <span className="text-xs text-gray-400 font-normal">총 {total}건</span>
          )}
          {profileId && !isBanned && (
            <Button onClick={onNewPost} className="flex items-center gap-2">
              <Plus className="w-4 h-4" />
              글쓰기
            </Button>
          )}
        </div>
      </div>

      {/* 카테고리 필터 */}
      <CategoryFilter selected={selectedCategory} onChange={(cat) => { setSelectedCategory(cat); setPage(1) }} categories={categories} labelMap={labelMap} colorMap={colorMap} />

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
        <div className="text-center py-16 text-gray-500">
          <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <MessageCircle className="w-8 h-8 text-gray-300" />
          </div>
          <p className="font-medium text-gray-600 mb-1">게시글이 없습니다</p>
          <p className="text-sm text-gray-400">새로운 글이 작성되면 여기에 표시됩니다.</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-lg border border-gray-200">
            {/* 테이블 헤더 */}
            <div className="flex items-center px-4 py-2 border-b border-gray-200 bg-gray-50 text-xs font-medium text-gray-500">
              <div className="w-5 flex-shrink-0" />
              <div className="hidden sm:block w-20 flex-shrink-0 text-center">분류</div>
              <div className="flex-1 min-w-0 text-center">제목</div>
              <div className="hidden sm:block w-20 text-center flex-shrink-0">작성자</div>
              <div className="w-20 text-center flex-shrink-0">작성일</div>
              <div className="hidden sm:block w-12 text-center flex-shrink-0">조회</div>
            </div>
            {posts.map((post) => (
              <CommunityPostCard key={post.id} post={post} onClick={onPostClick} labelMap={labelMap} colorMap={colorMap} />
            ))}
          </div>

          {/* 페이지네이션 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-1">
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                <ChevronLeft className="w-4 h-4" />
              </Button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                .reduce((acc: (number | string)[], p, i, arr) => {
                  if (i > 0 && typeof arr[i - 1] === 'number' && (p as number) - (arr[i - 1] as number) > 1) {
                    acc.push('...')
                  }
                  acc.push(p)
                  return acc
                }, [])
                .map((p, i) =>
                  typeof p === 'string' ? (
                    <span key={`dots-${i}`} className="px-2 text-gray-400 text-sm">...</span>
                  ) : (
                    <Button
                      key={p}
                      variant={page === p ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setPage(p)}
                      className={`min-w-[32px] ${page === p ? '' : 'text-gray-600'}`}
                    >
                      {p}
                    </Button>
                  )
                )}
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
