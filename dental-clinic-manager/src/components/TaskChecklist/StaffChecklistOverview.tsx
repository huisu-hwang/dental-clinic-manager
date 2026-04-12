'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { taskChecklistService } from '@/lib/taskChecklistService'
import type { TaskTemplate, DailyTaskCheck } from '@/types/taskChecklist'
import { loadPeriodConfig } from '@/types/taskChecklist'
import { ChevronLeft, ChevronRight, ChevronDown, Users, CheckCircle2, Circle, BarChart3, Clock, FileText } from 'lucide-react'

interface Staff {
  id: string
  name: string
  role: string
}

export default function StaffChecklistOverview() {
  const [templates, setTemplates] = useState<TaskTemplate[]>([])
  const [dailyChecks, setDailyChecks] = useState<DailyTaskCheck[]>([])
  const [staff, setStaff] = useState<Staff[]>([])
  const [selectedDate, setSelectedDate] = useState(() => {
    return new Date().toISOString().split('T')[0]
  })
  const [loading, setLoading] = useState(true)
  const [expandedStaffId, setExpandedStaffId] = useState<string | null>(null)

  const periodCfg = useMemo(() => loadPeriodConfig(), [])

  const fetchData = useCallback(async () => {
    try {
      const [templatesResult, checksResult, staffResult] = await Promise.all([
        taskChecklistService.getAllTemplates('approved'),
        taskChecklistService.getAllDailyChecksForDate(selectedDate),
        taskChecklistService.getClinicStaff(),
      ])
      setTemplates(templatesResult.data.filter(t => t.is_active))
      setDailyChecks(checksResult.data)
      setStaff(staffResult.data)
    } finally {
      setLoading(false)
    }
  }, [selectedDate])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const changeDate = (delta: number) => {
    const date = new Date(selectedDate)
    date.setDate(date.getDate() + delta)
    setSelectedDate(date.toISOString().split('T')[0])
  }

  const isToday = selectedDate === new Date().toISOString().split('T')[0]

  const getRoleName = (role: string): string => {
    const roleNames: Record<string, string> = {
      owner: '대표원장',
      vice_director: '부원장',
      manager: '실장',
      team_leader: '팀장',
      staff: '직원',
    }
    return roleNames[role] || role
  }

  // 직원별 업무 데이터 계산
  const staffData = useMemo(() => staff.map(s => {
    const userTemplates = templates.filter(t => t.assigned_user_id === s.id)
    const userChecks = dailyChecks.filter(c => c.user_id === s.id && c.status === 'completed')
    const total = userTemplates.length
    const completed = userChecks.length
    const rate = total > 0 ? Math.round((completed / total) * 100) : 0

    const byPeriod = periodCfg.keys.map(period => {
      const periodTemplates = userTemplates.filter(t => t.period === period)
      const periodCompleted = periodTemplates.filter(t =>
        userChecks.some(c => c.template_id === t.id)
      ).length
      return {
        period,
        total: periodTemplates.length,
        completed: periodCompleted,
      }
    })

    // 개별 작업 상세 정보
    const tasks = userTemplates.map(t => {
      const check = dailyChecks.find(c => c.template_id === t.id && c.user_id === s.id)
      return {
        id: t.id,
        title: t.title,
        description: t.description,
        period: t.period,
        sortOrder: t.sort_order,
        isCompleted: check?.status === 'completed',
        checkedAt: check?.checked_at,
        notes: check?.notes,
      }
    })

    return { ...s, total, completed, rate, byPeriod, tasks }
  }).filter(s => s.total > 0), [staff, templates, dailyChecks, periodCfg]) // 업무가 할당된 직원만 표시

  if (loading) {
    return (
      <div className="flex justify-center items-center h-48">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-at-accent" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="bg-white rounded-2xl shadow-at-card border border-at-border p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-at-tag rounded-xl flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-at-accent" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-at-text">직원 업무 현황</h2>
              <p className="text-sm text-at-text-weak">전체 직원의 업무 체크리스트 완료 현황</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => changeDate(-1)}
              className="p-1.5 rounded-lg hover:bg-at-surface-alt transition-colors"
            >
              <ChevronLeft className="w-5 h-5 text-at-text-weak" />
            </button>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="px-3 py-1.5 border border-at-border rounded-xl text-sm focus:ring-2 focus:ring-at-accent focus:border-at-accent"
            />
            <button
              onClick={() => changeDate(1)}
              className="p-1.5 rounded-lg hover:bg-at-surface-alt transition-colors"
            >
              <ChevronRight className="w-5 h-5 text-at-text-weak" />
            </button>
            {!isToday && (
              <button
                onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
                className="px-3 py-1.5 text-xs font-medium text-at-accent bg-at-accent-light rounded-xl hover:bg-at-tag transition-colors"
              >
                오늘
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 직원 없음 */}
      {staffData.length === 0 ? (
        <div className="bg-white rounded-2xl shadow-at-card border border-at-border p-8 text-center">
          <div className="w-16 h-16 bg-at-surface-alt rounded-full flex items-center justify-center mx-auto mb-4">
            <Users className="w-8 h-8 text-at-text-weak" />
          </div>
          <p className="text-at-text-weak text-sm">업무가 배정된 직원이 없습니다.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {staffData.map(s => (
            <div key={s.id} className="bg-white rounded-2xl shadow-at-card border border-at-border overflow-hidden">
              {/* 직원 헤더 - 클릭하여 상세 보기 */}
              <div
                role="button"
                tabIndex={0}
                aria-expanded={expandedStaffId === s.id}
                className="px-4 py-3 border-b border-at-border flex items-center justify-between cursor-pointer hover:bg-at-surface-hover transition-colors"
                onClick={() => setExpandedStaffId(prev => prev === s.id ? null : s.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setExpandedStaffId(prev => prev === s.id ? null : s.id)
                  }
                }}
              >
                <div className="flex items-center space-x-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    s.rate === 100 ? 'bg-at-success-bg' : s.rate >= 50 ? 'bg-at-tag' : 'bg-at-surface-alt'
                  }`}>
                    <span className={`text-sm font-bold ${
                      s.rate === 100 ? 'text-at-success' : s.rate >= 50 ? 'text-at-accent' : 'text-at-text-weak'
                    }`}>
                      {s.name.charAt(0)}
                    </span>
                  </div>
                  <div>
                    <p className="font-medium text-at-text">{s.name}</p>
                    <p className="text-xs text-at-text-weak">{getRoleName(s.role)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="text-right">
                    <p className={`text-lg font-bold ${
                      s.rate === 100 ? 'text-at-success' : s.rate >= 50 ? 'text-at-accent' : 'text-at-text-weak'
                    }`}>
                      {s.rate}%
                    </p>
                    <p className="text-xs text-at-text-weak">{s.completed}/{s.total}</p>
                  </div>
                  <ChevronDown className={`w-4 h-4 text-at-text-weak transition-transform duration-200 ${
                    expandedStaffId === s.id ? 'rotate-180' : ''
                  }`} />
                </div>
              </div>

              {/* 진행률 바 */}
              <div className="px-4 py-2">
                <div className="w-full bg-at-surface-alt rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all duration-500 ${
                      s.rate === 100 ? 'bg-green-500' : 'bg-at-accent'
                    }`}
                    style={{ width: `${s.rate}%` }}
                  />
                </div>
              </div>

              {/* 시간대별 현황 */}
              <div className="px-4 py-2 pb-3 flex space-x-3">
                {s.byPeriod.filter(p => p.total > 0).map(p => (
                  <div key={p.period} className="flex-1 text-center">
                    <p className="text-xs text-at-text-weak mb-1">{periodCfg.labels[p.period] || p.period}</p>
                    <div className="flex items-center justify-center space-x-1">
                      {p.completed === p.total ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                      ) : (
                        <Circle className="w-3.5 h-3.5 text-at-text-weak" />
                      )}
                      <span className={`text-xs font-medium ${
                        p.completed === p.total ? 'text-at-success' : 'text-at-text-weak'
                      }`}>
                        {p.completed}/{p.total}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* 개별 작업 상세 목록 (확장 시) */}
              {expandedStaffId === s.id && (
                <div className="border-t border-at-border px-4 py-3 bg-at-surface-alt">
                  {periodCfg.keys.filter(period =>
                    s.tasks.some(t => t.period === period)
                  ).map(period => (
                    <div key={period} className="mb-3 last:mb-0">
                      <h4 className="text-xs font-semibold text-at-text-secondary uppercase tracking-wider mb-2">
                        {periodCfg.labels[period] || period}
                      </h4>
                      <div className="space-y-1">
                        {s.tasks
                          .filter(t => t.period === period)
                          .sort((a, b) => a.sortOrder - b.sortOrder)
                          .map(task => (
                            <div
                              key={task.id}
                              className={`flex items-start gap-2.5 px-3 py-2 rounded-lg ${
                                task.isCompleted ? 'bg-at-success-bg/80' : 'bg-white'
                              }`}
                            >
                              {task.isCompleted ? (
                                <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
                              ) : (
                                <Circle className="w-4 h-4 text-at-text-weak mt-0.5 flex-shrink-0" />
                              )}
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm ${
                                  task.isCompleted ? 'text-at-success' : 'text-at-text-secondary'
                                }`}>
                                  {task.title}
                                </p>
                                {task.description && (
                                  <p className="text-xs text-at-text-weak mt-0.5">{task.description}</p>
                                )}
                                {(task.checkedAt || task.notes) && (
                                  <div className="flex items-center gap-3 mt-1 flex-wrap">
                                    {task.checkedAt && (
                                      <span className="text-xs text-green-500 flex items-center gap-1">
                                        <Clock className="w-3 h-3" />
                                        {new Date(task.checkedAt).toLocaleTimeString('ko-KR', {
                                          hour: '2-digit',
                                          minute: '2-digit',
                                        })} 완료
                                      </span>
                                    )}
                                    {task.notes && (
                                      <span className="text-xs text-at-text-weak flex items-center gap-1">
                                        <FileText className="w-3 h-3" />
                                        {task.notes}
                                      </span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
