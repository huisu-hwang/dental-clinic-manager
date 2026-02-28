'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Users, Loader2, CheckCircle, AlertCircle, Send } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/contexts/AuthContext'

interface TelegramInviteJoinProps {
  inviteCode: string
}

export default function TelegramInviteJoin({ inviteCode }: TelegramInviteJoinProps) {
  const router = useRouter()
  const { user, loading: authLoading } = useAuth()
  const [groupInfo, setGroupInfo] = useState<{ board_title: string; board_description: string | null; board_slug: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [joined, setJoined] = useState(false)

  // 초대 링크 검증
  useEffect(() => {
    if (authLoading) return
    if (!user) {
      // 비로그인 → 로그인 후 돌아오기
      router.push(`/?redirect=/community/telegram/join/${inviteCode}`)
      return
    }

    const validateInvite = async () => {
      try {
        const res = await fetch(`/api/telegram/join/${inviteCode}`)
        const data = await res.json()
        if (!res.ok) {
          if (data.alreadyMember) {
            // 이미 멤버 → 게시판으로 리다이렉트
            router.replace(`/community/telegram/${data.boardSlug}`)
            return
          }
          setError(data.error || '유효하지 않은 초대 링크입니다')
        } else {
          setGroupInfo(data)
        }
      } catch {
        setError('초대 링크를 확인하는 중 오류가 발생했습니다')
      } finally {
        setLoading(false)
      }
    }

    validateInvite()
  }, [inviteCode, user, authLoading, router])

  // 가입 처리
  const handleJoin = async () => {
    setJoining(true)
    setError(null)
    try {
      const res = await fetch(`/api/telegram/join/${inviteCode}`, {
        method: 'POST',
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || '가입에 실패했습니다')
      } else {
        setJoined(true)
        setTimeout(() => {
          router.push(`/community/telegram/${data.boardSlug}`)
        }, 1500)
      }
    } catch {
      setError('가입 처리 중 오류가 발생했습니다')
    } finally {
      setJoining(false)
    }
  }

  if (authLoading || loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-sky-500 mx-auto mb-3" />
          <p className="text-sm text-gray-500">초대 링크 확인 중...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center max-w-sm">
          <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-7 h-7 text-red-500" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">초대 링크 오류</h2>
          <p className="text-sm text-gray-500 mb-6">{error}</p>
          <Button variant="outline" onClick={() => router.push('/community/telegram')}>
            게시판 목록으로
          </Button>
        </div>
      </div>
    )
  }

  if (joined) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-7 h-7 text-green-500" />
          </div>
          <h2 className="text-lg font-semibold text-gray-900 mb-2">가입 완료!</h2>
          <p className="text-sm text-gray-500">게시판으로 이동합니다...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        {/* 헤더 */}
        <div className="bg-gradient-to-r from-sky-500 to-blue-600 px-6 py-8 text-center">
          <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Send className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-xl font-bold text-white">텔레그램 모임 초대</h2>
        </div>

        {/* 그룹 정보 */}
        <div className="p-6">
          {groupInfo && (
            <div className="text-center mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-1">
                {groupInfo.board_title}
              </h3>
              {groupInfo.board_description && (
                <p className="text-sm text-gray-500">{groupInfo.board_description}</p>
              )}
            </div>
          )}

          <div className="flex items-center gap-2 text-xs text-gray-400 justify-center mb-6">
            <Users className="w-3.5 h-3.5" />
            <span>가입하면 이 모임의 게시판을 열람할 수 있습니다</span>
          </div>

          <Button
            onClick={handleJoin}
            disabled={joining}
            className="w-full bg-sky-500 hover:bg-sky-600 text-white"
          >
            {joining ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />가입 처리 중...
              </>
            ) : (
              '가입하기'
            )}
          </Button>
        </div>
      </div>
    </div>
  )
}
