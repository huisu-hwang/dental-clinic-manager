'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
  PlusIcon,
  TrashIcon,
  ArrowPathIcon,
} from '@heroicons/react/24/outline'

type EmailProvider = 'gmail' | 'naver'

interface EmailSettings {
  provider: EmailProvider | null
  emailAddress: string | null
  isActive: boolean
  labSenderEmails: string[]
  taxOfficeSenderEmails: string[]
  lastCheckedAt: string | null
}

export default function EmailIntegrationSettings() {
  const { user } = useAuth()
  const clinicId = user?.clinic_id

  const [settings, setSettings] = useState<EmailSettings>({
    provider: null,
    emailAddress: null,
    isActive: false,
    labSenderEmails: [],
    taxOfficeSenderEmails: [],
    lastCheckedAt: null,
  })
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  // Naver mail form state
  const [selectedProvider, setSelectedProvider] = useState<EmailProvider>('gmail')
  const [naverEmail, setNaverEmail] = useState('')
  const [naverPassword, setNaverPassword] = useState('')

  // Sender email input state
  const [newLabEmail, setNewLabEmail] = useState('')
  const [newTaxEmail, setNewTaxEmail] = useState('')

  // Local editable lists (before save)
  const [labEmails, setLabEmails] = useState<string[]>([])
  const [taxEmails, setTaxEmails] = useState<string[]>([])
  const [monitoringActive, setMonitoringActive] = useState(false)

  const loadSettings = useCallback(async () => {
    if (!clinicId) return
    setIsLoading(true)
    try {
      const res = await fetch(`/api/integrations/email/settings?clinicId=${clinicId}`)
      const json = await res.json()
      if (res.ok && json.data) {
        const d = json.data as EmailSettings
        setSettings(d)
        setSelectedProvider(d.provider ?? 'gmail')
        setLabEmails(d.labSenderEmails ?? [])
        setTaxEmails(d.taxOfficeSenderEmails ?? [])
        setMonitoringActive(d.isActive ?? false)
      }
    } catch {
      // silent
    } finally {
      setIsLoading(false)
    }
  }, [clinicId])

  useEffect(() => {
    loadSettings()
  }, [loadSettings])

  const showMsg = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 4000)
  }

  const handleGmailConnect = () => {
    if (!clinicId) return
    window.location.href = `/api/integrations/gmail/auth?clinicId=${clinicId}`
  }

  const handleNaverConnect = async () => {
    if (!clinicId) return
    if (!naverEmail || !naverPassword) {
      showMsg('error', '이메일과 앱 비밀번호를 모두 입력해주세요.')
      return
    }
    setIsConnecting(true)
    try {
      const res = await fetch('/api/integrations/naver-mail/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clinicId, email: naverEmail, password: naverPassword }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      showMsg('success', '네이버 메일 연결 정보가 저장되었습니다.')
      setNaverPassword('')
      await loadSettings()
    } catch (err) {
      showMsg('error', err instanceof Error ? err.message : '연결 실패')
    } finally {
      setIsConnecting(false)
    }
  }

  const handleDisconnect = async () => {
    if (!clinicId || !confirm('이메일 연동을 해제하시겠습니까?')) return
    try {
      const res = await fetch('/api/integrations/email/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinicId,
          disconnect: true,
        }),
      })
      if (!res.ok) throw new Error('해제 실패')
      showMsg('success', '연동이 해제되었습니다.')
      await loadSettings()
    } catch (err) {
      showMsg('error', err instanceof Error ? err.message : '해제 실패')
    }
  }

  const handleSaveSettings = async () => {
    if (!clinicId) return
    setIsSaving(true)
    try {
      const res = await fetch('/api/integrations/email/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinicId,
          labSenderEmails: labEmails,
          taxOfficeSenderEmails: taxEmails,
          isActive: monitoringActive,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      showMsg('success', '설정이 저장되었습니다.')
      await loadSettings()
    } catch (err) {
      showMsg('error', err instanceof Error ? err.message : '저장 실패')
    } finally {
      setIsSaving(false)
    }
  }

  const addLabEmail = () => {
    const v = newLabEmail.trim()
    if (!v || labEmails.includes(v)) return
    setLabEmails([...labEmails, v])
    setNewLabEmail('')
  }

  const addTaxEmail = () => {
    const v = newTaxEmail.trim()
    if (!v || taxEmails.includes(v)) return
    setTaxEmails([...taxEmails, v])
    setNewTaxEmail('')
  }

  const isConnected = !!settings.emailAddress

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <ArrowPathIcon className="h-5 w-5 text-slate-400 animate-spin" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Section Header */}
      <div className="flex items-center gap-2">
        <span className="text-base font-semibold text-slate-800">이메일 자동 모니터링</span>
      </div>

      {/* Provider Selection & Connection */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-5 space-y-4">
        {/* Provider radio */}
        <div>
          <p className="text-sm font-medium text-slate-700 mb-2">이메일 서비스</p>
          <div className="flex gap-4">
            {(['gmail', 'naver'] as EmailProvider[]).map((p) => (
              <label key={p} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="emailProvider"
                  value={p}
                  checked={selectedProvider === p}
                  onChange={() => setSelectedProvider(p)}
                  className="w-4 h-4 text-blue-600 border-slate-300 focus:ring-blue-500"
                />
                <span className="text-sm text-slate-700">
                  {p === 'gmail' ? 'Gmail' : '네이버 메일'}
                </span>
              </label>
            ))}
          </div>
        </div>

        {/* Connection status / form */}
        {isConnected && settings.provider === selectedProvider ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded-lg px-3 py-2">
              <CheckCircleIcon className="h-4 w-4 flex-shrink-0" />
              <span>연결됨 — {settings.emailAddress}</span>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleDisconnect}
                className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg text-slate-600 hover:bg-white transition-colors"
              >
                연동 해제
              </button>
              {selectedProvider === 'gmail' && (
                <button
                  onClick={handleGmailConnect}
                  className="px-3 py-1.5 text-sm border border-blue-300 text-blue-600 rounded-lg hover:bg-blue-50 transition-colors"
                >
                  다시 연동
                </button>
              )}
            </div>
          </div>
        ) : selectedProvider === 'gmail' ? (
          <button
            onClick={handleGmailConnect}
            className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Gmail 연동하기
          </button>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">이메일</label>
              <input
                type="email"
                value={naverEmail}
                onChange={(e) => setNaverEmail(e.target.value)}
                placeholder="example@naver.com"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">앱 비밀번호</label>
              <input
                type="password"
                value={naverPassword}
                onChange={(e) => setNaverPassword(e.target.value)}
                placeholder="네이버 앱 비밀번호 16자리"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleNaverConnect}
                disabled={isConnecting}
                className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
              >
                {isConnecting ? '저장 중...' : '저장'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Sender email lists */}
      <div className="space-y-5">
        {/* Lab emails */}
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-5 space-y-3">
          <p className="text-sm font-medium text-slate-700">기공소 이메일</p>
          <div className="flex gap-2">
            <input
              type="email"
              value={newLabEmail}
              onChange={(e) => setNewLabEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addLabEmail()}
              placeholder="lab@example.com"
              className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <button
              onClick={addLabEmail}
              className="px-3 py-2 text-sm bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg transition-colors flex items-center gap-1"
            >
              <PlusIcon className="h-4 w-4" />
              추가
            </button>
          </div>
          {labEmails.length > 0 && (
            <ul className="space-y-1">
              {labEmails.map((email) => (
                <li key={email} className="flex items-center justify-between text-sm text-slate-600 bg-white rounded-lg px-3 py-2 border border-slate-100">
                  <span>{email}</span>
                  <button
                    onClick={() => setLabEmails(labEmails.filter((e) => e !== email))}
                    className="text-slate-400 hover:text-red-500 transition-colors"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Tax office emails */}
        <div className="bg-slate-50 rounded-xl border border-slate-200 p-5 space-y-3">
          <p className="text-sm font-medium text-slate-700">세무사무소 이메일</p>
          <div className="flex gap-2">
            <input
              type="email"
              value={newTaxEmail}
              onChange={(e) => setNewTaxEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addTaxEmail()}
              placeholder="tax@example.com"
              className="flex-1 px-3 py-2 text-sm border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <button
              onClick={addTaxEmail}
              className="px-3 py-2 text-sm bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg transition-colors flex items-center gap-1"
            >
              <PlusIcon className="h-4 w-4" />
              추가
            </button>
          </div>
          {taxEmails.length > 0 && (
            <ul className="space-y-1">
              {taxEmails.map((email) => (
                <li key={email} className="flex items-center justify-between text-sm text-slate-600 bg-white rounded-lg px-3 py-2 border border-slate-100">
                  <span>{email}</span>
                  <button
                    onClick={() => setTaxEmails(taxEmails.filter((e) => e !== email))}
                    className="text-slate-400 hover:text-red-500 transition-colors"
                  >
                    <TrashIcon className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Monitoring toggle */}
      <div className="bg-slate-50 rounded-xl border border-slate-200 p-5 space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-700">이메일 자동 모니터링 활성화</p>
            {settings.lastCheckedAt && (
              <p className="text-xs text-slate-400 mt-0.5">
                마지막 확인:{' '}
                {new Date(settings.lastCheckedAt).toLocaleString('ko-KR', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </p>
            )}
          </div>
          <button
            onClick={() => setMonitoringActive(!monitoringActive)}
            className={`relative w-11 h-6 rounded-full transition-colors ${monitoringActive ? 'bg-blue-600' : 'bg-slate-300'}`}
          >
            <span
              className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${monitoringActive ? 'translate-x-5' : ''}`}
            />
          </button>
        </div>
      </div>

      {/* Message */}
      {message && (
        <div
          className={`flex items-center gap-2 text-sm p-3 rounded-lg ${
            message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircleIcon className="h-4 w-4 flex-shrink-0" />
          ) : (
            <ExclamationTriangleIcon className="h-4 w-4 flex-shrink-0" />
          )}
          {message.text}
        </div>
      )}

      {/* Save button */}
      <div className="flex justify-end">
        <button
          onClick={handleSaveSettings}
          disabled={isSaving}
          className="px-5 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
        >
          {isSaving ? '저장 중...' : '설정 저장'}
        </button>
      </div>
    </div>
  )
}
