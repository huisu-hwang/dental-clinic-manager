'use client'

import { useState, useEffect, useCallback } from 'react'
import { dataService } from '@/lib/dataService'
import type { SpecialNotesHistory as SpecialNotesHistoryType } from '@/types'

interface SpecialNotesHistoryProps {
  clinicId?: string
}

interface GroupedNote {
  date: string
  latestNote: SpecialNotesHistoryType
  editCount: number
}

export default function SpecialNotesHistory({ clinicId }: SpecialNotesHistoryProps) {
  const [notes, setNotes] = useState<GroupedNote[]>([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SpecialNotesHistoryType[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [expandedDate, setExpandedDate] = useState<string | null>(null)
  const [dateHistory, setDateHistory] = useState<SpecialNotesHistoryType[]>([])
  const [loadingHistory, setLoadingHistory] = useState(false)

  // 초기 데이터 로드
  const loadNotes = useCallback(async () => {
    setLoading(true)
    try {
      console.log('[SpecialNotesHistory] Loading notes...')
      const result = await dataService.getLatestSpecialNotesByDate({
        limit: 100
      })

      if (result.success && result.data) {
        console.log(`[SpecialNotesHistory] Loaded ${result.data.length} notes`)
        setNotes(result.data)
      }
    } catch (error) {
      console.error('[SpecialNotesHistory] Error loading notes:', error)
    } finally {
      setLoading(false)
    }
  }, [])

  // 컴포넌트 마운트 시 항상 최신 데이터 로드
  useEffect(() => {
    loadNotes()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // 의도적으로 빈 의존성 배열 사용 - 마운트 시에만 실행

  // 검색 처리
  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([])
      setIsSearching(false)
      return
    }

    setIsSearching(true)
    try {
      const result = await dataService.searchSpecialNotes({
        query: searchQuery.trim(),
        limit: 50
      })

      if (result.success && result.data) {
        setSearchResults(result.data)
      }
    } catch (error) {
      console.error('[SpecialNotesHistory] Search error:', error)
    } finally {
      setIsSearching(false)
    }
  }

  // Enter 키 검색
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSearch()
    }
  }

  // 검색 초기화
  const clearSearch = () => {
    setSearchQuery('')
    setSearchResults([])
  }

  // 특정 날짜의 수정 이력 보기
  const handleExpandDate = async (date: string) => {
    if (expandedDate === date) {
      setExpandedDate(null)
      setDateHistory([])
      return
    }

    setExpandedDate(date)
    setLoadingHistory(true)

    try {
      const result = await dataService.getSpecialNotesHistoryByDate(date)
      if (result.success && result.data) {
        setDateHistory(result.data)
      }
    } catch (error) {
      console.error('[SpecialNotesHistory] Error loading date history:', error)
    } finally {
      setLoadingHistory(false)
    }
  }

  // 날짜 포맷팅
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'short'
    })
  }

  // 시간 포맷팅
  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  // 검색 결과 표시
  const renderSearchResults = () => {
    if (searchResults.length === 0) {
      return (
        <div className="text-center py-8 text-gray-500">
          &quot;{searchQuery}&quot;에 대한 검색 결과가 없습니다.
        </div>
      )
    }

    return (
      <div className="space-y-3">
        <div className="text-sm text-gray-500 mb-2">
          검색 결과: {searchResults.length}건
        </div>
        {searchResults.map((note) => (
          <div
            key={note.id}
            className="p-4 border border-slate-200 rounded-lg bg-white hover:bg-slate-50"
          >
            <div className="flex justify-between items-start mb-2">
              <span className="font-medium text-blue-600">{formatDate(note.report_date)}</span>
              <div className="flex items-center gap-2">
                {note.is_past_date_edit && (
                  <span className="px-2 py-1 text-xs bg-orange-100 text-orange-700 rounded">
                    과거 날짜 수정
                  </span>
                )}
                <span className="text-xs text-gray-500">
                  작성: {note.author_name}
                </span>
              </div>
            </div>
            <p className="text-gray-700 whitespace-pre-wrap">{note.content}</p>
            <div className="mt-2 text-xs text-gray-400">
              수정 시점: {formatDateTime(note.edited_at)}
            </div>
          </div>
        ))}
      </div>
    )
  }

  // 기본 목록 표시
  const renderNotesList = () => {
    if (notes.length === 0) {
      return (
        <div className="text-center py-8 text-gray-500">
          기록된 특이사항이 없습니다.
        </div>
      )
    }

    return (
      <div className="space-y-3">
        {notes.map(({ date, latestNote, editCount }) => (
          <div key={date} className="border border-slate-200 rounded-lg bg-white overflow-hidden">
            {/* 메인 카드 */}
            <div
              className={`p-4 cursor-pointer hover:bg-slate-50 transition-colors ${
                expandedDate === date ? 'bg-slate-50' : ''
              }`}
              onClick={() => editCount > 1 && handleExpandDate(date)}
            >
              <div className="flex justify-between items-start mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-blue-600">{formatDate(date)}</span>
                  {editCount > 1 && (
                    <button
                      className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded hover:bg-gray-200 transition-colors"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleExpandDate(date)
                      }}
                    >
                      {expandedDate === date ? '이력 접기' : `수정 이력 ${editCount}개`}
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {latestNote.is_past_date_edit && (
                    <span className="px-2 py-1 text-xs bg-orange-100 text-orange-700 rounded">
                      과거 날짜 수정
                    </span>
                  )}
                  <span className="text-xs text-gray-500">
                    작성자: {latestNote.author_name}
                  </span>
                </div>
              </div>
              <p className="text-gray-700 whitespace-pre-wrap">{latestNote.content}</p>
              <div className="mt-2 text-xs text-gray-400">
                {editCount > 1 ? '최종 수정' : '작성'}: {formatDateTime(latestNote.edited_at)}
              </div>
            </div>

            {/* 수정 이력 확장 패널 */}
            {expandedDate === date && (
              <div className="border-t border-slate-200 bg-slate-50 p-4">
                <h4 className="text-sm font-medium text-gray-700 mb-3">수정 이력</h4>
                {loadingHistory ? (
                  <div className="text-center py-4 text-gray-500">
                    이력 로딩 중...
                  </div>
                ) : (
                  <div className="space-y-3">
                    {dateHistory.map((history, index) => (
                      <div
                        key={history.id}
                        className={`p-3 rounded-lg ${
                          index === 0
                            ? 'bg-blue-50 border border-blue-200'
                            : 'bg-white border border-slate-200'
                        }`}
                      >
                        <div className="flex justify-between items-center mb-2">
                          <div className="flex items-center gap-2">
                            {index === 0 && (
                              <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded">
                                현재
                              </span>
                            )}
                            {history.is_past_date_edit && (
                              <span className="px-2 py-0.5 text-xs bg-orange-100 text-orange-700 rounded">
                                과거 수정
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-gray-500">
                            {history.author_name} | {formatDateTime(history.edited_at)}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600 whitespace-pre-wrap">
                          {history.content}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    )
  }

  return (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">기타 특이사항 기록</h2>
        <button
          onClick={loadNotes}
          disabled={loading}
          className="text-sm px-3 py-1 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded transition-colors"
        >
          {loading ? '로딩 중...' : '새로고침'}
        </button>
      </div>

      {/* 검색 영역 */}
      <div className="mb-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="특이사항 내용 검색..."
              className="w-full px-4 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
            />
            {searchQuery && (
              <button
                onClick={clearSearch}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          <button
            onClick={handleSearch}
            disabled={isSearching || !searchQuery.trim()}
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {isSearching ? '검색 중...' : '검색'}
          </button>
        </div>
      </div>

      {/* 결과 표시 영역 */}
      <div className="max-h-[600px] overflow-y-auto">
        {loading ? (
          <div className="text-center py-8 text-gray-500">
            데이터 로딩 중...
          </div>
        ) : searchQuery && searchResults.length > 0 ? (
          renderSearchResults()
        ) : searchQuery && !isSearching ? (
          renderSearchResults()
        ) : (
          renderNotesList()
        )}
      </div>
    </div>
  )
}
