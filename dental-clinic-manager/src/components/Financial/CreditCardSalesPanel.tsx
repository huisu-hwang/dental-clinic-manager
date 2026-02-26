'use client'

import { useState, useCallback } from 'react'
import {
  CreditCard,
  Loader2,
  TrendingUp,
  AlertCircle,
  ChevronDown,
  ChevronUp,
  Store,
  Receipt,
  Wallet,
} from 'lucide-react'
import { formatCurrency } from '@/utils/taxCalculationUtils'

interface CreditCardSalesHistoryItem {
  resYearMonth: string
  resCount: string
  resTotalAmount: string
  resPaymentAmt: string
  resPaymentAmt1: string
  resCashBack: string
}

interface CreditCardSalesTotalItem {
  resQuarter: string
  resType: string
  resCount: string
  resTotalAmount: string
}

interface PGSalesItem {
  resYearMonth: string
  resCount: string
  resSalesAmount: string
  resCompanyNm: string
}

interface CreditCardSalesPanelProps {
  clinicId: string
  year: number
  month: number
}

// 현재 월로부터 분기 계산
function getQuarterFromMonth(m: number): string {
  return String(Math.ceil(m / 3))
}

export default function CreditCardSalesPanel({
  clinicId,
  year,
  month,
}: CreditCardSalesPanelProps) {
  // 조회 조건
  const [queryYear, setQueryYear] = useState(year)
  const [startQuarter, setStartQuarter] = useState('1')
  const [endQuarter, setEndQuarter] = useState(getQuarterFromMonth(month))

  // 결과 상태
  const [loading, setLoading] = useState(false)
  const [fetched, setFetched] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [salesHistory, setSalesHistory] = useState<CreditCardSalesHistoryItem[]>([])
  const [totalList, setTotalList] = useState<CreditCardSalesTotalItem[]>([])
  const [pgSalesHistory, setPgSalesHistory] = useState<PGSalesItem[]>([])
  const [serviceType, setServiceType] = useState<string>('')
  const [message, setMessage] = useState<string>('')

  // 표시 토글
  const [showDetails, setShowDetails] = useState(true)
  const [showPG, setShowPG] = useState(false)
  const [showTotals, setShowTotals] = useState(false)

  // 데이터 조회 (ID/PW 방식 - 서버에서 저장된 홈택스 자격증명 사용)
  const fetchSalesData = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/codef/credit-card-sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinicId,
          year: String(queryYear),
          startQuarter,
          endQuarter,
        }),
      })
      const result = await response.json()

      if (result.success) {
        setSalesHistory(result.data.salesHistory || [])
        setTotalList(result.data.totalList || [])
        setPgSalesHistory(result.data.pgSalesHistory || [])
        setServiceType(result.data.serviceType || '')
        setMessage(result.data.message || '')
        setFetched(true)
      } else {
        setError(result.error || '데이터 조회에 실패했습니다.')
      }
    } catch {
      setError('서버 연결 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }, [clinicId, queryYear, startQuarter, endQuarter])

  // 합계 계산
  const totalAmount = salesHistory.reduce(
    (sum, item) => sum + (parseInt(item.resTotalAmount, 10) || 0),
    0
  )
  const totalCount = salesHistory.reduce(
    (sum, item) => sum + (parseInt(item.resCount, 10) || 0),
    0
  )
  const totalCardPayment = salesHistory.reduce(
    (sum, item) => sum + (parseInt(item.resPaymentAmt, 10) || 0),
    0
  )
  const totalPurchaseCard = salesHistory.reduce(
    (sum, item) => sum + (parseInt(item.resPaymentAmt1, 10) || 0),
    0
  )

  // 년월 포맷팅
  const formatYearMonth = (ym: string) => {
    if (!ym || ym.length < 6) return ym
    return `${ym.slice(0, 4)}년 ${parseInt(ym.slice(4, 6), 10)}월`
  }

  // 현재 월 데이터 찾기
  const currentMonthKey = `${year}${String(month).padStart(2, '0')}`
  const currentMonthData = salesHistory.find(
    (item) => item.resYearMonth === currentMonthKey
  )

  // 연도 옵션
  const currentYear = new Date().getFullYear()
  const yearOptions = Array.from({ length: 5 }, (_, i) => currentYear - i)

  return (
    <div className="bg-white rounded-lg shadow-sm border">
      {/* 헤더 */}
      <div className="p-5 border-b">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-100 rounded-lg">
              <CreditCard className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                신용카드 매출 조회
              </h3>
              <p className="text-sm text-gray-500">
                홈택스 신용카드 매출자료 (ID/PW 인증)
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 조회 조건 폼 */}
      <div className="p-5 border-b bg-gray-50/50">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <span className="text-gray-600 font-medium whitespace-nowrap">조회기간:</span>
            <select
              value={queryYear}
              onChange={(e) => setQueryYear(parseInt(e.target.value, 10))}
              className="px-2 py-1.5 border border-gray-300 bg-white rounded text-sm focus:ring-indigo-500 focus:border-indigo-500"
            >
              {yearOptions.map((y) => <option key={y} value={y}>{y}년</option>)}
            </select>
            <select
              value={startQuarter}
              onChange={(e) => setStartQuarter(e.target.value)}
              className="px-2 py-1.5 border border-gray-300 bg-white rounded text-sm focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="1">1분기</option>
              <option value="2">2분기</option>
              <option value="3">3분기</option>
              <option value="4">4분기</option>
            </select>
            <span className="text-gray-400">~</span>
            <select
              value={endQuarter}
              onChange={(e) => setEndQuarter(e.target.value)}
              className="px-2 py-1.5 border border-gray-300 bg-white rounded text-sm focus:ring-indigo-500 focus:border-indigo-500"
            >
              <option value="1">1분기</option>
              <option value="2">2분기</option>
              <option value="3">3분기</option>
              <option value="4">4분기</option>
            </select>
          </div>

          <button
            onClick={fetchSalesData}
            disabled={loading}
            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 disabled:cursor-not-allowed text-white font-medium rounded-lg shadow-sm transition-colors flex items-center gap-2 text-sm"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <CreditCard className="w-4 h-4" />
            )}
            매출 조회
          </button>
        </div>
      </div>

      {/* 에러 메시지 */}
      {error && (
        <div className="mx-5 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 shrink-0" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* 서비스 타입 안내 */}
      {serviceType && fetched && (
        <div className="mx-5 mt-4 p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
          <p className="text-sm text-indigo-800">
            <strong>CODEF {serviceType} 모드</strong>
            {serviceType === '데모' && ' - 데모 환경에서 실제 홈택스 데이터를 조회합니다.'}
            {serviceType === '샌드박스' && ' - 샌드박스 환경에서는 테스트 데이터만 조회됩니다.'}
            {serviceType === '정식' && ' - 정식 환경에서 실제 데이터를 조회합니다.'}
          </p>
        </div>
      )}

      {/* 로딩 */}
      {loading && (
        <div className="p-12 text-center">
          <Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin text-indigo-500" />
          <p className="text-sm text-gray-500">홈택스에서 데이터를 불러오는 중...</p>
          <p className="text-xs text-gray-400 mt-1">데이터 조회에 시간이 걸릴 수 있습니다.</p>
        </div>
      )}

      {/* 데이터 표시 */}
      {fetched && !loading && (
        <div className="p-5 space-y-5">
          {/* 요약 카드 */}
          {salesHistory.length > 0 && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="p-4 bg-indigo-50 rounded-xl">
                  <p className="text-xs text-indigo-600 font-medium">총 매출액</p>
                  <p className="text-xl font-bold text-gray-900 mt-1">
                    {formatCurrency(totalAmount)}
                  </p>
                </div>
                <div className="p-4 bg-blue-50 rounded-xl">
                  <p className="text-xs text-blue-600 font-medium">신용카드 결제</p>
                  <p className="text-xl font-bold text-gray-900 mt-1">
                    {formatCurrency(totalCardPayment)}
                  </p>
                </div>
                <div className="p-4 bg-purple-50 rounded-xl">
                  <p className="text-xs text-purple-600 font-medium">구매전용카드</p>
                  <p className="text-xl font-bold text-gray-900 mt-1">
                    {formatCurrency(totalPurchaseCard)}
                  </p>
                </div>
                <div className="p-4 bg-green-50 rounded-xl">
                  <p className="text-xs text-green-600 font-medium">총 건수</p>
                  <p className="text-xl font-bold text-gray-900 mt-1">
                    {totalCount.toLocaleString()}건
                  </p>
                </div>
              </div>

              {/* 이번 달 하이라이트 */}
              {currentMonthData && (
                <div className="p-4 bg-gradient-to-r from-indigo-500 to-blue-600 rounded-xl text-white">
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-4 h-4" />
                    <span className="text-sm font-medium opacity-90">
                      {month}월 신용카드 매출
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-xs opacity-75">매출액</p>
                      <p className="text-lg font-bold">
                        {formatCurrency(parseInt(currentMonthData.resTotalAmount, 10) || 0)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs opacity-75">카드결제</p>
                      <p className="text-lg font-bold">
                        {formatCurrency(parseInt(currentMonthData.resPaymentAmt, 10) || 0)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs opacity-75">건수</p>
                      <p className="text-lg font-bold">
                        {parseInt(currentMonthData.resCount, 10).toLocaleString()}건
                      </p>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}

          {/* 월별 매출 내역 */}
          {salesHistory.length > 0 && (
            <div>
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3 hover:text-gray-900"
              >
                <Receipt className="w-4 h-4" />
                월별 매출 내역
                {showDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {showDetails && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">승인년월</th>
                        <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">건수</th>
                        <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">매출액 합계</th>
                        <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">신용카드</th>
                        <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">구매전용카드</th>
                        <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">봉사료</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {salesHistory.map((item, idx) => {
                        const isCurrentMonth = item.resYearMonth === currentMonthKey
                        return (
                          <tr key={idx} className={`hover:bg-gray-50 ${isCurrentMonth ? 'bg-indigo-50/50' : ''}`}>
                            <td className="px-3 py-2.5 text-gray-900 font-medium">
                              {formatYearMonth(item.resYearMonth)}
                              {isCurrentMonth && (
                                <span className="ml-2 text-[10px] px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded-full">이번 달</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-right text-gray-700">
                              {parseInt(item.resCount, 10).toLocaleString()}
                            </td>
                            <td className="px-3 py-2.5 text-right font-semibold text-gray-900">
                              {formatCurrency(parseInt(item.resTotalAmount, 10) || 0)}
                            </td>
                            <td className="px-3 py-2.5 text-right text-blue-600">
                              {formatCurrency(parseInt(item.resPaymentAmt, 10) || 0)}
                            </td>
                            <td className="px-3 py-2.5 text-right text-purple-600">
                              {formatCurrency(parseInt(item.resPaymentAmt1, 10) || 0)}
                            </td>
                            <td className="px-3 py-2.5 text-right text-gray-500">
                              {formatCurrency(parseInt(item.resCashBack, 10) || 0)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-50 font-semibold">
                        <td className="px-3 py-2.5 text-gray-900">합계</td>
                        <td className="px-3 py-2.5 text-right text-gray-900">{totalCount.toLocaleString()}</td>
                        <td className="px-3 py-2.5 text-right text-gray-900">{formatCurrency(totalAmount)}</td>
                        <td className="px-3 py-2.5 text-right text-blue-700">{formatCurrency(totalCardPayment)}</td>
                        <td className="px-3 py-2.5 text-right text-purple-700">{formatCurrency(totalPurchaseCard)}</td>
                        <td className="px-3 py-2.5 text-right text-gray-500">
                          {formatCurrency(salesHistory.reduce((sum, item) => sum + (parseInt(item.resCashBack, 10) || 0), 0))}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* 분기별 합계 */}
          {totalList.length > 0 && (
            <div>
              <button
                onClick={() => setShowTotals(!showTotals)}
                className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3 hover:text-gray-900"
              >
                <Wallet className="w-4 h-4" />
                분기별 매출 합계
                {showTotals ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {showTotals && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">분기</th>
                        <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">자료구분</th>
                        <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">건수</th>
                        <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">매출액 합계</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {totalList.map((item, idx) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-3 py-2.5 text-gray-900 font-medium">{item.resQuarter}</td>
                          <td className="px-3 py-2.5 text-gray-700">{item.resType}</td>
                          <td className="px-3 py-2.5 text-right text-gray-700">{parseInt(item.resCount, 10).toLocaleString()}</td>
                          <td className="px-3 py-2.5 text-right font-semibold text-gray-900">{formatCurrency(parseInt(item.resTotalAmount, 10) || 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* PG 매출 */}
          {pgSalesHistory.length > 0 && (
            <div>
              <button
                onClick={() => setShowPG(!showPG)}
                className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3 hover:text-gray-900"
              >
                <Store className="w-4 h-4" />
                판매(결제)대행 매출자료
                {showPG ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {showPG && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">승인년월</th>
                        <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">PG사</th>
                        <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">건수</th>
                        <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">매출액</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {pgSalesHistory.map((item, idx) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-3 py-2.5 text-gray-900">{formatYearMonth(item.resYearMonth)}</td>
                          <td className="px-3 py-2.5 text-gray-700">{item.resCompanyNm}</td>
                          <td className="px-3 py-2.5 text-right text-gray-700">{parseInt(item.resCount, 10).toLocaleString()}</td>
                          <td className="px-3 py-2.5 text-right font-semibold text-gray-900">{formatCurrency(parseInt(item.resSalesAmount, 10) || 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* 데이터 없음 */}
          {salesHistory.length === 0 && totalList.length === 0 && (
            <div className="py-6 text-center">
              <CreditCard className="w-10 h-10 mx-auto mb-2 text-gray-300" />
              <p className="text-sm text-gray-500">{message || '조회된 매출 데이터가 없습니다.'}</p>
            </div>
          )}
        </div>
      )}

      {/* 초기 상태 (조회 전) */}
      {!fetched && !loading && !error && (
        <div className="p-8 text-center">
          <CreditCard className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500 mb-1">조회 기간을 선택하고 매출 조회 버튼을 클릭하세요.</p>
          <p className="text-xs text-gray-400">홈택스에 연결된 계정 정보로 자동 조회됩니다.</p>
        </div>
      )}

    </div>
  )
}
