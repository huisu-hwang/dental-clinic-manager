'use client'

import { useState } from 'react'
import { BarChart3, Check, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { communityPollService } from '@/lib/communityService'
import type { CommunityPoll } from '@/types/community'

interface PollDisplayProps {
  poll: CommunityPoll
  profileId: string
  onVoted: () => void
}

export default function PollDisplay({ poll, profileId, onVoted }: PollDisplayProps) {
  const [selectedOptions, setSelectedOptions] = useState<string[]>(poll.user_votes || [])
  const [voting, setVoting] = useState(false)
  const hasVoted = (poll.user_votes || []).length > 0
  const isExpired = poll.ends_at ? new Date(poll.ends_at) < new Date() : false
  const showResults = hasVoted || isExpired

  const handleOptionToggle = (optionId: string) => {
    if (showResults) return
    if (poll.is_multiple_choice) {
      setSelectedOptions(prev =>
        prev.includes(optionId) ? prev.filter(id => id !== optionId) : [...prev, optionId]
      )
    } else {
      setSelectedOptions([optionId])
    }
  }

  const handleVote = async () => {
    if (selectedOptions.length === 0) return
    setVoting(true)
    const { success } = await communityPollService.vote(poll.id, selectedOptions, profileId)
    if (success) onVoted()
    setVoting(false)
  }

  const totalVotes = poll.total_votes || 0

  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 className="w-4 h-4 text-indigo-500" />
        <h4 className="text-sm font-semibold text-gray-900">{poll.question}</h4>
      </div>

      <div className="space-y-2">
        {(poll.options || []).map((option) => {
          const percentage = totalVotes > 0 ? Math.round((option.vote_count / totalVotes) * 100) : 0
          const isSelected = selectedOptions.includes(option.id)

          return (
            <button
              key={option.id}
              onClick={() => handleOptionToggle(option.id)}
              disabled={showResults}
              className={`w-full text-left rounded-lg border transition-colors ${
                isSelected
                  ? 'border-indigo-300 bg-indigo-50'
                  : 'border-gray-200 hover:border-gray-300'
              } ${showResults ? 'cursor-default' : 'cursor-pointer'}`}
            >
              <div className="relative px-3 py-2">
                {showResults && (
                  <div
                    className="absolute inset-0 bg-indigo-100 rounded-lg transition-all"
                    style={{ width: `${percentage}%` }}
                  />
                )}
                <div className="relative flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {!showResults && (
                      <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${isSelected ? 'border-indigo-500 bg-indigo-500' : 'border-gray-300'}`}>
                        {isSelected && <Check className="w-2.5 h-2.5 text-white" />}
                      </div>
                    )}
                    <span className="text-sm text-gray-700">{option.option_text}</span>
                  </div>
                  {showResults && (
                    <span className="text-xs font-medium text-gray-500">{percentage}% ({option.vote_count}표)</span>
                  )}
                </div>
              </div>
            </button>
          )
        })}
      </div>

      {!showResults && (
        <Button onClick={handleVote} disabled={selectedOptions.length === 0 || voting} className="w-full mt-3" size="sm">
          {voting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
          투표하기
        </Button>
      )}

      <p className="text-xs text-gray-400 mt-2 text-center">
        {totalVotes}명 참여
        {poll.is_multiple_choice && ' · 복수 선택 가능'}
        {poll.ends_at && ` · ${isExpired ? '투표 종료' : `${new Date(poll.ends_at).toLocaleDateString('ko-KR')}까지`}`}
      </p>
    </div>
  )
}
