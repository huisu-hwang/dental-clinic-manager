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
  ShieldCheck,
  FileKey,
  X,
  Smartphone,
  Lock,
  Check,
  Disc,
  Search,
  CheckCircle2,
  ChevronRight,
  FolderOpen,
} from 'lucide-react'
import { formatCurrency } from '@/utils/taxCalculationUtils'
import {
  findCertificatePairs,
  findPfxFiles,
  parseCertificate,
  createPfxCertInfo,
  formatCertDate,
  getRemainingDays,
  getCANameFromPath,
  type ParsedCertificate,
  type PfxParsedCertificate,
} from '@/lib/certificateParser'

// DER/KEY 또는 PFX 인증서 통합 타입
type FoundCertificate =
  | (ParsedCertificate & { isPfx?: false })
  | PfxParsedCertificate

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
  const [foundCerts, setFoundCerts] = useState<FoundCertificate[]>([])
  const [selectedCert, setSelectedCert] = useState<FoundCertificate | null>(null)
  const [certPassword, setCertPassword] = useState<string>('')
  const [scanning, setScanning] = useState(false)
  const [scanned, setScanned] = useState(false)
  const [scanError, setScanError] = useState('')

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
  const folderInputRef = useRef<HTMLInputElement>(null)

  // 인증서 준비 상태 계산
  const certReady = !!(selectedCert && certPassword)

  // 저장매체 선택 시 폴더 검색 트리거
  const handleCertTypeChange = (type: '1' | 'pfx') => {
    setCertType(type)
    setFoundCerts([])
    setSelectedCert(null)
    setCertPassword('')
    setScanned(false)
    setScanError('')
    // 폴더 선택 다이얼로그 열기
    setTimeout(() => {
      if (folderInputRef.current) {
        // 타입에 맞게 input 속성 조정
        folderInputRef.current.value = ''
        folderInputRef.current.click()
      }
    }, 100)
  }

  // 폴더 검색 핸들러
  const handleFolderScan = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files || files.length === 0) return

    setScanning(true)
    setScanError('')
    setFoundCerts([])
    setSelectedCert(null)
    setScanned(false)

    try {
      const parsed: FoundCertificate[] = []

      if (certType === '1') {
        // DER/KEY 쌍 검색
        const pairs = findCertificatePairs(files)
        for (const pair of pairs) {
          try {
            const cert = await parseCertificate(pair)
            parsed.push(cert)
          } catch (err) {
            console.warn('인증서 파싱 실패:', pair.dirPath, err)
          }
        }
      } else {
        // PFX/P12 파일 검색
        const pfxFiles = findPfxFiles(files)
        for (const pfx of pfxFiles) {
          try {
            const pfxInfo = await createPfxCertInfo(pfx)
            parsed.push(pfxInfo)
          } catch (err) {
            console.warn('PFX 파일 읽기 실패:', pfx.dirPath, err)
          }
        }
      }

      if (parsed.length === 0) {
        setScanError(
          certType === '1'
            ? '선택한 폴더에서 DER/KEY 인증서를 찾을 수 없습니다.\nNPKI 폴더 또는 인증서가 있는 폴더를 선택해주세요.'
            : '선택한 폴더에서 PFX/P12 파일을 찾을 수 없습니다.\n인증서가 있는 폴더를 선택해주세요.'
        )
        setScanned(true)
        return
      }

      // DER 인증서: 만료되지 않은 것 우선 정렬
      parsed.sort((a, b) => {
        const aIsPfx = 'isPfx' in a && a.isPfx
        const bIsPfx = 'isPfx' in b && b.isPfx
        if (!aIsPfx && !bIsPfx) {
          const aDer = a as ParsedCertificate
          const bDer = b as ParsedCertificate
          if (aDer.isExpired !== bDer.isExpired) return aDer.isExpired ? 1 : -1
          return bDer.notAfter.getTime() - aDer.notAfter.getTime()
        }
        return 0
      })

      setFoundCerts(parsed)
      // 유효한 인증서가 하나뿐이면 자동 선택
      if (parsed.length === 1) {
        const first = parsed[0]
        const isExpired = !('isPfx' in first && first.isPfx) && (first as ParsedCertificate).isExpired
        if (!isExpired) setSelectedCert(first)
      }
    } catch (err) {
      console.error('인증서 검색 오류:', err)
      setScanError('인증서 검색 중 오류가 발생했습니다.')
    } finally {
      setScanning(false)
      setScanned(true)
    }
  }, [certType])

  // 데이터 조회
  const fetchSalesData = useCallback(async () => {
    if (!selectedCert || !certPassword) {
      setError('공동인증서를 선택하고 비밀번호를 입력해주세요.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      const isPfx = 'isPfx' in selectedCert && selectedCert.isPfx
      const body = isPfx
        ? {
            certFile: (selectedCert as PfxParsedCertificate).pfxBase64,
            certPassword,
            keyFile: '',
            certType: 'pfx',
            year: String(queryYear),
            startQuarter,
            endQuarter,
          }
        : {
            certFile: (selectedCert as ParsedCertificate).certDerBase64,
            certPassword,
            keyFile: (selectedCert as ParsedCertificate).keyDerBase64,
            certType: '1',
            year: String(queryYear),
            startQuarter,
            endQuarter,
          }

      const response = await fetch('/api/codef/credit-card-sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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
  }, [selectedCert, certPassword, queryYear, startQuarter, endQuarter])

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

      {/* 인증서 등록 폼 (한국형 공동인증서 UI 스타일) */}
      {showCertForm && (
        <div className="p-5 border-b bg-gray-50/50">

          <div className="border border-[#1e3a8a] rounded-lg bg-white overflow-hidden shadow-sm max-w-4xl mx-auto">
            {/* Header */}
            <div className="bg-[#1e3a8a] text-white px-5 py-3 flex items-center justify-between">
              <h4 className="font-bold flex items-center gap-2 text-base">
                <ShieldCheck className="w-5 h-5 text-indigo-200" />
                인증서 선택
              </h4>
              <button onClick={() => setShowCertForm(false)} className="text-white hover:text-indigo-200 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 flex flex-col md:flex-row gap-6">
              {/* Left: Storage Media */}
              <div className="w-full md:w-1/4">
                <p className="text-sm font-bold text-gray-800 mb-3 ml-1">저장매체 선택</p>
                <div className="grid grid-cols-2 lg:grid-cols-2 gap-2">
                  <div
                    className={`p-3 border rounded-lg text-center cursor-pointer transition-all ${certType === '1' ? 'bg-[#f0f4ff] border-[#1e3a8a] text-[#1e3a8a] font-bold shadow-sm' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300'}`}
                    onClick={() => handleCertTypeChange('1')}
                  >
                    <Disc className="w-8 h-8 mx-auto mb-2 opacity-80" />
                    <p className="text-[11px] leading-tight break-keep-all">하드디스크<br />(DER/KEY)</p>
                  </div>
                  <div
                    className={`p-3 border rounded-lg text-center cursor-pointer transition-all ${certType === 'pfx' ? 'bg-[#f0f4ff] border-[#1e3a8a] text-[#1e3a8a] font-bold shadow-sm' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50 hover:border-gray-300'}`}
                    onClick={() => handleCertTypeChange('pfx')}
                  >
                    <FileKey className="w-8 h-8 mx-auto mb-2 opacity-80" />
                    <p className="text-[11px] leading-tight break-keep-all">이동식디스크<br />(PFX)</p>
                  </div>
                  <div className="p-3 border border-gray-100 bg-gray-50/50 text-gray-400 rounded-lg text-center">
                    <Smartphone className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="text-[11px] leading-tight break-keep-all">휴대전화</p>
                  </div>
                  <div className="p-3 border border-gray-100 bg-gray-50/50 text-gray-400 rounded-lg text-center">
                    <Lock className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="text-[11px] leading-tight break-keep-all">보안토큰</p>
                  </div>
                </div>
              </div>

              {/* Right: Certificate List and Password */}
              <div className="w-full md:w-3/4 flex flex-col">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-bold text-gray-800 ml-1">
                    {foundCerts.length > 0
                      ? `인증서 선택 (${foundCerts.filter(c => !('isExpired' in c && (c as ParsedCertificate).isExpired)).length}개 유효 / 총 ${foundCerts.length}개)`
                      : '인증서 목록'}
                  </p>
                  {scanned && (
                    <button
                      onClick={() => folderInputRef.current?.click()}
                      className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      다른 폴더 검색
                    </button>
                  )}
                </div>

                {/* Certificate List Area */}
                <div className="border border-gray-300 rounded-lg bg-white overflow-hidden mb-5">
                  <div className="bg-gray-100 border-b border-gray-300 px-4 py-2.5 text-xs font-bold text-gray-600 flex justify-between">
                    <span>소유자 / 발급기관</span>
                    <span>유효기간</span>
                  </div>

                  <div className="bg-white min-h-[140px] max-h-[220px] overflow-y-auto">
                    {/* 스캔 중 */}
                    {scanning && (
                      <div className="flex flex-col items-center justify-center py-8">
                        <Loader2 className="w-6 h-6 animate-spin text-indigo-500 mb-2" />
                        <p className="text-sm text-gray-500">인증서 검색 중...</p>
                      </div>
                    )}

                    {/* 초기 상태: 폴더 선택 안내 */}
                    {!scanning && !scanned && foundCerts.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-8">
                        <Search className="w-8 h-8 text-gray-300 mb-2" />
                        <p className="text-sm text-gray-500 mb-3">좌측에서 저장매체를 선택하면<br/>자동으로 인증서를 검색합니다.</p>
                        <button
                          onClick={() => folderInputRef.current?.click()}
                          className="px-4 py-2 bg-indigo-50 text-indigo-700 text-xs font-medium rounded-lg hover:bg-indigo-100 transition-colors flex items-center gap-1.5"
                        >
                          <FolderOpen className="w-4 h-4" />
                          폴더에서 인증서 찾기
                        </button>
                      </div>
                    )}

                    {/* 검색 결과 없음 */}
                    {!scanning && scanned && foundCerts.length === 0 && scanError && (
                      <div className="flex flex-col items-center justify-center py-8 px-4">
                        <AlertCircle className="w-6 h-6 text-amber-400 mb-2" />
                        <p className="text-xs text-gray-500 text-center whitespace-pre-line">{scanError}</p>
                        <button
                          onClick={() => folderInputRef.current?.click()}
                          className="mt-3 px-3 py-1.5 bg-gray-100 text-gray-700 text-xs rounded hover:bg-gray-200 transition-colors"
                        >
                          다시 검색
                        </button>
                      </div>
                    )}

                    {/* 인증서 목록 */}
                    {foundCerts.map((cert, index) => {
                      const isPfx = 'isPfx' in cert && cert.isPfx
                      const certId = isPfx ? (cert as PfxParsedCertificate).fileName : (cert as ParsedCertificate).serialNumber
                      const isSelected = selectedCert && (
                        isPfx
                          ? ('isPfx' in selectedCert && (selectedCert as PfxParsedCertificate).fileName === (cert as PfxParsedCertificate).fileName)
                          : (!('isPfx' in selectedCert && selectedCert.isPfx) && (selectedCert as ParsedCertificate).serialNumber === (cert as ParsedCertificate).serialNumber)
                      )
                      const isExpired = !isPfx && (cert as ParsedCertificate).isExpired
                      const isDisabled = isExpired || loading

                      return (
                        <button
                          key={certId || index}
                          onClick={() => {
                            if (!isDisabled) {
                              setSelectedCert(cert)
                              setError(null)
                            }
                          }}
                          disabled={isDisabled}
                          className={`w-full text-left px-4 py-3 border-b last:border-b-0 transition-all flex items-center gap-3 ${
                            isSelected
                              ? 'bg-[#f0f4ff] border-b-blue-100'
                              : isExpired
                                ? 'bg-gray-50 opacity-50 cursor-not-allowed'
                                : 'hover:bg-gray-50'
                          }`}
                        >
                          {/* 선택 표시 */}
                          <div className="shrink-0">
                            {isSelected ? (
                              <CheckCircle2 className="w-5 h-5 text-blue-600" />
                            ) : (
                              <div className="w-5 h-5 rounded-full border-2 border-gray-300" />
                            )}
                          </div>

                          {/* 인증서 정보 */}
                          <div className="flex-1 min-w-0">
                            {isPfx ? (
                              <>
                                <div className="flex items-center gap-2">
                                  <span className={`text-sm font-medium ${isSelected ? 'text-blue-800' : 'text-gray-900'}`}>
                                    {(cert as PfxParsedCertificate).fileName}
                                  </span>
                                  <span className="text-[10px] px-1.5 py-0.5 bg-purple-100 text-purple-700 rounded font-medium">PFX</span>
                                </div>
                                <p className="text-xs text-gray-400 truncate">{(cert as PfxParsedCertificate).certPath || '직접 선택'}</p>
                              </>
                            ) : (
                              <>
                                <div className="flex items-center gap-2">
                                  <span className={`text-sm font-medium ${isSelected ? 'text-blue-800' : 'text-gray-900'}`}>
                                    {(cert as ParsedCertificate).subjectCN}
                                  </span>
                                  {isExpired ? (
                                    <span className="text-[10px] px-1.5 py-0.5 bg-red-100 text-red-600 rounded font-medium">만료</span>
                                  ) : getRemainingDays((cert as ParsedCertificate).notAfter) <= 30 ? (
                                    <span className="text-[10px] px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded font-medium">
                                      {getRemainingDays((cert as ParsedCertificate).notAfter)}일
                                    </span>
                                  ) : null}
                                  {(cert as ParsedCertificate).usage !== '일반' && (
                                    <span className="text-[10px] px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded">
                                      {(cert as ParsedCertificate).usage}
                                    </span>
                                  )}
                                </div>
                                <p className="text-xs text-gray-400">
                                  {(cert as ParsedCertificate).issuerCN || getCANameFromPath((cert as ParsedCertificate).certPath)}
                                  {' · '}
                                  {formatCertDate((cert as ParsedCertificate).notBefore)} ~ {formatCertDate((cert as ParsedCertificate).notAfter)}
                                </p>
                              </>
                            )}
                          </div>

                          <ChevronRight className={`w-4 h-4 shrink-0 ${isSelected ? 'text-blue-500' : 'text-gray-300'}`} />
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Password Input Area - 인증서 선택 후 표시 */}
                {selectedCert && (
                  <div className="bg-[#f8fafc] p-4 border border-gray-200 rounded-lg">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <label className="text-sm font-bold text-gray-800 shrink-0 w-24">인증서 암호</label>
                      <div className="relative flex-1">
                        <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                          type="password"
                          value={certPassword}
                          onChange={(e) => setCertPassword(e.target.value)}
                          className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-[#1e3a8a] focus:border-[#1e3a8a] text-sm"
                          placeholder="인증서 암호를 입력하세요"
                          autoFocus
                        />
                      </div>
                    </div>
                    <p className="text-[11px] text-gray-500 mt-2 sm:ml-[108px]">
                      * 인증서 암호는 대소문자를 구분합니다.
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Footer Form Controls */}
            <div className="bg-gray-100 px-5 py-4 border-t border-gray-200 flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="flex items-center gap-2 text-sm w-full md:w-auto overflow-x-auto pb-1 md:pb-0">
                <span className="text-gray-600 font-medium whitespace-nowrap hidden sm:inline">조회기간:</span>
                <select value={queryYear} onChange={(e) => setQueryYear(parseInt(e.target.value, 10))} className="px-2 py-1.5 border border-gray-300 bg-white rounded text-sm focus:ring-[#1e3a8a] focus:border-[#1e3a8a]">
                  {yearOptions.map((y) => <option key={y} value={y}>{y}년</option>)}
                </select>
                <select value={startQuarter} onChange={(e) => setStartQuarter(e.target.value)} className="px-2 py-1.5 border border-gray-300 bg-white rounded text-sm focus:ring-[#1e3a8a] focus:border-[#1e3a8a]">
                  <option value="1">1분기</option><option value="2">2분기</option><option value="3">3분기</option><option value="4">4분기</option>
                </select>
                <span className="text-gray-400">~</span>
                <select value={endQuarter} onChange={(e) => setEndQuarter(e.target.value)} className="px-2 py-1.5 border border-gray-300 bg-white rounded text-sm focus:ring-[#1e3a8a] focus:border-[#1e3a8a]">
                  <option value="1">1분기</option><option value="2">2분기</option><option value="3">3분기</option><option value="4">4분기</option>
                </select>
              </div>

              <div className="flex items-center gap-2 w-full md:w-auto justify-end">
                <button onClick={() => setShowCertForm(false)} className="px-6 py-2 border border-gray-300 bg-white text-gray-700 font-medium rounded hover:bg-gray-50 transition-colors text-sm">
                  취소
                </button>
                <button
                  onClick={fetchSalesData}
                  disabled={loading || !certReady}
                  className="px-8 py-2 bg-[#1e3a8a] hover:bg-blue-900 disabled:bg-indigo-300 disabled:cursor-not-allowed text-white font-bold rounded shadow-sm transition-colors flex items-center gap-2 text-sm"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  확인
                </button>
              </div>
            </div>
          </div>
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

      {/* 숨겨진 폴더 선택 input */}
      <input
        ref={folderInputRef}
        type="file"
        className="hidden"
        onChange={handleFolderScan}
        {...({ webkitdirectory: '', directory: '', mozdirectory: '' } as React.InputHTMLAttributes<HTMLInputElement>)}
        multiple
      />
    </div>
  )
}
