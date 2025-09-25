'use client'

import { createContext, useContext, useState, useEffect, ReactNode } from 'react'

interface User {
  userId: string
  clinicName: string
  clinicOwnerName: string
  clinicAddress?: string
  clinicPhone?: string
  clinicEmail?: string
}

interface AuthContextType {
  user: User | null
  isAuthenticated: boolean
  login: (userData: User) => void
  logout: () => void
  loading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // 초기 로딩 시 localStorage에서 사용자 정보 확인
    const checkAuth = () => {
      try {
        const authStatus = localStorage.getItem('dental_auth')
        const userData = localStorage.getItem('dental_user')

        if (authStatus === 'true' && userData) {
          const parsedUser = JSON.parse(userData)
          setUser(parsedUser)
        }
      } catch (error) {
        console.error('Auth check error:', error)
        // 오류 시 localStorage 정리
        localStorage.removeItem('dental_auth')
        localStorage.removeItem('dental_user')
      } finally {
        setLoading(false)
      }
    }

    checkAuth()
  }, [])

  const login = (userData: User) => {
    setUser(userData)
    localStorage.setItem('dental_auth', 'true')
    localStorage.setItem('dental_user', JSON.stringify(userData))
  }

  const logout = () => {
    setUser(null)
    localStorage.removeItem('dental_auth')
    localStorage.removeItem('dental_user')
    localStorage.removeItem('dental_remember')
  }

  const value = {
    user,
    isAuthenticated: !!user,
    login,
    logout,
    loading
  }

  return (
    <AuthContext.Provider value={value}>
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