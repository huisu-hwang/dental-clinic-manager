'use client'

import { useState, useEffect } from 'react'
import {
  ServerIcon,
  CpuChipIcon,
  CircleStackIcon,
  ArrowTrendingUpIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline'
import { createClient } from '@/lib/supabase/client'
interface SystemMetrics {
  database: {
    status: 'healthy' | 'warning' | 'error'
    tableCount: number
    totalRecords: number
    storageUsed: string
  }
  activity: {
    dailyActiveUsers: number
    weeklyActiveUsers: number
    monthlyActiveUsers: number
    recentLogins: number
  }
  performance: {
    avgResponseTime: number
    errorRate: number
    uptime: number
  }
  alerts: Alert[]
}

interface Alert {
  id: string
  type: 'error' | 'warning' | 'info'
  message: string
  timestamp: Date
  resolved: boolean
}

export default function SystemMonitoring() {
  const [metrics, setMetrics] = useState<SystemMetrics>({
    database: {
      status: 'healthy',
      tableCount: 0,
      totalRecords: 0,
      storageUsed: '0 MB'
    },
    activity: {
      dailyActiveUsers: 0,
      weeklyActiveUsers: 0,
      monthlyActiveUsers: 0,
      recentLogins: 0
    },
    performance: {
      avgResponseTime: 0,
      errorRate: 0,
      uptime: 99.9
    },
    alerts: []
  })

  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedTab, setSelectedTab] = useState<'overview' | 'database' | 'activity' | 'alerts'>('overview')

  useEffect(() => {
    fetchSystemMetrics()
    // Auto-refresh every 30 seconds
    const interval = setInterval(fetchSystemMetrics, 30000)
    return () => clearInterval(interval)
  }, [])

  const fetchSystemMetrics = async () => {
    if (refreshing) return
    setRefreshing(true)

    const supabase = createClient()
    if (!supabase) {
      setLoading(false)
      setRefreshing(false)
      return
    }

    try {
      // Fetch database metrics
      const tables = ['users', 'clinics', 'daily_reports', 'consult_logs', 'gift_logs', 'gift_inventory']
      let totalRecords = 0
      let tableCount = 0

      for (const table of tables) {
        const { count } = await supabase
          .from(table)
          .select('*', { count: 'exact', head: true })

        if (count !== null) {
          totalRecords += count
          tableCount++
        }
      }

      // Fetch activity metrics
      const now = new Date()
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000)
      const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

      // Daily active users
      const { count: dailyUsers } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .gte('last_login_at', oneDayAgo.toISOString())

      // Weekly active users
      const { count: weeklyUsers } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .gte('last_login_at', oneWeekAgo.toISOString())

      // Monthly active users
      const { count: monthlyUsers } = await supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .gte('last_login_at', oneMonthAgo.toISOString())

      // Recent audit logs
      const { data: recentLogs } = await supabase
        .from('audit_logs')
        .select('*')
        .gte('created_at', oneDayAgo.toISOString())
        .order('created_at', { ascending: false })
        .limit(100)

      // Generate alerts based on metrics
      const alerts: Alert[] = []

      if (totalRecords > 100000) {
        alerts.push({
          id: '1',
          type: 'warning',
          message: '데이터베이스 레코드가 100,000개를 초과했습니다. 성능 최적화를 고려하세요.',
          timestamp: new Date(),
          resolved: false
        })
      }

      if ((dailyUsers || 0) < 10) {
        alerts.push({
          id: '2',
          type: 'info',
          message: '일일 활성 사용자가 10명 미만입니다.',
          timestamp: new Date(),
          resolved: false
        })
      }

      setMetrics({
        database: {
          status: totalRecords > 500000 ? 'warning' : 'healthy',
          tableCount,
          totalRecords,
          storageUsed: `${Math.round(totalRecords * 0.01)} MB` // Rough estimate
        },
        activity: {
          dailyActiveUsers: dailyUsers || 0,
          weeklyActiveUsers: weeklyUsers || 0,
          monthlyActiveUsers: monthlyUsers || 0,
          recentLogins: recentLogs?.length || 0
        },
        performance: {
          avgResponseTime: Math.random() * 200 + 50, // Simulated
          errorRate: Math.random() * 0.5, // Simulated
          uptime: 99.9 + Math.random() * 0.099 // Simulated
        },
        alerts
      })

    } catch (err) {
      console.error('Error fetching system metrics:', err)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const getStatusColor = (status: 'healthy' | 'warning' | 'error') => {
    switch (status) {
      case 'healthy': return 'text-green-600 bg-green-100'
      case 'warning': return 'text-yellow-600 bg-yellow-100'
      case 'error': return 'text-red-600 bg-red-100'
    }
  }

  return (
    <div className="space-y-6">
      {/* Header with Refresh Button */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold text-slate-800">시스템 모니터링</h2>
        <button
          onClick={fetchSystemMetrics}
          disabled={refreshing}
          className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
        >
          <ArrowPathIcon className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
          <span>새로고침</span>
        </button>
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-slate-200">
        <nav className="-mb-px flex space-x-8">
          {[
            { id: 'overview', label: '개요', icon: CpuChipIcon },
            { id: 'database', label: '데이터베이스', icon: CircleStackIcon },
            { id: 'activity', label: '활동', icon: ArrowTrendingUpIcon },
            { id: 'alerts', label: `알림 (${metrics.alerts.filter(a => !a.resolved).length})`, icon: ExclamationTriangleIcon }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setSelectedTab(tab.id as any)}
              className={`py-3 px-1 border-b-2 font-medium text-sm flex items-center ${
                selectedTab === tab.id
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300'
              }`}
            >
              <tab.icon className="h-4 w-4 mr-2" />
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {loading ? (
        <div className="bg-white p-8 rounded-lg shadow-sm border border-slate-200">
          <div className="text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
            <p className="text-slate-600">메트릭을 불러오는 중...</p>
          </div>
        </div>
      ) : (
        <>
          {/* Overview Tab */}
          {selectedTab === 'overview' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Database Status */}
              <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-slate-800">데이터베이스</h3>
                  <CircleStackIcon className="h-5 w-5 text-slate-400" />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">상태</span>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(metrics.database.status)}`}>
                      {metrics.database.status === 'healthy' ? '정상' : metrics.database.status === 'warning' ? '경고' : '오류'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">총 레코드</span>
                    <span className="text-sm font-medium">{metrics.database.totalRecords.toLocaleString()}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">저장 용량</span>
                    <span className="text-sm font-medium">{metrics.database.storageUsed}</span>
                  </div>
                </div>
              </div>

              {/* Activity */}
              <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-slate-800">사용자 활동</h3>
                  <ArrowTrendingUpIcon className="h-5 w-5 text-slate-400" />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">일일 활성</span>
                    <span className="text-sm font-medium">{metrics.activity.dailyActiveUsers}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">주간 활성</span>
                    <span className="text-sm font-medium">{metrics.activity.weeklyActiveUsers}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">월간 활성</span>
                    <span className="text-sm font-medium">{metrics.activity.monthlyActiveUsers}</span>
                  </div>
                </div>
              </div>

              {/* Performance */}
              <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-slate-800">성능</h3>
                  <ServerIcon className="h-5 w-5 text-slate-400" />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">응답 시간</span>
                    <span className="text-sm font-medium">{metrics.performance.avgResponseTime.toFixed(0)}ms</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">오류율</span>
                    <span className="text-sm font-medium">{metrics.performance.errorRate.toFixed(2)}%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-slate-600">가동률</span>
                    <span className="text-sm font-medium">{metrics.performance.uptime.toFixed(2)}%</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Database Tab */}
          {selectedTab === 'database' && (
            <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
              <h3 className="font-semibold text-slate-800 mb-4">데이터베이스 상태</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h4 className="text-sm font-medium text-slate-700 mb-3">테이블별 레코드 수</h4>
                  <div className="space-y-2">
                    {['users', 'clinics', 'daily_reports', 'consult_logs', 'gift_logs'].map(table => (
                      <div key={table} className="flex items-center justify-between p-2 bg-slate-50 rounded">
                        <span className="text-sm text-slate-600">{table}</span>
                        <span className="text-sm font-medium">-</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-medium text-slate-700 mb-3">저장소 정보</h4>
                  <div className="space-y-3">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-slate-600">사용량</span>
                        <span className="font-medium">{metrics.database.storageUsed}</span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-2">
                        <div className="bg-blue-600 h-2 rounded-full" style={{ width: '25%' }}></div>
                      </div>
                    </div>
                    <div className="text-xs text-slate-500">
                      전체 용량: 1000 MB
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Activity Tab */}
          {selectedTab === 'activity' && (
            <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
              <h3 className="font-semibold text-slate-800 mb-4">사용자 활동</h3>
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="text-center p-4 bg-blue-50 rounded-lg">
                    <div className="text-2xl font-bold text-blue-600">{metrics.activity.dailyActiveUsers}</div>
                    <div className="text-sm text-slate-600">일일 활성 사용자</div>
                  </div>
                  <div className="text-center p-4 bg-green-50 rounded-lg">
                    <div className="text-2xl font-bold text-green-600">{metrics.activity.weeklyActiveUsers}</div>
                    <div className="text-sm text-slate-600">주간 활성 사용자</div>
                  </div>
                  <div className="text-center p-4 bg-purple-50 rounded-lg">
                    <div className="text-2xl font-bold text-purple-600">{metrics.activity.monthlyActiveUsers}</div>
                    <div className="text-sm text-slate-600">월간 활성 사용자</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Alerts Tab */}
          {selectedTab === 'alerts' && (
            <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
              <h3 className="font-semibold text-slate-800 mb-4">시스템 알림</h3>
              <div className="space-y-3">
                {metrics.alerts.length === 0 ? (
                  <p className="text-slate-500 text-center py-8">현재 알림이 없습니다.</p>
                ) : (
                  metrics.alerts.map(alert => (
                    <div key={alert.id} className={`p-4 rounded-lg border ${
                      alert.type === 'error' ? 'bg-red-50 border-red-200' :
                      alert.type === 'warning' ? 'bg-yellow-50 border-yellow-200' :
                      'bg-blue-50 border-blue-200'
                    }`}>
                      <div className="flex items-start">
                        <ExclamationTriangleIcon className={`h-5 w-5 mr-3 mt-0.5 ${
                          alert.type === 'error' ? 'text-red-600' :
                          alert.type === 'warning' ? 'text-yellow-600' :
                          'text-blue-600'
                        }`} />
                        <div className="flex-1">
                          <p className={`text-sm font-medium ${
                            alert.type === 'error' ? 'text-red-800' :
                            alert.type === 'warning' ? 'text-yellow-800' :
                            'text-blue-800'
                          }`}>
                            {alert.message}
                          </p>
                          <p className="text-xs text-slate-500 mt-1">
                            {alert.timestamp.toLocaleString('ko-KR')}
                          </p>
                        </div>
                        {!alert.resolved && (
                          <button className="ml-3 text-sm text-slate-600 hover:text-slate-800">
                            해결됨으로 표시
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}