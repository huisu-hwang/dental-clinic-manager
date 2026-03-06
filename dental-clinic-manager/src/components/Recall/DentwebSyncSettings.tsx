'use client'

import { useState, useEffect } from 'react'
import {
  Database,
  RefreshCw,
  CheckCircle,
  AlertCircle,
  Key,
  Copy,
  Eye,
  EyeOff,
  Clock,
  Users,
  Activity,
  Loader2,
  Save,
} from 'lucide-react'
import { dentwebService } from '@/lib/dentwebSyncService'
import type { DentwebSyncConfig, DentwebSyncStatus, DentwebSyncLog } from '@/types/dentweb'

export default function DentwebSyncSettings() {
  const [config, setConfig] = useState<DentwebSyncConfig | null>(null)
  const [status, setStatus] = useState<DentwebSyncStatus | null>(null)
  const [recentLogs, setRecentLogs] = useState<DentwebSyncLog[]>([])
  const [showApiKey, setShowApiKey] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isGeneratingKey, setIsGeneratingKey] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

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

  // API 키 생성
  const handleGenerateKey = async () => {
    setIsGeneratingKey(true)
    const result = await dentwebService.config.generateApiKey()

    if (result.success && result.apiKey) {
      showMessage('success', 'API 키가 생성되었습니다. 브릿지 에이전트 .env 파일에 복사하세요.')
      // 설정 다시 로드
      await loadData()
      setShowApiKey(true)
    } else {
      showMessage('error', result.error || 'API 키 생성에 실패했습니다.')
    }
    setIsGeneratingKey(false)
  }

  // API 키 복사
  const handleCopyApiKey = () => {
    if (config?.api_key) {
      navigator.clipboard.writeText(config.api_key)
      showMessage('success', 'API 키가 클립보드에 복사되었습니다.')
    }
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
        <span className="ml-2 text-gray-500">로딩 중...</span>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 메시지 알림 */}
      {message && (
        <div className={`flex items-center gap-2 p-3 rounded-lg ${
          message.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
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
          아래에서 API 키를 생성하고, 브릿지 에이전트를 설정하세요.
        </p>
      </div>

      {/* 동기화 상태 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Activity className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-600">연동 상태</span>
          </div>
          <div className="flex items-center gap-2">
            {status?.isActive ? (
              <>
                <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                <span className="text-green-700 font-medium">활성</span>
              </>
            ) : (
              <>
                <div className="w-3 h-3 bg-gray-300 rounded-full" />
                <span className="text-gray-500 font-medium">비활성</span>
              </>
            )}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-600">마지막 동기화</span>
          </div>
          <div>
            {status?.lastSyncAt ? (
              <div>
                <p className="text-sm font-medium text-gray-900">
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
              <span className="text-sm text-gray-400">아직 동기화되지 않음</span>
            )}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-600">동기화된 환자</span>
          </div>
          <p className="text-2xl font-bold text-gray-900">{status?.totalPatients || 0}<span className="text-sm font-normal text-gray-500 ml-1">명</span></p>
        </div>
      </div>

      {/* 설정 */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-5">
        <h4 className="font-medium text-gray-900">동기화 설정</h4>

        {/* 활성화 토글 */}
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-gray-700">동기화 활성화</p>
            <p className="text-sm text-gray-500">브릿지 에이전트의 데이터 수신을 허용합니다</p>
          </div>
          <button
            onClick={() => setIsActive(!isActive)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              isActive ? 'bg-teal-600' : 'bg-gray-300'
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
          <label className="block text-sm font-medium text-gray-700 mb-1">동기화 주기</label>
          <select
            value={syncInterval}
            onChange={(e) => setSyncInterval(parseInt(e.target.value))}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm w-full max-w-xs"
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
          className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:bg-gray-300 text-sm"
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

      {/* API 키 관리 */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
        <h4 className="font-medium text-gray-900 flex items-center gap-2">
          <Key className="w-4 h-4" />
          API 키 관리
        </h4>
        <p className="text-sm text-gray-500">
          브릿지 에이전트가 데이터를 전송할 때 사용하는 인증 키입니다.
          키를 생성한 후 브릿지 에이전트의 .env 파일에 설정하세요.
        </p>

        {config?.api_key ? (
          <div className="flex items-center gap-3">
            <div className="flex-1 flex items-center gap-2 px-3 py-2 bg-gray-100 rounded-lg font-mono text-sm">
              {showApiKey ? (
                <span className="break-all">{config.api_key}</span>
              ) : (
                <span className="text-gray-400">{'•'.repeat(32)}</span>
              )}
              <button
                onClick={() => setShowApiKey(!showApiKey)}
                className="text-gray-400 hover:text-gray-600 flex-shrink-0"
              >
                {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <button
              onClick={handleCopyApiKey}
              className="flex items-center gap-1.5 px-3 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
            >
              <Copy className="w-4 h-4" />
              복사
            </button>
            <button
              onClick={handleGenerateKey}
              disabled={isGeneratingKey}
              className="flex items-center gap-1.5 px-3 py-2 border border-orange-300 text-orange-700 rounded-lg text-sm hover:bg-orange-50 disabled:bg-gray-100"
            >
              {isGeneratingKey ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <RefreshCw className="w-4 h-4" />
              )}
              재생성
            </button>
          </div>
        ) : (
          <button
            onClick={handleGenerateKey}
            disabled={isGeneratingKey}
            className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 disabled:bg-gray-300 text-sm"
          >
            {isGeneratingKey ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                생성 중...
              </>
            ) : (
              <>
                <Key className="w-4 h-4" />
                API 키 생성
              </>
            )}
          </button>
        )}
      </div>

      {/* 최근 동기화 이력 */}
      {recentLogs.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-5 space-y-4">
          <h4 className="font-medium text-gray-900">최근 동기화 이력</h4>
          <div className="space-y-2">
            {recentLogs.map(log => (
              <div
                key={log.id}
                className={`flex items-center justify-between p-3 rounded-lg text-sm ${
                  log.status === 'success'
                    ? 'bg-green-50'
                    : log.status === 'error'
                    ? 'bg-red-50'
                    : 'bg-gray-50'
                }`}
              >
                <div className="flex items-center gap-3">
                  {log.status === 'success' ? (
                    <CheckCircle className="w-4 h-4 text-green-600" />
                  ) : log.status === 'error' ? (
                    <AlertCircle className="w-4 h-4 text-red-600" />
                  ) : (
                    <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />
                  )}
                  <div>
                    <span className="text-gray-700">{formatDateTime(log.started_at)}</span>
                    <span className="ml-2 text-gray-500">
                      ({log.sync_type === 'full' ? '전체' : '증분'})
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  {log.status === 'success' ? (
                    <span className="text-green-700">
                      {log.total_records}건 (신규 {log.new_records}, 수정 {log.updated_records})
                    </span>
                  ) : log.status === 'error' ? (
                    <span className="text-red-600 max-w-[200px] truncate block">
                      {log.error_message || '오류'}
                    </span>
                  ) : (
                    <span className="text-gray-500">진행 중...</span>
                  )}
                  {log.duration_ms && (
                    <span className="ml-2 text-gray-400 text-xs">
                      {log.duration_ms < 1000 ? `${log.duration_ms}ms` : `${(log.duration_ms / 1000).toFixed(1)}s`}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 브릿지 에이전트 설치 안내 */}
      <div className="bg-gray-50 rounded-lg p-4 space-y-3">
        <h4 className="font-medium text-gray-900">브릿지 에이전트 설치 안내</h4>
        <ol className="text-sm text-gray-600 list-decimal list-inside space-y-2">
          <li>위에서 API 키를 생성합니다</li>
          <li>원내 서버 PC에 <code className="px-1.5 py-0.5 bg-gray-200 rounded text-xs font-mono">dentweb-bridge-agent</code> 폴더를 복사합니다</li>
          <li><code className="px-1.5 py-0.5 bg-gray-200 rounded text-xs font-mono">npm install</code> 로 의존성을 설치합니다</li>
          <li><code className="px-1.5 py-0.5 bg-gray-200 rounded text-xs font-mono">.env.example</code> 을 <code className="px-1.5 py-0.5 bg-gray-200 rounded text-xs font-mono">.env</code> 로 복사하고 설정을 입력합니다</li>
          <li><code className="px-1.5 py-0.5 bg-gray-200 rounded text-xs font-mono">npm run test-connection</code> 으로 DB 연결을 테스트합니다</li>
          <li><code className="px-1.5 py-0.5 bg-gray-200 rounded text-xs font-mono">npm start</code> 로 에이전트를 실행합니다</li>
          <li>(선택) <code className="px-1.5 py-0.5 bg-gray-200 rounded text-xs font-mono">npm run install-service</code> 로 Windows 서비스에 등록합니다</li>
        </ol>
      </div>
    </div>
  )
}
