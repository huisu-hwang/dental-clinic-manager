'use client'

import { useState, useEffect, useCallback } from 'react'
import { taskChecklistService } from '@/lib/taskChecklistService'
import type { TaskTemplate, DailyTaskCheck, TaskPeriod } from '@/types/taskChecklist'
import { TASK_PERIOD_LABELS } from '@/types/taskChecklist'
import { ChevronLeft, ChevronRight, Users, CheckCircle2, Circle, BarChart3 } from 'lucide-react'

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

  const fetchData = useCallback(async () => {
    setLoading(true)
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
  const staffData = staff.map(s => {
    const userTemplates = templates.filter(t => t.assigned_user_id === s.id)
    const userChecks = dailyChecks.filter(c => c.user_id === s.id && c.status === 'completed')
    const total = userTemplates.length
    const completed = userChecks.length
    const rate = total > 0 ? Math.round((completed / total) * 100) : 0

    const periods: TaskPeriod[] = ['before_treatment', 'during_treatment', 'before_leaving']
    const byPeriod = periods.map(period => {
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

    return { ...s, total, completed, rate, byPeriod }
  }).filter(s => s.total > 0) // 업무가 할당된 직원만 표시

  if (loading) {
    return (
      <div className="flex justify-center items-center h-48">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
              <BarChart3 className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-800">직원 업무 현황</h2>
              <p className="text-sm text-slate-500">전체 직원의 업무 체크리스트 완료 현황</p>
            </div>
          </div>
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
      </div>

      {/* 직원 없음 */}
      {staffData.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 text-center">
          <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Users className="w-8 h-8 text-slate-400" />
          </div>
          <p className="text-slate-500 text-sm">업무가 배정된 직원이 없습니다.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {staffData.map(s => (
            <div key={s.id} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              {/* 직원 헤더 */}
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    s.rate === 100 ? 'bg-green-100' : s.rate >= 50 ? 'bg-blue-100' : 'bg-slate-100'
                  }`}>
                    <span className={`text-sm font-bold ${
                      s.rate === 100 ? 'text-green-600' : s.rate >= 50 ? 'text-blue-600' : 'text-slate-500'
                    }`}>
                      {s.name.charAt(0)}
                    </span>
                  </div>
                  <div>
                    <p className="font-medium text-slate-800">{s.name}</p>
                    <p className="text-xs text-slate-500">{getRoleName(s.role)}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`text-lg font-bold ${
                    s.rate === 100 ? 'text-green-600' : s.rate >= 50 ? 'text-blue-600' : 'text-slate-500'
                  }`}>
                    {s.rate}%
                  </p>
                  <p className="text-xs text-slate-400">{s.completed}/{s.total}</p>
                </div>
              </div>

              {/* 진행률 바 */}
              <div className="px-4 py-2">
                <div className="w-full bg-slate-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full transition-all duration-500 ${
                      s.rate === 100 ? 'bg-green-500' : 'bg-blue-500'
                    }`}
                    style={{ width: `${s.rate}%` }}
                  />
                </div>
              </div>

              {/* 시간대별 현황 */}
              <div className="px-4 py-2 pb-3 flex space-x-3">
                {s.byPeriod.filter(p => p.total > 0).map(p => (
                  <div key={p.period} className="flex-1 text-center">
                    <p className="text-xs text-slate-400 mb-1">{TASK_PERIOD_LABELS[p.period]}</p>
                    <div className="flex items-center justify-center space-x-1">
                      {p.completed === p.total ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                      ) : (
                        <Circle className="w-3.5 h-3.5 text-slate-300" />
                      )}
                      <span className={`text-xs font-medium ${
                        p.completed === p.total ? 'text-green-600' : 'text-slate-500'
                      }`}>
                        {p.completed}/{p.total}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
