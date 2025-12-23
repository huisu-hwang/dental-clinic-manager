'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { UserMinusIcon, BuildingOffice2Icon, ArrowRightCircleIcon, PlusCircleIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { useAuth } from '@/contexts/AuthContext'
import { getSupabase } from '@/lib/supabase'
import { dataService } from '@/lib/dataService'
import { autoFormatPhoneNumber } from '@/utils/phoneUtils'

type ViewMode = 'main' | 'create-clinic' | 'join-clinic'

export default function ResignedPage() {
  const router = useRouter()
  const { user, loading, logout, updateUser } = useAuth()
  const [viewMode, setViewMode] = useState<ViewMode>('main')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // 새 병원 생성 폼
  const [clinicForm, setClinicForm] = useState({
    clinicName: '',
    clinicAddress: '',
    clinicPhone: '',
  })

  // 기존 병원 가입
  const [publicClinics, setPublicClinics] = useState<any[]>([])
  const [selectedClinicId, setSelectedClinicId] = useState('')
  const [selectedClinicName, setSelectedClinicName] = useState('')
  const [clinicSearchQuery, setClinicSearchQuery] = useState('')
  const [showClinicSearchResults, setShowClinicSearchResults] = useState(false)
  const [isSearchingClinics, setIsSearchingClinics] = useState(false)
  const [selectedRole, setSelectedRole] = useState('staff')

  useEffect(() => {
    if (!loading) {
      // user가 없으면 홈으로 리다이렉트
      if (!user) {
        router.push('/')
        return
      }

      // active 상태면 대시보드로 이동
      if (user.status === 'active') {
        router.push('/dashboard')
        return
      }

      // pending 상태면 pending-approval로 이동
      if (user.status === 'pending') {
        router.push('/pending-approval')
        return
      }

      // rejected 상태면 pending-approval로 이동
      if (user.status === 'rejected') {
        router.push('/pending-approval')
        return
      }
    }
  }, [user, loading, router])

  // 병원 목록 가져오기 (join-clinic 모드일 때)
  useEffect(() => {
    if (viewMode === 'join-clinic') {
      const fetchClinics = async () => {
        setIsSearchingClinics(true)
        try {
          const { data, error } = await dataService.searchPublicClinics()
          if (error) {
            setError('공개된 병원 목록을 불러오는 데 실패했습니다.')
            setPublicClinics([])
          } else {
            setPublicClinics(data || [])
          }
        } finally {
          setIsSearchingClinics(false)
        }
      }
      fetchClinics()
    }
  }, [viewMode])

  const handleLogout = () => {
    logout()
  }

  // 새 병원 생성 (대표원장으로 등록)
  const handleCreateClinic = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!clinicForm.clinicName.trim()) {
      setError('병원명을 입력해주세요.')
      return
    }
    if (!clinicForm.clinicAddress.trim()) {
      setError('병원 주소를 입력해주세요.')
      return
    }
    if (!clinicForm.clinicPhone.trim()) {
      setError('병원 전화번호를 입력해주세요.')
      return
    }

    setIsSubmitting(true)

    const supabase = getSupabase()
    if (!supabase) {
      setError('데이터베이스 연결에 실패했습니다.')
      setIsSubmitting(false)
      return
    }

    try {
      // 1. 새 병원 생성
      const { data: newClinic, error: clinicError } = await (supabase as any)
        .from('clinics')
        .insert({
          name: clinicForm.clinicName,
          owner_name: user?.name || '',
          address: clinicForm.clinicAddress,
          phone: clinicForm.clinicPhone,
          email: user?.email || '',
          status: 'active',
        })
        .select()
        .single()

      if (clinicError) {
        console.error('Clinic creation error:', clinicError)
        throw new Error('병원 생성에 실패했습니다: ' + clinicError.message)
      }

      // 2. 사용자 정보 업데이트 (새 병원, owner 역할, active 상태)
      const { error: userError } = await (supabase as any)
        .from('users')
        .update({
          clinic_id: newClinic.id,
          role: 'owner',
          status: 'active',
          updated_at: new Date().toISOString(),
        })
        .eq('id', user?.id)

      if (userError) {
        console.error('User update error:', userError)
        throw new Error('사용자 정보 업데이트에 실패했습니다: ' + userError.message)
      }

      // 3. AuthContext 사용자 정보 갱신
      const updatedUser = {
        ...user,
        clinic_id: newClinic.id,
        role: 'owner',
        status: 'active',
        clinic: newClinic,
      }
      updateUser(updatedUser)

      setSuccess('병원이 성공적으로 등록되었습니다! 대시보드로 이동합니다.')

      // 2초 후 대시보드로 이동
      setTimeout(() => {
        router.push('/dashboard')
      }, 2000)

    } catch (err: any) {
      console.error('Create clinic error:', err)
      setError(err.message || '병원 등록 중 오류가 발생했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // 기존 병원에 가입 신청
  const handleJoinClinic = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!selectedClinicId) {
      setError('소속될 병원을 선택해주세요.')
      return
    }

    setIsSubmitting(true)

    const supabase = getSupabase()
    if (!supabase) {
      setError('데이터베이스 연결에 실패했습니다.')
      setIsSubmitting(false)
      return
    }

    try {
      // 사용자 정보 업데이트 (새 병원, 선택한 역할, pending 상태)
      const { error: userError } = await (supabase as any)
        .from('users')
        .update({
          clinic_id: selectedClinicId,
          role: selectedRole,
          status: 'pending',
          updated_at: new Date().toISOString(),
        })
        .eq('id', user?.id)

      if (userError) {
        console.error('User update error:', userError)
        throw new Error('가입 신청에 실패했습니다: ' + userError.message)
      }

      // AuthContext 사용자 정보 갱신
      const selectedClinic = publicClinics.find(c => c.id === selectedClinicId)
      const updatedUser = {
        ...user,
        clinic_id: selectedClinicId,
        role: selectedRole,
        status: 'pending',
        clinic: selectedClinic,
      }
      updateUser(updatedUser)

      setSuccess('가입 신청이 완료되었습니다! 병원 관리자의 승인을 기다려주세요.')

      // 2초 후 pending-approval 페이지로 이동
      setTimeout(() => {
        router.push('/pending-approval')
      }, 2000)

    } catch (err: any) {
      console.error('Join clinic error:', err)
      setError(err.message || '가입 신청 중 오류가 발생했습니다.')
    } finally {
      setIsSubmitting(false)
    }
  }

  // AuthContext의 loading 중이면 로딩 표시
  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  // user가 없으면 null 반환 (useEffect에서 리다이렉트 처리됨)
  if (!user) {
    return null
  }

  // 새 병원 생성 화면
  if (viewMode === 'create-clinic') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md mx-auto">
          <div className="text-center mb-8">
            <button
              onClick={() => setViewMode('main')}
              className="inline-flex items-center text-blue-600 hover:text-blue-700 font-medium mb-4"
            >
              ← 뒤로가기
            </button>
            <div className="flex items-center justify-center space-x-2 mb-4">
              <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold">🦷</span>
              </div>
              <h1 className="text-2xl font-bold text-slate-800">클리닉 매니저</h1>
            </div>
          </div>

          <div className="bg-white p-8 rounded-lg shadow-md border border-slate-200">
            <h2 className="text-2xl font-bold text-center text-slate-800 mb-2">
              새 병원 등록
            </h2>
            <p className="text-center text-slate-600 mb-6">
              대표원장으로 새 병원을 등록합니다.
            </p>

            <form onSubmit={handleCreateClinic} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  원장 이름
                </label>
                <input
                  type="text"
                  value={user.name || ''}
                  disabled
                  className="w-full p-3 border border-slate-300 rounded-md bg-slate-100 text-slate-600"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  병원명 *
                </label>
                <input
                  type="text"
                  value={clinicForm.clinicName}
                  onChange={(e) => setClinicForm(prev => ({ ...prev, clinicName: e.target.value }))}
                  className="w-full p-3 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  placeholder="○○치과"
                  disabled={isSubmitting}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  병원 주소 *
                </label>
                <input
                  type="text"
                  value={clinicForm.clinicAddress}
                  onChange={(e) => setClinicForm(prev => ({ ...prev, clinicAddress: e.target.value }))}
                  className="w-full p-3 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  placeholder="서울시 강남구 테헤란로 123"
                  disabled={isSubmitting}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  병원 전화번호 *
                </label>
                <input
                  type="tel"
                  value={clinicForm.clinicPhone}
                  onChange={(e) => {
                    const formatted = autoFormatPhoneNumber(e.target.value)
                    setClinicForm(prev => ({ ...prev, clinicPhone: formatted.value }))
                  }}
                  className="w-full p-3 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  placeholder="02-1234-5678"
                  maxLength={13}
                  disabled={isSubmitting}
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

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold py-3 px-4 rounded-md transition-colors"
              >
                {isSubmitting ? '등록 중...' : '병원 등록하기'}
              </button>
            </form>
          </div>
        </div>
      </div>
    )
  }

  // 기존 병원 가입 화면
  if (viewMode === 'join-clinic') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md mx-auto">
          <div className="text-center mb-8">
            <button
              onClick={() => setViewMode('main')}
              className="inline-flex items-center text-blue-600 hover:text-blue-700 font-medium mb-4"
            >
              ← 뒤로가기
            </button>
            <div className="flex items-center justify-center space-x-2 mb-4">
              <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold">🦷</span>
              </div>
              <h1 className="text-2xl font-bold text-slate-800">클리닉 매니저</h1>
            </div>
          </div>

          <div className="bg-white p-8 rounded-lg shadow-md border border-slate-200">
            <h2 className="text-2xl font-bold text-center text-slate-800 mb-2">
              다른 병원 가입
            </h2>
            <p className="text-center text-slate-600 mb-6">
              기존 병원에 직원으로 가입 신청합니다.
            </p>

            <form onSubmit={handleJoinClinic} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  이름
                </label>
                <input
                  type="text"
                  value={user.name || ''}
                  disabled
                  className="w-full p-3 border border-slate-300 rounded-md bg-slate-100 text-slate-600"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  직책 선택 *
                </label>
                <select
                  value={selectedRole}
                  onChange={(e) => setSelectedRole(e.target.value)}
                  className="w-full p-3 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500 bg-white"
                  disabled={isSubmitting}
                >
                  <option value="vice_director">부원장</option>
                  <option value="manager">실장</option>
                  <option value="team_leader">진료팀장</option>
                  <option value="staff">진료팀원</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  병원 검색 *
                </label>
                <div className="relative">
                  <MagnifyingGlassIcon className="absolute left-3 top-3 h-5 w-5 text-slate-400 z-10" />
                  <input
                    type="text"
                    placeholder="병원 이름 또는 주소로 검색..."
                    value={clinicSearchQuery}
                    onChange={(e) => {
                      setClinicSearchQuery(e.target.value)
                      setShowClinicSearchResults(e.target.value.length > 0)
                    }}
                    onFocus={() => setShowClinicSearchResults(clinicSearchQuery.length > 0)}
                    onBlur={() => setTimeout(() => setShowClinicSearchResults(false), 200)}
                    className="w-full pl-10 pr-4 py-3 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    disabled={isSubmitting || isSearchingClinics}
                  />

                  {/* 검색 결과 드롭다운 */}
                  {showClinicSearchResults && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-60 overflow-y-auto z-50">
                      {isSearchingClinics ? (
                        <div className="p-4 text-center text-sm text-slate-500">
                          병원 목록을 불러오는 중...
                        </div>
                      ) : (
                        <>
                          {publicClinics
                            .filter(clinic =>
                              clinic.name.toLowerCase().includes(clinicSearchQuery.toLowerCase()) ||
                              clinic.address.toLowerCase().includes(clinicSearchQuery.toLowerCase())
                            )
                            .slice(0, 5)
                            .map((clinic) => (
                              <button
                                key={clinic.id}
                                type="button"
                                onClick={() => {
                                  setSelectedClinicId(clinic.id)
                                  setSelectedClinicName(`${clinic.name} (${clinic.address})`)
                                  setClinicSearchQuery(`${clinic.name} - ${clinic.address}`)
                                  setShowClinicSearchResults(false)
                                }}
                                className="w-full p-3 hover:bg-blue-50 text-left transition-colors border-b border-slate-100 last:border-b-0"
                              >
                                <div>
                                  <p className="font-medium text-slate-800">{clinic.name}</p>
                                  <p className="text-sm text-slate-500 mt-1">{clinic.address}</p>
                                </div>
                              </button>
                            ))}
                          {clinicSearchQuery && publicClinics.filter(clinic =>
                            clinic.name.toLowerCase().includes(clinicSearchQuery.toLowerCase()) ||
                            clinic.address.toLowerCase().includes(clinicSearchQuery.toLowerCase())
                          ).length === 0 && (
                            <div className="p-4 text-center text-sm text-slate-500">
                              검색 결과가 없습니다
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* 선택된 병원 표시 */}
                {selectedClinicId && (
                  <div className="mt-2 p-2 bg-blue-50 rounded-md">
                    <p className="text-sm text-blue-800">
                      선택된 병원: <strong>{selectedClinicName}</strong>
                    </p>
                  </div>
                )}
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

              <button
                type="submit"
                disabled={isSubmitting || !selectedClinicId}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold py-3 px-4 rounded-md transition-colors"
              >
                {isSubmitting ? '신청 중...' : '가입 신청하기'}
              </button>
            </form>
          </div>
        </div>
      </div>
    )
  }

  // 메인 화면
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-blue-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto">
        <div className="text-center mb-8">
          <div className="flex items-center justify-center space-x-2 mb-4">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold">🦷</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-800">클리닉 매니저</h1>
          </div>
        </div>

        <div className="bg-white p-8 rounded-lg shadow-md border border-slate-200">
          <div className="flex justify-center mb-6">
            <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center">
              <UserMinusIcon className="h-10 w-10 text-slate-500" />
            </div>
          </div>

          <h2 className="text-2xl font-bold text-center text-slate-800 mb-4">
            퇴사 처리된 계정입니다
          </h2>

          <p className="text-center text-slate-600 mb-6">
            해당 병원에서 퇴사 처리되어<br />
            더 이상 병원 기능에 접근할 수 없습니다.
          </p>

          {/* 이전 소속 병원 정보 */}
          <div className="bg-slate-50 border border-slate-200 rounded-md p-4 mb-6">
            <div className="flex items-center mb-2">
              <BuildingOffice2Icon className="h-5 w-5 text-slate-500 mr-2" />
              <h3 className="font-semibold text-slate-700">이전 소속 정보</h3>
            </div>
            <div className="space-y-1 text-sm text-slate-600">
              <p><strong>이름:</strong> {user.name || '정보 없음'}</p>
              <p><strong>이메일:</strong> {user.email || '정보 없음'}</p>
              <p><strong>이전 병원:</strong> {user.clinic?.name || '정보 없음'}</p>
              <p><strong>이전 직급:</strong> {
                user.role === 'owner' ? '원장' :
                user.role === 'vice_director' ? '부원장' :
                user.role === 'manager' ? '실장' :
                user.role === 'team_leader' ? '진료팀장' :
                user.role === 'staff' ? '진료팀원' : user.role
              }</p>
            </div>
          </div>

          {/* 다음 단계 안내 */}
          <div className="bg-blue-50 border border-blue-200 rounded-md p-4 mb-6">
            <div className="flex items-start">
              <ArrowRightCircleIcon className="h-5 w-5 text-blue-500 mr-2 mt-0.5 flex-shrink-0" />
              <div>
                <h3 className="font-semibold text-blue-900 mb-1">다음 단계를 선택하세요</h3>
                <p className="text-sm text-blue-700">
                  새 병원을 등록하거나, 기존 병원에 가입 신청할 수 있습니다.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => setViewMode('create-clinic')}
              className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-md transition-colors flex items-center justify-center"
            >
              <PlusCircleIcon className="h-5 w-5 mr-2" />
              새 병원 등록 (대표원장)
            </button>

            <button
              onClick={() => setViewMode('join-clinic')}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-md transition-colors flex items-center justify-center"
            >
              <BuildingOffice2Icon className="h-5 w-5 mr-2" />
              다른 병원에 가입하기
            </button>

            <button
              onClick={handleLogout}
              className="w-full bg-slate-200 hover:bg-slate-300 text-slate-800 font-bold py-3 px-4 rounded-md transition-colors"
            >
              로그아웃
            </button>
          </div>
        </div>

        <div className="mt-6 text-center">
          <p className="text-sm text-slate-600">
            문의사항이 있으신가요?
          </p>
          <p className="text-sm text-slate-600">
            <a href="mailto:hiclinic.inc@gmail.com" className="text-blue-600 hover:text-blue-700">
              hiclinic.inc@gmail.com
            </a>로 문의해 주세요.
          </p>
        </div>
      </div>
    </div>
  )
}
