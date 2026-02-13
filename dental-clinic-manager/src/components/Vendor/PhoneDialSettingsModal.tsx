'use client'

import { useState, useEffect, useRef } from 'react'
import {
  X,
  Phone,
  Settings,
  Wifi,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ChevronDown
} from 'lucide-react'
import {
  PhoneDialSettings,
  PhoneDialProtocol,
  DEFAULT_PHONE_DIAL_SETTINGS,
  PHONE_PRESETS
} from '@/types/phone'
import {
  testPhoneConnection,
  dialPhone
} from '@/utils/phoneDialer'
import { usePhoneDialSettings } from '@/hooks/usePhoneDialSettings'

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
  const { settings: loadedSettings, saveSettings } = usePhoneDialSettings()
  const [localSettings, setLocalSettings] = useState<PhoneDialSettings>(DEFAULT_PHONE_DIAL_SETTINGS)
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [testing, setTesting] = useState(false)
  const [selectedPreset, setSelectedPreset] = useState<string>('')
  const [showAdvanced, setShowAdvanced] = useState(false)

  // 모달이 열릴 때만 훅에서 로드된 설정을 로컬 상태에 복사
  const prevIsOpen = useRef(false)
  useEffect(() => {
    if (isOpen && !prevIsOpen.current) {
      setLocalSettings(loadedSettings)
      setTestResult(null)
    }
    prevIsOpen.current = isOpen
  }, [isOpen, loadedSettings])

  // 프로토콜 변경
  const handleProtocolChange = (protocol: PhoneDialProtocol) => {
    setLocalSettings(prev => ({
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
      setLocalSettings(prev => ({
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
      const result = await testPhoneConnection(localSettings)
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
    const result = await dialPhone(testNumber, localSettings)
    setTestResult(result)
  }

  // 저장 (DB + localStorage 동시)
  const handleSave = async () => {
    await saveSettings(localSettings)
    onSave?.(localSettings)
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
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { value: 'tel', label: '기본 전화', desc: '모바일/소프트폰' },
                { value: 'callto', label: 'Skype', desc: 'callto: 프로토콜' },
                { value: 'sip', label: 'SIP', desc: 'SIP 클라이언트' },
                { value: 'http', label: 'IP 전화기', desc: 'HTTP API' },
                { value: 'centrex', label: 'LG U+ 센트릭스', desc: '고급형 Click-to-Call' }
              ].map(option => (
                <button
                  key={option.value}
                  onClick={() => handleProtocolChange(option.value as PhoneDialProtocol)}
                  className={`p-4 rounded-lg border-2 text-left transition-all ${
                    localSettings.protocol === option.value
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
          {localSettings.protocol === 'http' && (
            <div className="space-y-4 p-4 bg-slate-50 rounded-lg">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <Settings className="w-4 h-4" />
                IP 전화기 설정
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
                  value={localSettings.httpSettings?.host || ''}
                  onChange={(e) => setLocalSettings(prev => ({
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
                  value={localSettings.httpSettings?.port || 80}
                  onChange={(e) => setLocalSettings(prev => ({
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
                      value={localSettings.httpSettings?.pathTemplate || ''}
                      onChange={(e) => setLocalSettings(prev => ({
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
                      value={localSettings.httpSettings?.method || 'GET'}
                      onChange={(e) => setLocalSettings(prev => ({
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
                        value={localSettings.httpSettings?.auth?.username || ''}
                        onChange={(e) => setLocalSettings(prev => ({
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
                        value={localSettings.httpSettings?.auth?.password || ''}
                        onChange={(e) => setLocalSettings(prev => ({
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
                disabled={testing || !localSettings.httpSettings?.host}
                className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-800 disabled:bg-slate-400 text-white rounded-lg transition-colors"
              >
                <Wifi className="w-4 h-4" />
                {testing ? '테스트 중...' : '연결 테스트'}
              </button>
            </div>
          )}

          {/* LG U+ 센트릭스 설정 */}
          {localSettings.protocol === 'centrex' && (
            <div className="space-y-4 p-4 bg-slate-50 rounded-lg">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <Settings className="w-4 h-4" />
                LG U+ 센트릭스 설정
              </div>

              {/* 070 번호 */}
              <div>
                <label className="block text-sm text-slate-600 mb-2">
                  070 전화번호 (로그인 ID) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={localSettings.centrexSettings?.phoneNumber || ''}
                  onChange={(e) => setLocalSettings(prev => ({
                    ...prev,
                    centrexSettings: {
                      ...prev.centrexSettings,
                      phoneNumber: e.target.value,
                      password: prev.centrexSettings?.password || ''
                    }
                  }))}
                  placeholder="예: 07012345678"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="mt-1 text-xs text-slate-400">센트릭스에 등록된 070 번호를 입력하세요</p>
              </div>

              {/* 비밀번호 */}
              <div>
                <label className="block text-sm text-slate-600 mb-2">
                  비밀번호 <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  value={localSettings.centrexSettings?.password || ''}
                  onChange={(e) => setLocalSettings(prev => ({
                    ...prev,
                    centrexSettings: {
                      ...prev.centrexSettings,
                      phoneNumber: prev.centrexSettings?.phoneNumber || '',
                      password: e.target.value
                    }
                  }))}
                  placeholder="센트릭스 비밀번호"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="mt-1 text-xs text-slate-400">비밀번호는 서버에서 안전하게 암호화(SHA-512)되어 전송됩니다</p>
              </div>

              {/* 연결 테스트 */}
              <button
                onClick={handleTest}
                disabled={testing || !localSettings.centrexSettings?.phoneNumber || !localSettings.centrexSettings?.password}
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
                checked={localSettings.numberFormat?.removeSpecialChars ?? true}
                onChange={(e) => setLocalSettings(prev => ({
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

          {/* 한국 환경 가이드 */}
          <div className="p-4 bg-amber-50 rounded-lg border border-amber-200">
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-amber-800">
                <p className="font-semibold mb-2">추천 설정 안내</p>
                <div className="space-y-2 text-amber-700">
                  <p><strong>LG U+ 고급형 센트릭스 (권장)</strong></p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>&quot;LG U+ 센트릭스&quot; 선택 → 070번호와 비밀번호 입력</li>
                    <li>버튼 클릭 시 내 전화기가 먼저 울리고, 수화기를 들면 상대방 연결</li>
                  </ul>
                  <p className="mt-2"><strong>LG U+ 인터넷 전화 (DCS REST API)</strong></p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>&quot;IP 전화기&quot; 선택 → &quot;LG U+ DCS (iPECS)&quot; 프리셋 적용</li>
                    <li>DCS 서버 IP 주소와 포트(기본 8080) 입력</li>
                  </ul>
                  <p className="mt-2"><strong>기타 IP 전화기</strong></p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>Yealink, Grandstream, Snom 등 → 제조사 프리셋 적용</li>
                    <li>Ericsson-LG iPECS → iPECS 프리셋 선택</li>
                  </ul>
                  <p className="mt-2"><strong>소프트폰 사용 시</strong></p>
                  <ul className="list-disc list-inside space-y-1 ml-2">
                    <li>PC 소프트폰 앱 → &quot;기본 전화&quot; 또는 &quot;SIP&quot; 선택</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* 사용 방법 */}
          <div className="p-4 bg-blue-50 rounded-lg">
            <div className="flex items-start gap-2">
              <HelpCircle className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-700">
                <p className="font-medium mb-1">연결 방식 설명</p>
                <ul className="list-disc list-inside space-y-1 text-blue-600">
                  <li><strong>기본 전화:</strong> 스마트폰이나 소프트폰 앱으로 연결 (tel: 프로토콜)</li>
                  <li><strong>Skype:</strong> Skype 앱이 설치된 PC에서 사용</li>
                  <li><strong>SIP:</strong> SIP 클라이언트 앱(MicroSIP 등)으로 연결</li>
                  <li><strong>IP 전화기:</strong> 같은 네트워크의 IP 전화기에 HTTP로 다이얼 명령 전송</li>
                  <li><strong>LG U+ 센트릭스:</strong> 센트릭스 REST API로 Click-to-Call (전화기 울림 → 수화기 → 상대방 연결)</li>
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
