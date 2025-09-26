'use client'

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import { getSupabase } from '@/lib/supabase'
import { dataService } from '@/lib/dataService'

export interface AuthContextType {
  user: any
  logout: () => void
  login: (userId: string, clinicInfo: any) => void
  updateUser: (updatedUserData: any) => void
  isAuthenticated: boolean
  loading: boolean
}

// Temporary master admin credentials for testing
const MASTER_ADMIN = {
  id: 'master-admin-001',
  email: 'admin@dentalmanager.com',
  name: 'System Administrator',
  role: 'master_admin',
  status: 'active'
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let subscription: any = null

    // Supabase 세션 확인 및 사용자 정보 로드
    const checkAuth = async () => {
      console.log('AuthContext: checkAuth 시작')

      if (typeof window !== 'undefined') {
        const supabase = getSupabase()

        if (supabase) {
          try {
            // Supabase 세션 확인
            const { data: { session } } = await supabase.auth.getSession()

            if (session?.user) {
              console.log('AuthContext: Supabase 세션 발견', session.user.id)

              // 사용자 프로필 정보 가져오기
              const result = await dataService.getUserProfileById(session.user.id)

              if (result.success && result.data) {
                console.log('AuthContext: 사용자 프로필 로드 성공')
                setUser(result.data)
              } else {
                console.log('AuthContext: 사용자 프로필 로드 실패')
                // 프로필이 없으면 로그아웃
                await supabase.auth.signOut()
              }
            } else {
              // Supabase 세션이 없으면 localStorage 확인 (기존 방식 호환)
              const authStatus = localStorage.getItem('dental_auth')
              const userData = localStorage.getItem('dental_user')

              if (authStatus === 'true' && userData) {
                const parsedUser = JSON.parse(userData)
                console.log('AuthContext: localStorage에서 사용자 정보 복원', parsedUser)
                setUser(parsedUser)
              }
            }

            // Auth 상태 변경 리스너 설정
            const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
              console.log('Auth state changed:', event)

              if (event === 'SIGNED_IN' && session?.user) {
                const result = await dataService.getUserProfileById(session.user.id)
                if (result.success && result.data) {
                  setUser(result.data)
                }
              } else if (event === 'SIGNED_OUT') {
                setUser(null)
                localStorage.removeItem('dental_auth')
                localStorage.removeItem('dental_user')
              }
            })

            subscription = authListener.subscription
          } catch (error) {
            console.error('Auth check error:', error)
            localStorage.removeItem('dental_auth')
            localStorage.removeItem('dental_user')
          }
        } else {
          // Supabase 설정이 안 된 경우 localStorage만 확인
          const authStatus = localStorage.getItem('dental_auth')
          const userData = localStorage.getItem('dental_user')

          if (authStatus === 'true' && userData) {
            const parsedUser = JSON.parse(userData)
            setUser(parsedUser)
          }
        }
      }

      // 모든 경우에 대해 로딩 상태를 false로 변경
      setLoading(false)
    }

    checkAuth()

    // Cleanup function
    return () => {
      if (subscription) {
        subscription.unsubscribe()
      }
    }
  }, [])

  const login = (userId: string, clinicInfo: any) => {
    // Check for master admin login
    if (userId === 'admin@dentalmanager.com') {
      const masterAdmin = { ...MASTER_ADMIN }
      setUser(masterAdmin)
      localStorage.setItem('dental_auth', 'true')
      localStorage.setItem('dental_user', JSON.stringify(masterAdmin))
      return
    }

    // clinicInfo가 users 테이블의 레코드 전체를 포함한다고 가정합니다.
    // 로그인 ID(userId)와 clinicInfo의 이메일이 다를 수 있으므로, clinicInfo의 데이터를 우선합니다.
    const userData = {
      ...clinicInfo,
      userId: userId, // 로그인 시 사용한 ID는 별도로 저장
    };

    
    setUser(userData)
    localStorage.setItem('dental_auth', 'true')
    localStorage.setItem('dental_user', JSON.stringify(userData))
  }

  const updateUser = (updatedUserData: any) => {
    setUser(updatedUserData)
    localStorage.setItem('dental_user', JSON.stringify(updatedUserData))
  }

  const logout = async () => {
    const supabase = getSupabase()

    if (supabase) {
      try {
        await supabase.auth.signOut()
      } catch (error) {
        console.error('Logout error:', error)
      }
    }

    setUser(null)
    localStorage.removeItem('dental_auth')
    localStorage.removeItem('dental_user')
    localStorage.removeItem('dental_remember')
    window.location.href = '/'
  }

  const isAuthenticated = Boolean(user)

  // 로딩 중일 때 로딩 화면 표시
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-slate-600">로딩 중...</p>
        </div>
      </div>
    )
  }

  return (
    <AuthContext.Provider value={{
      user,
      logout,
      login,
      updateUser,
      isAuthenticated,
      loading
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}