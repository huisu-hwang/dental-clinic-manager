'use client'

import { useState, useEffect } from 'react'
import { X, Send, MessageSquare, Users, AlertCircle, CheckCircle } from 'lucide-react'
import type { RecallPatient, RecallSmsTemplate } from '@/types/recall'
import { recallSmsTemplateService } from '@/lib/recallService'
import { displayPhoneNumber } from '@/lib/phoneCallService'

interface SmsSendModalProps {
  isOpen: boolean
  onClose: () => void
  patients: RecallPatient[]
  clinicName?: string
  clinicPhone?: string
  clinicId: string
  onSendComplete: (successCount: number, failCount: number) => void
}

interface SendResult {
  success: boolean
  successCount: number
  errorCount: number
  message?: string
}

export default function SmsSendModal({
  isOpen,
  onClose,
  patients,
  clinicName = '',
  clinicPhone = '',
  clinicId,
  onSendComplete
}: SmsSendModalProps) {
  const [templates, setTemplates] = useState<RecallSmsTemplate[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('')
  const [message, setMessage] = useState('')
  const [isSending, setIsSending] = useState(false)
  const [result, setResult] = useState<SendResult | null>(null)
  const [loadingTemplates, setLoadingTemplates] = useState(true)

  // 템플릿 로드
  useEffect(() => {
    if (isOpen) {
      loadTemplates()
    }
  }, [isOpen])

  const loadTemplates = async () => {
    setLoadingTemplates(true)
    const response = await recallSmsTemplateService.getTemplates()
    if (response.success && response.data) {
      setTemplates(response.data)
      // 기본 템플릿 선택
      const defaultTemplate = response.data.find(t => t.is_default)
      if (defaultTemplate) {
        setSelectedTemplateId(defaultTemplate.id)
        setMessage(applyVariables(defaultTemplate.content))
      }
    }
    setLoadingTemplates(false)
  }

  // 변수 치환
  const applyVariables = (content: string, patientName?: string): string => {
    return content
      .replace(/\{환자명\}/g, patientName || '{환자명}')
      .replace(/\{병원명\}/g, clinicName)
      .replace(/\{전화번호\}/g, clinicPhone)
  }

  // 템플릿 선택
  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplateId(templateId)
    const template = templates.find(t => t.id === templateId)
    if (template) {
      setMessage(applyVariables(template.content))
    }
  }

  // 문자 발송
  const handleSend = async () => {
    if (!message.trim()) return

    setIsSending(true)
    setResult(null)

    try {
      // 각 환자에게 개인화된 메시지 발송
      const receivers = patients.map(p => p.phone_number)
      const personalizedMessages = patients.map(p => applyVariables(message, p.patient_name))

      // 모든 환자에게 같은 메시지인 경우
      const isUniformMessage = new Set(personalizedMessages).size === 1

      if (isUniformMessage) {
        // 일괄 발송
        const response = await fetch('/api/recall/sms', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clinic_id: clinicId,
            receivers,
            message: personalizedMessages[0]
          })
        })

        const data = await response.json()

        if (data.success) {
          setResult({
            success: true,
            successCount: data.data?.success_cnt || patients.length,
            errorCount: data.data?.error_cnt || 0,
            message: '문자 발송이 완료되었습니다.'
          })
          onSendComplete(data.data?.success_cnt || patients.length, data.data?.error_cnt || 0)
        } else {
          setResult({
            success: false,
            successCount: 0,
            errorCount: patients.length,
            message: data.error || '문자 발송에 실패했습니다.'
          })
        }
      } else {
        // 개별 발송 (환자명이 다른 경우)
        let successCount = 0
        let errorCount = 0

        for (let i = 0; i < patients.length; i++) {
          const response = await fetch('/api/recall/sms', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              clinic_id: clinicId,
              receivers: [patients[i].phone_number],
              message: personalizedMessages[i]
            })
          })

          const data = await response.json()
          if (data.success) {
            successCount++
          } else {
            errorCount++
          }
        }

        setResult({
          success: successCount > 0,
          successCount,
          errorCount,
          message: `${successCount}건 발송 완료, ${errorCount}건 실패`
        })
        onSendComplete(successCount, errorCount)
      }

    } catch (error) {
      console.error('SMS send error:', error)
      setResult({
        success: false,
        successCount: 0,
        errorCount: patients.length,
        message: '문자 발송 중 오류가 발생했습니다.'
      })
    } finally {
      setIsSending(false)
    }
  }

  // 메시지 바이트 수 계산
  const getByteLength = (str: string): number => {
    return new Blob([str]).size
  }

  const messageByteLength = getByteLength(message)
  const messageType = messageByteLength > 90 ? 'LMS' : 'SMS'

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">문자 발송</h3>
              <p className="text-sm text-gray-500">{patients.length}명에게 발송</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* 내용 */}
        <div className="p-4 space-y-4">
          {/* 수신자 목록 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              <Users className="w-4 h-4 inline mr-1" />
              수신자 ({patients.length}명)
            </label>
            <div className="max-h-24 overflow-y-auto bg-gray-50 rounded-lg p-2 text-sm">
              {patients.slice(0, 10).map((patient, index) => (
                <span key={patient.id} className="inline-block mr-2 mb-1">
                  {patient.patient_name}
                  {index < Math.min(patients.length, 10) - 1 && ','}
                </span>
              ))}
              {patients.length > 10 && (
                <span className="text-gray-500">외 {patients.length - 10}명</span>
              )}
            </div>
          </div>

          {/* 템플릿 선택 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              템플릿 선택
            </label>
            {loadingTemplates ? (
              <div className="text-sm text-gray-500">로딩 중...</div>
            ) : templates.length > 0 ? (
              <select
                value={selectedTemplateId}
                onChange={(e) => handleTemplateChange(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded-lg"
              >
                <option value="">직접 입력</option>
                {templates.map(template => (
                  <option key={template.id} value={template.id}>
                    {template.name} {template.is_default && '(기본)'}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-sm text-gray-500">저장된 템플릿이 없습니다.</p>
            )}
          </div>

          {/* 메시지 입력 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700">
                메시지 내용
              </label>
              <span className={`text-xs ${messageByteLength > 90 ? 'text-orange-600' : 'text-gray-500'}`}>
                {messageByteLength}byte ({messageType})
              </span>
            </div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              placeholder="메시지를 입력하세요...&#10;&#10;사용 가능한 변수:&#10;{환자명} - 환자 이름&#10;{병원명} - 병원 이름&#10;{전화번호} - 병원 전화번호"
              className="w-full p-3 border border-gray-300 rounded-lg resize-none"
            />
          </div>

          {/* 변수 안내 */}
          <div className="bg-blue-50 rounded-lg p-3">
            <p className="text-sm text-blue-700">
              <strong>사용 가능한 변수:</strong>
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              {['{환자명}', '{병원명}', '{전화번호}'].map(variable => (
                <button
                  key={variable}
                  onClick={() => setMessage(prev => prev + variable)}
                  className="px-2 py-1 bg-white text-blue-600 text-xs rounded border border-blue-200 hover:bg-blue-100"
                >
                  {variable}
                </button>
              ))}
            </div>
          </div>

          {/* 결과 메시지 */}
          {result && (
            <div className={`flex items-center gap-2 p-3 rounded-lg ${
              result.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'
            }`}>
              {result.success ? (
                <CheckCircle className="w-5 h-5 flex-shrink-0" />
              ) : (
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
              )}
              <div>
                <p className="font-medium">{result.message}</p>
                {result.successCount > 0 && (
                  <p className="text-sm">성공: {result.successCount}건</p>
                )}
                {result.errorCount > 0 && (
                  <p className="text-sm">실패: {result.errorCount}건</p>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 푸터 */}
        <div className="flex justify-end gap-3 p-4 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            {result ? '닫기' : '취소'}
          </button>
          {!result && (
            <button
              onClick={handleSend}
              disabled={isSending || !message.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSending ? (
                <>
                  <span className="animate-spin">⏳</span>
                  발송 중...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  발송하기
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
