'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { dataService } from '@/lib/dataService'
import {
  User,
  Key,
  Mail,
  Phone,
  Building2,
  Shield,
  Calendar,
  X,
  Home,
  CreditCard,
  AlertTriangle,
  Lock
} from 'lucide-react'
import type { UserProfile } from '@/contexts/AuthContext'
import {
  formatResidentNumber,
  validateResidentNumberWithMessage,
  maskResidentNumber,
  checkPersonalInfoCompletion
} from '@/utils/residentNumberUtils'
import { encryptResidentNumber, decryptResidentNumber } from '@/utils/encryptionUtils'
import { checkSecuritySession, setSecuritySession } from '@/lib/securitySession'
import PasswordVerificationModal from '@/components/Security/PasswordVerificationModal'

interface AccountProfileProps {
  currentUser: UserProfile
  onClose?: () => void
  onUpdate?: (updatedUser: UserProfile) => void
}

export default function AccountProfile({ currentUser, onClose, onUpdate }: AccountProfileProps) {
  const router = useRouter()
  const [user, setUser] = useState<any>(currentUser)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  // Password change dialog state
  const [showPasswordDialog, setShowPasswordDialog] = useState(false)
  const [pwCurrentPassword, setPwCurrentPassword] = useState('')
  const [pwNewPassword, setPwNewPassword] = useState('')
  const [pwConfirmPassword, setPwConfirmPassword] = useState('')
  const [pwSaving, setPwSaving] = useState(false)
  const [pwError, setPwError] = useState('')
  const [pwSuccess, setPwSuccess] = useState('')

  // Security verification state
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [isVerified, setIsVerified] = useState(false)

  const [formData, setFormData] = useState({
    name: currentUser?.name || '',
    email: currentUser?.email || '',
    phone: currentUser?.phone || '',
    address: currentUser?.address || '',
    resident_registration_number: currentUser?.resident_registration_number || ''
  })

  const [decryptedResidentNumber, setDecryptedResidentNumber] = useState('')
  const [showResidentNumber, setShowResidentNumber] = useState(false)
  const [loadingDecryption, setLoadingDecryption] = useState(false)


  // Check security session on mount
  useEffect(() => {
    console.log('[AccountProfile] Checking security session...')
    const hasValidSession = checkSecuritySession('profile')

    if (hasValidSession) {
      console.log('[AccountProfile] Valid security session found')
      setIsVerified(true)
    } else {
      console.log('[AccountProfile] No valid security session, showing password modal')
      setShowPasswordModal(true)
    }
  }, [])

  // Handle successful password verification
  const handlePasswordVerified = () => {
    console.log('[AccountProfile] Password verified, creating security session')
    setSecuritySession('profile')
    setShowPasswordModal(false)
    setIsVerified(true)
  }

  // Handle password verification cancel
  const handlePasswordCancel = () => {
    console.log('[AccountProfile] Password verification cancelled')
    if (onClose) {
      onClose()
    } else {
      router.push('/dashboard')
    }
  }

  useEffect(() => {
    if (currentUser) {
      setFormData({
        name: currentUser?.name || '',
        email: currentUser?.email || '',
        phone: currentUser?.phone || '',
        address: currentUser?.address || '',
        resident_registration_number: currentUser?.resident_registration_number || ''
      })

      // Try to decrypt resident number if it exists
      if (currentUser?.resident_registration_number) {
        loadDecryptedResidentNumber(currentUser.resident_registration_number)
      }
    }
  }, [currentUser])

  const loadDecryptedResidentNumber = async (encrypted: string) => {
    if (!encrypted) return

    try {
      setLoadingDecryption(true)
      const decrypted = await decryptResidentNumber(encrypted)
      if (decrypted) {
        setDecryptedResidentNumber(decrypted)
      }
    } catch (error) {
      console.error('Failed to decrypt resident number:', error)
      // Assume it's not encrypted if decryption fails
      setDecryptedResidentNumber(encrypted)
    } finally {
      setLoadingDecryption(false)
    }
  }

  // 타입 안전성을 위한 처리
  if (!currentUser) {
    return null
  }

  // Show password modal if not verified
  if (!isVerified) {
    return (
      <>
        <div className="bg-white rounded-xl shadow-sm border border-at-border p-12 text-center">
          <Lock className="w-16 h-16 text-at-accent mx-auto mb-4" />
          <h2 className="text-xl font-bold text-at-text mb-2">본인 확인이 필요합니다</h2>
          <p className="text-at-text-secondary">
            계정 정보는 민감한 개인정보입니다.
            <br />
            비밀번호를 입력하여 본인 확인을 진행해주세요.
          </p>
        </div>
        <PasswordVerificationModal
          isOpen={showPasswordModal}
          onVerified={handlePasswordVerified}
          onCancel={handlePasswordCancel}
          purpose="profile"
        />
      </>
    )
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: value
    }))
  }

  const handleResidentNumberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatResidentNumber(e.target.value)
    setFormData(prev => ({
      ...prev,
      resident_registration_number: formatted
    }))
    // Also update the decrypted state so they stay in sync
    setDecryptedResidentNumber(formatted)
  }

  // Check if personal info is missing
  const personalInfoStatus = checkPersonalInfoCompletion({
    name: formData.name,
    phone: formData.phone,
    address: formData.address,
    resident_registration_number: formData.resident_registration_number
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    // Validate resident registration number if provided
    if (formData.resident_registration_number) {
      const validation = validateResidentNumberWithMessage(decryptedResidentNumber)
      if (!validation.isValid) {
        setError(validation.error || '주민등록번호 형식이 올바르지 않습니다.')
        return
      }
    }

    setSaving(true)

    try {
      // Encrypt resident registration number before saving
      let encryptedResidentNumber = decryptedResidentNumber

      if (decryptedResidentNumber && decryptedResidentNumber.trim() !== '') {
        try {
          const encrypted = await encryptResidentNumber(decryptedResidentNumber)
          if (encrypted) {
            encryptedResidentNumber = encrypted
          } else {
            encryptedResidentNumber = decryptedResidentNumber
          }
        } catch (encryptError) {
          console.error('Encryption failed:', encryptError)
          setError('주민등록번호 암호화 중 오류가 발생했습니다.')
          setSaving(false)
          return
        }
      } else {
        encryptedResidentNumber = ''
      }

      const result = await dataService.updateUserProfile(currentUser.id, {
        name: formData.name,
        phone: formData.phone,
        address: formData.address,
        resident_registration_number: encryptedResidentNumber
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

      // Update decrypted resident number
      if (formData.resident_registration_number) {
        setDecryptedResidentNumber(formData.resident_registration_number)
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
      active: 'bg-at-success-bg text-green-800',
      pending: 'bg-yellow-100 text-yellow-800',
      suspended: 'bg-at-error-bg text-red-800'
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
    <div className="bg-white rounded-xl shadow-sm border border-at-border overflow-hidden">
      {/* 블루 그라데이션 헤더 */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
              <User className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">계정 정보</h2>
              <p className="text-blue-100 text-sm">Account Profile</p>
            </div>
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/20 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-white" />
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mx-6 mt-4 bg-at-error-bg border border-red-200 text-at-error px-4 py-3 rounded-lg text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="mx-6 mt-4 bg-at-success-bg border border-green-200 text-at-success px-4 py-3 rounded-lg text-sm">
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
                <label className="block text-sm font-medium text-at-text-secondary mb-1">
                  이름
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-at-text-weak" />
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    className="w-full pl-10 pr-3 py-2 border border-at-border rounded-lg focus:ring-at-accent focus:border-at-accent"
                    required
                    disabled={saving}
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-at-text-secondary mb-1">
                  이메일
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-at-text-weak" />
                  <input
                    type="email"
                    name="email"
                    value={formData.email}
                    className="w-full pl-10 pr-3 py-2 border border-at-border rounded-lg bg-at-surface-alt cursor-not-allowed"
                    disabled
                  />
                </div>
                <p className="mt-1 text-xs text-at-text-weak">이메일은 변경할 수 없습니다</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-at-text-secondary mb-1">
                  전화번호
                  {!formData.phone && <span className="text-red-500 ml-1">*</span>}
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-at-text-weak" />
                  <input
                    type="tel"
                    name="phone"
                    value={formData.phone}
                    onChange={handleInputChange}
                    className="w-full pl-10 pr-3 py-2 border border-at-border rounded-lg focus:ring-at-accent focus:border-at-accent"
                    placeholder="010-1234-5678"
                    disabled={saving}
                  />
                </div>
                {!formData.phone && (
                  <p className="mt-1 text-xs text-at-warning">
                    근로계약서 작성을 위해 필수 입력입니다.
                  </p>
                )}
              </div>

              {/* Personal Information Section */}
              <div className="pt-4 border-t border-at-border">
                <div className="flex items-start mb-4">
                  <Lock className="w-5 h-5 text-at-accent mr-2 mt-0.5" />
                  <div className="flex-1">
                    <h3 className="text-base font-semibold text-at-text mb-1">
                      개인정보 (근로계약서용)
                    </h3>
                    <p className="text-xs text-at-text-secondary">
                      주민등록번호는 AES-256 암호화되어 안전하게 저장됩니다.
                      본인과 원장님만 조회할 수 있습니다.
                    </p>
                  </div>
                </div>

                {/* Show warning if personal info is incomplete */}
                {!personalInfoStatus.isComplete && (
                  <div className="mb-4 bg-at-warning-bg border-l-4 border-amber-400 p-3 rounded-r-lg">
                    <div className="flex">
                      <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0" />
                      <div className="ml-3">
                        <p className="text-sm text-amber-700">
                          <span className="font-medium">근로계약서 작성을 위해</span> 다음 정보를 입력해주세요:
                          <span className="ml-1 font-semibold">
                            {personalInfoStatus.missingFieldLabels.join(', ')}
                          </span>
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="space-y-4">
                  {/* Address */}
                  <div>
                    <label className="block text-sm font-medium text-at-text-secondary mb-1">
                      주소
                      {!formData.address && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    <div className="relative">
                      <Home className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-at-text-weak" />
                      <input
                        type="text"
                        name="address"
                        value={formData.address}
                        onChange={handleInputChange}
                        className="w-full pl-10 pr-3 py-2 border border-at-border rounded-lg focus:ring-at-accent focus:border-at-accent"
                        placeholder="서울시 강남구 테헤란로 123"
                        disabled={saving}
                      />
                    </div>
                    {!formData.address && (
                      <p className="mt-1 text-xs text-at-warning">
                        근로계약서에 표시되는 주소입니다.
                      </p>
                    )}
                  </div>

                  {/* Resident Registration Number */}
                  <div>
                    <label className="block text-sm font-medium text-at-text-secondary mb-1">
                      주민등록번호
                      {!formData.resident_registration_number && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    <div className="relative">
                      <CreditCard className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-at-text-weak" />
                      <input
                        type="text"
                        name="resident_registration_number"
                        value={loadingDecryption ? '복호화 중...' : (decryptedResidentNumber || formData.resident_registration_number)}
                        onChange={handleResidentNumberChange}
                        className="w-full pl-10 pr-3 py-2 border border-at-border rounded-lg focus:ring-at-accent focus:border-at-accent font-mono"
                        placeholder="000000-0000000"
                        maxLength={14}
                        disabled={saving || loadingDecryption}
                      />
                    </div>
                    <div className="mt-1 flex items-start space-x-1">
                      <Lock className="w-3 h-3 text-at-success flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-at-text-weak">
                        AES-256 암호화되어 저장됩니다. 본인과 원장만 조회 가능합니다.
                      </p>
                    </div>
                    {!formData.resident_registration_number && (
                      <p className="mt-1 text-xs text-at-warning">
                        근로계약서 작성을 위해 필수 입력입니다.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex justify-between">
                <button
                  type="button"
                  onClick={() => { setShowPasswordDialog(true); setPwError(''); setPwSuccess(''); setPwCurrentPassword(''); setPwNewPassword(''); setPwConfirmPassword(''); }}
                  className="text-at-accent hover:text-at-accent text-sm font-medium"
                >
                  비밀번호 변경
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="bg-at-accent hover:bg-at-accent-hover disabled:bg-blue-300 text-white font-medium py-2 px-4 rounded-lg transition-colors"
                >
                  {saving ? '저장 중...' : '프로필 저장'}
                </button>
              </div>
            </form>

            {/* Password Change Dialog */}
            {showPasswordDialog && (
              <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60]" onClick={() => setShowPasswordDialog(false)}>
                <div className="bg-white rounded-xl shadow-xl p-6 w-full max-w-sm mx-4" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-semibold text-at-text">비밀번호 변경</h3>
                    <button onClick={() => setShowPasswordDialog(false)} className="text-at-text-weak hover:text-at-text-secondary">
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  <form onSubmit={async (e) => {
                    e.preventDefault()
                    setPwError('')
                    setPwSuccess('')

                    if (pwNewPassword.length < 6) { setPwError('비밀번호는 6자 이상이어야 합니다.'); return }
                    if (pwNewPassword !== pwConfirmPassword) { setPwError('새 비밀번호가 일치하지 않습니다.'); return }
                    if (!currentUser.email) { setPwError('계정에 등록된 이메일이 없습니다.'); return }

                    setPwSaving(true)
                    try {
                      const verifyResult = await dataService.verifyPassword(currentUser.email, pwCurrentPassword)
                      if (verifyResult.error || !verifyResult.success) { setPwError('현재 비밀번호가 올바르지 않습니다.'); setPwSaving(false); return }

                      const updateResult = await dataService.updatePassword(pwNewPassword)
                      if (updateResult.error) { throw new Error(updateResult.error) }

                      setPwSuccess('비밀번호가 성공적으로 변경되었습니다.')
                      setTimeout(() => setShowPasswordDialog(false), 1500)
                    } catch (err) {
                      setPwError(err instanceof Error ? err.message : '비밀번호 변경 중 오류가 발생했습니다.')
                    } finally {
                      setPwSaving(false)
                    }
                  }} className="space-y-3">
                    <div>
                      <label className="block text-sm font-medium text-at-text-secondary mb-1">현재 비밀번호</label>
                      <input type="password" value={pwCurrentPassword} onChange={(e) => setPwCurrentPassword(e.target.value)}
                        className="w-full p-2.5 border border-at-border rounded-lg focus:ring-at-accent focus:border-at-accent text-sm"
                        required disabled={pwSaving || !!pwSuccess} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-at-text-secondary mb-1">새 비밀번호</label>
                      <input type="password" value={pwNewPassword} onChange={(e) => setPwNewPassword(e.target.value)}
                        className="w-full p-2.5 border border-at-border rounded-lg focus:ring-at-accent focus:border-at-accent text-sm"
                        placeholder="6자 이상" required disabled={pwSaving || !!pwSuccess} />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-at-text-secondary mb-1">새 비밀번호 확인</label>
                      <input type="password" value={pwConfirmPassword} onChange={(e) => setPwConfirmPassword(e.target.value)}
                        className="w-full p-2.5 border border-at-border rounded-lg focus:ring-at-accent focus:border-at-accent text-sm"
                        required disabled={pwSaving || !!pwSuccess} />
                    </div>

                    {pwError && <p className="text-sm text-at-error bg-at-error-bg p-2 rounded">{pwError}</p>}
                    {pwSuccess && <p className="text-sm text-at-success bg-at-success-bg p-2 rounded">{pwSuccess}</p>}

                    <div className="flex gap-2 pt-1">
                      <button type="button" onClick={() => setShowPasswordDialog(false)}
                        className="flex-1 px-4 py-2 text-sm text-at-text-secondary border border-at-border rounded-lg hover:bg-at-surface-alt">
                        취소
                      </button>
                      <button type="submit" disabled={pwSaving || !!pwSuccess}
                        className="flex-1 px-4 py-2 text-sm text-white bg-at-accent rounded-lg hover:bg-at-accent-hover disabled:bg-blue-300">
                        {pwSaving ? '변경 중...' : '변경'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>

          {/* Right Column - Account Details */}
          <div className="space-y-4">
            {/* Account Status */}
            <div className="bg-at-surface-alt p-4 rounded-lg border border-at-border">
              <div className="flex items-center mb-3">
                <Shield className="w-5 h-5 text-at-text-secondary mr-2" />
                <h4 className="font-semibold text-at-text">계정 상태</h4>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-at-text-secondary">상태:</span>
                  {user?.status ? getStatusBadge(user.status) : <span>-</span>}
                </div>
                <div className="flex justify-between">
                  <span className="text-at-text-secondary">역할:</span>
                  <span className="font-medium">{user?.role ? getRoleLabel(user.role) : '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-at-text-secondary">ID:</span>
                  <span className="font-mono text-xs">{user?.id ? user.id.slice(0, 8) + '...' : '-'}</span>
                </div>
              </div>
            </div>

            {/* Clinic Info */}
            <div className="bg-at-surface-alt p-4 rounded-lg border border-at-border">
              <div className="flex items-center mb-3">
                <Building2 className="w-5 h-5 text-at-text-secondary mr-2" />
                <h4 className="font-semibold text-at-text">소속 병원</h4>
              </div>
              <div className="space-y-2 text-sm">
                <div>
                  <p className="font-medium text-at-text">
                    {user?.clinic?.name || '정보 없음'}
                  </p>
                  {user?.clinic?.owner_name && (
                    <p className="text-at-text-secondary text-xs mt-1">
                      원장: {user.clinic.owner_name}
                    </p>
                  )}
                  {user?.clinic?.address && (
                    <p className="text-at-text-secondary text-xs mt-1">
                      {user.clinic.address}
                    </p>
                  )}
                </div>
                <div className="text-xs text-at-text-weak">
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
            <div className="bg-at-surface-alt p-4 rounded-lg border border-at-border">
              <div className="flex items-center mb-3">
                <Calendar className="w-5 h-5 text-at-text-secondary mr-2" />
                <h4 className="font-semibold text-at-text">활동 정보</h4>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-at-text-secondary">가입일:</span>
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
                    <span className="text-at-text-secondary">최근 로그인:</span>
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
                    <span className="text-at-text-secondary">승인일:</span>
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
