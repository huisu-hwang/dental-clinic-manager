'use client'

import type { ReactNode } from 'react'

interface LeaveHistoryTabsProps {
  approvedCount: number
  adjustmentCount: number
  activeTab: 'approved' | 'adjustments'
  onTabChange: (tab: 'approved' | 'adjustments') => void
  children: ReactNode
}

interface TabDef {
  key: 'approved' | 'adjustments'
  label: string
  count: number
}

export default function LeaveHistoryTabs({
  approvedCount,
  adjustmentCount,
  activeTab,
  onTabChange,
  children,
}: LeaveHistoryTabsProps) {
  const tabs: TabDef[] = [
    { key: 'approved', label: '승인된 연차', count: approvedCount },
    { key: 'adjustments', label: '수동 조정', count: adjustmentCount },
  ]

  return (
    <div className="bg-white border border-at-border rounded-xl overflow-hidden">
      <div
        className="flex border-b border-at-border bg-at-surface-alt px-2"
        role="tablist"
      >
        {tabs.map((tab) => {
          const isActive = activeTab === tab.key
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onTabChange(tab.key)}
              className={[
                'py-3 px-4 text-sm font-medium border-b-2 transition-colors flex items-center',
                isActive
                  ? 'border-at-accent text-at-accent'
                  : 'border-transparent text-at-text-weak hover:text-at-text-secondary',
              ].join(' ')}
            >
              <span>{tab.label}</span>
              <span
                className={[
                  'ml-2 px-2 py-0.5 text-xs rounded-full',
                  isActive
                    ? 'bg-at-accent-light text-at-accent'
                    : 'bg-at-surface-alt text-at-text-secondary',
                ].join(' ')}
              >
                {tab.count}
              </span>
            </button>
          )
        })}
      </div>
      <div className="p-4">{children}</div>
    </div>
  )
}
