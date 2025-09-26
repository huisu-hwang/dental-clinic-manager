'use client'

import { useState } from 'react'
import { getSupabase } from '@/lib/supabase'

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

    const supabase = getSupabase()
    if (!supabase) {
      setError('데이터베이스 연결에 실패했습니다.')
      setLoading(false)
      return
    }

    // Supabase 프로젝트의 이메일 템플릿을 사용하여 비밀번호 재설정 링크를 보냅니다.
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/update-password`,
    })

    if (resetError) {
      setError('비밀번호 재설정 이메일 전송에 실패했습니다. 이메일 주소를 확인해주세요.')
    } else {
      setMessage('비밀번호 재설정 링크를 이메일로 보냈습니다. 받은 편지함을 확인해주세요.')
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
