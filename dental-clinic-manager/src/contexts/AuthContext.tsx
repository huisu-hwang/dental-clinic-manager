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
  email: 'sani81@gmail.com',
  name: 'Master Administrator',
  role: 'master',
  status: 'active',
  userId: 'sani81@gmail.com'
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [isLoggingOut, setIsLoggingOut] = useState(false)

  useEffect(() => {
    let subscription: any = null

    // Supabase 세션 확인 및 사용자 정보 로드
    const checkAuth = async () => {
      console.log('AuthContext: checkAuth 시작')

      // 로그아웃 중이면 세션 체크 스킵
      const loggingOut = localStorage.getItem('dental_logging_out')
      if (isLoggingOut || loggingOut === 'true') {
        console.log('AuthContext: 로그아웃 중이므로 세션 체크 스킵')
        localStorage.removeItem('dental_logging_out')
        setLoading(false)
        return
      }

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
                console.log('AuthContext: 사용자 프로필 로드 성공', result.data)

                // 승인 대기 중인 사용자는 pending-approval 페이지로 이동
                if (result.data.status === 'pending' && window.location.pathname !== '/pending-approval') {
                  window.location.href = '/pending-approval'
                  return
                }

                // 거절된 사용자는 로그아웃
                if (result.data.status === 'rejected') {
                  alert('가입 신청이 거절되었습니다. 관리자에게 문의해주세요.')
                  await supabase.auth.signOut()
                  return
                }

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

              // 로그아웃 중이면 무시
              const loggingOut = localStorage.getItem('dental_logging_out')
              if (loggingOut === 'true') {
                console.log('로그아웃 중이므로 auth state change 무시')
                return
              }

              // PASSWORD_RECOVERY 이벤트는 update-password 페이지에서 처리
              if (event === 'PASSWORD_RECOVERY') {
                console.log('PASSWORD_RECOVERY 이벤트 감지')
                // 비밀번호 재설정 모드에서는 사용자 정보를 로드하지 않음
                // 이벤트를 방해하지 않고 그냥 통과시킴
                return
              }

              if (event === 'SIGNED_IN' && session?.user) {
                // 로그아웃 직후의 자동 로그인 방지
                if (!isLoggingOut) {
                  const result = await dataService.getUserProfileById(session.user.id)
                  if (result.success && result.data) {
                    setUser(result.data)
                  }
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
    if (userId === 'sani81@gmail.com') {
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
    console.log('Logout 시작...')

    // 로그아웃 중 플래그 설정
    setIsLoggingOut(true)

    // 먼저 로컬 상태를 모두 초기화
    setUser(null)
    localStorage.removeItem('dental_auth')
    localStorage.removeItem('dental_user')
    localStorage.removeItem('dental_remember')

    // 로그아웃 중임을 localStorage에도 저장
    localStorage.setItem('dental_logging_out', 'true')

    // Supabase 로그아웃 시도
    const supabase = getSupabase()
    if (supabase) {
      try {
        const { error } = await supabase.auth.signOut()
        if (error) {
          console.error('Supabase logout error:', error)
        } else {
          console.log('Supabase 로그아웃 성공')
        }
      } catch (error) {
        console.error('Logout error:', error)
      }
    }

    // 강제로 홈 페이지로 리디렉션
    console.log('홈 페이지로 리디렉션...')

    // 약간의 지연 후 리디렉션 (상태 업데이트가 완료되도록)
    setTimeout(() => {
      localStorage.removeItem('dental_logging_out')
      window.location.href = '/'
    }, 100)
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