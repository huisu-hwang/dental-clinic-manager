'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import Header from '@/components/Layout/Header'
import TabNavigation from '@/components/Layout/TabNavigation'
import DailyInputForm from '@/components/DailyInput/DailyInputForm'
import StatsContainer from '@/components/Stats/StatsContainer'
import LogsSection from '@/components/Logs/LogsSection'
import InventoryManagement from '@/components/Settings/InventoryManagement'
import GuideSection from '@/components/Guide/GuideSection'
import AccountProfile from '@/components/Management/AccountProfile'
import Toast from '@/components/UI/Toast'
import SetupGuide from '@/components/Setup/SetupGuide'
import DatabaseVerifier from '@/components/Debug/DatabaseVerifier'
import { useSupabaseData } from '@/hooks/useSupabaseData'
import { dataService } from '@/lib/dataService'
import { getDatesForPeriod, getCurrentWeekString, getCurrentMonthString } from '@/utils/dateUtils'
import { getStatsForDateRange } from '@/utils/statsUtils'
import { inspectDatabase } from '@/utils/dbInspector'
import type { ConsultRowData, GiftRowData, HappyCallRowData } from '@/types'

export default function DashboardPage() {
  const { user, logout, updateUser } = useAuth()
  const [activeTab, setActiveTab] = useState('daily-input')
  const [showProfile, setShowProfile] = useState(false)
  const [dbStatus, setDbStatus] = useState<'connected' | 'connecting' | 'error'>('connecting')
  const [toast, setToast] = useState<{
    show: boolean
    message: string
    type: 'success' | 'error' | 'warning' | 'info'
  }>({ show: false, message: '', type: 'info' })

  // 통계 기간 선택
  const [weekSelector, setWeekSelector] = useState(() => getCurrentWeekString(new Date()))
  const [monthSelector, setMonthSelector] = useState(() => getCurrentMonthString())
  const [yearSelector, setYearSelector] = useState(() => new Date().getFullYear().toString())

  console.log('Current selectors:', { weekSelector, monthSelector, yearSelector })

  const {
    dailyReports,
    consultLogs,
    giftLogs,
    giftInventory,
    inventoryLogs,
    loading,
    error,
    refetch,
    refetchInventory
  } = useSupabaseData()

  useEffect(() => {
    if (loading) {
      setDbStatus('connecting')
    } else if (error) {
      setDbStatus('error')
      if (error.includes('Supabase client not available')) {
        // Supabase 설정이 안된 경우는 토스트 메시지 표시하지 않음
      } else {
        showToast('데이터베이스 연결에 실패했습니다.', 'error')
      }
    } else {
      setDbStatus('connected')
      // 데이터베이스 구조 검사 (개발 모드에서만)
      if (process.env.NODE_ENV === 'development') {
        inspectDatabase().catch(console.error)
      }
    }
  }, [loading, error])

  const showToast = (message: string, type: 'success' | 'error' | 'warning' | 'info') => {
    setToast({ show: true, message, type })
  }

  const handleSaveReport = async (data: {
    date: string
    consultRows: ConsultRowData[]
    giftRows: GiftRowData[]
    happyCallRows: HappyCallRowData[]
    recallCount: number
    recallBookingCount: number
    specialNotes: string
  }) => {
    if (!data.date) {
      showToast('보고 일자를 선택해주세요.', 'error')
      return
    }

    // 현재 스크롤 위치 저장
    const scrollPosition = window.scrollY

    const result = await dataService.saveReport(data)
    if (result.error) {
      showToast(`저장 실패: ${result.error}`, 'error')
    } else if (result.success) {
      showToast('보고서가 성공적으로 저장되었습니다.', 'success')

      // refetch 후 스크롤 위치 복원
      await refetch()

      // 다음 렌더링 사이클에서 스크롤 위치 복원
      setTimeout(() => {
        window.scrollTo(0, scrollPosition)
      }, 0)
    }
  }

  const handleDeleteReport = async (date: string) => {
    const result = await dataService.deleteReportByDate(date)
    if (result.error) {
      showToast(`삭제 실패: ${result.error}`, 'error')
    } else {
      showToast(`${date}의 보고서가 삭제되었습니다.`, 'success')
      refetch()
    }
  }

  const handleAddGiftItem = async (name: string, stock: number) => {
    const result = await dataService.addGiftItem(name, stock)
    if (result.error) {
      showToast(`추가 실패: ${result.error}`, 'error')
    } else {
      showToast('새로운 선물이 추가되었습니다.', 'success')
      refetch()
    }
  }

  const handleUpdateStock = async (id: number, quantity: number) => {
    const item = giftInventory.find(g => g.id === id)
    if (!item) return

    const result = await dataService.updateStock(id, quantity, item)
    if (result.error) {
      showToast(`재고 업데이트 실패: ${result.error}`, 'error')
    } else {
      const action = quantity > 0 ? '추가' : '차감'
      showToast(`${item.name} 재고가 ${Math.abs(quantity)}개 ${action}되었습니다.`, 'success')
      // 재고 데이터만 업데이트
      refetchInventory()
    }
  }

  const handleDeleteGiftItem = async (id: number) => {
    const result = await dataService.deleteGiftItem(id)
    if (result.error) {
      showToast(`삭제 실패: ${result.error}`, 'error')
    } else {
      showToast('선물이 삭제되었습니다.', 'success')
      refetch()
    }
  }

  const handleRecalculateStats = async (date: string) => {
    const result = await dataService.recalculateDailyReportStats(date)
    if (result.error) {
      showToast(`재계산 실패: ${result.error}`, 'error')
    } else {
      showToast(result.message || '통계가 재계산되었습니다.', 'success')
      refetch()
    }
  }


  // 통계 계산
  const getStats = (periodType: 'weekly' | 'monthly' | 'annual', value: string) => {
    const periodData = getDatesForPeriod(periodType, value)
    return getStatsForDateRange(dailyReports, giftLogs, periodData.startDate, periodData.endDate)
  }

  // 연도 옵션 생성 (현재 연도와 데이터가 있는 연도들)
  const currentYear = new Date().getFullYear()
  const dataYears = [...new Set(dailyReports.map(r => r.date.substring(0, 4)))]
  const allYears = [...new Set([currentYear.toString(), ...dataYears])].sort().reverse()
  const yearOptions = allYears.length > 0 ? allYears : [currentYear.toString()]

  console.log('Year options:', yearOptions, 'Selected:', yearSelector)

  // Supabase가 설정되지 않은 경우 설정 가이드 표시 (임시 비활성화)
  if (error && error.includes('Supabase client not available')) {
    return <SetupGuide />
  }

  if (loading) {
    return (
      <div className="bg-slate-50 text-slate-800 font-sans min-h-screen">
        <div className="container mx-auto p-4 md:p-8">
          <div className="flex justify-center items-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p>데이터를 불러오는 중...</p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-slate-50 text-slate-800 font-sans min-h-screen">
      <div className="container mx-auto p-4 md:p-8">
        <Header
          dbStatus={dbStatus}
          user={user}
          onLogout={logout}
          onProfileClick={() => setShowProfile(true)}
        />

        {/* Profile Modal */}
        {showProfile && user && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <AccountProfile
                currentUser={user}
                onClose={() => setShowProfile(false)}
                onUpdate={(updatedUserData) => {
                  updateUser(updatedUserData) // AuthContext와 localStorage 업데이트
                  setShowProfile(false) // 모달 닫기
                  showToast('프로필이 성공적으로 업데이트되었습니다.', 'success')
                }}
              />
            </div>
          </div>
        )}
        <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} />

        <main>
          {/* 일일 보고서 입력 */}
          {activeTab === 'daily-input' && (
            <DailyInputForm
              giftInventory={giftInventory}
              onSaveReport={handleSaveReport}
            />
          )}

          {/* 주간 통계 */}
          {activeTab === 'weekly-stats' && (
            <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
              <div className="flex flex-wrap justify-between items-center mb-4 gap-4">
                <h2 className="text-xl font-bold">주간 통계</h2>
                <div>
                  <label htmlFor="week-selector" className="mr-2">주 선택:</label>
                  <input
                    type="week"
                    id="week-selector"
                    className="p-2 border border-slate-300 rounded-md"
                    value={weekSelector}
                    onChange={(e) => setWeekSelector(e.target.value)}
                  />
                </div>
              </div>
              <StatsContainer stats={loading ? {
                naver_review_count: 0,
                consult_proceed: 0,
                consult_hold: 0,
                recall_count: 0,
                recall_booking_count: 0,
                totalConsults: 0,
                totalGifts: 0,
                totalRevenue: 0,
                consultsByManager: {},
                giftsByManager: {},
                revenueByManager: {},
                consultProceedRate: 0,
                recallSuccessRate: 0,
                giftCounts: {}
              } : getStats('weekly', weekSelector)} />
            </div>
          )}

          {/* 월간 통계 */}
          {activeTab === 'monthly-stats' && (
            <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
              <div className="flex flex-wrap justify-between items-center mb-4 gap-4">
                <h2 className="text-xl font-bold">월간 통계</h2>
                <div>
                  <label htmlFor="month-selector" className="mr-2">월 선택:</label>
                  <input
                    type="month"
                    id="month-selector"
                    className="p-2 border border-slate-300 rounded-md"
                    value={monthSelector}
                    onChange={(e) => setMonthSelector(e.target.value)}
                  />
                </div>
              </div>
              <StatsContainer stats={loading ? {
                naver_review_count: 0,
                consult_proceed: 0,
                consult_hold: 0,
                recall_count: 0,
                recall_booking_count: 0,
                totalConsults: 0,
                totalGifts: 0,
                totalRevenue: 0,
                consultsByManager: {},
                giftsByManager: {},
                revenueByManager: {},
                consultProceedRate: 0,
                recallSuccessRate: 0,
                giftCounts: {}
              } : getStats('monthly', monthSelector)} />
            </div>
          )}

          {/* 연간 통계 */}
          {activeTab === 'annual-stats' && (
            <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
              <div className="flex flex-wrap justify-between items-center mb-4 gap-4">
                <h2 className="text-xl font-bold">연간 통계</h2>
                <div>
                  <label htmlFor="year-selector" className="mr-2">연도 선택:</label>
                  <select
                    id="year-selector"
                    className="p-2 border border-slate-300 rounded-md"
                    value={yearSelector}
                    onChange={(e) => setYearSelector(e.target.value)}
                  >
                    {yearOptions.map(year => (
                      <option key={year} value={year}>{year}년</option>
                    ))}
                  </select>
                </div>
              </div>
              <StatsContainer stats={loading ? {
                naver_review_count: 0,
                consult_proceed: 0,
                consult_hold: 0,
                recall_count: 0,
                recall_booking_count: 0,
                totalConsults: 0,
                totalGifts: 0,
                totalRevenue: 0,
                consultsByManager: {},
                giftsByManager: {},
                revenueByManager: {},
                consultProceedRate: 0,
                recallSuccessRate: 0,
                giftCounts: {}
              } : getStats('annual', yearSelector)} />
            </div>
          )}

          {/* 상세 기록 */}
          {activeTab === 'logs' && (
            <LogsSection
              dailyReports={dailyReports}
              consultLogs={consultLogs}
              giftLogs={giftLogs}
              inventoryLogs={inventoryLogs}
              onDeleteReport={handleDeleteReport}
              onRecalculateStats={handleRecalculateStats}
            />
          )}

          {/* 설정 */}
          {activeTab === 'settings' && (
            <InventoryManagement
              giftInventory={giftInventory}
              onAddGiftItem={handleAddGiftItem}
              onUpdateStock={handleUpdateStock}
              onDeleteGiftItem={handleDeleteGiftItem}
            />
          )}

          {/* 사용 안내 */}
          {activeTab === 'guide' && (
            <div className="space-y-6">
              <DatabaseVerifier />
              <GuideSection />
            </div>
          )}
        </main>
      </div>

      <Toast
        message={toast.message}
        type={toast.type}
        show={toast.show}
        onClose={() => setToast(prev => ({ ...prev, show: false }))}
      />
    </div>
  )
}