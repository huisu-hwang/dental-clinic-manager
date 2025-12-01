'use client'

import { Shield, LogOut, User, Cog, Crown, Menu, X } from 'lucide-react'
import Link from 'next/link'

import type { UserProfile } from '@/contexts/AuthContext'

interface HeaderProps {
  dbStatus?: 'connected' | 'connecting' | 'error'
  user?: UserProfile | null
  onLogout?: () => void
  showManagementLink?: boolean
  onProfileClick?: () => void
  onMenuToggle?: () => void
  isMenuOpen?: boolean
}

export default function Header({
  dbStatus = 'connected',
  user,
  onLogout,
  showManagementLink = true,
  onProfileClick,
  onMenuToggle,
  isMenuOpen = false
}: HeaderProps) {

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
    <header className="flex justify-between items-center gap-2 w-full">
      {/* 왼쪽: 햄버거 메뉴 + 로고 */}
      <div className="flex items-center gap-2 min-w-0">
        {/* 모바일 햄버거 메뉴 버튼 */}
        {onMenuToggle && (
          <button
            onClick={onMenuToggle}
            className="lg:hidden flex items-center justify-center w-10 h-10 rounded-lg hover:bg-slate-100 transition-colors flex-shrink-0"
            aria-label={isMenuOpen ? '메뉴 닫기' : '메뉴 열기'}
          >
            {isMenuOpen ? (
              <X className="w-6 h-6 text-slate-600" />
            ) : (
              <Menu className="w-6 h-6 text-slate-600" />
            )}
          </button>
        )}

        <Link href="/dashboard" className="group min-w-0">
          <div className="flex items-center space-x-2 sm:space-x-3 cursor-pointer transition-transform duration-200 hover:scale-[1.02]">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg sm:rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/20 flex-shrink-0">
              <Shield className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base sm:text-xl font-bold text-slate-800 group-hover:text-blue-600 transition-colors truncate">덴탈매니저</h1>
              {user && (
                <p className="text-xs text-slate-500 truncate hidden sm:block">
                  {user.clinic?.name || user.clinicName}
                </p>
              )}
            </div>
          </div>
        </Link>
      </div>

      {/* 오른쪽: 상태 및 버튼들 */}
      <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
        {/* 연결 상태 - 데스크탑에서만 표시 */}
        <div className="hidden md:flex items-center space-x-2 text-xs bg-slate-100 px-2 sm:px-3 py-1.5 rounded-full">
          <div className={`w-2 h-2 rounded-full ${getStatusColor()} ${dbStatus === 'connecting' ? 'animate-pulse' : ''}`}></div>
          <span className="text-slate-600">{getStatusText()}</span>
        </div>

        {/* 모바일: 연결 상태 점만 표시 */}
        <div className="md:hidden flex items-center">
          <div className={`w-2 h-2 rounded-full ${getStatusColor()} ${dbStatus === 'connecting' ? 'animate-pulse' : ''}`}></div>
        </div>

        {user && onLogout && (
          <div className="flex items-center gap-1 sm:gap-2">
            {/* Master Admin Link - 데스크탑에서만 텍스트 표시 */}
            {user.role === 'master_admin' && (
              <Link
                href="/master"
                className="flex items-center space-x-3 py-3 sm:py-2.5 px-4 sm:px-3 text-sm font-medium text-purple-600 hover:text-purple-700 bg-purple-50 hover:bg-purple-100 rounded-xl transition-all duration-200 ease-in-out"
                title="마스터 관리"
              >
                <Crown className="w-5 h-5" />
                <span className="hidden sm:inline">마스터</span>
              </Link>
            )}

            {/* Management Link - 데스크탑에서만 텍스트 표시 */}
            {showManagementLink && user.role === 'owner' && (
              <Link
                href="/management"
                className="flex items-center space-x-3 py-3 sm:py-2.5 px-4 sm:px-3 text-sm font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-xl transition-all duration-200 ease-in-out"
                title="병원 관리"
              >
                <Cog className="w-5 h-5" />
                <span className="hidden sm:inline">관리</span>
              </Link>
            )}

            {/* 프로필 버튼 */}
            <button
              onClick={onProfileClick || (() => console.log('Profile click - no handler'))}
              className="flex items-center space-x-3 py-3 sm:py-2.5 px-4 sm:px-3 text-sm font-medium text-slate-600 hover:text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all duration-200 ease-in-out"
              title="계정 정보"
            >
              <User className="w-5 h-5 text-slate-400" />
              <span className="hidden sm:inline">{user.name || user.userId}</span>
            </button>

            {/* 로그아웃 버튼 */}
            <button
              type="button"
              onClick={onLogout}
              className="flex items-center space-x-3 py-3 sm:py-2.5 px-4 sm:px-3 text-sm font-medium text-red-600 hover:text-red-700 bg-red-50 hover:bg-red-100 rounded-xl transition-all duration-200 ease-in-out"
              title="로그아웃"
            >
              <LogOut className="w-5 h-5" />
              <span className="hidden sm:inline">로그아웃</span>
            </button>
          </div>
        )}
      </div>
    </header>
  )
}