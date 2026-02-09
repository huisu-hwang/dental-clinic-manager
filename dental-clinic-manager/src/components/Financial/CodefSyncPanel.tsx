'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import {
  Link2,
  Link2Off,
  RefreshCw,
  Check,
  AlertCircle,
  Loader2,
  FileText,
  Receipt,
  CreditCard,
  History,
  Settings,
} from 'lucide-react'

interface CodefConnection {
  isConnected: boolean
  connectedId: string | null
  hometaxUserId?: string
  connectedAt?: string
  lastSyncDate?: string
  isConfigured?: boolean
  serviceType?: string
}

interface SyncLog {
  id: string
  year: number
  month: number
  sync_type: string
  tax_invoice_count: number
  cash_receipt_count: number
  business_card_count: number
  errors: string[]
  synced_at: string
}

interface CodefSyncPanelProps {
  clinicId: string
  year: number
  month: number
  onSyncComplete?: () => void
}

export default function CodefSyncPanel({
  clinicId,
  year,
  month,
  onSyncComplete,
}: CodefSyncPanelProps) {
  const { user } = useAuth()
  const [connection, setConnection] = useState<CodefConnection>({
    isConnected: false,
    connectedId: null,
  })
  const [syncLogs, setSyncLogs] = useState<SyncLog[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [showConnectForm, setShowConnectForm] = useState(false)
  const [showLogs, setShowLogs] = useState(false)

  // 연결 폼 상태
  const [hometaxId, setHometaxId] = useState('')
  const [hometaxPassword, setHometaxPassword] = useState('')
  const [identity, setIdentity] = useState('')  // 대표자 주민등록번호 앞 7자리
  const [formError, setFormError] = useState('')

  // 연결 상태 확인
  useEffect(() => {
    async function checkConnection() {
      try {
        const response = await fetch(`/api/codef/connect?clinicId=${clinicId}`)
        const result = await response.json()

        if (result.success) {
          setConnection(result.data)
        }
      } catch (error) {
        console.error('Connection check error:', error)
      } finally {
        setLoading(false)
      }
    }

    checkConnection()
  }, [clinicId])

  // 동기화 이력 조회
  useEffect(() => {
    async function loadSyncLogs() {
      if (!connection.isConnected) return

      try {
        const response = await fetch(`/api/codef/sync?clinicId=${clinicId}&limit=5`)
        const result = await response.json()

        if (result.success) {
          setSyncLogs(result.data)
        }
      } catch (error) {
        console.error('Sync logs error:', error)
      }
    }

    loadSyncLogs()
  }, [clinicId, connection.isConnected])

  // 홈택스 계정 연결
  const handleConnect = async () => {
    if (!hometaxId || !hometaxPassword) {
      setFormError('홈택스 아이디와 비밀번호를 입력해주세요.')
      return
    }

    if (!identity) {
      setFormError('대표자 주민등록번호 앞 7자리를 입력해주세요.')
      return
    }

    // 주민등록번호 앞 7자리 형식 검증 (숫자만 7자리)
    const identityDigits = identity.replace(/[^0-9]/g, '')
    if (identityDigits.length !== 7) {
      setFormError('주민등록번호 앞 7자리를 정확히 입력해주세요. (예: 8106091)')
      return
    }

    setConnecting(true)
    setFormError('')

    try {
      const response = await fetch('/api/codef/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinicId,
          userId: hometaxId,
          password: hometaxPassword,
          identity: identity.replace(/[^0-9]/g, ''),  // 숫자만 추출
        }),
      })

      const result = await response.json()

      if (result.success) {
        setConnection({
          isConnected: true,
          connectedId: result.data.connectedId,
          hometaxUserId: hometaxId,
          connectedAt: new Date().toISOString(),
        })
        setShowConnectForm(false)
        setHometaxId('')
        setHometaxPassword('')
        setIdentity('')
      } else {
        setFormError(result.error || '연결에 실패했습니다.')
      }
    } catch (error) {
      setFormError('연결 중 오류가 발생했습니다.')
    } finally {
      setConnecting(false)
    }
  }

  // 홈택스 계정 연결 해제
  const handleDisconnect = async () => {
    if (!confirm('홈택스 계정 연결을 해제하시겠습니까?')) return

    try {
      const response = await fetch(`/api/codef/connect?clinicId=${clinicId}`, {
        method: 'DELETE',
      })

      const result = await response.json()

      if (result.success) {
        setConnection({
          isConnected: false,
          connectedId: null,
        })
      } else {
        alert(result.error || '연결 해제에 실패했습니다.')
      }
    } catch (error) {
      alert('연결 해제 중 오류가 발생했습니다.')
    }
  }

  // 데이터 동기화
  const handleSync = async (syncType: string = 'all') => {
    setSyncing(true)

    try {
      const response = await fetch('/api/codef/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinicId,
          year,
          month,
          syncType,
        }),
      })

      const result = await response.json()

      if (result.success) {
        alert(result.data.message)
        onSyncComplete?.()

        // 동기화 이력 새로고침
        const logsResponse = await fetch(`/api/codef/sync?clinicId=${clinicId}&limit=5`)
        const logsResult = await logsResponse.json()
        if (logsResult.success) {
          setSyncLogs(logsResult.data)
        }
      } else {
        alert(result.error || '동기화에 실패했습니다.')
      }
    } catch (error) {
      alert('동기화 중 오류가 발생했습니다.')
    } finally {
      setSyncing(false)
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm border p-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Settings className="w-5 h-5 text-blue-600" />
          홈택스 자동 연동 (CODEF)
        </h3>

        {connection.isConnected && (
          <button
            onClick={() => setShowLogs(!showLogs)}
            className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            <History className="w-4 h-4" />
            동기화 이력
          </button>
        )}
      </div>

      {/* 연결 상태 표시 */}
      <div className={`p-4 rounded-lg mb-4 ${
        connection.isConnected
          ? 'bg-green-50 border border-green-200'
          : 'bg-gray-50 border border-gray-200'
      }`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {connection.isConnected ? (
              <>
                <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
                  <Link2 className="w-5 h-5 text-green-600" />
                </div>
                <div>
                  <p className="font-medium text-green-800">
                    홈택스 연결됨
                    {connection.serviceType && connection.serviceType !== '정식' && (
                      <span className="ml-2 text-xs font-normal px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full">
                        {connection.serviceType} 모드
                      </span>
                    )}
                  </p>
                  <p className="text-sm text-green-600">
                    {connection.hometaxUserId && `ID: ${connection.hometaxUserId}`}
                    {connection.lastSyncDate && (
                      <span className="ml-2">
                        마지막 동기화: {new Date(connection.lastSyncDate).toLocaleDateString('ko-KR')}
                      </span>
                    )}
                  </p>
                </div>
              </>
            ) : (
              <>
                <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                  <Link2Off className="w-5 h-5 text-gray-400" />
                </div>
                <div>
                  <p className="font-medium text-gray-700">홈택스 미연결</p>
                  <p className="text-sm text-gray-500">
                    홈택스 계정을 연결하면 자동으로 데이터를 가져올 수 있습니다.
                  </p>
                </div>
              </>
            )}
          </div>

          {connection.isConnected ? (
            <button
              onClick={handleDisconnect}
              className="px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
            >
              연결 해제
            </button>
          ) : (
            <button
              onClick={() => setShowConnectForm(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              <Link2 className="w-4 h-4" />
              홈택스 연결
            </button>
          )}
        </div>
      </div>

      {/* 연결 폼 */}
      {showConnectForm && !connection.isConnected && (
        <div className="border rounded-lg p-4 mb-4 bg-blue-50">
          <h4 className="font-medium mb-3">홈택스 계정 연결</h4>

          <div className="space-y-3">
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                홈택스 아이디
              </label>
              <input
                type="text"
                value={hometaxId}
                onChange={e => setHometaxId(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="홈택스 로그인 아이디"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-600 mb-1">
                비밀번호
              </label>
              <input
                type="password"
                value={hometaxPassword}
                onChange={e => setHometaxPassword(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="홈택스 로그인 비밀번호"
              />
            </div>

            <div>
              <label className="block text-sm text-gray-600 mb-1">
                대표자 주민등록번호 앞 7자리
              </label>
              <input
                type="text"
                value={identity}
                onChange={e => {
                  // 숫자와 하이픈만 허용, 최대 8자 (하이픈 포함)
                  const val = e.target.value.replace(/[^0-9-]/g, '')
                  if (val.replace(/[^0-9]/g, '').length <= 7) {
                    setIdentity(val)
                  }
                }}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="예: 810609-1 또는 8106091"
                maxLength={8}
              />
              <p className="mt-1 text-xs text-gray-400">
                홈택스 2차 인증에 사용되는 주민등록번호 앞 6자리 + 성별 구분 1자리
              </p>
            </div>

            {formError && (
              <div className="flex items-center gap-2 text-red-600 text-sm">
                <AlertCircle className="w-4 h-4" />
                {formError}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={handleConnect}
                disabled={connecting}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {connecting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    연결 중...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    연결하기
                  </>
                )}
              </button>
              <button
                onClick={() => {
                  setShowConnectForm(false)
                  setFormError('')
                  setIdentity('')
                }}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors"
              >
                취소
              </button>
            </div>
          </div>

          <p className="mt-3 text-xs text-gray-500">
            * 홈택스(hometax.go.kr) 본인 계정의 아이디와 비밀번호를 입력해주세요.
          </p>
        </div>
      )}

      {/* SANDBOX 모드 안내 */}
      {connection.isConnected && connection.serviceType === '샌드박스' && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg mb-4">
          <p className="text-sm text-amber-800">
            <strong>테스트 모드:</strong> 현재 샌드박스(테스트) 모드로 연결되어 있습니다.
            실제 홈택스 데이터는 조회되지 않으며, CODEF 정식(PRODUCT) 서비스 가입 후 실제 데이터 연동이 가능합니다.
          </p>
        </div>
      )}

      {/* 동기화 버튼들 */}
      {connection.isConnected && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600">
              {year}년 {month}월 데이터 동기화
            </span>
            <button
              onClick={() => handleSync('all')}
              disabled={syncing}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center gap-2"
            >
              {syncing ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  동기화 중...
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  전체 동기화
                </>
              )}
            </button>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => handleSync('taxInvoice')}
              disabled={syncing}
              className="px-3 py-2 border rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
            >
              <FileText className="w-4 h-4 text-blue-600" />
              세금계산서
            </button>
            <button
              onClick={() => handleSync('cashReceipt')}
              disabled={syncing}
              className="px-3 py-2 border rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
            >
              <Receipt className="w-4 h-4 text-green-600" />
              현금영수증
            </button>
            <button
              onClick={() => handleSync('businessCard')}
              disabled={syncing}
              className="px-3 py-2 border rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 flex items-center justify-center gap-2 text-sm"
            >
              <CreditCard className="w-4 h-4 text-purple-600" />
              사업자카드
            </button>
          </div>
        </div>
      )}

      {/* 동기화 이력 */}
      {showLogs && syncLogs.length > 0 && (
        <div className="mt-4 border-t pt-4">
          <h4 className="text-sm font-medium mb-2">최근 동기화 이력</h4>
          <div className="space-y-2">
            {syncLogs.map(log => (
              <div
                key={log.id}
                className="flex items-center justify-between text-sm p-2 bg-gray-50 rounded"
              >
                <span className="text-gray-600">
                  {log.year}년 {log.month}월 ({log.sync_type})
                </span>
                <div className="flex items-center gap-4">
                  <span className="text-blue-600">
                    세금계산서 {log.tax_invoice_count}건
                  </span>
                  <span className="text-green-600">
                    현금영수증 {log.cash_receipt_count}건
                  </span>
                  <span className="text-purple-600">
                    카드 {log.business_card_count}건
                  </span>
                  <span className="text-gray-400">
                    {new Date(log.synced_at).toLocaleString('ko-KR')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 안내 메시지 - API 키가 설정되지 않은 경우에만 표시 */}
      {!connection.isConnected && connection.isConfigured === false && (
        <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-800">
            <strong>CODEF API 안내:</strong> 홈택스 연동을 위해서는 CODEF API 키가 필요합니다.
            <a
              href="https://codef.io"
              target="_blank"
              rel="noopener noreferrer"
              className="ml-1 text-blue-600 hover:underline"
            >
              CODEF 가입하기 →
            </a>
          </p>
        </div>
      )}
    </div>
  )
}
