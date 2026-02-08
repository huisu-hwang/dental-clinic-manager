'use client'

import { useState } from 'react'
import { User, Check, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { communityProfileService } from '@/lib/communityService'

interface NicknameSetupModalProps {
  onComplete: () => void
}

export default function NicknameSetupModal({ onComplete }: NicknameSetupModalProps) {
  const [nickname, setNickname] = useState('')
  const [checking, setChecking] = useState(false)
  const [available, setAvailable] = useState<boolean | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const checkNickname = async () => {
    if (nickname.length < 2) {
      setAvailable(null)
      return
    }
    setChecking(true)
    const { available: isAvailable } = await communityProfileService.checkNicknameAvailable(nickname)
    setAvailable(isAvailable)
    setChecking(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!available || nickname.length < 2) return

    setSubmitting(true)
    setError(null)

    const { error: createError } = await communityProfileService.createProfile(nickname)
    if (createError) {
      setError(createError)
      setSubmitting(false)
    } else {
      onComplete()
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6">
        <div className="text-center mb-6">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <User className="w-8 h-8 text-blue-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">커뮤니티 닉네임 설정</h2>
          <p className="text-sm text-gray-500 mt-2">
            커뮤니티에서 사용할 닉네임을 설정해주세요.<br />
            닉네임은 다른 사용자에게 공개됩니다.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">닉네임</label>
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
                />
                {available !== null && (
                  <div className="absolute right-3 top-1/2 -translate-y-1/2">
                    {available ? (
                      <Check className="w-4 h-4 text-green-500" />
                    ) : (
                      <X className="w-4 h-4 text-red-500" />
                    )}
                  </div>
                )}
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={checkNickname}
                disabled={nickname.length < 2 || checking}
              >
                {checking ? <Loader2 className="w-4 h-4 animate-spin" /> : '중복확인'}
              </Button>
            </div>
            {available === false && (
              <p className="text-xs text-red-500 mt-1">이미 사용 중인 닉네임입니다.</p>
            )}
            {available === true && (
              <p className="text-xs text-green-500 mt-1">사용 가능한 닉네임입니다.</p>
            )}
          </div>

          {error && (
            <p className="text-sm text-red-500">{error}</p>
          )}

          <Button
            type="submit"
            className="w-full"
            disabled={!available || submitting}
          >
            {submitting ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-2" /> 설정 중...</>
            ) : (
              '닉네임 설정 완료'
            )}
          </Button>
        </form>
      </div>
    </div>
  )
}
