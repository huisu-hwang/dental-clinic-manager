'use client'

import { useState } from 'react'
import { User, Check, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { communityProfileService } from '@/lib/communityService'
import type { CommunityProfile } from '@/types/community'

interface NicknameChangeModalProps {
  currentNickname: string
  onClose: () => void
  onComplete: (profile: CommunityProfile) => void
}

export default function NicknameChangeModal({ currentNickname, onClose, onComplete }: NicknameChangeModalProps) {
  const [nickname, setNickname] = useState(currentNickname)
  const [checking, setChecking] = useState(false)
  const [available, setAvailable] = useState<boolean | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isSame = nickname.trim() === currentNickname
  const canSubmit = !isSame && available === true && nickname.length >= 2 && !submitting

  const checkNickname = async () => {
    if (nickname.length < 2) {
      setAvailable(null)
      return
    }
    if (isSame) {
      setAvailable(null)
      return
    }
    setChecking(true)
    const { available: isAvailable } = await communityProfileService.checkNicknameAvailable(nickname, true)
    setAvailable(isAvailable)
    setChecking(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return

    setSubmitting(true)
    setError(null)

    const { data, error: updateError } = await communityProfileService.updateProfile({ nickname: nickname.trim() })
    if (updateError || !data) {
      setError(updateError || '닉네임 변경에 실패했습니다.')
      setSubmitting(false)
      return
    }
    onComplete(data)
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-at-card max-w-md w-full p-6">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-at-tag rounded-full flex items-center justify-center">
              <User className="w-5 h-5 text-at-accent" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-at-text">닉네임 변경</h2>
              <p className="text-xs text-at-text-secondary mt-0.5">
                현재: <span className="font-medium text-at-text">{currentNickname}</span>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-at-text-weak hover:text-at-text rounded-lg hover:bg-at-surface-alt transition-colors"
            aria-label="닫기"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-at-text-secondary mb-1">새 닉네임</label>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Input
                  type="text"
                  value={nickname}
                  onChange={(e) => {
                    setNickname(e.target.value)
                    setAvailable(null)
                  }}
                  placeholder="2~20자 닉네임"
                  maxLength={20}
                  className="pr-10"
                  autoFocus
                />
                {available !== null && !isSame && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {available ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <X className="w-4 h-4 text-at-error" />
                    )}
                  </div>
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={checkNickname}
                disabled={nickname.length < 2 || checking || isSame}
              >
                {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : '중복확인'}
              </Button>
            </div>
            {isSame && (
              <p className="text-xs text-at-text-weak mt-1">현재 닉네임과 동일합니다.</p>
            )}
            {!isSame && available === false && (
              <p className="text-xs text-at-error mt-1">이미 사용 중인 닉네임입니다.</p>
            )}
            {!isSame && available === true && (
              <p className="text-xs text-green-500 mt-1">사용 가능한 닉네임입니다.</p>
            )}
          </div>

          <div className="text-xs text-at-text-secondary bg-at-surface-alt rounded-xl p-3 leading-relaxed">
            닉네임을 변경하면 이전에 작성한 모든 게시글·댓글에도 새 닉네임으로 표시됩니다.
          </div>

          {error && (
            <p className="text-sm text-at-error">{error}</p>
          )}

          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={submitting}
              className="flex-1"
            >
              취소
            </Button>
            <Button
              type="submit"
              disabled={!canSubmit}
              className="flex-1"
            >
              {submitting ? (
                <><Loader2 className="w-4 h-4 animate-spin mr-2" /> 변경 중...</>
              ) : (
                '변경하기'
              )}
            </Button>
          </div>
        </form>
      </div>
    </div>
  )
}
