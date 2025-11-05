'use client'

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { getSupabase } from '@/lib/supabase'
import { dataService } from '@/lib/dataService'
import { clearAllSessions, getRememberMe } from '@/lib/customStorageAdapter'
import type { Permission } from '@/types/permissions'
import { useActivityTracker } from '@/hooks/useActivityTracker'

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

// Temporary master admin credentials for testing
const MASTER_ADMIN: UserProfile = {
  id: 'master-admin-001',
  email: 'sani81@gmail.com',
  name: 'Master Administrator',
  role: 'master',
  status: 'active',
  userId: 'sani81@gmail.com'
}

interface PersistedAuthData {
  authStatus: string | null
  userData: string | null
  source: 'session' | 'local' | null
}

const getPersistedAuthData = (): PersistedAuthData => {
  if (typeof window === 'undefined') {
    return { authStatus: null, userData: null, source: null }
  }

  const storageCandidates: Array<{ label: 'session' | 'local'; getStorage: () => Storage }> = [
    {
      label: 'session',
      getStorage: () => window.sessionStorage
    },
    {
      label: 'local',
      getStorage: () => window.localStorage
    }
  ]

  for (const candidate of storageCandidates) {
    try {
      const storage = candidate.getStorage()
      const authStatus = storage.getItem('dental_auth')
      const userData = storage.getItem('dental_user')

      if (authStatus === 'true' && userData) {
        return { authStatus, userData, source: candidate.label }
      }
    } catch (error) {
      console.warn(`[AuthContext] Failed to access ${candidate.label}Storage:`, error)
    }
  }

  return { authStatus: null, userData: null, source: null }
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
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
        // 로그아웃 중이면 세션 체크 스킵
        const loggingOut = localStorage.getItem('dental_logging_out')
        if (isLoggingOut || loggingOut === 'true') {
          console.log('AuthContext: 로그아웃 중이므로 세션 체크 스킵')
          localStorage.removeItem('dental_logging_out')
          return
        }

        console.log('[AuthContext] Getting Supabase client...')
        const supabase = getSupabase()
        console.log('[AuthContext] Supabase client:', supabase ? 'obtained' : 'null')

        if (supabase) {
          try {
            // Supabase 세션 확인 - 타임아웃 추가
            console.log('[AuthContext] Checking Supabase session...')

            let session: Session | null = null;
            try {
              const sessionPromise = supabase.auth.getSession()
              const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Session check timeout')), 10000)
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
              const { authStatus, userData, source } = getPersistedAuthData()

              if (authStatus === 'true' && userData) {
                try {
                  const parsedUser = JSON.parse(userData)
                  console.log(`AuthContext: ${source}Storage에서 사용자 정보 복원`, parsedUser)
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
            const { authStatus, userData, source } = getPersistedAuthData()

            if (authStatus === 'true' && userData) {
              try {
                const parsedUser = JSON.parse(userData)
                console.log(`AuthContext: ${source}Storage에서 사용자 정보 복원`, parsedUser)
                setUser(parsedUser)
              } catch (e) {
                console.error('Failed to parse localStorage user data:', e)
              }
            }
          }
        } else {
          // Supabase 설정이 안 된 경우 localStorage만 확인
          console.warn('[AuthContext] Supabase not configured, checking localStorage only')
          const { authStatus, userData, source } = getPersistedAuthData()

          if (authStatus === 'true' && userData) {
            try {
              const parsedUser = JSON.parse(userData)
              console.log(`AuthContext: ${source}Storage에서 사용자 정보 복원`, parsedUser)
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
    // rememberMe 플래그에 따라 storage 선택
    const rememberMe = getRememberMe()
    const storage = rememberMe ? window.localStorage : window.sessionStorage
    console.log(`[AuthContext] Login using ${rememberMe ? 'localStorage' : 'sessionStorage'} (rememberMe: ${rememberMe})`)

    // Check for master admin login
    if (userId === 'sani81@gmail.com') {
      const masterAdmin = { ...MASTER_ADMIN }
      setUser(masterAdmin)
      storage.setItem('dental_auth', 'true')
      storage.setItem('dental_user', JSON.stringify(masterAdmin))
      dataService.clearCachedClinicId()
      return
    }

    // clinicInfo가 users 테이블의 레코드 전체를 포함한다고 가정합니다.
    // 로그인 ID(userId)와 clinicInfo의 이메일이 다를 수 있으므로, clinicInfo의 데이터를 우선합니다.
    const userData = {
      ...clinicInfo,
      userId: userId, // 로그인 시 사용한 ID는 별도로 저장
    };


    setUser(userData)
    storage.setItem('dental_auth', 'true')
    storage.setItem('dental_user', JSON.stringify(userData))
    if (userData.clinic_id) {
      dataService.setCachedClinicId(userData.clinic_id)
    }
  }

  const updateUser = (updatedUserData: any) => {
    // rememberMe 플래그에 따라 storage 선택
    const rememberMe = getRememberMe()
    const storage = rememberMe ? window.localStorage : window.sessionStorage

    setUser(updatedUserData)
    storage.setItem('dental_user', JSON.stringify(updatedUserData))
    if (updatedUserData?.clinic_id) {
      dataService.setCachedClinicId(updatedUserData.clinic_id)
    }
  }

  const logout = async (showInactivityMessage = false) => {
    console.log('Logout 시작...')

    // Show inactivity modal if requested
    if (showInactivityMessage) {
      setShowInactivityModal(true)
      // Wait for user to see the message
      await new Promise(resolve => setTimeout(resolve, 100))
    }

    // 로그아웃 중 플래그 설정
    setIsLoggingOut(true)

    // Supabase 로그아웃 시도 (먼저 실행, 타임아웃 5초)
    const supabase = getSupabase()
    if (supabase) {
      try {
        const signOutPromise = supabase.auth.signOut()
        const timeoutPromise = new Promise<{ error: any }>((resolve) =>
          setTimeout(() => resolve({ error: new Error('Logout timeout') }), 5000)
        )

        const { error } = await Promise.race([signOutPromise, timeoutPromise])
        if (error) {
          console.error('Supabase logout error:', error)
        } else {
          console.log('Supabase 로그아웃 성공')
        }
      } catch (error) {
        console.error('Logout error:', error)
      }
    }

    // 로컬 상태를 모두 초기화
    setUser(null)
    dataService.clearCachedClinicId()

    // 모든 세션 데이터 완전 정리 (localStorage, sessionStorage 모두)
    console.log('[Logout] Clearing all session data...')
    clearAllSessions()

    // 로그아웃 중임을 localStorage에도 저장
    localStorage.setItem('dental_logging_out', 'true')

    // 강제로 홈 페이지로 리디렉션
    console.log('홈 페이지로 리디렉션...')

    // 약간의 지연 후 리디렉션 (상태 업데이트가 완료되도록)
    setTimeout(() => {
      localStorage.removeItem('dental_logging_out')
      setShowInactivityModal(false)
      window.location.href = '/'
    }, showInactivityMessage ? 2000 : 100)
  }

  // Auto logout after 4 hours of inactivity
  const handleInactivity = () => {
    console.log('[AuthContext] User inactive for 4 hours, logging out...')
    logout(true)
  }

  // Track user activity (only when user is logged in)
  useActivityTracker({
    onInactive: handleInactivity,
    inactivityTimeout: 4 * 60 * 60 * 1000, // 4 hours in milliseconds
    enabled: !!user && !loading && !isLoggingOut
  })

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

      {/* Inactivity Modal */}
      {showInactivityModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[9999]">
          <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full mx-4">
            <div className="text-center">
              <div className="mb-4">
                <svg
                  className="mx-auto h-12 w-12 text-amber-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-2">
                자동 로그아웃
              </h3>
              <p className="text-slate-600 mb-6">
                4시간 동안 아무런 동작이 없어서<br />
                자동으로 로그아웃 되었습니다.
              </p>
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto"></div>
              <p className="text-sm text-slate-500 mt-4">
                로그인 페이지로 이동 중...
              </p>
            </div>
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