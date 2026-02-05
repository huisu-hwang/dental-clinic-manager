'use client'

import { useState, useEffect } from 'react'
import {
  Settings,
  MessageSquare,
  Phone,
  Save,
  Plus,
  Trash2,
  Edit,
  CheckCircle,
  AlertCircle,
  Eye,
  EyeOff,
  TestTube,
  Star
} from 'lucide-react'
import type {
  AligoSettings,
  AligoSettingsFormData,
  RecallSmsTemplate,
  RecallSmsTemplateFormData
} from '@/types/recall'
import { recallService } from '@/lib/recallService'
import { PHONE_PRESETS } from '@/types/phone'

// 서버 IP 확인 컴포넌트
function ServerIpChecker() {
  const [serverIp, setServerIp] = useState<string | null>(null)
  const [isChecking, setIsChecking] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const checkServerIp = async () => {
    setIsChecking(true)
    setError(null)
    try {
      const response = await fetch('/api/recall/sms?check_ip=true')
      const data = await response.json()
      if (data.success) {
        setServerIp(data.server_ip)
      } else {
        setError(data.error || 'IP 확인 실패')
      }
    } catch {
      setError('서버 연결 실패')
    }
    setIsChecking(false)
  }

  return (
    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
      <h4 className="font-medium text-amber-900 mb-2 flex items-center gap-2">
        <AlertCircle className="w-5 h-5" />
        중요: 서버 IP 등록 필요
      </h4>
      <p className="text-sm text-amber-700 mb-3">
        알리고 API를 사용하려면 서버 IP 주소를 알리고 관리자 페이지에 등록해야 합니다.
      </p>

      {/* 서버 IP 확인 버튼 */}
      <div className="bg-white rounded-lg p-3 mb-3">
        <div className="flex items-center gap-3">
          <button
            onClick={checkServerIp}
            disabled={isChecking}
            className="px-3 py-1.5 bg-amber-600 text-white text-sm rounded hover:bg-amber-700 disabled:bg-gray-300"
          >
            {isChecking ? '확인 중...' : '서버 IP 확인'}
          </button>
          {serverIp && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">서버 IP:</span>
              <code className="px-2 py-1 bg-gray-100 rounded text-sm font-mono font-bold text-amber-700">
                {serverIp}
              </code>
              <button
                onClick={() => navigator.clipboard.writeText(serverIp)}
                className="text-xs text-blue-600 hover:underline"
              >
                복사
              </button>
            </div>
          )}
          {error && <span className="text-sm text-red-600">{error}</span>}
        </div>
        {serverIp && (
          <p className="text-xs text-amber-600 mt-2">
            ⚠️ 위 IP를 알리고 관리자 페이지에 등록하세요. 서버리스 환경(Vercel 등)에서는 IP가 변경될 수 있습니다.
          </p>
        )}
      </div>

      <ol className="text-sm text-amber-700 list-decimal list-inside space-y-1">
        <li>
          <a href="https://smartsms.aligo.in" target="_blank" rel="noopener noreferrer" className="underline">
            알리고 관리자 페이지
          </a>
          에 로그인
        </li>
        <li>SMS API 관리 &gt; 발신 IP 관리 메뉴로 이동</li>
        <li>위에서 확인한 서버 IP 주소를 추가</li>
      </ol>
    </div>
  )
}

interface RecallSettingsProps {
  clinicId: string
  clinicName: string
  clinicPhone: string
}

type SettingsTab = 'sms' | 'templates' | 'voip'

export default function RecallSettings({ clinicId, clinicName, clinicPhone }: RecallSettingsProps) {
  const [activeTab, setActiveTab] = useState<SettingsTab>('sms')

  // 알리고 설정
  const [aligoSettings, setAligoSettings] = useState<AligoSettings | null>(null)
  const [aligoForm, setAligoForm] = useState<AligoSettingsFormData>({
    api_key: '',
    user_id: '',
    sender_number: ''
  })
  const [showApiKey, setShowApiKey] = useState(false)
  const [isSavingAligo, setIsSavingAligo] = useState(false)
  const [isTestingAligo, setIsTestingAligo] = useState(false)

  // 템플릿
  const [templates, setTemplates] = useState<RecallSmsTemplate[]>([])
  const [editingTemplate, setEditingTemplate] = useState<RecallSmsTemplate | null>(null)
  const [templateForm, setTemplateForm] = useState<RecallSmsTemplateFormData>({
    name: '',
    content: '',
    is_default: false
  })
  const [isSavingTemplate, setIsSavingTemplate] = useState(false)

  // 토스트
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text })
    setTimeout(() => setMessage(null), 3000)
  }

  // 데이터 로드
  useEffect(() => {
    loadAligoSettings()
    loadTemplates()
  }, [clinicId])

  const loadAligoSettings = async () => {
    const result = await recallService.aligoSettings.getSettings()
    if (result.success && result.data) {
      setAligoSettings(result.data)
      setAligoForm({
        api_key: result.data.api_key || '',
        user_id: result.data.user_id || '',
        sender_number: result.data.sender_number || ''
      })
    }
  }

  const loadTemplates = async () => {
    const result = await recallService.smsTemplates.getTemplates()
    if (result.success && result.data) {
      setTemplates(result.data)
    }
  }

  // 알리고 설정 저장
  const handleSaveAligo = async () => {
    if (!aligoForm.api_key || !aligoForm.user_id || !aligoForm.sender_number) {
      showMessage('error', '모든 필드를 입력해주세요.')
      return
    }

    setIsSavingAligo(true)
    const result = await recallService.aligoSettings.saveSettings(aligoForm)
    if (result.success) {
      showMessage('success', '알리고 설정이 저장되었습니다.')
      loadAligoSettings()
    } else {
      showMessage('error', result.error || '저장에 실패했습니다.')
    }
    setIsSavingAligo(false)
  }

  // 알리고 API 테스트
  const handleTestAligo = async () => {
    setIsTestingAligo(true)
    try {
      const response = await fetch(`/api/recall/sms?clinic_id=${clinicId}`)
      const data = await response.json()
      if (data.success) {
        showMessage('success', `연결 성공! SMS: ${data.data.sms_count}건, LMS: ${data.data.lms_count}건`)
      } else {
        showMessage('error', data.error || 'API 테스트에 실패했습니다.')
      }
    } catch (error) {
      showMessage('error', 'API 연결 테스트에 실패했습니다.')
    }
    setIsTestingAligo(false)
  }

  // 템플릿 저장
  const handleSaveTemplate = async () => {
    if (!templateForm.name || !templateForm.content) {
      showMessage('error', '템플릿 이름과 내용을 입력해주세요.')
      return
    }

    setIsSavingTemplate(true)

    if (editingTemplate) {
      // 수정
      const result = await recallService.smsTemplates.updateTemplate(editingTemplate.id, templateForm)
      if (result.success) {
        showMessage('success', '템플릿이 수정되었습니다.')
        setEditingTemplate(null)
        setTemplateForm({ name: '', content: '', is_default: false })
        loadTemplates()
      } else {
        showMessage('error', result.error || '수정에 실패했습니다.')
      }
    } else {
      // 생성
      const result = await recallService.smsTemplates.createTemplate(templateForm)
      if (result.success) {
        showMessage('success', '템플릿이 생성되었습니다.')
        setTemplateForm({ name: '', content: '', is_default: false })
        loadTemplates()
      } else {
        showMessage('error', result.error || '생성에 실패했습니다.')
      }
    }

    setIsSavingTemplate(false)
  }

  // 템플릿 삭제
  const handleDeleteTemplate = async (id: string) => {
    if (!confirm('이 템플릿을 삭제하시겠습니까?')) return

    const result = await recallService.smsTemplates.deleteTemplate(id)
    if (result.success) {
      showMessage('success', '템플릿이 삭제되었습니다.')
      loadTemplates()
    } else {
      showMessage('error', result.error || '삭제에 실패했습니다.')
    }
  }

  // 템플릿 편집
  const handleEditTemplate = (template: RecallSmsTemplate) => {
    setEditingTemplate(template)
    setTemplateForm({
      name: template.name,
      content: template.content,
      is_default: template.is_default
    })
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

      {/* 탭 네비게이션 */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('sms')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'sms'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          알리고 SMS 설정
        </button>
        <button
          onClick={() => setActiveTab('templates')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'templates'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Edit className="w-4 h-4" />
          문자 템플릿
        </button>
        <button
          onClick={() => setActiveTab('voip')}
          className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
            activeTab === 'voip'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700'
          }`}
        >
          <Phone className="w-4 h-4" />
          전화 설정
        </button>
      </div>

      {/* 알리고 SMS 설정 */}
      {activeTab === 'sms' && (
        <div className="space-y-6">
          <div className="bg-blue-50 rounded-lg p-4">
            <h4 className="font-medium text-blue-900 mb-2">알리고 SMS 서비스</h4>
            <p className="text-sm text-blue-700">
              알리고(Aligo)는 대량 문자 발송 서비스입니다.
              <a
                href="https://smartsms.aligo.in"
                target="_blank"
                rel="noopener noreferrer"
                className="underline ml-1"
              >
                알리고 가입하기
              </a>
            </p>
          </div>

          {/* IP 등록 안내 */}
          <ServerIpChecker />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                API Key *
              </label>
              <div className="relative">
                <input
                  type={showApiKey ? 'text' : 'password'}
                  value={aligoForm.api_key}
                  onChange={(e) => setAligoForm(prev => ({ ...prev, api_key: e.target.value }))}
                  placeholder="알리고 API Key"
                  className="w-full p-3 pr-10 border border-gray-300 rounded-lg"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey(!showApiKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showApiKey ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                사용자 ID *
              </label>
              <input
                type="text"
                value={aligoForm.user_id}
                onChange={(e) => setAligoForm(prev => ({ ...prev, user_id: e.target.value }))}
                placeholder="알리고 사용자 ID"
                className="w-full p-3 border border-gray-300 rounded-lg"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                발신 번호 *
              </label>
              <input
                type="text"
                value={aligoForm.sender_number}
                onChange={(e) => setAligoForm(prev => ({ ...prev, sender_number: e.target.value }))}
                placeholder="발신 번호 (사전 등록 필요)"
                className="w-full p-3 border border-gray-300 rounded-lg"
              />
              <p className="text-xs text-gray-500 mt-1">
                발신번호는 알리고에서 사전 등록이 필요합니다.
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleSaveAligo}
              disabled={isSavingAligo}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-300"
            >
              {isSavingAligo ? (
                <>
                  <span className="animate-spin">⏳</span>
                  저장 중...
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  저장
                </>
              )}
            </button>

            {aligoSettings && (
              <button
                onClick={handleTestAligo}
                disabled={isTestingAligo}
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:bg-gray-100"
              >
                {isTestingAligo ? (
                  <>
                    <span className="animate-spin">⏳</span>
                    테스트 중...
                  </>
                ) : (
                  <>
                    <TestTube className="w-4 h-4" />
                    연결 테스트
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      )}

      {/* 문자 템플릿 */}
      {activeTab === 'templates' && (
        <div className="space-y-6">
          {/* 템플릿 폼 */}
          <div className="bg-gray-50 rounded-lg p-4 space-y-4">
            <h4 className="font-medium text-gray-900">
              {editingTemplate ? '템플릿 수정' : '새 템플릿 추가'}
            </h4>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                템플릿 이름 *
              </label>
              <input
                type="text"
                value={templateForm.name}
                onChange={(e) => setTemplateForm(prev => ({ ...prev, name: e.target.value }))}
                placeholder="예: 정기검진 리콜"
                className="w-full p-3 border border-gray-300 rounded-lg"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                메시지 내용 *
              </label>
              <textarea
                value={templateForm.content}
                onChange={(e) => setTemplateForm(prev => ({ ...prev, content: e.target.value }))}
                rows={4}
                placeholder="메시지 내용을 입력하세요..."
                className="w-full p-3 border border-gray-300 rounded-lg resize-none"
              />
              <div className="flex flex-wrap gap-2 mt-2">
                <span className="text-xs text-gray-500">사용 가능한 변수:</span>
                {['{환자명}', '{병원명}', '{전화번호}'].map(variable => (
                  <button
                    key={variable}
                    type="button"
                    onClick={() => setTemplateForm(prev => ({ ...prev, content: prev.content + variable }))}
                    className="px-2 py-0.5 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50"
                  >
                    {variable}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={templateForm.is_default}
                onChange={(e) => setTemplateForm(prev => ({ ...prev, is_default: e.target.checked }))}
                className="rounded border-gray-300 text-indigo-600"
              />
              <span className="text-sm text-gray-700">기본 템플릿으로 설정</span>
            </label>

            <div className="flex gap-2">
              <button
                onClick={handleSaveTemplate}
                disabled={isSavingTemplate}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:bg-gray-300"
              >
                {isSavingTemplate ? '저장 중...' : editingTemplate ? '수정' : '추가'}
              </button>
              {editingTemplate && (
                <button
                  onClick={() => {
                    setEditingTemplate(null)
                    setTemplateForm({ name: '', content: '', is_default: false })
                  }}
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  취소
                </button>
              )}
            </div>
          </div>

          {/* 템플릿 목록 */}
          <div>
            <h4 className="font-medium text-gray-900 mb-3">저장된 템플릿</h4>
            {templates.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <MessageSquare className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                <p>저장된 템플릿이 없습니다.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {templates.map(template => (
                  <div
                    key={template.id}
                    className="flex items-start gap-4 p-4 bg-white border border-gray-200 rounded-lg"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-gray-900">{template.name}</p>
                        {template.is_default && (
                          <span className="flex items-center gap-1 px-2 py-0.5 bg-yellow-100 text-yellow-700 text-xs rounded">
                            <Star className="w-3 h-3" />
                            기본
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">
                        {template.content}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleEditTemplate(template)}
                        className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded"
                      >
                        <Edit className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteTemplate(template.id)}
                        className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 전화 설정 */}
      {activeTab === 'voip' && (
        <div className="space-y-6">
          <div className="bg-blue-50 rounded-lg p-4">
            <h4 className="font-medium text-blue-900 mb-2">전화 걸기 설정</h4>
            <p className="text-sm text-blue-700">
              PC에서 전화를 거는 방법을 설정합니다. 모바일에서는 자동으로 전화 앱이 실행됩니다.
            </p>
          </div>

          <div className="space-y-4">
            <h4 className="font-medium text-gray-900">IP 전화기 프리셋</h4>
            <p className="text-sm text-gray-500">
              IP 전화기를 사용하는 경우 제조사를 선택하면 자동으로 설정됩니다.
            </p>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {PHONE_PRESETS.map(preset => (
                <button
                  key={preset.id}
                  className="p-3 text-left border border-gray-200 rounded-lg hover:border-indigo-300 hover:bg-indigo-50 transition-colors"
                >
                  <p className="font-medium text-gray-900">{preset.name}</p>
                  <p className="text-xs text-gray-500">{preset.description}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <h4 className="font-medium text-yellow-900 mb-2">VoIP 서비스 연동</h4>
            <p className="text-sm text-yellow-700">
              KT 비즈메카, LG U+ 등 VoIP 서비스와 연동하려면 해당 서비스의 API 키가 필요합니다.
              자세한 설정은 각 서비스 제공업체에 문의하세요.
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
