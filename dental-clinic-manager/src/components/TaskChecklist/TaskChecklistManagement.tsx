'use client'

import { useState } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { usePermissions } from '@/hooks/usePermissions'
import DailyChecklist from './DailyChecklist'
import TaskTemplateManager from './TaskTemplateManager'
import TaskApproval from './TaskApproval'
import StaffChecklistOverview from './StaffChecklistOverview'
import { ClipboardCheck, Settings, FileCheck, Users } from 'lucide-react'

type SubTab = 'my-checklist' | 'manage' | 'approval' | 'overview'

export default function TaskChecklistManagement() {
  const { user } = useAuth()
  const { hasPermission } = usePermissions()

  const canView = hasPermission('task_checklist_view')
  const canManage = hasPermission('task_checklist_manage')
  const canApprove = hasPermission('task_checklist_approve')
  const canViewAll = hasPermission('task_checklist_view_all')

  // 기본 탭 결정
  const getDefaultTab = (): SubTab => {
    if (canView) return 'my-checklist'
    if (canManage) return 'manage'
    if (canApprove) return 'approval'
    if (canViewAll) return 'overview'
    return 'my-checklist'
  }

  const [activeSubTab, setActiveSubTab] = useState<SubTab>(getDefaultTab)

  const tabs: { id: SubTab; label: string; icon: React.ElementType; show: boolean }[] = [
    { id: 'my-checklist', label: '나의 체크리스트', icon: ClipboardCheck, show: canView },
    { id: 'manage', label: '업무 관리', icon: Settings, show: canManage },
    { id: 'approval', label: '결재', icon: FileCheck, show: canApprove },
    { id: 'overview', label: '전체 현황', icon: Users, show: canViewAll },
  ]

  const visibleTabs = tabs.filter(t => t.show)

  return (
    <div className="space-y-4">
      {/* 서브 탭 네비게이션 */}
      {visibleTabs.length > 1 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-4 sm:px-6">
            <nav className="flex space-x-6 overflow-x-auto" aria-label="Task checklist tabs">
              {visibleTabs.map(tab => {
                const Icon = tab.icon
                const isActive = activeSubTab === tab.id
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveSubTab(tab.id)}
                    className={`py-3 px-1 inline-flex items-center border-b-2 font-medium text-sm transition-colors whitespace-nowrap ${
                      isActive
                        ? 'border-blue-500 text-blue-600'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                    }`}
                  >
                    <Icon className="w-4 h-4 mr-2" />
                    {tab.label}
                  </button>
                )
              })}
            </nav>
          </div>
        </div>
      )}

      {/* 콘텐츠 */}
      {activeSubTab === 'my-checklist' && canView && <DailyChecklist />}
      {activeSubTab === 'manage' && canManage && <TaskTemplateManager />}
      {activeSubTab === 'approval' && canApprove && <TaskApproval />}
      {activeSubTab === 'overview' && canViewAll && <StaffChecklistOverview />}
    </div>
  )
}
