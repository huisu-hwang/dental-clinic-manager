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
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Link className="w-5 h-5 text-blue-600" />
            링크 공유
          </h2>
          <button onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {/* 에러 표시 */}
          {error && (
            <div className="p-3 bg-red-50 text-red-700 text-sm rounded-lg">
              {error}
            </div>
          )}

          {/* 기존 활성 링크 */}
          {existingLinks.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-gray-700">활성 공유 링크</p>
              {existingLinks.map(link => (
                <div key={link.id} className="p-3 bg-gray-50 rounded-lg space-y-2">
                  <div className="flex items-center gap-2">
                    {link.access_level === 'public' ? (
                      <Globe className="w-4 h-4 text-green-600" />
                    ) : (
                      <Lock className="w-4 h-4 text-orange-500" />
                    )}
                    <span className="text-sm text-gray-600">
                      {ACCESS_LEVEL_LABELS[link.access_level as AccessLevel]}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={sharedLinkService.getShareUrl(link.token)}
                      className="flex-1 text-xs bg-white border border-gray-200 rounded px-2 py-1.5 text-gray-600 truncate"
                    />
                    <button
                      onClick={() => handleCopy(link.token)}
                      className={`p-1.5 rounded-lg transition-colors ${
                        copied === link.token
                          ? 'bg-green-100 text-green-600'
                          : 'bg-blue-100 text-blue-600 hover:bg-blue-200'
                      }`}
                      title="링크 복사"
                    >
                      {copied === link.token ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => handleDeactivate(link)}
                      className="p-1.5 rounded-lg bg-red-50 text-red-500 hover:bg-red-100 transition-colors"
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
            <p className="text-sm font-medium text-gray-700">새 공유 링크 만들기</p>

            {/* 접근 옵션 */}
            <div className="space-y-2">
              <label
                className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                  accessLevel === 'public'
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
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
                <Globe className={`w-5 h-5 ${accessLevel === 'public' ? 'text-blue-600' : 'text-gray-400'}`} />
                <div>
                  <p className={`text-sm font-medium ${accessLevel === 'public' ? 'text-blue-900' : 'text-gray-700'}`}>
                    링크를 가진 모든 사람
                  </p>
                  <p className="text-xs text-gray-500">로그인 없이 누구나 볼 수 있습니다</p>
                </div>
              </label>

              <label
                className={`flex items-center gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                  accessLevel === 'authenticated'
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
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
                <Lock className={`w-5 h-5 ${accessLevel === 'authenticated' ? 'text-blue-600' : 'text-gray-400'}`} />
                <div>
                  <p className={`text-sm font-medium ${accessLevel === 'authenticated' ? 'text-blue-900' : 'text-gray-700'}`}>
                    서비스 가입자만
                  </p>
                  <p className="text-xs text-gray-500">로그인한 사용자만 볼 수 있습니다</p>
                </div>
              </label>
            </div>

            {/* 생성 버튼 */}
            <button
              onClick={handleCreate}
              disabled={creating || loading}
              className="w-full py-2.5 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
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
