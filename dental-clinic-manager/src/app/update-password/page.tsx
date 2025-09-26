'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const router = useRouter()

  useEffect(() => {
    const supabase = getSupabase()
    if (!supabase) return;

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        // 이 이벤트는 사용자가 재설정 링크를 클릭했을 때 발생합니다.
        // 특별한 처리가 필요하다면 여기에 작성합니다.
      }
    })

    return () => {
      subscription.unsubscribe()
    }
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    if (password.length < 6) {
        setError('비밀번호는 6자 이상이어야 합니다.')
        setLoading(false)
        return
    }

    const supabase = getSupabase()
    if (!supabase) {
        setError('데이터베이스 연결에 실패했습니다.')
        setLoading(false)
        return
    }

    const { error: updateError } = await supabase.auth.updateUser({ password })

    if (updateError) {
      setError('비밀번호 업데이트에 실패했습니다. 다시 시도해주세요.')
    } else {
      setMessage('비밀번호가 성공적으로 변경되었습니다. 잠시 후 로그인 페이지로 이동합니다.')
      setTimeout(() => {
        router.push('/') // 랜딩 페이지 (또는 로그인 페이지)로 리디렉션
      }, 3000)
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto">
        <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-slate-800 mb-2">새 비밀번호 설정</h2>
            <p className="text-slate-600">새로운 비밀번호를 입력하세요.</p>
        </div>

        <div className="bg-white p-8 rounded-lg shadow-md border border-slate-200">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
                새 비밀번호
              </label>
              <input
                type="password"
                id="password"
                name="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full p-3 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                placeholder="6자 이상 입력하세요"
                required
                disabled={loading || !!message}
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
              {loading ? '변경 중...' : '비밀번호 변경'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
