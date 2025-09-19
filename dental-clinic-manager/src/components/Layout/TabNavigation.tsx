'use client'

interface TabNavigationProps {
  activeTab: string
  onTabChange: (tab: string) => void
}

const tabs = [
  { id: 'daily-input', label: '일일 보고서 입력' },
  { id: 'weekly-stats', label: '주간 통계' },
  { id: 'monthly-stats', label: '월간 통계' },
  { id: 'annual-stats', label: '연간 통계' },
  { id: 'logs', label: '상세 기록' },
  { id: 'settings', label: '설정' },
  { id: 'guide', label: '사용 안내' }
]

export default function TabNavigation({ activeTab, onTabChange }: TabNavigationProps) {
  return (
    <nav className="flex border-b border-slate-200 mb-6 overflow-x-auto">
      {tabs.map(tab => (
        <button
          key={tab.id}
          className={`py-3 px-6 border-b-2 border-transparent text-slate-600 flex-shrink-0 transition-colors ${
            activeTab === tab.id 
              ? 'border-blue-500 text-blue-500 font-bold' 
              : 'hover:text-slate-800'
          }`}
          onClick={() => onTabChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </nav>
  )
}