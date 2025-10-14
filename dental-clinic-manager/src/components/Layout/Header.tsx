'use client'

import { Shield, LogOut, User, Cog, Crown } from 'lucide-react'
import Link from 'next/link'

interface User {
  userId?: string
  name?: string
  role?: string
  clinic?: {
    name: string
    ownerName?: string
  }
  clinicName?: string
  clinicOwnerName?: string
  clinicAddress?: string
  clinicPhone?: string
  clinicEmail?: string
}

interface HeaderProps {
  dbStatus: 'connected' | 'connecting' | 'error'
  user?: User | null
  onLogout?: () => void
  showManagementLink?: boolean
  onProfileClick?: () => void
}

export default function Header({ dbStatus, user, onLogout, showManagementLink = true, onProfileClick }: HeaderProps) {
  // 디버깅: user 정보 로그
  console.log('[Header] User info:', {
    user,
    role: user?.role,
    isMaster: user?.role === 'master'
  })

  const getStatusColor = () => {
    switch (dbStatus) {
      case 'connected': return 'bg-green-500'
      case 'error': return 'bg-red-500'
      case 'connecting': return 'bg-yellow-400'
      default: return 'bg-gray-400'
    }
  }

  const getStatusText = () => {
    switch (dbStatus) {
      case 'connected': return '실시간 연결됨'
      case 'error': return '연결 실패'
      case 'connecting': return '연결 중...'
      default: return '상태 확인 중'
    }
  }

  return (
    <header className="mb-8 flex flex-wrap justify-between items-center gap-4">
      <div>
        <Link href="/dashboard" className="group">
          <div className="flex items-center space-x-4 cursor-pointer transition-transform duration-200 hover:scale-105">
            <Shield className="w-10 h-10 text-blue-500 group-hover:text-blue-600 transition-colors" />
            <div>
              <h1 className="text-3xl font-bold text-slate-900 group-hover:text-blue-600 transition-colors">덴탈매니저</h1>
              {user && (
                <p className="text-sm text-slate-600 mt-1">
                  {user.clinic?.name || user.clinicName} - {user.clinic?.ownerName || user.clinicOwnerName}
                </p>
              )}
            </div>
          </div>
        </Link>
      </div>
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2 text-sm">
          <div className={`w-3 h-3 rounded-full ${getStatusColor()}`}></div>
          <span className="text-slate-600">{getStatusText()}</span>
        </div>
        {user && onLogout && (
          <div className="flex items-center space-x-2">
            {/* Master Admin Link */}
            {user.role === 'master' && (
              <Link
                href="/master"
                className="flex items-center space-x-1 px-3 py-2 text-sm text-purple-600 hover:text-purple-700 hover:bg-purple-50 hover:shadow-md rounded-lg transition-all duration-200 cursor-pointer border border-transparent hover:border-purple-200 transform hover:scale-105"
                title="마스터 관리"
              >
                <Crown className="w-4 h-4 transition-transform hover:rotate-12" />
                <span className="font-medium">마스터</span>
              </Link>
            )}

            {/* Management Link */}
            {showManagementLink && ['owner', 'vice_director', 'manager', 'master'].includes(user.role || '') && (
              <Link
                href="/management"
                className="flex items-center space-x-1 px-3 py-2 text-sm text-blue-600 hover:text-blue-700 hover:bg-blue-50 hover:shadow-md rounded-lg transition-all duration-200 cursor-pointer border border-transparent hover:border-blue-200 transform hover:scale-105"
                title="병원 관리"
              >
                <Cog className="w-4 h-4 transition-transform hover:rotate-12" />
                <span className="font-medium">관리</span>
              </Link>
            )}

            <button
              onClick={onProfileClick || (() => console.log('Profile click - no handler'))}
              className="flex items-center space-x-2 px-3 py-1 bg-slate-100 hover:bg-slate-200 hover:shadow-md rounded-lg transition-all duration-200 cursor-pointer border border-transparent hover:border-slate-300 transform hover:scale-105"
              title="계정 정보 - 클릭하여 프로필 보기"
              style={{ cursor: 'pointer' }}
            >
              <User className="w-4 h-4 text-slate-600 hover:text-slate-800 transition-colors" />
              <span className="text-sm text-slate-700 hover:text-slate-900 font-medium transition-colors">{user.name || user.userId}</span>
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                console.log('로그아웃 버튼 클릭됨')
                if (onLogout) {
                  onLogout()
                } else {
                  console.error('onLogout 함수가 전달되지 않았습니다.')
                }
              }}
              className="flex items-center space-x-1 px-3 py-2 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 hover:shadow-md rounded-lg transition-all duration-200 cursor-pointer border border-transparent hover:border-red-200 transform hover:scale-105"
              title="로그아웃"
              style={{ cursor: 'pointer' }}
            >
              <LogOut className="w-4 h-4 transition-transform hover:rotate-12" />
              <span className="font-medium">로그아웃</span>
            </button>
          </div>
        )}
      </div>
    </header>
  )
}