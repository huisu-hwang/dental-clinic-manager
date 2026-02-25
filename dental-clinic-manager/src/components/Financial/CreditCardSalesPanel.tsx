'use client'

import { useState, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import {
  CreditCard,
  Loader2,
  RefreshCw,
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

export default function CreditCardSalesPanel({
  clinicId,
  year,
  month,
}: CreditCardSalesPanelProps) {
  const [loading, setLoading] = useState(false)
  const [fetched, setFetched] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [salesHistory, setSalesHistory] = useState<CreditCardSalesHistoryItem[]>([])
  const [totalList, setTotalList] = useState<CreditCardSalesTotalItem[]>([])
  const [pgSalesHistory, setPgSalesHistory] = useState<PGSalesItem[]>([])
  const [serviceType, setServiceType] = useState<string>('')
  const [message, setMessage] = useState<string>('')
  const [showDetails, setShowDetails] = useState(true)
  const [showPG, setShowPG] = useState(false)
  const [showTotals, setShowTotals] = useState(false)

  // 데이터 조회
  const fetchSalesData = useCallback(async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(
        `/api/codef/credit-card-sales?clinicId=${clinicId}&year=${year}`
      )
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
  }, [clinicId, year])

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
  const currentMonthData = salesHistory.find(
    (item) => item.resYearMonth === `${year}${String(month).padStart(2, '0')}`
  )

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
                홈택스 신용카드 매출자료 ({year}년)
              </p>
            </div>
          </div>

          <button
            onClick={fetchSalesData}
            disabled={loading}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center gap-2 text-sm font-medium"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                조회 중...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4" />
                {fetched ? '새로고침' : '조회하기'}
              </>
            )}
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
      {serviceType && serviceType !== '정식' && fetched && (
        <div className="mx-5 mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-sm text-amber-800">
            <strong>{serviceType} 모드:</strong> 실제 데이터 연동을 위해서는 CODEF 정식(PRODUCT) 서비스가 필요합니다.
          </p>
        </div>
      )}

      {/* 조회 전 안내 */}
      {!fetched && !loading && !error && (
        <div className="p-8 text-center">
          <CreditCard className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500 mb-1">홈택스에서 신용카드 매출 데이터를 불러옵니다.</p>
          <p className="text-xs text-gray-400">
            위 &quot;조회하기&quot; 버튼을 눌러 {year}년 매출 데이터를 가져오세요.
          </p>
        </div>
      )}

      {/* 로딩 */}
      {loading && (
        <div className="p-12 text-center">
          <Loader2 className="w-8 h-8 mx-auto mb-3 animate-spin text-indigo-500" />
          <p className="text-sm text-gray-500">홈택스에서 데이터를 불러오는 중...</p>
          <p className="text-xs text-gray-400 mt-1">잠시만 기다려주세요.</p>
        </div>
      )}

      {/* 데이터 표시 */}
      {fetched && !loading && (
        <div className="p-5 space-y-5">
          {/* 요약 카드 */}
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

          {/* 월별 매출 내역 */}
          {salesHistory.length > 0 && (
            <div>
              <button
                onClick={() => setShowDetails(!showDetails)}
                className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-3 hover:text-gray-900"
              >
                <Receipt className="w-4 h-4" />
                월별 매출 내역
                {showDetails ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>

              {showDetails && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">
                          승인년월
                        </th>
                        <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">
                          건수
                        </th>
                        <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">
                          매출액 합계
                        </th>
                        <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">
                          신용카드
                        </th>
                        <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">
                          구매전용카드
                        </th>
                        <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">
                          봉사료
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {salesHistory.map((item, idx) => {
                        const isCurrentMonth =
                          item.resYearMonth === `${year}${String(month).padStart(2, '0')}`
                        return (
                          <tr
                            key={idx}
                            className={`hover:bg-gray-50 ${isCurrentMonth ? 'bg-indigo-50/50' : ''}`}
                          >
                            <td className="px-3 py-2.5 text-gray-900 font-medium">
                              {formatYearMonth(item.resYearMonth)}
                              {isCurrentMonth && (
                                <span className="ml-2 text-[10px] px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded-full">
                                  이번 달
                                </span>
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
                        <td className="px-3 py-2.5 text-right text-gray-900">
                          {totalCount.toLocaleString()}
                        </td>
                        <td className="px-3 py-2.5 text-right text-gray-900">
                          {formatCurrency(totalAmount)}
                        </td>
                        <td className="px-3 py-2.5 text-right text-blue-700">
                          {formatCurrency(totalCardPayment)}
                        </td>
                        <td className="px-3 py-2.5 text-right text-purple-700">
                          {formatCurrency(totalPurchaseCard)}
                        </td>
                        <td className="px-3 py-2.5 text-right text-gray-500">
                          {formatCurrency(
                            salesHistory.reduce(
                              (sum, item) => sum + (parseInt(item.resCashBack, 10) || 0),
                              0
                            )
                          )}
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
                {showTotals ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>

              {showTotals && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">
                          분기
                        </th>
                        <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">
                          자료구분
                        </th>
                        <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">
                          건수
                        </th>
                        <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">
                          매출액 합계
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {totalList.map((item, idx) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-3 py-2.5 text-gray-900 font-medium">
                            {item.resQuarter}
                          </td>
                          <td className="px-3 py-2.5 text-gray-700">
                            {item.resType}
                          </td>
                          <td className="px-3 py-2.5 text-right text-gray-700">
                            {parseInt(item.resCount, 10).toLocaleString()}
                          </td>
                          <td className="px-3 py-2.5 text-right font-semibold text-gray-900">
                            {formatCurrency(parseInt(item.resTotalAmount, 10) || 0)}
                          </td>
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
                {showPG ? (
                  <ChevronUp className="w-4 h-4" />
                ) : (
                  <ChevronDown className="w-4 h-4" />
                )}
              </button>

              {showPG && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-50">
                        <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">
                          승인년월
                        </th>
                        <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500 uppercase">
                          PG사
                        </th>
                        <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">
                          건수
                        </th>
                        <th className="px-3 py-2.5 text-right text-xs font-medium text-gray-500 uppercase">
                          매출액
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {pgSalesHistory.map((item, idx) => (
                        <tr key={idx} className="hover:bg-gray-50">
                          <td className="px-3 py-2.5 text-gray-900">
                            {formatYearMonth(item.resYearMonth)}
                          </td>
                          <td className="px-3 py-2.5 text-gray-700">
                            {item.resCompanyNm}
                          </td>
                          <td className="px-3 py-2.5 text-right text-gray-700">
                            {parseInt(item.resCount, 10).toLocaleString()}
                          </td>
                          <td className="px-3 py-2.5 text-right font-semibold text-gray-900">
                            {formatCurrency(parseInt(item.resSalesAmount, 10) || 0)}
                          </td>
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
    </div>
  )
}
