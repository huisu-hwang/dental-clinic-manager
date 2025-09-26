'use client'

import { useState, useEffect } from 'react'
import { MagnifyingGlassIcon, BuildingOfficeIcon, PlusCircleIcon } from '@heroicons/react/24/outline'
import { getSupabase } from '@/lib/supabase'

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
    role: 'staff' as 'vice_director' | 'manager' | 'team_leader' | 'staff',
    message: ''
  })
  const [showJoinForm, setShowJoinForm] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

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
    setSubmitting(true)

    const supabase = getSupabase()
    if (!supabase) {
      setError('데이터베이스 연결에 실패했습니다.')
      setSubmitting(false)
      return
    }

    try {
      const { data, error } = await (supabase as any)
        .rpc('request_to_join_clinic', {
          p_clinic_id: selectedClinicId,
          p_email: joinRequestData.email,
          p_name: joinRequestData.name,
          p_phone: joinRequestData.phone,
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
            className="inline-flex items-center text-blue-600 hover:text-blue-700 font-medium mb-4"
          >
            ← 돌아가기
          </button>
          <h2 className="text-3xl font-bold text-slate-800 mb-2">병원 선택</h2>
          <p className="text-slate-600">
            기존 병원에 가입하거나 새로운 병원을 등록하세요
          </p>
        </div>

        {!showJoinForm ? (
          <>
            {/* Create New Clinic Option */}
            <div className="bg-white p-6 rounded-lg shadow-md border border-slate-200 mb-6">
              <button
                onClick={onCreateNewClinic}
                className="w-full flex items-center justify-between p-4 hover:bg-blue-50 rounded-lg transition-colors"
              >
                <div className="flex items-center">
                  <PlusCircleIcon className="h-8 w-8 text-blue-600 mr-4" />
                  <div className="text-left">
                    <h3 className="text-lg font-semibold text-slate-800">새 병원 등록</h3>
                    <p className="text-sm text-slate-600">
                      원장님이신가요? 새로운 병원을 등록하세요
                    </p>
                  </div>
                </div>
                <span className="text-blue-600">→</span>
              </button>
            </div>

            {/* Search Bar */}
            <div className="bg-white p-4 rounded-lg shadow-md border border-slate-200 mb-6">
              <div className="relative">
                <MagnifyingGlassIcon className="absolute left-3 top-1/2 transform -translate-y-1/2 h-5 w-5 text-slate-400" />
                <input
                  type="text"
                  placeholder="병원 이름 또는 주소로 검색..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            {/* Clinic List */}
            <div className="bg-white rounded-lg shadow-md border border-slate-200">
              <div className="p-4 border-b border-slate-200">
                <h3 className="text-lg font-semibold text-slate-800">등록 가능한 병원</h3>
              </div>

              {loading ? (
                <div className="p-8 text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
                  <p className="text-slate-600">병원 목록을 불러오는 중...</p>
                </div>
              ) : filteredClinics.length === 0 ? (
                <div className="p-8 text-center">
                  <BuildingOfficeIcon className="h-12 w-12 text-slate-400 mx-auto mb-4" />
                  <p className="text-slate-600">
                    {searchQuery ? '검색 결과가 없습니다.' : '등록 가능한 병원이 없습니다.'}
                  </p>
                </div>
              ) : (
                <div className="divide-y divide-slate-200">
                  {filteredClinics.map((clinic) => (
                    <button
                      key={clinic.id}
                      onClick={() => handleSelectClinic(clinic.id)}
                      className="w-full p-4 hover:bg-slate-50 transition-colors text-left"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h4 className="text-lg font-semibold text-slate-800 mb-1">
                            {clinic.name}
                          </h4>
                          {clinic.description && (
                            <p className="text-sm text-slate-600 mb-2">{clinic.description}</p>
                          )}
                          <p className="text-sm text-slate-500">{clinic.address}</p>
                          <p className="text-sm text-slate-500">{clinic.phone}</p>
                          <div className="mt-2">
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                              {clinic.current_users}/{clinic.max_users} 직원
                            </span>
                          </div>
                        </div>
                        <span className="text-blue-600 ml-4">→</span>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          /* Join Request Form */
          <div className="bg-white p-8 rounded-lg shadow-md border border-slate-200">
            <h3 className="text-xl font-semibold text-slate-800 mb-6">가입 신청서</h3>

            {selectedClinicId && (
              <div className="mb-6 p-4 bg-blue-50 rounded-lg">
                <p className="text-sm text-blue-800">
                  <strong>선택한 병원:</strong> {clinics.find(c => c.id === selectedClinicId)?.name}
                </p>
              </div>
            )}

            <form onSubmit={handleJoinRequest} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  이름 *
                </label>
                <input
                  type="text"
                  value={joinRequestData.name}
                  onChange={(e) => setJoinRequestData({ ...joinRequestData, name: e.target.value })}
                  className="w-full p-3 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  required
                  disabled={submitting}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  이메일 *
                </label>
                <input
                  type="email"
                  value={joinRequestData.email}
                  onChange={(e) => setJoinRequestData({ ...joinRequestData, email: e.target.value })}
                  className="w-full p-3 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  required
                  disabled={submitting}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  전화번호
                </label>
                <input
                  type="tel"
                  value={joinRequestData.phone}
                  onChange={(e) => setJoinRequestData({ ...joinRequestData, phone: e.target.value })}
                  className="w-full p-3 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  placeholder="010-1234-5678"
                  disabled={submitting}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  희망 직급 *
                </label>
                <select
                  value={joinRequestData.role}
                  onChange={(e) => setJoinRequestData({
                    ...joinRequestData,
                    role: e.target.value as 'vice_director' | 'manager' | 'team_leader' | 'staff'
                  })}
                  className="w-full p-3 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
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
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  메시지 (선택)
                </label>
                <textarea
                  value={joinRequestData.message}
                  onChange={(e) => setJoinRequestData({ ...joinRequestData, message: e.target.value })}
                  className="w-full p-3 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  rows={3}
                  placeholder="병원 관리자에게 전달할 메시지를 입력하세요..."
                  disabled={submitting}
                />
              </div>

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

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowJoinForm(false)
                    setSelectedClinicId(null)
                    setError('')
                    setSuccess('')
                  }}
                  className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold py-3 px-4 rounded-md transition-colors"
                  disabled={submitting}
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold py-3 px-4 rounded-md transition-colors"
                >
                  {submitting ? '신청 중...' : '가입 신청'}
                </button>
              </div>
            </form>
          </div>
        )}

        {error && !showJoinForm && (
          <div className="mt-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md text-sm">
            {error}
          </div>
        )}
      </div>
    </div>
  )
}