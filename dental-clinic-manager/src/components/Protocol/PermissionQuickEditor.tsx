'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { X } from 'lucide-react'

interface PermissionData {
  can_view: boolean
  can_edit: boolean
  can_create: boolean
  can_delete: boolean
}

interface PermissionQuickEditorProps {
  staffId: string
  staffName: string
  protocolId: string
  protocolTitle: string
  currentPermissions: PermissionData
  position: { x: number; y: number }
  onSave: (staffId: string, protocolId: string, permissions: PermissionData) => void
  onClose: () => void
}

const DEFAULT_PERMISSION: PermissionData = {
  can_view: false,
  can_edit: false,
  can_create: false,
  can_delete: false
}

export default function PermissionQuickEditor({
  staffId,
  staffName,
  protocolId,
  protocolTitle,
  currentPermissions,
  position,
  onSave,
  onClose
}: PermissionQuickEditorProps) {
  const [permissions, setPermissions] = useState<PermissionData>({ ...currentPermissions })
  const [saving, setSaving] = useState(false)
  const popoverRef = useRef<HTMLDivElement>(null)
  const [adjustedPos, setAdjustedPos] = useState(position)

  useEffect(() => {
    if (!popoverRef.current) return
    const rect = popoverRef.current.getBoundingClientRect()
    const padding = 16
    let x = position.x
    let y = position.y
    if (x + rect.width > window.innerWidth - padding) x = window.innerWidth - rect.width - padding
    if (x < padding) x = padding
    if (y + rect.height > window.innerHeight - padding) y = position.y - rect.height - 8
    if (y < padding) y = padding
    setAdjustedPos({ x, y })
  }, [position])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) onClose()
    }
    const timer = setTimeout(() => { document.addEventListener('mousedown', handleClickOutside) }, 100)
    return () => { clearTimeout(timer); document.removeEventListener('mousedown', handleClickOutside) }
  }, [onClose])

  const handleToggle = useCallback((permType: keyof PermissionData) => {
    setPermissions(prev => {
      if (permType === 'can_view') {
        if (prev.can_view) return { ...DEFAULT_PERMISSION }
        return { ...prev, can_view: true }
      }
      if (prev[permType]) return { ...prev, [permType]: false }
      return { ...prev, can_view: true, [permType]: true }
    })
  }, [])

  const handleSave = async () => {
    setSaving(true)
    try { await onSave(staffId, protocolId, permissions) }
    finally { setSaving(false) }
  }

  const hasChanges =
    permissions.can_view !== currentPermissions.can_view ||
    permissions.can_edit !== currentPermissions.can_edit ||
    permissions.can_create !== currentPermissions.can_create ||
    permissions.can_delete !== currentPermissions.can_delete

  const toggleItems: Array<{ key: keyof PermissionData; label: string; activeColor: string }> = [
    { key: 'can_view', label: '조회', activeColor: 'bg-at-tag text-at-accent border-at-accent' },
    { key: 'can_edit', label: '수정', activeColor: 'bg-at-success-bg text-at-success border-green-300' },
    { key: 'can_create', label: '생성', activeColor: 'bg-purple-100 text-purple-700 border-purple-300' },
    { key: 'can_delete', label: '삭제', activeColor: 'bg-at-error-bg text-at-error border-red-300' }
  ]

  return (
    <>
      <div className="fixed inset-0 z-[70]" />
      <div
        ref={popoverRef}
        className="fixed z-[71] bg-white rounded-2xl shadow-at-card border border-at-border w-64"
        style={{ left: adjustedPos.x, top: adjustedPos.y }}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-at-border">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-at-text truncate">{staffName}</p>
            <p className="text-xs text-at-text-weak truncate">{protocolTitle}</p>
          </div>
          <button onClick={onClose} className="ml-2 p-1 text-at-text-weak hover:text-at-text-secondary rounded-lg hover:bg-at-surface-hover">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3 space-y-2">
          {toggleItems.map(({ key, label, activeColor }) => (
            <button
              key={key}
              onClick={() => handleToggle(key)}
              className={`w-full flex items-center px-3 py-2 text-sm font-medium rounded-xl border transition-colors ${
                permissions[key] ? activeColor : 'bg-at-surface-alt text-at-text-weak border-at-border hover:bg-at-surface-hover'
              }`}
            >
              <span className={`w-2.5 h-2.5 rounded-full mr-3 ${permissions[key] ? 'bg-current' : 'bg-at-border'}`} />
              {label}
            </button>
          ))}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-at-border">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-at-text-secondary hover:bg-at-surface-hover rounded-xl">
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !hasChanges}
            className={`px-3 py-1.5 text-sm font-medium rounded-xl ${
              saving || !hasChanges ? 'bg-at-surface-alt text-at-text-weak cursor-not-allowed' : 'bg-at-accent text-white hover:bg-at-accent-hover'
            }`}
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>
    </>
  )
}
