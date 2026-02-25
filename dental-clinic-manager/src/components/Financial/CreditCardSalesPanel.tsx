'use client'

import { useState, useCallback, useRef } from 'react'
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
  Upload,
  ShieldCheck,
  FileKey,
  X,
  Info,
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
  // 인증서 상태
  const [certType, setCertType] = useState<'1' | 'pfx'>('1')
  const [certFile, setCertFile] = useState<string>('')
  const [certFileName, setCertFileName] = useState<string>('')
  const [keyFile, setKeyFile] = useState<string>('')
  const [keyFileName, setKeyFileName] = useState<string>('')
  const [certPassword, setCertPassword] = useState<string>('')
  const [certReady, setCertReady] = useState(false)

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
  const [showCertForm, setShowCertForm] = useState(true)
  const [showDetails, setShowDetails] = useState(true)
  const [showPG, setShowPG] = useState(false)
  const [showTotals, setShowTotals] = useState(false)

  // 파일 ref
  const certFileRef = useRef<HTMLInputElement>(null)
  const keyFileRef = useRef<HTMLInputElement>(null)

  // 파일을 base64로 변환
  const fileToBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        // data:application/...;base64, 접두사 제거
        const base64 = result.split(',')[1] || result
        resolve(base64)
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }

  // 인증서 파일 업로드 핸들러
  const handleCertFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const base64 = await fileToBase64(file)
      setCertFile(base64)
      setCertFileName(file.name)
      checkCertReady(base64, keyFile, certPassword, certType)
    } catch {
      setError('인증서 파일을 읽을 수 없습니다.')
    }
  }

  // Key 파일 업로드 핸들러
  const handleKeyFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    try {
      const base64 = await fileToBase64(file)
      setKeyFile(base64)
      setKeyFileName(file.name)
      checkCertReady(certFile, base64, certPassword, certType)
    } catch {
      setError('키 파일을 읽을 수 없습니다.')
    }
  }

  // 인증서 준비 상태 확인
  const checkCertReady = (cf: string, kf: string, pw: string, ct: string) => {
    if (ct === '1') {
      setCertReady(!!(cf && kf && pw))
    } else {
      setCertReady(!!(cf && pw))
    }
  }

  // 인증서 타입 변경
  const handleCertTypeChange = (type: '1' | 'pfx') => {
    setCertType(type)
    // 파일 초기화
    setCertFile('')
    setCertFileName('')
    setKeyFile('')
    setKeyFileName('')
    setCertReady(false)
    if (certFileRef.current) certFileRef.current.value = ''
    if (keyFileRef.current) keyFileRef.current.value = ''
  }

  // 비밀번호 변경
  const handlePasswordChange = (pw: string) => {
    setCertPassword(pw)
    checkCertReady(certFile, keyFile, pw, certType)
  }

  // 데이터 조회
  const fetchSalesData = useCallback(async () => {
    if (!certReady) {
      setError('공동인증서를 먼저 등록해주세요.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/codef/credit-card-sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          certFile,
          certPassword,
          keyFile: certType === '1' ? keyFile : '',
          certType,
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
        setShowCertForm(false)
      } else {
        setError(result.error || '데이터 조회에 실패했습니다.')
      }
    } catch {
      setError('서버 연결 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }, [certFile, certPassword, keyFile, certType, queryYear, startQuarter, endQuarter, certReady])

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
                홈택스 신용카드 매출자료 (공동인증서 인증)
              </p>
            </div>
          </div>

          {fetched && (
            <button
              onClick={() => setShowCertForm(!showCertForm)}
              className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
            >
              <ShieldCheck className="w-4 h-4" />
              {showCertForm ? '인증서 숨기기' : '인증서 설정'}
            </button>
          )}
        </div>
      </div>

      {/* 인증서 등록 폼 */}
      {showCertForm && (
        <div className="p-5 border-b bg-slate-50">
          {/* 안내 메시지 */}
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-2">
            <Info className="w-4 h-4 text-blue-500 mt-0.5 shrink-0" />
            <div className="text-sm text-blue-700">
              <p className="font-medium">공동인증서 필요</p>
              <p className="mt-0.5 text-blue-600">
                신용카드 매출자료 조회는 공동인증서(구 공인인증서)로만 인증이 가능합니다.
                인증서 파일과 비밀번호를 입력해주세요.
              </p>
            </div>
          </div>

          {/* 인증서 타입 선택 */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              인증서 타입
            </label>
            <div className="flex gap-3">
              <button
                onClick={() => handleCertTypeChange('1')}
                className={`flex-1 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                  certType === '1'
                    ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                    : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <FileKey className="w-4 h-4 inline mr-1.5" />
                DER/KEY 파일
              </button>
              <button
                onClick={() => handleCertTypeChange('pfx')}
                className={`flex-1 px-4 py-2.5 rounded-lg border text-sm font-medium transition-colors ${
                  certType === 'pfx'
                    ? 'bg-indigo-50 border-indigo-300 text-indigo-700'
                    : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                }`}
              >
                <ShieldCheck className="w-4 h-4 inline mr-1.5" />
                PFX 파일
              </button>
            </div>
          </div>

          {/* 인증서 파일 업로드 */}
          <div className="space-y-3 mb-4">
            {/* Cert 파일 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {certType === '1' ? '인증서 파일 (signCert.der)' : '인증서 파일 (.pfx / .p12)'}
              </label>
              <div className="flex items-center gap-2">
                <input
                  ref={certFileRef}
                  type="file"
                  accept={certType === '1' ? '.der' : '.pfx,.p12'}
                  onChange={handleCertFileChange}
                  className="hidden"
                />
                <button
                  onClick={() => certFileRef.current?.click()}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors flex items-center gap-2"
                >
                  <Upload className="w-4 h-4" />
                  파일 선택
                </button>
                {certFileName ? (
                  <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 px-3 py-1.5 rounded-lg">
                    <ShieldCheck className="w-4 h-4" />
                    {certFileName}
                    <button
                      onClick={() => {
                        setCertFile('')
                        setCertFileName('')
                        setCertReady(false)
                        if (certFileRef.current) certFileRef.current.value = ''
                      }}
                      className="text-gray-400 hover:text-red-500"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <span className="text-sm text-gray-400">선택된 파일 없음</span>
                )}
              </div>
            </div>

            {/* Key 파일 (der/key 타입만) */}
            {certType === '1' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  키 파일 (signPri.key)
                </label>
                <div className="flex items-center gap-2">
                  <input
                    ref={keyFileRef}
                    type="file"
                    accept=".key"
                    onChange={handleKeyFileChange}
                    className="hidden"
                  />
                  <button
                    onClick={() => keyFileRef.current?.click()}
                    className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-50 transition-colors flex items-center gap-2"
                  >
                    <Upload className="w-4 h-4" />
                    파일 선택
                  </button>
                  {keyFileName ? (
                    <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 px-3 py-1.5 rounded-lg">
                      <FileKey className="w-4 h-4" />
                      {keyFileName}
                      <button
                        onClick={() => {
                          setKeyFile('')
                          setKeyFileName('')
                          setCertReady(false)
                          if (keyFileRef.current) keyFileRef.current.value = ''
                        }}
                        className="text-gray-400 hover:text-red-500"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <span className="text-sm text-gray-400">선택된 파일 없음</span>
                  )}
                </div>
              </div>
            )}

            {/* 인증서 비밀번호 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                인증서 비밀번호
              </label>
              <input
                type="password"
                value={certPassword}
                onChange={(e) => handlePasswordChange(e.target.value)}
                className="w-full max-w-sm px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                placeholder="공동인증서 비밀번호"
              />
            </div>
          </div>

          {/* 조회 조건 */}
          <div className="flex flex-wrap items-end gap-3 mb-4">
            {/* 연도 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">연도</label>
              <select
                value={queryYear}
                onChange={(e) => setQueryYear(parseInt(e.target.value, 10))}
                className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>{y}년</option>
                ))}
              </select>
            </div>

            {/* 시작 분기 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">시작 분기</label>
              <select
                value={startQuarter}
                onChange={(e) => setStartQuarter(e.target.value)}
                className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
              >
                <option value="1">1분기 (1~3월)</option>
                <option value="2">2분기 (4~6월)</option>
                <option value="3">3분기 (7~9월)</option>
                <option value="4">4분기 (10~12월)</option>
              </select>
            </div>

            {/* 종료 분기 */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">종료 분기</label>
              <select
                value={endQuarter}
                onChange={(e) => setEndQuarter(e.target.value)}
                className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
              >
                <option value="1">1분기 (1~3월)</option>
                <option value="2">2분기 (4~6월)</option>
                <option value="3">3분기 (7~9월)</option>
                <option value="4">4분기 (10~12월)</option>
              </select>
            </div>

            {/* 조회 버튼 */}
            <button
              onClick={fetchSalesData}
              disabled={loading || !certReady}
              className="px-5 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 text-sm font-medium"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  조회 중...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  매출 조회
                </>
              )}
            </button>
          </div>

          {/* 인증서 경로 안내 */}
          <p className="text-xs text-gray-400">
            * 공동인증서 위치: USB 드라이브 또는 PC의 NPKI 폴더 (C:\Users\[사용자]\AppData\LocalLow\NPKI 등)
          </p>
        </div>
      )}

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
          <p className="text-xs text-gray-400 mt-1">인증서 확인 및 데이터 조회에 시간이 걸릴 수 있습니다.</p>
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

      {/* 초기 상태 (조회 전, 인증서 폼 닫혀있을 때) */}
      {!fetched && !loading && !showCertForm && (
        <div className="p-8 text-center">
          <CreditCard className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500 mb-2">공동인증서를 등록하고 매출을 조회하세요.</p>
          <button
            onClick={() => setShowCertForm(true)}
            className="text-indigo-600 hover:underline text-sm"
          >
            인증서 등록하기
          </button>
        </div>
      )}
    </div>
  )
}
