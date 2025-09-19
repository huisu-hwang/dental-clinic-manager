import type { DailyReport, ConsultLog, GiftLog, InventoryLog } from '@/types'

interface LogsSectionProps {
  dailyReports: DailyReport[]
  consultLogs: ConsultLog[]
  giftLogs: GiftLog[]
  inventoryLogs: InventoryLog[]
  onDeleteReport: (date: string) => void
}

export default function LogsSection({ 
  dailyReports, 
  consultLogs, 
  giftLogs, 
  inventoryLogs,
  onDeleteReport 
}: LogsSectionProps) {
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
                <th className="p-3">삭제</th>
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
                    <button
                      onClick={() => {
                        if (confirm(`${report.date}의 모든 기록을 삭제하시겠습니까? 재고는 복구되지 않습니다.`)) {
                          onDeleteReport(report.date)
                        }
                      }}
                      className="text-red-500 hover:text-red-700 text-xs"
                    >
                      삭제
                    </button>
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
        </div>
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-100 text-slate-600 sticky top-0">
              <tr>
                <th className="p-3">날짜</th>
                <th className="p-3">환자명</th>
                <th className="p-3">상담내용</th>
                <th className="p-3">진행여부</th>
                <th className="p-3">보류사유</th>
              </tr>
            </thead>
            <tbody>
              {consultLogs.map(log => (
                <tr key={log.id} className="border-b hover:bg-slate-50">
                  <td className="p-3">{log.date}</td>
                  <td className="p-3">{log.patient_name}</td>
                  <td className="p-3">{log.consult_content}</td>
                  <td className="p-3">{log.consult_status}</td>
                  <td className="p-3">{log.hold_reason}</td>
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
        </div>
        <div className="overflow-x-auto max-h-96 overflow-y-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-100 text-slate-600 sticky top-0">
              <tr>
                <th className="p-3">날짜</th>
                <th className="p-3">환자명</th>
                <th className="p-3">선물 종류</th>
                <th className="p-3">네이버 리뷰 여부</th>
                <th className="p-3">비고</th>
              </tr>
            </thead>
            <tbody>
              {giftLogs.map(log => (
                <tr key={log.id} className="border-b hover:bg-slate-50">
                  <td className="p-3">{log.date}</td>
                  <td className="p-3">{log.patient_name}</td>
                  <td className="p-3">{log.gift_type}</td>
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