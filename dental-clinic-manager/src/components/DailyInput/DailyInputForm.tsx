'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Calendar, Users, Phone, PhoneOff, HeartHandshake, Gift, FileText, Save, RotateCcw, RefreshCw, ExternalLink, Banknote, Package, Clock, ChevronLeft, ChevronRight } from 'lucide-react'
import { useRouter } from 'next/navigation'
import ConsultTable from './ConsultTable'
import GiftTable from './GiftTable'
import HappyCallTable from './HappyCallTable'
import CashRegisterTable from './CashRegisterTable'
import OvertimeMealTable from './OvertimeMealTable'
import { getTodayString } from '@/utils/dateUtils'
import { dataService } from '@/lib/dataService'
import { saveDailyReport } from '@/app/actions/dailyReport'
import { createClient } from '@/lib/supabase/client'
import { RECALL_STATUS_LABELS, RECALL_STATUS_COLORS } from '@/types/recall'
import type { RecallPatient } from '@/types/recall'
import type { ConsultRowData, GiftRowData, HappyCallRowData, CashRegisterRowData, GiftInventory, GiftLog, GiftCategory } from '@/types'
import type { OvertimeMealRowData } from '@/types'
import { overtimeMealService } from '@/lib/overtimeMealService'
import type { UserProfile } from '@/contexts/AuthContext'
import { appAlert, appConfirm } from '@/components/ui/AppDialog'

// Feature Flag: 신규 아키텍처 사용 여부
const USE_NEW_ARCHITECTURE = process.env.NEXT_PUBLIC_USE_NEW_DAILY_REPORT === 'true'

interface DailyInputFormProps {
  giftInventory: GiftInventory[]
  giftCategories?: GiftCategory[]  // 선물 카테고리 목록
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
    cashRegisterData?: CashRegisterRowData
  }) => void
  onSaveSuccess?: () => void  // 저장 성공 후 콜백 (데이터 새로고침용)
  onGiftRowsChange?: (date: string, giftRows: GiftRowData[]) => void  // 선물 데이터 변경 시 콜백
  canCreate: boolean
  canEdit: boolean
  currentUser?: UserProfile
}

export default function DailyInputForm({ giftInventory, giftCategories = [], giftLogs = [], baseUsageByGift = {}, onSaveReport, onSaveSuccess, onGiftRowsChange, canCreate, canEdit, currentUser }: DailyInputFormProps) {
  const [reportDate, setReportDate] = useState(getTodayString())
  const [consultRows, setConsultRows] = useState<ConsultRowData[]>([
    { patient_name: '', consult_content: '', consult_status: 'O', remarks: '' }
  ])
  const [giftRows, setGiftRows] = useState<GiftRowData[]>([
    { patient_name: '', gift_type: '없음', quantity: 1, naver_review: '미작성', notes: '' }
  ])
  const [happyCallRows, setHappyCallRows] = useState<HappyCallRowData[]>([
    { patient_name: '', treatment: '', notes: '' }
  ])
  const [cashRegisterData, setCashRegisterData] = useState<CashRegisterRowData>({
    prev_bill_50000: 0, prev_bill_10000: 0, prev_bill_5000: 0, prev_bill_1000: 0, prev_coin_500: 0, prev_coin_100: 0,
    curr_bill_50000: 0, curr_bill_10000: 0, curr_bill_5000: 0, curr_bill_1000: 0, curr_coin_500: 0, curr_coin_100: 0,
    notes: ''
  })
  const defaultOvertimeMealData: OvertimeMealRowData = { has_lunch: false, lunch_overtime_minutes: 0, has_dinner: false, dinner_overtime_minutes: 0, notes: '' }
  const [overtimeMealData, setOvertimeMealData] = useState<OvertimeMealRowData>(defaultOvertimeMealData)
  const [recallCount, setRecallCount] = useState(0)
  const [recallBookingCount, setRecallBookingCount] = useState(0)
  const [recallBookingNames, setRecallBookingNames] = useState('')
  const [recallSynced, setRecallSynced] = useState(false)
  const [recallSyncing, setRecallSyncing] = useState(false)
  const [recallPatients, setRecallPatients] = useState<RecallPatient[]>([])
  const [showRecallLog, setShowRecallLog] = useState(false)
  const [specialNotes, setSpecialNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [hasExistingData, setHasExistingData] = useState(false)
  const isSavingRef = useRef(false)  // 현재 저장 중인지 확인 (자신의 저장은 무시)
  const isRefreshingRef = useRef(false)  // 새로고침 중/직후 분할 Realtime 이벤트 무시용
  const autoRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)  // 분할 이벤트 묶기용 debounce 타이머
  const pendingExternalUpdateRef = useRef(false)  // 사용자 입력 중 보류된 외부 업데이트
  const formRef = useRef<HTMLDivElement>(null)  // 포커스 판정용 폼 컨테이너
  const performAutoRefreshRef = useRef<() => Promise<void> | void>(() => {})  // 최신 자동 새로고침 함수 참조
  const router = useRouter()
  const isReadOnly = hasExistingData ? !canEdit : !canCreate

  // 폼 데이터 리셋
  const resetFormData = useCallback(() => {
    setConsultRows([{ patient_name: '', consult_content: '', consult_status: 'O', remarks: '' }])
    setGiftRows([{ patient_name: '', gift_type: '없음', quantity: 1, naver_review: '미작성', notes: '' }])
    setHappyCallRows([{ patient_name: '', treatment: '', notes: '' }])
    setCashRegisterData({
      prev_bill_50000: 0, prev_bill_10000: 0, prev_bill_5000: 0, prev_bill_1000: 0, prev_coin_500: 0, prev_coin_100: 0,
      curr_bill_50000: 0, curr_bill_10000: 0, curr_bill_5000: 0, curr_bill_1000: 0, curr_coin_500: 0, curr_coin_100: 0,
      notes: ''
    })
    setRecallCount(0)
    setRecallBookingCount(0)
    setRecallBookingNames('')
    setRecallSynced(false)
    setRecallPatients([])
    setShowRecallLog(false)
    setSpecialNotes('')
  }, [])

  // 리콜 데이터 자동 동기화
  const syncRecallData = useCallback(async (date: string) => {
    setRecallSyncing(true)
    try {
      const { recallService } = await import('@/lib/recallService')
      const result = await recallService.patients.getDailyRecallActivity(date)
      if (result.success && result.data) {
        setRecallCount(result.data.recallCount)
        setRecallBookingCount(result.data.recallBookingCount)
        setRecallBookingNames(result.data.recallBookingNames)
        setRecallPatients(result.data.patients)
        setRecallSynced(true)
      }
    } catch (error) {
      console.error('[DailyInputForm] Failed to sync recall data:', error)
    } finally {
      setRecallSyncing(false)
    }
  }, [])

  // 날짜별 데이터 로드
  const loadDataForDate = useCallback(async (date: string) => {
    console.log('[DailyInputForm] loadDataForDate called with:', date)

    // 저장 중일 때는 데이터 로드 스킵 (저장 직후 재로드로 인한 데이터 초기화 방지)
    if (isSavingRef.current) {
      console.log('[DailyInputForm] Skipping load - save in progress')
      return
    }

    if (!date) {
      console.log('[DailyInputForm] No date provided, skipping load')
      setLoading(false)
      return
    }

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
          setSpecialNotes(
            typeof dailyReport.special_notes === 'string' ? dailyReport.special_notes : ''
          )
        }

        // 리콜 데이터는 recall_patients 테이블에서 자동 동기화
        syncRecallData(date)

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
          console.log('[DailyInputForm] Loading giftLogs from DB:', JSON.stringify(giftLogs))
          setGiftRows(giftLogs.map(log => {
            // DB에서 가져온 quantity를 확실하게 숫자로 변환
            const loadedQty = parseInt(String(log.quantity), 10) || 1
            console.log('[DailyInputForm] Loading gift row:', {
              patient_name: log.patient_name,
              db_quantity: log.quantity,
              db_quantity_type: typeof log.quantity,
              loaded_quantity: loadedQty
            })
            return {
              patient_name: typeof log.patient_name === 'string' ? log.patient_name : '',
              gift_type: typeof log.gift_type === 'string' ? log.gift_type : '없음',
              quantity: loadedQty,
              naver_review: (log.naver_review as '미작성' | '네이버' | '구글' | '게시판') || '미작성',
              notes: typeof log.notes === 'string' ? log.notes : ''
            }
          }))
        } else {
          setGiftRows([{ patient_name: '', gift_type: '없음', quantity: 1, naver_review: '미작성', notes: '' }])
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
        const cashRegisterLog = result.data.cashRegisterLog
        if (cashRegisterLog) {
          setCashRegisterData({
            prev_bill_50000: cashRegisterLog.prev_bill_50000 || 0,
            prev_bill_10000: cashRegisterLog.prev_bill_10000 || 0,
            prev_bill_5000: cashRegisterLog.prev_bill_5000 || 0,
            prev_bill_1000: cashRegisterLog.prev_bill_1000 || 0,
            prev_coin_500: cashRegisterLog.prev_coin_500 || 0,
            prev_coin_100: cashRegisterLog.prev_coin_100 || 0,
            curr_bill_50000: cashRegisterLog.curr_bill_50000 || 0,
            curr_bill_10000: cashRegisterLog.curr_bill_10000 || 0,
            curr_bill_5000: cashRegisterLog.curr_bill_5000 || 0,
            curr_bill_1000: cashRegisterLog.curr_bill_1000 || 0,
            curr_coin_500: cashRegisterLog.curr_coin_500 || 0,
            curr_coin_100: cashRegisterLog.curr_coin_100 || 0,
            notes: cashRegisterLog.notes || ''
          })
        } else {
          setCashRegisterData({
            prev_bill_50000: 0, prev_bill_10000: 0, prev_bill_5000: 0, prev_bill_1000: 0, prev_coin_500: 0, prev_coin_100: 0,
            curr_bill_50000: 0, curr_bill_10000: 0, curr_bill_5000: 0, curr_bill_1000: 0, curr_coin_500: 0, curr_coin_100: 0,
            notes: ''
          })
        }

        setHasExistingData(true)
      } else {
        resetFormData()
        setHasExistingData(false)
        // 보고서가 없어도 리콜 데이터는 자동 동기화
        syncRecallData(date)
      }
      // 오버타임 식사 기록 로드 (클리닉/날짜당 1건)
      if (currentUser?.clinic_id) {
        try {
          const mealResult = await overtimeMealService.getByDate(currentUser.clinic_id, date)
          if (mealResult.data) {
            setOvertimeMealData({
              has_lunch: mealResult.data.has_lunch || false,
              lunch_overtime_minutes: mealResult.data.lunch_overtime_minutes || 0,
              has_dinner: mealResult.data.has_dinner || false,
              dinner_overtime_minutes: mealResult.data.dinner_overtime_minutes || 0,
              notes: mealResult.data.notes || '',
            })
          } else {
            setOvertimeMealData(defaultOvertimeMealData)
          }
        } catch (err) {
          console.error('[DailyInputForm] 오버타임 식사 기록 로드 실패:', err)
        }
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
  }, [currentUser?.clinic_id, resetFormData, syncRecallData])

  const handleDateChange = (newDate: string) => {
    if (newDate !== reportDate) {
      setReportDate(newDate)
    }
  }

  const handleDateShift = (days: number) => {
    const current = new Date(reportDate)
    current.setDate(current.getDate() + days)
    const shifted = current.toISOString().split('T')[0]
    handleDateChange(shifted)
  }

  const isToday = reportDate === getTodayString()

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

  // 실제 자동 새로고침 수행: Realtime 이벤트에 의해 호출됨
  // 한 트랜잭션의 분할 이벤트를 debounce로 묶고, 재로드 후 2초간 후속 이벤트를 무시한다.
  useEffect(() => {
    performAutoRefreshRef.current = async () => {
      if (isSavingRef.current || isRefreshingRef.current) return
      pendingExternalUpdateRef.current = false
      isRefreshingRef.current = true
      try {
        await loadDataForDate(reportDate)
      } finally {
        setTimeout(() => {
          isRefreshingRef.current = false
        }, 2000)
      }
    }
  }, [loadDataForDate, reportDate])

  // 폼 내부 입력 요소에 포커스가 있으면 사용자 입력 보호 차원에서 자동 반영 보류
  // 포커스가 폼 밖으로 빠져나갈 때 보류된 업데이트 반영
  useEffect(() => {
    const form = formRef.current
    if (!form) return
    const handleFocusOut = () => {
      // 포커스 이동 완료 후 판정 (다른 입력 요소로 이동한 경우 대기 유지)
      setTimeout(() => {
        const active = document.activeElement as HTMLElement | null
        const stillEditing = !!active && !!formRef.current?.contains(active)
          && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA'
              || active.tagName === 'SELECT' || active.isContentEditable)
        if (pendingExternalUpdateRef.current && !stillEditing) {
          performAutoRefreshRef.current?.()
        }
      }, 50)
    }
    form.addEventListener('focusout', handleFocusOut)
    return () => form.removeEventListener('focusout', handleFocusOut)
  }, [])

  // Realtime 구독: 다른 사용자의 변경사항 자동 반영
  useEffect(() => {
    if (!currentUser?.clinic_id || !reportDate) {
      return
    }

    const supabase = createClient()
    if (!supabase) {
      return
    }

    console.log('[DailyInputForm] Setting up Realtime subscription for date:', reportDate)

    // 분할 도착하는 Realtime 이벤트(한 트랜잭션의 다수 테이블/row 변경)를 debounce로 묶어 한 번에 반영
    const scheduleAutoRefresh = () => {
      if (autoRefreshTimerRef.current) {
        clearTimeout(autoRefreshTimerRef.current)
      }
      autoRefreshTimerRef.current = setTimeout(() => {
        autoRefreshTimerRef.current = null
        const active = document.activeElement as HTMLElement | null
        const isEditing = !!active && !!formRef.current?.contains(active)
          && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA'
              || active.tagName === 'SELECT' || active.isContentEditable)
        if (isEditing) {
          // 사용자가 입력 중이면 덮어쓰기 방지 - blur 시 반영
          pendingExternalUpdateRef.current = true
        } else {
          performAutoRefreshRef.current?.()
        }
      }, 800)
    }

    const handleExternalChange = (tableName: string, changedDate: string | undefined) => {
      if (isSavingRef.current || isRefreshingRef.current) return
      if (changedDate !== reportDate) return
      console.log(`[DailyInputForm] External update detected for ${tableName}`)
      scheduleAutoRefresh()
    }

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
          const newRecord = payload.new as { date?: string } | null
          const oldRecord = payload.old as { date?: string } | null
          handleExternalChange('daily_reports', newRecord?.date || oldRecord?.date)
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
          const newRecord = payload.new as { date?: string } | null
          const oldRecord = payload.old as { date?: string } | null
          handleExternalChange('consult_logs', newRecord?.date || oldRecord?.date)
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
          const newRecord = payload.new as { date?: string } | null
          const oldRecord = payload.old as { date?: string } | null
          handleExternalChange('gift_logs', newRecord?.date || oldRecord?.date)
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
          const newRecord = payload.new as { date?: string } | null
          const oldRecord = payload.old as { date?: string } | null
          handleExternalChange('happy_call_logs', newRecord?.date || oldRecord?.date)
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
          const newRecord = payload.new as { report_date?: string } | null
          const oldRecord = payload.old as { report_date?: string } | null
          handleExternalChange('special_notes_history', newRecord?.report_date || oldRecord?.report_date)
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'cash_register_logs',
          filter: `clinic_id=eq.${currentUser.clinic_id}`
        },
        (payload: { new: Record<string, unknown>; old: Record<string, unknown> }) => {
          const newRecord = payload.new as { date?: string } | null
          const oldRecord = payload.old as { date?: string } | null
          handleExternalChange('cash_register_logs', newRecord?.date || oldRecord?.date)
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
      if (autoRefreshTimerRef.current) {
        clearTimeout(autoRefreshTimerRef.current)
        autoRefreshTimerRef.current = null
      }
    }
  }, [currentUser?.clinic_id, reportDate])

  const handleSave = async (e?: React.MouseEvent) => {
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }

    // 이미 저장 중이면 중복 실행 방지
    if (loading || isSavingRef.current) {
      console.log('[DailyInputForm] handleSave skipped - already saving')
      return
    }

    if (!reportDate) {
      await appAlert('보고 일자를 선택해주세요.')
      return
    }

    setLoading(true)  // 저장 버튼 비활성화 (중복 클릭 방지)
    isSavingRef.current = true  // 자신의 저장 중에는 외부 변경 감지 무시
    pendingExternalUpdateRef.current = false  // 저장 시 보류된 외부 업데이트 초기화
    console.log(`[DailyInputForm] handleSave - Using ${USE_NEW_ARCHITECTURE ? 'NEW' : 'OLD'} architecture`)

    try {
      if (USE_NEW_ARCHITECTURE) {
        console.log('[DailyInputForm] Calling Server Action...')
        console.log('[DailyInputForm] giftRows before filter:', JSON.stringify(giftRows))
        console.log('[DailyInputForm] cashRegisterData before save:', JSON.stringify(cashRegisterData))

        const filteredConsultLogs = consultRows.filter(row => row.patient_name?.trim())
        const filteredGiftLogs = giftRows.filter(row => row.patient_name?.trim())
        console.log('[DailyInputForm] filteredGiftLogs:', JSON.stringify(filteredGiftLogs))
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
          giftLogs: filteredGiftLogs.map(row => {
            // 문자열이든 숫자든 상관없이 정수로 변환
            const qty = parseInt(String(row.quantity), 10) || 1
            console.log('[DailyInputForm] Mapping gift row:', {
              patient_name: row.patient_name,
              original_quantity: row.quantity,
              original_type: typeof row.quantity,
              mapped_quantity: qty
            })
            return {
              date: reportDate,
              patient_name: row.patient_name,
              gift_type: row.gift_type || '',
              quantity: qty,
              naver_review: row.naver_review,
              notes: row.notes || ''
            }
          }),
          happyCallLogs: filteredHappyCallLogs.map(row => ({
            date: reportDate,
            patient_name: row.patient_name,
            treatment: row.treatment || '',
            notes: row.notes || ''
          })),
          cashRegister: {
            prev_bill_50000: cashRegisterData.prev_bill_50000,
            prev_bill_10000: cashRegisterData.prev_bill_10000,
            prev_bill_5000: cashRegisterData.prev_bill_5000,
            prev_bill_1000: cashRegisterData.prev_bill_1000,
            prev_coin_500: cashRegisterData.prev_coin_500,
            prev_coin_100: cashRegisterData.prev_coin_100,
            curr_bill_50000: cashRegisterData.curr_bill_50000,
            curr_bill_10000: cashRegisterData.curr_bill_10000,
            curr_bill_5000: cashRegisterData.curr_bill_5000,
            curr_bill_1000: cashRegisterData.curr_bill_1000,
            curr_coin_500: cashRegisterData.curr_coin_500,
            curr_coin_100: cashRegisterData.curr_coin_100,
            notes: cashRegisterData.notes
          }
        })

        if (!result.success) {
          console.error('[DailyInputForm] Server Action failed:', result.error)
          throw new Error(result.error || '저장에 실패했습니다.')
        }

        console.log('[DailyInputForm] Server Action succeeded:', result)

        // 오버타임 식사 기록 저장
        if (currentUser?.clinic_id && currentUser?.id) {
          try {
            await overtimeMealService.save(currentUser.clinic_id, reportDate, overtimeMealData, currentUser.id)
            console.log('[DailyInputForm] Overtime meal logs saved')
          } catch (err) {
            console.error('[DailyInputForm] Overtime meal save error:', err)
          }
        }

        await appAlert('보고서가 성공적으로 저장되었습니다.')
        // 저장 성공 후 부모에게 알려서 데이터 새로고침
        onSaveSuccess?.()
      } else {
        console.log('[DailyInputForm] Using legacy onSaveReport...')
        console.log('[DailyInputForm] cashRegisterData:', JSON.stringify(cashRegisterData))

        await onSaveReport({
          date: reportDate,
          consultRows,
          giftRows,
          happyCallRows,
          recallCount,
          recallBookingCount,
          recallBookingNames,
          specialNotes,
          cashRegisterData
        })

        // 오버타임 식사 기록 저장
        if (currentUser?.clinic_id && currentUser?.id) {
          try {
            await overtimeMealService.save(currentUser.clinic_id, reportDate, overtimeMealData, currentUser.id)
            console.log('[DailyInputForm] Overtime meal logs saved (legacy)')
          } catch (err) {
            console.error('[DailyInputForm] Overtime meal save error:', err)
          }
        }

        // 레거시 아키텍처에서도 저장 성공 후 부모에게 알려서 데이터 새로고침
        onSaveSuccess?.()
      }

      setHasExistingData(true)
    } catch (error) {
      console.error('[DailyInputForm] Save error:', error)
      const errorMessage = error instanceof Error ? error.message : '보고서 저장 중 오류가 발생했습니다.'
      await appAlert(errorMessage + ' 다시 시도해주세요.')
    } finally {
      setLoading(false)
      // 저장 완료 후 약간의 지연을 두고 플래그 해제 (Realtime 이벤트 무시 기간)
      setTimeout(() => {
        isSavingRef.current = false
      }, 2000)
    }
  }

  const resetForm = async () => {
    const confirmed = await appConfirm('입력된 모든 내용이 초기화됩니다. 계속하시겠습니까?')
    if (!confirmed) return
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
      // 이미 저장 중이면 중복 실행 방지
      if (loading || isSavingRef.current) {
        console.log('[DailyInputForm] handleSaveAndNavigateToLogs skipped - already saving')
        return
      }

      // 데이터가 있으면 저장 먼저 수행
      setLoading(true)
      isSavingRef.current = true
      pendingExternalUpdateRef.current = false

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
            giftLogs: filteredGiftLogs.map(row => {
              // 문자열이든 숫자든 상관없이 정수로 변환
              const qty = parseInt(String(row.quantity), 10) || 1
              return {
                date: reportDate,
                patient_name: row.patient_name,
                gift_type: row.gift_type || '',
                quantity: qty,
                naver_review: row.naver_review,
                notes: row.notes || ''
              }
            }),
            happyCallLogs: filteredHappyCallLogs.map(row => ({
              date: reportDate,
              patient_name: row.patient_name,
              treatment: row.treatment || '',
              notes: row.notes || ''
            })),
            cashRegister: {
              prev_bill_50000: cashRegisterData.prev_bill_50000,
              prev_bill_10000: cashRegisterData.prev_bill_10000,
              prev_bill_5000: cashRegisterData.prev_bill_5000,
              prev_bill_1000: cashRegisterData.prev_bill_1000,
              prev_coin_500: cashRegisterData.prev_coin_500,
              prev_coin_100: cashRegisterData.prev_coin_100,
              curr_bill_50000: cashRegisterData.curr_bill_50000,
              curr_bill_10000: cashRegisterData.curr_bill_10000,
              curr_bill_5000: cashRegisterData.curr_bill_5000,
              curr_bill_1000: cashRegisterData.curr_bill_1000,
              curr_coin_500: cashRegisterData.curr_coin_500,
              curr_coin_100: cashRegisterData.curr_coin_100,
              notes: cashRegisterData.notes
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
            specialNotes,
            cashRegisterData
          })
          onSaveSuccess?.()
        }

        // 오버타임 식사 기록 저장
        if (currentUser?.clinic_id && currentUser?.id) {
          try {
            await overtimeMealService.save(currentUser.clinic_id, reportDate, overtimeMealData, currentUser.id)
          } catch (err) {
            console.error('[DailyInputForm] Overtime meal save error:', err)
          }
        }

        setHasExistingData(true)
      } catch (error) {
        console.error('[DailyInputForm] Save before navigate error:', error)
        const errorMessage = error instanceof Error ? error.message : '저장 중 오류가 발생했습니다.'
        await appAlert(errorMessage + ' 페이지 이동을 취소합니다.')
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
    <div className="flex items-center space-x-2 sm:space-x-3 pb-2 sm:pb-3 mb-3 sm:mb-4 border-b border-at-border">
      <div className="flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-at-accent-light text-at-accent">
        <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
      </div>
      <h3 className="text-sm sm:text-base font-semibold text-at-text">
        <span className="text-at-accent mr-1">{number}.</span>
        {title}
      </h3>
    </div>
  )

  return (
    <div ref={formRef} className="p-4 sm:p-6 space-y-6 bg-white min-h-screen">
      {/* 보고서 헤더 */}
      <div className="flex items-center justify-between pb-4 border-b border-at-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-at-accent-light rounded-lg flex items-center justify-center">
            <FileText className="w-4 h-4 text-at-accent" />
          </div>
          <h2 className="text-lg font-bold text-at-text">일일 업무 보고서</h2>
        </div>
        <div className="flex items-center space-x-2">
          {loading && (
            <span className="px-2 sm:px-3 py-1 bg-at-surface-alt rounded-full text-at-text-weak text-xs">
              로딩 중...
            </span>
          )}
          {hasExistingData && !loading && (
            <span className="px-2 sm:px-3 py-1 bg-at-success-bg rounded-full text-at-success text-xs">
              기존 데이터
            </span>
          )}
        </div>
      </div>

      {/* 보고서 본문 */}
      <div className="space-y-4 sm:space-y-6">
        {/* 기본 정보 */}
        <div>
          <SectionHeader number={1} title="기본 정보" icon={Calendar} />
          <div>
            <label htmlFor="report-date" className="block text-sm font-medium text-at-text mb-1.5">
              보고 일자
            </label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => handleDateShift(-1)}
                disabled={loading}
                className="flex items-center justify-center w-9 h-9 border border-at-border rounded-xl text-at-text-weak hover:text-at-text hover:bg-at-surface-alt transition-colors disabled:opacity-40"
                title="이전 날"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <input
                type="date"
                id="report-date"
                className="px-3 py-2 border border-at-border rounded-xl focus:ring-2 focus:ring-at-accent focus:border-at-accent transition-colors"
                value={reportDate}
                onChange={(e) => handleDateChange(e.target.value)}
                disabled={loading || !canCreate}
              />
              <button
                type="button"
                onClick={() => handleDateShift(1)}
                disabled={loading || isToday}
                className="flex items-center justify-center w-9 h-9 border border-at-border rounded-xl text-at-text-weak hover:text-at-text hover:bg-at-surface-alt transition-colors disabled:opacity-40"
                title="다음 날"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              {!isToday && (
                <button
                  type="button"
                  onClick={() => handleDateChange(getTodayString())}
                  disabled={loading}
                  className="px-3 py-2 text-sm font-medium text-at-accent bg-at-accent-light hover:bg-at-tag border border-at-border rounded-xl transition-colors disabled:opacity-40"
                >
                  오늘
                </button>
              )}
            </div>
          </div>
        </div>

        {/* 상담 결과 */}
        <div>
          <div className="flex items-center justify-between pb-2 sm:pb-3 mb-3 sm:mb-4 border-b border-at-border">
            <div className="flex items-center space-x-2 sm:space-x-3">
              <div className="flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-at-accent-light text-at-accent">
                <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </div>
              <h3 className="text-sm sm:text-base font-semibold text-at-text">
                <span className="text-at-accent mr-1">2.</span>
                환자 상담 결과
              </h3>
            </div>
            <button
              type="button"
              onClick={handleSaveAndNavigateToLogs}
              disabled={loading}
              className="inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-medium text-at-accent bg-at-accent-light hover:bg-at-tag border border-at-border rounded-xl transition-colors group disabled:opacity-50 disabled:cursor-not-allowed"
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

        {/* 리콜 결과 (자동 동기화) */}
        <div>
          <div className="flex items-center justify-between pb-2 sm:pb-3 mb-3 sm:mb-4 border-b border-at-border">
            <div className="flex items-center space-x-2 sm:space-x-3">
              <div className="flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-at-accent-light text-at-accent">
                <Phone className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </div>
              <h3 className="text-sm sm:text-base font-semibold text-at-text">
                <span className="text-at-accent mr-1">3.</span>
                환자 리콜 결과
              </h3>
              {recallSynced && (
                <span className="inline-flex items-center px-2 py-0.5 text-xs font-medium bg-at-success-bg text-at-success rounded-full">
                  자동 연동
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={() => syncRecallData(reportDate)}
              disabled={recallSyncing}
              className="inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-medium text-at-accent bg-at-accent-light hover:bg-at-tag border border-at-border rounded-xl transition-colors group disabled:opacity-50"
              title="리콜 데이터 새로고침"
            >
              <RefreshCw className={`w-3 h-3 sm:w-3.5 sm:h-3.5 ${recallSyncing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">새로고침</span>
            </button>
          </div>

          {/* 요약 카드 */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div className="bg-at-surface-alt rounded-xl p-3 text-center">
              <div className="text-2xl font-bold text-at-text">{recallCount}</div>
              <div className="text-xs text-at-text mt-0.5">리콜 처리 건수</div>
            </div>
            <div className="bg-at-success-bg rounded-xl p-3 text-center">
              <div className="text-2xl font-bold text-at-success">{recallBookingCount}</div>
              <div className="text-xs text-at-text mt-0.5">예약 성공</div>
            </div>
            <div className="bg-at-accent-light rounded-xl p-3 text-center">
              <div className="text-2xl font-bold text-at-accent">
                {recallCount > 0 ? Math.round((recallBookingCount / recallCount) * 100) : 0}%
              </div>
              <div className="text-xs text-at-text mt-0.5">예약 성공률</div>
            </div>
          </div>

          {/* 예약 성공 환자 */}
          {recallBookingNames && (
            <div className="mb-4 p-3 bg-at-success-bg border border-green-200 rounded-xl">
              <div className="text-xs font-medium text-at-success mb-1">예약 성공 환자</div>
              <div className="text-sm text-green-800">{recallBookingNames}</div>
            </div>
          )}

          {/* 일별 리콜 상세 기록 토글 */}
          {recallPatients.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setShowRecallLog(!showRecallLog)}
                className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium text-at-text bg-at-surface-alt hover:bg-at-surface-hover border border-at-border rounded-xl transition-colors"
              >
                <span>리콜 상세 기록 ({recallPatients.length}건)</span>
                <svg
                  className={`w-4 h-4 transition-transform ${showRecallLog ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {showRecallLog && (
                <div className="mt-2 border border-at-border rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-at-surface-alt">
                      <tr>
                        <th className="px-3 py-2 text-left text-xs font-medium text-at-text-weak uppercase tracking-wider">환자명</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-at-text-weak uppercase tracking-wider">전화번호</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-at-text-weak uppercase tracking-wider">상태</th>
                        <th className="px-3 py-2 text-left text-xs font-medium text-at-text hidden sm:table-cell">처리시간</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-at-border">
                      {recallPatients.map((patient, idx) => (
                        <tr key={patient.id || idx} className="hover:bg-at-surface-alt">
                          <td className="px-3 py-2 font-medium text-at-text">{patient.patient_name}</td>
                          <td className="px-3 py-2 text-at-text">{patient.phone_number}</td>
                          <td className="px-3 py-2">
                            <span className={`inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full ${RECALL_STATUS_COLORS[patient.status] || 'bg-at-surface-alt text-at-text-secondary'}`}>
                              {RECALL_STATUS_LABELS[patient.status] || patient.status}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-at-text text-xs hidden sm:table-cell">
                            {patient.recall_datetime
                              ? new Date(patient.recall_datetime).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })
                              : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {recallPatients.length === 0 && !recallSyncing && (
            <div className="text-center py-8 space-y-2">
              <div className="text-at-text-weak opacity-40">
                <PhoneOff className="w-8 h-8 mx-auto" />
              </div>
              <p className="text-sm text-at-text-secondary">이 날짜에 처리된 리콜 기록이 없습니다.</p>
            </div>
          )}

          {recallSyncing && (
            <div className="text-center py-8 space-y-2">
              <p className="text-sm text-at-text-secondary">리콜 데이터 불러오는 중...</p>
            </div>
          )}
        </div>

        {/* 선물/리뷰 관리 */}
        <div>
          <div className="flex items-center justify-between pb-2 sm:pb-3 mb-3 sm:mb-4 border-b border-at-border">
            <div className="flex items-center space-x-2 sm:space-x-3">
              <div className="flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-at-accent-light text-at-accent">
                <Gift className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              </div>
              <h3 className="text-sm sm:text-base font-semibold text-at-text">
                <span className="text-at-accent mr-1">4.</span>
                선물 및 리뷰 관리
              </h3>
            </div>
            <button
              type="button"
              onClick={() => router.push('/dashboard?tab=settings')}
              className="inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 text-xs sm:text-sm font-medium text-at-accent bg-at-accent-light hover:bg-at-tag border border-at-border rounded-xl transition-colors group"
              title="재고 관리 페이지로 이동"
            >
              <Package className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              <span className="hidden sm:inline">재고 관리</span>
              <span className="sm:hidden">재고</span>
              <ExternalLink className="w-3 h-3 sm:w-3.5 sm:h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
            </button>
          </div>
          <GiftTable
            giftRows={giftRows}
            onGiftRowsChange={setGiftRows}
            giftInventory={giftInventory}
            giftCategories={giftCategories}
            giftLogs={giftLogs}
            baseUsageByGift={baseUsageByGift}
            currentDate={reportDate}
            isReadOnly={isReadOnly}
          />
        </div>

        {/* 해피콜 결과 */}
        <div>
          <SectionHeader number={5} title="해피콜 결과" icon={HeartHandshake} />
          <HappyCallTable
            happyCallRows={happyCallRows}
            onHappyCallRowsChange={setHappyCallRows}
            isReadOnly={isReadOnly}
          />
        </div>

        {/* 일일 현금 출납 */}
        <div>
          <SectionHeader number={6} title="일일 현금 출납" icon={Banknote} />
          <CashRegisterTable
            cashRegisterData={cashRegisterData}
            onCashRegisterDataChange={setCashRegisterData}
            isReadOnly={isReadOnly}
          />
        </div>

        {/* 점심/저녁/오버타임 기록 */}
        {currentUser?.clinic_id && (
          <div>
            <SectionHeader number={7} title="점심/저녁 초과근무" icon={Clock} />
            <OvertimeMealTable
              clinicId={currentUser.clinic_id}
              date={reportDate}
              isReadOnly={isReadOnly}
              data={overtimeMealData}
              onDataChange={setOvertimeMealData}
            />
          </div>
        )}

        {/* 기타 특이사항 */}
        <div>
          <SectionHeader number={8} title="기타 특이사항" icon={FileText} />
          <div>
            <label htmlFor="special-notes" className="block text-sm font-medium text-at-text mb-1.5">
              기타 특이사항
            </label>
            <textarea
              id="special-notes"
              rows={3}
              className={`w-full px-3 py-2 border border-at-border rounded-xl focus:ring-2 focus:ring-at-accent focus:border-at-accent transition-colors resize-none ${isReadOnly ? 'bg-at-surface-alt text-at-text-secondary cursor-not-allowed' : 'bg-white'}`}
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
        <div className="sticky bottom-0 z-10 px-4 sm:px-6 py-3 sm:py-4 bg-white/95 backdrop-blur-sm border-t border-at-border flex flex-col sm:flex-row justify-end gap-2 sm:gap-3 shadow-[0_-2px_8px_rgba(0,0,0,0.06)]">
          <button
            type="button"
            onClick={resetForm}
            className="inline-flex items-center justify-center px-4 py-2.5 sm:py-2 border border-at-border rounded-xl text-sm font-medium text-at-text bg-white hover:bg-at-surface-alt transition-colors disabled:opacity-50 order-2 sm:order-1"
            disabled={isReadOnly}
          >
            <RotateCcw className="w-4 h-4 mr-2" />
            초기화
          </button>
          <button
            type="button"
            onClick={(e) => handleSave(e)}
            className="inline-flex items-center justify-center px-5 py-2.5 sm:py-2 bg-at-accent hover:bg-at-accent-hover text-white font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed order-1 sm:order-2"
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
