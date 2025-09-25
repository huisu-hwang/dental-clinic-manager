'use client'

import { useState } from 'react'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import LandingPage from '@/components/Landing/LandingPage'
import LoginForm from '@/components/Auth/LoginForm'
import SignupForm from '@/components/Auth/SignupForm'
import DashboardPage from './dashboard/page'

type AppState = 'landing' | 'login' | 'signup' | 'dashboard'

function AppContent() {
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

  // 인증된 경우 대시보드 표시
  if (isAuthenticated) {
    return <DashboardPage />
  }

  // 인증되지 않은 경우 앱 상태에 따라 화면 표시
  switch (appState) {
    case 'login':
      return (
        <LoginForm
          onBackToLanding={() => setAppState('landing')}
          onShowSignup={() => setAppState('signup')}
          onLoginSuccess={() => setAppState('dashboard')}
        />
      )
    case 'signup':
      return (
        <SignupForm
          onBackToLanding={() => setAppState('landing')}
          onShowLogin={() => setAppState('login')}
          onSignupSuccess={() => setAppState('login')}
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

export default function AuthApp() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}