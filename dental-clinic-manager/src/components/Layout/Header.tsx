'use client'

import { Shield, LogOut, User } from 'lucide-react'

interface User {
  userId: string
  clinicName: string
  clinicOwnerName: string
  clinicAddress?: string
  clinicPhone?: string
  clinicEmail?: string
}

interface HeaderProps {
  dbStatus: 'connected' | 'connecting' | 'error'
  user?: User | null
  onLogout?: () => void
}

export default function Header({ dbStatus, user, onLogout }: HeaderProps) {
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
        <div className="flex items-center space-x-4">
          <Shield className="w-10 h-10 text-blue-500" />
          <div>
            <h1 className="text-3xl font-bold text-slate-900">덴탈매니저</h1>
            {user && (
              <p className="text-sm text-slate-600 mt-1">{user.clinicName} - {user.clinicOwnerName}</p>
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2 text-sm">
          <div className={`w-3 h-3 rounded-full ${getStatusColor()}`}></div>
          <span className="text-slate-600">{getStatusText()}</span>
        </div>
        {user && onLogout && (
          <div className="flex items-center space-x-2">
            <div className="flex items-center space-x-2 px-3 py-1 bg-slate-100 rounded-lg">
              <User className="w-4 h-4 text-slate-600" />
              <span className="text-sm text-slate-700">{user.userId}</span>
            </div>
            <button
              onClick={onLogout}
              className="flex items-center space-x-1 px-3 py-2 text-sm text-red-600 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
              title="로그아웃"
            >
              <LogOut className="w-4 h-4" />
              <span>로그아웃</span>
            </button>
          </div>
        )}
      </div>
    </header>
  )
}