'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  PhotoIcon,
  ExclamationTriangleIcon,
  ShieldCheckIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  XMarkIcon,
  PencilIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline'
import {
  TONE_LABELS,
  CLINICAL_PHOTO_TYPE_LABELS,
  type ToneType,
  type ClinicalPhotoType,
} from '@/types/marketing'
import ToothChart from './ToothChart'
import ClinicalPhotoEditor from './ClinicalPhotoEditor'
import { loadImageFromFile, applyImageTransforms } from './imageUtils'

// ============================================
// 임상글 작성 폼
// 임상 사진 업로드 (술전/술중/술후) + 시술 정보 입력 + 동의서 확인
// 제어 컴포넌트: onChange로 상위에 데이터 전달
// ============================================

interface LocalClinicalPhoto {
  id: string
  type: ClinicalPhotoType
  file: File
  caption: string
  sort_order: number
  previewUrl: string
  uploadedUrl?: string
  uploading?: boolean
  uploadError?: string
}

export interface ClinicalFormData {
  procedureType: string
  procedureDetail: string
  duration: string
  patientAge: string
  patientGender: string
  chiefComplaint: string
  selectedTeeth: number[]
  tone: ToneType
  useResearch: boolean
  patientConsent: boolean
  photos: LocalClinicalPhoto[]
}

interface ClinicalFormProps {
  onChange: (data: ClinicalFormData) => void
  isGenerating: boolean
}

const PROCEDURE_TYPES = [
  '임플란트', '교정', '미백', '충치치료', '신경치료',
  '크라운', '브릿지', '라미네이트', '잇몸치료', '사랑니발치', '기타',
]

const PHOTO_CATEGORIES: ClinicalPhotoType[] = ['before', 'during', 'after']
const MAX_PHOTOS_PER_CATEGORY = 5
const MAX_TOTAL_PHOTOS = 10

// 이미지 리사이즈 (Claude Vision 토큰 절약 + 업로드 크기 절감)
function resizeImage(file: File, maxWidth: number = 1200): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image()
    const url = URL.createObjectURL(file)
    img.onload = () => {
      URL.revokeObjectURL(url)
      if (img.width <= maxWidth) {
        resolve(file)
        return
      }
      const ratio = maxWidth / img.width
      const canvas = document.createElement('canvas')
      canvas.width = maxWidth
      canvas.height = Math.round(img.height * ratio)
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(new File([blob], file.name, { type: 'image/jpeg' }))
          } else {
            resolve(file)
          }
        },
        'image/jpeg',
        0.85
      )
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(file)
    }
    img.src = url
  })
}

export default function ClinicalForm({ onChange, isGenerating }: ClinicalFormProps) {
  const [procedureType, setProcedureType] = useState('')
  const [procedureDetail, setProcedureDetail] = useState('')
  const [duration, setDuration] = useState('')
  const [patientAge, setPatientAge] = useState('')
  const [patientGender, setPatientGender] = useState('')
  const [chiefComplaint, setChiefComplaint] = useState('')
  const [tone, setTone] = useState<ToneType>('warm')
  const [useResearch, setUseResearch] = useState(false)
  const [patientConsent, setPatientConsent] = useState(false)
  const [selectedTeeth, setSelectedTeeth] = useState<number[]>([])
  const [photos, setPhotos] = useState<LocalClinicalPhoto[]>([])
  const [editingPhoto, setEditingPhoto] = useState<LocalClinicalPhoto | null>(null)

  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({})

  // onChange 콜백 - 데이터 변경 시 상위에 전달
  const emitChange = useCallback(() => {
    onChange({
      procedureType, procedureDetail, duration, patientAge, patientGender,
      chiefComplaint, selectedTeeth, tone, useResearch, patientConsent, photos,
    })
  }, [procedureType, procedureDetail, duration, patientAge, patientGender,
      chiefComplaint, selectedTeeth, tone, useResearch, patientConsent, photos, onChange])

  useEffect(() => {
    emitChange()
  }, [emitChange])

  // URL.createObjectURL 클린업
  useEffect(() => {
    return () => {
      photos.forEach((p) => URL.revokeObjectURL(p.previewUrl))
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 사진 업로드
  const uploadPhoto = async (photo: LocalClinicalPhoto): Promise<string | null> => {
    try {
      const formData = new FormData()
      formData.append('file', photo.file)
      formData.append('photo_type', photo.type)

      const res = await fetch('/api/marketing/clinical-photos/upload', {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const json = await res.json()
        throw new Error(json.error || '업로드 실패')
      }

      const { url } = await res.json()
      return url
    } catch (err) {
      console.error('임상 사진 업로드 실패:', err)
      return null
    }
  }

  // 사진 추가
  const handlePhotoAdd = async (type: ClinicalPhotoType, files: FileList | null) => {
    if (!files?.length) return

    const categoryPhotos = photos.filter((p) => p.type === type)
    const remaining = Math.min(
      MAX_PHOTOS_PER_CATEGORY - categoryPhotos.length,
      MAX_TOTAL_PHOTOS - photos.length,
      files.length
    )

    if (remaining <= 0) return

    const newPhotos: LocalClinicalPhoto[] = []
    for (let i = 0; i < remaining; i++) {
      const resized = await resizeImage(files[i])
      const id = crypto.randomUUID()
      newPhotos.push({
        id,
        type,
        file: resized,
        caption: '',
        sort_order: categoryPhotos.length + i,
        previewUrl: URL.createObjectURL(resized),
        uploading: true,
      })
    }

    setPhotos((prev) => [...prev, ...newPhotos])

    // 병렬 업로드
    for (const photo of newPhotos) {
      const url = await uploadPhoto(photo)
      setPhotos((prev) =>
        prev.map((p) =>
          p.id === photo.id
            ? { ...p, uploading: false, uploadedUrl: url || undefined, uploadError: url ? undefined : '업로드 실패' }
            : p
        )
      )
    }

    // file input 초기화
    const inputRef = fileInputRefs.current[type]
    if (inputRef) inputRef.value = ''
  }

  // 사진 삭제
  const handlePhotoRemove = (id: string) => {
    setPhotos((prev) => {
      const target = prev.find((p) => p.id === id)
      if (target) URL.revokeObjectURL(target.previewUrl)
      const remaining = prev.filter((p) => p.id !== id)
      // sort_order 재계산
      const byType: Record<string, LocalClinicalPhoto[]> = {}
      remaining.forEach((p) => {
        if (!byType[p.type]) byType[p.type] = []
        byType[p.type].push(p)
      })
      return remaining.map((p) => ({
        ...p,
        sort_order: byType[p.type].indexOf(p),
      }))
    })
  }

  // 사진 순서 변경
  const handlePhotoReorder = (id: string, direction: 'up' | 'down') => {
    setPhotos((prev) => {
      const photo = prev.find((p) => p.id === id)
      if (!photo) return prev

      const sameCat = prev
        .filter((p) => p.type === photo.type)
        .sort((a, b) => a.sort_order - b.sort_order)

      const idx = sameCat.findIndex((p) => p.id === id)
      const swapIdx = direction === 'up' ? idx - 1 : idx + 1
      if (swapIdx < 0 || swapIdx >= sameCat.length) return prev

      // 교환
      const tempOrder = sameCat[idx].sort_order
      const newPhotos = prev.map((p) => {
        if (p.id === sameCat[idx].id) return { ...p, sort_order: sameCat[swapIdx].sort_order }
        if (p.id === sameCat[swapIdx].id) return { ...p, sort_order: tempOrder }
        return p
      })
      return newPhotos
    })
  }

  // 사진 편집 완료 → 재업로드
  const handlePhotoEdited = async (photoId: string, newFile: File, newPreviewUrl: string) => {
    // 기존 previewUrl 해제 + 상태 업데이트
    setPhotos((prev) =>
      prev.map((p) => {
        if (p.id !== photoId) return p
        URL.revokeObjectURL(p.previewUrl)
        return { ...p, file: newFile, previewUrl: newPreviewUrl, uploadedUrl: undefined, uploading: true, uploadError: undefined }
      })
    )

    // 재업로드
    const url = await uploadPhoto({ id: photoId, file: newFile } as LocalClinicalPhoto)
    setPhotos((prev) =>
      prev.map((p) =>
        p.id === photoId
          ? { ...p, uploading: false, uploadedUrl: url || undefined, uploadError: url ? undefined : '업로드 실패' }
          : p
      )
    )
  }

  // 전체 사진 밝기/색조 통일
  const handleBatchNormalize = async () => {
    if (photos.length < 2) return

    try {
      // 모든 사진 이미지 로드
      const loaded = await Promise.all(
        photos.map(async (p) => ({
          id: p.id,
          image: await loadImageFromFile(p.file),
        }))
      )

      // 일괄 정규화 계산
      const { computeBatchNormalization } = await import('./imageUtils')
      const adjustments = computeBatchNormalization(loaded)

      // 각 사진에 보정값 적용
      for (const [photoId, adj] of adjustments.entries()) {
        const photo = photos.find((p) => p.id === photoId)
        if (!photo || (adj.brightness === 0 && adj.contrast === 0)) continue

        try {
          const img = loaded.find((l) => l.id === photoId)!.image
          const newFile = await applyImageTransforms(img, {
            brightness: adj.brightness,
            contrast: adj.contrast,
            rotation: 0,
            flipH: false,
            flipV: false,
          })
          const newPreviewUrl = URL.createObjectURL(newFile)

          setPhotos((prev) =>
            prev.map((p) => {
              if (p.id !== photoId) return p
              URL.revokeObjectURL(p.previewUrl)
              return { ...p, file: newFile, previewUrl: newPreviewUrl, uploadedUrl: undefined, uploading: true, uploadError: undefined }
            })
          )

          // 재업로드
          const url = await uploadPhoto({ id: photoId, file: newFile } as LocalClinicalPhoto)
          setPhotos((prev) =>
            prev.map((p) =>
              p.id === photoId
                ? { ...p, uploading: false, uploadedUrl: url || undefined, uploadError: url ? undefined : '업로드 실패' }
                : p
            )
          )
        } catch (err) {
          console.error(`사진 ${photoId} 정규화 실패:`, err)
        }
      }
    } catch (err) {
      console.error('일괄 정규화 실패:', err)
    }
  }

  // 캡션 변경
  const handleCaptionChange = (id: string, caption: string) => {
    setPhotos((prev) => prev.map((p) => (p.id === id ? { ...p, caption } : p)))
  }

  const getPhotosForCategory = (type: ClinicalPhotoType) =>
    photos.filter((p) => p.type === type).sort((a, b) => a.sort_order - b.sort_order)

  const totalPhotos = photos.length

  return (
    <div className="space-y-6">
      {/* 시술 정보 */}
      <div className="bg-white rounded-xl border border-at-border p-6 space-y-4">
        <h3 className="text-lg font-semibold text-at-text">시술 정보</h3>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-at-text mb-1">
              시술 종류 <span className="text-red-500">*</span>
            </label>
            <select
              value={procedureType}
              onChange={(e) => setProcedureType(e.target.value)}
              className="w-full px-3 py-2 border border-at-border rounded-xl text-sm"
            >
              <option value="">선택하세요</option>
              {PROCEDURE_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-at-text mb-1">시술 기간</label>
            <input
              type="text"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
              placeholder="예: 3개월"
              className="w-full px-3 py-2 border border-at-border rounded-xl text-sm"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-at-text mb-1">시술 상세</label>
          <input
            type="text"
            value={procedureDetail}
            onChange={(e) => setProcedureDetail(e.target.value)}
            placeholder="예: 상악 좌측 제1대구치 임플란트"
            className="w-full px-3 py-2 border border-at-border rounded-xl text-sm"
          />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-at-text mb-1">환자 나이대</label>
            <select
              value={patientAge}
              onChange={(e) => setPatientAge(e.target.value)}
              className="w-full px-3 py-2 border border-at-border rounded-xl text-sm"
            >
              <option value="">선택</option>
              {['10대', '20대', '30대', '40대', '50대', '60대', '70대 이상'].map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-at-text mb-1">성별</label>
            <select
              value={patientGender}
              onChange={(e) => setPatientGender(e.target.value)}
              className="w-full px-3 py-2 border border-at-border rounded-xl text-sm"
            >
              <option value="">선택</option>
              <option value="남성">남성</option>
              <option value="여성">여성</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-at-text mb-1">어투</label>
            <select
              value={tone}
              onChange={(e) => setTone(e.target.value as ToneType)}
              className="w-full px-3 py-2 border border-at-border rounded-xl text-sm"
            >
              {Object.entries(TONE_LABELS).map(([v, { label }]) => (
                <option key={v} value={v}>{label}</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-at-text mb-1">주소(증상)</label>
          <input
            type="text"
            value={chiefComplaint}
            onChange={(e) => setChiefComplaint(e.target.value)}
            placeholder="예: 어금니 상실로 저작 곤란"
            className="w-full px-3 py-2 border border-at-border rounded-xl text-sm"
          />
        </div>

        {/* 시술 부위 선택 (치아 차트) */}
        <ToothChart
          selectedTeeth={selectedTeeth}
          onChange={setSelectedTeeth}
          disabled={isGenerating}
        />

        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={useResearch}
            onChange={(e) => setUseResearch(e.target.checked)}
            className="w-4 h-4 text-indigo-600 border-at-border rounded"
          />
          <span className="text-sm text-at-text">논문 인용 포함</span>
        </label>
      </div>

      {/* 임상 사진 업로드 - 3단계 */}
      <div className="bg-white rounded-xl border border-at-border p-6 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-at-text">
            임상 사진 <span className="text-red-500">*</span>
          </h3>
          <div className="flex items-center gap-2">
            {totalPhotos >= 2 && (
              <button
                type="button"
                onClick={() => handleBatchNormalize()}
                disabled={isGenerating}
                className="flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-colors disabled:opacity-40"
              >
                <SparklesIcon className="h-3.5 w-3.5" />
                밝기/색조 통일
              </button>
            )}
            <span className="text-xs text-at-text">
              {totalPhotos}/{MAX_TOTAL_PHOTOS}장
            </span>
          </div>
        </div>

        {PHOTO_CATEGORIES.map((catType) => {
          const catPhotos = getPhotosForCategory(catType)
          const canAdd = catPhotos.length < MAX_PHOTOS_PER_CATEGORY && totalPhotos < MAX_TOTAL_PHOTOS

          return (
            <div key={catType} className="border border-at-border rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-at-text">
                  {CLINICAL_PHOTO_TYPE_LABELS[catType]}
                </h4>
                <span className="text-xs text-at-text">
                  {catPhotos.length}/{MAX_PHOTOS_PER_CATEGORY}장
                </span>
              </div>

              {/* 업로드된 사진 썸네일 */}
              {catPhotos.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-3">
                  {catPhotos.map((photo, idx) => (
                    <div key={photo.id} className="relative group">
                      <div className="relative aspect-[4/3] rounded-xl overflow-hidden border border-at-border">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={photo.previewUrl}
                          alt={photo.caption || `${CLINICAL_PHOTO_TYPE_LABELS[catType]} ${idx + 1}`}
                          className="w-full h-full object-cover"
                        />
                        {/* 업로드 상태 오버레이 */}
                        {photo.uploading && (
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                            <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          </div>
                        )}
                        {photo.uploadError && (
                          <div className="absolute inset-0 bg-red-500/20 flex items-center justify-center">
                            <span className="text-xs text-at-error bg-white px-2 py-1 rounded font-medium">
                              {photo.uploadError}
                            </span>
                          </div>
                        )}
                        {/* 순서 번호 */}
                        <span className="absolute top-1 left-1 bg-black/60 text-white text-xs px-1.5 py-0.5 rounded">
                          {idx + 1}
                        </span>
                      </div>

                      {/* 캡션 입력 */}
                      <input
                        type="text"
                        value={photo.caption}
                        onChange={(e) => handleCaptionChange(photo.id, e.target.value)}
                        placeholder="사진 설명 (선택)"
                        className="w-full mt-1 px-2 py-1 text-xs border border-at-border rounded"
                      />

                      {/* 액션 버튼 */}
                      <div className="absolute top-1 right-1 flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        {idx > 0 && (
                          <button
                            type="button"
                            onClick={() => handlePhotoReorder(photo.id, 'up')}
                            className="p-1 bg-white/90 rounded shadow-sm hover:bg-white"
                          >
                            <ArrowUpIcon className="h-3 w-3 text-at-text" />
                          </button>
                        )}
                        {idx < catPhotos.length - 1 && (
                          <button
                            type="button"
                            onClick={() => handlePhotoReorder(photo.id, 'down')}
                            className="p-1 bg-white/90 rounded shadow-sm hover:bg-white"
                          >
                            <ArrowDownIcon className="h-3 w-3 text-at-text" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setEditingPhoto(photo)}
                          className="p-1 bg-white/90 rounded shadow-sm hover:bg-indigo-50"
                          title="편집"
                        >
                          <PencilIcon className="h-3 w-3 text-indigo-500" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePhotoRemove(photo.id)}
                          className="p-1 bg-at-error-bg/90 rounded shadow-sm hover:bg-at-error-bg"
                        >
                          <XMarkIcon className="h-3 w-3 text-red-500" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 사진 추가 버튼 */}
              {canAdd && (
                <label className="flex items-center justify-center gap-2 p-3 border-2 border-dashed border-at-border rounded-xl cursor-pointer hover:border-indigo-400 hover:bg-indigo-50/30 transition-colors">
                  <PhotoIcon className="h-5 w-5 text-at-text" />
                  <span className="text-sm text-at-text">사진 추가</span>
                  <input
                    ref={(el) => { fileInputRefs.current[catType] = el }}
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => handlePhotoAdd(catType, e.target.files)}
                  />
                </label>
              )}
            </div>
          )
        })}
      </div>

      {/* 환자 동의 확인 */}
      <div className={`rounded-xl border-2 p-5 ${
        patientConsent ? 'bg-at-success-bg border-green-300' : 'bg-at-warning-bg border-amber-300'
      }`}>
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={patientConsent}
            onChange={(e) => setPatientConsent(e.target.checked)}
            className="w-5 h-5 mt-0.5 text-at-success border-at-border rounded"
          />
          <div>
            <div className="flex items-center gap-2">
              {patientConsent ? (
                <ShieldCheckIcon className="h-5 w-5 text-at-success" />
              ) : (
                <ExclamationTriangleIcon className="h-5 w-5 text-at-warning" />
              )}
              <span className="font-medium text-at-text">
                환자 동의서 확인 <span className="text-red-500">*</span>
              </span>
            </div>
            <p className="text-xs text-at-text mt-1">
              본 임상 사례 게시에 대해 환자로부터 서면 동의를 받았음을 확인합니다.
              동의서 미확인 시 발행이 차단됩니다.
            </p>
          </div>
        </label>
      </div>

      {/* 사진 편집 모달 */}
      {editingPhoto && (
        <ClinicalPhotoEditor
          photo={editingPhoto}
          onSave={handlePhotoEdited}
          onClose={() => setEditingPhoto(null)}
        />
      )}
    </div>
  )
}
