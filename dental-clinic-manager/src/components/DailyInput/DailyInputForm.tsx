'use client'

import { useState, useEffect } from 'react'
import ConsultTable from './ConsultTable'
import GiftTable from './GiftTable'
import HappyCallTable from './HappyCallTable'
import { getTodayString } from '@/utils/dateUtils'
import { dataService } from '@/lib/dataService'
import type { ConsultRowData, GiftRowData, HappyCallRowData, GiftInventory } from '@/types'

interface DailyInputFormProps {
  giftInventory: GiftInventory[]
  onSaveReport: (data: {
    date: string
    consultRows: ConsultRowData[]
    giftRows: GiftRowData[]
    happyCallRows: HappyCallRowData[]
    recallCount: number
    recallBookingCount: number
    specialNotes: string
  }) => void
}

export default function DailyInputForm({ giftInventory, onSaveReport }: DailyInputFormProps) {
  const [reportDate, setReportDate] = useState(getTodayString())
  const [consultRows, setConsultRows] = useState<ConsultRowData[]>([
    { patient_name: '', consult_content: '', consult_status: 'O', remarks: '' }
  ])
  const [giftRows, setGiftRows] = useState<GiftRowData[]>([
    { patient_name: '', gift_type: '없음', naver_review: 'X', notes: '' }
  ])
  const [happyCallRows, setHappyCallRows] = useState<HappyCallRowData[]>([
    { patient_name: '', treatment: '', notes: '' }
  ])
  const [recallCount, setRecallCount] = useState(0)
  const [recallBookingCount, setRecallBookingCount] = useState(0)
  const [specialNotes, setSpecialNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [hasExistingData, setHasExistingData] = useState(false)

  // 날짜별 데이터 로드
  const loadDataForDate = async (date: string) => {
    if (!date) return
    
    setLoading(true)
    try {
      const result = await dataService.getReportByDate(date)
      
      if (result.success && result.data.hasData) {
        const { dailyReport, consultLogs, giftLogs, happyCallLogs } = result.data
        
        // 기존 데이터로 폼 채우기
        if (dailyReport) {
          setRecallCount(dailyReport.recall_count || 0)
          setRecallBookingCount(dailyReport.recall_booking_count || 0)
          setSpecialNotes(dailyReport.special_notes || '')
        }
        
        // 상담 로그 데이터 로드 (최소 1개 빈 행 보장)
        if (consultLogs.length > 0) {
          setConsultRows(consultLogs.map(log => ({
            patient_name: log.patient_name || '',
            consult_content: log.consult_content || '',
            consult_status: (log.consult_status as 'O' | 'X') || 'O',
            remarks: log.remarks || ''
          })))
        } else {
          setConsultRows([{ patient_name: '', consult_content: '', consult_status: 'O', remarks: '' }])
        }
        
        // 선물 로그 데이터 로드 (최소 1개 빈 행 보장)
        if (giftLogs.length > 0) {
          setGiftRows(giftLogs.map(log => ({
            patient_name: log.patient_name || '',
            gift_type: log.gift_type || '없음',
            naver_review: (log.naver_review as 'O' | 'X') || 'X',
            notes: log.notes || ''
          })))
        } else {
          setGiftRows([{ patient_name: '', gift_type: '없음', naver_review: 'X', notes: '' }])
        }
        
        // 해피콜 로그 데이터 로드 (최소 1개 빈 행 보장)
        if (happyCallLogs.length > 0) {
          setHappyCallRows(happyCallLogs.map(log => ({
            patient_name: log.patient_name || '',
            treatment: log.treatment || '',
            notes: log.notes || ''
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
      console.error('데이터 로드 실패:', error)
      resetFormData()
      setHasExistingData(false)
    } finally {
      setLoading(false)
    }
  }

  // 폼 데이터 리셋
  const resetFormData = () => {
    setConsultRows([{ patient_name: '', consult_content: '', consult_status: 'O', remarks: '' }])
    setGiftRows([{ patient_name: '', gift_type: '없음', naver_review: 'X', notes: '' }])
    setHappyCallRows([{ patient_name: '', treatment: '', notes: '' }])
    setRecallCount(0)
    setRecallBookingCount(0)
    setSpecialNotes('')
  }

  // 날짜 변경 핸들러
  const handleDateChange = (newDate: string) => {
    setReportDate(newDate)
    loadDataForDate(newDate)
  }

  // 컴포넌트 마운트 시 오늘 날짜 데이터 로드
  useEffect(() => {
    loadDataForDate(reportDate)
  }, [])

  const handleSave = () => {
    if (!reportDate) {
      alert('보고 일자를 선택해주세요.')
      return
    }

    onSaveReport({
      date: reportDate,
      consultRows,
      giftRows,
      happyCallRows,
      recallCount,
      recallBookingCount,
      specialNotes
    })
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
              disabled={loading}
            />
          </div>
        </div>
      </div>

      {/* 상담 결과 */}
      <ConsultTable 
        consultRows={consultRows}
        onConsultRowsChange={setConsultRows}
      />

      {/* 리콜 결과 */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
        <h2 className="text-xl font-bold mb-4 border-b pb-3">[2] 환자 리콜 결과</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">리콜 건수</label>
            <input
              type="number"
              min="0"
              value={recallCount}
              onChange={(e) => setRecallCount(parseInt(e.target.value) || 0)}
              className="w-full p-2 border border-slate-300 rounded-md"
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
            />
          </div>
        </div>
      </div>

      {/* 선물/리뷰 관리 */}
      <GiftTable
        giftRows={giftRows}
        onGiftRowsChange={setGiftRows}
        giftInventory={giftInventory}
      />

      {/* 해피콜 결과 */}
      <HappyCallTable
        happyCallRows={happyCallRows}
        onHappyCallRowsChange={setHappyCallRows}
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
          />
          <p className="mt-1 text-sm text-slate-500">
            예: 장비 점검, 직원 교육, 특별한 환자 케이스, 업무 변경사항 등
          </p>
        </div>
      </div>

      {/* 저장 버튼 */}
      <div className="flex justify-end space-x-4">
        <button
          onClick={resetForm}
          className="bg-gray-500 hover:bg-gray-600 text-white font-bold py-3 px-6 rounded-lg shadow-md transition-transform transform hover:scale-105"
        >
          초기화
        </button>
        <button
          onClick={handleSave}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg shadow-md transition-transform transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed"
          disabled={loading}
        >
          {loading ? '로딩 중...' : hasExistingData ? '보고서 수정하기' : '보고서 저장하기'}
        </button>
      </div>
    </div>
  )
}