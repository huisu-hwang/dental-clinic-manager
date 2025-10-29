'use client'

/**
 * TemplateManagement Component
 * Allows clinic owners to manage employment contract templates
 */

import { useState, useEffect } from 'react'
import { contractService } from '@/lib/contractService'
import type { ContractTemplate } from '@/types/contract'
import type { User } from '@/types/auth'
import { DEFAULT_HAYAN_TEMPLATE } from '@/types/contract'

interface TemplateManagementProps {
  currentUser: User
  clinicId: string
}

export default function TemplateManagement({ currentUser, clinicId }: TemplateManagementProps) {
  const [templates, setTemplates] = useState<ContractTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<ContractTemplate | null>(null)

  // Form state
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    is_default: false
  })

  // Load templates
  useEffect(() => {
    loadTemplates()
  }, [clinicId])

  const loadTemplates = async () => {
    setLoading(true)
    setError(null)

    try {
      const response = await contractService.getTemplates(clinicId)

      if (response.error) {
        setError(response.error)
      } else {
        setTemplates(response.data)
      }
    } catch (err) {
      console.error('Failed to load templates:', err)
      setError('템플릿 목록을 불러오는 중 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const handleCreateTemplate = async () => {
    if (!formData.name.trim()) {
      alert('템플릿 이름을 입력해주세요.')
      return
    }

    try {
      const response = await contractService.createTemplate(
        {
          clinic_id: clinicId,
          name: formData.name,
          description: formData.description,
          content: DEFAULT_HAYAN_TEMPLATE, // Use default template structure
          is_default: formData.is_default,
          version: '1.0'
        },
        currentUser.id
      )

      if (response.error) {
        alert(`템플릿 생성 실패: ${response.error}`)
      } else {
        alert('템플릿이 생성되었습니다.')
        setShowCreateModal(false)
        resetForm()
        loadTemplates()
      }
    } catch (err) {
      console.error('Failed to create template:', err)
      alert('템플릿 생성 중 오류가 발생했습니다.')
    }
  }

  const handleUpdateTemplate = async (templateId: string) => {
    if (!editingTemplate) return

    try {
      const response = await contractService.updateTemplate(templateId, {
        name: editingTemplate.name,
        description: editingTemplate.description,
        is_default: editingTemplate.is_default
      })

      if (response.error) {
        alert(`템플릿 수정 실패: ${response.error}`)
      } else {
        alert('템플릿이 수정되었습니다.')
        setEditingTemplate(null)
        loadTemplates()
      }
    } catch (err) {
      console.error('Failed to update template:', err)
      alert('템플릿 수정 중 오류가 발생했습니다.')
    }
  }

  const handleDeleteTemplate = async (templateId: string, templateName: string) => {
    if (!confirm(`"${templateName}" 템플릿을 삭제하시겠습니까?`)) return

    try {
      const response = await contractService.deleteTemplate(templateId)

      if (response.error) {
        alert(`템플릿 삭제 실패: ${response.error}`)
      } else {
        alert('템플릿이 삭제되었습니다.')
        loadTemplates()
      }
    } catch (err) {
      console.error('Failed to delete template:', err)
      alert('템플릿 삭제 중 오류가 발생했습니다.')
    }
  }

  const handleEdit = (template: ContractTemplate) => {
    setEditingTemplate({ ...template })
  }

  const handleCancelEdit = () => {
    setEditingTemplate(null)
  }

  const resetForm = () => {
    setFormData({
      name: '',
      description: '',
      is_default: false
    })
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString)
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
        <p className="text-red-800">{error}</p>
        <button onClick={loadTemplates} className="mt-2 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700">
          다시 시도
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">계약서 템플릿 관리</h1>
          <p className="text-gray-600 mt-1">근로계약서 템플릿을 관리하고 커스터마이즈하세요.</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
        >
          + 새 템플릿 추가
        </button>
      </div>

      {/* Template List */}
      {templates.length === 0 ? (
        <div className="bg-white p-12 rounded-lg shadow border border-gray-200 text-center">
          <div className="text-gray-400 text-5xl mb-4">📄</div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">템플릿이 없습니다</h3>
          <p className="text-gray-600 mb-4">새로운 계약서 템플릿을 추가해보세요.</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
          >
            첫 템플릿 추가하기
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {templates.map(template => (
            <div key={template.id} className="bg-white p-6 rounded-lg shadow border border-gray-200 hover:shadow-lg transition-shadow">
              {editingTemplate?.id === template.id ? (
                // Edit Mode
                <div className="space-y-4">
                  <input
                    type="text"
                    value={editingTemplate.name}
                    onChange={e => setEditingTemplate({ ...editingTemplate, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                  />
                  <textarea
                    value={editingTemplate.description || ''}
                    onChange={e => setEditingTemplate({ ...editingTemplate, description: e.target.value })}
                    rows={3}
                    placeholder="템플릿 설명"
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                  />
                  <label className="flex items-center">
                    <input
                      type="checkbox"
                      checked={editingTemplate.is_default || false}
                      onChange={e => setEditingTemplate({ ...editingTemplate, is_default: e.target.checked })}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="ml-2 text-sm">기본 템플릿으로 설정</span>
                  </label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleUpdateTemplate(template.id)}
                      className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                    >
                      저장
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                    >
                      취소
                    </button>
                  </div>
                </div>
              ) : (
                // View Mode
                <>
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="text-lg font-semibold text-gray-900">{template.name}</h3>
                    {template.is_default && (
                      <span className="px-2 py-1 bg-blue-100 text-blue-800 text-xs font-semibold rounded">
                        기본
                      </span>
                    )}
                  </div>

                  {template.description && (
                    <p className="text-sm text-gray-600 mb-4 line-clamp-3">{template.description}</p>
                  )}

                  <div className="text-xs text-gray-500 mb-4">
                    <p>버전: {template.version}</p>
                    <p>생성일: {formatDate(template.created_at)}</p>
                    {template.updated_at !== template.created_at && (
                      <p>수정일: {formatDate(template.updated_at)}</p>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(template)}
                      className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 text-sm"
                    >
                      수정
                    </button>
                    {!template.is_default && template.clinic_id && (
                      <button
                        onClick={() => handleDeleteTemplate(template.id, template.name)}
                        className="px-4 py-2 bg-red-100 text-red-700 rounded hover:bg-red-200 text-sm"
                      >
                        삭제
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create Template Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg p-6 max-w-md w-full">
            <h2 className="text-xl font-bold mb-4">새 템플릿 추가</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  템플릿 이름 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  placeholder="예: 치과위생사 표준 계약서"
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">설명</label>
                <textarea
                  value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  rows={3}
                  placeholder="템플릿에 대한 간단한 설명을 입력하세요."
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="flex items-center">
                  <input
                    type="checkbox"
                    checked={formData.is_default}
                    onChange={e => setFormData({ ...formData, is_default: e.target.checked })}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="ml-2 text-sm">기본 템플릿으로 설정</span>
                </label>
                <p className="text-xs text-gray-500 mt-1 ml-6">
                  기본 템플릿은 새 계약서 작성 시 자동으로 선택됩니다.
                </p>
              </div>
            </div>

            <div className="mt-6 flex gap-3">
              <button
                onClick={handleCreateTemplate}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                생성
              </button>
              <button
                onClick={() => {
                  setShowCreateModal(false)
                  resetForm()
                }}
                className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
              >
                취소
              </button>
            </div>

            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded">
              <p className="text-xs text-blue-800">
                💡 <strong>참고:</strong> 템플릿은 하얀치과 표준 양식을 기반으로 생성됩니다. 생성 후 필요에 따라 수정할 수 있습니다.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-semibold text-blue-900 mb-2">템플릿 관리 안내</h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• 템플릿은 근로계약서 작성 시 사용되는 기본 양식입니다.</li>
          <li>• 기본 템플릿으로 설정하면 새 계약서 작성 시 자동으로 선택됩니다.</li>
          <li>• 시스템 기본 템플릿(하얀치과 표준)은 삭제할 수 없습니다.</li>
          <li>• 각 병원마다 커스텀 템플릿을 생성하여 사용할 수 있습니다.</li>
        </ul>
      </div>
    </div>
  )
}
