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
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">단체 문자</h1>
        <p className="mt-1 text-sm text-gray-500">환자들에게 단체 문자를 발송합니다. 리콜 제외 환자는 기본적으로 발송 대상에서 빠집니다.</p>
      </header>

      <div className="border-b border-gray-200">
        <nav className="-mb-px flex gap-2 overflow-x-auto" aria-label="Tabs">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`whitespace-nowrap py-3 px-4 border-b-2 text-sm font-medium flex items-center gap-2 transition-colors ${
                tab === key
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </nav>
      </div>

      <div className="mt-6">
        {tab === 'send' && <SendTab />}
        {tab === 'history' && <HistoryTab />}
        {tab === 'scheduled' && <ScheduledTab />}
        {tab === 'templates' && <TemplatesTab />}
      </div>
    </div>
  )
}
