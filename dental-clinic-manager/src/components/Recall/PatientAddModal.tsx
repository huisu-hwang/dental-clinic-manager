'use client'

import { useState } from 'react'
import {
  X,
  UserPlus,
  User,
  Phone,
  FileText,
  Calendar,
  Clipboard,
  AlertCircle
} from 'lucide-react'
import type { RecallPatientFormData, Gender, RecallExcludeReason } from '@/types/recall'
import { GENDER_LABELS, EXCLUDE_REASON_LABELS } from '@/types/recall'
import { recallPatientService } from '@/lib/recallService'

interface PatientAddModalProps {
  isOpen: boolean
  onClose: () => void
  campaignId?: string
  onAddComplete: () => void
}

export default function PatientAddModal({
  isOpen,
  onClose,
  campaignId,
  onAddComplete
}: PatientAddModalProps) {
  const [formData, setFormData] = useState<RecallPatientFormData>({
    patient_name: '',
    phone_number: '',
    chart_number: '',
    birth_date: '',
    gender: undefined,
    last_visit_date: '',
    treatment_type: '',
    notes: ''
  })
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [excludeConfirm, setExcludeConfirm] = useState<{
    show: boolean
    reason: RecallExcludeReason | null
    ruleName?: string
  }>({ show: false, reason: null })

  const resetForm = () => {
    setFormData({
      patient_name: '',
      phone_number: '',
      chart_number: '',
      birth_date: '',
      gender: undefined,
      last_visit_date: '',
      treatment_type: '',
      notes: ''
    })
    setError(null)
  }

  const handleChange = (field: keyof RecallPatientFormData, value: string | Gender | undefined) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const formatPhoneNumber = (value: string): string => {
    const numbers = value.replace(/\D/g, '')
    if (numbers.length <= 3) {
      return numbers
    } else if (numbers.length <= 7) {
      return `${numbers.slice(0, 3)}-${numbers.slice(3)}`
    } else if (numbers.length <= 11) {
      return `${numbers.slice(0, 3)}-${numbers.slice(3, 7)}-${numbers.slice(7)}`
    }
    return numbers.slice(0, 13)
  }

  const handlePhoneChange = (value: string) => {
    const formatted = formatPhoneNumber(value)
    handleChange('phone_number', formatted)
  }

  const validateForm = (): boolean => {
    if (!formData.patient_name.trim()) {
      setError('환자 이름을 입력해주세요.')
      return false
    }
    if (!formData.phone_number.trim()) {
      setError('전화번호를 입력해주세요.')
      return false
    }
    const phoneNumbers = formData.phone_number.replace(/\D/g, '')
    if (phoneNumbers.length < 10 || phoneNumbers.length > 11) {
      setError('올바른 전화번호를 입력해주세요.')
      return false
    }
    return true
  }

  const doSave = async (excludeReason?: RecallExcludeReason | null) => {
    setIsSaving(true)
    setError(null)

    try {
      const dataToSave = excludeReason
        ? { ...formData, exclude_reason: excludeReason }
        : formData

      const result = await recallPatientService.addPatient(dataToSave, campaignId)

      if (result.success) {
        onAddComplete()
        resetForm()
        onClose()
      } else {
        setError(result.error || '환자 추가에 실패했습니다.')
      }
    } catch (err) {
      console.error('Patient add error:', err)
      setError('환자 추가 중 오류가 발생했습니다.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleSave = async () => {
    if (!validateForm()) return

    setIsSaving(true)
    setError(null)

    try {
      const { matched, rules } = await recallPatientService.checkExcludeRules(
        formData.patient_name,
        formData.phone_number,
        formData.chart_number
      )

      if (matched && rules.length > 0) {
        const rule = rules[0]
        setExcludeConfirm({
          show: true,
          reason: rule.exclude_reason as RecallExcludeReason,
          ruleName: rule.patient_name || formData.patient_name
        })
        setIsSaving(false)
        return
      }

      await doSave()
    } catch (err) {
      console.error('Patient add error:', err)
      setError('환자 추가 중 오류가 발생했습니다.')
      setIsSaving(false)
    }
  }

  const handleConfirmAdd = async () => {
    setExcludeConfirm({ show: false, reason: null })
    await doSave()
  }

  const handleCancelAdd = () => {
    setExcludeConfirm({ show: false, reason: null })
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  if (!isOpen) return null

  const inputClass = "w-full p-2.5 border border-at-border rounded-xl text-sm focus:ring-2 focus:ring-at-accent focus:border-at-accent"

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-at-card w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-4 border-b border-at-border">
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-at-accent" />
            <h3 className="font-semibold text-at-text">환자 추가</h3>
          </div>
          <button
            onClick={handleClose}
            className="text-at-text-weak hover:text-at-text-secondary"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* 내용 */}
        <div className="p-4 space-y-4">
          {/* 에러 메시지 */}
          {error && (
            <div className="flex items-center gap-2 p-3 bg-at-error-bg text-at-error rounded-xl">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <p className="text-sm">{error}</p>
            </div>
          )}

          {/* 환자 이름 (필수) */}
          <div>
            <label className="block text-sm font-medium text-at-text-secondary mb-1">
              <span className="flex items-center gap-1">
                <User className="w-4 h-4" />
                환자 이름 <span className="text-at-error">*</span>
              </span>
            </label>
            <input
              type="text"
              value={formData.patient_name}
              onChange={(e) => handleChange('patient_name', e.target.value)}
              placeholder="홍길동"
              className={inputClass}
            />
          </div>

          {/* 전화번호 (필수) */}
          <div>
            <label className="block text-sm font-medium text-at-text-secondary mb-1">
              <span className="flex items-center gap-1">
                <Phone className="w-4 h-4" />
                전화번호 <span className="text-at-error">*</span>
              </span>
            </label>
            <input
              type="tel"
              value={formData.phone_number}
              onChange={(e) => handlePhoneChange(e.target.value)}
              placeholder="010-1234-5678"
              className={inputClass}
            />
          </div>

          {/* 차트번호 */}
          <div>
            <label className="block text-sm font-medium text-at-text-secondary mb-1">
              <span className="flex items-center gap-1">
                <FileText className="w-4 h-4" />
                차트번호
              </span>
            </label>
            <input
              type="text"
              value={formData.chart_number}
              onChange={(e) => handleChange('chart_number', e.target.value)}
              placeholder="C-12345"
              className={inputClass}
            />
          </div>

          {/* 생년월일 & 성별 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-at-text-secondary mb-1">
                <span className="flex items-center gap-1">
                  <Calendar className="w-4 h-4" />
                  생년월일
                </span>
              </label>
              <input
                type="date"
                value={formData.birth_date}
                onChange={(e) => handleChange('birth_date', e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-at-text-secondary mb-1">
                성별
              </label>
              <select
                value={formData.gender || ''}
                onChange={(e) => handleChange('gender', e.target.value as Gender || undefined)}
                className={inputClass}
              >
                <option value="">선택안함</option>
                {(Object.keys(GENDER_LABELS) as Gender[]).map(gender => (
                  <option key={gender} value={gender}>
                    {GENDER_LABELS[gender]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* 마지막 내원일 & 치료 종류 */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-at-text-secondary mb-1">
                마지막 내원일
              </label>
              <input
                type="date"
                value={formData.last_visit_date}
                onChange={(e) => handleChange('last_visit_date', e.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-at-text-secondary mb-1">
                치료 종류
              </label>
              <input
                type="text"
                value={formData.treatment_type}
                onChange={(e) => handleChange('treatment_type', e.target.value)}
                placeholder="스케일링"
                className={inputClass}
              />
            </div>
          </div>

          {/* 메모 */}
          <div>
            <label className="block text-sm font-medium text-at-text-secondary mb-1">
              <span className="flex items-center gap-1">
                <Clipboard className="w-4 h-4" />
                메모
              </span>
            </label>
            <textarea
              value={formData.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              rows={3}
              placeholder="환자에 대한 추가 메모..."
              className="w-full p-2.5 border border-at-border rounded-xl text-sm resize-none focus:ring-2 focus:ring-at-accent focus:border-at-accent"
            />
          </div>
        </div>

        {/* 제외 환자 확인 다이얼로그 */}
        {excludeConfirm.show && (
          <div className="mx-4 mb-4 p-4 bg-at-warning-bg border border-amber-200 rounded-xl">
            <div className="flex items-start gap-2 mb-3">
              <AlertCircle className="w-5 h-5 text-at-warning flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800">
                  제외 환자 목록에 등록된 환자입니다
                </p>
                <p className="text-sm text-amber-700 mt-1">
                  &quot;{excludeConfirm.ruleName}&quot; 환자가 제외 사유 <span className="font-semibold">&quot;{excludeConfirm.reason ? EXCLUDE_REASON_LABELS[excludeConfirm.reason] : ''}&quot;</span>(으)로 등록되어 있습니다. 그래도 환자 목록에 추가하시겠습니까?
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={handleCancelAdd}
                disabled={isSaving}
                className="px-3 py-1.5 text-sm text-at-text-secondary border border-at-border rounded-xl hover:bg-at-surface-hover disabled:opacity-50"
              >
                추가하지 않기
              </button>
              <button
                onClick={handleConfirmAdd}
                disabled={isSaving}
                className="px-3 py-1.5 text-sm bg-at-accent text-white rounded-xl hover:bg-at-accent-hover disabled:opacity-50"
              >
                그래도 추가
              </button>
            </div>
          </div>
        )}

        {/* 푸터 */}
        <div className="flex justify-end gap-3 p-4 border-t border-at-border">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-at-text-secondary border border-at-border rounded-xl hover:bg-at-surface-hover"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving || excludeConfirm.show}
            className="px-4 py-2 bg-at-accent text-white rounded-xl hover:bg-at-accent-hover disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSaving ? (
              <>
                <span className="animate-spin">⏳</span>
                저장 중...
              </>
            ) : (
              <>
                <UserPlus className="w-4 h-4" />
                추가
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
