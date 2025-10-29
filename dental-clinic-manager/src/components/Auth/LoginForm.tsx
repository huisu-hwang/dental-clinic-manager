'use client'

import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { authService } from '@/lib/authService'
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline'

interface LoginFormProps {
  onBackToLanding: () => void
  onShowSignup: () => void
  onShowForgotPassword: () => void // 비밀번호 찾기 폼을 보여주는 함수
  onLoginSuccess: () => void
}

export default function LoginForm({ onBackToLanding, onShowSignup, onShowForgotPassword, onLoginSuccess }: LoginFormProps) {
  const { login } = useAuth()
  const [formData, setFormData] = useState({
    email: '', // userId를 email로 변경
    password: ''
  })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [rememberMe, setRememberMe] = useState(false)

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!formData.email.trim()) { // email로 변경
      setError('이메일 주소를 입력해주세요.')
      return
    }

    if (!formData.password) {
      setError('비밀번호를 입력해주세요.')
      return
    }

    console.log('[LoginForm] Starting login process...')
    setLoading(true)

    try {
      // authService의 하이브리드 로그인 사용 (Supabase Auth + 커스텀 인증)
      console.log('[LoginForm] Calling authService.login...')
      const result = await authService.login(formData.email, formData.password)

      console.log('[LoginForm] authService.login result:', result)

      if (!result.success || !result.user) {
        console.error('[LoginForm] Login failed:', result.error)
        setError(result.error || '아이디 또는 비밀번호가 올바르지 않습니다.')
        setLoading(false)
        return
      }

      // AuthContext에 사용자 정보로 로그인 처리
      console.log('[LoginForm] Login successful, user:', result.user)
      login(formData.email, result.user)

      if (rememberMe) {
        // 로그인 상태 유지는 Supabase가 세션 관리를 통해 자동으로 처리합니다.
        console.log('[LoginForm] Remember me enabled - Supabase session will persist')
      }

      console.log('[LoginForm] Calling onLoginSuccess...')
      onLoginSuccess()
    } catch (error) {
      console.error('[LoginForm] Unexpected error during login:', error)
      setError('로그인 중 오류가 발생했습니다. 다시 시도해주세요.')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <button
            onClick={onBackToLanding}
            className="inline-flex items-center text-blue-600 hover:text-blue-700 font-medium mb-4"
          >
            ← 돌아가기
          </button>
          <div className="flex items-center justify-center space-x-2 mb-4">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold">🦷</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-800">덴탈매니저</h1>
          </div>
          <h2 className="text-3xl font-bold text-slate-800 mb-2">로그인</h2>
          <p className="text-slate-600">계정에 로그인하여 업무를 시작하세요</p>
        </div>


        {/* Form */}
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
                value={formData.email}
                onChange={handleInputChange}
                className="w-full p-3 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                placeholder="email@example.com"
                disabled={loading}
                autoComplete="email"
              />
            </div>

            <div className="relative">
              <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
                비밀번호
              </label>
              <input
                type={showPassword ? "text" : "password"}
                id="password"
                name="password"
                value={formData.password}
                onChange={handleInputChange}
                className="w-full p-3 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500 pr-10"
                placeholder="비밀번호를 입력하세요"
                disabled={loading}
                autoComplete="current-password"
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 top-6 pr-3 flex items-center"
                onClick={() => setShowPassword(!showPassword)}
              >
                {showPassword ? (
                  <EyeSlashIcon className="h-5 w-5 text-gray-400" />
                ) : (
                  <EyeIcon className="h-5 w-5 text-gray-400" />
                )}
              </button>
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <input
                  id="remember-me"
                  name="remember-me"
                  type="checkbox"
                  checked={rememberMe}
                  onChange={(e) => setRememberMe(e.target.checked)}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="remember-me" className="ml-2 block text-sm text-slate-700">
                  로그인 상태 유지
                </label>
              </div>

              <div className="text-sm">
                <button
                  type="button"
                  onClick={onShowForgotPassword}
                  className="font-medium text-blue-600 hover:text-blue-700"
                >
                  비밀번호를 잊으셨나요?
                </button>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md text-sm">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold py-3 px-4 rounded-md transition-colors"
            >
              {loading ? '로그인 중...' : '로그인'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-slate-600">
              아직 계정이 없으신가요?{' '}
              <button
                onClick={onShowSignup}
                className="text-blue-600 hover:text-blue-700 font-medium"
              >
                회원가입하기
              </button>
            </p>
          </div>

        </div>
      </div>
    </div>
  )
}