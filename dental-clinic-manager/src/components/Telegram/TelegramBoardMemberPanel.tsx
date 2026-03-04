'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import {
  X, Users, Copy, Check, Trash2, Plus, Link2, Loader2,
  AlertCircle, XCircle, Search, UserPlus, Mail, Globe,
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { telegramMemberService, telegramInviteLinkService, telegramGroupService } from '@/lib/telegramService'
import type { TelegramGroupMember, TelegramInviteLink, TelegramGroupVisibility } from '@/types/telegram'
import { TELEGRAM_VISIBILITY_LABELS, TELEGRAM_VISIBILITY_DESCRIPTIONS } from '@/types/telegram'
import { appConfirm } from '@/components/ui/AppDialog'

interface TelegramBoardMemberPanelProps {
  groupId: string
  currentUserId: string
  createdBy: string
  isOpen: boolean
  onClose: () => void
  currentVisibility?: TelegramGroupVisibility
  onVisibilityChange?: (visibility: TelegramGroupVisibility) => void
}

export default function TelegramBoardMemberPanel({
  groupId,
  currentUserId,
  createdBy,
  isOpen,
  onClose,
  currentVisibility = 'private',
  onVisibilityChange,
}: TelegramBoardMemberPanelProps) {
  const [members, setMembers] = useState<TelegramGroupMember[]>([])
  const [inviteLinks, setInviteLinks] = useState<TelegramInviteLink[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 초대 링크
  const [creatingLink, setCreatingLink] = useState(false)
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null)

  // 공개 설정
  const [visibility, setVisibility] = useState<TelegramGroupVisibility>(currentVisibility)
  const [savingVisibility, setSavingVisibility] = useState(false)

  // 사용자 검색
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<{ id: string; name: string; email: string }[]>([])
  const [searching, setSearching] = useState(false)
  const [showSearch, setShowSearch] = useState(false)
  const [addingUserId, setAddingUserId] = useState<string | null>(null)
  const [sendingInvite, setSendingInvite] = useState(false)
  const [inviteSent, setInviteSent] = useState<string | null>(null)
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // 공개 범위 변경
  const handleVisibilityChange = async (newVisibility: TelegramGroupVisibility) => {
    setVisibility(newVisibility)
    setSavingVisibility(true)
    setError(null)
    const { error: updateError } = await telegramGroupService.updateGroup(groupId, { visibility: newVisibility })
    if (updateError) {
      setError(updateError)
      setVisibility(currentVisibility) // revert
    } else {
      onVisibilityChange?.(newVisibility)
    }
    setSavingVisibility(false)
  }

  // 이메일 유효성 검사
  const isValidEmail = (str: string) => /^[\w-.]+@([\w-]+\.)+[\w-]{2,4}$/.test(str)

  // 이메일 초대 핸들러
  const handleSendEmailInvite = async () => {
    setSendingInvite(true)
    setError(null)
    const { data, error: inviteError } = await telegramMemberService.sendEmailInvite(groupId, searchQuery.trim())
    if (inviteError) {
      setError(inviteError)
    } else {
      setInviteSent(searchQuery.trim())
      setSearchQuery('')
      setSearchResults([])
      // 생성/재사용된 초대 링크를 목록에 즉시 반영
      if (data?.inviteLink) {
        setInviteLinks(prev => {
          const exists = prev.some(l => l.id === data.inviteLink.id)
          return exists ? prev : [data.inviteLink, ...prev]
        })
      }
    }
    setSendingInvite(false)
  }

  const fetchData = useCallback(async () => {
    setLoading(true)
    const [membersRes, linksRes] = await Promise.all([
      telegramMemberService.getMembers(groupId),
      telegramInviteLinkService.getInviteLinks(groupId),
    ])
    if (membersRes.data) setMembers(membersRes.data)
    if (linksRes.data) setInviteLinks(linksRes.data)
    setLoading(false)
  }, [groupId])

  useEffect(() => {
    if (isOpen) {
      fetchData()
    }
  }, [isOpen, fetchData])

  // 검색 debounce
  useEffect(() => {
    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current)
    }

    if (searchQuery.trim().length < 2) {
      setSearchResults([])
      setSearching(false)
      return
    }

    setSearching(true)
    searchTimeoutRef.current = setTimeout(async () => {
      const { data } = await telegramMemberService.searchUsersForInvite(searchQuery, groupId)
      setSearchResults(data)
      setSearching(false)
    }, 300)

    return () => {
      if (searchTimeoutRef.current) {
        clearTimeout(searchTimeoutRef.current)
      }
    }
  }, [searchQuery, groupId])

  // 초대 링크 생성
  const handleCreateLink = async () => {
    setCreatingLink(true)
    setError(null)
    const { data, error: createError } = await telegramInviteLinkService.createInviteLink({
      telegram_group_id: groupId,
    })
    if (createError) {
      setError(createError)
    } else if (data) {
      setInviteLinks(prev => [data, ...prev])
    }
    setCreatingLink(false)
  }

  // 링크 복사
  const handleCopyLink = async (link: TelegramInviteLink) => {
    const url = `${window.location.origin}/community/telegram/join/${link.invite_code}`
    await navigator.clipboard.writeText(url)
    setCopiedLinkId(link.id)
    setTimeout(() => setCopiedLinkId(null), 2000)
  }

  // 링크 비활성화
  const handleDeactivateLink = async (linkId: string) => {
    const { error: deactivateError } = await telegramInviteLinkService.deactivateLink(linkId)
    if (deactivateError) {
      setError(deactivateError)
    } else {
      setInviteLinks(prev => prev.map(l => l.id === linkId ? { ...l, is_active: false } : l))
    }
  }

  // 검색 결과에서 멤버 추가
  const handleAddFromSearch = async (userId: string) => {
    setAddingUserId(userId)
    setError(null)
    const { error: addError } = await telegramMemberService.addMember(groupId, userId, 'admin')
    if (addError) {
      setError(addError)
    } else {
      // 검색 결과에서 제거
      setSearchResults(prev => prev.filter(u => u.id !== userId))
      // 멤버 목록 새로고침
      const { data: updatedMembers } = await telegramMemberService.getMembers(groupId)
      if (updatedMembers) setMembers(updatedMembers)
    }
    setAddingUserId(null)
  }

  // 멤버 제거
  const handleRemoveMember = async (userId: string) => {
    if (!(await appConfirm('이 멤버를 제거하시겠습니까?'))) return
    const { error: removeError } = await telegramMemberService.removeMember(groupId, userId)
    if (removeError) {
      setError(removeError)
    } else {
      setMembers(prev => prev.filter(m => m.user_id !== userId))
    }
  }

  return (
    <>
      {/* 백드롭 */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/30 z-40 transition-opacity"
          onClick={onClose}
        />
      )}

      {/* 슬라이드 패널 */}
      <div
        className={`
          fixed top-0 right-0 h-full w-full max-w-md bg-white shadow-xl z-50
          transform transition-transform duration-300 ease-in-out
          ${isOpen ? 'translate-x-0' : 'translate-x-full'}
        `}
      >
        {/* 패널 헤더 */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-sky-500" />
            멤버 관리
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* 패널 내용 */}
        <div className="overflow-y-auto h-[calc(100vh-65px)] p-5 space-y-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-sky-500" />
            </div>
          ) : (
            <>
              {error && (
                <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  <span className="flex-1">{error}</span>
                  <button onClick={() => setError(null)}>
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* 공개 설정 섹션 */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5 mb-3">
                  <Globe className="w-4 h-4" />공개 설정
                  {savingVisibility && <Loader2 className="w-3 h-3 animate-spin text-sky-500" />}
                </h4>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(TELEGRAM_VISIBILITY_LABELS) as TelegramGroupVisibility[]).map(v => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => handleVisibilityChange(v)}
                      disabled={savingVisibility}
                      className={`p-2.5 rounded-lg border text-left transition-all ${
                        visibility === v
                          ? 'border-sky-400 bg-sky-50 ring-1 ring-sky-400'
                          : 'border-gray-200 hover:border-gray-300'
                      } ${savingVisibility ? 'opacity-50' : ''}`}
                    >
                      <span className={`text-xs font-semibold ${visibility === v ? 'text-sky-700' : 'text-gray-700'}`}>
                        {TELEGRAM_VISIBILITY_LABELS[v]}
                      </span>
                      <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">
                        {TELEGRAM_VISIBILITY_DESCRIPTIONS[v]}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* 초대 링크 섹션 */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                    <Link2 className="w-4 h-4" />초대 링크
                  </h4>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCreateLink}
                    disabled={creatingLink}
                    className="h-7 text-xs"
                  >
                    {creatingLink ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Plus className="w-3 h-3 mr-1" />}
                    새 링크 생성
                  </Button>
                </div>

                {inviteLinks.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-3">생성된 초대 링크가 없습니다</p>
                ) : (
                  <div className="space-y-2">
                    {inviteLinks.map(link => (
                      <div
                        key={link.id}
                        className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs ${
                          link.is_active ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-60'
                        }`}
                      >
                        <code className="flex-1 text-gray-600 truncate">
                          /join/{link.invite_code}
                        </code>
                        <span className="text-gray-400 flex-shrink-0">
                          {link.use_count}회
                          {link.max_uses && ` / ${link.max_uses}`}
                        </span>
                        {link.is_active ? (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleCopyLink(link)}
                              className="h-6 w-6 p-0"
                            >
                              {copiedLinkId === link.id ? (
                                <Check className="w-3 h-3 text-green-500" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeactivateLink(link.id)}
                              className="h-6 w-6 p-0 text-red-400 hover:text-red-600"
                            >
                              <XCircle className="w-3 h-3" />
                            </Button>
                          </>
                        ) : (
                          <span className="text-gray-400">비활성</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 멤버 추가 (검색) 섹션 */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                    <UserPlus className="w-4 h-4" />멤버 초대
                  </h4>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setShowSearch(!showSearch)
                      if (!showSearch) {
                        setTimeout(() => searchInputRef.current?.focus(), 100)
                      } else {
                        setSearchQuery('')
                        setSearchResults([])
                      }
                    }}
                    className="h-7 text-xs"
                  >
                    {showSearch ? (
                      <><X className="w-3 h-3 mr-1" />닫기</>
                    ) : (
                      <><Search className="w-3 h-3 mr-1" />사용자 검색</>
                    )}
                  </Button>
                </div>

                {inviteSent && (
                  <div className="flex items-center gap-2 text-xs text-green-600 bg-green-50 px-3 py-2 rounded-lg mb-2">
                    <Check className="w-3.5 h-3.5 flex-shrink-0" />
                    <span className="flex-1">{inviteSent}으로 초대 이메일을 발송했습니다</span>
                    <button onClick={() => setInviteSent(null)}>
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                )}

                {showSearch && (
                  <div className="mb-3">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                      <Input
                        ref={searchInputRef}
                        value={searchQuery}
                        onChange={e => setSearchQuery(e.target.value)}
                        placeholder="이름 또는 이메일로 검색 (2글자 이상)"
                        className="h-8 text-xs pl-8"
                      />
                      {searching && (
                        <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-gray-400" />
                      )}
                    </div>

                    {/* 검색 결과 드롭다운 */}
                    {searchQuery.trim().length >= 2 && !searching && (
                      <div className="mt-1.5 border border-gray-200 rounded-lg overflow-hidden">
                        {searchResults.length === 0 ? (
                          <div className="p-3 text-center">
                            <p className="text-xs text-gray-400 mb-2">검색 결과가 없습니다</p>
                            {isValidEmail(searchQuery.trim()) && (
                              <div className="border-t border-gray-100 pt-2 mt-2">
                                <p className="text-xs text-gray-500 mb-2">
                                  <span className="font-medium">{searchQuery.trim()}</span>으로 초대 이메일을 보낼 수 있습니다
                                </p>
                                <Button
                                  size="sm"
                                  onClick={handleSendEmailInvite}
                                  disabled={sendingInvite}
                                  className="h-7 text-xs"
                                >
                                  {sendingInvite ? (
                                    <><Loader2 className="w-3 h-3 animate-spin mr-1" />발송 중...</>
                                  ) : (
                                    <><Mail className="w-3 h-3 mr-1" />이메일로 초대</>
                                  )}
                                </Button>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="max-h-48 overflow-y-auto">
                            {searchResults.map(user => (
                              <div
                                key={user.id}
                                className="flex items-center justify-between px-3 py-2 hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <div className="w-6 h-6 bg-sky-100 rounded-full flex items-center justify-center text-sky-700 text-[10px] font-medium flex-shrink-0">
                                    {(user.name || '?')[0]}
                                  </div>
                                  <div className="min-w-0">
                                    <span className="text-xs font-medium text-gray-700 block truncate">{user.name}</span>
                                    <span className="text-[10px] text-gray-400 block truncate">{user.email}</span>
                                  </div>
                                </div>
                                <Button
                                  size="sm"
                                  onClick={() => handleAddFromSearch(user.id)}
                                  disabled={addingUserId === user.id}
                                  className="h-6 text-[10px] px-2 flex-shrink-0 ml-2"
                                >
                                  {addingUserId === user.id ? (
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                  ) : (
                                    <><Plus className="w-3 h-3 mr-0.5" />초대</>
                                  )}
                                </Button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 멤버 목록 섹션 */}
              <div>
                <h4 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5 mb-3">
                  <Users className="w-4 h-4" />멤버 ({members.length}명)
                </h4>

                {members.length === 0 ? (
                  <p className="text-xs text-gray-400 text-center py-3">멤버가 없습니다</p>
                ) : (
                  <div className="space-y-1">
                    {members.map(member => {
                      const isCreator = member.user_id === createdBy
                      const isSelf = member.user_id === currentUserId
                      const canRemove = !isCreator && !isSelf

                      return (
                        <div
                          key={member.id}
                          className="flex items-center justify-between p-2.5 rounded-lg border border-gray-100 bg-white text-xs"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-7 h-7 bg-sky-100 rounded-full flex items-center justify-center text-sky-700 font-medium flex-shrink-0">
                              {(member.user?.name || '?')[0]}
                            </div>
                            <div className="min-w-0">
                              <div className="flex items-center gap-1.5">
                                <span className="font-medium text-gray-700 truncate">
                                  {member.user?.name || member.user_id}
                                </span>
                                {isCreator && (
                                  <span className="px-1.5 py-0.5 rounded bg-sky-100 text-sky-700 text-[10px] flex-shrink-0">
                                    개설자
                                  </span>
                                )}
                                {isSelf && !isCreator && (
                                  <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 text-[10px] flex-shrink-0">
                                    나
                                  </span>
                                )}
                              </div>
                              {member.user?.email && (
                                <span className="text-gray-400 text-[10px] block truncate">{member.user.email}</span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                              member.joined_via === 'invite_link' ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-500'
                            }`}>
                              {member.joined_via === 'invite_link' ? '초대링크' : '관리자'}
                            </span>
                            {canRemove && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleRemoveMember(member.user_id)}
                                className="h-6 w-6 p-0 text-red-400 hover:text-red-600"
                              >
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </>
  )
}
