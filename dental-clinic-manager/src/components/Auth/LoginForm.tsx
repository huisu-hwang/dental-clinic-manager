'use client'

import { useState } from 'react'
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline'

interface LoginFormProps {
  onBackToLanding: () => void
  onShowSignup: () => void
  onLoginSuccess: () => void
}

export default function LoginForm({ onBackToLanding, onShowSignup, onLoginSuccess }: LoginFormProps) {
  const [formData, setFormData] = useState({
    userId: '',
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

    if (!formData.userId.trim()) {
      setError('아이디를 입력해주세요.')
      return
    }

    if (!formData.password) {
      setError('비밀번호를 입력해주세요.')
      return
    }

    setLoading(true)

    try {
      // TODO: API 연동으로 실제 로그인 처리
      // 현재는 하얀치과 계정으로만 로그인 가능하도록 시뮬레이션
      await new Promise(resolve => setTimeout(resolve, 1000))

      if (formData.userId === 'whitedc0902' && formData.password === 'gkdisclrhk0902@') {
        // 성공적인 로그인
        const userData = {
          userId: 'whitedc0902',
          clinicName: '하얀치과',
          clinicOwnerName: '원장님',
          clinicAddress: '서울시 송파구 풍납동 152-28 3층',
          clinicPhone: '02-477-2878',
          clinicEmail: 'whitedc0902@gmail.com'
        }

        localStorage.setItem('dental_user', JSON.stringify(userData))
        localStorage.setItem('dental_auth', 'true')

        if (rememberMe) {
          localStorage.setItem('dental_remember', 'true')
        }

        // 페이지 새로고침하여 인증 상태 반영
        window.location.reload()
      } else {
        // 로그인 실패
        setError('아이디 또는 비밀번호가 올바르지 않습니다.')
      }

    } catch (error) {
      setError('로그인 중 오류가 발생했습니다. 다시 시도해주세요.')
    } finally {
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
              <label htmlFor="userId" className="block text-sm font-medium text-slate-700 mb-1">
                아이디
              </label>
              <input
                type="text"
                id="userId"
                name="userId"
                value={formData.userId}
                onChange={handleInputChange}
                className="w-full p-3 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                placeholder="아이디를 입력하세요"
                disabled={loading}
                autoComplete="username"
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