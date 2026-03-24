'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Building2,
  Loader2,
  Check,
  X,
  RefreshCw,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronUp,
  Square,
} from 'lucide-react'

interface HometaxSyncPanelProps {
  clinicId: string
  year: number
  month: number
  onSyncComplete?: () => void
}

interface Credentials {
  id: string
  hometax_user_id?: string
  business_number: string
  login_method: string
  is_active: boolean
  last_login_success: boolean | null
  last_login_attempt: string | null
  last_login_error: string | null
  has_resident_number?: boolean
}

interface SyncJob {
  id: string
  status: string
  data_types: string[]
  result_summary: Record<string, unknown> | null
  error_message: string | null
  created_at: string
  started_at: string | null
  completed_at: string | null
  completedTypes?: string[]
}

interface SyncLog {
  id: string
  data_type: string
  status: string
  record_count: number
  error_message: string | null
  synced_at: string
}

const DATA_TYPE_LABELS: Record<string, string> = {
  tax_invoice_sales: '세금계산서 매출',
  tax_invoice_purchase: '세금계산서 매입',
  cash_receipt_sales: '현금영수증 매출',
  cash_receipt_purchase: '현금영수증 매입',
  business_card_purchase: '사업용카드 매입',
  credit_card_sales: '신용카드 매출',
}

export default function HometaxSyncPanel({
  clinicId,
  year,
  month,
  onSyncComplete,
}: HometaxSyncPanelProps) {
  // 인증정보 상태
  const [credentials, setCredentials] = useState<Credentials | null>(null)
  const [showCredForm, setShowCredForm] = useState(false)
  const [loginId, setLoginId] = useState('')
  const [loginPw, setLoginPw] = useState('')
  const [bizNo, setBizNo] = useState('')
  const [residentNumber, setResidentNumber] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [saving, setSaving] = useState(false)

  // 동기화 상태
  const [syncing, setSyncing] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [currentJob, setCurrentJob] = useState<SyncJob | null>(null)
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([])
  const [showLogs, setShowLogs] = useState(false)
  const [selectedDataTypes, setSelectedDataTypes] = useState<string[]>(Object.keys(DATA_TYPE_LABELS))

  // 메시지
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // 인증정보 로드
  const loadCredentials = useCallback(async () => {
    try {
      const res = await fetch(`/api/hometax/credentials?clinicId=${clinicId}`)
      const data = await res.json()
      if (data.success) {
        setCredentials(data.data)
      }
    } catch {
      // 조회 실패 무시
    }
  }, [clinicId])

  // 동기화 로그 로드
  const loadSyncLogs = useCallback(async () => {
    try {
      const res = await fetch(`/api/hometax/sync/logs?clinicId=${clinicId}&limit=10`)
      const data = await res.json()
      if (data.success) {
        setSyncLogs(data.data || [])
      }
    } catch {
      // 조회 실패 무시
    }
  }, [clinicId])

  // 진행 중인 Job 확인 및 로드
  const loadActiveJob = useCallback(async () => {
    try {
      const res = await fetch(`/api/hometax/sync/status?clinicId=${clinicId}`)
      const data = await res.json()
      if (data.success && data.data && ['pending', 'running'].includes(data.data.status)) {
        setCurrentJob(data.data)
        setSyncing(true)
      }
    } catch {
      // 조회 실패 무시
    }
  }, [clinicId])

  useEffect(() => {
    loadCredentials()
    loadSyncLogs()
    loadActiveJob()
  }, [loadCredentials, loadSyncLogs, loadActiveJob])

  // Job 상태 폴링
  useEffect(() => {
    if (!currentJob || currentJob.status === 'completed' || currentJob.status === 'failed' || currentJob.status === 'cancelled') return

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/hometax/sync/status?jobId=${currentJob.id}`)
        const data = await res.json()
        if (data.success && data.data) {
          setCurrentJob(data.data)
          if (data.data.status === 'completed' || data.data.status === 'failed' || data.data.status === 'cancelled') {
            setSyncing(false)
            loadSyncLogs()
            loadCredentials()
            if (data.data.status === 'completed') {
              setSuccess('동기화가 완료되었습니다.')
              onSyncComplete?.()
            } else if (data.data.status === 'cancelled') {
              setError('동기화가 취소되었습니다.')
            } else {
              setError(`동기화 실패: ${data.data.error_message || '알 수 없는 오류'}`)
            }
          }
        }
      } catch {
        // 폴링 실패 무시
      }
    }, 3000)

    return () => clearInterval(interval)
  }, [currentJob, loadSyncLogs, loadCredentials, onSyncComplete])

  // 인증정보 저장
  const handleSaveCredentials = async () => {
    const isEditing = !!credentials

    // 신규 등록 시 모든 필드 필수, 수정 시 비밀번호/주민번호는 선택
    if (!loginId || !bizNo) {
      setError('아이디와 사업자등록번호를 입력해주세요.')
      return
    }
    if (!isEditing && (!loginPw || !residentNumber)) {
      setError('신규 등록 시 비밀번호와 주민등록번호를 모두 입력해주세요.')
      return
    }

    // 주민등록번호 앞 7자리 검증 (입력된 경우)
    const residentClean = residentNumber.replace(/[^0-9]/g, '')
    if (residentNumber && residentClean.length !== 7) {
      setError('주민등록번호는 생년월일 6자리 + 뒷자리 1자리 (총 7자리)를 입력해주세요.')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const res = await fetch('/api/hometax/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinicId,
          loginId,
          loginPw,
          businessNumber: bizNo,
          residentNumber: residentClean,
        }),
      })
      const data = await res.json()

      if (data.success) {
        setShowCredForm(false)
        setLoginId('')
        setLoginPw('')
        setBizNo('')
        setResidentNumber('')
        setSuccess('인증정보가 저장되었습니다.')
        await loadCredentials()
      } else {
        setError(data.error || '저장에 실패했습니다.')
      }
    } catch {
      setError('서버 연결 중 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  // 인증정보 삭제
  const handleDeleteCredentials = async () => {
    if (!confirm('홈택스 인증정보를 삭제하시겠습니까?')) return

    try {
      const res = await fetch(`/api/hometax/credentials?clinicId=${clinicId}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (data.success) {
        setCredentials(null)
        setSuccess('인증정보가 삭제되었습니다.')
      }
    } catch {
      setError('삭제 중 오류가 발생했습니다.')
    }
  }

  // 수동 동기화 요청
  const handleSync = async () => {
    if (selectedDataTypes.length === 0) {
      setError('동기화할 데이터 유형을 선택해주세요.')
      return
    }

    setSyncing(true)
    setError(null)
    setSuccess(null)

    try {
      const res = await fetch('/api/hometax/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinicId,
          year,
          month,
          dataTypes: selectedDataTypes,
          jobType: 'manual_sync',
        }),
      })
      const data = await res.json()

      if (res.status === 409 && data.jobId) {
        // 이미 진행 중인 Job → 해당 Job 로드하여 표시
        const statusRes = await fetch(`/api/hometax/sync/status?jobId=${data.jobId}`)
        const statusData = await statusRes.json()
        if (statusData.success && statusData.data) {
          setCurrentJob(statusData.data)
          setSuccess('진행 중인 동기화 작업을 불러왔습니다.')
        } else {
          setError('진행 중인 동기화 작업이 있습니다.')
          setSyncing(false)
        }
      } else if (data.success) {
        setCurrentJob(data.data)
        setSuccess('동기화 작업이 시작되었습니다.')
      } else {
        setError(data.error || '동기화 요청에 실패했습니다.')
        setSyncing(false)
      }
    } catch {
      setError('서버 연결 중 오류가 발생했습니다.')
      setSyncing(false)
    }
  }

  // 동기화 취소
  const handleCancelSync = async () => {
    if (!currentJob) return

    setCancelling(true)
    try {
      const res = await fetch('/api/hometax/sync/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: currentJob.id, clinicId }),
      })
      const data = await res.json()
      if (data.success) {
        setCurrentJob(prev => prev ? { ...prev, status: 'cancelled' } : null)
        setSyncing(false)
        setSuccess('동기화가 취소되었습니다.')
      } else {
        setError(data.error || '취소에 실패했습니다.')
      }
    } catch {
      setError('취소 중 오류가 발생했습니다.')
    } finally {
      setCancelling(false)
    }
  }

  // 데이터 타입 토글
  const toggleDataType = (dt: string) => {
    setSelectedDataTypes(prev =>
      prev.includes(dt) ? prev.filter(d => d !== dt) : [...prev, dt]
    )
  }

  // 전체 선택/해제
  const toggleAll = () => {
    if (selectedDataTypes.length === Object.keys(DATA_TYPE_LABELS).length) {
      setSelectedDataTypes([])
    } else {
      setSelectedDataTypes(Object.keys(DATA_TYPE_LABELS))
    }
  }

  // 진행률 계산
  const getProgress = () => {
    if (!currentJob) return { percent: 0, completed: 0, total: 0 }
    const total = currentJob.data_types?.length || 0
    const completed = currentJob.completedTypes?.length || 0
    const percent = total > 0 ? Math.round((completed / total) * 100) : 0
    return { percent, completed, total }
  }

  const isActiveJob = currentJob && ['pending', 'running'].includes(currentJob.status)
  const progress = getProgress()

  return (
    <div className="space-y-4">
      {/* 메시지 */}
      {error && (
        <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl text-sm text-red-700">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}
      {success && (
        <div className="flex items-start gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{success}</span>
          <button onClick={() => setSuccess(null)} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* 인증정보 섹션 */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-indigo-500" />
            <h3 className="font-bold text-slate-800 text-sm">홈택스 인증정보</h3>
          </div>
          {credentials && (
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2 py-0.5 rounded-full ${credentials.last_login_success ? 'bg-emerald-100 text-emerald-700' : credentials.last_login_success === false ? 'bg-red-100 text-red-700' : 'bg-slate-100 text-slate-600'}`}>
                {credentials.last_login_success ? '연동 정상' : credentials.last_login_success === false ? '로그인 실패' : '미확인'}
              </span>
            </div>
          )}
        </div>

        <div className="p-4">
          {credentials && !showCredForm ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">사업자등록번호</span>
                <span className="font-medium text-slate-800">
                  {credentials.business_number.replace(/(\d{3})(\d{2})(\d{5})/, '$1-$2-$3')}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">로그인 방식</span>
                <span className="font-medium text-slate-800">ID/PW</span>
              </div>
              {credentials.last_login_attempt && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-slate-500">마지막 로그인</span>
                  <span className="text-slate-600 text-xs">
                    {new Date(credentials.last_login_attempt).toLocaleString('ko-KR')}
                  </span>
                </div>
              )}
              {credentials.last_login_error && (
                <div className="p-2 bg-red-50 rounded-lg text-xs text-red-600">
                  {credentials.last_login_error}
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => {
                    setBizNo(credentials.business_number)
                    setLoginId(credentials.hometax_user_id || '')
                    setLoginPw('')
                    setResidentNumber('')
                    setShowCredForm(true)
                  }}
                  className="flex-1 py-2 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-xl hover:bg-indigo-100 transition-colors"
                >
                  수정
                </button>
                <button
                  onClick={handleDeleteCredentials}
                  className="py-2 px-4 text-sm font-medium text-red-600 bg-red-50 rounded-xl hover:bg-red-100 transition-colors"
                >
                  삭제
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">사업자등록번호</label>
                <input
                  type="text"
                  value={bizNo}
                  onChange={(e) => setBizNo(e.target.value)}
                  placeholder="000-00-00000"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 block">홈택스 아이디</label>
                <input
                  type="text"
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                  placeholder="홈택스 로그인 아이디"
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 flex items-center gap-1.5">
                  홈택스 비밀번호
                  {credentials && !loginPw && (
                    <span className="flex items-center gap-0.5 text-emerald-600 font-medium">
                      <Check className="w-3 h-3" />저장됨
                    </span>
                  )}
                </label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={loginPw}
                    onChange={(e) => setLoginPw(e.target.value)}
                    placeholder={credentials ? '변경하려면 입력 (비워두면 기존값 유지)' : '홈택스 로그인 비밀번호'}
                    className="w-full px-3 py-2 pr-10 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600 mb-1 flex items-center gap-1.5">
                  주민등록번호 (생년월일 + 뒷자리 1자리)
                  {credentials?.has_resident_number && !residentNumber && (
                    <span className="flex items-center gap-0.5 text-emerald-600 font-medium">
                      <Check className="w-3 h-3" />저장됨
                    </span>
                  )}
                </label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={residentNumber}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9-]/g, '')
                      if (val.replace(/-/g, '').length <= 7) {
                        setResidentNumber(val)
                      }
                    }}
                    placeholder={credentials?.has_resident_number ? '변경하려면 입력 (비워두면 기존값 유지)' : '000000-0'}
                    maxLength={8}
                    className="w-full px-3 py-2 pr-10 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">홈택스 ID/PW 로그인 시 본인확인에 필요합니다</p>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleSaveCredentials}
                  disabled={saving}
                  className="flex-1 py-2 text-sm font-medium text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 disabled:bg-indigo-300 transition-colors flex items-center justify-center gap-1"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  저장
                </button>
                {credentials && (
                  <button
                    onClick={() => setShowCredForm(false)}
                    className="py-2 px-4 text-sm font-medium text-slate-600 bg-slate-100 rounded-xl hover:bg-slate-200 transition-colors"
                  >
                    취소
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 동기화 섹션 */}
      {credentials && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50/50">
            <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
              <RefreshCw className="w-4 h-4 text-indigo-500" />
              데이터 동기화
              <span className="text-xs font-normal text-slate-500">{year}년 {month}월</span>
            </h3>
          </div>

          <div className="p-4 space-y-3">
            {/* 진행 중인 경우: 진행 상황 표시 */}
            {isActiveJob ? (
              <div className="space-y-3">
                {/* 진행 상태 카드 */}
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-sm text-blue-700">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="font-medium">
                        {currentJob?.status === 'pending' ? '워커 대기 중...' : '스크래핑 진행 중...'}
                      </span>
                    </div>
                    <span className="text-xs font-bold text-blue-700">
                      {progress.completed}/{progress.total} 완료
                    </span>
                  </div>

                  {/* 진행률 바 */}
                  <div className="w-full bg-blue-200 rounded-full h-2">
                    {progress.total > 0 ? (
                      <div
                        className="h-2 bg-blue-600 rounded-full transition-all duration-500"
                        style={{ width: `${Math.max(5, progress.percent)}%` }}
                      />
                    ) : (
                      <div className="h-2 bg-blue-400 rounded-full animate-pulse w-full" />
                    )}
                  </div>

                  {/* 데이터 타입 진행 상황 */}
                  <div className="grid grid-cols-2 gap-1 mt-1">
                    {(currentJob?.data_types || []).map(dt => {
                      const isDone = currentJob?.completedTypes?.includes(dt)
                      return (
                        <div
                          key={dt}
                          className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-lg ${
                            isDone
                              ? 'bg-emerald-100 text-emerald-700'
                              : 'bg-blue-100 text-blue-600'
                          }`}
                        >
                          {isDone
                            ? <CheckCircle2 className="w-3 h-3 shrink-0" />
                            : <Loader2 className="w-3 h-3 shrink-0 animate-spin" />
                          }
                          <span className="truncate">{DATA_TYPE_LABELS[dt] || dt}</span>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* 취소 버튼 */}
                <button
                  onClick={handleCancelSync}
                  disabled={cancelling}
                  className="w-full py-2.5 text-sm font-bold text-red-600 bg-red-50 border border-red-200 rounded-xl hover:bg-red-100 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                >
                  {cancelling
                    ? <Loader2 className="w-4 h-4 animate-spin" />
                    : <Square className="w-4 h-4" />
                  }
                  동기화 취소
                </button>
              </div>
            ) : (
              <>
                {/* 데이터 유형 선택 */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-medium text-slate-600">수집 데이터</span>
                    <button onClick={toggleAll} className="text-xs text-indigo-600 hover:text-indigo-800">
                      {selectedDataTypes.length === Object.keys(DATA_TYPE_LABELS).length ? '전체 해제' : '전체 선택'}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {Object.entries(DATA_TYPE_LABELS).map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() => toggleDataType(key)}
                        className={`py-1.5 px-2.5 text-xs rounded-lg border transition-colors ${
                          selectedDataTypes.includes(key)
                            ? 'bg-indigo-50 border-indigo-300 text-indigo-700 font-medium'
                            : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 동기화 버튼 */}
                <button
                  onClick={handleSync}
                  disabled={selectedDataTypes.length === 0}
                  className="w-full py-2.5 text-sm font-bold text-white bg-indigo-600 rounded-xl hover:bg-indigo-700 disabled:bg-indigo-300 transition-colors flex items-center justify-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  수동 동기화
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* 동기화 이력 */}
      {syncLogs.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <button
            onClick={() => setShowLogs(!showLogs)}
            className="w-full p-4 flex items-center justify-between text-sm font-bold text-slate-800 hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-400" />
              동기화 이력
              <span className="text-xs font-normal text-slate-400">{syncLogs.length}건</span>
            </div>
            {showLogs ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
          </button>

          {showLogs && (
            <div className="border-t border-slate-100">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-500">
                    <th className="px-4 py-2 text-left">데이터</th>
                    <th className="px-4 py-2 text-center">상태</th>
                    <th className="px-4 py-2 text-right">건수</th>
                    <th className="px-4 py-2 text-right">시간</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {syncLogs.map(log => (
                    <tr key={log.id} className="hover:bg-slate-50">
                      <td className="px-4 py-2 text-slate-700">{DATA_TYPE_LABELS[log.data_type] || log.data_type}</td>
                      <td className="px-4 py-2 text-center">
                        {log.status === 'success' ? (
                          <span className="text-emerald-600">성공</span>
                        ) : (
                          <span className="text-red-600" title={log.error_message || ''}>실패</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right text-slate-600">{log.record_count}</td>
                      <td className="px-4 py-2 text-right text-slate-400">
                        {new Date(log.synced_at).toLocaleString('ko-KR', {
                          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                        })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
