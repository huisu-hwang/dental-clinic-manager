'use client'

import { useState } from 'react'

interface ForgotPasswordFormProps {
  onBackToLogin: () => void
}

export default function ForgotPasswordForm({ onBackToLogin }: ForgotPasswordFormProps) {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

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
                className="inline-flex items-center text-blue-600 hover:text-blue-700 font-medium mb-4"
            >
                ← 로그인으로 돌아가기
            </button>
            <h2 className="text-3xl font-bold text-slate-800 mb-2">비밀번호 재설정</h2>
            <p className="text-slate-600">가입 시 사용한 이메일 주소를 입력하세요.</p>
        </div>

        <div className="bg-white p-8 rounded-lg shadow-md border border-slate-200">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-slate-700 mb-1">
                이메일 주소
              </label>
              <input
                type="email"
                id="email"
                name="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full p-3 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                placeholder="email@example.com"
                required
                disabled={loading}
              />
            </div>

            {message && (
              <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-md text-sm">
                {message}
              </div>
            )}

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading || !!message}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold py-3 px-4 rounded-md transition-colors"
            >
              {loading ? '전송 중...' : '재설정 이메일 받기'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
