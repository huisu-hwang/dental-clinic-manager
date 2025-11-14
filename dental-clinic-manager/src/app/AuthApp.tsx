'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import LandingPage from '@/components/Landing/LandingPage'
import LoginForm from '@/components/Auth/LoginForm'
import SignupForm from '@/components/Auth/SignupForm'
import ForgotPasswordForm from '@/components/Auth/ForgotPasswordForm'

type AppState = 'landing' | 'login' | 'signup' | 'forgotPassword'

export default function AuthApp() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isAuthenticated, loading } = useAuth()
  const [appState, setAppState] = useState<AppState>('landing')

  // 인증 상태 확인 중 로딩
  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-slate-600">로딩 중...</p>
        </div>
      </div>
    )
  }

  // 인증된 경우 대시보드로 리디렉션
  useEffect(() => {
    if (isAuthenticated) {
      const redirect = searchParams.get('redirect')
      router.push(redirect || '/dashboard')
    }
  }, [isAuthenticated, router, searchParams])

  // 인증되지 않은 경우만 계속 진행
  if (isAuthenticated) {
    return null // 리디렉션 중
  }

  // 인증되지 않은 경우 앱 상태에 따라 화면 표시
  switch (appState) {
    case 'login':
      return (
        <LoginForm
          onBackToLanding={() => setAppState('landing')}
          onShowSignup={() => setAppState('signup')}
          onShowForgotPassword={() => setAppState('forgotPassword')}
          onLoginSuccess={() => {
            // 상태 업데이트 완료를 위한 약간의 지연 후 reload
            setTimeout(() => {
              window.location.reload()
            }, 150)
          }}
        />
      )
    case 'signup':
      return (
        <SignupForm
          onBackToLanding={() => setAppState('landing')}
          onShowLogin={() => setAppState('login')}
          onSignupSuccess={() => {
            // 회원가입 성공 후 로그인 페이지로 이동 또는 자동 로그인
            setAppState('login')
          }}
        />
      )
    case 'forgotPassword':
      return (
        <ForgotPasswordForm
          onBackToLogin={() => setAppState('login')}
        />
      )
    default:
      return (
        <LandingPage
          onShowSignup={() => setAppState('signup')}
          onShowLogin={() => setAppState('login')}
        />
      )
  }
}