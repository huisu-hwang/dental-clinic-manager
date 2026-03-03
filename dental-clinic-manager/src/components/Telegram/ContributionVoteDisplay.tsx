'use client'

import { useState, useEffect, useCallback } from 'react'
import { Vote, Loader2, Trophy, RefreshCw, CheckCircle2, Lock, Clock, RotateCcw, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { telegramBoardVoteService, telegramMemberService } from '@/lib/telegramService'
import type { TelegramBoardVote, ContributionVoteResults, TelegramGroupMember } from '@/types/telegram'

interface ContributionVoteDisplayProps {
  postId: string
  groupId: string
  currentUserId?: string | null
  isMasterAdmin?: boolean
  postCreatedBy?: string | null
  onVoteClosed?: () => void
}

export default function ContributionVoteDisplay({
  postId,
  groupId,
  currentUserId,
  isMasterAdmin = false,
  postCreatedBy,
  onVoteClosed,
}: ContributionVoteDisplayProps) {
  const [vote, setVote] = useState<TelegramBoardVote | null>(null)
  const [results, setResults] = useState<ContributionVoteResults | null>(null)
  const [members, setMembers] = useState<TelegramGroupMember[]>([])
  const [selectedCandidates, setSelectedCandidates] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [voting, setVoting] = useState(false)
  const [closing, setClosing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)

    // 1. 투표 세션 조회
    const { data: voteData, error: voteError } = await telegramBoardVoteService.getVote(postId)
    if (voteError || !voteData) {
      setError(voteError || '투표 정보를 불러올 수 없습니다.')
      setLoading(false)
      return
    }
    setVote(voteData)

    // 2. 결과 조회
    const { data: resultsData } = await telegramBoardVoteService.getResults(voteData.id)
    if (resultsData) {
      setResults(resultsData)
      // 기존 선택 복원
      if (resultsData.my_selections?.length) {
        setSelectedCandidates(new Set(resultsData.my_selections))
      }
    }

    // 3. 멤버 목록 조회 (투표 대상)
    const { data: membersData } = await telegramMemberService.getMembers(groupId)
    if (membersData) {
      setMembers(membersData)
    }

    setLoading(false)
  }, [postId, groupId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleToggleCandidate = (userId: string) => {
    if (!vote || !results) return
    const isClosed = results.is_closed
    if (isClosed) return

    const newSet = new Set(selectedCandidates)
    if (newSet.has(userId)) {
      newSet.delete(userId)
    } else {
      if (newSet.size >= vote.max_votes_per_person) return
      newSet.add(userId)
    }
    setSelectedCandidates(newSet)
  }

  const handleCastVote = async () => {
    if (!vote || selectedCandidates.size === 0) return
    setVoting(true)
    setError(null)

    const { data, error: castError } = await telegramBoardVoteService.castVote(
      vote.id,
      Array.from(selectedCandidates)
    )

    if (castError) {
      setError(castError)
      setVoting(false)
      return
    }

    if (data && !data.success) {
      setError(data.error || '투표에 실패했습니다.')
      setVoting(false)
      return
    }

    // 결과 새로고침
    await fetchData()
    setVoting(false)
  }

  const handleRevote = () => {
    if (!results) return
    setSelectedCandidates(new Set(results.my_selections || []))
  }

  const handleCloseVote = async () => {
    if (!vote) return
    if (!confirm('투표를 종료하시겠습니까? 종료 후에는 더 이상 투표할 수 없습니다.')) return

    setClosing(true)
    const { error: closeError } = await telegramBoardVoteService.closeVote(vote.id)
    if (closeError) {
      setError(closeError)
      setClosing(false)
      return
    }

    await fetchData()
    setClosing(false)
    onVoteClosed?.()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-orange-500" />
      </div>
    )
  }

  if (error && !vote) {
    return (
      <div className="text-center py-6 text-gray-500 text-sm">
        <XCircle className="w-8 h-8 mx-auto mb-2 text-red-400" />
        {error}
      </div>
    )
  }

  if (!vote || !results) return null

  const isClosed = results.is_closed
  const hasVoted = results.has_voted
  const canClose = (postCreatedBy === currentUserId || isMasterAdmin) && !isClosed
  const canSeeResults = results.can_see_results
  const maxVotes = vote.max_votes_per_person

  // 투표 가능한 멤버 (본인 제외 옵션)
  const candidates = members.filter(m => {
    if (!vote.allow_self_vote && m.user_id === currentUserId) return false
    return true
  })

  // 결과에서 show_top_n 적용 (종료 시에는 전체 공개)
  const displayResults = canSeeResults && results.results
    ? (isClosed || !vote.show_top_n)
      ? results.results
      : results.results.slice(0, vote.show_top_n)
    : []

  const maxVoteCount = displayResults.length > 0
    ? Math.max(...displayResults.map(r => r.vote_count), 1)
    : 1

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Trophy className="w-4 h-4 text-yellow-500" />
    if (rank === 2) return <Trophy className="w-4 h-4 text-gray-400" />
    if (rank === 3) return <Trophy className="w-4 h-4 text-amber-700" />
    return <span className="text-xs text-gray-400 w-4 text-center">{rank}</span>
  }

  return (
    <div className="mt-4 border border-orange-200 rounded-xl overflow-hidden">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-3 bg-orange-50 border-b border-orange-200">
        <div className="flex items-center gap-2">
          <Vote className="w-4 h-4 text-orange-600" />
          <span className="text-sm font-semibold text-orange-900">기여도 투표</span>
          {isClosed ? (
            <span className="text-xs px-2 py-0.5 rounded-full bg-gray-200 text-gray-600">종료</span>
          ) : (
            <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700">진행 중</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            {results.total_voters}명 참여
          </span>
          <button
            onClick={fetchData}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            title="새로고침"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="p-4 space-y-4">
        {/* 종료 배너 */}
        {isClosed && (
          <div className="flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg text-sm text-gray-600">
            <Lock className="w-4 h-4" />
            투표가 종료되었습니다.
          </div>
        )}

        {/* 투표 설정 정보 */}
        <div className="flex flex-wrap gap-2 text-xs text-gray-500">
          <span className="px-2 py-1 bg-gray-100 rounded-full">1인당 {maxVotes}명 선택</span>
          {vote.is_anonymous && <span className="px-2 py-1 bg-gray-100 rounded-full">비밀 투표</span>}
          {vote.ends_at && (
            <span className="px-2 py-1 bg-gray-100 rounded-full flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {new Date(vote.ends_at).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })} 마감
            </span>
          )}
        </div>

        {/* 에러 메시지 */}
        {error && (
          <div className="px-3 py-2 bg-red-50 text-red-600 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* 투표 UI (진행 중 + 미투표 또는 재투표) */}
        {!isClosed && currentUserId && (
          <div>
            {/* 멤버 선택 체크박스 */}
            <div className="space-y-1">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">
                  투표할 멤버를 선택하세요
                </span>
                <span className="text-xs text-gray-400">
                  {selectedCandidates.size}/{maxVotes}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                {candidates.map(member => {
                  const isSelected = selectedCandidates.has(member.user_id)
                  const isDisabled = !isSelected && selectedCandidates.size >= maxVotes
                  return (
                    <button
                      key={member.user_id}
                      onClick={() => handleToggleCandidate(member.user_id)}
                      disabled={isDisabled}
                      className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition-all ${
                        isSelected
                          ? 'bg-orange-100 border-2 border-orange-400 text-orange-800 font-medium'
                          : isDisabled
                            ? 'bg-gray-50 border border-gray-200 text-gray-400 cursor-not-allowed'
                            : 'bg-white border border-gray-200 text-gray-700 hover:border-orange-300 hover:bg-orange-50'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 ${
                        isSelected ? 'bg-orange-500' : 'bg-gray-200'
                      }`}>
                        {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-white" />}
                      </div>
                      <span className="truncate">{member.user?.name || '알 수 없음'}</span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 투표/재투표 버튼 */}
            <div className="flex items-center gap-2 mt-3">
              <Button
                size="sm"
                onClick={handleCastVote}
                disabled={voting || selectedCandidates.size === 0}
                className="bg-orange-600 hover:bg-orange-700"
              >
                {voting ? (
                  <><Loader2 className="w-4 h-4 animate-spin mr-1" />투표 중...</>
                ) : hasVoted ? (
                  <><RotateCcw className="w-4 h-4 mr-1" />다시 투표하기</>
                ) : (
                  <><Vote className="w-4 h-4 mr-1" />투표하기</>
                )}
              </Button>
              {hasVoted && (
                <button
                  onClick={handleRevote}
                  className="text-xs text-gray-400 hover:text-gray-600"
                >
                  이전 선택 복원
                </button>
              )}
            </div>
          </div>
        )}

        {/* 결과 비공개 안내 */}
        {!canSeeResults && !isClosed && (
          <div className="text-center py-4 text-sm text-gray-400">
            {vote.result_visibility === 'after_vote' && !hasVoted && (
              <p>투표 후 결과를 확인할 수 있습니다.</p>
            )}
            {vote.result_visibility === 'after_end' && (
              <p>
                {hasVoted
                  ? '투표 완료! 종료 후 결과가 공개됩니다.'
                  : '투표가 종료된 후 결과가 공개됩니다.'}
              </p>
            )}
          </div>
        )}

        {/* 본인 순위 (after_end + 투표 완료 + 진행 중) */}
        {vote.result_visibility === 'after_end' && hasVoted && !isClosed && results.my_rank && (
          <div className="px-3 py-2 bg-orange-50 rounded-lg text-sm text-orange-800">
            현재 나의 순위: <strong>{results.my_rank}위</strong> ({results.my_votes}표)
          </div>
        )}

        {/* 결과 바 차트 */}
        {canSeeResults && displayResults.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-medium text-gray-700 flex items-center gap-1">
              <Trophy className="w-4 h-4 text-orange-500" />
              투표 결과
              {vote.show_top_n && !isClosed && (
                <span className="text-xs text-gray-400 font-normal">(상위 {vote.show_top_n}명)</span>
              )}
            </h4>
            <div className="space-y-1.5">
              {displayResults.map(candidate => {
                const barWidth = maxVoteCount > 0 ? (candidate.vote_count / maxVoteCount) * 100 : 0
                const isMe = candidate.user_id === currentUserId

                return (
                  <div
                    key={candidate.user_id}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg ${
                      isMe ? 'bg-orange-50 border border-orange-200' : 'bg-gray-50'
                    }`}
                  >
                    <div className="w-5 flex-shrink-0">{getRankIcon(candidate.rank)}</div>
                    <span className={`text-sm w-20 truncate flex-shrink-0 ${isMe ? 'font-bold text-orange-800' : 'text-gray-700'}`}>
                      {candidate.user_name}{isMe && ' (나)'}
                    </span>
                    <div className="flex-1 h-5 bg-gray-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          candidate.rank === 1 ? 'bg-yellow-400' :
                          candidate.rank === 2 ? 'bg-gray-400' :
                          candidate.rank === 3 ? 'bg-amber-600' :
                          'bg-orange-300'
                        }`}
                        style={{ width: `${Math.max(barWidth, 2)}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium text-gray-600 w-8 text-right flex-shrink-0">
                      {candidate.vote_count}
                    </span>
                  </div>
                )
              })}
            </div>

            {/* 본인 순위 (show_top_n 밖이면 별도 표시) */}
            {results.my_rank && vote.show_top_n && !isClosed && results.my_rank > vote.show_top_n && (
              <div className="px-3 py-2 bg-orange-50 rounded-lg text-sm text-orange-800 border border-orange-200">
                나의 순위: <strong>{results.my_rank}위</strong> ({results.my_votes}표)
              </div>
            )}
          </div>
        )}

        {/* 투표 종료 버튼 */}
        {canClose && (
          <div className="pt-2 border-t border-gray-100">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCloseVote}
              disabled={closing}
              className="text-red-500 border-red-200 hover:bg-red-50"
            >
              {closing ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-1" />종료 중...</>
              ) : (
                <><XCircle className="w-4 h-4 mr-1" />투표 종료</>
              )}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
