'use client'

import { useState, useEffect, useMemo } from 'react'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { usePermissions } from '@/hooks/usePermissions'
import { createClient } from '@/lib/supabase/client'
import DailyInputForm from '@/components/DailyInput/DailyInputForm'
import StatsContainer from '@/components/Stats/StatsContainer'
import LogsSection from '@/components/Logs/LogsSection'
import InventoryManagement from '@/components/Settings/InventoryManagement'
import GuideSection from '@/components/Guide/GuideSection'
import { Shield, FileText, Calendar, ClipboardList, BookUser, QrCode } from 'lucide-react'
import ProtocolManagement from '@/components/Management/ProtocolManagement'
import MenuSettings from '@/components/Management/MenuSettings'
import LeaveManagement from '@/components/Leave/LeaveManagement'
import VendorContactManagement from '@/components/Vendor/VendorContactManagement'
import DocumentTemplates from '@/components/Document/DocumentTemplates'
import Toast from '@/components/ui/Toast'
import SetupGuide from '@/components/Setup/SetupGuide'
import DatabaseVerifier from '@/components/Debug/DatabaseVerifier'
import CheckInOut from '@/components/Attendance/CheckInOut'
import DashboardHome from '@/components/Dashboard/DashboardHome'
import AttendanceHistory from '@/components/Attendance/AttendanceHistory'
import AttendanceStats from '@/components/Attendance/AttendanceStats'
import ScheduleManagement from '@/components/Attendance/ScheduleManagement'
import TeamStatus from '@/components/Attendance/TeamStatus'
import QRCodeDisplay from '@/components/Attendance/QRCodeDisplay'
import { PayrollManagement } from '@/components/Payroll'
import { RecallManagement } from '@/components/Recall'
import AIChat from '@/components/AIAnalysis/AIChat'
import PremiumGate from '@/components/Premium/PremiumGate'
import TaskChecklistManagement from '@/components/TaskChecklist/TaskChecklistManagement'
import InvestmentTab from '@/components/Investment/InvestmentTab'
import { useSupabaseData } from '@/hooks/useSupabaseData'
import { useUserNotifications } from '@/hooks/useUserNotifications'
import { dataService } from '@/lib/dataService'
import { getDatesForPeriod, getCurrentWeekString, getCurrentMonthString } from '@/utils/dateUtils'
import { getStatsForDateRange } from '@/utils/statsUtils'
import { inspectDatabase } from '@/utils/dbInspector'
import type { ConsultRowData, GiftRowData, HappyCallRowData, GiftLog, CashRegisterRowData, ConsultLog, GiftInventory, GiftCategory } from '@/types'
import PostPaymentApprovalModal from '@/components/Subscription/PostPaymentApprovalModal'

export default function DashboardPage() {
  const searchParams = useSearchParams()
  const { user } = useAuth()
  const { hasPermission } = usePermissions()

  // 권한 상태 정의
  const canCreateReport = hasPermission('daily_report_create')
  const canEditReport = hasPermission('daily_report_edit')
  const canDeleteReport = hasPermission('daily_report_delete')

  // 출근 관리 권한
  const canCheckIn = hasPermission('attendance_check_in')
  const canViewHistory = hasPermission('attendance_view_own')
  const canViewStats = hasPermission('attendance_stats_view')
  const canManageSchedule = hasPermission('schedule_manage')
  const canViewTeam = hasPermission('attendance_view_all')
  const canManageQR = hasPermission('qr_code_manage')

  // URL 쿼리 파라미터에서 활성 탭 읽기
  const activeTab = searchParams.get('tab') || 'home'
  const [statsSubTab, setStatsSubTab] = useState<'weekly' | 'monthly' | 'annual' | 'custom'>('weekly')
  const [attendanceSubTab, setAttendanceSubTab] = useState<'checkin' | 'history' | 'stats' | 'schedule' | 'team' | 'qr'>('checkin')
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

  // 사용자 지정 기간 선택
  const getDefaultDateRange = () => {
    const today = new Date()
    const oneMonthAgo = new Date(today)
    oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1)
    return {
      start: oneMonthAgo.toISOString().split('T')[0],
      end: today.toISOString().split('T')[0]
    }
  }
  const [customStartDate, setCustomStartDate] = useState(() => getDefaultDateRange().start)
  const [customEndDate, setCustomEndDate] = useState(() => getDefaultDateRange().end)

  const emptyStats = {
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
    giftCounts: {},
    giftCountsByCategory: {},
    returningPatientGiftCount: 0,
    reviewToReturningGiftRate: 0
  }

  // 일일보고서에서 현재 입력 중인 선물 데이터 (재고 관리 실시간 반영용)
  const [currentGiftRows, setCurrentGiftRows] = useState<GiftRowData[]>([])
  const [currentReportDate, setCurrentReportDate] = useState<string>('')

  console.log('Current selectors:', { weekSelector, monthSelector, yearSelector })

  const {
    dailyReports,
    consultLogs,
    giftLogs,
    giftInventory,
    giftCategories,
    inventoryLogs,
    cashRegisterLogs,
    loading,
    error,
    refetch,
    silentRefetch,
    refetchInventory
  } = useSupabaseData(user?.clinic_id ?? null)

  // 결제 성공 알림 감지 → 대기 직원 승인 모달
  const { notifications, markAsRead } = useUserNotifications({ limit: 20, autoRefresh: true, refreshInterval: 30_000 })
  const [paymentSuccessModal, setPaymentSuccessModal] = useState<{
    id: string
    pendingCount: number
    newLimit: number
    newPlanName: string
  } | null>(null)

  useEffect(() => {
    if (paymentSuccessModal) return // 이미 표시 중이면 건너뜀
    const n = notifications.find((x) => x.type === 'subscription_payment_succeeded' && !x.is_read)
    if (!n) return
    const md = (n.metadata ?? {}) as { pendingCount?: number; newLimit?: number; newPlanName?: string }
    setPaymentSuccessModal({
      id: n.id,
      pendingCount: Number(md.pendingCount ?? 0),
      newLimit: Number(md.newLimit ?? 0),
      newPlanName: String(md.newPlanName ?? ''),
    })
  }, [notifications, paymentSuccessModal])

  // giftLogs 기반 선물별 총 사용량 계산 (모든 날짜 포함)
  const baseUsageByGift = useMemo(() => {
    const usage: Record<string, number> = {}
    for (const log of giftLogs) {
      if (log.gift_type && log.gift_type !== '없음') {
        usage[log.gift_type] = (usage[log.gift_type] || 0) + (log.quantity || 1)
      }
    }
    return usage
  }, [giftLogs])

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
    recallBookingNames: string
    specialNotes: string
    cashRegisterData?: CashRegisterRowData
  }) => {
    if (!canCreateReport && !canEditReport) {
      showToast('보고서를 저장할 권한이 없습니다.', 'error')
      return
    }
    if (!data.date) {
      showToast('보고 일자를 선택해주세요.', 'error')
      return
    }

    try {
      // 세션 갱신 (11분 문제 해결)
      const supabase = createClient()
      await supabase.auth.refreshSession()

      // 타임아웃 설정 (30초)
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('저장 요청 시간이 초과되었습니다. 네트워크 연결을 확인하거나 다시 로그인해주세요.')), 30000)
      )

      const result = await Promise.race([
        dataService.saveReport(data),
        timeoutPromise
      ]) as any

      if (result.error) {
        showToast(`저장 실패: ${result.error}`, 'error')
      } else {
        showToast('보고서가 성공적으로 저장되었습니다.', 'success')
        // refetch를 제거하여 불필요한 리렌더링과 스크롤 이동 방지
        // DailyInputForm이 이미 hasExistingData를 true로 설정하므로 refetch가 불필요함
      }
    } catch (error) {
      console.error('Save report error:', error)
      const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.'
      showToast(`저장 실패: ${errorMessage}`, 'error')
    }
  }

  const handleDeleteReport = async (date: string) => {
    if (!canDeleteReport) {
      showToast('보고서를 삭제할 권한이 없습니다.', 'error')
      return
    }
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

  // 선물 아이템의 카테고리 변경
  const handleUpdateGiftCategory = async (giftId: number, categoryId: number | null) => {
    const result = await dataService.updateGiftItemCategory(giftId, categoryId)
    if (result.error) {
      showToast(`카테고리 변경 실패: ${result.error}`, 'error')
    } else {
      showToast('선물 카테고리가 변경되었습니다.', 'success')
      refetchInventory()
    }
  }

  // 카테고리 추가
  const handleAddCategory = async (name: string, description?: string, color?: string) => {
    const result = await dataService.addGiftCategory(name, description, color)
    if (result.error) {
      showToast(`카테고리 추가 실패: ${result.error}`, 'error')
    } else {
      showToast('카테고리가 추가되었습니다.', 'success')
      refetchInventory()
    }
  }

  // 카테고리 수정
  const handleUpdateCategory = async (id: number, updates: { name?: string; description?: string; color?: string }) => {
    const result = await dataService.updateGiftCategory(id, updates)
    if (result.error) {
      showToast(`카테고리 수정 실패: ${result.error}`, 'error')
    } else {
      showToast('카테고리가 수정되었습니다.', 'success')
      refetchInventory()
    }
  }

  // 카테고리 삭제
  const handleDeleteCategory = async (id: number) => {
    const result = await dataService.deleteGiftCategory(id)
    if (result.error) {
      showToast(`카테고리 삭제 실패: ${result.error}`, 'error')
    } else {
      showToast('카테고리가 삭제되었습니다.', 'success')
      refetchInventory()
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

  // 일일보고서에서 선물 데이터 변경 시 호출
  const handleGiftRowsChange = (date: string, giftRows: GiftRowData[]) => {
    setCurrentReportDate(date)
    setCurrentGiftRows(giftRows)
  }

  const handleUpdateConsultStatus = async (consultId: number): Promise<{ success?: boolean; error?: string }> => {
    try {
      const result = await dataService.updateConsultStatusToCompleted(consultId)
      if (result.error) {
        showToast(`상태 변경 실패: ${result.error}`, 'error')
        return { error: result.error }
      } else {
        const message = result.patientName
          ? `${result.patientName} 환자의 상담이 진행 완료로 변경되었습니다.`
          : '상담 상태가 변경되었습니다.'
        showToast(message, 'success')
        refetch() // 데이터 새로고침
        return { success: true }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.'
      showToast(`상태 변경 실패: ${errorMessage}`, 'error')
      return { error: errorMessage }
    }
  }

  // 통계 계산
  const getStats = (periodType: 'weekly' | 'monthly' | 'annual', value: string) => {
    const periodData = getDatesForPeriod(periodType, value)
    return getStatsForDateRange(dailyReports, giftLogs, periodData.startDate, periodData.endDate, giftInventory, giftCategories)
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
      <div className="p-4 sm:p-6 bg-white min-h-screen flex justify-center items-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-at-accent mx-auto mb-4"></div>
          <p>데이터를 불러오는 중...</p>
        </div>
      </div>
    )
  }

  return (
    <>
          {/* 결제 완료 후 대기 직원 자동/개별 승인 모달 */}
          {paymentSuccessModal && (
            <PostPaymentApprovalModal
              open
              onClose={async () => {
                if (paymentSuccessModal.id) await markAsRead(paymentSuccessModal.id)
                setPaymentSuccessModal(null)
              }}
              pendingCount={paymentSuccessModal.pendingCount}
              newLimit={paymentSuccessModal.newLimit}
              newPlanName={paymentSuccessModal.newPlanName}
            />
          )}

          {/* 대시보드 홈 */}
          {activeTab === 'home' && (
            <DashboardHome />
          )}

          {/* 일일 보고서 입력 */}
          {activeTab === 'daily-input' && (
            <DailyInputForm
              giftInventory={giftInventory}
              giftCategories={giftCategories}
              giftLogs={giftLogs}
              baseUsageByGift={baseUsageByGift}
              onSaveReport={handleSaveReport}
              onSaveSuccess={silentRefetch}
              onGiftRowsChange={handleGiftRowsChange}
              canCreate={canCreateReport}
              canEdit={canEditReport}
              currentUser={user ?? undefined}
            />
          )}

          {/* 출근 관리 */}
          {activeTab === 'attendance' && (
            <div className="bg-white min-h-screen">
              {/* 출근 관리 서브 탭 네비게이션 — 상단 고정 */}
              <div className="sticky top-14 z-10 bg-white border-b border-at-border px-4 sm:px-6 pt-4 pb-3 flex flex-wrap gap-2">
                {canCheckIn && (
                  <button
                    onClick={() => setAttendanceSubTab('checkin')}
                    className={`py-2 px-4 inline-flex items-center rounded-lg font-medium text-sm transition-all whitespace-nowrap ${
                      attendanceSubTab === 'checkin'
                        ? 'bg-at-accent-light text-at-accent'
                        : 'text-at-text-weak hover:text-at-text-secondary hover:bg-at-surface-alt'
                    }`}
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    출퇴근 체크
                  </button>
                )}

                {canViewHistory && (
                  <button
                    onClick={() => setAttendanceSubTab('history')}
                    className={`py-2 px-4 inline-flex items-center rounded-lg font-medium text-sm transition-all whitespace-nowrap ${
                      attendanceSubTab === 'history'
                        ? 'bg-at-accent-light text-at-accent'
                        : 'text-at-text-weak hover:text-at-text-secondary hover:bg-at-surface-alt'
                    }`}
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
                    </svg>
                    출퇴근 기록
                  </button>
                )}

                {canViewStats && (
                  <button
                    onClick={() => setAttendanceSubTab('stats')}
                    className={`py-2 px-4 inline-flex items-center rounded-lg font-medium text-sm transition-all whitespace-nowrap ${
                      attendanceSubTab === 'stats'
                        ? 'bg-at-accent-light text-at-accent'
                        : 'text-at-text-weak hover:text-at-text-secondary hover:bg-at-surface-alt'
                    }`}
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                    </svg>
                    근태 통계
                  </button>
                )}

                {canManageSchedule && (
                  <button
                    onClick={() => setAttendanceSubTab('schedule')}
                    className={`py-2 px-4 inline-flex items-center rounded-lg font-medium text-sm transition-all whitespace-nowrap ${
                      attendanceSubTab === 'schedule'
                        ? 'bg-at-accent-light text-at-accent'
                        : 'text-at-text-weak hover:text-at-text-secondary hover:bg-at-surface-alt'
                    }`}
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    스케줄 관리
                  </button>
                )}

                {canViewTeam && (
                  <button
                    onClick={() => setAttendanceSubTab('team')}
                    className={`py-2 px-4 inline-flex items-center rounded-lg font-medium text-sm transition-all whitespace-nowrap ${
                      attendanceSubTab === 'team'
                        ? 'bg-at-accent-light text-at-accent'
                        : 'text-at-text-weak hover:text-at-text-secondary hover:bg-at-surface-alt'
                    }`}
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
                    </svg>
                    팀 출근 현황
                  </button>
                )}

                {canManageQR && (
                  <button
                    onClick={() => setAttendanceSubTab('qr')}
                    className={`py-2 px-4 inline-flex items-center rounded-lg font-medium text-sm transition-all whitespace-nowrap ${
                      attendanceSubTab === 'qr'
                        ? 'bg-at-accent-light text-at-accent'
                        : 'text-at-text-weak hover:text-at-text-secondary hover:bg-at-surface-alt'
                    }`}
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
                    </svg>
                    QR 코드 관리
                  </button>
                )}
              </div>

              {/* 출근 관리 콘텐츠 */}
              <div className="p-4 sm:p-6">
                {attendanceSubTab === 'checkin' && canCheckIn && <CheckInOut />}
                {attendanceSubTab === 'history' && canViewHistory && <AttendanceHistory />}
                {attendanceSubTab === 'stats' && canViewStats && <AttendanceStats />}
                {attendanceSubTab === 'schedule' && canManageSchedule && <ScheduleManagement />}
                {attendanceSubTab === 'team' && canViewTeam && <TeamStatus />}
                {attendanceSubTab === 'qr' && canManageQR && <QRCodeDisplay />}
              </div>
            </div>
          )}

          {/* 연차 관리 */}
          {activeTab === 'leave' && user && (
            <div className="p-4 sm:p-6 space-y-4 bg-white min-h-screen">
              <LeaveManagement currentUser={user} />
            </div>
          )}

          {/* 통계 */}
          {activeTab === 'stats' && (
            <div className="bg-white min-h-screen">
              {/* 통계 서브 탭 네비게이션 — 상단 고정 */}
              <div className="sticky top-14 z-10 bg-white border-b border-at-border px-4 sm:px-6 pt-4 pb-3 flex flex-wrap gap-2">
                <button
                  onClick={() => setStatsSubTab('weekly')}
                  className={`py-2 px-4 inline-flex items-center rounded-lg font-medium text-sm transition-all whitespace-nowrap ${
                    statsSubTab === 'weekly'
                      ? 'bg-at-accent-light text-at-accent'
                      : 'text-at-text-weak hover:text-at-text-secondary hover:bg-at-surface-alt'
                  }`}
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  주간 통계
                </button>
                <button
                  onClick={() => setStatsSubTab('monthly')}
                  className={`py-2 px-4 inline-flex items-center rounded-lg font-medium text-sm transition-all whitespace-nowrap ${
                    statsSubTab === 'monthly'
                      ? 'bg-at-accent-light text-at-accent'
                      : 'text-at-text-weak hover:text-at-text-secondary hover:bg-at-surface-alt'
                  }`}
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                  월간 통계
                </button>
                <button
                  onClick={() => setStatsSubTab('annual')}
                  className={`py-2 px-4 inline-flex items-center rounded-lg font-medium text-sm transition-all whitespace-nowrap ${
                    statsSubTab === 'annual'
                      ? 'bg-at-accent-light text-at-accent'
                      : 'text-at-text-weak hover:text-at-text-secondary hover:bg-at-surface-alt'
                  }`}
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 3.055A9.001 9.001 0 1020.945 13H11V3.055z" />
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.488 9H15V3.512A9.025 9.025 0 0120.488 9z" />
                  </svg>
                  연간 통계
                </button>
                <button
                  onClick={() => setStatsSubTab('custom')}
                  className={`py-2 px-4 inline-flex items-center rounded-lg font-medium text-sm transition-all whitespace-nowrap ${
                    statsSubTab === 'custom'
                      ? 'bg-at-accent-light text-at-accent'
                      : 'text-at-text-weak hover:text-at-text-secondary hover:bg-at-surface-alt'
                  }`}
                >
                  <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  기간 지정
                </button>
              </div>

              {/* 통계 콘텐츠 */}
              <div className="p-4 sm:p-6">
                {statsSubTab === 'weekly' && (
                  <>
                    <div className="flex justify-end mb-4">
                      <div>
                        <label htmlFor="week-selector" className="mr-2 text-sm text-at-text-secondary">주 선택:</label>
                        <input
                          type="week"
                          id="week-selector"
                          className="p-2 border border-at-border rounded-md text-sm"
                          value={weekSelector}
                          onChange={(e) => setWeekSelector(e.target.value)}
                        />
                      </div>
                    </div>
                    {(() => {
                      const periodData = loading ? null : getDatesForPeriod('weekly', weekSelector)
                      return (
                        <StatsContainer
                          stats={loading ? emptyStats : getStats('weekly', weekSelector)}
                          consultLogs={consultLogs}
                          giftLogs={giftLogs}
                          giftInventory={giftInventory}
                          giftCategories={giftCategories}
                          dailyReports={dailyReports}
                          startDate={periodData?.startDate}
                          endDate={periodData?.endDate}
                        />
                      )
                    })()}
                  </>
                )}

                {statsSubTab === 'monthly' && (
                  <>
                    <div className="flex justify-end mb-4">
                      <div>
                        <label htmlFor="month-selector" className="mr-2 text-sm text-at-text-secondary">월 선택:</label>
                        <input
                          type="month"
                          id="month-selector"
                          className="p-2 border border-at-border rounded-md text-sm"
                          value={monthSelector}
                          onChange={(e) => setMonthSelector(e.target.value)}
                        />
                      </div>
                    </div>
                    {(() => {
                      const periodData = loading ? null : getDatesForPeriod('monthly', monthSelector)
                      return (
                        <StatsContainer
                          stats={loading ? emptyStats : getStats('monthly', monthSelector)}
                          consultLogs={consultLogs}
                          giftLogs={giftLogs}
                          giftInventory={giftInventory}
                          giftCategories={giftCategories}
                          dailyReports={dailyReports}
                          startDate={periodData?.startDate}
                          endDate={periodData?.endDate}
                        />
                      )
                    })()}
                  </>
                )}

                {statsSubTab === 'annual' && (
                  <>
                    <div className="flex justify-end mb-4">
                      <div>
                        <label htmlFor="year-selector" className="mr-2 text-sm text-at-text-secondary">연도 선택:</label>
                        <select
                          id="year-selector"
                          className="p-2 border border-at-border rounded-md text-sm"
                          value={yearSelector}
                          onChange={(e) => setYearSelector(e.target.value)}
                        >
                          {yearOptions.map(year => (
                            <option key={year} value={year}>{year}년</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    {(() => {
                      const periodData = loading ? null : getDatesForPeriod('annual', yearSelector)
                      return (
                        <StatsContainer
                          stats={loading ? emptyStats : getStats('annual', yearSelector)}
                          consultLogs={consultLogs}
                          giftLogs={giftLogs}
                          giftInventory={giftInventory}
                          giftCategories={giftCategories}
                          dailyReports={dailyReports}
                          startDate={periodData?.startDate}
                          endDate={periodData?.endDate}
                        />
                      )
                    })()}
                  </>
                )}

                {statsSubTab === 'custom' && (
                  <>
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6 p-4 bg-at-surface-alt rounded-xl border border-at-border">
                      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
                        <div className="flex items-center gap-2">
                          <label htmlFor="custom-start-date" className="text-sm font-medium text-at-text-secondary whitespace-nowrap">시작일:</label>
                          <input
                            type="date"
                            id="custom-start-date"
                            className="p-2 border border-at-border rounded-md text-sm focus:ring-2 focus:ring-at-accent focus:border-at-accent"
                            value={customStartDate}
                            onChange={(e) => setCustomStartDate(e.target.value)}
                            max={customEndDate}
                          />
                        </div>
                        <span className="hidden sm:block text-at-text-weak">~</span>
                        <div className="flex items-center gap-2">
                          <label htmlFor="custom-end-date" className="text-sm font-medium text-at-text-secondary whitespace-nowrap">종료일:</label>
                          <input
                            type="date"
                            id="custom-end-date"
                            className="p-2 border border-at-border rounded-md text-sm focus:ring-2 focus:ring-at-accent focus:border-at-accent"
                            value={customEndDate}
                            onChange={(e) => setCustomEndDate(e.target.value)}
                            min={customStartDate}
                          />
                        </div>
                      </div>
                      <div className="text-sm text-at-text-weak">
                        {(() => {
                          const start = new Date(customStartDate)
                          const end = new Date(customEndDate)
                          const diffTime = Math.abs(end.getTime() - start.getTime())
                          const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1
                          return `${diffDays}일 간의 통계`
                        })()}
                      </div>
                    </div>
                    <StatsContainer
                      stats={loading ? emptyStats : getStatsForDateRange(
                        dailyReports,
                        giftLogs,
                        new Date(customStartDate + 'T00:00:00'),
                        new Date(customEndDate + 'T23:59:59'),
                        giftInventory,
                        giftCategories
                      )}
                      consultLogs={consultLogs}
                      giftLogs={giftLogs}
                      giftInventory={giftInventory}
                      giftCategories={giftCategories}
                      dailyReports={dailyReports}
                      startDate={new Date(customStartDate + 'T00:00:00')}
                      endDate={new Date(customEndDate + 'T23:59:59')}
                    />
                  </>
                )}
              </div>
            </div>
          )}

          {/* 상세 기록 */}
          {activeTab === 'logs' && (
            <div className="p-4 sm:p-6 bg-white min-h-screen">
              <LogsSection
                dailyReports={dailyReports}
                consultLogs={consultLogs}
                giftLogs={giftLogs}
                inventoryLogs={inventoryLogs}
                cashRegisterLogs={cashRegisterLogs}
                onDeleteReport={handleDeleteReport}
                onRecalculateStats={handleRecalculateStats}
                onUpdateConsultStatus={handleUpdateConsultStatus}
                canDelete={canDeleteReport}
              />
            </div>
          )}

          {/* 진료 프로토콜 */}
          {activeTab === 'protocols' && (
            user ? (
              <ProtocolManagement currentUser={user} />
            ) : (
              <div className="rounded-md border border-amber-200 bg-at-warning-bg p-4 text-sm text-amber-800">
                사용자 정보를 불러오는 중입니다. 잠시 후 다시 시도해주세요.
              </div>
            )
          )}

          {/* 업체 연락처 */}
          {activeTab === 'vendors' && (
            <VendorContactManagement />
          )}

          {/* 문서 양식 */}
          {activeTab === 'documents' && (
            <DocumentTemplates />
          )}

          {/* 급여 명세서 */}
          {activeTab === 'payroll' && (
            <PayrollManagement />
          )}

          {/* 환자 리콜 관리 */}
          {activeTab === 'recall' && (
            <RecallManagement />
          )}

          {/* 업무 체크리스트 */}
          {activeTab === 'task-checklist' && (
            <TaskChecklistManagement />
          )}

          {/* AI 데이터 분석 */}
          {activeTab === 'ai-analysis' && user?.clinic_id && (
            <PremiumGate featureId="ai-analysis">
              <div className="h-[calc(100vh-180px)]">
                <AIChat clinicId={user.clinic_id} />
              </div>
            </PremiumGate>
          )}

          {/* 설정 */}
          {activeTab === 'settings' && (
            <InventoryManagement
              giftInventory={giftInventory}
              giftCategories={giftCategories}
              giftLogs={giftLogs}
              baseUsageByGift={baseUsageByGift}
              currentGiftRows={currentGiftRows}
              currentReportDate={currentReportDate}
              onAddGiftItem={handleAddGiftItem}
              onUpdateStock={handleUpdateStock}
              onDeleteGiftItem={handleDeleteGiftItem}
              onUpdateGiftCategory={handleUpdateGiftCategory}
              onAddCategory={handleAddCategory}
              onUpdateCategory={handleUpdateCategory}
              onDeleteCategory={handleDeleteCategory}
            />
          )}

          {/* 사용 안내 */}
          {activeTab === 'guide' && (
            <div className="p-4 sm:p-6 space-y-6 bg-white min-h-screen">
              <main>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                  {[
                    {
                      title: '일일 보고서',
                      description: '해피콜, 선물 재고, 환자 리뷰, 상담 결과 등 모든 일일 업무를 종합적으로 기록하고 관리합니다.',
                      icon: <FileText className="w-12 h-12 text-indigo-500" />,
                    },
                    {
                      title: '출퇴근 관리',
                      description: 'QR 코드를 스캔하여 간편하게 직원의 출퇴근을 기록하고 관리할 수 있습니다.',
                      icon: <QrCode className="w-12 h-12 text-teal-500" />,
                    },
                    {
                      title: '업무 스케줄 관리',
                      description: '개인 및 팀의 스케줄을 한눈에 확인하여 효율적인 인력 배치를 가능하게 합니다.',
                      icon: <Calendar className="w-12 h-12 text-purple-500" />,
                    },
                    {
                      title: '프로토콜 관리',
                      description: '표준화된 진료 프로토콜을 설정하여 모든 직원에게 일관된 고품질의 진료 서비스를 제공합니다.',
                      icon: <ClipboardList className="w-12 h-12 text-red-500" />,
                    },
                    {
                      title: '사용자 관리',
                      description: '역할(원장, 직원 등)에 따라 접근 권한을 제어하고 안전한 인증을 통해 시스템을 보호합니다.',
                      icon: <Shield className="w-12 h-12 text-at-accent" />,
                    },
                  ].map((feature) => (
                    <div
                      key={feature.title}
                      className="bg-white p-8 rounded-xl shadow-at-card hover:shadow-xl transition-shadow duration-300 flex flex-col items-center text-center"
                    >
                      <div className="mb-4">{feature.icon}</div>
                      <h3 className="text-xl font-semibold text-at-text mb-2">
                        {feature.title}
                      </h3>
                      <p className="text-at-text-secondary">{feature.description}</p>
                    </div>
                  ))}
                </div>
              </main>

              <footer className="text-center mt-16">
                 <div className="bg-at-tag border-l-4 border-at-accent text-at-accent p-4 rounded-md">
                   <div className="flex items-center">
                      <BookUser className="w-6 h-6 mr-3" />
                      <div>
                          <p className="font-bold">페이지별 상세 사용법</p>
                          <p>로그인 후 대시보드에서 각 기능 페이지로 이동하여 스케줄, 재고 등을 관리할 수 있습니다.</p>
                      </div>
                   </div>
                 </div>
              </footer>
            </div>
          )}

          {/* 투자 자동매매 */}
          {activeTab === 'investment' && (
            <PremiumGate featureId="investment">
              <InvestmentTab />
            </PremiumGate>
          )}

          {/* 메뉴 설정 */}
          {activeTab === 'menu-settings' && (
            <MenuSettings />
          )}

      <Toast
        message={toast.message}
        type={toast.type}
        show={toast.show}
        onClose={() => setToast(prev => ({ ...prev, show: false }))}
      />
    </>
  )
}