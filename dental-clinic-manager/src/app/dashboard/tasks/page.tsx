'use client'

import { useRouter } from 'next/navigation'
import { ListTodo } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import TaskList from '@/components/Bulletin/TaskList'

export default function TasksPage() {
  const router = useRouter()
  const { user } = useAuth()

  const isAdmin = !!(user?.role && ['master_admin', 'owner', 'vice_director', 'manager', 'team_leader'].includes(user.role))
  const isMasterAdmin = user?.role === 'master_admin'

  if (!user) {
    return null
  }

  return (
    <div className="bg-white min-h-screen">
      <div className="p-4 sm:p-6">
        {isMasterAdmin ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="w-16 h-16 bg-purple-100 rounded-full flex items-center justify-center mb-4">
              <ListTodo className="w-8 h-8 text-purple-500" />
            </div>
            <h3 className="text-lg font-semibold text-at-text mb-2">마스터 관리자 계정</h3>
            <p className="text-at-text-weak text-sm max-w-md mb-4">
              업무 지시는 소속 병원별로 운영됩니다.<br />
              마스터 관리자 계정은 특정 병원에 소속되어 있지 않아 업무 지시를 이용할 수 없습니다.
            </p>
            <p className="text-at-text-weak text-xs">
              커뮤니티 관리는 <button onClick={() => router.push('/master')} className="text-purple-600 hover:text-purple-800 font-medium underline">마스터 관리자 대시보드</button>에서 이용하세요.
            </p>
          </div>
        ) : (
          <TaskList canCreate={isAdmin} />
        )}
      </div>
    </div>
  )
}
