'use client'

import { useState, useEffect } from 'react'
import {
  PlusIcon,
  PencilIcon,
  TrashIcon,
  XMarkIcon,
  CheckIcon,
  MegaphoneIcon,
  DocumentTextIcon,
  CalendarIcon,
  CakeIcon,
  BellIcon,
  ExclamationTriangleIcon
} from '@heroicons/react/24/outline'
import type { UserProfile } from '@/contexts/AuthContext'
import type {
  ClinicNotification,
  NotificationFormData,
  NotificationCategory,
  TargetRole,
  RecurrenceType,
  DayOfWeek,
} from '@/types/notification'
import { getDefaultNotificationFormData } from '@/types/notification'

interface NotificationSettingsProps {
  currentUser: UserProfile
  clinicId: string
}

const CategoryIconComponents: Record<NotificationCategory, React.ComponentType<{ className?: string }>> = {
  general: MegaphoneIcon,
  insurance: DocumentTextIcon,
  event: CalendarIcon,
  birthday: CakeIcon,
  reminder: BellIcon,
  important: ExclamationTriangleIcon
}

const categoryLabels: Record<NotificationCategory, string> = {
  general: '일반',
  insurance: '보험청구',
  event: '행사/회식',
  birthday: '직원 생일',
  reminder: '리마인더',
  important: '중요 공지'
}

const targetRoleLabels: Record<TargetRole, string> = {
  all: '전체',
  owner: '대표원장',
  vice_director: '부원장',
  manager: '실장',
  team_leader: '팀장',
  staff: '일반직원'
}

const recurrenceLabels: Record<RecurrenceType, string> = {
  none: '반복 없음',
  daily: '매일',
  weekly: '매주',
  monthly: '매월',
  yearly: '매년'
}

const dayLabels: Record<DayOfWeek, string> = {
  0: '일', 1: '월', 2: '화', 3: '수', 4: '목', 5: '금', 6: '토'
}

export default function NotificationSettings({ currentUser, clinicId }: NotificationSettingsProps) {
  const [notifications, setNotifications] = useState<ClinicNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingNotification, setEditingNotification] = useState<ClinicNotification | null>(null)
  const [formData, setFormData] = useState<NotificationFormData>(getDefaultNotificationFormData())
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  useEffect(() => { fetchNotifications() }, [clinicId])

  const fetchNotifications = async () => {
    try {
      const response = await fetch(`/api/notifications?clinicId=${encodeURIComponent(clinicId)}`)
      const result = await response.json()
      if (!response.ok) { console.error('Error fetching notifications:', result.error); setNotifications([]) }
      else { setNotifications((result.data as ClinicNotification[]) || []) }
    } catch (err) { console.error('Error:', err); setNotifications([]) }
    finally { setLoading(false) }
  }

  const openCreateModal = () => { setEditingNotification(null); setFormData(getDefaultNotificationFormData()); setIsModalOpen(true); setError(''); setSuccess('') }

  const openEditModal = (notification: ClinicNotification) => {
    setEditingNotification(notification)
    setFormData({
      title: notification.title,
      content: notification.content || '',
      category: notification.category,
      target_roles: notification.target_roles,
      recurrence_type: notification.recurrence_type,
      recurrence_config: notification.recurrence_config || {},
      start_date: notification.start_date.split('T')[0],
      end_date: notification.end_date ? notification.end_date.split('T')[0] : '',
      is_active: notification.is_active,
      priority: notification.priority
    })
    setIsModalOpen(true); setError(''); setSuccess('')
  }

  const closeModal = () => { setIsModalOpen(false); setEditingNotification(null); setFormData(getDefaultNotificationFormData()); setError('') }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target
    if (type === 'checkbox') {
      setFormData(prev => ({ ...prev, [name]: (e.target as HTMLInputElement).checked }))
    } else if (name === 'priority') {
      setFormData(prev => ({ ...prev, [name]: parseInt(value) || 10 }))
    } else {
      setFormData(prev => ({ ...prev, [name]: value }))
    }
  }

  const handleTargetRoleToggle = (role: TargetRole) => {
    setFormData(prev => {
      const newRoles = prev.target_roles.includes(role)
        ? prev.target_roles.filter(r => r !== role)
        : [...prev.target_roles, role]
      if (role === 'all' && newRoles.includes('all')) return { ...prev, target_roles: ['all'] }
      else if (role !== 'all' && newRoles.includes(role)) return { ...prev, target_roles: newRoles.filter(r => r !== 'all') }
      if (newRoles.length === 0) return { ...prev, target_roles: ['all'] }
      return { ...prev, target_roles: newRoles }
    })
  }

  const handleDayOfWeekToggle = (day: DayOfWeek) => {
    setFormData(prev => {
      const currentDays = prev.recurrence_config.days_of_week || []
      const newDays = currentDays.includes(day) ? currentDays.filter(d => d !== day) : [...currentDays, day].sort((a, b) => a - b)
      return { ...prev, recurrence_config: { ...prev.recurrence_config, days_of_week: newDays } }
    })
  }

  const handleRecurrenceConfigChange = (field: string, value: number) => {
    setFormData(prev => ({ ...prev, recurrence_config: { ...prev.recurrence_config, [field]: value } }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.title.trim()) { setError('알림 제목을 입력해주세요.'); return }
    setSaving(true); setError(''); setSuccess('')
    try {
      const notificationData = {
        title: formData.title.trim(),
        content: formData.content.trim() || null,
        category: formData.category,
        target_roles: formData.target_roles,
        recurrence_type: formData.recurrence_type,
        recurrence_config: Object.keys(formData.recurrence_config).length > 0 ? formData.recurrence_config : null,
        start_date: formData.start_date,
        end_date: formData.end_date || null,
        is_active: formData.is_active,
        priority: formData.priority,
      }
      if (editingNotification) {
        const response = await fetch('/api/notifications', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clinicId, userId: currentUser.id, notificationId: editingNotification.id, notification: notificationData }) })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || '알림 수정에 실패했습니다.')
        setSuccess('알림이 수정되었습니다.')
      } else {
        const response = await fetch('/api/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clinicId, userId: currentUser.id, notification: notificationData }) })
        const result = await response.json()
        if (!response.ok) throw new Error(result.error || '알림 생성에 실패했습니다.')
        setSuccess('알림이 생성되었습니다.')
      }
      fetchNotifications(); closeModal()
    } catch (err: any) { console.error('Error saving notification:', err); setError(err.message || '알림 저장에 실패했습니다.') }
    finally { setSaving(false) }
  }

  const handleDelete = async (id: string) => {
    try {
      const response = await fetch(`/api/notifications?clinicId=${encodeURIComponent(clinicId)}&userId=${encodeURIComponent(currentUser.id)}&notificationId=${encodeURIComponent(id)}`, { method: 'DELETE' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || '알림 삭제에 실패했습니다.')
      setSuccess('알림이 삭제되었습니다.'); fetchNotifications()
    } catch (err: any) { console.error('Error deleting notification:', err); setError(err.message || '알림 삭제에 실패했습니다.') }
    setDeleteConfirm(null)
  }

  const toggleActive = async (notification: ClinicNotification) => {
    try {
      const response = await fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clinicId, userId: currentUser.id, notificationId: notification.id, isActive: !notification.is_active }) })
      if (!response.ok) { const result = await response.json(); throw new Error(result.error) }
      fetchNotifications()
    } catch (err) { console.error('Error toggling notification:', err) }
  }

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-at-accent mx-auto mb-4"></div>
        <p className="text-at-text-secondary">알림 목록을 불러오는 중...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-at-text">알림 관리</h3>
          <p className="text-sm text-at-text-weak mt-1">직원들에게 표시할 알림을 관리합니다. 알림은 헤더에 표시됩니다.</p>
        </div>
        <button onClick={openCreateModal} className="flex items-center gap-2 px-4 py-2 bg-at-accent hover:bg-at-accent-hover text-white rounded-xl transition-colors">
          <PlusIcon className="w-5 h-5" />
          <span>새 알림</span>
        </button>
      </div>

      {error && <div className="bg-at-error-bg border border-red-200 text-at-error px-4 py-3 rounded-xl text-sm">{error}</div>}
      {success && <div className="bg-at-success-bg border border-green-200 text-at-success px-4 py-3 rounded-xl text-sm">{success}</div>}

      {notifications.length === 0 ? (
        <div className="text-center py-12 bg-at-surface-alt rounded-2xl">
          <BellIcon className="w-12 h-12 text-at-text-weak mx-auto mb-4" />
          <p className="text-at-text-secondary">등록된 알림이 없습니다.</p>
          <p className="text-sm text-at-text-weak mt-1">새 알림을 추가하여 직원들에게 공지사항을 전달하세요.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((notification) => {
            const IconComponent = CategoryIconComponents[notification.category]
            return (
              <div
                key={notification.id}
                className={`bg-white border rounded-xl p-4 transition-all ${notification.is_active ? 'border-at-border' : 'border-at-border bg-at-surface-alt opacity-60'}`}
              >
                <div className="flex items-start gap-4">
                  <div className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center ${
                    notification.category === 'important' ? 'bg-at-error-bg' :
                    notification.category === 'birthday' ? 'bg-pink-100' :
                    notification.category === 'event' ? 'bg-purple-100' :
                    notification.category === 'insurance' ? 'bg-emerald-100' :
                    notification.category === 'reminder' ? 'bg-amber-100' :
                    'bg-at-tag'
                  }`}>
                    <IconComponent className={`w-5 h-5 ${
                      notification.category === 'important' ? 'text-at-error' :
                      notification.category === 'birthday' ? 'text-pink-600' :
                      notification.category === 'event' ? 'text-purple-600' :
                      notification.category === 'insurance' ? 'text-emerald-600' :
                      notification.category === 'reminder' ? 'text-at-warning' :
                      'text-at-accent'
                    }`} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium text-at-text truncate">{notification.title}</h4>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${notification.is_active ? 'bg-at-success-bg text-at-success' : 'bg-at-surface-alt text-at-text-weak'}`}>
                        {notification.is_active ? '활성' : '비활성'}
                      </span>
                    </div>
                    {notification.content && <p className="text-sm text-at-text-secondary mb-2 line-clamp-2">{notification.content}</p>}
                    <div className="flex flex-wrap gap-2 text-xs text-at-text-weak">
                      <span className="bg-at-surface-alt px-2 py-0.5 rounded-lg">{categoryLabels[notification.category]}</span>
                      <span className="bg-at-surface-alt px-2 py-0.5 rounded-lg">
                        {recurrenceLabels[notification.recurrence_type]}
                        {notification.recurrence_type === 'weekly' && notification.recurrence_config?.days_of_week && <> ({notification.recurrence_config.days_of_week.map(d => dayLabels[d as DayOfWeek]).join(', ')})</>}
                        {notification.recurrence_type === 'monthly' && notification.recurrence_config?.day_of_month && <> ({notification.recurrence_config.day_of_month}일)</>}
                        {notification.recurrence_type === 'yearly' && notification.recurrence_config?.month && notification.recurrence_config?.day && <> ({notification.recurrence_config.month}월 {notification.recurrence_config.day}일)</>}
                      </span>
                      <span className="bg-at-surface-alt px-2 py-0.5 rounded-lg">대상: {notification.target_roles.map(r => targetRoleLabels[r]).join(', ')}</span>
                      {notification.end_date && <span className="bg-at-surface-alt px-2 py-0.5 rounded-lg">~{notification.end_date.split('T')[0]}</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button onClick={() => toggleActive(notification)} className={`p-2 rounded-xl transition-colors ${notification.is_active ? 'text-at-success hover:bg-at-success-bg' : 'text-at-text-weak hover:bg-at-surface-hover'}`} title={notification.is_active ? '비활성화' : '활성화'}>
                      <CheckIcon className="w-5 h-5" />
                    </button>
                    <button onClick={() => openEditModal(notification)} className="p-2 rounded-xl text-at-text-weak hover:text-at-accent hover:bg-at-accent-light transition-colors" title="수정">
                      <PencilIcon className="w-5 h-5" />
                    </button>
                    <button onClick={() => setDeleteConfirm(notification.id)} className="p-2 rounded-xl text-at-text-weak hover:text-at-error hover:bg-at-error-bg transition-colors" title="삭제">
                      <TrashIcon className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {deleteConfirm === notification.id && (
                  <div className="mt-3 pt-3 border-t border-at-border flex items-center justify-end gap-2">
                    <span className="text-sm text-at-text-secondary mr-2">정말 삭제하시겠습니까?</span>
                    <button onClick={() => setDeleteConfirm(null)} className="px-3 py-1.5 text-sm text-at-text-secondary hover:bg-at-surface-hover rounded-xl transition-colors">취소</button>
                    <button onClick={() => handleDelete(notification.id)} className="px-3 py-1.5 text-sm text-white bg-at-error hover:bg-red-700 rounded-xl transition-colors">삭제</button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-at-card w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b border-at-border">
              <h3 className="text-lg font-semibold text-at-text">{editingNotification ? '알림 수정' : '새 알림 추가'}</h3>
              <button onClick={closeModal} className="p-1 rounded-xl text-at-text-weak hover:text-at-text-secondary hover:bg-at-surface-hover transition-colors">
                <XMarkIcon className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-at-text-secondary mb-1">제목 *</label>
                <input type="text" name="title" value={formData.title} onChange={handleInputChange} placeholder="예: 보험청구 마감일" className="w-full p-3 border border-at-border rounded-xl focus:ring-at-accent focus:border-at-accent" required />
              </div>

              <div>
                <label className="block text-sm font-medium text-at-text-secondary mb-1">상세 내용 (선택)</label>
                <textarea name="content" value={formData.content} onChange={handleInputChange} rows={2} placeholder="추가 설명이 필요한 경우 입력하세요" className="w-full p-3 border border-at-border rounded-xl focus:ring-at-accent focus:border-at-accent" />
              </div>

              <div>
                <label className="block text-sm font-medium text-at-text-secondary mb-1">카테고리</label>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(categoryLabels) as NotificationCategory[]).map((category) => {
                    const Icon = CategoryIconComponents[category]
                    return (
                      <button key={category} type="button" onClick={() => setFormData(prev => ({ ...prev, category }))}
                        className={`flex items-center gap-2 p-2 rounded-xl border transition-all text-sm ${formData.category === category ? 'border-at-accent bg-at-tag text-at-accent' : 'border-at-border hover:border-at-text-weak text-at-text-secondary'}`}
                      >
                        <Icon className="w-4 h-4" />
                        <span>{categoryLabels[category]}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-at-text-secondary mb-1">표시 대상</label>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(targetRoleLabels) as TargetRole[]).map((role) => (
                    <button key={role} type="button" onClick={() => handleTargetRoleToggle(role)}
                      className={`px-3 py-1.5 rounded-full text-sm transition-all ${formData.target_roles.includes(role) ? 'bg-at-accent text-white' : 'bg-at-surface-alt text-at-text-secondary hover:bg-at-surface-hover'}`}
                    >
                      {targetRoleLabels[role]}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-at-text-secondary mb-1">반복 주기</label>
                <select name="recurrence_type" value={formData.recurrence_type} onChange={handleInputChange} className="w-full p-3 border border-at-border rounded-xl focus:ring-at-accent focus:border-at-accent">
                  {(Object.keys(recurrenceLabels) as RecurrenceType[]).map((type) => <option key={type} value={type}>{recurrenceLabels[type]}</option>)}
                </select>
              </div>

              {formData.recurrence_type === 'weekly' && (
                <div>
                  <label className="block text-sm font-medium text-at-text-secondary mb-1">요일 선택</label>
                  <div className="flex gap-1">
                    {([0, 1, 2, 3, 4, 5, 6] as DayOfWeek[]).map((day) => (
                      <button key={day} type="button" onClick={() => handleDayOfWeekToggle(day)}
                        className={`w-10 h-10 rounded-xl text-sm font-medium transition-all ${formData.recurrence_config.days_of_week?.includes(day) ? 'bg-at-accent text-white' : 'bg-at-surface-alt text-at-text-secondary hover:bg-at-surface-hover'}`}
                      >
                        {dayLabels[day]}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {formData.recurrence_type === 'monthly' && (
                <div>
                  <label className="block text-sm font-medium text-at-text-secondary mb-1">매월 날짜</label>
                  <select value={formData.recurrence_config.day_of_month || 1} onChange={(e) => handleRecurrenceConfigChange('day_of_month', parseInt(e.target.value))} className="w-full p-3 border border-at-border rounded-xl focus:ring-at-accent focus:border-at-accent">
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => <option key={day} value={day}>{day}일</option>)}
                  </select>
                </div>
              )}

              {formData.recurrence_type === 'yearly' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-at-text-secondary mb-1">월</label>
                    <select value={formData.recurrence_config.month || 1} onChange={(e) => handleRecurrenceConfigChange('month', parseInt(e.target.value))} className="w-full p-3 border border-at-border rounded-xl focus:ring-at-accent focus:border-at-accent">
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => <option key={month} value={month}>{month}월</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-at-text-secondary mb-1">일</label>
                    <select value={formData.recurrence_config.day || 1} onChange={(e) => handleRecurrenceConfigChange('day', parseInt(e.target.value))} className="w-full p-3 border border-at-border rounded-xl focus:ring-at-accent focus:border-at-accent">
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => <option key={day} value={day}>{day}일</option>)}
                    </select>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-at-text-secondary mb-1">시작일 *</label>
                  <input type="date" name="start_date" value={formData.start_date} onChange={handleInputChange} className="w-full p-3 border border-at-border rounded-xl focus:ring-at-accent focus:border-at-accent" required />
                </div>
                <div>
                  <label className="block text-sm font-medium text-at-text-secondary mb-1">종료일 (선택)</label>
                  <input type="date" name="end_date" value={formData.end_date} onChange={handleInputChange} className="w-full p-3 border border-at-border rounded-xl focus:ring-at-accent focus:border-at-accent" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-at-text-secondary mb-1">우선순위 (낮을수록 먼저 표시)</label>
                <input type="number" name="priority" value={formData.priority} onChange={handleInputChange} min="1" max="100" className="w-24 p-3 border border-at-border rounded-xl focus:ring-at-accent focus:border-at-accent" />
              </div>

              <div className="flex items-center">
                <input type="checkbox" id="is_active" name="is_active" checked={formData.is_active} onChange={handleInputChange} className="h-4 w-4 text-at-accent focus:ring-at-accent border-at-border rounded" />
                <label htmlFor="is_active" className="ml-2 block text-sm text-at-text-secondary">즉시 활성화</label>
              </div>

              {error && <div className="bg-at-error-bg border border-red-200 text-at-error px-3 py-2 rounded-xl text-sm">{error}</div>}

              <div className="flex justify-end gap-2 pt-4 border-t border-at-border">
                <button type="button" onClick={closeModal} className="px-4 py-2 text-at-text-secondary hover:bg-at-surface-hover rounded-xl transition-colors">취소</button>
                <button type="submit" disabled={saving} className="px-4 py-2 bg-at-accent hover:bg-at-accent-hover disabled:opacity-50 text-white rounded-xl transition-colors">
                  {saving ? '저장 중...' : editingNotification ? '수정' : '추가'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
