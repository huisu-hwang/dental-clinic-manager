'use client'

import { Shield, LogOut, User, Cog, Crown } from 'lucide-react'
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
      case 'connected': return '연결됨'
      case 'error': return '연결 실패'
      case 'connecting': return '연결 중...'
      default: return '상태 확인 중'
    }
  }

  return (
    <header className="flex w-full justify-between items-center">
      {/* 로고 영역 */}
      <div>
        <Link href="/dashboard" className="group">
          <div className="flex items-center space-x-3 cursor-pointer transition-transform duration-200 hover:scale-[1.02]">
            <div className="w-9 h-9 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center shadow-md shadow-blue-500/20">
              <Shield className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-800 group-hover:text-blue-600 transition-colors">덴탈매니저</h1>
              {user && (
                <p className="text-xs text-slate-500 -mt-0.5">
                  {user.clinic?.name || user.clinicName}
                </p>
              )}
            </div>
          </div>
        </Link>
      </div>

      {/* 우측 메뉴 영역 */}
      {user && onLogout && (
        <div className="flex items-center space-x-1">
          {/* 연결 상태 */}
          <div className="flex items-center space-x-1.5 px-2.5 py-1.5 text-xs text-slate-500">
            <div className={`w-1.5 h-1.5 rounded-full ${getStatusColor()} ${dbStatus === 'connecting' ? 'animate-pulse' : ''}`}></div>
            <span>{getStatusText()}</span>
          </div>

          <div className="w-px h-5 bg-slate-200 mx-1"></div>

          {/* Master Admin Link */}
          {user.role === 'master_admin' && (
            <Link
              href="/master"
              className="flex items-center space-x-1.5 px-2.5 py-1.5 text-xs text-purple-600 hover:text-purple-700 hover:bg-purple-50 rounded-md transition-all duration-200"
              title="마스터 관리"
            >
              <Crown className="w-3.5 h-3.5" />
              <span className="font-medium">마스터</span>
            </Link>
          )}

          {/* Management Link */}
          {showManagementLink && user.role === 'owner' && (
            <Link
              href="/management"
              className="flex items-center space-x-1.5 px-2.5 py-1.5 text-xs text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-md transition-all duration-200"
              title="병원 관리"
            >
              <Cog className="w-3.5 h-3.5" />
              <span className="font-medium">관리</span>
            </Link>
          )}

          {/* 사용자 정보 */}
          <button
            onClick={onProfileClick || (() => console.log('Profile click - no handler'))}
            className="flex items-center space-x-1.5 px-2.5 py-1.5 text-xs text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-all duration-200"
            title="계정 정보"
          >
            <div className="w-5 h-5 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center">
              <User className="w-3 h-3 text-white" />
            </div>
            <span className="font-medium">{user.name || user.userId}</span>
          </button>

          {/* 로그아웃 */}
          <button
            type="button"
            onClick={onLogout}
            className="flex items-center space-x-1.5 px-2.5 py-1.5 text-xs text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-md transition-all duration-200"
            title="로그아웃"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="font-medium">로그아웃</span>
          </button>
        </div>
      )}
    </header>
  )
}