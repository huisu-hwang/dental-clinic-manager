'use client'

import { useState } from 'react'
import { NOTICE_TEMPLATE_LABELS, type NoticeTemplate } from '@/types/marketing'

// ============================================
// 병원 공지글 작성 폼 (6가지 템플릿 통합)
// ============================================

interface NoticeFormProps {
  onGenerate: (template: NoticeTemplate, data: Record<string, string>) => void
  isGenerating: boolean
}

// 템플릿별 필드 정의
const TEMPLATE_FIELDS: Record<NoticeTemplate, { key: string; label: string; placeholder: string; required: boolean; multiline?: boolean }[]> = {
  holiday: [
    { key: 'holiday_name', label: '연휴/휴진명', placeholder: '설 연휴', required: true },
    { key: 'closed_from', label: '휴진 시작일', placeholder: '2026-01-28', required: true },
    { key: 'closed_to', label: '휴진 종료일', placeholder: '2026-01-30', required: true },
    { key: 'resume_date', label: '정상 진료 재개일', placeholder: '2026-01-31', required: true },
    { key: 'emergency_contact', label: '응급 연락처', placeholder: '010-1234-5678', required: false },
    { key: 'additional_note', label: '추가 안내', placeholder: '', required: false, multiline: true },
  ],
  schedule: [
    { key: 'change_detail', label: '변경 내용', placeholder: '평일 진료시간: 09:00~18:00 → 09:00~19:00', required: true, multiline: true },
    { key: 'effective_date', label: '적용일', placeholder: '2026-04-01', required: true },
    { key: 'reason', label: '변경 이유', placeholder: '환자분들의 편의를 위해', required: false },
    { key: 'additional_note', label: '추가 안내', placeholder: '', required: false, multiline: true },
  ],
  event: [
    { key: 'event_name', label: '이벤트명', placeholder: '개원 3주년 감사 이벤트', required: true },
    { key: 'event_period', label: '기간', placeholder: '2026-04-01 ~ 2026-04-30', required: true },
    { key: 'event_detail', label: '이벤트 내용', placeholder: '스케일링 무료 제공', required: true, multiline: true },
    { key: 'conditions', label: '조건/대상', placeholder: '신규 내원 환자 대상', required: false },
    { key: 'additional_note', label: '추가 안내', placeholder: '', required: false, multiline: true },
  ],
  equipment: [
    { key: 'equipment_name', label: '장비/시설명', placeholder: '3D CT 촬영 장비', required: true },
    { key: 'intro_date', label: '도입일', placeholder: '2026-04-01', required: true },
    { key: 'benefits', label: '환자 혜택', placeholder: '더 정밀한 진단이 가능해집니다', required: true, multiline: true },
    { key: 'additional_note', label: '추가 안내', placeholder: '', required: false, multiline: true },
  ],
  staff: [
    { key: 'staff_name', label: '이름', placeholder: '김하얀', required: true },
    { key: 'position', label: '직위', placeholder: '치과의사', required: true },
    { key: 'specialty', label: '전공/경력', placeholder: '보존과 전문의, 00대학교 치의학대학원', required: false },
    { key: 'greeting', label: '인사말', placeholder: '', required: false, multiline: true },
    { key: 'additional_note', label: '추가 안내', placeholder: '', required: false, multiline: true },
  ],
  general: [
    { key: 'notice_title', label: '공지 제목', placeholder: '주차장 이용 안내', required: true },
    { key: 'notice_content', label: '공지 내용', placeholder: '', required: true, multiline: true },
    { key: 'additional_note', label: '추가 안내', placeholder: '', required: false, multiline: true },
  ],
}

export default function NoticeForm({ onGenerate, isGenerating }: NoticeFormProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<NoticeTemplate>('holiday')
  const [formData, setFormData] = useState<Record<string, string>>({})

  const fields = TEMPLATE_FIELDS[selectedTemplate]

  const handleTemplateChange = (template: NoticeTemplate) => {
    setSelectedTemplate(template)
    setFormData({})
  }

  const handleFieldChange = (key: string, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }))
  }

  const handleSubmit = () => {
    const missingRequired = fields
      .filter((f) => f.required && !formData[f.key]?.trim())
      .map((f) => f.label)

    if (missingRequired.length > 0) {
      alert(`필수 항목을 입력해주세요: ${missingRequired.join(', ')}`)
      return
    }

    onGenerate(selectedTemplate, formData)
  }

  return (
    <div className="space-y-6">
      {/* 템플릿 선택 */}
      <div>
        <label className="block text-sm font-medium text-at-text mb-2">공지 유형</label>
        <div className="grid grid-cols-3 gap-2">
          {(Object.entries(NOTICE_TEMPLATE_LABELS) as [NoticeTemplate, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => handleTemplateChange(key)}
              className={`px-3 py-2 text-sm rounded-xl border transition-colors ${
                selectedTemplate === key
                  ? 'bg-indigo-50 border-indigo-300 text-indigo-700 font-medium'
                  : 'bg-white border-at-border text-at-text hover:border-at-border'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 동적 필드 */}
      <div className="space-y-4">
        {fields.map((field) => (
          <div key={field.key}>
            <label className="block text-sm font-medium text-at-text mb-1">
              {field.label} {field.required && <span className="text-red-500">*</span>}
            </label>
            {field.multiline ? (
              <textarea
                value={formData[field.key] || ''}
                onChange={(e) => handleFieldChange(field.key, e.target.value)}
                placeholder={field.placeholder}
                rows={3}
                className="w-full px-3 py-2 border border-at-border rounded-xl focus:ring-2 focus:ring-at-accent focus:border-indigo-500 text-sm resize-y"
              />
            ) : (
              <input
                type={field.key.includes('date') ? 'date' : 'text'}
                value={formData[field.key] || ''}
                onChange={(e) => handleFieldChange(field.key, e.target.value)}
                placeholder={field.placeholder}
                className="w-full px-3 py-2 border border-at-border rounded-xl focus:ring-2 focus:ring-at-accent focus:border-indigo-500 text-sm"
              />
            )}
          </div>
        ))}
      </div>

      {/* 생성 버튼 */}
      <button
        onClick={handleSubmit}
        disabled={isGenerating}
        className="w-full py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
      >
        {isGenerating ? '공지문 생성 중...' : '공지문 생성'}
      </button>
    </div>
  )
}
