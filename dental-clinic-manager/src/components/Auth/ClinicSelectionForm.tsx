'use client'

import { useState, useEffect } from 'react'
import { MagnifyingGlassIcon, BuildingOfficeIcon, PlusCircleIcon, LockClosedIcon, HomeIcon, IdentificationIcon } from '@heroicons/react/24/outline'
import { getSupabase } from '@/lib/supabase'
import { formatPartialResidentNumber, validatePartialResidentNumberWithMessage, autoFormatPartialResidentNumber } from '@/utils/residentNumberUtils'
import { encryptResidentNumber } from '@/utils/encryptionUtils'
import { autoFormatPhoneNumber } from '@/utils/phoneUtils'

interface ClinicSelectionFormProps {
  onBack: () => void
  onSelectClinic: (clinicId: string | null) => void
  onCreateNewClinic: () => void
}

interface PublicClinic {
  id: string
  name: string
  description: string
  logo_url: string
  address: string
  phone: string
  current_users: number
  max_users: number
}

export default function ClinicSelectionForm({
  onBack,
  onSelectClinic,
  onCreateNewClinic
}: ClinicSelectionFormProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [clinics, setClinics] = useState<PublicClinic[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedClinicId, setSelectedClinicId] = useState<string | null>(null)
  const [joinRequestData, setJoinRequestData] = useState({
    name: '',
    email: '',
    phone: '',
    address: '',
    resident_registration_number: '',
    role: 'staff' as 'vice_director' | 'manager' | 'team_leader' | 'staff',
    message: ''
  })
  const [showJoinForm, setShowJoinForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showSearchResults, setShowSearchResults] = useState(false)

  useEffect(() => {
    fetchPublicClinics()
  }, [])

  const fetchPublicClinics = async () => {
    setLoading(true)
    const supabase = getSupabase()
    if (!supabase) {
      setError('데이터베이스 연결에 실패했습니다.')
      setLoading(false)
      return
    }

    try {
      const { data, error } = await (supabase as any)
        .rpc('get_public_clinics')

      if (error) {
        console.error('Error fetching clinics:', error)
        setError('병원 목록을 불러오는데 실패했습니다.')
      } else {
        setClinics(data || [])
      }
    } catch (err) {
      console.error('Error:', err)
      setError('병원 목록을 불러오는데 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const filteredClinics = clinics.filter(clinic =>
    clinic.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    clinic.address.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const handleSelectClinic = (clinicId: string) => {
    setSelectedClinicId(clinicId)
    setShowJoinForm(true)
  }

  const handleJoinRequest = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedClinicId) return

    setError('')
    setSuccess('')

    // Validate required fields
    if (!joinRequestData.name || !joinRequestData.email || !joinRequestData.phone) {
      setError('이름, 이메일, 전화번호는 필수 입력입니다.')
      return
    }

    if (!joinRequestData.address) {
      setError('주소는 필수 입력입니다.')
      return
    }

    if (!joinRequestData.resident_registration_number) {
      setError('주민등록번호 앞 7자리를 입력해주세요.')
      return
    }

    // Validate partial resident registration number (앞 7자리)
    const validation = validatePartialResidentNumberWithMessage(joinRequestData.resident_registration_number)
    if (!validation.isValid) {
      setError(validation.error || '주민등록번호 앞 7자리 형식이 올바르지 않습니다.')
      return
    }

    setSubmitting(true)

    const supabase = getSupabase()
    if (!supabase) {
      setError('데이터베이스 연결에 실패했습니다.')
      setSubmitting(false)
      return
    }

    try {
      // Encrypt resident registration number before sending
      const encryptedResidentNumber = await encryptResidentNumber(joinRequestData.resident_registration_number)

      if (!encryptedResidentNumber) {
        setError('주민등록번호 암호화 중 오류가 발생했습니다.')
        setSubmitting(false)
        return
      }

      const { data, error } = await (supabase as any)
        .rpc('request_to_join_clinic', {
          p_clinic_id: selectedClinicId,
          p_email: joinRequestData.email,
          p_name: joinRequestData.name,
          p_phone: joinRequestData.phone,
          p_address: joinRequestData.address,
          p_resident_registration_number: encryptedResidentNumber,
          p_requested_role: joinRequestData.role,
          p_message: joinRequestData.message || null
        })

      if (error || !data.success) {
        setError(data?.error || '가입 신청 중 오류가 발생했습니다.')
      } else {
        setSuccess('가입 신청이 성공적으로 접수되었습니다. 병원 관리자의 승인을 기다려주세요.')
        setTimeout(() => {
          onSelectClinic(selectedClinicId)
        }, 3000)
      }
    } catch (err) {
      console.error('Error:', err)
      setError('가입 신청 중 오류가 발생했습니다.')
    } finally {
      setSubmitting(false)
    }
  }

  const roleOptions = [
    { value: 'staff', label: '진료실 팀원' },
    { value: 'team_leader', label: '진료팀장' },
    { value: 'manager', label: '실장' },
    { value: 'vice_director', label: '부원장' }
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <button
            onClick={onBack}
            className="inline-flex items-center text-at-accent hover:text-at-accent font-medium mb-4"
          >
            ← 돌아가기
          </button>
          <h2 className="text-3xl font-bold text-at-text mb-2">병원 선택</h2>
          <p className="text-at-text-secondary">
            기존 병원에 가입하거나 새로운 병원을 등록하세요
          </p>
        </div>

        {!showJoinForm ? (
          <>
            {/* Create New Clinic Option */}
            <div className="bg-white p-6 rounded-2xl shadow-at-card border border-at-border mb-6">
              <button
                onClick={onCreateNewClinic}
                className="w-full flex items-center justify-between p-4 hover:bg-at-accent-light rounded-xl transition-colors"
              >
                <div className="flex items-center">
                  <PlusCircleIcon className="h-8 w-8 text-at-accent mr-4" />
                  <div className="text-left">
                    <h3 className="text-lg font-semibold text-at-text">새 병원 등록</h3>
                    <p className="text-sm text-at-text-secondary">
                      원장님이신가요? 새로운 병원을 등록하세요
                    </p>
                  </div>
                </div>
                <span className="text-at-accent">→</span>
              </button>
            </div>

            {/* Enhanced Search Bar with Autocomplete */}
            <div className="bg-white p-4 rounded-2xl shadow-at-card border border-at-border mb-6">
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-3 top-3 h-5 w-5 text-at-text-weak z-10" />
                <input
                  type="text"
                  placeholder="병원 이름 또는 주소로 검색..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    setShowSearchResults(e.target.value.length > 0)
                  }}
                  onFocus={() => setShowSearchResults(searchQuery.length > 0)}
                  onBlur={() => setTimeout(() => setShowSearchResults(false), 200)}
                  className="w-full pl-10 pr-4 py-3 border border-at-border rounded-xl focus:ring-at-accent focus:border-at-accent text-base"
                />

                {/* Autocomplete Dropdown */}
                {showSearchResults && filteredClinics.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-at-border rounded-xl shadow-lg max-h-60 overflow-y-auto z-50">
                    {filteredClinics.slice(0, 5).map((clinic) => (
                      <button
                        key={clinic.id}
                        onClick={() => handleSelectClinic(clinic.id)}
                        className="w-full p-3 hover:bg-at-accent-light text-left transition-colors border-b border-at-border last:border-b-0"
                      >
                        <div className="flex justify-between items-start">
                          <div className="flex-1">
                            <p className="font-medium text-at-text">{clinic.name}</p>
                            <p className="text-sm text-at-text-weak mt-1">{clinic.address}</p>
                            {clinic.phone && (
                              <p className="text-xs text-at-text-weak mt-1">{clinic.phone}</p>
                            )}
                          </div>
                          <span className="ml-2 inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-at-tag text-at-accent">
                            {clinic.current_users}/{clinic.max_users}
                          </span>
                        </div>
                      </button>
                    ))}
                    {filteredClinics.length > 5 && (
                      <div className="p-2 text-center text-sm text-at-text-weak bg-at-surface-alt">
                        {filteredClinics.length - 5}개 더 있습니다
                      </div>
                    )}
                  </div>
                )}

                {showSearchResults && searchQuery && filteredClinics.length === 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-at-border rounded-xl shadow-lg p-4 z-50">
                    <p className="text-sm text-at-text-weak text-center">검색 결과가 없습니다</p>
                  </div>
                )}
              </div>
            </div>

            {/* Clinic List */}
            <div className="bg-white rounded-2xl shadow-at-card border border-at-border">
              <div className="p-4 border-b border-at-border">
                <h3 className="text-lg font-semibold text-at-text">
                  {searchQuery ? `"${searchQuery}" 검색 결과` : '모든 병원'}
                  <span className="ml-2 text-sm font-normal text-at-text-weak">
                    ({filteredClinics.length}개)
                  </span>
                </h3>
              </div>

              {loading ? (
                <div className="p-8 text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-at-accent mx-auto mb-4"></div>
                  <p className="text-at-text-secondary">병원 목록을 불러오는 중...</p>
                </div>
              ) : filteredClinics.length === 0 ? (
                <div className="p-8 text-center">
                  <BuildingOfficeIcon className="h-12 w-12 text-at-text-weak mx-auto mb-4" />
                  <p className="text-at-text-secondary">
                    {searchQuery ? '검색 결과가 없습니다.' : '등록 가능한 병원이 없습니다.'}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-at-border max-h-96 overflow-y-auto">
                  {filteredClinics.map((clinic) => (
                    <button
                      key={clinic.id}
                      onClick={() => handleSelectClinic(clinic.id)}
                      className="w-full p-4 hover:bg-at-surface-alt transition-colors text-left group"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="text-lg font-semibold text-at-text mb-1 group-hover:text-at-accent transition-colors">
                            {clinic.name}
                          </h4>
                          {clinic.description && (
                            <p className="text-sm text-at-text-secondary mb-2">{clinic.description}</p>
                          )}
                          <div className="space-y-1">
                            <p className="text-sm text-at-text-secondary">
                              <span className="inline-block w-12 text-at-text-weak">주소:</span>
                              <span className="font-medium">{clinic.address}</span>
                            </p>
                            {clinic.phone && (
                              <p className="text-sm text-at-text-secondary">
                                <span className="inline-block w-12 text-at-text-weak">전화:</span>
                                <span className="font-medium">{clinic.phone}</span>
                              </p>
                            )}
                          </div>
                          <div className="mt-3 flex items-center gap-2">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-at-tag text-at-accent">
                              {clinic.current_users}/{clinic.max_users} 직원
                            </span>
                            {clinic.current_users >= clinic.max_users && (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-at-error-bg text-red-800">
                                정원 마감
                              </span>
                            )}
                          </div>
                        </div>
                        <span className="text-at-accent ml-4 group-hover:translate-x-1 transition-transform">→</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          /* Join Request Form */
          <div className="bg-white p-8 rounded-2xl shadow-at-card border border-at-border">
            <h3 className="text-xl font-semibold text-at-text mb-6">가입 신청서</h3>

            {selectedClinicId && (
              <div className="mb-6 p-4 bg-at-accent-light rounded-xl">
                <p className="text-sm text-at-accent">
                  <strong>선택한 병원:</strong> {clinics.find(c => c.id === selectedClinicId)?.name}
                </p>
              </div>
            )}

            <form onSubmit={handleJoinRequest} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-at-text-secondary mb-1">
                  이름 *
                </label>
                <input
                  type="text"
                  value={joinRequestData.name}
                  onChange={(e) => setJoinRequestData({ ...joinRequestData, name: e.target.value })}
                  className="w-full p-3 border border-at-border rounded-xl focus:ring-at-accent focus:border-at-accent"
                  required
                  disabled={submitting}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-at-text-secondary mb-1">
                  이메일 *
                </label>
                <input
                  type="email"
                  value={joinRequestData.email}
                  onChange={(e) => setJoinRequestData({ ...joinRequestData, email: e.target.value })}
                  className="w-full p-3 border border-at-border rounded-xl focus:ring-at-accent focus:border-at-accent"
                  required
                  disabled={submitting}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-at-text-secondary mb-1">
                  전화번호 *
                </label>
                <input
                  type="tel"
                  value={joinRequestData.phone}
                  onChange={(e) => {
                    const formatted = autoFormatPhoneNumber(e.target.value);
                    setJoinRequestData({ ...joinRequestData, phone: formatted.value });
                  }}
                  className="w-full p-3 border border-at-border rounded-xl focus:ring-at-accent focus:border-at-accent"
                  placeholder="010-1234-5678"
                  maxLength={13}
                  required
                  disabled={submitting}
                />
              </div>

              {/* Personal Information Section */}
              <div className="pt-4 border-t border-at-border">
                <div className="flex items-start mb-3">
                  <LockClosedIcon className="h-5 w-5 text-at-accent mr-2 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="text-sm font-semibold text-at-text mb-1">
                      개인정보 (근로계약서용)
                    </h4>
                    <p className="text-xs text-at-text-secondary">
                      주민등록번호 앞 7자리(생년월일+성별)만 수집합니다. 전체 주민번호는 근로계약서 작성 시 별도 입력합니다.
                    </p>
                  </div>
                </div>

                <div className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-at-text-secondary mb-1">
                      주소 *
                    </label>
                    <div className="relative">
                      <HomeIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-at-text-weak" />
                      <input
                        type="text"
                        value={joinRequestData.address}
                        onChange={(e) => setJoinRequestData({ ...joinRequestData, address: e.target.value })}
                        className="w-full pl-10 pr-3 py-3 border border-at-border rounded-xl focus:ring-at-accent focus:border-at-accent"
                        placeholder="서울시 강남구 테헤란로 123"
                        required
                        disabled={submitting}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-at-text-secondary mb-1">
                      주민등록번호 앞 7자리 *
                    </label>
                    <div className="relative">
                      <IdentificationIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-at-text-weak" />
                      <input
                        type="text"
                        value={joinRequestData.resident_registration_number}
                        onChange={(e) => {
                          const formatted = autoFormatPartialResidentNumber(e.target.value)
                          setJoinRequestData({ ...joinRequestData, resident_registration_number: formatted.value })
                        }}
                        className="w-full pl-10 pr-3 py-3 border border-at-border rounded-xl focus:ring-at-accent focus:border-at-accent font-mono"
                        placeholder="900101-1"
                        maxLength={8}
                        required
                        disabled={submitting}
                      />
                    </div>
                    <p className="mt-1 text-xs text-at-text-weak flex items-center">
                      <LockClosedIcon className="h-3 w-3 text-at-success mr-1" />
                      전체 주민등록번호는 근로계약서 작성 시 별도로 입력합니다.
                    </p>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-at-text-secondary mb-1">
                  희망 직급 *
                </label>
                <select
                  value={joinRequestData.role}
                  onChange={(e) => setJoinRequestData({
                    ...joinRequestData,
                    role: e.target.value as 'vice_director' | 'manager' | 'team_leader' | 'staff'
                  })}
                  className="w-full p-3 border border-at-border rounded-xl focus:ring-at-accent focus:border-at-accent"
                  required
                  disabled={submitting}
                >
                  {roleOptions.map(option => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-at-text-secondary mb-1">
                  메시지 (선택)
                </label>
                <textarea
                  value={joinRequestData.message}
                  onChange={(e) => setJoinRequestData({ ...joinRequestData, message: e.target.value })}
                  className="w-full p-3 border border-at-border rounded-xl focus:ring-at-accent focus:border-at-accent"
                  rows={3}
                  placeholder="병원 관리자에게 전달할 메시지를 입력하세요..."
                  disabled={submitting}
                />
              </div>

              {error && (
                <div className="bg-at-error-bg border border-red-200 text-at-error px-4 py-3 rounded-xl text-sm">
                  {error}
                </div>
              )}

              {success && (
                <div className="bg-at-success-bg border border-green-200 text-at-success px-4 py-3 rounded-xl text-sm">
                  {success}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowJoinForm(false)
                    setSelectedClinicId(null)
                    setError('')
                    setSuccess('')
                  }}
                  className="flex-1 bg-at-border hover:bg-at-border text-at-text font-bold py-3 px-4 rounded-xl transition-colors"
                  disabled={submitting}
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 bg-at-accent hover:bg-at-accent-hover disabled:bg-blue-300 text-white font-bold py-3 px-4 rounded-xl transition-colors"
                >
                  {submitting ? '신청 중...' : '가입 신청'}
                </button>
              </div>
            </form>
          </div>
        )}

        {error && !showJoinForm && (
          <div className="mt-4 bg-at-error-bg border border-red-200 text-at-error px-4 py-3 rounded-xl text-sm">
            {error}
          </div>
        )}
      </div>
    </div>
  )
}