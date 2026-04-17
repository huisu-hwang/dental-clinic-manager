'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import {
  Link2,
  Shield,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Trash2,
  ExternalLink,
  Zap,
} from 'lucide-react'
import type { BrokerCredentialSafe } from '@/types/investment'

export default function ConnectPage() {
  const { user } = useAuth()
  const [credential, setCredential] = useState<BrokerCredentialSafe | null>(null)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [switchConfirmText, setSwitchConfirmText] = useState('')
  const [switching, setSwitching] = useState(false)

  // 폼 상태
  const [appKey, setAppKey] = useState('')
  const [appSecret, setAppSecret] = useState('')
  const [accountNumber, setAccountNumber] = useState('')
  const [isPaperTrading, setIsPaperTrading] = useState(true)
  const [label, setLabel] = useState('')
  const [agreeTerms, setAgreeTerms] = useState(false)

  useEffect(() => {
    if (user) fetchCredential()
  }, [user])

  async function fetchCredential() {
    try {
      const res = await fetch('/api/investment/credentials')
      const json = await res.json()
      if (json.success) setCredential(json.data)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!agreeTerms) {
      setError('약관에 동의해주세요.')
      return
    }

    setSubmitting(true)
    try {
      const res = await fetch('/api/investment/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ appKey, appSecret, accountNumber, isPaperTrading, label }),
      })
      const json = await res.json()

      if (!res.ok) {
        setError(json.error || '계좌 등록에 실패했습니다.')
        return
      }

      setSuccess('계좌가 성공적으로 연결되었습니다!')
      setCredential(json.data)
      // 폼 초기화
      setAppKey('')
      setAppSecret('')
      setAccountNumber('')
      setLabel('')
    } catch {
      setError('서버 연결에 실패했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleDisconnect() {
    if (!confirm('계좌 연결을 해제하시겠습니까?')) return

    setError('')
    try {
      const res = await fetch('/api/investment/credentials', { method: 'DELETE' })
      const json = await res.json()

      if (!res.ok) {
        setError(json.error || '계좌 해제에 실패했습니다.')
        return
      }

      setCredential(null)
      setSuccess('계좌 연결이 해제되었습니다.')
    } catch {
      setError('서버 연결에 실패했습니다.')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-6 h-6 animate-spin text-at-accent" />
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-bold text-at-text">계좌 연결</h1>
        <p className="text-sm text-at-text-secondary mt-1">한국투자증권(KIS) Open API 계좌를 연결하세요</p>
      </div>

      {/* 에러/성공 메시지 */}
      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-at-error-bg text-at-error text-sm">
          <AlertTriangle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}
      {success && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-at-success-bg text-at-success text-sm">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          {success}
        </div>
      )}

      {/* 이미 연결된 계좌가 있는 경우 */}
      {credential ? (
        <div className="bg-at-surface rounded-2xl shadow-at-card p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-at-accent-light">
                <Link2 className="w-5 h-5 text-at-accent" />
              </div>
              <div>
                <p className="font-semibold text-at-text">
                  {credential.label || 'KIS 계좌'}
                </p>
                <p className="text-sm text-at-text-secondary">
                  계좌번호: {credential.accountNumberMasked}
                </p>
              </div>
            </div>
            <span className={`px-2.5 py-1 rounded-lg text-xs font-medium ${
              credential.isPaperTrading
                ? 'bg-amber-100 text-amber-700'
                : 'bg-at-success-bg text-at-success'
            }`}>
              {credential.isPaperTrading ? '모의투자' : '실전투자'}
            </span>
          </div>

          {/* 모의투자 → 실전 전환 */}
          {credential.isPaperTrading && (
            <div className="mt-4 pt-4 border-t border-at-border">
              <div className="flex items-start gap-3 mb-3">
                <Zap className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-at-text">실전 투자로 전환</p>
                  <p className="text-xs text-at-text-secondary mt-0.5">
                    실전 계좌로 전환하면 실제 돈으로 주문이 실행됩니다.
                    전환 후에도 전략을 수동으로 활성화해야 자동매매가 시작됩니다.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={switchConfirmText}
                  onChange={e => setSwitchConfirmText(e.target.value)}
                  placeholder='"실전 전환"을 입력하세요'
                  className="flex-1 px-3 py-2 rounded-xl border border-at-border bg-at-bg text-at-text text-sm focus:outline-none focus:border-amber-500"
                />
                <button
                  onClick={async () => {
                    if (switchConfirmText !== '실전 전환') {
                      setError('"실전 전환"을 정확히 입력해주세요')
                      return
                    }
                    setSwitching(true)
                    setError('')
                    try {
                      const res = await fetch('/api/investment/credentials/switch-live', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ confirmText: switchConfirmText }),
                      })
                      const json = await res.json()
                      if (res.ok) {
                        setSuccess(json.message)
                        setSwitchConfirmText('')
                        fetchCredential()
                      } else {
                        setError(json.error)
                      }
                    } catch {
                      setError('네트워크 오류')
                    } finally {
                      setSwitching(false)
                    }
                  }}
                  disabled={switching || switchConfirmText !== '실전 전환'}
                  className="px-4 py-2 bg-amber-500 text-white rounded-xl text-sm font-medium hover:bg-amber-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {switching ? '전환 중...' : '전환'}
                </button>
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-4 border-t border-at-border">
            <p className="text-xs text-at-text-weak">
              연결일: {new Date(credential.createdAt).toLocaleDateString('ko-KR')}
            </p>
            <button
              onClick={handleDisconnect}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-at-error hover:bg-at-error-bg rounded-lg transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              연결 해제
            </button>
          </div>
        </div>
      ) : (
        /* 계좌 연결 폼 */
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* 안내 */}
          <div className="bg-at-accent-light rounded-2xl p-4">
            <div className="flex items-start gap-3">
              <Shield className="w-5 h-5 text-at-accent mt-0.5 flex-shrink-0" />
              <div className="text-sm text-at-accent">
                <p className="font-medium mb-1">API 키 발급 방법</p>
                <ol className="list-decimal list-inside space-y-1 text-xs">
                  <li>한국투자증권 홈페이지 접속</li>
                  <li>KIS Developers 메뉴 → API 신청</li>
                  <li>AppKey, AppSecret 발급</li>
                  <li>모의투자 신청 (처음이라면 모의투자부터 시작 권장)</li>
                </ol>
                <a
                  href="https://apiportal.koreainvestment.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 mt-2 text-xs underline"
                >
                  KIS Developers 바로가기
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </div>

          {/* 모의/실전 선택 */}
          <div className="bg-at-surface rounded-2xl shadow-at-card p-6 space-y-4">
            <h3 className="text-base font-semibold text-at-text">계좌 유형</h3>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setIsPaperTrading(true)}
                className={`p-4 rounded-xl border-2 text-left transition-colors ${
                  isPaperTrading
                    ? 'border-at-accent bg-at-accent-light'
                    : 'border-at-border hover:border-at-accent/30'
                }`}
              >
                <p className="font-medium text-sm text-at-text">모의투자</p>
                <p className="text-xs text-at-text-secondary mt-1">가상 자금으로 안전하게 테스트</p>
              </button>
              <button
                type="button"
                onClick={() => setIsPaperTrading(false)}
                className={`p-4 rounded-xl border-2 text-left transition-colors ${
                  !isPaperTrading
                    ? 'border-at-error bg-at-error-bg'
                    : 'border-at-border hover:border-at-border'
                }`}
              >
                <p className="font-medium text-sm text-at-text">실전투자</p>
                <p className="text-xs text-at-error mt-1">실제 자금으로 매매 (주의!)</p>
              </button>
            </div>
          </div>

          {/* API 키 입력 */}
          <div className="bg-at-surface rounded-2xl shadow-at-card p-6 space-y-4">
            <h3 className="text-base font-semibold text-at-text">API 정보 입력</h3>

            <div>
              <label className="block text-sm font-medium text-at-text-secondary mb-1.5">
                별칭 (선택)
              </label>
              <input
                type="text"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="예: 국내 모의투자"
                className="w-full px-3 py-2.5 rounded-xl border border-at-border bg-at-surface text-sm text-at-text placeholder:text-at-text-weak focus:outline-none focus:ring-2 focus:ring-at-accent/30 focus:border-at-accent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-at-text-secondary mb-1.5">
                AppKey <span className="text-at-error">*</span>
              </label>
              <input
                type="text"
                value={appKey}
                onChange={(e) => setAppKey(e.target.value)}
                placeholder="KIS에서 발급받은 AppKey"
                required
                className="w-full px-3 py-2.5 rounded-xl border border-at-border bg-at-surface text-sm text-at-text placeholder:text-at-text-weak focus:outline-none focus:ring-2 focus:ring-at-accent/30 focus:border-at-accent font-mono"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-at-text-secondary mb-1.5">
                AppSecret <span className="text-at-error">*</span>
              </label>
              <input
                type="password"
                value={appSecret}
                onChange={(e) => setAppSecret(e.target.value)}
                placeholder="KIS에서 발급받은 AppSecret"
                required
                className="w-full px-3 py-2.5 rounded-xl border border-at-border bg-at-surface text-sm text-at-text placeholder:text-at-text-weak focus:outline-none focus:ring-2 focus:ring-at-accent/30 focus:border-at-accent font-mono"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-at-text-secondary mb-1.5">
                계좌번호 <span className="text-at-error">*</span>
              </label>
              <input
                type="text"
                value={accountNumber}
                onChange={(e) => setAccountNumber(e.target.value)}
                placeholder="8자리 계좌번호"
                required
                className="w-full px-3 py-2.5 rounded-xl border border-at-border bg-at-surface text-sm text-at-text placeholder:text-at-text-weak focus:outline-none focus:ring-2 focus:ring-at-accent/30 focus:border-at-accent font-mono"
              />
            </div>
          </div>

          {/* 약관 동의 */}
          <div className="bg-at-surface rounded-2xl shadow-at-card p-6">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={agreeTerms}
                onChange={(e) => setAgreeTerms(e.target.checked)}
                className="mt-0.5 w-4 h-4 rounded border-at-border text-at-accent focus:ring-at-accent"
              />
              <span className="text-sm text-at-text-secondary">
                본인 명의의 계좌임을 확인하며, API 키는 암호화되어 안전하게 저장됩니다.
                자동매매로 인한 투자 손실은 본인에게 있음을 이해합니다.
              </span>
            </label>
          </div>

          {/* 제출 버튼 */}
          <button
            type="submit"
            disabled={submitting || !agreeTerms}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-at-accent text-white rounded-xl font-medium hover:bg-at-accent-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                연결 중...
              </>
            ) : (
              <>
                <Link2 className="w-4 h-4" />
                계좌 연결하기
              </>
            )}
          </button>
        </form>
      )}
    </div>
  )
}
