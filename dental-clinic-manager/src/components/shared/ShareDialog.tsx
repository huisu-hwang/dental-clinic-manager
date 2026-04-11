'use client'

import { useState, useEffect } from 'react'
import { X, Link, Copy, Check, Globe, Lock, Trash2 } from 'lucide-react'
import { sharedLinkService } from '@/lib/sharedLinkService'
import type { SourceType, AccessLevel, SharedLink } from '@/types/sharedLink'
import { ACCESS_LEVEL_LABELS } from '@/types/sharedLink'

interface ShareDialogProps {
  isOpen: boolean
  onClose: () => void
  sourceType: SourceType
  sourceId: string
}

export default function ShareDialog({ isOpen, onClose, sourceType, sourceId }: ShareDialogProps) {
  const [accessLevel, setAccessLevel] = useState<AccessLevel>('public')
  const [existingLinks, setExistingLinks] = useState<SharedLink[]>([])
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // 열릴 때 기존 링크 조회
  useEffect(() => {
    if (isOpen) {
      loadExistingLinks()
    }
  }, [isOpen, sourceType, sourceId])

  const loadExistingLinks = async () => {
    setLoading(true)
    setError(null)
    const { data, error: err } = await sharedLinkService.getSharedLinks(sourceType, sourceId)
    if (err) setError(err)
    setExistingLinks(data)
    setLoading(false)
  }

  const handleCreate = async () => {
    setCreating(true)
    setError(null)
    const { data, error: err } = await sharedLinkService.createSharedLink({
      source_type: sourceType,
      source_id: sourceId,
      access_level: accessLevel,
    })
    if (err) {
      setError(err)
    } else if (data) {
      setExistingLinks(prev => [...prev.filter(l => l.access_level !== data.access_level), data])
    }
    setCreating(false)
  }

  const handleDeactivate = async (link: SharedLink) => {
    const { success, error: err } = await sharedLinkService.deactivateSharedLink(link.id)
    if (err) {
      setError(err)
    } else if (success) {
      setExistingLinks(prev => prev.filter(l => l.id !== link.id))
    }
  }

  const handleCopy = async (token: string) => {
    const url = sharedLinkService.getShareUrl(token)
    try {
      await navigator.clipboard.writeText(url)
      setCopied(token)
      setTimeout(() => setCopied(null), 2000)
    } catch {
      // 클립보드 API 실패 시 fallback
      const textarea = document.createElement('textarea')
      textarea.value = url
      document.body.appendChild(textarea)
      textarea.select()
      document.execCommand('copy')
      document.body.removeChild(textarea)
      setCopied(token)
      setTimeout(() => setCopied(null), 2000)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 오버레이 */}
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />

      {/* 모달 */}
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-4 border-b border-at-border">
          <h2 className="text-lg font-bold text-at-text flex items-center gap-2">
            <Link className="w-5 h-5 text-at-accent" />
            링크 공유
          </h2>
          <button onClick={onClose} className="p-1 text-at-text-weak hover:text-at-text-secondary rounded-xl hover:bg-at-surface-alt">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* 에러 표시 */}
          {error && (
            <div className="p-3 bg-at-error-bg text-at-error text-sm rounded-xl">
              {error}
            </div>
          )}

          {/* 기존 활성 링크 */}
          {existingLinks.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-at-text-secondary">활성 공유 링크</p>
              {existingLinks.map(link => (
                <div key={link.id} className="p-3 bg-at-surface-alt rounded-xl space-y-2">
                  <div className="flex items-center gap-2">
                    {link.access_level === 'public' ? (
                      <Globe className="w-4 h-4 text-at-success" />
                    ) : (
                      <Lock className="w-4 h-4 text-orange-500" />
                    )}
                    <span className="text-sm text-at-text-secondary">
                      {ACCESS_LEVEL_LABELS[link.access_level as AccessLevel]}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={sharedLinkService.getShareUrl(link.token)}
                      className="flex-1 text-xs bg-white border border-at-border rounded px-2 py-1.5 text-at-text-secondary truncate"
                    />
                    <button
                      onClick={() => handleCopy(link.token)}
                      className={`p-1.5 rounded-xl transition-colors ${
                        copied === link.token
                          ? 'bg-at-success-bg text-at-success'
                          : 'bg-at-tag text-at-accent hover:bg-blue-200'
                      }`}
                      title="링크 복사"
                    >
                      {copied === link.token ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => handleDeactivate(link)}
                      className="p-1.5 rounded-xl bg-at-error-bg text-red-500 hover:bg-at-error-bg transition-colors"
                      title="공유 해제"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 새 링크 생성 */}
          <div className="space-y-3">
            <p className="text-sm font-medium text-at-text-secondary">새 공유 링크 만들기</p>

            {/* 접근 옵션 */}
            <div className="space-y-2">
              <label
                className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${
                  accessLevel === 'public'
                    ? 'border-at-accent bg-at-accent-light'
                    : 'border-at-border hover:border-at-border'
                }`}
                onClick={() => setAccessLevel('public')}
              >
                <input
                  type="radio"
                  name="accessLevel"
                  checked={accessLevel === 'public'}
                  onChange={() => setAccessLevel('public')}
                  className="sr-only"
                />
                <Globe className={`w-5 h-5 ${accessLevel === 'public' ? 'text-at-accent' : 'text-at-text-weak'}`} />
                <div>
                  <p className={`text-sm font-medium ${accessLevel === 'public' ? 'text-blue-900' : 'text-at-text-secondary'}`}>
                    링크를 가진 모든 사람
                  </p>
                  <p className="text-xs text-at-text-weak">로그인 없이 누구나 볼 수 있습니다</p>
                </div>
              </label>

              <label
                className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-colors ${
                  accessLevel === 'authenticated'
                    ? 'border-at-accent bg-at-accent-light'
                    : 'border-at-border hover:border-at-border'
                }`}
                onClick={() => setAccessLevel('authenticated')}
              >
                <input
                  type="radio"
                  name="accessLevel"
                  checked={accessLevel === 'authenticated'}
                  onChange={() => setAccessLevel('authenticated')}
                  className="sr-only"
                />
                <Lock className={`w-5 h-5 ${accessLevel === 'authenticated' ? 'text-at-accent' : 'text-at-text-weak'}`} />
                <div>
                  <p className={`text-sm font-medium ${accessLevel === 'authenticated' ? 'text-blue-900' : 'text-at-text-secondary'}`}>
                    서비스 가입자만
                  </p>
                  <p className="text-xs text-at-text-weak">로그인한 사용자만 볼 수 있습니다</p>
                </div>
              </label>
            </div>

            {/* 생성 버튼 */}
            <button
              onClick={handleCreate}
              disabled={creating || loading}
              className="w-full py-2.5 bg-at-accent text-white font-medium rounded-xl hover:bg-at-accent-hover disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {creating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  생성 중...
                </>
              ) : (
                <>
                  <Link className="w-4 h-4" />
                  링크 생성
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
