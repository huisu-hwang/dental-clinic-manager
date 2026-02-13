'use client'

import { useState } from 'react'
import {
  Phone,
  Settings,
  Wifi,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ChevronDown,
  Save
} from 'lucide-react'
import {
  PhoneDialProtocol,
  DEFAULT_PHONE_DIAL_SETTINGS,
  PHONE_PRESETS
} from '@/types/phone'
import {
  testPhoneConnection,
  dialPhone
} from '@/utils/phoneDialer'
import { usePhoneDialSettings } from '@/hooks/usePhoneDialSettings'

export default function PhoneDialSettingsInline() {
  const { settings, setSettings, saveSettings, isLoading, isFromDb } = usePhoneDialSettings()
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null)
  const [testing, setTesting] = useState(false)
  const [selectedPreset, setSelectedPreset] = useState<string>('')
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [saved, setSaved] = useState(false)

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
    setSaved(false)
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
      setSaved(false)
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

  // 저장 (DB + localStorage 동시 저장)
  const handleSave = async () => {
    const result = await saveSettings(settings)
    setSaved(true)
    setTestResult({
      success: result.success,
      message: result.message
    })
    setTimeout(() => setSaved(false), 3000)
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center gap-3 pb-4 border-b border-slate-200">
        <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
          <Phone className="w-5 h-5 text-blue-600" />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-slate-800">전화 다이얼 설정</h3>
          <p className="text-slate-500 text-sm">업체 연락처에서 전화 버튼 클릭 시 동작 방식을 설정합니다</p>
        </div>
        {isFromDb && (
          <div className="flex items-center gap-1 px-2 py-1 bg-green-50 text-green-700 text-xs rounded-full">
            <CheckCircle2 className="w-3 h-3" />
            병원 공유 설정
          </div>
        )}
      </div>

      {isLoading && (
        <div className="text-center py-4 text-slate-500 text-sm">설정을 불러오는 중...</div>
      )}

      {/* 프로토콜 선택 */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-3">
          전화 연결 방식
        </label>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
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
              onChange={(e) => {
                setSettings(prev => ({
                  ...prev,
                  httpSettings: {
                    ...prev.httpSettings!,
                    host: e.target.value
                  }
                }))
                setSaved(false)
              }}
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
              onChange={(e) => {
                setSettings(prev => ({
                  ...prev,
                  httpSettings: {
                    ...prev.httpSettings!,
                    port: parseInt(e.target.value) || 80
                  }
                }))
                setSaved(false)
              }}
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
                  onChange={(e) => {
                    setSettings(prev => ({
                      ...prev,
                      httpSettings: {
                        ...prev.httpSettings!,
                        pathTemplate: e.target.value
                      }
                    }))
                    setSaved(false)
                  }}
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
                  onChange={(e) => {
                    setSettings(prev => ({
                      ...prev,
                      httpSettings: {
                        ...prev.httpSettings!,
                        method: e.target.value as 'GET' | 'POST'
                      }
                    }))
                    setSaved(false)
                  }}
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
                    onChange={(e) => {
                      setSettings(prev => ({
                        ...prev,
                        httpSettings: {
                          ...prev.httpSettings!,
                          auth: {
                            ...prev.httpSettings?.auth,
                            username: e.target.value,
                            password: prev.httpSettings?.auth?.password || ''
                          }
                        }
                      }))
                      setSaved(false)
                    }}
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
                    onChange={(e) => {
                      setSettings(prev => ({
                        ...prev,
                        httpSettings: {
                          ...prev.httpSettings!,
                          auth: {
                            ...prev.httpSettings?.auth,
                            username: prev.httpSettings?.auth?.username || '',
                            password: e.target.value
                          }
                        }
                      }))
                      setSaved(false)
                    }}
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
            onChange={(e) => {
              setSettings(prev => ({
                ...prev,
                numberFormat: {
                  ...prev.numberFormat,
                  removeSpecialChars: e.target.checked
                }
              }))
              setSaved(false)
            }}
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
              <p><strong>LG U+ 인터넷 전화 (DCS REST API)</strong></p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>&quot;IP 전화기&quot; 선택 → &quot;LG U+ DCS (iPECS)&quot; 프리셋 적용</li>
                <li>DCS 서버 IP 주소와 포트(기본 8080) 입력</li>
                <li>인증 정보가 필요한 경우 고급 설정에서 입력</li>
              </ul>
              <p className="mt-2"><strong>기타 IP 전화기</strong></p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Yealink, Grandstream, Snom 등 → 제조사 프리셋 적용</li>
                <li>Ericsson-LG iPECS → iPECS 프리셋 선택</li>
              </ul>
              <p className="mt-2"><strong>소프트폰 사용 시</strong></p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>PC에 소프트폰 앱 설치 → &quot;기본 전화&quot; 또는 &quot;SIP&quot; 선택</li>
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
            </ul>
          </div>
        </div>
      </div>

      {/* 액션 버튼 */}
      <div className="flex justify-between items-center pt-4 border-t border-slate-200">
        <button
          onClick={handleTestDial}
          className="px-4 py-2 text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors"
        >
          테스트 전화 (010-0000-0000)
        </button>
        <button
          onClick={handleSave}
          className={`flex items-center gap-2 px-6 py-2 rounded-lg transition-colors ${
            saved
              ? 'bg-green-600 hover:bg-green-700 text-white'
              : 'bg-blue-600 hover:bg-blue-700 text-white'
          }`}
        >
          {saved ? (
            <>
              <CheckCircle2 className="w-4 h-4" />
              저장됨
            </>
          ) : (
            <>
              <Save className="w-4 h-4" />
              설정 저장
            </>
          )}
        </button>
      </div>
    </div>
  )
}
