'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { createClient } from '@/lib/supabase/client'
import { dataService } from '@/lib/dataService'
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline'

interface LoginFormProps {
  onBackToLanding: () => void
  onShowSignup: () => void
  onShowForgotPassword: () => void // 비밀번호 찾기 폼을 보여주는 함수
  onLoginSuccess: () => void
}

export default function LoginForm({ onBackToLanding, onShowSignup, onShowForgotPassword, onLoginSuccess }: LoginFormProps) {
  const router = useRouter()
  const { login } = useAuth()
  const [formData, setFormData] = useState({
    email: '', // userId를 email로 변경
    password: ''
  })
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [rememberMe, setRememberMe] = useState(false)
  const [autoLogin, setAutoLogin] = useState(false)

  // 컴포넌트 마운트 시 저장된 로그인 정보 불러오기 및 자동 로그인
  useEffect(() => {
    const savedEmail = localStorage.getItem('savedLoginEmail')
    const savedPassword = localStorage.getItem('savedLoginPassword')
    const savedAutoLogin = localStorage.getItem('autoLogin') === 'true'

    if (savedEmail && savedPassword) {
      setFormData({
        email: savedEmail,
        password: savedPassword
      })
      setRememberMe(true)
      setAutoLogin(savedAutoLogin)

      // 자동 로그인 설정이 활성화되어 있으면 자동으로 로그인 시도
      if (savedAutoLogin && !loading) {
        console.log('[LoginForm] Auto login enabled, attempting automatic login...')
        // 약간의 지연을 주어 UI가 렌더링된 후 로그인 시도
        setTimeout(() => {
          const form = document.querySelector('form')
          if (form) {
            form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }))
          }
        }, 500)
      }
    }
  }, [])

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
      // Cookie-based session - Middleware가 자동으로 세션 관리
      console.log('[LoginForm] Using cookie-based session (rememberMe: N/A)')

      // Supabase 클라이언트 생성
      console.log('[LoginForm] Creating Supabase client...')
      const supabase = createClient()

      // 1. 로그인 전에 기존 세션을 완전히 클리어 (타임아웃 5초)
      console.log('[LoginForm] Clearing any existing session...')
      try {
        const signOutPromise = supabase.auth.signOut()
        const signOutTimeout = new Promise((resolve) => setTimeout(resolve, 5000))
        await Promise.race([signOutPromise, signOutTimeout])
        console.log('[LoginForm] Previous session cleared')
      } catch (err) {
        console.warn('[LoginForm] Error clearing previous session:', err)
      }

      console.log('[LoginForm] Supabase client obtained, attempting login...')

      // 1. Supabase Auth로 로그인 시도 (타임아웃 설정: 60초로 증가)
      const loginStartTime = Date.now()
      const loginPromise = supabase.auth.signInWithPassword({
        email: formData.email, // email로 변경
        password: formData.password,
      })

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => {
          const elapsed = Date.now() - loginStartTime
          console.error(`[LoginForm] Login timeout after ${elapsed}ms`)
          reject(new Error('Login timeout'))
        }, 60000)
      )

      const { data: authData, error: authError } = await Promise.race([
        loginPromise,
        timeoutPromise
      ]) as any

      const loginElapsed = Date.now() - loginStartTime
      console.log(`[LoginForm] Auth response received in ${loginElapsed}ms:`, { authData, authError })

      if (authError) {
        console.error('[LoginForm] Auth error:', authError)
        console.error('[LoginForm] Error details:', {
          message: authError.message,
          status: authError.status,
          name: authError.name
        })

        // 에러 타입에 따라 다른 메시지 표시
        if (authError.message.includes('Email not confirmed') ||
            authError.message.includes('email_not_confirmed')) {
          setError('이메일 인증이 완료되지 않았습니다. 가입 시 입력한 이메일에서 인증 링크를 확인해주세요.')
        } else if (authError.message.includes('Invalid login credentials')) {
          setError('아이디 또는 비밀번호가 올바르지 않습니다.')
        } else {
          setError('로그인 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.')
        }

        setLoading(false)
        return
      }

      if (!authData.user) {
        setError('사용자 정보를 가져오지 못했습니다.')
        setLoading(false)
        return
      }

      // 2. public.users 테이블에서 전체 프로필 정보 조회
      console.log('[LoginForm] Fetching user profile for ID:', authData.user.id)
      const profileStartTime = Date.now()
      const result = await dataService.getUserProfileById(authData.user.id)
      const profileElapsed = Date.now() - profileStartTime
      console.log(`[LoginForm] Profile fetched in ${profileElapsed}ms:`, result.data)

      if (result.error || !result.data) {
        console.error('[LoginForm] Profile fetch failed:', result.error)
        setError('로그인에 성공했으나, 프로필 정보를 불러오는 데 실패했습니다.')
        // 이 경우, 사용자는 인증되었지만 앱 사용에 필요한 정보가 부족하므로 로그아웃 처리
        await supabase.auth.signOut()
        setLoading(false)
        return
      }

      // 3. 소속 병원의 중지 상태 검증
      if (result.data.clinic?.status === 'suspended') {
        console.warn('[LoginForm] Clinic is suspended:', result.data.clinic.id)
        setError('소속 병원이 중지되었습니다. 관리자에게 문의해주세요.')
        await supabase.auth.signOut()
        setLoading(false)
        return
      }

      // 4. 승인 대기 중인 사용자 체크
      if (result.data.status === 'pending') {
        console.warn('[LoginForm] User is pending approval, keeping session and redirecting:', result.data.id)
        // 세션 유지 (signOut 제거) - 사용자가 /pending-approval 페이지에서 상태를 확인할 수 있도록
        login(formData.email, result.data)
        setLoading(false)
        // /pending-approval 페이지로 직접 리다이렉트
        router.push('/pending-approval')
        return
      }

      // 5. 거절된 사용자 체크
      if (result.data.status === 'rejected') {
        console.warn('[LoginForm] User was rejected, keeping session and redirecting:', result.data.id)
        // 세션 유지 (signOut 제거) - 사용자가 거절 사유를 확인할 수 있도록
        login(formData.email, result.data)
        setLoading(false)
        // /pending-approval 페이지로 직접 리다이렉트 (거절 메시지 표시)
        router.push('/pending-approval')
        return
      }

      // 6. AuthContext에 완전한 사용자 정보로 로그인 처리 (status='active'만 통과)
      console.log('[LoginForm] Logging in with profile:', result.data)
      login(formData.email, result.data) // email로 변경

      // 7. 로그인 활동 기록 저장
      try {
        await fetch('/api/activity-log', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: result.data.id,
            clinic_id: result.data.clinic_id || null,
            activity_type: 'login',
            activity_description: '로그인',
            metadata: {
              email: formData.email,
              role: result.data.role,
              clinic_name: result.data.clinic?.name || null
            }
          })
        })
        console.log('[LoginForm] Activity log saved successfully')
      } catch (activityError) {
        // 활동 기록 저장 실패해도 로그인은 진행
        console.warn('[LoginForm] Failed to save activity log:', activityError)
      }

      console.log('[LoginForm] Login successful - Cookie-based session')
      console.log('[LoginForm] Session managed by Middleware (automatic refresh)')

      // 로그인 정보 저장 처리
      if (rememberMe) {
        console.log('[LoginForm] Saving login credentials to localStorage')
        localStorage.setItem('savedLoginEmail', formData.email)
        localStorage.setItem('savedLoginPassword', formData.password)
      } else {
        console.log('[LoginForm] Removing saved login credentials from localStorage')
        localStorage.removeItem('savedLoginEmail')
        localStorage.removeItem('savedLoginPassword')
      }

      // 자동 로그인 설정 저장
      if (autoLogin && rememberMe) {
        console.log('[LoginForm] Saving auto login setting to localStorage')
        localStorage.setItem('autoLogin', 'true')
      } else {
        console.log('[LoginForm] Removing auto login setting from localStorage')
        localStorage.removeItem('autoLogin')
      }

      console.log('[LoginForm] Calling onLoginSuccess...')
      // localStorage 저장이 완료될 때까지 약간 대기
      await new Promise(resolve => setTimeout(resolve, 100))
      onLoginSuccess()
    } catch (error) {
      console.error('[LoginForm] Unexpected error during login:', error)
      if (error instanceof Error && error.message === 'Login timeout') {
        setError('로그인 시간이 초과되었습니다 (60초). 네트워크 연결이 느리거나 Supabase 서버에 문제가 있을 수 있습니다. 네트워크 연결을 확인하거나 잠시 후 다시 시도해주세요.')
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

            <div className="space-y-2">
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
                  <label htmlFor="remember-me" className="ml-2 block text-sm text-slate-600">
                    로그인 정보 저장
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

              {rememberMe && (
                <div className="flex items-center ml-6">
                  <input
                    id="auto-login"
                    name="auto-login"
                    type="checkbox"
                    checked={autoLogin}
                    onChange={(e) => setAutoLogin(e.target.checked)}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="auto-login" className="ml-2 block text-sm text-slate-500">
                    자동 로그인 (다음에 자동으로 로그인)
                  </label>
                </div>
              )}
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