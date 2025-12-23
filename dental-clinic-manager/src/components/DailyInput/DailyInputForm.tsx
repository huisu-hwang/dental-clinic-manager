'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Calendar, Users, Phone, Gift, FileText, Save, RotateCcw, RefreshCw, ExternalLink, Banknote } from 'lucide-react'
import { useRouter } from 'next/navigation'
import ConsultTable from './ConsultTable'
import GiftTable from './GiftTable'
import HappyCallTable from './HappyCallTable'
import CashLedgerSection, { DEFAULT_CASH_DATA, calculateTotal, type CashData } from './CashLedgerSection'
import { getTodayString } from '@/utils/dateUtils'
import { dataService } from '@/lib/dataService'
import { saveDailyReport } from '@/app/actions/dailyReport'
import { createClient } from '@/lib/supabase/client'
import type { ConsultRowData, GiftRowData, HappyCallRowData, GiftInventory, GiftLog } from '@/types'
import type { UserProfile } from '@/contexts/AuthContext'

// Feature Flag: 신규 아키텍처 사용 여부
const USE_NEW_ARCHITECTURE = process.env.NEXT_PUBLIC_USE_NEW_DAILY_REPORT === 'true'

interface DailyInputFormProps {
  giftInventory: GiftInventory[]
  giftLogs?: GiftLog[]  // 저장된 선물 사용 기록 (실제 재고 계산용)
  baseUsageByGift?: Record<string, number>  // 전체 giftLogs 기반 사용량 (dashboard에서 계산)
  onSaveReport: (data: {
    date: string
    consultRows: ConsultRowData[]
    giftRows: GiftRowData[]
    happyCallRows: HappyCallRowData[]
    recallCount: number
    recallBookingCount: number
    recallBookingNames: string
    specialNotes: string
  }) => void
  onSaveSuccess?: () => void  // 저장 성공 후 콜백 (데이터 새로고침용)
  onGiftRowsChange?: (date: string, giftRows: GiftRowData[]) => void  // 선물 데이터 변경 시 콜백
  canCreate: boolean
  canEdit: boolean
  currentUser?: UserProfile
}

export default function DailyInputForm({ giftInventory, giftLogs = [], baseUsageByGift = {}, onSaveReport, onSaveSuccess, onGiftRowsChange, canCreate, canEdit, currentUser }: DailyInputFormProps) {
  const [reportDate, setReportDate] = useState(getTodayString())
  const [consultRows, setConsultRows] = useState<ConsultRowData[]>([
    { patient_name: '', consult_content: '', consult_status: 'O', remarks: '' }
  ])
  const [giftRows, setGiftRows] = useState<GiftRowData[]>([
    { patient_name: '', gift_type: '없음', quantity: 1, naver_review: 'X', notes: '' }
  ])
  const [happyCallRows, setHappyCallRows] = useState<HappyCallRowData[]>([
    { patient_name: '', treatment: '', notes: '' }
  ])
  const [recallCount, setRecallCount] = useState(0)
  const [recallBookingCount, setRecallBookingCount] = useState(0)
  const [recallBookingNames, setRecallBookingNames] = useState('')
  const [specialNotes, setSpecialNotes] = useState('')
  const [carriedForward, setCarriedForward] = useState<CashData>(DEFAULT_CASH_DATA)
  const [closingBalance, setClosingBalance] = useState<CashData>(DEFAULT_CASH_DATA)
  const [loading, setLoading] = useState(false)
  const [hasExistingData, setHasExistingData] = useState(false)
  const [hasExternalUpdate, setHasExternalUpdate] = useState(false)  // 다른 사용자의 변경 감지
  const isSavingRef = useRef(false)  // 현재 저장 중인지 확인 (자신의 저장은 무시)
  const router = useRouter()
  const isReadOnly = hasExistingData ? !canEdit : !canCreate

  // 폼 데이터 리셋
  const resetFormData = useCallback(() => {
    setConsultRows([{ patient_name: '', consult_content: '', consult_status: 'O', remarks: '' }])
    setGiftRows([{ patient_name: '', gift_type: '없음', quantity: 1, naver_review: 'X', notes: '' }])
    setHappyCallRows([{ patient_name: '', treatment: '', notes: '' }])
    setRecallCount(0)
    setRecallBookingCount(0)
    setRecallBookingNames('')
    setSpecialNotes('')
    setCarriedForward(DEFAULT_CASH_DATA)
    setClosingBalance(DEFAULT_CASH_DATA)
  }, [])

  // 날짜별 데이터 로드
  const loadDataForDate = useCallback(async (date: string) => {
    console.log('[DailyInputForm] loadDataForDate called with:', date)
    if (!date) {
      console.log('[DailyInputForm] No date provided, skipping load')
      setLoading(false)
      return
    }

    console.log('[DailyInputForm] Setting loading to true')
    setLoading(true)
    setHasExistingData(false)

    const timeoutId = setTimeout(() => {
      console.log('[DailyInputForm] Load timeout - forcing loading to false')
      setLoading(false)
    }, 10000)

    try {
      console.log('[DailyInputForm] Calling dataService.getReportByDate...')
      const result = currentUser?.clinic_id
        ? await dataService.getReportByDate(currentUser.clinic_id, date)
        : await dataService.getReportByDate(date)
      console.log('[DailyInputForm] Result received:', result)

      if (result.success && result.data.hasData) {
        const { dailyReport, consultLogs, giftLogs, happyCallLogs } = result.data

        if (dailyReport) {
          const normalizedRecallCount =
            typeof dailyReport.recall_count === 'number'
              ? dailyReport.recall_count
              : Number(dailyReport.recall_count ?? 0)
          const normalizedRecallBookingCount =
            typeof dailyReport.recall_booking_count === 'number'
              ? dailyReport.recall_booking_count
              : Number(dailyReport.recall_booking_count ?? 0)

          setRecallCount(Number.isNaN(normalizedRecallCount) ? 0 : normalizedRecallCount)
          setRecallBookingCount(
            Number.isNaN(normalizedRecallBookingCount) ? 0 : normalizedRecallBookingCount
          )
          setRecallBookingNames(
            typeof dailyReport.recall_booking_names === 'string' ? dailyReport.recall_booking_names : ''
          )
          setSpecialNotes(
            typeof dailyReport.special_notes === 'string' ? dailyReport.special_notes : ''
          )
        }

        if (consultLogs.length > 0) {
          setConsultRows(consultLogs.map(log => ({
            patient_name: typeof log.patient_name === 'string' ? log.patient_name : '',
            consult_content: typeof log.consult_content === 'string' ? log.consult_content : '',
            consult_status: (log.consult_status as 'O' | 'X') || 'O',
            remarks: typeof log.remarks === 'string' ? log.remarks : ''
          })))
        } else {
          setConsultRows([{ patient_name: '', consult_content: '', consult_status: 'O', remarks: '' }])
        }

        if (giftLogs.length > 0) {
          setGiftRows(giftLogs.map(log => ({
            patient_name: typeof log.patient_name === 'string' ? log.patient_name : '',
            gift_type: typeof log.gift_type === 'string' ? log.gift_type : '없음',
            quantity: typeof log.quantity === 'number' ? log.quantity : 1,
            naver_review: (log.naver_review as 'O' | 'X') || 'X',
            notes: typeof log.notes === 'string' ? log.notes : ''
          })))
        } else {
          setGiftRows([{ patient_name: '', gift_type: '없음', quantity: 1, naver_review: 'X', notes: '' }])
        }

        if (happyCallLogs.length > 0) {
          setHappyCallRows(happyCallLogs.map(log => ({
            patient_name: typeof log.patient_name === 'string' ? log.patient_name : '',
            treatment: typeof log.treatment === 'string' ? log.treatment : '',
            notes: typeof log.notes === 'string' ? log.notes : ''
          })))
        } else {
          setHappyCallRows([{ patient_name: '', treatment: '', notes: '' }])
        }

        // 현금 출납 데이터 로드
        const cashLedger = result.data.cashLedger
        if (cashLedger) {
          if (Array.isArray(cashLedger.carried_forward)) {
            setCarriedForward(cashLedger.carried_forward)
          } else {
            setCarriedForward(DEFAULT_CASH_DATA)
          }
          if (Array.isArray(cashLedger.closing_balance)) {
            setClosingBalance(cashLedger.closing_balance)
          } else {
            setClosingBalance(DEFAULT_CASH_DATA)
          }
        } else {
          setCarriedForward(DEFAULT_CASH_DATA)
          setClosingBalance(DEFAULT_CASH_DATA)
        }

        setHasExistingData(true)
      } else {
        resetFormData()
        setHasExistingData(false)
      }
    } catch (error) {
      console.error('[DailyInputForm] 데이터 로드 실패:', error)
      resetFormData()
      setHasExistingData(false)
    } finally {
      clearTimeout(timeoutId)
      console.log('[DailyInputForm] Setting loading to false')
      setLoading(false)
    }
  }, [currentUser?.clinic_id, resetFormData])

  const handleDateChange = (newDate: string) => {
    if (newDate !== reportDate) {
      setReportDate(newDate)
    }
  }

  useEffect(() => {
    if (!currentUser?.clinic_id) {
      console.log('[DailyInputForm] No user/clinic_id, skipping data load')
      setLoading(false)
      return
    }
    console.log('[DailyInputForm] Loading data for date:', reportDate)
    loadDataForDate(reportDate)
  }, [reportDate, loadDataForDate, currentUser?.clinic_id])

  // giftRows 변경 시 상위 컴포넌트에 알림 (재고 관리 실시간 반영용)
  useEffect(() => {
    if (onGiftRowsChange && reportDate) {
      onGiftRowsChange(reportDate, giftRows)
    }
  }, [giftRows, reportDate, onGiftRowsChange])

  useEffect(() => {
    if (!currentUser?.clinic_id) {
      return
    }

    console.log('[DailyInputForm] Detected clinic change, reloading data for', reportDate)
    loadDataForDate(reportDate)
  }, [currentUser?.clinic_id, loadDataForDate, reportDate])

  // Realtime 구독: 다른 사용자의 변경사항 감지
  useEffect(() => {
    if (!currentUser?.clinic_id || !reportDate) {
      return
    }

    const supabase = createClient()
    if (!supabase) {
      return
    }

    console.log('[DailyInputForm] Setting up Realtime subscription for date:', reportDate)

    // 해당 날짜의 데이터 변경 감지
    const channel = supabase
      .channel(`daily-report-${currentUser.clinic_id}-${reportDate}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'daily_reports',
          filter: `clinic_id=eq.${currentUser.clinic_id}`
        },
        (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
          // 자신이 저장 중인 경우는 무시
          if (isSavingRef.current) return

          // 해당 날짜의 변경인지 확인
          const newRecord = payload.new as { date?: string } | null
          const oldRecord = payload.old as { date?: string } | null
          const changedDate = newRecord?.date || oldRecord?.date

          if (changedDate === reportDate) {
            console.log('[DailyInputForm] External update detected for daily_reports')
            setHasExternalUpdate(true)
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'consult_logs',
          filter: `clinic_id=eq.${currentUser.clinic_id}`
        },
        (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
          if (isSavingRef.current) return

          const newRecord = payload.new as { date?: string } | null
          const oldRecord = payload.old as { date?: string } | null
          const changedDate = newRecord?.date || oldRecord?.date

          if (changedDate === reportDate) {
            console.log('[DailyInputForm] External update detected for consult_logs')
            setHasExternalUpdate(true)
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'gift_logs',
          filter: `clinic_id=eq.${currentUser.clinic_id}`
        },
        (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
          if (isSavingRef.current) return

          const newRecord = payload.new as { date?: string } | null
          const oldRecord = payload.old as { date?: string } | null
          const changedDate = newRecord?.date || oldRecord?.date

          if (changedDate === reportDate) {
            console.log('[DailyInputForm] External update detected for gift_logs')
            setHasExternalUpdate(true)
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'happy_call_logs',
          filter: `clinic_id=eq.${currentUser.clinic_id}`
        },
        (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
          if (isSavingRef.current) return

          const newRecord = payload.new as { date?: string } | null
          const oldRecord = payload.old as { date?: string } | null
          const changedDate = newRecord?.date || oldRecord?.date

          if (changedDate === reportDate) {
            console.log('[DailyInputForm] External update detected for happy_call_logs')
            setHasExternalUpdate(true)
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'special_notes_history',
          filter: `clinic_id=eq.${currentUser.clinic_id}`
        },
        (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
          if (isSavingRef.current) return

          const newRecord = payload.new as { report_date?: string } | null
          const oldRecord = payload.old as { report_date?: string } | null
          const changedDate = newRecord?.report_date || oldRecord?.report_date

          if (changedDate === reportDate) {
            console.log('[DailyInputForm] External update detected for special_notes_history')
            setHasExternalUpdate(true)
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'cash_ledger',
          filter: `clinic_id=eq.${currentUser.clinic_id}`
        },
        (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
          if (isSavingRef.current) return

          const newRecord = payload.new as { date?: string } | null
          const oldRecord = payload.old as { date?: string } | null
          const changedDate = newRecord?.date || oldRecord?.date

          if (changedDate === reportDate) {
            console.log('[DailyInputForm] External update detected for cash_ledger')
            setHasExternalUpdate(true)
          }
        }
      )
      .subscribe((status: string, err?: Error) => {
        if (status === 'SUBSCRIBED') {
          console.log('[DailyInputForm] Realtime subscription active')
        } else if (status === 'CHANNEL_ERROR') {
          console.error('[DailyInputForm] Realtime subscription error:', err)
        } else if (status === 'TIMED_OUT') {
          console.error('[DailyInputForm] Realtime subscription timed out')
        } else {
          console.log('[DailyInputForm] Realtime subscription status:', status)
        }
      })

    return () => {
      console.log('[DailyInputForm] Cleaning up Realtime subscription')
      supabase.removeChannel(channel)
    }
  }, [currentUser?.clinic_id, reportDate])

  // 외부 변경 감지 시 자동 새로고침
  const handleRefreshData = useCallback(() => {
    setHasExternalUpdate(false)
    loadDataForDate(reportDate)
  }, [loadDataForDate, reportDate])

  const handleSave = async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }

    if (!reportDate) {
      alert('보고 일자를 선택해주세요.')
      return
    }

    setLoading(true)
    isSavingRef.current = true  // 자신의 저장 중에는 외부 변경 감지 무시
    setHasExternalUpdate(false)  // 저장 시 외부 변경 알림 초기화
    console.log(`[DailyInputForm] handleSave - Using ${USE_NEW_ARCHITECTURE ? 'NEW' : 'OLD'} architecture`)

    try {
      if (USE_NEW_ARCHITECTURE) {
        console.log('[DailyInputForm] Calling Server Action...')

        const filteredConsultLogs = consultRows.filter(row => row.patient_name?.trim())
        const filteredGiftLogs = giftRows.filter(row => row.patient_name?.trim())
        const filteredHappyCallLogs = happyCallRows.filter(row => row.patient_name?.trim())

        const result = await saveDailyReport({
          date: reportDate,
          dailyReport: {
            recall_count: recallCount,
            recall_booking_count: recallBookingCount,
            recall_booking_names: recallBookingNames,
            special_notes: specialNotes
          },
          consultLogs: filteredConsultLogs.map(row => ({
            date: reportDate,
            patient_name: row.patient_name,
            consult_content: row.consult_content || '',
            consult_status: row.consult_status,
            remarks: row.remarks || ''
          })),
          giftLogs: filteredGiftLogs.map(row => ({
            date: reportDate,
            patient_name: row.patient_name,
            gift_type: row.gift_type || '',
            quantity: row.quantity || 1,
            naver_review: row.naver_review,
            notes: row.notes || ''
          })),
          happyCallLogs: filteredHappyCallLogs.map(row => ({
            date: reportDate,
            patient_name: row.patient_name,
            treatment: row.treatment || '',
            notes: row.notes || ''
          })),
          cashLedger: {
            carried_forward: carriedForward,
            carried_forward_total: calculateTotal(carriedForward),
            closing_balance: closingBalance,
            closing_balance_total: calculateTotal(closingBalance)
          }
        })

        if (!result.success) {
          console.error('[DailyInputForm] Server Action failed:', result.error)
          throw new Error(result.error || '저장에 실패했습니다.')
        }

        console.log('[DailyInputForm] Server Action succeeded:', result)
        alert('보고서가 성공적으로 저장되었습니다.')
        // 저장 성공 후 부모에게 알려서 데이터 새로고침
        onSaveSuccess?.()
      } else {
        console.log('[DailyInputForm] Using legacy onSaveReport...')

        await onSaveReport({
          date: reportDate,
          consultRows,
          giftRows,
          happyCallRows,
          recallCount,
          recallBookingCount,
          recallBookingNames,
          specialNotes
        })
        // 레거시 아키텍처에서도 저장 성공 후 부모에게 알려서 데이터 새로고침
        onSaveSuccess?.()
      }

      setHasExistingData(true)
    } catch (error) {
      console.error('[DailyInputForm] Save error:', error)
      const errorMessage = error instanceof Error ? error.message : '보고서 저장 중 오류가 발생했습니다.'
      alert(errorMessage + ' 다시 시도해주세요.')
    } finally {
      setLoading(false)
      // 저장 완료 후 약간의 지연을 두고 플래그 해제 (Realtime 이벤트 무시 기간)
      setTimeout(() => {
        isSavingRef.current = false
      }, 2000)
    }
  }

  const resetForm = () => {
    const today = getTodayString()
    setReportDate(today)
    handleDateChange(today)
  }

  // 저장 후 상담 상세 기록 페이지로 이동
  const handleSaveAndNavigateToLogs = async () => {
    // 입력된 데이터가 있는지 확인 (환자명이 있는 행이 하나라도 있으면)
    const hasConsultData = consultRows.some(row => row.patient_name?.trim())
    const hasGiftData = giftRows.some(row => row.patient_name?.trim())
    const hasHappyCallData = happyCallRows.some(row => row.patient_name?.trim())
    const hasOtherData = recallCount > 0 || recallBookingCount > 0 || recallBookingNames.trim() || specialNotes.trim()

    const hasAnyData = hasConsultData || hasGiftData || hasHappyCallData || hasOtherData

    if (hasAnyData && !isReadOnly) {
      // 데이터가 있으면 저장 먼저 수행
      setLoading(true)
      isSavingRef.current = true
      setHasExternalUpdate(false)

      try {
        if (USE_NEW_ARCHITECTURE) {
          const filteredConsultLogs = consultRows.filter(row => row.patient_name?.trim())
          const filteredGiftLogs = giftRows.filter(row => row.patient_name?.trim())
          const filteredHappyCallLogs = happyCallRows.filter(row => row.patient_name?.trim())

          const result = await saveDailyReport({
            date: reportDate,
            dailyReport: {
              recall_count: recallCount,
              recall_booking_count: recallBookingCount,
              recall_booking_names: recallBookingNames,
              special_notes: specialNotes
            },
            consultLogs: filteredConsultLogs.map(row => ({
              date: reportDate,
              patient_name: row.patient_name,
              consult_content: row.consult_content || '',
              consult_status: row.consult_status,
              remarks: row.remarks || ''
            })),
            giftLogs: filteredGiftLogs.map(row => ({
              date: reportDate,
              patient_name: row.patient_name,
              gift_type: row.gift_type || '',
              quantity: row.quantity || 1,
              naver_review: row.naver_review,
              notes: row.notes || ''
            })),
            happyCallLogs: filteredHappyCallLogs.map(row => ({
              date: reportDate,
              patient_name: row.patient_name,
              treatment: row.treatment || '',
              notes: row.notes || ''
            })),
            cashLedger: {
              carried_forward: carriedForward,
              carried_forward_total: calculateTotal(carriedForward),
              closing_balance: closingBalance,
              closing_balance_total: calculateTotal(closingBalance)
            }
          })

          if (!result.success) {
            throw new Error(result.error || '저장에 실패했습니다.')
          }

          onSaveSuccess?.()
        } else {
          await onSaveReport({
            date: reportDate,
            consultRows,
            giftRows,
            happyCallRows,
            recallCount,
            recallBookingCount,
            recallBookingNames,
            specialNotes
          })
          onSaveSuccess?.()
        }

        setHasExistingData(true)
      } catch (error) {
        console.error('[DailyInputForm] Save before navigate error:', error)
        const errorMessage = error instanceof Error ? error.message : '저장 중 오류가 발생했습니다.'
        alert(errorMessage + ' 페이지 이동을 취소합니다.')
        setLoading(false)
        isSavingRef.current = false
        return // 저장 실패 시 이동하지 않음
      } finally {
        setLoading(false)
        setTimeout(() => {
          isSavingRef.current = false
        }, 2000)
      }
    }

    // 상담 상세 기록 페이지로 이동 (해시로 섹션 지정)
    router.push('/dashboard?tab=logs#consult-logs')
  }

  // 섹션 헤더 컴포넌트
  const SectionHeader = ({ number, title, icon: Icon }: { number: number; title: string; icon: React.ElementType }) => (
    <div className="flex items-center space-x-2 sm:space-x-3 pb-2 sm:pb-3 mb-3 sm:mb-4 border-b border-slate-200">
      <div className="flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-blue-50 text-blue-600">
        <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
      </div>
      <h3 className="text-sm sm:text-base font-semibold text-slate-800">
        <span className="text-blue-600 mr-1">{number}.</span>
        {title}
      </h3>
    </div>
  )

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      {/* 보고서 헤더 */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-4 sm:px-6 py-3 sm:py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 sm:space-x-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-white/20 rounded-lg flex items-center justify-center">
              <FileText className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">일일 업무 보고서</h2>
              <p className="text-blue-100 text-xs sm:text-sm hidden sm:block">Daily Report</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {loading && (
              <span className="px-2 sm:px-3 py-1 bg-white/20 rounded-full text-white text-xs">
                로딩 중...
              </span>
            )}
            {hasExistingData && !loading && (
              <span className="px-2 sm:px-3 py-1 bg-green-500/80 rounded-full text-white text-xs">
                기존 데이터
              </span>
            )}
          </div>
        </div>
      </div>

      {/* 외부 변경 알림 배너 */}
      {hasExternalUpdate && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 sm:px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <RefreshCw className="w-4 h-4 text-amber-600" />
              <span className="text-sm text-amber-800">
                다른 사용자가 이 보고서를 수정했습니다.
              </span>
            </div>
            <button
              onClick={handleRefreshData}
              className="inline-flex items-center px-3 py-1.5 text-sm font-medium text-amber-700 bg-amber-100 hover:bg-amber-200 rounded-md transition-colors"
            >
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              새로고침
            </button>
          </div>
        </div>
      )}

      {/* 보고서 본문 */}
      <div className="p-3 sm:p-6 space-y-4 sm:space-y-6">
        {/* 기본 정보 */}
        <div>
          <SectionHeader number={1} title="기본 정보" icon={Calendar} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label htmlFor="report-date" className="block text-sm font-medium text-slate-600 mb-1.5">
                보고 일자
              </label>
              <input
                type="date"
                id="report-date"
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                value={reportDate}
                onChange={(e) => handleDateChange(e.target.value)}
                disabled={loading || !canCreate}
              />
            </div>
          </div>
        </div>

        {/* 상담 결과 */}
        <div>
          <div className="flex items-center justify-between pb-2 sm:pb-3 mb-3 sm:mb-4 border-b border-slate-200">
            <div className="flex items-center space-x-2 sm:space-x-3">
              <div className="flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-blue-50 text-blue-600">
                <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </div>
              <h3 className="text-sm sm:text-base font-semibold text-slate-800">
                <span className="text-blue-600 mr-1">2.</span>
                환자 상담 결과
              </h3>
            </div>
            <button
              type="button"
              onClick={handleSaveAndNavigateToLogs}
              disabled={loading}
              className="inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded-lg transition-colors group disabled:opacity-50 disabled:cursor-not-allowed"
              title="현재 보고서를 저장하고 상담 상세 기록 페이지로 이동"
            >
              <span className="hidden sm:inline">상담 상세 기록</span>
              <span className="sm:hidden">상세 기록</span>
              <ExternalLink className="w-3 h-3 sm:w-3.5 sm:h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </button>
          </div>
          <ConsultTable
            consultRows={consultRows}
            onConsultRowsChange={setConsultRows}
            isReadOnly={isReadOnly}
          />
        </div>

        {/* 리콜 결과 */}
        <div>
          <SectionHeader number={3} title="환자 리콜 결과" icon={Phone} />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">리콜 건수</label>
              <input
                type="number"
                min="0"
                value={recallCount}
                onChange={(e) => setRecallCount(parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                readOnly={isReadOnly}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">예약 수</label>
              <input
                type="number"
                min="0"
                value={recallBookingCount}
                onChange={(e) => setRecallBookingCount(parseInt(e.target.value) || 0)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                readOnly={isReadOnly}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-600 mb-1.5">예약 성공 환자</label>
              <input
                type="text"
                value={recallBookingNames}
                onChange={(e) => setRecallBookingNames(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                placeholder="예: 홍길동, 김철수"
                readOnly={isReadOnly}
              />
            </div>
          </div>
        </div>

        {/* 선물/리뷰 관리 */}
        <div>
          <SectionHeader number={4} title="선물 및 리뷰 관리" icon={Gift} />
          <GiftTable
            giftRows={giftRows}
            onGiftRowsChange={setGiftRows}
            giftInventory={giftInventory}
            giftLogs={giftLogs}
            baseUsageByGift={baseUsageByGift}
            currentDate={reportDate}
            isReadOnly={isReadOnly}
          />
        </div>

        {/* 해피콜 결과 */}
        <div>
          <SectionHeader number={5} title="해피콜 결과" icon={Phone} />
          <HappyCallTable
            happyCallRows={happyCallRows}
            onHappyCallRowsChange={setHappyCallRows}
            isReadOnly={isReadOnly}
          />
        </div>

        {/* 현금 출납 기록 */}
        <div>
          <SectionHeader number={6} title="현금 출납 기록" icon={Banknote} />
          <CashLedgerSection
            carriedForward={carriedForward}
            closingBalance={closingBalance}
            onCarriedForwardChange={setCarriedForward}
            onClosingBalanceChange={setClosingBalance}
            isReadOnly={isReadOnly}
          />
        </div>

        {/* 기타 특이사항 */}
        <div>
          <SectionHeader number={7} title="기타 특이사항" icon={FileText} />
          <div>
            <textarea
              id="special-notes"
              rows={3}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
              placeholder="오늘 업무 중 특이사항이나 기록할 내용을 작성해주세요."
              value={specialNotes}
              onChange={(e) => setSpecialNotes(e.target.value)}
              readOnly={isReadOnly}
            />
          </div>
        </div>
      </div>

      {/* 저장 버튼 영역 */}
      {(canCreate || canEdit) && (
        <div className="px-3 sm:px-6 py-3 sm:py-4 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row justify-end gap-2 sm:gap-3">
          <button
            type="button"
            onClick={resetForm}
            className="inline-flex items-center justify-center px-4 py-2.5 sm:py-2 border border-slate-300 rounded-lg text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 transition-colors disabled:opacity-50 order-2 sm:order-1"
            disabled={isReadOnly}
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            초기화
          </button>
          <button
            type="button"
            onClick={(e) => handleSave(e)}
            className="inline-flex items-center justify-center px-5 py-2.5 sm:py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed order-1 sm:order-2"
            disabled={loading || isReadOnly}
          >
            <Save className="w-4 h-4 mr-2" />
            {loading ? '저장 중...' : (hasExistingData ? '수정하기' : '저장하기')}
          </button>
        </div>
      )}
    </div>
  )
}
