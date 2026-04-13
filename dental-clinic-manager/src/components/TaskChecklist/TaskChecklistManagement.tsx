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
    <div className="p-4 sm:p-6 space-y-4 bg-white min-h-screen">
      {/* 서브 탭 네비게이션 */}
      {visibleTabs.length > 1 && (
        <div className="flex flex-wrap gap-2 pb-4 border-b border-at-border">
          {visibleTabs.map(tab => {
            const Icon = tab.icon
            const isActive = activeSubTab === tab.id
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id)}
                className={`py-2 px-4 inline-flex items-center rounded-lg font-medium text-sm transition-all ${
                  isActive
                    ? 'bg-at-accent-light text-at-accent'
                    : 'text-at-text-weak hover:text-at-text-secondary hover:bg-at-surface-alt'
                }`}
              >
                <Icon className="w-4 h-4 mr-2" />
                {tab.label}
              </button>
            )
          })}
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
