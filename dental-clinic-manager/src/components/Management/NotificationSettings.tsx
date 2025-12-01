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
import { getSupabase } from '@/lib/supabase'
import type { UserProfile } from '@/contexts/AuthContext'
import type {
  ClinicNotification,
  NotificationFormData,
  NotificationCategory,
  TargetRole,
  RecurrenceType,
  DayOfWeek,
  NOTIFICATION_CATEGORY_LABELS,
  TARGET_ROLE_LABELS,
  RECURRENCE_TYPE_LABELS,
  DAY_OF_WEEK_LABELS
} from '@/types/notification'
import {
  getDefaultNotificationFormData
} from '@/types/notification'

interface NotificationSettingsProps {
  currentUser: UserProfile
  clinicId: string
}

// 카테고리 아이콘 매핑
const CategoryIconComponents: Record<NotificationCategory, React.ComponentType<{ className?: string }>> = {
  general: MegaphoneIcon,
  insurance: DocumentTextIcon,
  event: CalendarIcon,
  birthday: CakeIcon,
  reminder: BellIcon,
  important: ExclamationTriangleIcon
}

// 카테고리 라벨
const categoryLabels: Record<NotificationCategory, string> = {
  general: '일반',
  insurance: '보험청구',
  event: '행사/회식',
  birthday: '직원 생일',
  reminder: '리마인더',
  important: '중요 공지'
}

// 대상 역할 라벨
const targetRoleLabels: Record<TargetRole, string> = {
  all: '전체',
  owner: '대표원장',
  vice_director: '부원장',
  manager: '실장',
  team_leader: '팀장',
  staff: '일반직원'
}

// 반복 주기 라벨
const recurrenceLabels: Record<RecurrenceType, string> = {
  none: '반복 없음',
  daily: '매일',
  weekly: '매주',
  monthly: '매월',
  yearly: '매년'
}

// 요일 라벨
const dayLabels: Record<DayOfWeek, string> = {
  0: '일',
  1: '월',
  2: '화',
  3: '수',
  4: '목',
  5: '금',
  6: '토'
}

export default function NotificationSettings({ currentUser, clinicId }: NotificationSettingsProps) {
  const [notifications, setNotifications] = useState<ClinicNotification[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  // 모달 상태
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingNotification, setEditingNotification] = useState<ClinicNotification | null>(null)
  const [formData, setFormData] = useState<NotificationFormData>(getDefaultNotificationFormData())

  // 삭제 확인 모달
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null)

  useEffect(() => {
    fetchNotifications()
  }, [clinicId])

  const fetchNotifications = async () => {
    setLoading(true)
    const supabase = getSupabase()
    if (!supabase) {
      setError('데이터베이스 연결에 실패했습니다.')
      setLoading(false)
      return
    }

    try {
      const { data, error } = await supabase
        .from('clinic_notifications')
        .select('*')
        .eq('clinic_id', clinicId)
        .order('priority', { ascending: true })
        .order('created_at', { ascending: false })

      if (error) {
        console.error('Error fetching notifications:', error)
        // 테이블이 없을 수도 있으니 빈 배열로 설정
        setNotifications([])
      } else {
        setNotifications((data as ClinicNotification[]) || [])
      }
    } catch (err) {
      console.error('Error:', err)
      setNotifications([])
    } finally {
      setLoading(false)
    }
  }

  const openCreateModal = () => {
    setEditingNotification(null)
    setFormData(getDefaultNotificationFormData())
    setIsModalOpen(true)
    setError('')
    setSuccess('')
  }

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
    setIsModalOpen(true)
    setError('')
    setSuccess('')
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setEditingNotification(null)
    setFormData(getDefaultNotificationFormData())
    setError('')
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target
    if (type === 'checkbox') {
      setFormData(prev => ({
        ...prev,
        [name]: (e.target as HTMLInputElement).checked
      }))
    } else if (name === 'priority') {
      setFormData(prev => ({
        ...prev,
        [name]: parseInt(value) || 10
      }))
    } else {
      setFormData(prev => ({
        ...prev,
        [name]: value
      }))
    }
  }

  const handleTargetRoleToggle = (role: TargetRole) => {
    setFormData(prev => {
      const newRoles = prev.target_roles.includes(role)
        ? prev.target_roles.filter(r => r !== role)
        : [...prev.target_roles, role]

      // 'all'이 선택되면 다른 것들 제거, 다른 것이 선택되면 'all' 제거
      if (role === 'all' && newRoles.includes('all')) {
        return { ...prev, target_roles: ['all'] }
      } else if (role !== 'all' && newRoles.includes(role)) {
        return { ...prev, target_roles: newRoles.filter(r => r !== 'all') }
      }

      // 아무것도 선택 안 되면 'all'로
      if (newRoles.length === 0) {
        return { ...prev, target_roles: ['all'] }
      }

      return { ...prev, target_roles: newRoles }
    })
  }

  const handleDayOfWeekToggle = (day: DayOfWeek) => {
    setFormData(prev => {
      const currentDays = prev.recurrence_config.days_of_week || []
      const newDays = currentDays.includes(day)
        ? currentDays.filter(d => d !== day)
        : [...currentDays, day].sort((a, b) => a - b)

      return {
        ...prev,
        recurrence_config: {
          ...prev.recurrence_config,
          days_of_week: newDays
        }
      }
    })
  }

  const handleRecurrenceConfigChange = (field: string, value: number) => {
    setFormData(prev => ({
      ...prev,
      recurrence_config: {
        ...prev.recurrence_config,
        [field]: value
      }
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.title.trim()) {
      setError('알림 제목을 입력해주세요.')
      return
    }

    setSaving(true)
    setError('')
    setSuccess('')

    const supabase = getSupabase()
    if (!supabase) {
      setError('데이터베이스 연결에 실패했습니다.')
      setSaving(false)
      return
    }

    try {
      const notificationData = {
        clinic_id: clinicId,
        title: formData.title.trim(),
        content: formData.content.trim() || null,
        category: formData.category,
        target_roles: formData.target_roles,
        recurrence_type: formData.recurrence_type,
        recurrence_config: Object.keys(formData.recurrence_config).length > 0
          ? formData.recurrence_config
          : null,
        start_date: formData.start_date,
        end_date: formData.end_date || null,
        is_active: formData.is_active,
        priority: formData.priority,
        updated_at: new Date().toISOString()
      }

      if (editingNotification) {
        // 수정
        const { error } = await supabase
          .from('clinic_notifications')
          .update(notificationData)
          .eq('id', editingNotification.id)

        if (error) throw error
        setSuccess('알림이 수정되었습니다.')
      } else {
        // 생성
        const { error } = await supabase
          .from('clinic_notifications')
          .insert({
            ...notificationData,
            created_by: currentUser.id,
            created_at: new Date().toISOString()
          })

        if (error) throw error
        setSuccess('알림이 생성되었습니다.')
      }

      fetchNotifications()
      closeModal()
    } catch (err: any) {
      console.error('Error saving notification:', err)
      setError(err.message || '알림 저장에 실패했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    const supabase = getSupabase()
    if (!supabase) return

    try {
      const { error } = await supabase
        .from('clinic_notifications')
        .delete()
        .eq('id', id)

      if (error) throw error
      setSuccess('알림이 삭제되었습니다.')
      fetchNotifications()
    } catch (err: any) {
      console.error('Error deleting notification:', err)
      setError(err.message || '알림 삭제에 실패했습니다.')
    }
    setDeleteConfirm(null)
  }

  const toggleActive = async (notification: ClinicNotification) => {
    const supabase = getSupabase()
    if (!supabase) return

    try {
      const { error } = await supabase
        .from('clinic_notifications')
        .update({
          is_active: !notification.is_active,
          updated_at: new Date().toISOString()
        })
        .eq('id', notification.id)

      if (error) throw error
      fetchNotifications()
    } catch (err) {
      console.error('Error toggling notification:', err)
    }
  }

  if (loading) {
    return (
      <div className="text-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
        <p className="text-slate-600">알림 목록을 불러오는 중...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-slate-800">알림 관리</h3>
          <p className="text-sm text-slate-500 mt-1">
            직원들에게 표시할 알림을 관리합니다. 알림은 헤더에 표시됩니다.
          </p>
        </div>
        <button
          onClick={openCreateModal}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          <PlusIcon className="w-5 h-5" />
          <span>새 알림</span>
        </button>
      </div>

      {/* 메시지 */}
      {error && (
        <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-green-50 border border-green-200 text-green-600 px-4 py-3 rounded-md text-sm">
          {success}
        </div>
      )}

      {/* 알림 목록 */}
      {notifications.length === 0 ? (
        <div className="text-center py-12 bg-slate-50 rounded-lg">
          <BellIcon className="w-12 h-12 text-slate-300 mx-auto mb-4" />
          <p className="text-slate-500">등록된 알림이 없습니다.</p>
          <p className="text-sm text-slate-400 mt-1">새 알림을 추가하여 직원들에게 공지사항을 전달하세요.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {notifications.map((notification) => {
            const IconComponent = CategoryIconComponents[notification.category]
            return (
              <div
                key={notification.id}
                className={`
                  bg-white border rounded-lg p-4 transition-all
                  ${notification.is_active ? 'border-slate-200' : 'border-slate-100 bg-slate-50 opacity-60'}
                `}
              >
                <div className="flex items-start gap-4">
                  {/* 카테고리 아이콘 */}
                  <div className={`
                    flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center
                    ${notification.category === 'important' ? 'bg-red-100' :
                      notification.category === 'birthday' ? 'bg-pink-100' :
                      notification.category === 'event' ? 'bg-purple-100' :
                      notification.category === 'insurance' ? 'bg-emerald-100' :
                      notification.category === 'reminder' ? 'bg-amber-100' :
                      'bg-blue-100'}
                  `}>
                    <IconComponent className={`w-5 h-5
                      ${notification.category === 'important' ? 'text-red-600' :
                        notification.category === 'birthday' ? 'text-pink-600' :
                        notification.category === 'event' ? 'text-purple-600' :
                        notification.category === 'insurance' ? 'text-emerald-600' :
                        notification.category === 'reminder' ? 'text-amber-600' :
                        'text-blue-600'}
                    `} />
                  </div>

                  {/* 내용 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium text-slate-800 truncate">
                        {notification.title}
                      </h4>
                      <span className={`
                        text-xs px-2 py-0.5 rounded-full
                        ${notification.is_active ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}
                      `}>
                        {notification.is_active ? '활성' : '비활성'}
                      </span>
                    </div>

                    {notification.content && (
                      <p className="text-sm text-slate-500 mb-2 line-clamp-2">
                        {notification.content}
                      </p>
                    )}

                    <div className="flex flex-wrap gap-2 text-xs text-slate-500">
                      <span className="bg-slate-100 px-2 py-0.5 rounded">
                        {categoryLabels[notification.category]}
                      </span>
                      <span className="bg-slate-100 px-2 py-0.5 rounded">
                        {recurrenceLabels[notification.recurrence_type]}
                        {notification.recurrence_type === 'weekly' && notification.recurrence_config?.days_of_week && (
                          <> ({notification.recurrence_config.days_of_week.map(d => dayLabels[d as DayOfWeek]).join(', ')})</>
                        )}
                        {notification.recurrence_type === 'monthly' && notification.recurrence_config?.day_of_month && (
                          <> ({notification.recurrence_config.day_of_month}일)</>
                        )}
                        {notification.recurrence_type === 'yearly' && notification.recurrence_config?.month && notification.recurrence_config?.day && (
                          <> ({notification.recurrence_config.month}월 {notification.recurrence_config.day}일)</>
                        )}
                      </span>
                      <span className="bg-slate-100 px-2 py-0.5 rounded">
                        대상: {notification.target_roles.map(r => targetRoleLabels[r]).join(', ')}
                      </span>
                      {notification.end_date && (
                        <span className="bg-slate-100 px-2 py-0.5 rounded">
                          ~{notification.end_date.split('T')[0]}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* 액션 버튼들 */}
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <button
                      onClick={() => toggleActive(notification)}
                      className={`p-2 rounded-lg transition-colors ${
                        notification.is_active
                          ? 'text-green-600 hover:bg-green-50'
                          : 'text-slate-400 hover:bg-slate-100'
                      }`}
                      title={notification.is_active ? '비활성화' : '활성화'}
                    >
                      <CheckIcon className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => openEditModal(notification)}
                      className="p-2 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                      title="수정"
                    >
                      <PencilIcon className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => setDeleteConfirm(notification.id)}
                      className="p-2 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                      title="삭제"
                    >
                      <TrashIcon className="w-5 h-5" />
                    </button>
                  </div>
                </div>

                {/* 삭제 확인 */}
                {deleteConfirm === notification.id && (
                  <div className="mt-3 pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                    <span className="text-sm text-slate-600 mr-2">정말 삭제하시겠습니까?</span>
                    <button
                      onClick={() => setDeleteConfirm(null)}
                      className="px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded transition-colors"
                    >
                      취소
                    </button>
                    <button
                      onClick={() => handleDelete(notification.id)}
                      className="px-3 py-1.5 text-sm text-white bg-red-600 hover:bg-red-700 rounded transition-colors"
                    >
                      삭제
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* 생성/수정 모달 */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold text-slate-800">
                {editingNotification ? '알림 수정' : '새 알림 추가'}
              </h3>
              <button
                onClick={closeModal}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"
              >
                <XMarkIcon className="w-6 h-6" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-4 space-y-4">
              {/* 제목 */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  제목 *
                </label>
                <input
                  type="text"
                  name="title"
                  value={formData.title}
                  onChange={handleInputChange}
                  placeholder="예: 보험청구 마감일"
                  className="w-full p-3 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  required
                />
              </div>

              {/* 내용 (선택) */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  상세 내용 (선택)
                </label>
                <textarea
                  name="content"
                  value={formData.content}
                  onChange={handleInputChange}
                  rows={2}
                  placeholder="추가 설명이 필요한 경우 입력하세요"
                  className="w-full p-3 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* 카테고리 */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  카테고리
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(categoryLabels) as NotificationCategory[]).map((category) => {
                    const Icon = CategoryIconComponents[category]
                    return (
                      <button
                        key={category}
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, category }))}
                        className={`
                          flex items-center gap-2 p-2 rounded-lg border transition-all text-sm
                          ${formData.category === category
                            ? 'border-blue-500 bg-blue-50 text-blue-700'
                            : 'border-slate-200 hover:border-slate-300 text-slate-600'}
                        `}
                      >
                        <Icon className="w-4 h-4" />
                        <span>{categoryLabels[category]}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* 대상 역할 */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  표시 대상
                </label>
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(targetRoleLabels) as TargetRole[]).map((role) => (
                    <button
                      key={role}
                      type="button"
                      onClick={() => handleTargetRoleToggle(role)}
                      className={`
                        px-3 py-1.5 rounded-full text-sm transition-all
                        ${formData.target_roles.includes(role)
                          ? 'bg-blue-500 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}
                      `}
                    >
                      {targetRoleLabels[role]}
                    </button>
                  ))}
                </div>
              </div>

              {/* 반복 주기 */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  반복 주기
                </label>
                <select
                  name="recurrence_type"
                  value={formData.recurrence_type}
                  onChange={handleInputChange}
                  className="w-full p-3 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                >
                  {(Object.keys(recurrenceLabels) as RecurrenceType[]).map((type) => (
                    <option key={type} value={type}>
                      {recurrenceLabels[type]}
                    </option>
                  ))}
                </select>
              </div>

              {/* 반복 설정 상세 */}
              {formData.recurrence_type === 'weekly' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    요일 선택
                  </label>
                  <div className="flex gap-1">
                    {([0, 1, 2, 3, 4, 5, 6] as DayOfWeek[]).map((day) => (
                      <button
                        key={day}
                        type="button"
                        onClick={() => handleDayOfWeekToggle(day)}
                        className={`
                          w-10 h-10 rounded-lg text-sm font-medium transition-all
                          ${formData.recurrence_config.days_of_week?.includes(day)
                            ? 'bg-blue-500 text-white'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}
                        `}
                      >
                        {dayLabels[day]}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {formData.recurrence_type === 'monthly' && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    매월 날짜
                  </label>
                  <select
                    value={formData.recurrence_config.day_of_month || 1}
                    onChange={(e) => handleRecurrenceConfigChange('day_of_month', parseInt(e.target.value))}
                    className="w-full p-3 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  >
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                      <option key={day} value={day}>
                        {day}일
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {formData.recurrence_type === 'yearly' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      월
                    </label>
                    <select
                      value={formData.recurrence_config.month || 1}
                      onChange={(e) => handleRecurrenceConfigChange('month', parseInt(e.target.value))}
                      className="w-full p-3 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    >
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((month) => (
                        <option key={month} value={month}>
                          {month}월
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      일
                    </label>
                    <select
                      value={formData.recurrence_config.day || 1}
                      onChange={(e) => handleRecurrenceConfigChange('day', parseInt(e.target.value))}
                      className="w-full p-3 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    >
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                        <option key={day} value={day}>
                          {day}일
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {/* 기간 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    시작일 *
                  </label>
                  <input
                    type="date"
                    name="start_date"
                    value={formData.start_date}
                    onChange={handleInputChange}
                    className="w-full p-3 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    종료일 (선택)
                  </label>
                  <input
                    type="date"
                    name="end_date"
                    value={formData.end_date}
                    onChange={handleInputChange}
                    className="w-full p-3 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              {/* 우선순위 */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  우선순위 (낮을수록 먼저 표시)
                </label>
                <input
                  type="number"
                  name="priority"
                  value={formData.priority}
                  onChange={handleInputChange}
                  min="1"
                  max="100"
                  className="w-24 p-3 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              {/* 활성화 */}
              <div className="flex items-center">
                <input
                  type="checkbox"
                  id="is_active"
                  name="is_active"
                  checked={formData.is_active}
                  onChange={handleInputChange}
                  className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="is_active" className="ml-2 block text-sm text-slate-700">
                  즉시 활성화
                </label>
              </div>

              {/* 에러 메시지 */}
              {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 px-3 py-2 rounded text-sm">
                  {error}
                </div>
              )}

              {/* 버튼 */}
              <div className="flex justify-end gap-2 pt-4 border-t">
                <button
                  type="button"
                  onClick={closeModal}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white rounded-lg transition-colors"
                >
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
