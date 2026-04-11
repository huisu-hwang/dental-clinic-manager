'use client'

import { useState, useEffect } from 'react'
import { Users, Copy, Check, Trash2, Plus, Link2, Loader2, AlertCircle, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { telegramMemberService, telegramInviteLinkService } from '@/lib/telegramService'
import type { TelegramGroupMember, TelegramInviteLink } from '@/types/telegram'
import { appConfirm } from '@/components/ui/AppDialog'

interface AdminTelegramMembersProps {
  groupId: string
}

export default function AdminTelegramMembers({ groupId }: AdminTelegramMembersProps) {
  const [members, setMembers] = useState<TelegramGroupMember[]>([])
  const [inviteLinks, setInviteLinks] = useState<TelegramInviteLink[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [creatingLink, setCreatingLink] = useState(false)
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null)

  const [showAddMember, setShowAddMember] = useState(false)
  const [addUserId, setAddUserId] = useState('')
  const [addingMember, setAddingMember] = useState(false)

  useEffect(() => {
    fetchData()
  }, [groupId])

  const fetchData = async () => {
    setLoading(true)
    const [membersRes, linksRes] = await Promise.all([
      telegramMemberService.getMembers(groupId),
      telegramInviteLinkService.getInviteLinks(groupId),
    ])
    if (membersRes.data) setMembers(membersRes.data)
    if (linksRes.data) setInviteLinks(linksRes.data)
    setLoading(false)
  }

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

  const handleCopyLink = async (link: TelegramInviteLink) => {
    const url = `${window.location.origin}/community/telegram/join/${link.invite_code}`
    await navigator.clipboard.writeText(url)
    setCopiedLinkId(link.id)
    setTimeout(() => setCopiedLinkId(null), 2000)
  }

  const handleDeactivateLink = async (linkId: string) => {
    const { error: deactivateError } = await telegramInviteLinkService.deactivateLink(linkId)
    if (deactivateError) {
      setError(deactivateError)
    } else {
      setInviteLinks(prev => prev.map(l => l.id === linkId ? { ...l, is_active: false } : l))
    }
  }

  const handleRemoveMember = async (userId: string) => {
    if (!(await appConfirm('이 멤버를 제거하시겠습니까?'))) return
    const { error: removeError } = await telegramMemberService.removeMember(groupId, userId)
    if (removeError) {
      setError(removeError)
    } else {
      setMembers(prev => prev.filter(m => m.user_id !== userId))
    }
  }

  const handleAddMember = async () => {
    if (!addUserId.trim()) return
    setAddingMember(true)
    setError(null)
    const { error: addError } = await telegramMemberService.addMember(groupId, addUserId.trim(), 'admin')
    if (addError) {
      setError(addError)
    } else {
      setAddUserId('')
      setShowAddMember(false)
      await fetchData()
    }
    setAddingMember(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-at-accent" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="flex items-center gap-2 text-sm text-at-error bg-at-error-bg px-3 py-2 rounded-xl">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* 초대 링크 섹션 */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-at-text-secondary flex items-center gap-1.5">
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
          <p className="text-xs text-at-text-weak text-center py-3">생성된 초대 링크가 없습니다</p>
        ) : (
          <div className="space-y-2">
            {inviteLinks.map(link => (
              <div
                key={link.id}
                className={`flex items-center gap-2 p-2.5 rounded-xl border text-xs ${
                  link.is_active ? 'border-at-border bg-white' : 'border-at-border bg-at-surface-alt opacity-60'
                }`}
              >
                <code className="flex-1 text-at-text-secondary truncate">
                  /join/{link.invite_code}
                </code>
                <span className="text-at-text-weak flex-shrink-0">
                  {link.use_count}회 사용
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
                      className="h-6 w-6 p-0 text-at-error hover:text-at-error"
                    >
                      <XCircle className="w-3 h-3" />
                    </Button>
                  </>
                ) : (
                  <span className="text-at-text-weak">비활성</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 멤버 목록 섹션 */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-sm font-semibold text-at-text-secondary flex items-center gap-1.5">
            <Users className="w-4 h-4" />멤버 ({members.length}명)
          </h4>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowAddMember(!showAddMember)}
            className="h-7 text-xs"
          >
            <Plus className="w-3 h-3 mr-1" />수동 추가
          </Button>
        </div>

        {showAddMember && (
          <div className="flex gap-2 mb-3">
            <Input
              value={addUserId}
              onChange={e => setAddUserId(e.target.value)}
              placeholder="사용자 ID (UUID)"
              className="h-8 text-xs flex-1"
            />
            <Button
              size="sm"
              onClick={handleAddMember}
              disabled={addingMember || !addUserId.trim()}
              className="h-8 text-xs"
            >
              {addingMember ? <Loader2 className="w-3 h-3 animate-spin" /> : '추가'}
            </Button>
          </div>
        )}

        {members.length === 0 ? (
          <p className="text-xs text-at-text-weak text-center py-3">멤버가 없습니다</p>
        ) : (
          <div className="space-y-1">
            {members.map(member => (
              <div
                key={member.id}
                className="flex items-center justify-between p-2.5 rounded-xl border border-at-border bg-white text-xs"
              >
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 bg-at-tag rounded-full flex items-center justify-center text-at-accent font-medium">
                    {(member.user?.name || '?')[0]}
                  </div>
                  <div>
                    <span className="font-medium text-at-text-secondary">{member.user?.name || member.user_id}</span>
                    {member.user?.email && (
                      <span className="text-at-text-weak ml-1.5">{member.user.email}</span>
                    )}
                  </div>
                  <span className={`px-1.5 py-0.5 rounded-lg text-[10px] ${
                    member.joined_via === 'invite_link' ? 'bg-green-50 text-green-600' : 'bg-at-surface-alt text-at-text-weak'
                  }`}>
                    {member.joined_via === 'invite_link' ? '초대링크' : '관리자'}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleRemoveMember(member.user_id)}
                  className="h-6 w-6 p-0 text-at-error hover:text-at-error"
                >
                  <Trash2 className="w-3 h-3" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
