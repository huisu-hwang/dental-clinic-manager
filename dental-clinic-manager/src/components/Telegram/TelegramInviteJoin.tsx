'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Users, Loader2, CheckCircle, AlertCircle, Send, LogIn, UserPlus } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { useAuth } from '@/contexts/AuthContext'

interface TelegramInviteJoinProps {
  inviteCode: string
}

export default function TelegramInviteJoin({ inviteCode }: TelegramInviteJoinProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const autoJoin = searchParams.get('autoJoin') === '1'
  const { user, loading: authLoading } = useAuth()
  const [groupInfo, setGroupInfo] = useState<{ board_title: string; board_description: string | null; board_slug: string; requiresAuth?: boolean } | null>(null)
  const [loading, setLoading] = useState(true)
  const [joining, setJoining] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [joined, setJoined] = useState(false)
  const autoJoinTriggered = useRef(false)

  // 초대 링크 검증 — 비로그인도 그룹 정보 조회 가능
  useEffect(() => {
    if (authLoading) return

    const validateInvite = async () => {
      try {
        const headers: Record<string, string> = {}
        if (user?.id) {
          headers['x-user-id'] = user.id
        }

        const res = await fetch(`/api/telegram/join/${inviteCode}`, { headers })
        const data = await res.json()
        if (!res.ok) {
          if (data.alreadyMember) {
            // 이미 멤버 → 게시판으로 리다이렉트
            router.replace(`/dashboard/community/telegram/${data.boardSlug}`)
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
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user?.id }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error || '가입에 실패했습니다')
      } else {
        setJoined(true)
        setTimeout(() => {
          router.push(`/dashboard/community/telegram/${data.boardSlug}`)
        }, 1500)
      }
    } catch {
      setError('가입 처리 중 오류가 발생했습니다')
    } finally {
      setJoining(false)
    }
  }

  // autoJoin=1이면 로그인 상태 + 그룹 정보 로드 완료 시 자동 가입
  useEffect(() => {
    if (user && groupInfo && !groupInfo.requiresAuth && autoJoin && !joined && !joining && !error && !autoJoinTriggered.current) {
      autoJoinTriggered.current = true
      handleJoin()
    }
  }, [user, groupInfo, autoJoin, joined, joining, error])

  if (authLoading || loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-at-accent mx-auto mb-3" />
          <p className="text-sm text-at-text-weak">초대 링크 확인 중...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center max-w-sm">
          <div className="w-14 h-14 bg-at-error-bg rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-7 h-7 text-at-error" />
          </div>
          <h2 className="text-lg font-semibold text-at-text mb-2">초대 링크 오류</h2>
          <p className="text-sm text-at-text-weak mb-6">{error}</p>
          <Button variant="outline" onClick={() => router.push('/dashboard/community/telegram')}>
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
          <div className="w-14 h-14 bg-at-success-bg rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-7 h-7 text-green-500" />
          </div>
          <h2 className="text-lg font-semibold text-at-text mb-2">가입 완료!</h2>
          <p className="text-sm text-at-text-weak">게시판으로 이동합니다...</p>
        </div>
      </div>
    )
  }

  // 비로그인 사용자: 그룹 정보 + 로그인/회원가입 안내
  const isNotLoggedIn = !user || groupInfo?.requiresAuth

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="w-full max-w-sm bg-white rounded-2xl border border-at-border shadow-at-card overflow-hidden">
        {/* 헤더 — sky/blue gradient 유지 (브랜드 색상) */}
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
              <h3 className="text-lg font-semibold text-at-text mb-1">
                {groupInfo.board_title}
              </h3>
              {groupInfo.board_description && (
                <p className="text-sm text-at-text-weak">{groupInfo.board_description}</p>
              )}
            </div>
          )}

          <div className="flex items-center gap-2 text-xs text-at-text-weak justify-center mb-6">
            <Users className="w-3.5 h-3.5" />
            <span>가입하면 이 모임의 게시판을 열람할 수 있습니다</span>
          </div>

          {isNotLoggedIn ? (
            /* 비로그인: 로그인/회원가입 안내 */
            <div className="space-y-3">
              <Button
                onClick={() => {
                  const redirectUrl = `/dashboard/community/telegram/join/${inviteCode}${autoJoin ? '?autoJoin=1' : ''}`
                  router.push(`/?redirect=${encodeURIComponent(redirectUrl)}`)
                }}
                className="w-full bg-sky-500 hover:bg-sky-600 text-white"
              >
                <LogIn className="w-4 h-4 mr-2" />
                로그인하고 가입하기
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  const redirectUrl = `/dashboard/community/telegram/join/${inviteCode}${autoJoin ? '?autoJoin=1' : ''}`
                  router.push(`/?show=signup&redirect=${encodeURIComponent(redirectUrl)}`)
                }}
                className="w-full"
              >
                <UserPlus className="w-4 h-4 mr-2" />
                계정이 없으신가요? 회원가입
              </Button>
            </div>
          ) : (
            /* 로그인 상태: 가입 버튼 */
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
          )}
        </div>
      </div>
    </div>
  )
}
