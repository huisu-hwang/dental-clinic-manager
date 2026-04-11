'use client'

import { useState, useEffect } from 'react'
import {
  Database,
  CheckCircle,
  AlertCircle,
  Clock,
  Users,
  Activity,
  Loader2,
  Save,
  Download,
  Monitor,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { dentwebService } from '@/lib/dentwebSyncService'
import type { DentwebSyncConfig, DentwebSyncStatus, DentwebSyncLog } from '@/types/dentweb'

export default function DentwebSyncSettings() {
  const [config, setConfig] = useState<DentwebSyncConfig | null>(null)
  const [status, setStatus] = useState<DentwebSyncStatus | null>(null)
  const [recentLogs, setRecentLogs] = useState<DentwebSyncLog[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [showInstallGuide, setShowInstallGuide] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)

  // 동기화 설정 값
  const [isActive, setIsActive] = useState(false)
  const [syncInterval, setSyncInterval] = useState(300)

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 3000)
  }

  // 데이터 로드
  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    setIsLoading(true)

    const [configResult, statusResult, logsResult] = await Promise.all([
      dentwebService.config.getConfig(),
      dentwebService.status.getStatus(),
      dentwebService.syncLogs.getRecentLogs(5),
    ])

    if (configResult.success && configResult.data) {
      setConfig(configResult.data)
      setIsActive(configResult.data.is_active)
      setSyncInterval(configResult.data.sync_interval_seconds)
    }

    if (statusResult.success && statusResult.data) {
      setStatus(statusResult.data)
    }

    if (logsResult.success && logsResult.data) {
      setRecentLogs(logsResult.data)
    }

    setIsLoading(false)
  }

  // 설정 저장
  const handleSave = async () => {
    setIsSaving(true)
    const result = await dentwebService.config.saveConfig({
      is_active: isActive,
      sync_interval_seconds: syncInterval
    })

    if (result.success) {
      showMessage('success', '설정이 저장되었습니다.')
      setConfig(result.data || null)
    } else {
      showMessage('error', result.error || '설정 저장에 실패했습니다.')
    }
    setIsSaving(false)
  }

  // 통합 다운로드 (설치파일 + 설정파일 ZIP)
  const handleDownload = async () => {
    setIsDownloading(true)
    try {
      const response = await fetch('/api/dentweb/download')

      if (!response.ok) {
        const errorData = await response.json().catch(() => null)
        showMessage('error', errorData?.error || '다운로드에 실패했습니다.')
        setIsDownloading(false)
        return
      }

      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'dentweb-bridge-agent.zip'
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

      showMessage('success', '설치 파일이 다운로드되었습니다. 압축을 풀고 setup.bat을 실행하세요.')

      // 다운로드 후 데이터 갱신 (API 키 자동 생성/동기화 자동 활성화 반영)
      await loadData()
    } catch (error) {
      showMessage('error', '다운로드 중 오류가 발생했습니다.')
    }
    setIsDownloading(false)
  }

  // 날짜 포맷팅
  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleString('ko-KR', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-teal-500" />
        <span className="ml-2 text-at-text-weak">로딩 중...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 메시지 알림 */}
      {message && (
        <div className={`flex items-center gap-2 p-3 rounded-lg ${
          message.type === 'success' ? 'bg-at-success-bg text-at-success' : 'bg-at-error-bg text-at-error'
        }`}>
          {message.type === 'success' ? (
            <CheckCircle className="w-5 h-5" />
          ) : (
            <AlertCircle className="w-5 h-5" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* 안내 */}
      <div className="bg-teal-50 rounded-lg p-4">
        <h4 className="font-medium text-teal-900 mb-2 flex items-center gap-2">
          <Database className="w-5 h-5" />
          덴트웹 데이터베이스 연동
        </h4>
        <p className="text-sm text-teal-700">
          원내 PC에서 실행되는 브릿지 에이전트가 덴트웹 DB의 환자 데이터를 주기적으로 동기화합니다.
        </p>
      </div>

      {/* 원클릭 설치 섹션 */}
      <div className="bg-at-tag border border-at-accent/20 rounded-xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="font-medium text-at-text flex items-center gap-2">
            <Monitor className="w-5 h-5" />
            브릿지 에이전트 원클릭 설치
          </h4>
          {status?.agentVersion && (
            <span className="text-xs bg-at-tag text-at-accent px-2 py-1 rounded-full">
              v{status.agentVersion}
            </span>
          )}
        </div>

        <p className="text-sm text-at-text-secondary">
          설치 파일과 설정 파일이 한번에 다운로드됩니다.
          압축을 풀고 <code className="px-1 py-0.5 bg-at-tag rounded text-xs font-mono">setup.bat</code>을 실행하면 자동으로 설치됩니다.
        </p>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleDownload}
            disabled={isDownloading}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-at-accent text-white rounded-xl hover:bg-at-accent-hover disabled:opacity-50 transition-colors text-sm font-medium shadow-sm"
          >
            {isDownloading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                다운로드 중...
              </>
            ) : (
              <>
                <Download className="w-4 h-4" />
                원클릭 설치 다운로드
              </>
            )}
          </button>
          <button
            onClick={() => setShowInstallGuide(!showInstallGuide)}
            className="inline-flex items-center gap-2 px-4 py-2.5 border border-at-border text-at-text-secondary rounded-xl hover:bg-at-surface-hover transition-colors text-sm"
          >
            {showInstallGuide ? (
              <>
                <ChevronUp className="w-4 h-4" />
                설치 가이드 닫기
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4" />
                설치 가이드 보기
              </>
            )}
          </button>
        </div>

        {/* 설치 가이드 (토글) */}
        {showInstallGuide && (
          <div className="bg-white rounded-xl p-4 border border-at-border space-y-4">
            <h5 className="font-medium text-at-text text-sm">설치 방법 (원내 덴트웹 서버 PC에서 진행)</h5>

            <div className="space-y-3">
              <div className="flex gap-3">
                <div className="flex-shrink-0 w-6 h-6 bg-at-accent text-white rounded-full flex items-center justify-center text-xs font-bold">1</div>
                <div>
                  <p className="text-sm font-medium text-at-text">&ldquo;원클릭 설치 다운로드&rdquo; 클릭</p>
                  <p className="text-xs text-at-text-weak mt-0.5">설치 파일과 설정 파일(.env)이 포함된 ZIP이 다운로드됩니다. API 키가 자동으로 생성됩니다.</p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex-shrink-0 w-6 h-6 bg-at-accent text-white rounded-full flex items-center justify-center text-xs font-bold">2</div>
                <div>
                  <p className="text-sm font-medium text-at-text">원내 서버 PC에서 ZIP 압축 해제</p>
                  <p className="text-xs text-at-text-weak mt-0.5">다운로드된 파일을 원내 덴트웹 서버 PC로 옮기고 압축을 해제합니다.</p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex-shrink-0 w-6 h-6 bg-at-accent text-white rounded-full flex items-center justify-center text-xs font-bold">3</div>
                <div>
                  <p className="text-sm font-medium text-at-text">
                    <code className="px-1.5 py-0.5 bg-at-surface-alt rounded text-xs font-mono">setup.bat</code> 관리자 권한으로 실행
                  </p>
                  <p className="text-xs text-at-text-weak mt-0.5">Node.js 자동 설치, 빌드, DB 자동 감지, 서비스 등록이 한번에 진행됩니다.</p>
                </div>
              </div>

              <div className="flex gap-3">
                <div className="flex-shrink-0 w-6 h-6 bg-at-success text-white rounded-full flex items-center justify-center text-xs font-bold">
                  <CheckCircle className="w-3.5 h-3.5" />
                </div>
                <div>
                  <p className="text-sm font-medium text-at-text">설치 완료! 자동 실행됩니다</p>
                  <p className="text-xs text-at-text-weak mt-0.5">Windows 서비스로 등록되어 PC 부팅 시 자동으로 동기화가 시작됩니다.</p>
                </div>
              </div>
            </div>

            <div className="bg-amber-50 rounded p-3 text-xs text-amber-700">
              <strong>필요 사항:</strong> 덴트웹이 설치된 원내 서버 PC에서 실행해야 합니다.
            </div>
          </div>
        )}
      </div>

      {/* 동기화 상태 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-at-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-4 h-4 text-at-text-weak" />
            <span className="text-sm font-medium text-at-text-secondary">연동 상태</span>
          </div>
          <div className="flex items-center gap-2">
            {status?.isActive ? (
              <>
                <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                <span className="text-green-700 font-medium">활성</span>
              </>
            ) : (
              <>
                <div className="w-3 h-3 bg-at-surface-alt rounded-full" />
                <span className="text-at-text-weak font-medium">비활성</span>
              </>
            )}
          </div>
        </div>

        <div className="bg-white border border-at-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-at-text-weak" />
            <span className="text-sm font-medium text-at-text-secondary">마지막 동기화</span>
          </div>
          <div>
            {status?.lastSyncAt ? (
              <div>
                <p className="text-sm font-medium text-at-text">
                  {formatDateTime(status.lastSyncAt)}
                </p>
                <p className={`text-xs ${
                  status.lastSyncStatus === 'success' ? 'text-green-600' : 'text-red-600'
                }`}>
                  {status.lastSyncStatus === 'success' ? '성공' : '오류'}
                  {status.lastSyncPatientCount > 0 && ` (${status.lastSyncPatientCount}명)`}
                </p>
              </div>
            ) : (
              <span className="text-sm text-at-text-weak">아직 동기화되지 않음</span>
            )}
          </div>
        </div>

        <div className="bg-white border border-at-border rounded-xl p-4">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-4 h-4 text-at-text-weak" />
            <span className="text-sm font-medium text-at-text-secondary">동기화된 환자</span>
          </div>
          <p className="text-2xl font-bold text-at-text">{status?.totalPatients || 0}<span className="text-sm font-normal text-at-text-weak ml-1">명</span></p>
        </div>
      </div>

      {/* 설정 */}
      <div className="bg-white border border-at-border rounded-xl p-5 space-y-5">
        <h4 className="font-medium text-at-text">동기화 설정</h4>

        {/* 활성화 토글 */}
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-at-text-secondary">동기화 활성화</p>
            <p className="text-sm text-at-text-weak">브릿지 에이전트의 데이터 수신을 허용합니다</p>
          </div>
          <button
            onClick={() => setIsActive(!isActive)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              isActive ? 'bg-teal-600' : 'bg-at-surface-alt'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                isActive ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* 동기화 주기 */}
        <div>
          <label className="block text-sm font-medium text-at-text-secondary mb-1">동기화 주기</label>
          <select
            value={syncInterval}
            onChange={(e) => setSyncInterval(parseInt(e.target.value))}
            className="px-3 py-2 border border-at-border rounded-xl text-sm w-full max-w-xs"
          >
            <option value={60}>1분</option>
            <option value={180}>3분</option>
            <option value={300}>5분</option>
            <option value={600}>10분</option>
            <option value={1800}>30분</option>
            <option value={3600}>1시간</option>
          </select>
        </div>

        <button
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-xl hover:bg-teal-700 disabled:opacity-50 text-sm"
        >
          {isSaving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              저장 중...
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              설정 저장
            </>
          )}
        </button>
      </div>

      {/* 최근 동기화 이력 */}
      {recentLogs.length > 0 && (
        <div className="bg-white border border-at-border rounded-xl p-5 space-y-4">
          <h4 className="font-medium text-at-text">최근 동기화 이력</h4>
          <div className="space-y-2">
            {recentLogs.map(log => (
              <div
                key={log.id}
                className={`flex items-center justify-between p-3 rounded-lg text-sm ${
                  log.status === 'success'
                    ? 'bg-at-success-bg'
                    : log.status === 'error'
                    ? 'bg-at-error-bg'
                    : 'bg-at-surface-alt'
                }`}
              >
                <div className="flex items-center gap-3">
                  {log.status === 'success' ? (
                    <CheckCircle className="w-4 h-4 text-green-600" />
                  ) : log.status === 'error' ? (
                    <AlertCircle className="w-4 h-4 text-red-600" />
                  ) : (
                    <Loader2 className="w-4 h-4 text-at-text-weak animate-spin" />
                  )}
                  <div>
                    <span className="text-at-text-secondary">{formatDateTime(log.started_at)}</span>
                    <span className="ml-2 text-at-text-weak">
                      ({log.sync_type === 'full' ? '전체' : '증분'})
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  {log.status === 'success' ? (
                    <span className="text-at-success">
                      {log.total_records}건 (신규 {log.new_records}, 수정 {log.updated_records})
                    </span>
                  ) : log.status === 'error' ? (
                    <span className="text-at-error max-w-[200px] truncate block">
                      {log.error_message || '오류'}
                    </span>
                  ) : (
                    <span className="text-at-text-weak">진행 중...</span>
                  )}
                  {log.duration_ms && (
                    <span className="ml-2 text-at-text-weak text-xs">
                      {log.duration_ms < 1000 ? `${log.duration_ms}ms` : `${(log.duration_ms / 1000).toFixed(1)}s`}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  )
}
