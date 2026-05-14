'use client'

import { useState } from 'react'
import { MessageSquare, History, Clock, FileText } from 'lucide-react'
import SendTab from './SendTab/SendTab'
import HistoryTab from './HistoryTab/HistoryTab'
import ScheduledTab from './ScheduledTab/ScheduledTab'
import TemplatesTab from './TemplatesTab/TemplatesTab'

type TabKey = 'send' | 'history' | 'scheduled' | 'templates'

const TABS: { key: TabKey; label: string; icon: typeof MessageSquare }[] = [
  { key: 'send', label: '발송하기', icon: MessageSquare },
  { key: 'history', label: '발송 이력', icon: History },
  { key: 'scheduled', label: '예약 캠페인', icon: Clock },
  { key: 'templates', label: '템플릿 관리', icon: FileText },
]

export default function BulkSmsManagement() {
  const [tab, setTab] = useState<TabKey>('send')

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--at-accent-tag)] text-[var(--at-accent)]">
            <MessageSquare className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-lg font-semibold text-[var(--at-text-primary)]">단체 문자</h1>
            <p className="text-xs text-[var(--at-text-secondary)]">환자들에게 단체 문자를 발송합니다. 리콜 제외 환자는 기본적으로 발송 대상에서 빠집니다.</p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1 border-b border-[var(--at-border)] overflow-x-auto">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`relative px-4 py-2.5 text-sm font-medium transition flex items-center gap-1.5 whitespace-nowrap ${
              tab === key
                ? 'text-[var(--at-accent)]'
                : 'text-[var(--at-text-secondary)] hover:text-[var(--at-text-primary)]'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
            {tab === key && (
              <span className="absolute inset-x-2 bottom-0 h-0.5 rounded-full bg-[var(--at-accent)]" />
            )}
          </button>
        ))}
      </div>

      <div>
        {tab === 'send' && <SendTab />}
        {tab === 'history' && <HistoryTab />}
        {tab === 'scheduled' && <ScheduledTab />}
        {tab === 'templates' && <TemplatesTab />}
      </div>
    </div>
  )
}
