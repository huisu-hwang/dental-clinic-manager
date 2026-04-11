'use client'

import { useState } from 'react'

const EMAIL_PROVIDER_MAP: Record<string, { name: string; url: string }> = {
  'gmail.com': { name: 'Gmail', url: 'https://mail.google.com' },
  'naver.com': { name: 'Naver 메일', url: 'https://mail.naver.com' },
  'daum.net': { name: 'Daum 메일', url: 'https://mail.daum.net' },
  'hanmail.net': { name: 'Daum 메일', url: 'https://mail.daum.net' },
  'kakao.com': { name: 'Kakao 메일', url: 'https://mail.kakao.com' },
  'outlook.com': { name: 'Outlook', url: 'https://outlook.live.com' },
  'hotmail.com': { name: 'Outlook', url: 'https://outlook.live.com' },
  'live.com': { name: 'Outlook', url: 'https://outlook.live.com' },
  'yahoo.com': { name: 'Yahoo 메일', url: 'https://mail.yahoo.com' },
}

function getEmailProvider(email: string) {
  const domain = email.split('@')[1]?.toLowerCase()
  return domain ? EMAIL_PROVIDER_MAP[domain] ?? null : null
}

interface ForgotPasswordFormProps {
  onBackToLogin: () => void
}

export default function ForgotPasswordForm({ onBackToLogin }: ForgotPasswordFormProps) {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [sentEmail, setSentEmail] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    try {
      // 서버사이드 API로 비밀번호 재설정 이메일 발송
      // 서버에서 VERCEL_URL(*.vercel.app)을 redirectTo로 사용하여
      // PWA scope(hi-clinic.co.kr) 밖으로 설정 → 브라우저에서 열림
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      const data = await res.json()

      if (!res.ok) {
        setError(data.error || '비밀번호 재설정 요청 중 오류가 발생했습니다.')
      } else {
        setMessage('비밀번호 재설정 요청이 처리되었습니다. 이메일을 확인해주세요. (링크는 24시간 동안 유효합니다)')
        setSentEmail(email.trim())
      }
    } catch (err) {
      console.error('[ForgotPassword] 처리 중 오류:', err)
      setError('비밀번호 재설정 요청 처리 중 오류가 발생했습니다.')
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto">
        <div className="text-center mb-8">
            <button
                onClick={onBackToLogin}
                className="inline-flex items-center text-at-accent hover:text-at-accent font-medium mb-4"
            >
                ← 로그인으로 돌아가기
            </button>
            <h2 className="text-3xl font-bold text-at-text mb-2">비밀번호 재설정</h2>
            <p className="text-at-text-secondary">가입 시 사용한 이메일 주소를 입력하세요.</p>
        </div>

        <div className="bg-white p-8 rounded-2xl shadow-at-card border border-at-border">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-at-text-secondary mb-1">
                이메일 주소
              </label>
              <input
                type="email"
                id="email"
                name="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full p-3 border border-at-border rounded-xl focus:ring-at-accent focus:border-at-accent"
                placeholder="email@example.com"
                required
                disabled={loading}
              />
            </div>

            {message && (
              <div className="bg-at-success-bg border border-green-200 text-at-success px-4 py-3 rounded-xl text-sm">
                {message}
              </div>
            )}

            {error && (
              <div className="bg-at-error-bg border border-red-200 text-at-error px-4 py-3 rounded-xl text-sm">
                {error}
              </div>
            )}

            {message && getEmailProvider(sentEmail) ? (
              <a
                href={getEmailProvider(sentEmail)!.url}
                target="_blank"
                rel="noopener noreferrer"
                className="block w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-xl transition-colors text-center"
              >
                {getEmailProvider(sentEmail)!.name}(으)로 바로 이동
              </a>
            ) : (
              <button
                type="submit"
                disabled={loading || !!message}
                className="w-full bg-at-accent hover:bg-at-accent-hover disabled:bg-blue-300 text-white font-bold py-3 px-4 rounded-xl transition-colors"
              >
                {loading ? '전송 중...' : message ? '이메일을 확인해주세요' : '재설정 이메일 받기'}
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  )
}
