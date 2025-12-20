'use client'

import { useState, useEffect } from 'react'
import {
  X,
  Phone,
  Settings,
  Wifi,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ChevronDown,
  Search,
  Loader2,
  Monitor
} from 'lucide-react'
import {
  PhoneDialSettings,
  PhoneDialProtocol,
  DEFAULT_PHONE_DIAL_SETTINGS,
  PHONE_PRESETS
} from '@/types/phone'
import {
  savePhoneDialSettings,
  loadPhoneDialSettings,
  testPhoneConnection,
  dialPhone,
  detectNetworkInfo,
  scanForPhones,
  NetworkInfo
} from '@/utils/phoneDialer'

interface PhoneDialSettingsModalProps {
  isOpen: boolean
  onClose: () => void
  onSave?: (settings: PhoneDialSettings) => void
}

export default function PhoneDialSettingsModal({
  isOpen,
  onClose,
  onSave
}: PhoneDialSettingsModalProps) {
  const [settings, setSettings] = useState<PhoneDialSettings>(DEFAULT_PHONE_DIAL_SETTINGS)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [testing, setTesting] = useState(false)
  const [selectedPreset, setSelectedPreset] = useState<string>('')
  const [showAdvanced, setShowAdvanced] = useState(false)

  // 네트워크 자동 감지 상태
  const [networkInfo, setNetworkInfo] = useState<NetworkInfo | null>(null)
  const [detectingNetwork, setDetectingNetwork] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState({ current: 0, total: 0 })
  const [foundDevices, setFoundDevices] = useState<string[]>([])

  // 설정 불러오기
  useEffect(() => {
    if (isOpen) {
      const loaded = loadPhoneDialSettings()
      setSettings(loaded)
      setTestResult(null)
      setNetworkInfo(null)
      setFoundDevices([])
    }
  }, [isOpen])

  // 네트워크 자동 감지
  const handleDetectNetwork = async () => {
    setDetectingNetwork(true)
    setTestResult(null)

    try {
      const info = await detectNetworkInfo()
      setNetworkInfo(info)

      if (info.localIP) {
        setTestResult({
          success: true,
          message: `내 IP: ${info.localIP} (서브넷: ${info.subnet}.x)`
        })
      } else {
        setTestResult({
          success: false,
          message: '네트워크 정보를 감지할 수 없습니다.'
        })
      }
    } catch (error) {
      setTestResult({
        success: false,
        message: '네트워크 감지 중 오류가 발생했습니다.'
      })
    } finally {
      setDetectingNetwork(false)
    }
  }

  // IP 전화기 검색
  const handleScanDevices = async () => {
    if (!networkInfo?.suggestedIPs.length) {
      setTestResult({
        success: false,
        message: '먼저 네트워크 감지를 실행해주세요.'
      })
      return
    }

    setScanning(true)
    setFoundDevices([])
    setScanProgress({ current: 0, total: networkInfo.suggestedIPs.length })

    try {
      const found = await scanForPhones(
        networkInfo.suggestedIPs,
        [80],
        (current, total, devices) => {
          setScanProgress({ current, total })
          setFoundDevices([...devices])
        }
      )

      if (found.length > 0) {
        setTestResult({
          success: true,
          message: `${found.length}개의 기기를 발견했습니다.`
        })
      } else {
        setTestResult({
          success: false,
          message: '응답하는 기기를 찾지 못했습니다.'
        })
      }
    } catch (error) {
      setTestResult({
        success: false,
        message: '기기 검색 중 오류가 발생했습니다.'
      })
    } finally {
      setScanning(false)
    }
  }

  // 발견된 기기 선택
  const selectDevice = (device: string) => {
    const [host, portStr] = device.includes(':') ? device.split(':') : [device, '80']
    const port = parseInt(portStr) || 80

    setSettings(prev => ({
      ...prev,
      httpSettings: {
        ...prev.httpSettings!,
        host,
        port
      }
    }))
    setTestResult({
      success: true,
      message: `${device}가 선택되었습니다.`
    })
  }

  // 프로토콜 변경
  const handleProtocolChange = (protocol: PhoneDialProtocol) => {
    setSettings(prev => ({
      ...prev,
      protocol,
      httpSettings: protocol === 'http' ? {
        host: prev.httpSettings?.host || '',
        port: prev.httpSettings?.port || 80,
        pathTemplate: prev.httpSettings?.pathTemplate || '/dial?number={number}',
        method: prev.httpSettings?.method || 'GET'
      } : prev.httpSettings
    }))
    setTestResult(null)
  }

  // 프리셋 적용
  const applyPreset = (presetId: string) => {
    const preset = PHONE_PRESETS.find(p => p.id === presetId)
    if (preset && preset.settings) {
      setSelectedPreset(presetId)
      setSettings(prev => ({
        ...prev,
        httpSettings: {
          host: prev.httpSettings?.host || '',
          port: prev.httpSettings?.port || 80,
          pathTemplate: preset.settings?.pathTemplate || '/dial?number={number}',
          method: preset.settings?.method || 'GET',
          auth: prev.httpSettings?.auth
        }
      }))
    }
  }

  // 연결 테스트
  const handleTest = async () => {
    setTesting(true)
    setTestResult(null)

    try {
      const result = await testPhoneConnection(settings)
      setTestResult(result)
    } catch (error) {
      setTestResult({
        success: false,
        message: '테스트 중 오류가 발생했습니다.'
      })
    } finally {
      setTesting(false)
    }
  }

  // 테스트 전화
  const handleTestDial = async () => {
    const testNumber = '010-0000-0000'
    const result = await dialPhone(testNumber, settings)
    setTestResult(result)
  }

  // 저장
  const handleSave = () => {
    savePhoneDialSettings(settings)
    onSave?.(settings)
    onClose()
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* 헤더 */}
        <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 flex items-center justify-between rounded-t-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
              <Phone className="w-5 h-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">전화 다이얼 설정</h3>
              <p className="text-blue-100 text-sm">Phone Dial Settings</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-white/20 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-white" />
          </button>
        </div>

        {/* 본문 */}
        <div className="p-6 space-y-6">
          {/* 프로토콜 선택 */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-3">
              전화 연결 방식
            </label>
            <div className="grid grid-cols-2 gap-3">
              {[
                { value: 'tel', label: '기본 전화', desc: '모바일/소프트폰' },
                { value: 'callto', label: 'Skype', desc: 'callto: 프로토콜' },
                { value: 'sip', label: 'SIP', desc: 'SIP 클라이언트' },
                { value: 'http', label: 'IP 전화기', desc: 'HTTP API' }
              ].map(option => (
                <button
                  key={option.value}
                  onClick={() => handleProtocolChange(option.value as PhoneDialProtocol)}
                  className={`p-4 rounded-lg border-2 text-left transition-all ${
                    settings.protocol === option.value
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <div className="font-medium text-slate-800">{option.label}</div>
                  <div className="text-xs text-slate-500 mt-1">{option.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* HTTP API 설정 (IP 전화기) */}
          {settings.protocol === 'http' && (
            <div className="space-y-4 p-4 bg-slate-50 rounded-lg">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <Settings className="w-4 h-4" />
                IP 전화기 설정
              </div>

              {/* 네트워크 자동 감지 */}
              <div className="p-3 bg-white rounded-lg border border-slate-200">
                <div className="flex items-center gap-2 mb-2">
                  <Monitor className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-medium text-slate-700">네트워크 자동 감지</span>
                </div>

                <div className="flex flex-wrap gap-2 mb-2">
                  <button
                    onClick={handleDetectNetwork}
                    disabled={detectingNetwork}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white text-xs rounded-lg transition-colors"
                  >
                    {detectingNetwork ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Wifi className="w-3.5 h-3.5" />
                    )}
                    {detectingNetwork ? '감지 중...' : '네트워크 감지'}
                  </button>

                  {networkInfo?.localIP && (
                    <button
                      onClick={handleScanDevices}
                      disabled={scanning}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white text-xs rounded-lg transition-colors"
                    >
                      {scanning ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Search className="w-3.5 h-3.5" />
                      )}
                      {scanning ? `검색 중 (${scanProgress.current}/${scanProgress.total})` : '기기 검색'}
                    </button>
                  )}
                </div>

                {/* 네트워크 정보 */}
                {networkInfo?.localIP && (
                  <div className="text-xs text-slate-500">
                    내 IP: <span className="font-mono">{networkInfo.localIP}</span>
                  </div>
                )}

                {/* 발견된 기기 목록 */}
                {foundDevices.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {foundDevices.map((device, index) => (
                      <button
                        key={index}
                        onClick={() => selectDevice(device)}
                        className={`px-2 py-1 text-xs rounded border transition-colors ${
                          settings.httpSettings?.host === device.split(':')[0]
                            ? 'bg-blue-100 border-blue-500 text-blue-700'
                            : 'bg-white border-slate-300 text-slate-700 hover:border-blue-400'
                        }`}
                      >
                        {device}
                      </button>
                    ))}
                  </div>
                )}

                {/* 일반적인 IP 주소 제안 */}
                {networkInfo?.suggestedIPs && networkInfo.suggestedIPs.length > 0 && !scanning && foundDevices.length === 0 && (
                  <div className="mt-2">
                    <div className="text-xs text-slate-500 mb-1">일반적인 IP:</div>
                    <div className="flex flex-wrap gap-1">
                      {networkInfo.suggestedIPs.slice(0, 5).map((ip, index) => (
                        <button
                          key={index}
                          onClick={() => selectDevice(ip)}
                          className="px-1.5 py-0.5 text-xs rounded border border-slate-300 text-slate-600 hover:border-blue-400 transition-colors"
                        >
                          {ip}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* 프리셋 선택 */}
              <div>
                <label className="block text-sm text-slate-600 mb-2">
                  전화기 제조사 선택
                </label>
                <select
                  value={selectedPreset}
                  onChange={(e) => applyPreset(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">프리셋 선택...</option>
                  {PHONE_PRESETS.map(preset => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name} - {preset.description}
                    </option>
                  ))}
                </select>
              </div>

              {/* IP 주소 */}
              <div>
                <label className="block text-sm text-slate-600 mb-2">
                  전화기 IP 주소 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={settings.httpSettings?.host || ''}
                  onChange={(e) => setSettings(prev => ({
                    ...prev,
                    httpSettings: {
                      ...prev.httpSettings!,
                      host: e.target.value
                    }
                  }))}
                  placeholder="예: 192.168.1.100"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* 포트 */}
              <div>
                <label className="block text-sm text-slate-600 mb-2">
                  포트 번호
                </label>
                <input
                  type="number"
                  value={settings.httpSettings?.port || 80}
                  onChange={(e) => setSettings(prev => ({
                    ...prev,
                    httpSettings: {
                      ...prev.httpSettings!,
                      port: parseInt(e.target.value) || 80
                    }
                  }))}
                  placeholder="80"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* 고급 설정 토글 */}
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700"
              >
                <ChevronDown className={`w-4 h-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
                고급 설정
              </button>

              {/* 고급 설정 */}
              {showAdvanced && (
                <div className="space-y-4 pt-2">
                  {/* API 경로 */}
                  <div>
                    <label className="block text-sm text-slate-600 mb-2">
                      API 경로 템플릿
                      <span className="ml-1 text-slate-400">({'{number}'} = 전화번호)</span>
                    </label>
                    <input
                      type="text"
                      value={settings.httpSettings?.pathTemplate || ''}
                      onChange={(e) => setSettings(prev => ({
                        ...prev,
                        httpSettings: {
                          ...prev.httpSettings!,
                          pathTemplate: e.target.value
                        }
                      }))}
                      placeholder="/dial?number={number}"
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                    />
                  </div>

                  {/* HTTP 메서드 */}
                  <div>
                    <label className="block text-sm text-slate-600 mb-2">
                      HTTP 메서드
                    </label>
                    <select
                      value={settings.httpSettings?.method || 'GET'}
                      onChange={(e) => setSettings(prev => ({
                        ...prev,
                        httpSettings: {
                          ...prev.httpSettings!,
                          method: e.target.value as 'GET' | 'POST'
                        }
                      }))}
                      className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    >
                      <option value="GET">GET</option>
                      <option value="POST">POST</option>
                    </select>
                  </div>

                  {/* 인증 정보 */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm text-slate-600 mb-2">
                        사용자명 (선택)
                      </label>
                      <input
                        type="text"
                        value={settings.httpSettings?.auth?.username || ''}
                        onChange={(e) => setSettings(prev => ({
                          ...prev,
                          httpSettings: {
                            ...prev.httpSettings!,
                            auth: {
                              ...prev.httpSettings?.auth,
                              username: e.target.value,
                              password: prev.httpSettings?.auth?.password || ''
                            }
                          }
                        }))}
                        placeholder="admin"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm text-slate-600 mb-2">
                        비밀번호 (선택)
                      </label>
                      <input
                        type="password"
                        value={settings.httpSettings?.auth?.password || ''}
                        onChange={(e) => setSettings(prev => ({
                          ...prev,
                          httpSettings: {
                            ...prev.httpSettings!,
                            auth: {
                              ...prev.httpSettings?.auth,
                              username: prev.httpSettings?.auth?.username || '',
                              password: e.target.value
                            }
                          }
                        }))}
                        placeholder="••••••"
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* 연결 테스트 */}
              <button
                onClick={handleTest}
                disabled={testing || !settings.httpSettings?.host}
                className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-800 disabled:bg-slate-400 text-white rounded-lg transition-colors"
              >
                <Wifi className="w-4 h-4" />
                {testing ? '테스트 중...' : '연결 테스트'}
              </button>
            </div>
          )}

          {/* 전화번호 포맷 설정 */}
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <HelpCircle className="w-4 h-4" />
              전화번호 포맷 옵션
            </div>

            <label className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg cursor-pointer">
              <input
                type="checkbox"
                checked={settings.numberFormat?.removeSpecialChars ?? true}
                onChange={(e) => setSettings(prev => ({
                  ...prev,
                  numberFormat: {
                    ...prev.numberFormat,
                    removeSpecialChars: e.target.checked
                  }
                }))}
                className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <div>
                <div className="text-sm text-slate-700">특수문자 제거</div>
                <div className="text-xs text-slate-500">하이픈(-) 등을 제거하고 숫자만 전송</div>
              </div>
            </label>
          </div>

          {/* 테스트 결과 */}
          {testResult && (
            <div className={`flex items-start gap-3 p-4 rounded-lg ${
              testResult.success ? 'bg-green-50' : 'bg-red-50'
            }`}>
              {testResult.success ? (
                <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
              ) : (
                <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
              )}
              <div className={`text-sm ${testResult.success ? 'text-green-700' : 'text-red-700'}`}>
                {testResult.message}
              </div>
            </div>
          )}

          {/* 도움말 */}
          <div className="p-4 bg-blue-50 rounded-lg">
            <div className="flex items-start gap-2">
              <HelpCircle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-700">
                <p className="font-medium mb-1">사용 방법</p>
                <ul className="list-disc list-inside space-y-1 text-blue-600">
                  <li><strong>기본 전화:</strong> 스마트폰이나 소프트폰 앱 사용</li>
                  <li><strong>Skype:</strong> Skype 앱이 설치된 경우</li>
                  <li><strong>SIP:</strong> SIP 클라이언트 앱 사용</li>
                  <li><strong>IP 전화기:</strong> 네트워크 감지 → 기기 검색</li>
                </ul>
              </div>
            </div>
          </div>
        </div>

        {/* 푸터 */}
        <div className="sticky bottom-0 bg-white border-t border-slate-200 px-6 py-4 flex justify-between rounded-b-xl">
          <button
            onClick={handleTestDial}
            className="px-4 py-2 text-slate-600 hover:text-slate-800 transition-colors"
          >
            테스트 전화 (010-0000-0000)
          </button>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-slate-600 hover:text-slate-800 transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              저장
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
