'use client'

import { useState } from 'react'
import { X, Loader2, Send as SendIcon, Vote } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import TiptapEditor from '@/components/Protocol/TiptapEditor'
import type { CreateContributionVoteDto, ContributionVoteResultVisibility } from '@/types/telegram'

interface ContributionVoteFormProps {
  onSubmit: (data: CreateContributionVoteDto) => Promise<void>
  onCancel: () => void
}

export default function ContributionVoteForm({
  onSubmit,
  onCancel,
}: ContributionVoteFormProps) {
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [maxVotesPerPerson, setMaxVotesPerPerson] = useState(3)
  const [isAnonymous, setIsAnonymous] = useState(true)
  const [showTopN, setShowTopN] = useState<string>('')
  const [resultVisibility, setResultVisibility] = useState<ContributionVoteResultVisibility>('after_vote')
  const [allowSelfVote, setAllowSelfVote] = useState(false)
  const [endsAt, setEndsAt] = useState('')
  const [notifyTelegram, setNotifyTelegram] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return

    setSubmitting(true)
    try {
      await onSubmit({
        title: title.trim(),
        content,
        max_votes_per_person: maxVotesPerPerson,
        is_anonymous: isAnonymous,
        show_top_n: showTopN ? parseInt(showTopN) : null,
        result_visibility: resultVisibility,
        allow_self_vote: allowSelfVote,
        ends_at: endsAt ? new Date(endsAt).toISOString() : null,
        notify_telegram: notifyTelegram,
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-orange-50">
        <h3 className="text-sm font-semibold text-orange-900 flex items-center gap-2">
          <Vote className="w-4 h-4" />
          기여도 투표 만들기
        </h3>
        <button onClick={onCancel} className="text-gray-400 hover:text-gray-600">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* 폼 */}
      <form onSubmit={handleSubmit} className="p-4 space-y-4">
        {/* 제목 */}
        <div>
          <label htmlFor="vote-title" className="block text-sm font-medium text-gray-700 mb-1">
            투표 제목 <span className="text-red-500">*</span>
          </label>
          <Input
            id="vote-title"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="예: 3월 정기모임 기여도 투표"
            className="text-sm"
            required
          />
        </div>

        {/* 설명 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            설명 (선택)
          </label>
          <TiptapEditor
            content={content}
            onChange={setContent}
            placeholder="투표에 대한 설명을 작성하세요..."
          />
        </div>

        {/* 투표 설정 */}
        <div className="bg-gray-50 rounded-lg p-4 space-y-4">
          <h4 className="text-sm font-semibold text-gray-800">투표 설정</h4>

          {/* 1인당 투표 수 */}
          <div>
            <label htmlFor="max-votes" className="block text-sm font-medium text-gray-600 mb-1">
              1인당 투표 수
            </label>
            <select
              id="max-votes"
              value={maxVotesPerPerson}
              onChange={e => setMaxVotesPerPerson(parseInt(e.target.value))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            >
              {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                <option key={n} value={n}>{n}명</option>
              ))}
            </select>
          </div>

          {/* 결과 공개 시점 */}
          <div>
            <label htmlFor="result-visibility" className="block text-sm font-medium text-gray-600 mb-1">
              결과 공개 시점
            </label>
            <select
              id="result-visibility"
              value={resultVisibility}
              onChange={e => setResultVisibility(e.target.value as ContributionVoteResultVisibility)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-transparent"
            >
              <option value="realtime">실시간 공개</option>
              <option value="after_vote">투표 후 공개 (기본)</option>
              <option value="after_end">종료 후 공개</option>
            </select>
            <p className="text-xs text-gray-400 mt-1">
              {resultVisibility === 'realtime' && '투표 전에도 현재 결과를 볼 수 있습니다.'}
              {resultVisibility === 'after_vote' && '본인이 투표한 후에만 결과를 확인할 수 있습니다.'}
              {resultVisibility === 'after_end' && '투표가 종료된 후에만 결과가 공개됩니다.'}
            </p>
          </div>

          {/* 결과 공개 범위 */}
          <div>
            <label htmlFor="show-top-n" className="block text-sm font-medium text-gray-600 mb-1">
              결과 공개 범위
            </label>
            <div className="flex items-center gap-2">
              <Input
                id="show-top-n"
                type="number"
                min="1"
                value={showTopN}
                onChange={e => setShowTopN(e.target.value)}
                placeholder="전체 공개"
                className="text-sm w-32"
              />
              <span className="text-sm text-gray-500">
                {showTopN ? `상위 ${showTopN}명만 공개` : '전체 순위 공개'}
              </span>
            </div>
          </div>

          {/* 토글 옵션들 */}
          <div className="space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={isAnonymous}
                  onChange={e => setIsAnonymous(e.target.checked)}
                  className="sr-only"
                />
                <div className={`w-9 h-5 rounded-full transition-colors ${isAnonymous ? 'bg-orange-500' : 'bg-gray-300'}`}>
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow-sm ${isAnonymous ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </div>
              </div>
              <span className="text-sm text-gray-700">비밀 투표</span>
              <span className="text-xs text-gray-400">(누가 누구에게 투표했는지 비공개)</span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <div className="relative">
                <input
                  type="checkbox"
                  checked={allowSelfVote}
                  onChange={e => setAllowSelfVote(e.target.checked)}
                  className="sr-only"
                />
                <div className={`w-9 h-5 rounded-full transition-colors ${allowSelfVote ? 'bg-orange-500' : 'bg-gray-300'}`}>
                  <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow-sm ${allowSelfVote ? 'translate-x-4' : 'translate-x-0.5'}`} />
                </div>
              </div>
              <span className="text-sm text-gray-700">본인 투표 허용</span>
              <span className="text-xs text-gray-400">(자기 자신에게 투표 가능)</span>
            </label>
          </div>

          {/* 종료 시간 */}
          <div>
            <label htmlFor="ends-at" className="block text-sm font-medium text-gray-600 mb-1">
              종료 시간 (선택)
            </label>
            <Input
              id="ends-at"
              type="datetime-local"
              value={endsAt}
              onChange={e => setEndsAt(e.target.value)}
              className="text-sm"
            />
            <p className="text-xs text-gray-400 mt-1">
              비워두면 수동으로 종료할 때까지 진행됩니다.
            </p>
          </div>
        </div>

        {/* 텔레그램 알림 */}
        <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
          <input
            type="checkbox"
            checked={notifyTelegram}
            onChange={e => setNotifyTelegram(e.target.checked)}
            className="rounded border-gray-300 text-orange-600 focus:ring-orange-500"
          />
          <SendIcon className="w-3.5 h-3.5 text-sky-500" />
          텔레그램 그룹에 알림 전송
        </label>

        {/* 버튼 */}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" size="sm" onClick={onCancel} disabled={submitting}>
            취소
          </Button>
          <Button
            type="submit"
            size="sm"
            disabled={submitting || !title.trim()}
            className="bg-orange-600 hover:bg-orange-700"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-1" />
                생성 중...
              </>
            ) : (
              <>
                <Vote className="w-4 h-4 mr-1" />
                투표 만들기
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  )
}
