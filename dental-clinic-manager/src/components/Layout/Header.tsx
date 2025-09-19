'use client'

import { Shield } from 'lucide-react'

interface HeaderProps {
  dbStatus: 'connected' | 'connecting' | 'error'
}

export default function Header({ dbStatus }: HeaderProps) {
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
          <h1 className="text-3xl font-bold text-slate-900">하얀치과 실시간 업무 대시보드</h1>
        </div>
      </div>
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-2 text-sm">
          <div className={`w-3 h-3 rounded-full ${getStatusColor()}`}></div>
          <span className="text-slate-600">{getStatusText()}</span>
        </div>
      </div>
    </header>
  )
}