'use client'

import { useState, useEffect } from 'react'
import { dataService } from '@/lib/dataService'
import {
  UserCircleIcon,
  KeyIcon,
  EnvelopeIcon,
  PhoneIcon,
  BuildingOfficeIcon,
  ShieldCheckIcon,
  CalendarIcon,
  XMarkIcon
} from '@heroicons/react/24/outline'
import type { UserProfile } from '@/contexts/AuthContext'

interface AccountProfileProps {
  currentUser: UserProfile
  onClose?: () => void
  onUpdate?: (updatedUser: UserProfile) => void
}

export default function AccountProfile({ currentUser, onClose, onUpdate }: AccountProfileProps) {
  const [user, setUser] = useState<any>(currentUser)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showPasswordChange, setShowPasswordChange] = useState(false)

  const [formData, setFormData] = useState({
    name: currentUser?.name || '',
    email: currentUser?.email || '',
    phone: currentUser?.phone || ''
  })

  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  })

  useEffect(() => {
    if (currentUser) {
      setFormData({
        name: currentUser?.name || '',
        email: currentUser?.email || '',
        phone: currentUser?.phone || ''
      })
    }
  }, [currentUser])

  // 타입 안전성을 위한 처리
  if (!currentUser) {
    return null
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setPasswordData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')
    setSaving(true)

    try {
      const result = await dataService.updateUserProfile(currentUser.id, {
        name: formData.name,
        phone: formData.phone,
      })

      if (result.error) {
        throw new Error(result.error)
      }

      const updatedUser = result.data

      setUser(updatedUser)
      setSuccess('프로필이 성공적으로 업데이트되었습니다.')

      if (onUpdate && updatedUser) {
        onUpdate(updatedUser as UserProfile)
      }

      setTimeout(() => {
        setSuccess('')
      }, 3000)
    } catch (err) {
      console.error('Error:', err)
      setError('프로필 업데이트 중 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setError('새 비밀번호가 일치하지 않습니다.')
      return
    }

    if (passwordData.newPassword.length < 6) {
      setError('비밀번호는 최소 6자 이상이어야 합니다.')
      return
    }

    setError('')
    setSuccess('')
    setSaving(true)

    try {
      console.log('[PasswordChange] 비밀번호 변경 시작')

      if (!currentUser.email) {
        setError('계정에 등록된 이메일이 없어 비밀번호를 변경할 수 없습니다.')
        setSaving(false)
        return
      }

      // 1. 현재 비밀번호로 재인증 (보안 확인)
      const result = await dataService.verifyPassword(
        currentUser.email,
        passwordData.currentPassword
      )

      if (result.error || !result.success) {
        setError('현재 비밀번호가 올바르지 않습니다.')
        setSaving(false)
        return
      }

      console.log('[PasswordChange] 현재 비밀번호 확인 완료')

      // 2. 새 비밀번호로 업데이트
      const updateResult = await dataService.updatePassword(passwordData.newPassword)

      if (updateResult.error) {
        throw new Error(updateResult.error)
      }

      console.log('[PasswordChange] 비밀번호 변경 성공')

      setSuccess('비밀번호가 성공적으로 변경되었습니다.')
      setPasswordData({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      })
      setShowPasswordChange(false)

      setTimeout(() => {
        setSuccess('')
      }, 3000)
    } catch (err) {
      console.error('[PasswordChange] 오류:', err)
      const errorMessage = err instanceof Error ? err.message : '비밀번호 변경 중 오류가 발생했습니다.'
      setError(errorMessage)
    } finally {
      setSaving(false)
    }
  }

  const getRoleLabel = (role: string) => {
    const labels = {
      owner: '원장',
      vice_director: '부원장',
      manager: '실장',
      team_leader: '팀장',
      staff: '직원',
      master_admin: '시스템 관리자'
    }
    return labels[role as keyof typeof labels] || role
  }

  const getStatusBadge = (status: string) => {
    const badges = {
      active: 'bg-green-100 text-green-800',
      pending: 'bg-yellow-100 text-yellow-800',
      suspended: 'bg-red-100 text-red-800'
    }
    const labels = {
      active: '활성',
      pending: '대기중',
      suspended: '정지됨'
    }
    return (
      <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${badges[status as keyof typeof badges]}`}>
        {labels[status as keyof typeof labels] || status}
      </span>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200">
      {/* Header */}
      <div className="p-6 border-b border-slate-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <UserCircleIcon className="h-8 w-8 text-blue-600 mr-3" />
            <div>
              <h2 className="text-xl font-bold text-slate-800">계정 정보</h2>
              <p className="text-sm text-slate-500">프로필 정보를 확인하고 수정할 수 있습니다</p>
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors"
            >
              <XMarkIcon className="h-5 w-5 text-slate-500" />
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="mx-6 mt-4 bg-green-50 border border-green-200 text-green-600 px-4 py-3 rounded-md text-sm">
          {success}
        </div>
      )}

      <div className="p-6">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - User Info */}
          <div className="lg:col-span-2 space-y-6">
            {/* Profile Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  이름
                </label>
                <div className="relative">
                  <UserCircleIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-400" />
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    required
                    disabled={saving}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  이메일
                </label>
                <div className="relative">
                  <EnvelopeIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-400" />
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-md bg-slate-50 cursor-not-allowed"
                    disabled
                  />
                </div>
                <p className="mt-1 text-xs text-slate-500">이메일은 변경할 수 없습니다</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  전화번호
                </label>
                <div className="relative">
                  <PhoneIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-400" />
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleInputChange}
                    className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    placeholder="010-1234-5678"
                    disabled={saving}
                  />
                </div>
              </div>

              <div className="flex justify-between">
                <button
                  type="button"
                  onClick={() => setShowPasswordChange(!showPasswordChange)}
                  className="text-blue-600 hover:text-blue-700 text-sm font-medium"
                >
                  비밀번호 변경
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-medium py-2 px-4 rounded-md transition-colors"
                >
                  {saving ? '저장 중...' : '프로필 저장'}
                </button>
              </div>
            </form>

            {/* Password Change Form */}
            {showPasswordChange && (
              <form onSubmit={handlePasswordSubmit} className="space-y-4 pt-6 border-t border-slate-200">
                <h3 className="text-lg font-semibold text-slate-800 mb-4">비밀번호 변경</h3>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    현재 비밀번호
                  </label>
                  <div className="relative">
                    <KeyIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-400" />
                    <input
                      type="password"
                      name="currentPassword"
                      value={passwordData.currentPassword}
                      onChange={handlePasswordChange}
                      className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      required
                      disabled={saving}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    새 비밀번호
                  </label>
                  <div className="relative">
                    <KeyIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-400" />
                    <input
                      type="password"
                      name="newPassword"
                      value={passwordData.newPassword}
                      onChange={handlePasswordChange}
                      className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      required
                      disabled={saving}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    새 비밀번호 확인
                  </label>
                  <div className="relative">
                    <KeyIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-400" />
                    <input
                      type="password"
                      name="confirmPassword"
                      value={passwordData.confirmPassword}
                      onChange={handlePasswordChange}
                      className="w-full pl-10 pr-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      required
                      disabled={saving}
                    />
                  </div>
                </div>

                <div className="flex justify-end space-x-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowPasswordChange(false)
                      setPasswordData({
                        currentPassword: '',
                        newPassword: '',
                        confirmPassword: ''
                      })
                    }}
                    className="px-4 py-2 text-slate-700 hover:text-slate-900 font-medium"
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-medium py-2 px-4 rounded-md transition-colors"
                  >
                    {saving ? '변경 중...' : '비밀번호 변경'}
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Right Column - Account Details */}
          <div className="space-y-4">
            {/* Account Status */}
            <div className="bg-slate-50 p-4 rounded-lg">
              <div className="flex items-center mb-3">
                <ShieldCheckIcon className="h-5 w-5 text-slate-600 mr-2" />
                <h4 className="font-semibold text-slate-800">계정 상태</h4>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600">상태:</span>
                  {user?.status ? getStatusBadge(user.status) : <span>-</span>}
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">역할:</span>
                  <span className="font-medium">{user?.role ? getRoleLabel(user.role) : '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">ID:</span>
                  <span className="font-mono text-xs">{user?.id ? user.id.slice(0, 8) + '...' : '-'}</span>
                </div>
              </div>
            </div>

            {/* Clinic Info */}
            <div className="bg-slate-50 p-4 rounded-lg">
              <div className="flex items-center mb-3">
                <BuildingOfficeIcon className="h-5 w-5 text-slate-600 mr-2" />
                <h4 className="font-semibold text-slate-800">소속 병원</h4>
              </div>
              <div className="space-y-2 text-sm">
                <div>
                  <p className="font-medium text-slate-800">
                    {user?.clinic?.name || '정보 없음'}
                  </p>
                  {user?.clinic?.owner_name && (
                    <p className="text-slate-600 text-xs mt-1">
                      원장: {user.clinic.owner_name}
                    </p>
                  )}
                  {user?.clinic?.address && (
                    <p className="text-slate-600 text-xs mt-1">
                      {user.clinic.address}
                    </p>
                  )}
                </div>
                <div className="text-xs text-slate-500">
                  {user?.clinic?.phone && (
                    <p>{user.clinic.phone}</p>
                  )}
                  {user?.clinic?.email && (
                    <p>{user.clinic.email}</p>
                  )}
                </div>
              </div>
            </div>

            {/* Activity Info */}
            <div className="bg-slate-50 p-4 rounded-lg">
              <div className="flex items-center mb-3">
                <CalendarIcon className="h-5 w-5 text-slate-600 mr-2" />
                <h4 className="font-semibold text-slate-800">활동 정보</h4>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600">가입일:</span>
                  <span className="font-medium">
                    {user?.created_at
                      ? (() => {
                          try {
                            return new Date(user.created_at).toLocaleDateString('ko-KR')
                          } catch {
                            return '-'
                          }
                        })()
                      : '-'}
                  </span>
                </div>
                {user?.last_login_at && (
                  <div className="flex justify-between">
                    <span className="text-slate-600">최근 로그인:</span>
                    <span className="font-medium">
                      {(() => {
                        try {
                          return new Date(user.last_login_at).toLocaleDateString('ko-KR')
                        } catch {
                          return '-'
                        }
                      })()}
                    </span>
                  </div>
                )}
                {user?.approved_by && user?.approved_at && (
                  <div className="flex justify-between">
                    <span className="text-slate-600">승인일:</span>
                    <span className="font-medium">
                      {(() => {
                        try {
                          return new Date(user.approved_at).toLocaleDateString('ko-KR')
                        } catch {
                          return '-'
                        }
                      })()}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}