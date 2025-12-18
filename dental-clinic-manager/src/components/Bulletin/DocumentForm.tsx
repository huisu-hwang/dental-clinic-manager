'use client'

import { useState, useRef } from 'react'
import { ArrowLeft, Save, Upload, X, FileText } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { documentService } from '@/lib/bulletinService'
import { createClient } from '@/lib/supabase/client'
import type { Document, DocumentCategory, CreateDocumentDto } from '@/types/bulletin'
import { DOCUMENT_CATEGORY_LABELS } from '@/types/bulletin'

interface DocumentFormProps {
  document?: Document | null
  onSubmit: () => void
  onCancel: () => void
}

export default function DocumentForm({
  document,
  onSubmit,
  onCancel,
}: DocumentFormProps) {
  const [formData, setFormData] = useState<CreateDocumentDto>({
    title: document?.title || '',
    description: document?.description || '',
    category: document?.category || 'manual',
    file_url: document?.file_url || '',
    file_name: document?.file_name || '',
    file_size: document?.file_size || undefined,
    content: document?.content || '',
  })
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const isEditing = !!document

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    // 파일 크기 제한 (10MB)
    if (file.size > 10 * 1024 * 1024) {
      setError('파일 크기는 10MB 이하여야 합니다.')
      return
    }

    setUploading(true)
    setError(null)

    try {
      const supabase = createClient()
      const clinicId = sessionStorage.getItem('dental_clinic_id') || localStorage.getItem('dental_clinic_id')

      if (!clinicId) {
        throw new Error('클리닉 정보를 찾을 수 없습니다.')
      }

      // 파일명에 타임스탬프 추가
      const timestamp = Date.now()
      const fileExt = file.name.split('.').pop()
      const fileName = `${timestamp}.${fileExt}`
      const filePath = `documents/${clinicId}/${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('bulletin-files')
        .upload(filePath, file)

      if (uploadError) {
        // 버킷이 없으면 생성 시도
        if (uploadError.message.includes('not found')) {
          throw new Error('파일 저장소가 설정되지 않았습니다. 관리자에게 문의하세요.')
        }
        throw uploadError
      }

      const { data: urlData } = supabase.storage
        .from('bulletin-files')
        .getPublicUrl(filePath)

      setFormData({
        ...formData,
        file_url: urlData.publicUrl,
        file_name: file.name,
        file_size: file.size,
      })
    } catch (err) {
      console.error('File upload error:', err)
      setError(err instanceof Error ? err.message : '파일 업로드에 실패했습니다.')
    } finally {
      setUploading(false)
    }
  }

  const handleRemoveFile = () => {
    setFormData({
      ...formData,
      file_url: '',
      file_name: '',
      file_size: undefined,
    })
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.title.trim()) {
      setError('제목을 입력해주세요.')
      return
    }

    setLoading(true)
    setError(null)

    try {
      if (isEditing) {
        const { error: updateError } = await documentService.updateDocument(document.id, formData)
        if (updateError) throw new Error(updateError)
      } else {
        const { error: createError } = await documentService.createDocument(formData)
        if (createError) throw new Error(createError)
      }
      onSubmit()
    } catch (err) {
      setError(err instanceof Error ? err.message : '저장에 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" onClick={onCancel} className="flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" />
          취소
        </Button>
        <h2 className="text-lg font-semibold text-gray-900">
          {isEditing ? '문서 수정' : '새 문서 등록'}
        </h2>
      </div>

      {/* 폼 */}
      <form onSubmit={handleSubmit} className="bg-white rounded-lg border border-gray-200 p-6 space-y-6">
        {error && (
          <div className="p-4 bg-red-50 text-red-700 rounded-lg text-sm">
            {error}
          </div>
        )}

        {/* 카테고리 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            카테고리 <span className="text-red-500">*</span>
          </label>
          <select
            value={formData.category}
            onChange={(e) => setFormData({ ...formData, category: e.target.value as DocumentCategory })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {Object.entries(DOCUMENT_CATEGORY_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>

        {/* 제목 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            제목 <span className="text-red-500">*</span>
          </label>
          <Input
            type="text"
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="문서 제목을 입력하세요"
          />
        </div>

        {/* 설명 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            설명
          </label>
          <Input
            type="text"
            value={formData.description || ''}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="문서에 대한 간단한 설명을 입력하세요"
          />
        </div>

        {/* 파일 업로드 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            첨부파일
          </label>
          {formData.file_name ? (
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
              <FileText className="w-5 h-5 text-blue-500" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{formData.file_name}</p>
                {formData.file_size && (
                  <p className="text-xs text-gray-500">{formatFileSize(formData.file_size)}</p>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleRemoveFile}
                className="text-gray-400 hover:text-red-500"
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-blue-400 transition-colors"
            >
              {uploading ? (
                <div className="flex items-center justify-center gap-2 text-gray-500">
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600"></div>
                  <span>업로드 중...</span>
                </div>
              ) : (
                <>
                  <Upload className="w-8 h-8 mx-auto text-gray-400 mb-2" />
                  <p className="text-sm text-gray-600">
                    클릭하여 파일을 선택하거나 드래그하세요
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    최대 10MB
                  </p>
                </>
              )}
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            onChange={handleFileUpload}
            className="hidden"
          />
        </div>

        {/* 내용 */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            내용
          </label>
          <textarea
            value={formData.content || ''}
            onChange={(e) => setFormData({ ...formData, content: e.target.value })}
            placeholder="문서 내용을 입력하세요 (선택사항)"
            rows={8}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
          />
        </div>

        {/* 버튼 */}
        <div className="flex justify-end gap-3 pt-4 border-t border-gray-200">
          <Button type="button" variant="outline" onClick={onCancel}>
            취소
          </Button>
          <Button type="submit" disabled={loading || uploading} className="flex items-center gap-2">
            <Save className="w-4 h-4" />
            {loading ? '저장 중...' : (isEditing ? '수정' : '등록')}
          </Button>
        </div>
      </form>
    </div>
  )
}
