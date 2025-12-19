'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  FileText,
  Plus,
  Search,
  Download,
  Eye,
  Calendar,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Filter,
  FolderOpen,
  File,
  FileImage,
  FileSpreadsheet
} from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { documentService } from '@/lib/bulletinService'
import type { Document, DocumentCategory } from '@/types/bulletin'
import { DOCUMENT_CATEGORY_LABELS } from '@/types/bulletin'
import DocumentDetail from './DocumentDetail'
import DocumentForm from './DocumentForm'

interface DocumentListProps {
  canCreate?: boolean
}

export default function DocumentList({ canCreate = false }: DocumentListProps) {
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<DocumentCategory | ''>('')
  const [searchQuery, setSearchQuery] = useState('')
  const [page, setPage] = useState(1)
  const [total, setTotal] = useState(0)
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [editingDocument, setEditingDocument] = useState<Document | null>(null)

  const ITEMS_PER_PAGE = 10

  const fetchDocuments = useCallback(async () => {
    setLoading(true)
    setError(null)

    const { data, total: totalCount, error: fetchError } = await documentService.getDocuments({
      category: selectedCategory || undefined,
      search: searchQuery || undefined,
      limit: ITEMS_PER_PAGE,
      offset: (page - 1) * ITEMS_PER_PAGE,
    })

    if (fetchError) {
      setError(fetchError)
    } else {
      setDocuments(data || [])
      setTotal(totalCount)
    }
    setLoading(false)
  }, [selectedCategory, searchQuery, page])

  useEffect(() => {
    fetchDocuments()
  }, [fetchDocuments])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setPage(1)
    fetchDocuments()
  }

  const handleCategoryChange = (category: DocumentCategory | '') => {
    setSelectedCategory(category)
    setPage(1)
  }

  const handleDocumentClick = async (document: Document) => {
    const { data } = await documentService.getDocument(document.id)
    if (data) {
      setSelectedDocument(data)
    }
  }

  const handleEdit = (document: Document) => {
    setEditingDocument(document)
    setShowForm(true)
    setSelectedDocument(null)
  }

  const handleDelete = async (id: string) => {
    if (!confirm('정말 삭제하시겠습니까?')) return

    const { success, error: deleteError } = await documentService.deleteDocument(id)
    if (success) {
      fetchDocuments()
      setSelectedDocument(null)
    } else {
      alert(deleteError || '삭제에 실패했습니다.')
    }
  }

  const handleDownload = async (document: Document) => {
    if (document.file_url) {
      await documentService.incrementDownloadCount(document.id)
      window.open(document.file_url, '_blank')
    }
  }

  const handleFormSubmit = () => {
    setShowForm(false)
    setEditingDocument(null)
    fetchDocuments()
  }

  const handleFormCancel = () => {
    setShowForm(false)
    setEditingDocument(null)
  }

  const totalPages = Math.ceil(total / ITEMS_PER_PAGE)

  const getCategoryBadgeColor = (category: DocumentCategory) => {
    switch (category) {
      case 'manual':
        return 'bg-blue-100 text-blue-700'
      case 'form':
        return 'bg-green-100 text-green-700'
      case 'guideline':
        return 'bg-purple-100 text-purple-700'
      case 'reference':
        return 'bg-orange-100 text-orange-700'
      default:
        return 'bg-gray-100 text-gray-700'
    }
  }

  const getFileIcon = (fileName?: string) => {
    if (!fileName) return <FileText className="w-5 h-5 text-gray-400" />
    const ext = fileName.split('.').pop()?.toLowerCase()

    if (['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext || '')) {
      return <FileImage className="w-5 h-5 text-purple-500" />
    }
    if (['xlsx', 'xls', 'csv'].includes(ext || '')) {
      return <FileSpreadsheet className="w-5 h-5 text-green-500" />
    }
    if (['pdf'].includes(ext || '')) {
      return <File className="w-5 h-5 text-red-500" />
    }
    return <FileText className="w-5 h-5 text-blue-500" />
  }

  const formatFileSize = (bytes?: number) => {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }

  if (showForm) {
    return (
      <DocumentForm
        document={editingDocument}
        onSubmit={handleFormSubmit}
        onCancel={handleFormCancel}
      />
    )
  }

  if (selectedDocument) {
    return (
      <DocumentDetail
        document={selectedDocument}
        onBack={() => setSelectedDocument(null)}
        onEdit={canCreate ? () => handleEdit(selectedDocument) : undefined}
        onDelete={canCreate ? () => handleDelete(selectedDocument.id) : undefined}
        onDownload={() => handleDownload(selectedDocument)}
      />
    )
  }

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-2">
          <FolderOpen className="w-5 h-5 text-green-600" />
          <h2 className="text-lg font-semibold text-gray-900">문서 모음</h2>
        </div>
        {canCreate && (
          <Button onClick={() => setShowForm(true)} className="flex items-center gap-2">
            <Plus className="w-4 h-4" />
            새 문서 등록
          </Button>
        )}
      </div>

      {/* 필터 및 검색 */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-500" />
          <select
            value={selectedCategory}
            onChange={(e) => handleCategoryChange(e.target.value as DocumentCategory | '')}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">전체 카테고리</option>
            {Object.entries(DOCUMENT_CATEGORY_LABELS).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </div>
        <form onSubmit={handleSearch} className="flex-1 flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <Input
              type="text"
              placeholder="제목 또는 설명 검색..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button type="submit" variant="outline">검색</Button>
        </form>
      </div>

      {/* 에러 표시 */}
      {error && (
        <div className="flex items-center gap-2 p-4 bg-red-50 text-red-700 rounded-lg">
          <AlertCircle className="w-5 h-5" />
          <span>{error}</span>
        </div>
      )}

      {/* 로딩 */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      ) : documents.length === 0 ? (
        <div className="text-center py-12 text-gray-500">
          <FolderOpen className="w-12 h-12 mx-auto mb-4 text-gray-300" />
          <p>등록된 문서가 없습니다.</p>
        </div>
      ) : (
        <>
          {/* 문서 목록 */}
          <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-200">
            {documents.map((document) => (
              <div
                key={document.id}
                className="p-4 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-start gap-3">
                  {/* 파일 아이콘 */}
                  <div className="flex-shrink-0 mt-1">
                    {getFileIcon(document.file_name)}
                  </div>

                  <div className="flex-1 min-w-0 cursor-pointer" onClick={() => handleDocumentClick(document)}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${getCategoryBadgeColor(document.category)}`}>
                        {DOCUMENT_CATEGORY_LABELS[document.category]}
                      </span>
                    </div>
                    <h3 className="text-gray-900 font-medium truncate">{document.title}</h3>
                    {document.description && (
                      <p className="text-sm text-gray-500 truncate mt-1">{document.description}</p>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-sm text-gray-500">
                      <span>{document.author_name}</span>
                      <span className="flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {formatDate(document.created_at)}
                      </span>
                      <span className="flex items-center gap-1">
                        <Eye className="w-3 h-3" />
                        {document.view_count}
                      </span>
                      {document.file_name && (
                        <span className="flex items-center gap-1">
                          <Download className="w-3 h-3" />
                          {document.download_count}
                        </span>
                      )}
                      {document.file_size && (
                        <span className="text-gray-400">
                          {formatFileSize(document.file_size)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 다운로드 버튼 */}
                  {document.file_url && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation()
                        handleDownload(document)
                      }}
                      className="flex-shrink-0"
                    >
                      <Download className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* 페이지네이션 */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm text-gray-600">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
