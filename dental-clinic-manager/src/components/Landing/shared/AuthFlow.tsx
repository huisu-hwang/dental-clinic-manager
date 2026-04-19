'use client'

import { useEffect, useState, type ReactNode } from 'react'
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

interface AuthFlowProps {
  children: (props: AuthFlowRenderProps) => ReactNode
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
      const redirect = searchParams.get('redirect')
      router.push(redirect || '/dashboard')
    }
  }, [isAuthenticated, user, router, searchParams])

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
      content = children({ onShowLogin: showLogin, onShowSignup: showSignup })
  }

  return (
    <>
      {content}
      <Footer />
    </>
  )
}
