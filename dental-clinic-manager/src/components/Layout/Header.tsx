'use client'

import { Shield, LogOut, User, Cog, Crown, Clock } from 'lucide-react'
import Link from 'next/link'

import type { UserProfile } from '@/contexts/AuthContext'

interface HeaderProps {
  dbStatus?: 'connected' | 'connecting' | 'error'
  user?: UserProfile | null
  onLogout?: () => void
  showManagementLink?: boolean
  onProfileClick?: () => void
}

export default function Header({ dbStatus = 'connected', user, onLogout, showManagementLink = true, onProfileClick }: HeaderProps) {
  // 디버깅: user 정보 로그
  console.log('[Header] User info:', {
    user,
    role: user?.role,
    isMaster: user?.role === 'master_admin'
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
    <header className="bg-white rounded-xl shadow-sm border border-slate-200/60 px-6 py-4 flex flex-wrap justify-between items-center gap-4">
      <div>
        <Link href="/dashboard" className="group">
          <div className="flex items-center space-x-3 cursor-pointer transition-all duration-200 hover:opacity-80">
            <div className="bg-gradient-to-br from-blue-500 to-blue-600 p-2 rounded-xl shadow-md">
              <Shield className="w-7 h-7 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent">덴탈매니저</h1>
              {user && (
                <p className="text-xs text-slate-500 mt-0.5">
                  {user.clinic?.name || user.clinicName} · {user.clinic?.ownerName || user.clinicOwnerName}
                </p>
              )}
            </div>
          </div>
        </Link>
      </div>
      <div className="flex items-center space-x-3">
        <div className="flex items-center space-x-1.5 text-xs bg-slate-50 px-3 py-1.5 rounded-full border border-slate-200">
          <div className={`w-2 h-2 rounded-full ${getStatusColor()} ${dbStatus === 'connected' ? 'animate-pulse' : ''}`}></div>
          <span className="text-slate-600 font-medium">{getStatusText()}</span>
        </div>
        {user && onLogout && (
          <div className="flex items-center space-x-1.5">
            {/* Master Admin Link */}
            {user.role === 'master_admin' && (
              <Link
                href="/master"
                className="flex items-center space-x-1.5 px-3 py-2 text-sm text-purple-600 hover:text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-lg transition-all duration-200 cursor-pointer border border-purple-200"
                title="마스터 관리"
              >
                <Crown className="w-4 h-4" />
                <span className="font-medium">마스터</span>
              </Link>
            )}

            {/* Management Link */}
            {showManagementLink && user.role === 'owner' && (
              <Link
                href="/management"
                className="flex items-center space-x-1.5 px-3 py-2 text-sm text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-lg transition-all duration-200 cursor-pointer border border-blue-200"
                title="병원 관리"
              >
                <Cog className="w-4 h-4" />
                <span className="font-medium">관리</span>
              </Link>
            )}

            <button
              onClick={onProfileClick || (() => console.log('Profile click - no handler'))}
              className="flex items-center space-x-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg transition-all duration-200 cursor-pointer border border-slate-200"
              title="계정 정보 - 클릭하여 프로필 보기"
              style={{ cursor: 'pointer' }}
            >
              <User className="w-4 h-4 text-slate-500" />
              <span className="text-sm text-slate-700 font-medium">{user.name || user.userId}</span>
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="flex items-center space-x-1.5 px-3 py-2 text-sm text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 rounded-lg transition-all duration-200 cursor-pointer border border-red-200"
              title="로그아웃"
            >
              <LogOut className="w-4 h-4" />
              <span className="font-medium">로그아웃</span>
            </button>
          </div>
        )}
      </div>
    </header>
  )
}