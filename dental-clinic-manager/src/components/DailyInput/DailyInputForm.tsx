'use client'

import { useState, useEffect, useCallback } from 'react'
import { Calendar, Users, Phone, Gift, FileText, Save, RotateCcw } from 'lucide-react'
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
            quantity: 1,
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

  useEffect(() => {
    if (!currentUser?.clinic_id) {
      return
    }

    console.log('[DailyInputForm] Detected clinic change, reloading data for', reportDate)
    loadDataForDate(reportDate)
  }, [currentUser?.clinic_id, loadDataForDate, reportDate])

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
          <SectionHeader number={2} title="환자 상담 결과" icon={Users} />
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

        {/* 기타 특이사항 */}
        <div>
          <SectionHeader number={6} title="기타 특이사항" icon={FileText} />
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
