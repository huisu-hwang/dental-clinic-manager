'use client'

import { useState, useEffect, useCallback } from 'react'
import { ArrowLeft, Plus, Loader2, Trash2, Merge, GripVertical, Pencil, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { telegramBoardCategoryService } from '@/lib/telegramService'
import type { TelegramBoardCategory } from '@/types/telegram'
import { TELEGRAM_CATEGORY_COLORS, getCategoryColorClasses } from '@/types/telegram'
import { appConfirm, appAlert } from '@/components/ui/AppDialog'

interface TelegramBoardCategoryManagerProps {
  groupId: string
  onBack: () => void
}

export default function TelegramBoardCategoryManager({ groupId, onBack }: TelegramBoardCategoryManagerProps) {
  const [categories, setCategories] = useState<TelegramBoardCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [newName, setNewName] = useState('')
  const [newColor, setNewColor] = useState('blue')
  const [creating, setCreating] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editColor, setEditColor] = useState('')
  const [mergeSource, setMergeSource] = useState<string | null>(null)

  const fetchCategories = useCallback(async () => {
    setLoading(true)
    const { data } = await telegramBoardCategoryService.getCategories(groupId)
    if (data) setCategories(data)
    setLoading(false)
  }, [groupId])

  useEffect(() => {
    fetchCategories()
  }, [fetchCategories])

  const handleCreate = async () => {
    if (!newName.trim()) return
    setCreating(true)
    const slug = newName.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9가-힣-]/g, '').slice(0, 50)
    const { error } = await telegramBoardCategoryService.createCategory(groupId, {
      name: newName.trim(),
      slug,
      color: newColor,
    })
    if (error) {
      await appAlert(error)
    } else {
      setNewName('')
      fetchCategories()
    }
    setCreating(false)
  }

  const handleStartEdit = (cat: TelegramBoardCategory) => {
    setEditingId(cat.id)
    setEditName(cat.name)
    setEditColor(cat.color)
  }

  const handleSaveEdit = async () => {
    if (!editingId || !editName.trim()) return
    const { error } = await telegramBoardCategoryService.updateCategory(editingId, {
      name: editName.trim(),
      color: editColor,
    })
    if (error) {
      await appAlert(error)
    } else {
      setEditingId(null)
      fetchCategories()
    }
  }

  const handleDelete = async (cat: TelegramBoardCategory) => {
    if (cat.is_default) {
      await appAlert('기본 카테고리는 삭제할 수 없습니다.')
      return
    }
    if (!(await appConfirm(`"${cat.name}" 카테고리를 삭제하시겠습니까?\n해당 카테고리의 게시글은 "미분류"로 이동됩니다.`))) return
    const { error } = await telegramBoardCategoryService.deleteCategory(cat.id, groupId)
    if (error) {
      await appAlert(error)
    } else {
      fetchCategories()
    }
  }

  const handleMerge = async (targetId: string) => {
    if (!mergeSource || mergeSource === targetId) return
    const sourceCat = categories.find(c => c.id === mergeSource)
    const targetCat = categories.find(c => c.id === targetId)
    if (!sourceCat || !targetCat) return

    if (!(await appConfirm(`"${sourceCat.name}" → "${targetCat.name}"(으)로 병합하시겠습니까?\n"${sourceCat.name}" 카테고리는 삭제됩니다.`))) return

    const { error } = await telegramBoardCategoryService.mergeCategories(mergeSource, targetId, groupId)
    if (error) {
      await appAlert(error)
    } else {
      setMergeSource(null)
      fetchCategories()
    }
  }

  return (
    <div className="bg-white rounded-2xl border border-at-border overflow-hidden shadow-at-card">
      {/* 헤더 */}
      <div className="flex items-center gap-3 px-4 py-3 border-b border-at-border bg-at-surface-alt">
        <button onClick={onBack} className="text-at-text-weak hover:text-at-text-secondary">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <h3 className="text-sm font-semibold text-at-text">카테고리 관리</h3>
      </div>

      <div className="p-4 space-y-4">
        {/* 새 카테고리 추가 */}
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <label className="block text-xs font-medium text-at-text-weak mb-1">새 카테고리</label>
            <Input
              value={newName}
              onChange={e => setNewName(e.target.value)}
              placeholder="카테고리 이름"
              className="text-sm h-9"
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
            />
          </div>
          <div className="w-24">
            <label className="block text-xs font-medium text-at-text-weak mb-1">색상</label>
            <select
              value={newColor}
              onChange={e => setNewColor(e.target.value)}
              className="w-full h-9 px-2 text-sm border border-at-border rounded-xl bg-white"
            >
              {TELEGRAM_CATEGORY_COLORS.map(c => (
                <option key={c.value} value={c.value}>{c.name}</option>
              ))}
            </select>
          </div>
          <Button size="sm" onClick={handleCreate} disabled={creating || !newName.trim()} className="h-9">
            {creating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          </Button>
        </div>

        {/* 병합 안내 */}
        {mergeSource && (
          <div className="flex items-center gap-2 px-3 py-2 bg-at-warning-bg border border-at-border rounded-xl text-xs text-at-warning">
            <Merge className="w-4 h-4 flex-shrink-0" />
            <span>
              &quot;{categories.find(c => c.id === mergeSource)?.name}&quot;을(를) 병합할 대상 카테고리를 선택하세요.
            </span>
            <button onClick={() => setMergeSource(null)} className="ml-auto text-at-warning/60 hover:text-at-warning">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* 카테고리 목록 */}
        {loading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-6 h-6 animate-spin text-at-accent" />
          </div>
        ) : (
          <div className="space-y-1">
            {categories.map(cat => {
              const colorClasses = getCategoryColorClasses(cat.color)
              const isEditing = editingId === cat.id

              return (
                <div
                  key={cat.id}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border transition-colors ${
                    mergeSource === cat.id
                      ? 'border-at-border bg-at-warning-bg'
                      : mergeSource && mergeSource !== cat.id
                        ? 'border-at-border hover:border-at-accent cursor-pointer hover:bg-at-accent-light'
                        : 'border-at-border'
                  }`}
                  onClick={() => {
                    if (mergeSource && mergeSource !== cat.id) {
                      handleMerge(cat.id)
                    }
                  }}
                >
                  <GripVertical className="w-4 h-4 text-at-text-weak flex-shrink-0" />

                  <span className={`w-3 h-3 rounded-full flex-shrink-0 ${colorClasses.bg} ring-1 ring-current ${colorClasses.text}`} />

                  {isEditing ? (
                    <>
                      <Input
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        className="text-sm h-7 flex-1"
                        autoFocus
                        onKeyDown={e => {
                          if (e.key === 'Enter') handleSaveEdit()
                          if (e.key === 'Escape') setEditingId(null)
                        }}
                      />
                      <select
                        value={editColor}
                        onChange={e => setEditColor(e.target.value)}
                        className="h-7 px-1 text-xs border border-at-border rounded-lg bg-white"
                      >
                        {TELEGRAM_CATEGORY_COLORS.map(c => (
                          <option key={c.value} value={c.value}>{c.name}</option>
                        ))}
                      </select>
                      <button onClick={handleSaveEdit} className="p-1 text-at-success hover:text-at-success">
                        <Check className="w-4 h-4" />
                      </button>
                      <button onClick={() => setEditingId(null)} className="p-1 text-at-text-weak hover:text-at-text-secondary">
                        <X className="w-4 h-4" />
                      </button>
                    </>
                  ) : (
                    <>
                      <span className="text-sm text-at-text flex-1">{cat.name}</span>
                      <span className="text-xs text-at-text-weak">{cat.post_count}개</span>
                      {cat.is_default && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-at-surface-alt text-at-text-weak rounded-lg">기본</span>
                      )}
                      {!cat.is_default && !mergeSource && (
                        <div className="flex items-center gap-0.5">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleStartEdit(cat) }}
                            className="p-1 text-at-text-weak hover:text-at-accent"
                            title="수정"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); setMergeSource(cat.id) }}
                            className="p-1 text-at-text-weak hover:text-at-warning"
                            title="다른 카테고리로 병합"
                          >
                            <Merge className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDelete(cat) }}
                            className="p-1 text-at-text-weak hover:text-at-error"
                            title="삭제"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
