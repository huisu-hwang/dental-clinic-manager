'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { taskChecklistService } from '@/lib/taskChecklistService'
import type { TaskTemplate, DailyTaskCheck, TaskPeriod } from '@/types/taskChecklist'
import { loadPeriodConfig } from '@/types/taskChecklist'
import { CheckCircle2, Circle, ChevronLeft, ChevronRight, StickyNote } from 'lucide-react'

const FALLBACK_COLORS = [
  { bg: 'bg-amber-50', border: 'border-amber-200', text: 'text-amber-700' },
  { bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700' },
  { bg: 'bg-indigo-50', border: 'border-indigo-200', text: 'text-indigo-700' },
  { bg: 'bg-emerald-50', border: 'border-emerald-200', text: 'text-emerald-700' },
  { bg: 'bg-rose-50', border: 'border-rose-200', text: 'text-rose-700' },
  { bg: 'bg-violet-50', border: 'border-violet-200', text: 'text-violet-700' },
]

function getPeriodColor(index: number) {
  return FALLBACK_COLORS[index % FALLBACK_COLORS.length]
}

export default function DailyChecklist() {
  const { user } = useAuth()
  const [templates, setTemplates] = useState<TaskTemplate[]>([])
  const [dailyChecks, setDailyChecks] = useState<DailyTaskCheck[]>([])
  const [selectedDate, setSelectedDate] = useState(() => {
    const today = new Date()
    return today.toISOString().split('T')[0]
  })
  const [loading, setLoading] = useState(true)
  const [toggling, setToggling] = useState<string | null>(null)
  const [noteInput, setNoteInput] = useState<Record<string, string>>({})
  const [showNoteFor, setShowNoteFor] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    if (!user?.id) return
    setLoading(true)
    try {
      const [templatesResult, checksResult] = await Promise.all([
        taskChecklistService.getApprovedTemplatesForUser(user.id),
        taskChecklistService.getDailyChecks(user.id, selectedDate),
      ])
      setTemplates(templatesResult.data)
      setDailyChecks(checksResult.data)
    } finally {
      setLoading(false)
    }
  }, [user?.id, selectedDate])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleToggle = async (templateId: string, currentlyCompleted: boolean) => {
    if (!user?.id || toggling) return
    setToggling(templateId)
    try {
      const notes = noteInput[templateId] || undefined
      const { error } = await taskChecklistService.toggleTaskCheck(
        templateId, user.id, selectedDate, !currentlyCompleted, notes
      )
      if (!error) {
        await fetchData()
      }
    } finally {
      setToggling(null)
    }
  }

  const isChecked = (templateId: string): boolean => {
    return dailyChecks.some(c => c.template_id === templateId && c.status === 'completed')
  }

  const getCheckRecord = (templateId: string): DailyTaskCheck | undefined => {
    return dailyChecks.find(c => c.template_id === templateId)
  }

  const changeDate = (delta: number) => {
    const date = new Date(selectedDate)
    date.setDate(date.getDate() + delta)
    setSelectedDate(date.toISOString().split('T')[0])
  }

  const isToday = selectedDate === new Date().toISOString().split('T')[0]

  // 시간대별로 템플릿 그룹화
  const periodCfg = loadPeriodConfig()
  const usedPeriods = [...new Set(templates.map(t => t.period))]
  const periods = periodCfg.keys.filter(k => usedPeriods.includes(k))
  // 설정에 없는 period도 포함
  for (const p of usedPeriods) {
    if (!periods.includes(p)) periods.push(p)
  }
  const groupedTemplates = periods.reduce((acc, period) => {
    acc[period] = templates.filter(t => t.period === period)
    return acc
  }, {} as Record<TaskPeriod, TaskTemplate[]>)

  // 전체 진행률 계산
  const totalTasks = templates.length
  const completedTasks = templates.filter(t => isChecked(t.id)).length
  const progressPercent = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0

  if (loading) {
    return (
      <div className="flex justify-center items-center h-48">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 헤더: 날짜 선택 + 진행률 */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-slate-800">나의 업무 체크리스트</h2>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => changeDate(-1)}
              className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-slate-500" />
            </button>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <button
              onClick={() => changeDate(1)}
              className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
            >
              <ChevronRight className="w-5 h-5 text-slate-500" />
            </button>
            {!isToday && (
              <button
                onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
                className="px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
              >
                오늘
              </button>
            )}
          </div>
        </div>

        {/* 진행률 바 */}
        {totalTasks > 0 && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-600">오늘의 진행률</span>
              <span className="font-semibold text-slate-800">{completedTasks}/{totalTasks} ({progressPercent}%)</span>
            </div>
            <div className="w-full bg-slate-200 rounded-full h-3">
              <div
                className={`h-3 rounded-full transition-all duration-500 ${
                  progressPercent === 100 ? 'bg-green-500' : 'bg-blue-500'
                }`}
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}
      </div>

      {/* 업무 없는 경우 */}
      {totalTasks === 0 && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-slate-400" />
          </div>
          <p className="text-slate-500 text-sm">배정된 업무가 없습니다.</p>
          <p className="text-slate-400 text-xs mt-1">실장에게 업무 배정을 요청하세요.</p>
        </div>
      )}

      {/* 시간대별 업무 목록 */}
      {periods.map((period, periodIdx) => {
        const periodTemplates = groupedTemplates[period]
        if (periodTemplates.length === 0) return null

        const periodColor = getPeriodColor(periodIdx)
        const periodLabel = periodCfg.labels[period] || period
        const periodCompleted = periodTemplates.filter(t => isChecked(t.id)).length

        return (
          <div key={period} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            {/* 시간대 헤더 */}
            <div className={`px-4 sm:px-6 py-3 ${periodColor.bg} ${periodColor.border} border-b flex items-center justify-between`}>
              <h3 className={`font-semibold ${periodColor.text}`}>{periodLabel}</h3>
              <span className={`text-sm ${periodColor.text}`}>
                {periodCompleted}/{periodTemplates.length}
              </span>
            </div>

            {/* 업무 항목 */}
            <div className="divide-y divide-slate-100">
              {periodTemplates.map(template => {
                const checked = isChecked(template.id)
                const checkRecord = getCheckRecord(template.id)
                const isToggling = toggling === template.id

                return (
                  <div
                    key={template.id}
                    className={`px-4 sm:px-6 py-3 flex items-start space-x-3 transition-colors ${
                      checked ? 'bg-slate-50' : 'hover:bg-slate-50'
                    }`}
                  >
                    {/* 체크 버튼 */}
                    <button
                      onClick={() => handleToggle(template.id, checked)}
                      disabled={isToggling}
                      className={`flex-shrink-0 mt-0.5 transition-all duration-200 ${
                        isToggling ? 'opacity-50' : ''
                      }`}
                    >
                      {checked ? (
                        <CheckCircle2 className="w-6 h-6 text-green-500" />
                      ) : (
                        <Circle className="w-6 h-6 text-slate-300 hover:text-blue-400" />
                      )}
                    </button>

                    {/* 업무 내용 */}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${checked ? 'text-slate-400 line-through' : 'text-slate-800'}`}>
                        {template.title}
                      </p>
                      {template.description && (
                        <p className={`text-xs mt-0.5 ${checked ? 'text-slate-300' : 'text-slate-500'}`}>
                          {template.description}
                        </p>
                      )}
                      {checked && checkRecord?.checked_at && (
                        <p className="text-xs text-green-500 mt-0.5">
                          {new Date(checkRecord.checked_at).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })} 완료
                        </p>
                      )}
                      {checkRecord?.notes && (
                        <p className="text-xs text-slate-400 mt-0.5 italic">
                          {checkRecord.notes}
                        </p>
                      )}

                      {/* 메모 입력 */}
                      {showNoteFor === template.id && (
                        <div className="mt-2 flex items-center space-x-2">
                          <input
                            type="text"
                            value={noteInput[template.id] || ''}
                            onChange={(e) => setNoteInput(prev => ({ ...prev, [template.id]: e.target.value }))}
                            placeholder="메모 입력..."
                            className="flex-1 px-2 py-1 text-xs border border-slate-200 rounded-md focus:ring-1 focus:ring-blue-500"
                          />
                          <button
                            onClick={() => setShowNoteFor(null)}
                            className="text-xs text-slate-400 hover:text-slate-600"
                          >
                            닫기
                          </button>
                        </div>
                      )}
                    </div>

                    {/* 메모 버튼 */}
                    <button
                      onClick={() => setShowNoteFor(showNoteFor === template.id ? null : template.id)}
                      className="flex-shrink-0 p-1 rounded hover:bg-slate-100 transition-colors"
                      title="메모"
                    >
                      <StickyNote className="w-4 h-4 text-slate-400" />
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
