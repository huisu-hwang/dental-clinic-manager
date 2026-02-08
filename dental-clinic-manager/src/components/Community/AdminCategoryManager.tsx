'use client'

import { useState, useEffect } from 'react'
import { Plus, Edit3, Trash2, GripVertical, Eye, EyeOff, Save, X, ChevronUp, ChevronDown, AlertCircle, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { communityCategoryService } from '@/lib/communityService'
import type { CommunityCategoryItem, CreateCategoryDto } from '@/types/community'

// 사용 가능한 색상 프리셋
const COLOR_PRESETS = [
  { bg: 'bg-gray-100', text: 'text-gray-700', label: '회색' },
  { bg: 'bg-blue-100', text: 'text-blue-700', label: '파란색' },
  { bg: 'bg-green-100', text: 'text-green-700', label: '초록색' },
  { bg: 'bg-yellow-100', text: 'text-yellow-700', label: '노란색' },
  { bg: 'bg-purple-100', text: 'text-purple-700', label: '보라색' },
  { bg: 'bg-orange-100', text: 'text-orange-700', label: '주황색' },
  { bg: 'bg-red-100', text: 'text-red-700', label: '빨간색' },
  { bg: 'bg-pink-100', text: 'text-pink-700', label: '분홍색' },
  { bg: 'bg-indigo-100', text: 'text-indigo-700', label: '남색' },
  { bg: 'bg-teal-100', text: 'text-teal-700', label: '청록색' },
]

export default function AdminCategoryManager() {
  const [categories, setCategories] = useState<CommunityCategoryItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  // 새 카테고리 추가 폼
  const [showAddForm, setShowAddForm] = useState(false)
  const [newSlug, setNewSlug] = useState('')
  const [newLabel, setNewLabel] = useState('')
  const [newColorIdx, setNewColorIdx] = useState(0)

  // 수정 모드
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editLabel, setEditLabel] = useState('')
  const [editColorIdx, setEditColorIdx] = useState(0)

  useEffect(() => {
    fetchCategories()
  }, [])

  const fetchCategories = async () => {
    setLoading(true)
    const { data, error: fetchError } = await communityCategoryService.getCategories(true)
    if (fetchError) {
      setError(fetchError)
    } else {
      setCategories(data || [])
    }
    setLoading(false)
  }

  // 카테고리 추가
  const handleAdd = async () => {
    if (!newSlug.trim() || !newLabel.trim()) return
    setSaving(true)
    setError(null)

    const preset = COLOR_PRESETS[newColorIdx]
    const input: CreateCategoryDto = {
      slug: newSlug.trim().toLowerCase().replace(/\s+/g, '_'),
      label: newLabel.trim(),
      color_bg: preset.bg,
      color_text: preset.text,
    }

    const { error: createError } = await communityCategoryService.createCategory(input)
    if (createError) {
      setError(createError)
    } else {
      setShowAddForm(false)
      setNewSlug('')
      setNewLabel('')
      setNewColorIdx(0)
      await fetchCategories()
    }
    setSaving(false)
  }

  // 카테고리 수정
  const startEdit = (cat: CommunityCategoryItem) => {
    setEditingId(cat.id)
    setEditLabel(cat.label)
    const idx = COLOR_PRESETS.findIndex(p => p.bg === cat.color_bg && p.text === cat.color_text)
    setEditColorIdx(idx >= 0 ? idx : 0)
  }

  const handleUpdate = async (cat: CommunityCategoryItem) => {
    if (!editLabel.trim()) return
    setSaving(true)
    setError(null)

    const preset = COLOR_PRESETS[editColorIdx]
    const { error: updateError } = await communityCategoryService.updateCategory(cat.id, {
      label: editLabel.trim(),
      color_bg: preset.bg,
      color_text: preset.text,
    })

    if (updateError) {
      setError(updateError)
    } else {
      setEditingId(null)
      await fetchCategories()
    }
    setSaving(false)
  }

  // 활성/비활성 토글
  const handleToggleActive = async (cat: CommunityCategoryItem) => {
    setSaving(true)
    setError(null)

    const { error: updateError } = await communityCategoryService.updateCategory(cat.id, {
      is_active: !cat.is_active,
    })

    if (updateError) {
      setError(updateError)
    } else {
      await fetchCategories()
    }
    setSaving(false)
  }

  // 삭제
  const handleDelete = async (cat: CommunityCategoryItem) => {
    if (!confirm(`"${cat.label}" 주제를 삭제하시겠습니까?\n게시글이 있으면 삭제할 수 없습니다.`)) return
    setSaving(true)
    setError(null)

    const { success, error: deleteError } = await communityCategoryService.deleteCategory(cat.id, cat.slug)
    if (deleteError) {
      setError(deleteError)
    } else if (success) {
      await fetchCategories()
    }
    setSaving(false)
  }

  // 순서 변경 (위/아래)
  const handleMove = async (index: number, direction: 'up' | 'down') => {
    const swapIdx = direction === 'up' ? index - 1 : index + 1
    if (swapIdx < 0 || swapIdx >= categories.length) return

    setSaving(true)
    setError(null)

    const newOrder = categories.map((cat, i) => {
      if (i === index) return { id: cat.id, sort_order: categories[swapIdx].sort_order }
      if (i === swapIdx) return { id: cat.id, sort_order: categories[index].sort_order }
      return { id: cat.id, sort_order: cat.sort_order }
    })

    const { error: reorderError } = await communityCategoryService.reorderCategories(newOrder)
    if (reorderError) {
      setError(reorderError)
    } else {
      await fetchCategories()
    }
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">게시판 주제 관리</h3>
          <p className="text-xs text-gray-500 mt-0.5">주제를 추가, 수정, 삭제하고 순서를 변경할 수 있습니다</p>
        </div>
        {!showAddForm && (
          <Button size="sm" onClick={() => setShowAddForm(true)} disabled={saving}>
            <Plus className="w-4 h-4 mr-1" />추가
          </Button>
        )}
      </div>

      {/* 에러 메시지 */}
      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* 새 카테고리 추가 폼 */}
      {showAddForm && (
        <div className="border border-blue-200 rounded-lg p-4 bg-blue-50/50 space-y-3">
          <h4 className="text-sm font-semibold text-blue-700">새 주제 추가</h4>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">식별자 (영문, 숫자, _)</label>
              <Input
                type="text"
                value={newSlug}
                onChange={(e) => setNewSlug(e.target.value.replace(/[^a-zA-Z0-9_]/g, ''))}
                placeholder="예: tips"
                maxLength={30}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">표시 이름</label>
              <Input
                type="text"
                value={newLabel}
                onChange={(e) => setNewLabel(e.target.value)}
                placeholder="예: 꿀팁"
                maxLength={50}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">색상</label>
            <div className="flex flex-wrap gap-2">
              {COLOR_PRESETS.map((preset, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setNewColorIdx(idx)}
                  className={`px-3 py-1 rounded-full text-xs font-medium ${preset.bg} ${preset.text} ${
                    newColorIdx === idx ? 'ring-2 ring-offset-1 ring-blue-500' : ''
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <Button size="sm" variant="outline" onClick={() => { setShowAddForm(false); setError(null) }}>취소</Button>
            <Button size="sm" onClick={handleAdd} disabled={!newSlug.trim() || !newLabel.trim() || saving}>
              {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <Plus className="w-4 h-4 mr-1" />}
              추가하기
            </Button>
          </div>
        </div>
      )}

      {/* 카테고리 목록 */}
      <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
        {categories.length === 0 ? (
          <div className="p-8 text-center text-gray-400 text-sm">
            등록된 주제가 없습니다
          </div>
        ) : (
          categories.map((cat, index) => (
            <div
              key={cat.id}
              className={`p-3 sm:p-4 flex items-center gap-3 ${!cat.is_active ? 'bg-gray-50 opacity-60' : ''}`}
            >
              {/* 순서 변경 */}
              <div className="flex flex-col gap-0.5">
                <button
                  onClick={() => handleMove(index, 'up')}
                  disabled={index === 0 || saving}
                  className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                >
                  <ChevronUp className="w-4 h-4" />
                </button>
                <button
                  onClick={() => handleMove(index, 'down')}
                  disabled={index === categories.length - 1 || saving}
                  className="text-gray-400 hover:text-gray-600 disabled:opacity-30"
                >
                  <ChevronDown className="w-4 h-4" />
                </button>
              </div>

              <GripVertical className="w-4 h-4 text-gray-300 flex-shrink-0 hidden sm:block" />

              {/* 콘텐츠 */}
              {editingId === cat.id ? (
                // 수정 모드
                <div className="flex-1 space-y-2">
                  <Input
                    type="text"
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                    placeholder="표시 이름"
                    maxLength={50}
                  />
                  <div className="flex flex-wrap gap-1.5">
                    {COLOR_PRESETS.map((preset, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => setEditColorIdx(idx)}
                        className={`px-2 py-0.5 rounded-full text-xs ${preset.bg} ${preset.text} ${
                          editColorIdx === idx ? 'ring-2 ring-offset-1 ring-blue-500' : ''
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditingId(null)}>
                      <X className="w-3.5 h-3.5 mr-1" />취소
                    </Button>
                    <Button size="sm" onClick={() => handleUpdate(cat)} disabled={!editLabel.trim() || saving}>
                      {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1" /> : <Save className="w-3.5 h-3.5 mr-1" />}
                      저장
                    </Button>
                  </div>
                </div>
              ) : (
                // 표시 모드
                <>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${cat.color_bg} ${cat.color_text}`}>
                        {cat.label}
                      </span>
                      <span className="text-xs text-gray-400 font-mono">{cat.slug}</span>
                      {!cat.is_active && (
                        <span className="text-xs text-red-500 font-medium">비활성</span>
                      )}
                    </div>
                  </div>

                  {/* 액션 버튼 */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleToggleActive(cat)}
                      disabled={saving}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                      title={cat.is_active ? '비활성화' : '활성화'}
                    >
                      {cat.is_active ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => startEdit(cat)}
                      disabled={saving}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-blue-600 transition-colors"
                      title="수정"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDelete(cat)}
                      disabled={saving}
                      className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-red-600 transition-colors"
                      title="삭제"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
