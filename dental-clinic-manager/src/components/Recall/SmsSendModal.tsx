'use client'

import { useState, useEffect } from 'react'
import { X, Send, MessageSquare, Users, AlertCircle, CheckCircle } from 'lucide-react'
import type { RecallPatient, RecallSmsTemplate } from '@/types/recall'
import { recallSmsTemplateService } from '@/lib/recallService'

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
      const defaultTemplate = response.data.find(t => t.is_default)
      if (defaultTemplate) {
        setSelectedTemplateId(defaultTemplate.id)
        setMessage(applyVariables(defaultTemplate.content))
      }
    }
    setLoadingTemplates(false)
  }

  const applyVariables = (content: string, patientName?: string): string => {
    return content
      .replace(/\{환자명\}/g, patientName || '{환자명}')
      .replace(/\{병원명\}/g, clinicName)
      .replace(/\{전화번호\}/g, clinicPhone)
  }

  const handleTemplateChange = (templateId: string) => {
    setSelectedTemplateId(templateId)
    const template = templates.find(t => t.id === templateId)
    if (template) {
      setMessage(applyVariables(template.content))
    }
  }

  const handleSend = async () => {
    if (!message.trim()) return

    setIsSending(true)
    setResult(null)

    try {
      const receivers = patients.map(p => p.phone_number)
      const personalizedMessages = patients.map(p => applyVariables(message, p.patient_name))

      const isUniformMessage = new Set(personalizedMessages).size === 1

      if (isUniformMessage) {
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

  const getByteLength = (str: string): number => {
    return new Blob([str]).size
  }

  const messageByteLength = getByteLength(message)
  const messageType = messageByteLength > 90 ? 'LMS' : 'SMS'

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-at-card w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-4 border-b border-at-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-at-tag flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-at-accent" />
            </div>
            <div>
              <h3 className="font-semibold text-at-text">문자 발송</h3>
              <p className="text-sm text-at-text-weak">{patients.length}명에게 발송</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-at-text-weak hover:text-at-text-secondary"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* 내용 */}
        <div className="p-4 space-y-4">
          {/* 수신자 목록 */}
          <div>
            <label className="block text-sm font-medium text-at-text-secondary mb-2">
              <Users className="w-4 h-4 inline mr-1" />
              수신자 ({patients.length}명)
            </label>
            <div className="max-h-24 overflow-y-auto bg-at-surface-alt rounded-lg p-2 text-sm">
              {patients.slice(0, 10).map((patient, index) => (
                <span key={patient.id} className="inline-block mr-2 mb-1">
                  {patient.patient_name}
                  {index < Math.min(patients.length, 10) - 1 && ','}
                </span>
              ))}
              {patients.length > 10 && (
                <span className="text-at-text-weak">외 {patients.length - 10}명</span>
              )}
            </div>
          </div>

          {/* 템플릿 선택 */}
          <div>
            <label className="block text-sm font-medium text-at-text-secondary mb-2">
              템플릿 선택
            </label>
            {loadingTemplates ? (
              <div className="text-sm text-at-text-weak">로딩 중...</div>
            ) : templates.length > 0 ? (
              <select
                value={selectedTemplateId}
                onChange={(e) => handleTemplateChange(e.target.value)}
                className="w-full p-2 border border-at-border rounded-xl"
              >
                <option value="">직접 입력</option>
                {templates.map(template => (
                  <option key={template.id} value={template.id}>
                    {template.name} {template.is_default && '(기본)'}
                  </option>
                ))}
              </select>
            ) : (
              <p className="text-sm text-at-text-weak">저장된 템플릿이 없습니다.</p>
            )}
          </div>

          {/* 메시지 입력 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-at-text-secondary">
                메시지 내용
              </label>
              <span className={`text-xs ${messageByteLength > 90 ? 'text-at-warning' : 'text-at-text-weak'}`}>
                {messageByteLength}byte ({messageType})
              </span>
            </div>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              placeholder="메시지를 입력하세요...&#10;&#10;사용 가능한 변수:&#10;{환자명} - 환자 이름&#10;{병원명} - 병원 이름&#10;{전화번호} - 병원 전화번호"
              className="w-full p-3 border border-at-border rounded-xl resize-none"
            />
          </div>

          {/* 변수 안내 */}
          <div className="bg-at-accent-light rounded-xl p-3">
            <p className="text-sm text-at-accent">
              <strong>사용 가능한 변수:</strong>
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              {['{환자명}', '{병원명}', '{전화번호}'].map(variable => (
                <button
                  key={variable}
                  onClick={() => setMessage(prev => prev + variable)}
                  className="px-2 py-1 bg-white text-at-accent text-xs rounded-lg border border-at-border hover:bg-at-tag"
                >
                  {variable}
                </button>
              ))}
            </div>
          </div>

          {/* 결과 메시지 */}
          {result && (
            <div className={`flex items-center gap-2 p-3 rounded-xl ${
              result.success ? 'bg-at-success-bg text-at-success' : 'bg-at-error-bg text-at-error'
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
        <div className="flex justify-end gap-3 p-4 border-t border-at-border">
          <button
            onClick={onClose}
            className="px-4 py-2 text-at-text-secondary border border-at-border rounded-xl hover:bg-at-surface-hover"
          >
            {result ? '닫기' : '취소'}
          </button>
          {!result && (
            <button
              onClick={handleSend}
              disabled={isSending || !message.trim()}
              className="px-4 py-2 bg-at-accent text-white rounded-xl hover:bg-at-accent-hover disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
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
