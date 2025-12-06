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
  const { isAuthenticated, user, loading } = useAuth()
  const [appState, setAppState] = useState<AppState>('landing')

  // 인증된 경우 대시보드로 리디렉션 (승인된 사용자만)
  useEffect(() => {
    if (isAuthenticated) {
      // 승인 대기/거절 사용자는 /pending-approval로 리다이렉트
      if (user?.status === 'pending' || user?.status === 'rejected') {
        console.log('[AuthApp] Redirecting to pending-approval, status:', user?.status)
        window.location.href = '/pending-approval'
        return
      }

      const redirect = searchParams.get('redirect')
      const targetUrl = redirect || '/dashboard'
      console.log('[AuthApp] Redirecting to:', targetUrl)
      window.location.href = targetUrl
    }
  }, [isAuthenticated, user, searchParams])

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

  // 인증된 경우 리디렉션 중 로딩 표시
  if (isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-slate-600">대시보드로 이동 중...</p>
        </div>
      </div>
    )
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