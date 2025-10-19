'use client'

import { useState } from 'react'
import type { DailyReport, ConsultLog, GiftLog, InventoryLog } from '@/types'

interface LogsSectionProps {
  dailyReports: DailyReport[]
  consultLogs: ConsultLog[]
  giftLogs: GiftLog[]
  inventoryLogs: InventoryLog[]
  onDeleteReport: (date: string) => void
  onRecalculateStats?: (date: string) => void
  canDelete: boolean
}

export default function LogsSection({
  dailyReports,
  consultLogs,
  giftLogs,
  inventoryLogs,
  onDeleteReport,
  onRecalculateStats,
  canDelete
}: LogsSectionProps) {
  const [consultFilter, setConsultFilter] = useState<'all' | 'completed' | 'incomplete'>('all')
  const [giftSort, setGiftSort] = useState<'default' | 'type' | 'date'>('default')

  const filteredConsultLogs = consultLogs.filter(log => {
    if (consultFilter === 'all') return true
    if (consultFilter === 'completed') return log.consult_status === 'O'
    if (consultFilter === 'incomplete') return log.consult_status === 'X'
    return true
  })

  const sortedGiftLogs = [...giftLogs].sort((a, b) => {
    if (giftSort === 'type') {
      return a.gift_type.localeCompare(b.gift_type)
    }
    if (giftSort === 'date') {
      return b.date.localeCompare(a.date)
    }
    return 0
  })

  return (
    <div className="space-y-6">
      {/* 일일 보고 종합 기록 */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">일일 보고 종합 기록</h2>
        </div>
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-100 text-slate-600 sticky top-0">
              <tr>
                <th className="p-3">날짜</th>
                <th className="p-3">네이버 리뷰 수</th>
                <th className="p-3">상담 진행</th>
                <th className="p-3">상담 보류</th>
                <th className="p-3">리콜 수</th>
                <th className="p-3">예약 수</th>
                <th className="p-3">사용</th>
              </tr>
            </thead>
            <tbody>
              {dailyReports.map(report => (
                <tr key={report.id} className="border-b hover:bg-slate-50">
                  <td className="p-3">{report.date}</td>
                  <td className="p-3">{report.naver_review_count}</td>
                  <td className="p-3">{report.consult_proceed}</td>
                  <td className="p-3">{report.consult_hold}</td>
                  <td className="p-3">{report.recall_count}</td>
                  <td className="p-3">{report.recall_booking_count}</td>
                  <td className="p-3">
                    <div className="flex gap-1">
                      {onRecalculateStats && (
                        <button
                          onClick={() => onRecalculateStats(report.date)}
                          className="text-blue-500 hover:text-blue-700 text-xs px-2 py-1 border border-blue-200 rounded hover:bg-blue-50"
                          title="상담 통계 재계산"
                        >
                          재계산
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => {
                            if (confirm(`${report.date}의 모든 기록을 삭제하시겠습니까? 재고는 복구되지 않습니다.`)) {
                              onDeleteReport(report.date)
                            }
                          }}
                          className="text-red-500 hover:text-red-700 text-xs px-2 py-1 border border-red-200 rounded hover:bg-red-50"
                          title="전체 기록 삭제"
                        >
                          삭제
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 상담 상세 기록 */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">상담 상세 기록</h2>
          <div className="flex gap-2">
            <button
              onClick={() => setConsultFilter('all')}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                consultFilter === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              전체 ({consultLogs.length})
            </button>
            <button
              onClick={() => setConsultFilter('completed')}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                consultFilter === 'completed'
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              진행완료 ({consultLogs.filter(log => log.consult_status === 'O').length})
            </button>
            <button
              onClick={() => setConsultFilter('incomplete')}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                consultFilter === 'incomplete'
                  ? 'bg-orange-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              진행보류 ({consultLogs.filter(log => log.consult_status === 'X').length})
            </button>
          </div>
        </div>
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-100 text-slate-600 sticky top-0">
              <tr>
                <th className="p-3">날짜</th>
                <th className="p-3">환자명</th>
                <th className="p-3">상담내용</th>
                <th className="p-3">진행여부</th>
                <th className="p-3">참고사항</th>
              </tr>
            </thead>
            <tbody>
              {filteredConsultLogs.map(log => (
                <tr key={log.id} className="border-b hover:bg-slate-50">
                  <td className="p-3">{log.date}</td>
                  <td className="p-3">{log.patient_name}</td>
                  <td className="p-3">{log.consult_content}</td>
                  <td className="p-3">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      log.consult_status === 'O'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-orange-100 text-orange-800'
                    }`}>
                      {log.consult_status === 'O' ? '진행완료' : '진행보류'}
                    </span>
                  </td>
                  <td className="p-3">{log.remarks}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 선물 증정 및 리뷰 상세 기록 */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">선물 증정 및 리뷰 상세 기록</h2>
          <div className="flex gap-2">
            <button
              onClick={() => setGiftSort('default')}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                giftSort === 'default'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              기본순
            </button>
            <button
              onClick={() => setGiftSort('type')}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                giftSort === 'type'
                  ? 'bg-purple-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              선물종류순
            </button>
            <button
              onClick={() => setGiftSort('date')}
              className={`px-3 py-1 text-sm rounded-md transition-colors ${
                giftSort === 'date'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              최신순
            </button>
          </div>
        </div>
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-100 text-slate-600 sticky top-0">
              <tr>
                <th className="p-3">날짜</th>
                <th className="p-3">환자명</th>
                <th className="p-3">선물 종류</th>
                <th className="p-3">수량</th>
                <th className="p-3">네이버 리뷰 여부</th>
                <th className="p-3">비고</th>
              </tr>
            </thead>
            <tbody>
              {sortedGiftLogs.map(log => (
                <tr key={log.id} className="border-b hover:bg-slate-50">
                  <td className="p-3">{log.date}</td>
                  <td className="p-3">{log.patient_name}</td>
                  <td className="p-3">{log.gift_type}</td>
                  <td className="p-3 text-center">1개</td>
                  <td className="p-3">{log.naver_review}</td>
                  <td className="p-3">{log.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 선물 재고 입출고 기록 */}
      <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">선물 재고 입출고 기록</h2>
        </div>
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-100 text-slate-600 sticky top-0">
              <tr>
                <th className="p-3">일시</th>
                <th className="p-3">선물명</th>
                <th className="p-3">내용</th>
                <th className="p-3">수량 변경</th>
                <th className="p-3">최종 재고</th>
              </tr>
            </thead>
            <tbody>
              {inventoryLogs.map(log => (
                <tr key={log.id} className="border-b hover:bg-slate-50">
                  <td className="p-3 text-xs">
                    {new Date(log.timestamp).toLocaleString('ko-KR')}
                  </td>
                  <td className="p-3">{log.name}</td>
                  <td className="p-3">{log.reason}</td>
                  <td className="p-3 font-mono text-center">
                    {log.change > 0 ? `+${log.change}` : log.change}
                  </td>
                  <td className="p-3 font-mono text-center">{log.new_stock}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}