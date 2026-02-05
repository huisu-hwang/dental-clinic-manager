'use client'

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react'
import type { AuthChangeEvent, Session } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { dataService } from '@/lib/dataService'
import type { Permission } from '@/types/permissions'
import { useActivityTracker } from '@/hooks/useActivityTracker'
import { SESSION_CHECK_TIMEOUT, safeLocalStorage, isIOSDevice } from '@/lib/sessionUtils'
import { TIMEOUTS } from '@/lib/constants/timeouts'
import { useRouter } from 'next/navigation'
import { clearAllSupabaseCookies, refreshSessionCookies } from '@/lib/cookieStorageAdapter'

export interface UserProfile {
  id: string
  email?: string
  name?: string
  role?: string
  status?: 'pending' | 'active' | 'rejected' | 'resigned'
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
        const loggingOut = safeLocalStorage.getItem('dental_logging_out')
        if (isLoggingOut || loggingOut === 'true') {
          console.log('AuthContext: 로그아웃 중이므로 세션 체크 스킵')
          safeLocalStorage.removeItem('dental_logging_out')
          return
        }

        // iOS 디바이스 감지 로깅
        if (isIOSDevice()) {
          console.log('[AuthContext] iOS device detected - using safe storage')
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
                  safeLocalStorage.removeItem('dental_auth')
                  safeLocalStorage.removeItem('dental_user')
                  // Supabase 스토리지도 클리어
                  safeLocalStorage.clearSupabaseData()
                }
                session = null
              } else {
                session = result?.data?.session
                console.log('[AuthContext] Session check complete:', session ? 'session found' : 'no session')
              }
            } catch (timeoutError) {
              console.log('[AuthContext] Session check error:', timeoutError)
              // 에러 발생 시 세션 없음으로 처리하고 스토리지 클리어
              if (timeoutError instanceof Error && timeoutError.message?.includes('Refresh Token')) {
                console.log('[AuthContext] Invalid refresh token detected, clearing storage')
                safeLocalStorage.removeItem('dental_auth')
                safeLocalStorage.removeItem('dental_user')
                // Supabase 스토리지도 클리어
                safeLocalStorage.clearSupabaseData()
              }
              session = null
            }

            if (session?.user) {
              console.log('AuthContext: Supabase 세션 발견', session.user.id)

              // 사용자 프로필 정보 가져오기
              const result = await dataService.getUserProfileById(session.user.id)

              if (result.success && result.data) {
                console.log('AuthContext: 사용자 프로필 로드 성공', result.data)

                // 세션 복원 시 접속 기록 저장 (로그인과 구분)
                // 30분 이내 중복 접속은 기록하지 않음
                const lastAccessTime = sessionStorage.getItem('last_access_log_time')
                const now = Date.now()
                const thirtyMinutes = 30 * 60 * 1000

                if (!lastAccessTime || now - parseInt(lastAccessTime) > thirtyMinutes) {
                  // 접속 기록 저장 (비동기로 처리, 실패해도 무시)
                  fetch('/api/activity-log', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      user_id: result.data.id,
                      clinic_id: result.data.clinic_id || null,
                      activity_type: 'access',
                      activity_description: '앱 접속',
                      metadata: {
                        email: result.data.email,
                        role: result.data.role,
                        clinic_name: result.data.clinic?.name || null
                      }
                    })
                  }).then(() => {
                    console.log('[AuthContext] Access log saved successfully')
                    sessionStorage.setItem('last_access_log_time', now.toString())
                  }).catch((err) => {
                    console.warn('[AuthContext] Failed to save access log:', err)
                  })
                }

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

                // 퇴사한 사용자는 resigned 페이지로 이동 (세션 유지, 다른 병원 가입 가능)
                if (result.data.status === 'resigned') {
                  console.warn('[AuthContext] User has resigned - restricting clinic access')

                  setUser(result.data)

                  if (window.location.pathname !== '/resigned') {
                    console.log('[AuthContext] Redirecting to /resigned')
                    router.push('/resigned')
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
              // Supabase 세션이 없으면 storage 확인 (기존 방식 호환)
              const authStatus = safeLocalStorage.getItem('dental_auth')
              const userData = safeLocalStorage.getItem('dental_user')

              if (authStatus === 'true' && userData) {
                try {
                  const parsedUser = JSON.parse(userData)
                  console.log('AuthContext: storage에서 사용자 정보 복원', parsedUser)
                  setUser(parsedUser)
                } catch (e) {
                  console.error('Failed to parse storage user data:', e)
                }
              }
            }

            // Auth 상태 변경 리스너 설정
            const { data: authListener } = supabase.auth.onAuthStateChange(async (event: AuthChangeEvent, session: Session | null) => {
              console.log('Auth state changed:', event)

              // 로그아웃 중이면 무시
              const loggingOut = safeLocalStorage.getItem('dental_logging_out')
              if (loggingOut === 'true') {
                console.log('로그아웃 중이므로 auth state change 무시')
                return
              }

              // PASSWORD_RECOVERY 이벤트: update-password 페이지로 리다이렉트
              if (event === 'PASSWORD_RECOVERY') {
                console.log('PASSWORD_RECOVERY 이벤트 감지 - /update-password로 리다이렉트')

                // 현재 페이지가 update-password가 아니면 리다이렉트 (URL 해시 포함)
                if (typeof window !== 'undefined' && window.location.pathname !== '/update-password') {
                  window.location.href = '/update-password' + window.location.hash
                }
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

                    // 퇴사한 사용자 체크 (세션 유지, 다른 병원 가입 가능)
                    if (result.data.status === 'resigned') {
                      console.warn('[AuthContext] SIGNED_IN event - User has resigned')

                      setUser(result.data)

                      if (window.location.pathname !== '/resigned') {
                        router.push('/resigned')
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
                safeLocalStorage.removeItem('dental_auth')
                safeLocalStorage.removeItem('dental_user')
                dataService.clearCachedClinicId()
              } else if (event === 'TOKEN_REFRESHED') {
                console.log('[AuthContext] Token refreshed successfully')
                // 토큰 갱신 시 세션 유지 확인을 위해 프로필 다시 로드
                if (session?.user) {
                   console.log('[AuthContext] Refreshing user profile after token refresh...')
                   // skipConnectionCheck: true로 DB 부하 줄임
                   const result = await dataService.getUserProfileById(session.user.id, { skipConnectionCheck: true })
                   if (result.success && result.data) {
                     setUser(result.data)
                   }
                }
              } else if (event === 'USER_UPDATED') {
                console.log('[AuthContext] User updated')
              }
            })

            subscription = authListener.subscription
          } catch (sessionError) {
            console.error('[AuthContext] Session check error:', sessionError)
            // 세션 확인 실패 시 storage 확인
            const authStatus = safeLocalStorage.getItem('dental_auth')
            const userData = safeLocalStorage.getItem('dental_user')

            if (authStatus === 'true' && userData) {
              try {
                const parsedUser = JSON.parse(userData)
                console.log('AuthContext: storage에서 사용자 정보 복원', parsedUser)
                setUser(parsedUser)
              } catch (e) {
                console.error('Failed to parse storage user data:', e)
              }
            }
          }
        } else {
          // Supabase 설정이 안 된 경우 storage만 확인
          console.warn('[AuthContext] Supabase not configured, checking storage only')
          const authStatus = safeLocalStorage.getItem('dental_auth')
          const userData = safeLocalStorage.getItem('dental_user')

          if (authStatus === 'true' && userData) {
            try {
              const parsedUser = JSON.parse(userData)
              console.log('AuthContext: storage에서 사용자 정보 복원', parsedUser)
              setUser(parsedUser)
            } catch (e) {
              console.error('Failed to parse user data from storage:', e)
              safeLocalStorage.removeItem('dental_auth')
              safeLocalStorage.removeItem('dental_user')
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
    safeLocalStorage.setItem('dental_auth', 'true')
    safeLocalStorage.setItem('dental_user', JSON.stringify(userData))
    if (userData.clinic_id) {
      dataService.setCachedClinicId(userData.clinic_id)
    } else {
      // clinic_id가 없는 경우 (마스터 관리자 등) 캐시 클리어
      dataService.clearCachedClinicId()
    }
  }

  const updateUser = (updatedUserData: any) => {
    setUser(updatedUserData)
    safeLocalStorage.setItem('dental_user', JSON.stringify(updatedUserData))
  }

  const logout = async () => {
    try {
      setIsLoggingOut(true)
      safeLocalStorage.setItem('dental_logging_out', 'true')

      const supabase = createClient()
      await supabase.auth.signOut()

      setUser(null)
      safeLocalStorage.removeItem('dental_auth')
      safeLocalStorage.removeItem('dental_user')
      dataService.clearCachedClinicId()

      // iOS Safari 호환: 쿠키 기반 스토리지 클리어
      clearAllSupabaseCookies()

      // dental_logging_out 플래그는 새 페이지의 checkAuth에서 제거됨
      // finally에서 제거하면 페이지 이동 전에 제거되어 세션 체크가 수행됨
      window.location.href = '/'
    } catch (error) {
      console.error('Logout error:', error)
      // Force logout even if error
      setUser(null)
      safeLocalStorage.removeItem('dental_auth')
      safeLocalStorage.removeItem('dental_user')
      // iOS Safari 호환: 쿠키 기반 스토리지 클리어
      clearAllSupabaseCookies()
      window.location.href = '/'
    }
    // finally 블록 제거: window.location.href 후 페이지가 리로드되므로
    // setIsLoggingOut(false)와 safeLocalStorage.removeItem은 불필요
    // dental_logging_out은 새 페이지의 checkAuth에서 처리됨
  }

  const isAuthenticated = !!user

  // iOS Safari 호환: 사용자 활동 시 세션 쿠키 갱신
  // 사용자가 사이트와 상호작용하면 쿠키 수명이 연장됨
  useEffect(() => {
    if (!isAuthenticated || typeof window === 'undefined') return

    // 사용자 활동 감지 시 쿠키 갱신
    const handleUserActivity = () => {
      // 너무 자주 갱신하지 않도록 debounce (5분에 한 번)
      const lastRefresh = sessionStorage.getItem('lastCookieRefresh')
      const now = Date.now()

      if (!lastRefresh || now - parseInt(lastRefresh) > 5 * 60 * 1000) {
        refreshSessionCookies()
        sessionStorage.setItem('lastCookieRefresh', now.toString())
      }
    }

    // 사용자 활동 이벤트 리스너 등록
    const events = ['click', 'scroll', 'keypress', 'touchstart']
    events.forEach(event => {
      window.addEventListener(event, handleUserActivity, { passive: true })
    })

    // 초기 갱신 (페이지 로드 시)
    handleUserActivity()

    return () => {
      events.forEach(event => {
        window.removeEventListener(event, handleUserActivity)
      })
    }
  }, [isAuthenticated])

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