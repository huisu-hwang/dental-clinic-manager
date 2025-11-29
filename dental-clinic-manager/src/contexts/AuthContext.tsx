'use client'

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { dataService } from '@/lib/dataService'
import type { Permission } from '@/types/permissions'
import { useActivityTracker } from '@/hooks/useActivityTracker'
import { SESSION_CHECK_TIMEOUT } from '@/lib/sessionUtils'
import { TIMEOUTS } from '@/lib/constants/timeouts'
import { useRouter } from 'next/navigation'

export interface UserProfile {
  id: string
  email?: string
  name?: string
  role?: string
  status?: 'pending' | 'active' | 'rejected'
  permissions?: Permission[]
  clinic_id?: string
  [key: string]: any
}

export interface AuthContextType {
  user: UserProfile | null
  logout: () => void
  login: (userId: string, clinicInfo: any) => void
  updateUser: (updatedUserData: any) => void
  isAuthenticated: boolean
  loading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter()
  const [user, setUser] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [showInactivityModal, setShowInactivityModal] = useState(false)

  useEffect(() => {
    let subscription: any = null
    let timeoutId: NodeJS.Timeout | null = null

    // 서버 사이드에서는 즉시 로딩 완료
    if (typeof window === 'undefined') {
      console.log('[AuthContext] Server-side rendering detected, skipping auth check')
      setLoading(false)
      return
    }

    // Supabase 세션 확인 및 사용자 정보 로드
    const checkAuth = async () => {
      console.log('===== AuthContext: checkAuth 시작 =====')

      try {
        // 서버 사이드 렌더링 중에는 실행하지 않음
        if (typeof window === 'undefined') {
          console.log('[AuthContext] Skipping auth check on server-side.')
          return
        }

        // 로그아웃 중이면 세션 체크 스킵
        const loggingOut = localStorage.getItem('dental_logging_out')
        if (isLoggingOut || loggingOut === 'true') {
          console.log('AuthContext: 로그아웃 중이므로 세션 체크 스킵')
          localStorage.removeItem('dental_logging_out')
          return
        }

        console.log('[AuthContext] Getting Supabase client...')
        const supabase = createClient()
        console.log('[AuthContext] Supabase client obtained')

        if (supabase) {
          try {
            // Supabase 세션 확인 - 타임아웃 추가
            console.log('[AuthContext] Checking Supabase session...')

            let session: Session | null = null;
            try {
              const sessionPromise = supabase.auth.getSession()
              const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Session check timeout')), SESSION_CHECK_TIMEOUT)
              )

              const result = await Promise.race([
                sessionPromise,
                timeoutPromise
              ]) as any

              // 에러가 있는지 확인
              if (result?.error) {
                console.log('[AuthContext] Session error:', result.error.message)
                // Refresh token 오류 시 로컬 스토리지 클리어
                if (result.error.message?.includes('Refresh Token')) {
                  console.log('[AuthContext] Invalid refresh token detected, clearing storage')
                  localStorage.removeItem('dental_auth')
                  localStorage.removeItem('dental_user')
                  // Supabase 로컬 스토리지도 클리어
                  const keys = Object.keys(localStorage)
                  keys.forEach(key => {
                    if (key.startsWith('sb-')) {
                      localStorage.removeItem(key)
                    }
                  })
                }
                session = null
              } else {
                session = result?.data?.session
                console.log('[AuthContext] Session check complete:', session ? 'session found' : 'no session')
              }
            } catch (timeoutError) {
              console.log('[AuthContext] Session check error:', timeoutError)
              // 에러 발생 시 세션 없음으로 처리하고 로컬 스토리지 클리어
              if (timeoutError instanceof Error && timeoutError.message?.includes('Refresh Token')) {
                console.log('[AuthContext] Invalid refresh token detected, clearing storage')
                localStorage.removeItem('dental_auth')
                localStorage.removeItem('dental_user')
                // Supabase 로컬 스토리지도 클리어
                const keys = Object.keys(localStorage)
                keys.forEach(key => {
                  if (key.startsWith('sb-')) {
                    localStorage.removeItem(key)
                  }
                })
              }
              session = null
            }

            if (session?.user) {
              console.log('AuthContext: Supabase 세션 발견', session.user.id)

              // 사용자 프로필 정보 가져오기
              const result = await dataService.getUserProfileById(session.user.id)

              if (result.success && result.data) {
                console.log('AuthContext: 사용자 프로필 로드 성공', result.data)

                // 승인 대기/거절된 사용자는 pending-approval 페이지로 이동 (세션 유지)
                if (result.data.status === 'pending' || result.data.status === 'rejected') {
                  console.warn('[AuthContext] User status:', result.data.status, '- restricting access')

                  // pending/rejected 사용자도 user state 설정 (페이지에서 사용자 정보 표시용)
                  setUser(result.data)

                  if (window.location.pathname !== '/pending-approval') {
                    console.log('[AuthContext] Redirecting to /pending-approval')
                    router.push('/pending-approval')
                  }

                  setLoading(false)
                  return
                }

                // 소속 병원이 중지된 경우 로그아웃
                if (result.data.clinic?.status === 'suspended') {
                  alert('소속 병원이 중지되었습니다. 관리자에게 문의해주세요.')
                  await supabase.auth.signOut()
                  window.location.href = '/'
                  return
                }

                setUser(result.data)
                if (result.data.clinic_id) {
                  dataService.setCachedClinicId(result.data.clinic_id)
                }
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
                try {
                  const parsedUser = JSON.parse(userData)
                  console.log('AuthContext: localStorage에서 사용자 정보 복원', parsedUser)
                  setUser(parsedUser)
                } catch (e) {
                  console.error('Failed to parse localStorage user data:', e)
                }
              }
            }

            // Auth 상태 변경 리스너 설정
            const { data: authListener } = supabase.auth.onAuthStateChange(async (event: AuthChangeEvent, session: Session | null) => {
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
                return
              }

              if (event === 'SIGNED_IN' && session?.user) {
                if (!isLoggingOut) {
                  const result = await dataService.getUserProfileById(session.user.id)
                  if (result.success && result.data) {
                    // 승인 대기/거절된 사용자 체크 (세션 유지)
                    if (result.data.status === 'pending' || result.data.status === 'rejected') {
                      console.warn('[AuthContext] SIGNED_IN event - User status:', result.data.status)

                      // pending/rejected 사용자도 user state 설정 (페이지에서 사용자 정보 표시용)
                      setUser(result.data)

                      // 세션 유지 (signOut 제거) - 사용자가 안내 페이지를 볼 수 있도록
                      if (window.location.pathname !== '/pending-approval') {
                        router.push('/pending-approval')
                      }
                      return
                    }

                    // 소속 병원이 중지된 경우 로그아웃
                    if (result.data.clinic?.status === 'suspended') {
                      alert('소속 병원이 중지되었습니다. 관리자에게 문의해주세요.')
                      await supabase.auth.signOut()
                      window.location.href = '/'
                      return
                    }

                    setUser(result.data)
                    if (result.data.clinic_id) {
                      dataService.setCachedClinicId(result.data.clinic_id)
                    }
                  }
                }
              } else if (event === 'SIGNED_OUT') {
                setUser(null)
                localStorage.removeItem('dental_auth')
                localStorage.removeItem('dental_user')
                dataService.clearCachedClinicId()
              } else if (event === 'TOKEN_REFRESHED') {
                console.log('[AuthContext] Token refreshed successfully')
              } else if (event === 'USER_UPDATED') {
                console.log('[AuthContext] User updated')
              }
            })

            subscription = authListener.subscription
          } catch (sessionError) {
            console.error('[AuthContext] Session check error:', sessionError)
            // 세션 확인 실패 시 localStorage 확인
            const authStatus = localStorage.getItem('dental_auth')
            const userData = localStorage.getItem('dental_user')

            if (authStatus === 'true' && userData) {
              try {
                const parsedUser = JSON.parse(userData)
                console.log('AuthContext: localStorage에서 사용자 정보 복원', parsedUser)
                setUser(parsedUser)
              } catch (e) {
                console.error('Failed to parse localStorage user data:', e)
              }
            }
          }
        } else {
          // Supabase 설정이 안 된 경우 localStorage만 확인
          console.warn('[AuthContext] Supabase not configured, checking localStorage only')
          const authStatus = localStorage.getItem('dental_auth')
          const userData = localStorage.getItem('dental_user')

          if (authStatus === 'true' && userData) {
            try {
              const parsedUser = JSON.parse(userData)
              console.log('AuthContext: localStorage에서 사용자 정보 복원', parsedUser)
              setUser(parsedUser)
            } catch (e) {
              console.error('Failed to parse user data from localStorage:', e)
              localStorage.removeItem('dental_auth')
              localStorage.removeItem('dental_user')
            }
          }
        }
      } catch (error) {
        console.error('===== AuthContext: checkAuth 전체 에러 =====', error)
      } finally {
        // 타임아웃 클리어
        if (timeoutId) {
          clearTimeout(timeoutId)
        }
        // 모든 경우에 대해 로딩 상태를 false로 변경
        console.log('===== AuthContext: 로딩 완료, setLoading(false) =====')
        setLoading(false)
      }
    }

    // 타임아웃 설정: 15초 후에도 로딩이 끝나지 않으면 강제로 종료
    timeoutId = setTimeout(() => {
      console.warn('[AuthContext] Auth check timeout - forcing loading to false')
      setLoading(false)
    }, 15000)

    checkAuth()

    // Cleanup function
    return () => {
      if (subscription) {
        subscription.unsubscribe()
      }
      if (timeoutId) {
        clearTimeout(timeoutId)
      }
    }
  }, [])

  const login = (userId: string, clinicInfo: any) => {
    console.log('[AuthContext] Login - Cookie-based session')

    // clinicInfo가 users 테이블의 레코드 전체를 포함한다고 가정합니다.
    // 로그인 ID(userId)와 clinicInfo의 이메일이 다를 수 있으므로, clinicInfo의 데이터를 우선합니다.
    const userData = {
      ...clinicInfo,
      userId: userId, // 로그인 시 사용한 ID는 별도로 저장
    };

    setUser(userData)
    localStorage.setItem('dental_auth', 'true')
    localStorage.setItem('dental_user', JSON.stringify(userData))
    if (userData.clinic_id) {
      dataService.setCachedClinicId(userData.clinic_id)
    } else {
      // clinic_id가 없는 경우 (마스터 관리자 등) 캐시 클리어
      dataService.clearCachedClinicId()
    }
  }

  const updateUser = (updatedUserData: any) => {
    setUser(updatedUserData)
    localStorage.setItem('dental_user', JSON.stringify(updatedUserData))
  }

  const logout = async () => {
    try {
      setIsLoggingOut(true)
      localStorage.setItem('dental_logging_out', 'true')

      const supabase = createClient()
      await supabase.auth.signOut()

      setUser(null)
      localStorage.removeItem('dental_auth')
      localStorage.removeItem('dental_user')
      dataService.clearCachedClinicId()

      // dental_logging_out 플래그는 새 페이지의 checkAuth에서 제거됨
      // finally에서 제거하면 페이지 이동 전에 제거되어 세션 체크가 수행됨
      window.location.href = '/'
    } catch (error) {
      console.error('Logout error:', error)
      // Force logout even if error
      setUser(null)
      localStorage.removeItem('dental_auth')
      localStorage.removeItem('dental_user')
      window.location.href = '/'
    }
    // finally 블록 제거: window.location.href 후 페이지가 리로드되므로
    // setIsLoggingOut(false)와 localStorage.removeItem은 불필요
    // dental_logging_out은 새 페이지의 checkAuth에서 처리됨
  }

  const isAuthenticated = !!user

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

      {isLoggingOut && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60">
          <div className="bg-white rounded-xl shadow-2xl px-8 py-10 text-center max-w-sm w-full mx-4">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-6" />
            <h3 className="text-2xl font-semibold text-slate-900 mb-2">로그아웃 중...</h3>
            <p className="text-slate-600">조금만 기다려 주세요. 안전하게 로그아웃 처리 중입니다.</p>
          </div>
        </div>
      )}
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