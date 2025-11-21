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

    try {
      console.log('[ForgotPassword] 비밀번호 재설정 요청:', email);

      // 먼저 해당 이메일이 존재하는지 확인
      const { data: existingUser } = await supabase
        .from('users')
        .select('email')
        .eq('email', email)
        .single()

      if (!existingUser) {
        setError('등록되지 않은 이메일 주소입니다.')
        setLoading(false)
        return
      }

      // 비밀번호 재설정 링크 전송
      // auth/callback을 경유하여 PKCE 인증 코드를 처리하고 update-password로 리다이렉트
      const redirectUrl = `${window.location.origin}/auth/callback?next=/update-password`;
      console.log('[ForgotPassword] Redirect URL:', redirectUrl);

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl,
      })

      if (resetError) {
        console.error('[ForgotPassword] 재설정 오류:', resetError)

        // SMTP 설정이 안 되어 있는 경우
        if (resetError.message.includes('SMTP') || resetError.message.includes('email')) {
          setError('이메일 서비스가 설정되지 않았습니다. 관리자에게 문의해주세요.')
        } else {
          setError(`이메일 전송에 실패했습니다: ${resetError.message}`)
        }
      } else {
        console.log('[ForgotPassword] 재설정 이메일 전송 성공');
        setMessage('비밀번호 재설정 링크를 이메일로 보냈습니다. 받은 편지함을 확인하고 링크를 클릭해주세요. (링크는 24시간 동안 유효합니다)')
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
