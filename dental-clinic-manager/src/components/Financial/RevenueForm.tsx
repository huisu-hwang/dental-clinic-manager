'use client'

import { useState, useRef } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import {
  RevenueFormData,
  DataSourceType,
  DATA_SOURCE_LABELS,
} from '@/types/financial'
import { formatCurrency } from '@/utils/taxCalculationUtils'
import { Upload, FileSpreadsheet, Image, X, Loader2, Check, AlertCircle } from 'lucide-react'

interface RevenueFormProps {
  clinicId: string
  year: number
  month: number
  initialData?: Partial<RevenueFormData>
  onSave: () => void
  onCancel: () => void
}

export default function RevenueForm({
  clinicId,
  year,
  month,
  initialData,
  onSave,
  onCancel,
}: RevenueFormProps) {
  const { user } = useAuth()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [formData, setFormData] = useState<RevenueFormData>({
    year,
    month,
    insurance_revenue: initialData?.insurance_revenue || 0,
    insurance_patient_count: initialData?.insurance_patient_count || 0,
    non_insurance_revenue: initialData?.non_insurance_revenue || 0,
    non_insurance_patient_count: initialData?.non_insurance_patient_count || 0,
    other_revenue: initialData?.other_revenue || 0,
    other_revenue_description: initialData?.other_revenue_description || '',
    source_type: initialData?.source_type || 'manual',
    notes: initialData?.notes || '',
  })

  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadedFile, setUploadedFile] = useState<{ name: string; url?: string } | null>(null)
  const [parseResult, setParseResult] = useState<{
    success: boolean
    message: string
    data?: Record<string, unknown>
  } | null>(null)

  // 총 수입 계산
  const totalRevenue =
    formData.insurance_revenue + formData.non_insurance_revenue + formData.other_revenue

  // 입력값 변경 핸들러
  const handleChange = (field: keyof RevenueFormData, value: string | number) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }))
  }

  // 숫자 입력 핸들러
  const handleNumberChange = (field: keyof RevenueFormData, value: string) => {
    const num = parseInt(value.replace(/[^0-9]/g, ''), 10) || 0
    handleChange(field, num)
  }

  // 파일 업로드 및 파싱
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setParseResult(null)

    try {
      // 파일 파싱 API 호출
      const formDataToSend = new FormData()
      formDataToSend.append('file', file)

      const response = await fetch('/api/financial/parse-file', {
        method: 'POST',
        body: formDataToSend,
      })

      const result = await response.json()

      if (result.success) {
        setUploadedFile({ name: file.name })

        // 파싱된 데이터 적용
        const data = result.data
        if (data.insurance_revenue) {
          setFormData(prev => ({
            ...prev,
            insurance_revenue: data.insurance_revenue,
            source_type: result.type === 'excel' ? 'excel' : 'image',
          }))
        }
        if (data.non_insurance_revenue) {
          setFormData(prev => ({
            ...prev,
            non_insurance_revenue: data.non_insurance_revenue,
          }))
        }
        if (data.insurance_patient_count) {
          setFormData(prev => ({
            ...prev,
            insurance_patient_count: data.insurance_patient_count,
          }))
        }
        if (data.non_insurance_patient_count) {
          setFormData(prev => ({
            ...prev,
            non_insurance_patient_count: data.non_insurance_patient_count,
          }))
        }

        setParseResult({
          success: true,
          message: '파일에서 데이터를 추출했습니다. 확인 후 저장하세요.',
          data: data,
        })
      } else {
        setParseResult({
          success: false,
          message: result.error || '파일 파싱에 실패했습니다.',
        })
      }
    } catch (error) {
      console.error('File upload error:', error)
      setParseResult({
        success: false,
        message: '파일 업로드 중 오류가 발생했습니다.',
      })
    } finally {
      setUploading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  // 저장
  const handleSave = async () => {
    if (!user?.clinic_id) return

    setSaving(true)
    try {
      const response = await fetch('/api/financial/revenue', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinicId: user.clinic_id,
          ...formData,
          userId: user.id,
          source_file_url: uploadedFile?.url,
          source_file_name: uploadedFile?.name,
        }),
      })

      const result = await response.json()

      if (result.success) {
        onSave()
      } else {
        alert(result.error || '저장에 실패했습니다.')
      }
    } catch (error) {
      console.error('Save error:', error)
      alert('저장 중 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border p-6">
      <h3 className="text-lg font-semibold mb-4">
        {year}년 {month}월 수입 입력
      </h3>

      {/* 파일 업로드 영역 */}
      <div className="mb-6 p-4 border-2 border-dashed border-gray-300 rounded-lg bg-gray-50">
        <div className="text-center">
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,image/*"
            onChange={handleFileUpload}
            className="hidden"
            id="revenue-file-upload"
          />
          <label
            htmlFor="revenue-file-upload"
            className="cursor-pointer inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            {uploading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                파일 분석 중...
              </>
            ) : (
              <>
                <Upload className="w-5 h-5" />
                엑셀 또는 이미지 업로드
              </>
            )}
          </label>
          <p className="mt-2 text-sm text-gray-500">
            <FileSpreadsheet className="inline w-4 h-4 mr-1" />
            엑셀 파일 (.xlsx, .xls) 또는
            <Image className="inline w-4 h-4 ml-2 mr-1" />
            이미지 파일 (캡처 화면)을 업로드하면 자동으로 데이터를 추출합니다.
          </p>
        </div>

        {/* 업로드된 파일 표시 */}
        {uploadedFile && (
          <div className="mt-3 flex items-center justify-center gap-2 text-sm">
            <Check className="w-4 h-4 text-green-600" />
            <span className="text-gray-700">{uploadedFile.name}</span>
            <button
              onClick={() => {
                setUploadedFile(null)
                setParseResult(null)
              }}
              className="text-gray-400 hover:text-red-500"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* 파싱 결과 메시지 */}
        {parseResult && (
          <div
            className={`mt-3 p-3 rounded-lg text-sm ${
              parseResult.success
                ? 'bg-green-50 text-green-700 border border-green-200'
                : 'bg-red-50 text-red-700 border border-red-200'
            }`}
          >
            {parseResult.success ? (
              <Check className="inline w-4 h-4 mr-1" />
            ) : (
              <AlertCircle className="inline w-4 h-4 mr-1" />
            )}
            {parseResult.message}
          </div>
        )}
      </div>

      {/* 수입 입력 폼 */}
      <div className="space-y-4">
        {/* 보험 진료 수입 */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              보험 진료 수입
            </label>
            <div className="relative">
              <input
                type="text"
                value={formData.insurance_revenue.toLocaleString()}
                onChange={e => handleNumberChange('insurance_revenue', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-right"
                placeholder="0"
              />
              <span className="absolute right-3 top-2 text-gray-400">원</span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              보험 환자 수
            </label>
            <div className="relative">
              <input
                type="text"
                value={formData.insurance_patient_count.toLocaleString()}
                onChange={e => handleNumberChange('insurance_patient_count', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-right"
                placeholder="0"
              />
              <span className="absolute right-3 top-2 text-gray-400">명</span>
            </div>
          </div>
        </div>

        {/* 비보험 진료 수입 */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              비보험 진료 수입
            </label>
            <div className="relative">
              <input
                type="text"
                value={formData.non_insurance_revenue.toLocaleString()}
                onChange={e => handleNumberChange('non_insurance_revenue', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-right"
                placeholder="0"
              />
              <span className="absolute right-3 top-2 text-gray-400">원</span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              비보험 환자 수
            </label>
            <div className="relative">
              <input
                type="text"
                value={formData.non_insurance_patient_count.toLocaleString()}
                onChange={e => handleNumberChange('non_insurance_patient_count', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-right"
                placeholder="0"
              />
              <span className="absolute right-3 top-2 text-gray-400">명</span>
            </div>
          </div>
        </div>

        {/* 기타 수입 */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              기타 수입 (정부지원금 등)
            </label>
            <div className="relative">
              <input
                type="text"
                value={formData.other_revenue.toLocaleString()}
                onChange={e => handleNumberChange('other_revenue', e.target.value)}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-right"
                placeholder="0"
              />
              <span className="absolute right-3 top-2 text-gray-400">원</span>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              기타 수입 설명
            </label>
            <input
              type="text"
              value={formData.other_revenue_description}
              onChange={e => handleChange('other_revenue_description', e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="정부 지원금, 보조금 등"
            />
          </div>
        </div>

        {/* 데이터 소스 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            데이터 입력 방식
          </label>
          <select
            value={formData.source_type}
            onChange={e => handleChange('source_type', e.target.value as DataSourceType)}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            {Object.entries(DATA_SOURCE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </div>

        {/* 메모 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            메모
          </label>
          <textarea
            value={formData.notes}
            onChange={e => handleChange('notes', e.target.value)}
            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            rows={2}
            placeholder="추가 메모 사항"
          />
        </div>

        {/* 총 수입 표시 */}
        <div className="bg-blue-50 rounded-lg p-4">
          <div className="flex justify-between items-center">
            <span className="text-lg font-semibold text-gray-700">총 수입</span>
            <span className="text-2xl font-bold text-blue-600">
              {formatCurrency(totalRevenue)}
            </span>
          </div>
        </div>

        {/* 버튼 */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                저장 중...
              </>
            ) : (
              '저장'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
