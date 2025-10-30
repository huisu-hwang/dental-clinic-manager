'use client'

import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { getSupabase } from '@/lib/supabase'
import { dataService } from '@/lib/dataService'
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
      console.log('[LoginForm] Getting Supabase client...')
      const supabase = getSupabase()

      if (!supabase) {
        console.error('[LoginForm] Supabase client is null')
        setError('데이터베이스 연결에 실패했습니다. 환경 설정을 확인해주세요.')
        setLoading(false)
        return
      }

      console.log('[LoginForm] Supabase client obtained, attempting login...')

      // 1. Supabase Auth로 로그인 시도 (타임아웃 설정: 10초)
      const loginPromise = supabase.auth.signInWithPassword({
        email: formData.email, // email로 변경
        password: formData.password,
      })

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Login timeout')), 10000)
      )

      const { data: authData, error: authError } = await Promise.race([
        loginPromise,
        timeoutPromise
      ]) as any

      console.log('[LoginForm] Auth response:', { authData, authError })

      if (authError) {
        console.error('[LoginForm] Auth error:', authError)
        setError('아이디 또는 비밀번호가 올바르지 않습니다.')
        setLoading(false)
        return
      }

      if (!authData.user) {
        setError('사용자 정보를 가져오지 못했습니다.')
        setLoading(false)
        return
      }

      // 2. 마스터 계정 특별 처리
      if (formData.email === 'sani81@gmail.com') {
        // 마스터 계정은 프로필 조회 없이 바로 로그인 처리
        const masterProfile = {
          id: authData.user.id,
          email: 'sani81@gmail.com',
          name: 'Master Administrator',
          role: 'master',
          status: 'active',
          userId: 'sani81@gmail.com',
          clinic_id: null, // 마스터는 특정 병원에 소속되지 않음
          clinic: null
        }
        console.log('[LoginForm] Master login with profile:', masterProfile)
        login(formData.email, masterProfile)
      } else {
        // 3. 일반 사용자는 public.users 테이블에서 전체 프로필 정보 조회
        const result = await dataService.getUserProfileById(authData.user.id)

        if (result.error || !result.data) {
          setError('로그인에 성공했으나, 프로필 정보를 불러오는 데 실패했습니다.')
          // 이 경우, 사용자는 인증되었지만 앱 사용에 필요한 정보가 부족하므로 로그아웃 처리
          await supabase.auth.signOut()
          setLoading(false)
          return
        }

        // 4. AuthContext에 완전한 사용자 정보로 로그인 처리
        login(formData.email, result.data) // email로 변경
      }

      if (rememberMe) {
        // 로그인 상태 유지는 Supabase가 세션 관리를 통해 자동으로 처리합니다.
        // 별도의 localStorage 작업이 필요 없어졌습니다.
        console.log('로그인 상태 유지 기능은 Supabase 세션에 의해 관리됩니다.')
      }

      console.log('[LoginForm] Login successful, calling onLoginSuccess...')
      // localStorage 저장이 완료될 때까지 약간 대기
      await new Promise(resolve => setTimeout(resolve, 100))
      onLoginSuccess()
    } catch (error) {
      console.error('[LoginForm] Unexpected error during login:', error)
      if (error instanceof Error && error.message === 'Login timeout') {
        setError('로그인 시간이 초과되었습니다. 네트워크 연결을 확인하거나 다시 시도해주세요.')
      } else {
        setError('로그인 중 오류가 발생했습니다. 다시 시도해주세요.')
      }
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