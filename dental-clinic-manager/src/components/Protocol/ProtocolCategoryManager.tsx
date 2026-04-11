'use client'

import { useState, useEffect } from 'react'
import { PlusIcon, PencilIcon, TrashIcon, FolderIcon } from '@heroicons/react/24/outline'
import { dataService } from '@/lib/dataService'
import type { ProtocolCategory } from '@/types'
import { appConfirm } from '@/components/ui/AppDialog'

interface ProtocolCategoryManagerProps {
  onCategoryChange?: () => void
}

const DEFAULT_COLORS = [
  '#3B82F6', '#10B981', '#F59E0B', '#EF4444',
  '#8B5CF6', '#EC4899', '#06B6D4', '#F97316',
]

export default function ProtocolCategoryManager({ onCategoryChange }: ProtocolCategoryManagerProps) {
  const [categories, setCategories] = useState<ProtocolCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editingCategory, setEditingCategory] = useState<ProtocolCategory | null>(null)

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    color: DEFAULT_COLORS[0],
    display_order: 0
  })

  useEffect(() => { fetchCategories() }, [])

  const fetchCategories = async () => {
    const result = await dataService.getProtocolCategories()
    if (result.error) {
      setError(result.error)
    } else {
      setCategories((result.data as ProtocolCategory[] | undefined) ?? [])
    }
    setLoading(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    if (!formData.name.trim()) { setError('카테고리 이름을 입력하세요.'); return }

    if (editingCategory) {
      const result = await dataService.updateProtocolCategory(editingCategory.id, formData)
      if (result.error) { setError(result.error) } else {
        setSuccess('카테고리가 수정되었습니다.')
        resetForm(); fetchCategories(); onCategoryChange?.()
      }
    } else {
      const result = await dataService.createProtocolCategory(formData)
      if (result.error) { setError(result.error) } else {
        setSuccess('카테고리가 생성되었습니다.')
        resetForm(); fetchCategories(); onCategoryChange?.()
      }
    }
  }

  const handleEdit = (category: ProtocolCategory) => {
    setEditingCategory(category)
    setFormData({ name: category.name, description: category.description || '', color: category.color, display_order: category.display_order })
    setShowForm(true); setError(''); setSuccess('')
  }

  const handleDelete = async (categoryId: string) => {
    if (!await appConfirm('이 카테고리를 삭제하시겠습니까?\n이 카테고리를 사용하는 프로토콜은 "카테고리 없음"으로 변경됩니다.')) return
    const result = await dataService.deleteProtocolCategory(categoryId)
    if (result.error) { setError(result.error) } else {
      setSuccess('카테고리가 삭제되었습니다.')
      fetchCategories(); onCategoryChange?.()
      setTimeout(() => setSuccess(''), 3000)
    }
  }

  const resetForm = () => {
    setFormData({ name: '', description: '', color: DEFAULT_COLORS[0], display_order: 0 })
    setEditingCategory(null); setShowForm(false)
    setTimeout(() => { setError(''); setSuccess('') }, 3000)
  }

  if (loading && categories.length === 0) {
    return (
      <div className="bg-white p-6 rounded-2xl shadow-at-card border border-at-border">
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-at-accent mx-auto mb-4"></div>
          <p className="text-at-text-secondary">카테고리를 불러오는 중...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white p-6 rounded-2xl shadow-at-card border border-at-border">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center">
          <FolderIcon className="h-6 w-6 text-at-accent mr-2" />
          <h2 className="text-xl font-bold text-at-text">프로토콜 카테고리 관리</h2>
        </div>
        <button
          onClick={() => { resetForm(); setShowForm(true) }}
          className="flex items-center px-4 py-2 bg-at-accent text-white text-sm font-medium rounded-xl hover:bg-at-accent-hover transition-colors"
        >
          <PlusIcon className="h-4 w-4 mr-2" />
          새 카테고리
        </button>
      </div>

      {error && (
        <div className="mb-4 bg-at-error-bg border border-red-200 text-at-error px-4 py-3 rounded-xl text-sm">{error}</div>
      )}
      {success && (
        <div className="mb-4 bg-at-success-bg border border-green-200 text-at-success px-4 py-3 rounded-xl text-sm">{success}</div>
      )}

      {showForm && (
        <div className="mb-6 p-4 bg-at-surface-alt border border-at-border rounded-xl">
          <h3 className="text-lg font-semibold text-at-text mb-4">
            {editingCategory ? '카테고리 수정' : '새 카테고리 추가'}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-at-text-secondary mb-2">카테고리 이름 *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full p-2 border border-at-border rounded-xl focus:ring-at-accent focus:border-at-accent"
                  placeholder="예: 임플란트"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-at-text-secondary mb-2">색상</label>
                <div className="flex gap-2 items-center">
                  <input
                    type="color"
                    value={formData.color}
                    onChange={(e) => setFormData({ ...formData, color: e.target.value })}
                    className="h-10 w-20 border border-at-border rounded-xl cursor-pointer"
                  />
                  <div className="flex gap-1">
                    {DEFAULT_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setFormData({ ...formData, color })}
                        className="w-8 h-8 rounded-lg border-2 border-at-border hover:border-at-text-secondary transition-colors"
                        style={{ backgroundColor: color }}
                        title={color}
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-at-text-secondary mb-2">설명</label>
              <textarea
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                className="w-full p-2 border border-at-border rounded-xl focus:ring-at-accent focus:border-at-accent"
                rows={2}
                placeholder="카테고리 설명을 입력하세요"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 text-at-text-secondary bg-white border border-at-border rounded-xl hover:bg-at-surface-hover"
              >
                취소
              </button>
              <button type="submit" className="px-4 py-2 bg-at-accent text-white rounded-xl hover:bg-at-accent-hover">
                {editingCategory ? '수정' : '추가'}
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="space-y-2">
        {categories.length === 0 ? (
          <div className="text-center py-12 border border-dashed border-at-border rounded-xl">
            <FolderIcon className="h-12 w-12 text-at-text-weak mx-auto mb-4" />
            <p className="text-at-text-secondary mb-4">등록된 카테고리가 없습니다.</p>
            <p className="text-at-text-weak text-sm mb-4">기본 카테고리는 자동으로 생성됩니다. 새로고침 후 확인하거나 직접 추가하세요.</p>
          </div>
        ) : (
          categories.map((category) => (
            <div
              key={category.id}
              className="flex items-center justify-between p-4 border border-at-border rounded-xl hover:border-at-accent hover:shadow-sm transition-all"
            >
              <div className="flex items-center gap-4 flex-1">
                <div className="w-4 h-4 rounded-full" style={{ backgroundColor: category.color }} />
                <div className="flex-1">
                  <h3 className="font-semibold text-at-text">{category.name}</h3>
                  {category.description && <p className="text-sm text-at-text-secondary">{category.description}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => handleEdit(category)} className="p-2 text-at-accent hover:bg-at-accent-light rounded-lg" title="수정">
                  <PencilIcon className="h-4 w-4" />
                </button>
                <button onClick={() => handleDelete(category.id)} className="p-2 text-at-error hover:bg-at-error-bg rounded-lg" title="삭제">
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
