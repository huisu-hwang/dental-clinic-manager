'use client'

import { useState, useEffect, useCallback } from 'react'
import ConsultTable from './ConsultTable'
import GiftTable from './GiftTable'
import HappyCallTable from './HappyCallTable'
import { getTodayString } from '@/utils/dateUtils'
import { dataService } from '@/lib/dataService'
import { saveDailyReport } from '@/app/actions/dailyReport'
import type { ConsultRowData, GiftRowData, HappyCallRowData, GiftInventory } from '@/types'
import type { UserProfile } from '@/contexts/AuthContext'

// Feature Flag: 신규 아키텍처 사용 여부
const USE_NEW_ARCHITECTURE = process.env.NEXT_PUBLIC_USE_NEW_DAILY_REPORT === 'true'

interface DailyInputFormProps {
  giftInventory: GiftInventory[]
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
  canCreate: boolean
  canEdit: boolean
  currentUser?: UserProfile
}

export default function DailyInputForm({ giftInventory, onSaveReport, canCreate, canEdit, currentUser }: DailyInputFormProps) {
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
  const [loading, setLoading] = useState(false)
  const [hasExistingData, setHasExistingData] = useState(false)
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
    setHasExistingData(false) // 로딩 시작 시 초기화

    // 타임아웃 설정 (10초 - Connection Timeout 복구 시간 고려)
    const timeoutId = setTimeout(() => {
      console.log('[DailyInputForm] Load timeout - forcing loading to false')
      setLoading(false)
    }, 10000)

    try {
      console.log('[DailyInputForm] Calling dataService.getReportByDate...')
      // currentUser가 있으면 clinic_id를 전달, 없으면 내부에서 getCurrentClinicId() 호출
      const result = currentUser?.clinic_id
        ? await dataService.getReportByDate(currentUser.clinic_id, date)
        : await dataService.getReportByDate(date)
      console.log('[DailyInputForm] Result received:', result)
      
      if (result.success && result.data.hasData) {
        const { dailyReport, consultLogs, giftLogs, happyCallLogs } = result.data
        
        // 기존 데이터로 폼 채우기
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
        
        // 상담 로그 데이터 로드 (최소 1개 빈 행 보장)
        if (consultLogs.length > 0) {
          setConsultRows(consultLogs.map(log => ({
            patient_name: typeof log.patient_name === 'string' ? log.patient_name : '',
            consult_content: typeof log.consult_content === 'string' ? log.consult_content : '',
            consult_status: (log.consult_status as 'O' | 'X') || 'O',
            remarks: typeof log.remarks === 'string' ? log.remarks : '' // remarks 필드 데이터베이스에서 로드
          })))
        } else {
          setConsultRows([{ patient_name: '', consult_content: '', consult_status: 'O', remarks: '' }])
        }

        // 선물 로그 데이터 로드 (최소 1개 빈 행 보장)
        if (giftLogs.length > 0) {
          setGiftRows(giftLogs.map(log => ({
            patient_name: typeof log.patient_name === 'string' ? log.patient_name : '',
            gift_type: typeof log.gift_type === 'string' ? log.gift_type : '없음',
            quantity: 1, // 기존 데이터는 기본값 1로 설정
            naver_review: (log.naver_review as 'O' | 'X') || 'X',
            notes: typeof log.notes === 'string' ? log.notes : '' // notes 필드 데이터베이스에서 로드
          })))
        } else {
          setGiftRows([{ patient_name: '', gift_type: '없음', quantity: 1, naver_review: 'X', notes: '' }])
        }

        // 해피콜 로그 데이터 로드 (최소 1개 빈 행 보장)
        if (happyCallLogs.length > 0) {
          setHappyCallRows(happyCallLogs.map(log => ({
            patient_name: typeof log.patient_name === 'string' ? log.patient_name : '',
            treatment: typeof log.treatment === 'string' ? log.treatment : '',
            notes: typeof log.notes === 'string' ? log.notes : ''
          })))
        } else {
          setHappyCallRows([{ patient_name: '', treatment: '', notes: '' }])
        }
        
        setHasExistingData(true)
      } else {
        // 기존 데이터가 없으면 빈 폼으로 리셋
        resetFormData()
        setHasExistingData(false)
      }
    } catch (error) {
      console.error('[DailyInputForm] 데이터 로드 실패:', error)
      resetFormData()
      setHasExistingData(false)
    } finally {
      // 타임아웃 클리어
      clearTimeout(timeoutId)
      // 로딩 상태를 항상 false로 설정
      console.log('[DailyInputForm] Setting loading to false')
      setLoading(false)
    }
  }, [currentUser?.clinic_id, resetFormData])

  // 날짜 변경 핸들러
  const handleDateChange = (newDate: string) => {
    if (newDate !== reportDate) {
      setReportDate(newDate)
      // loadDataForDate는 useEffect에서 처리
    }
  }

  // 컴포넌트 마운트 시 또는 날짜 변경 시 데이터 로드
  useEffect(() => {
    if (!currentUser?.clinic_id) {
      console.log('[DailyInputForm] No user/clinic_id, skipping data load')
      setLoading(false)
      return
    }
    console.log('[DailyInputForm] Loading data for date:', reportDate)
    loadDataForDate(reportDate)
  }, [reportDate, loadDataForDate, currentUser?.clinic_id]) // reportDate가 변경될 때마다 실행

  useEffect(() => {
    if (!currentUser?.clinic_id) {
      return
    }

    console.log('[DailyInputForm] Detected clinic change, reloading data for', reportDate)
    loadDataForDate(reportDate)
  }, [currentUser?.clinic_id, loadDataForDate, reportDate])

  const handleSave = async (e?: React.MouseEvent) => {
    // 이벤트 버블링 방지
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }

    if (!reportDate) {
      alert('보고 일자를 선택해주세요.')
      return
    }

    setLoading(true)
    console.log(`[DailyInputForm] handleSave - Using ${USE_NEW_ARCHITECTURE ? 'NEW' : 'OLD'} architecture`)

    try {
      if (USE_NEW_ARCHITECTURE) {
        // ============================================================
        // 신규 아키텍처: Server Action 직접 호출
        // ============================================================
        console.log('[DailyInputForm] Calling Server Action...')

        // 빈 데이터 필터링
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
            naver_review: row.naver_review,
            notes: row.notes || ''
          })),
          happyCallLogs: filteredHappyCallLogs.map(row => ({
            date: reportDate,
            patient_name: row.patient_name,
            treatment: row.treatment || '',
            notes: row.notes || ''
          }))
        })

        if (!result.success) {
          console.error('[DailyInputForm] Server Action failed:', result.error)
          throw new Error(result.error || '저장에 실패했습니다.')
        }

        console.log('[DailyInputForm] Server Action succeeded:', result)
        alert('보고서가 성공적으로 저장되었습니다.')
      } else {
        // ============================================================
        // 기존 아키텍처: onSaveReport prop 사용
        // ============================================================
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
      }

      // 저장 성공 후 기존 데이터가 있다고 표시
      setHasExistingData(true)
    } catch (error) {
      console.error('[DailyInputForm] Save error:', error)
      const errorMessage = error instanceof Error ? error.message : '보고서 저장 중 오류가 발생했습니다.'
      alert(errorMessage + ' 다시 시도해주세요.')
    } finally {
      setLoading(false)
    }
  }

  const resetForm = () => {
    const today = getTodayString()
    setReportDate(today)
    handleDateChange(today)
  }

  return (
    <div className="space-y-8">
      {/* 기본 정보 */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
        <h2 className="text-xl font-bold mb-4 border-b pb-3">[기본 정보]</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="report-date" className="block text-sm font-medium text-slate-700 mb-1">
              보고 일자
              {loading && <span className="ml-2 text-blue-500 text-xs">(데이터 로딩 중...)</span>}
              {hasExistingData && !loading && <span className="ml-2 text-green-600 text-xs">(기존 데이터 로드됨)</span>}
            </label>
            <input
              type="date"
              id="report-date"
              className="w-full p-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
              value={reportDate}
              onChange={(e) => handleDateChange(e.target.value)}
              disabled={loading || !canCreate}
            />
          </div>
        </div>
      </div>

      {/* 상담 결과 */}
      <ConsultTable 
        consultRows={consultRows}
        onConsultRowsChange={setConsultRows}
        isReadOnly={isReadOnly}
      />

      {/* 리콜 결과 */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
        <h2 className="text-xl font-bold mb-4 border-b pb-3">[2] 환자 리콜 결과</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">리콜 건수</label>
            <input
              type="number"
              min="0"
              value={recallCount}
              onChange={(e) => setRecallCount(parseInt(e.target.value) || 0)}
              className="w-full p-2 border border-slate-300 rounded-md"
              readOnly={isReadOnly}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">예약 수</label>
            <input
              type="number"
              min="0"
              value={recallBookingCount}
              onChange={(e) => setRecallBookingCount(parseInt(e.target.value) || 0)}
              className="w-full p-2 border border-slate-300 rounded-md"
              readOnly={isReadOnly}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">예약 성공 환자 명</label>
            <input
              type="text"
              value={recallBookingNames}
              onChange={(e) => setRecallBookingNames(e.target.value)}
              className="w-full p-2 border border-slate-300 rounded-md"
              placeholder="예: 홍길동, 김철수, 이영희"
              readOnly={isReadOnly}
            />
          </div>
        </div>
      </div>

      {/* 선물/리뷰 관리 */}
      <GiftTable
        giftRows={giftRows}
        onGiftRowsChange={setGiftRows}
        giftInventory={giftInventory}
        isReadOnly={isReadOnly}
      />

      {/* 해피콜 결과 */}
      <HappyCallTable
        happyCallRows={happyCallRows}
        onHappyCallRowsChange={setHappyCallRows}
        isReadOnly={isReadOnly}
      />

      {/* 기타 특이사항 */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
        <h2 className="text-xl font-bold mb-4 border-b pb-3">[5] 기타 특이사항</h2>
        <div>
          <label htmlFor="special-notes" className="block text-sm font-medium text-slate-700 mb-2">
            특이사항 내용
          </label>
          <textarea
            id="special-notes"
            rows={4}
            className="w-full p-3 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500 resize-vertical"
            placeholder="오늘 업무 중 특이사항이나 기록할 내용이 있다면 작성해주세요. (선택사항)"
            value={specialNotes}
            onChange={(e) => setSpecialNotes(e.target.value)}
            readOnly={isReadOnly}
          />
          <p className="mt-1 text-sm text-slate-500">
            예: 장비 점검, 직원 교육, 특별한 환자 케이스, 업무 변경사항 등
          </p>
        </div>
      </div>

      {/* 저장 버튼 */}
      {(canCreate || canEdit) && (
        <div className="flex justify-end space-x-4">
          <button
            type="button"
            onClick={resetForm}
            className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-3 px-6 rounded-lg shadow-md transition-transform transform hover:scale-105"
            disabled={isReadOnly}
          >
            초기화
          </button>
          <button
            type="button"
            onClick={(e) => handleSave(e)}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg shadow-md transition-transform transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={loading || isReadOnly}
          >
            {loading ? '저장 중...' : (hasExistingData ? '수정하기' : '저장하기')}
          </button>
        </div>
      )}
    </div>
  )
}