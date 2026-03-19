'use client'

import { useState } from 'react'
import {
  PhotoIcon,
  ExclamationTriangleIcon,
  ShieldCheckIcon,
} from '@heroicons/react/24/outline'
import { TONE_LABELS, type ToneType } from '@/types/marketing'

// ============================================
// 임상글 작성 폼
// 임상 사진 업로드 + 시술 정보 입력 + 동의서 확인
// ============================================

interface ClinicalFormProps {
  onGenerate: (data: ClinicalFormData) => void
  isGenerating: boolean
}

export interface ClinicalFormData {
  procedureType: string
  procedureDetail: string
  duration: string
  patientAge: string
  patientGender: string
  chiefComplaint: string
  tone: ToneType
  useResearch: boolean
  patientConsent: boolean
  photos: { type: string; file: File; caption: string }[]
}

const PROCEDURE_TYPES = [
  '임플란트', '교정', '미백', '충치치료', '신경치료',
  '크라운', '브릿지', '라미네이트', '잇몸치료', '사랑니발치', '기타',
]

const PHOTO_TYPES = [
  { value: 'before', label: '시술 전' },
  { value: 'after', label: '시술 후' },
  { value: 'process', label: '시술 과정' },
  { value: 'xray', label: 'X-ray / CT' },
]

export default function ClinicalForm({ onGenerate, isGenerating }: ClinicalFormProps) {
  const [procedureType, setProcedureType] = useState('')
  const [procedureDetail, setProcedureDetail] = useState('')
  const [duration, setDuration] = useState('')
  const [patientAge, setPatientAge] = useState('')
  const [patientGender, setPatientGender] = useState('')
  const [chiefComplaint, setChiefComplaint] = useState('')
  const [tone, setTone] = useState<ToneType>('warm')
  const [useResearch, setUseResearch] = useState(false)
  const [patientConsent, setPatientConsent] = useState(false)
  const [photos, setPhotos] = useState<{ type: string; file: File; caption: string }[]>([])

  const handlePhotoAdd = (type: string, files: FileList | null) => {
    if (!files?.length) return
    const newPhotos = Array.from(files).map((file) => ({
      type,
      file,
      caption: '',
    }))
    setPhotos((prev) => [...prev, ...newPhotos])
  }

  const handlePhotoRemove = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index))
  }

  const handleSubmit = () => {
    if (!procedureType) {
      alert('시술 종류를 선택해주세요.')
      return
    }
    if (!patientConsent) {
      alert('환자 동의서 확인은 필수입니다.')
      return
    }
    if (photos.length === 0) {
      alert('최소 1장의 임상 사진을 업로드해주세요.')
      return
    }

    onGenerate({
      procedureType,
      procedureDetail,
      duration,
      patientAge,
      patientGender,
      chiefComplaint,
      tone,
      useResearch,
      patientConsent,
      photos,
    })
  }

  return (
    <div className="space-y-6">
      {/* 시술 정보 */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <h3 className="text-lg font-semibold text-slate-800">시술 정보</h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              시술 종류 <span className="text-red-500">*</span>
            </label>
            <select
              value={procedureType}
              onChange={(e) => setProcedureType(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            >
              <option value="">선택하세요</option>
              {PROCEDURE_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">시술 기간</label>
            <input
              type="text"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="예: 3개월"
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">시술 상세</label>
          <input
            type="text"
            value={procedureDetail}
            onChange={(e) => setProcedureDetail(e.target.value)}
            placeholder="예: 상악 좌측 제1대구치 임플란트"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">환자 나이대</label>
            <select
              value={patientAge}
              onChange={(e) => setPatientAge(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            >
              <option value="">선택</option>
              {['10대', '20대', '30대', '40대', '50대', '60대', '70대 이상'].map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">성별</label>
            <select
              value={patientGender}
              onChange={(e) => setPatientGender(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            >
              <option value="">선택</option>
              <option value="남성">남성</option>
              <option value="여성">여성</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">어투</label>
            <select
              value={tone}
              onChange={(e) => setTone(e.target.value as ToneType)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
            >
              {Object.entries(TONE_LABELS).map(([v, { label }]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">주소(증상)</label>
          <input
            type="text"
            value={chiefComplaint}
            onChange={(e) => setChiefComplaint(e.target.value)}
            placeholder="예: 어금니 상실로 저작 곤란"
            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm"
          />
        </div>

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={useResearch}
            onChange={(e) => setUseResearch(e.target.checked)}
            className="w-4 h-4 text-indigo-600 border-slate-300 rounded"
          />
          <span className="text-sm text-slate-700">논문 인용 포함</span>
        </label>
      </div>

      {/* 임상 사진 업로드 */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
        <h3 className="text-lg font-semibold text-slate-800">
          임상 사진 <span className="text-red-500">*</span>
        </h3>

        <div className="grid grid-cols-2 gap-3">
          {PHOTO_TYPES.map((pt) => (
            <label
              key={pt.value}
              className="flex flex-col items-center justify-center p-4 border-2 border-dashed border-slate-300 rounded-xl cursor-pointer hover:border-indigo-400 transition-colors"
            >
              <PhotoIcon className="h-8 w-8 text-slate-400 mb-2" />
              <span className="text-sm font-medium text-slate-600">{pt.label}</span>
              <span className="text-xs text-slate-400 mt-1">클릭하여 업로드</span>
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => handlePhotoAdd(pt.value, e.target.files)}
              />
            </label>
          ))}
        </div>

        {photos.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-medium text-slate-700">업로드된 사진 ({photos.length}장)</div>
            {photos.map((photo, i) => (
              <div key={i} className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg">
                <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded">
                  {PHOTO_TYPES.find((t) => t.value === photo.type)?.label}
                </span>
                <span className="text-sm text-slate-600 flex-1 truncate">{photo.file.name}</span>
                <button
                  onClick={() => handlePhotoRemove(i)}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  삭제
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 환자 동의 확인 */}
      <div className={`rounded-xl border-2 p-5 ${
        patientConsent ? 'bg-green-50 border-green-300' : 'bg-amber-50 border-amber-300'
      }`}>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={patientConsent}
            onChange={(e) => setPatientConsent(e.target.checked)}
            className="w-5 h-5 mt-0.5 text-green-600 border-slate-300 rounded"
          />
          <div>
            <div className="flex items-center gap-2">
              {patientConsent ? (
                <ShieldCheckIcon className="h-5 w-5 text-green-600" />
              ) : (
                <ExclamationTriangleIcon className="h-5 w-5 text-amber-600" />
              )}
              <span className="font-medium text-slate-800">
                환자 동의서 확인 <span className="text-red-500">*</span>
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              본 임상 사례 게시에 대해 환자로부터 서면 동의를 받았음을 확인합니다.
              동의서 미확인 시 발행이 차단됩니다.
            </p>
          </div>
        </label>
      </div>

      {/* 생성 버튼 */}
      <button
        onClick={handleSubmit}
        disabled={isGenerating || !patientConsent || !procedureType || photos.length === 0}
        className="w-full py-3 bg-indigo-600 text-white rounded-xl font-medium hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed transition-colors"
      >
        {isGenerating ? '임상글 생성 중...' : '임상글 생성'}
      </button>
    </div>
  )
}
