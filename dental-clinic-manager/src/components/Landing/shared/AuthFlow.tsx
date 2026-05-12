'use client'

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import LoginForm from '@/components/Auth/LoginForm'
import SignupForm from '@/components/Auth/SignupForm'
import ForgotPasswordForm from '@/components/Auth/ForgotPasswordForm'
import Footer from '@/components/Layout/Footer'

type AppState = 'landing' | 'login' | 'signup' | 'forgotPassword'

export interface AuthFlowRenderProps {
  onShowLogin: () => void
  onShowSignup: () => void
}

// Context 기반 패턴: render-prop(function children)이 Next.js 15 App Router의
// Client Component RSC 직렬화에서 에러를 일으키므로(Error 3957765248) Context로 전환.
const AuthFlowContext = createContext<AuthFlowRenderProps | null>(null)

export function useAuthFlow(): AuthFlowRenderProps {
  const ctx = useContext(AuthFlowContext)
  if (!ctx) {
    throw new Error('useAuthFlow must be used within an <AuthFlow> component')
  }
  return ctx
}

interface AuthFlowProps {
  children: ReactNode
}

export default function AuthFlow({ children }: AuthFlowProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isAuthenticated, user, loading } = useAuth()
  const [appState, setAppState] = useState<AppState>('landing')

  useEffect(() => {
    const show = searchParams.get('show')
    if (show === 'login') {
      setAppState('login')
    } else if (show === 'signup') {
      setAppState('signup')
    }
  }, [searchParams])

  useEffect(() => {
    if (isAuthenticated) {
      if (user?.status === 'pending' || user?.status === 'rejected') {
        router.push('/pending-approval')
        return
      }
      // 정책: 로그인 후에는 ?redirect= 파라미터가 있어도 무시하고 항상 대시보드로 이동.
      // 사용자 요청 — 소모임 등 URL 이 redirect 로 박혀 있어 의도치 않게 그곳으로 가는 사례 차단.
      // 신규 가입자의 초대 링크 후속 진입은 /auth/callback 의 next 파라미터로 별도 처리됨.
      router.push('/dashboard')
    }
  }, [isAuthenticated, user, router])

  if (loading) {
    return (
      <div className="min-h-screen bg-at-surface-alt flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-at-accent mx-auto mb-4"></div>
          <p className="text-at-text-secondary">로딩 중...</p>
        </div>
      </div>
    )
  }

  if (isAuthenticated) {
    return null
  }

  const showLogin = () => setAppState('login')
  const showSignup = () => setAppState('signup')
  const showLanding = () => setAppState('landing')
  const showForgot = () => setAppState('forgotPassword')

  let content: ReactNode
  switch (appState) {
    case 'login':
      content = (
        <LoginForm
          onBackToLanding={showLanding}
          onShowSignup={showSignup}
          onShowForgotPassword={showForgot}
          onLoginSuccess={() => {
            setTimeout(() => { window.location.reload() }, 150)
          }}
        />
      )
      break
    case 'signup':
      content = (
        <SignupForm
          onBackToLanding={showLanding}
          onShowLogin={showLogin}
          onSignupSuccess={() => { setAppState('login') }}
        />
      )
      break
    case 'forgotPassword':
      content = <ForgotPasswordForm onBackToLogin={showLogin} />
      break
    default:
      content = children
  }

  return (
    <AuthFlowContext.Provider value={{ onShowLogin: showLogin, onShowSignup: showSignup }}>
      {content}
      <Footer />
    </AuthFlowContext.Provider>
  )
}
