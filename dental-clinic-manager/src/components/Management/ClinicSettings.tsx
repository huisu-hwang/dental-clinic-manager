'use client'

import { useState, useEffect } from 'react'
import {
  BuildingOfficeIcon,
  GlobeAltIcon,
  UserGroupIcon,
  CreditCardIcon,
  ShieldCheckIcon,
  ClockIcon
} from '@heroicons/react/24/outline'
import { createClient } from '@/lib/supabase/client'
import type { UserProfile } from '@/contexts/AuthContext'
import ClinicHoursSettings from './ClinicHoursSettings'

// Clinic 타입을 이 파일에 직접 정의
interface Clinic {
  id: string;
  name: string;
  owner_name: string;
  address: string;
  phone: string;
  email: string;
  business_number?: string;
  description?: string;
  is_public: boolean;
  allow_join_requests: boolean;
  max_users: number;
  subscription_tier: string;
  subscription_expires_at?: string;
  created_at: string;
  updated_at: string;
}

interface ClinicSettingsProps {
  currentUser: UserProfile
}

export default function ClinicSettings({ currentUser }: ClinicSettingsProps) {
  const [activeTab, setActiveTab] = useState<'info' | 'hours'>('info')
  const [clinic, setClinic] = useState<Clinic | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  interface ClinicFormData {
  name: string;
  ownerName: string;
  address: string;
  phone: string;
  email: string;
  businessNumber: string;
  description: string;
  isPublic: boolean;
  allowJoinRequests: boolean;
  maxUsers: number;
}

const [formData, setFormData] = useState<ClinicFormData>({
    name: '',
    ownerName: '',
    address: '',
    phone: '',
    email: '',
    businessNumber: '',
    description: '',
    isPublic: false,
    allowJoinRequests: true,
    maxUsers: 5
  })

  useEffect(() => {
    if (currentUser.clinic_id) {
      fetchClinicInfo()
    }
  }, [currentUser.clinic_id])

  const fetchClinicInfo = async () => {
    setLoading(true)
    const supabase = createClient()
    if (!supabase || !currentUser.clinic_id) {
      setLoading(false)
      setError('병원 정보를 불러올 수 없습니다.')
      return
    }

    try {
      const { data, error } = await supabase
        .from('clinics')
        .select('*')
        .eq('id', currentUser.clinic_id)
        .single()

      if (error) {
        console.error('Error fetching clinic:', error)
        setError('병원 정보를 불러오는데 실패했습니다.')
      } else if (data) {
        const clinicData: Clinic = data as any;

        setClinic(clinicData)
        setFormData({
          name: (data as any).name,
          ownerName: (data as any).owner_name,
          address: (data as any).address,
          phone: (data as any).phone,
          email: (data as any).email,
          businessNumber: (data as any).business_number || '',
          description: (data as any).description || '',
          isPublic: (data as any).is_public || false,
          allowJoinRequests: (data as any).allow_join_requests !== false,
          maxUsers: (data as any).max_users || 5
        })
      }
    } catch (err) {
      console.error('Error:', err)
      setError('병원 정보를 불러오는데 실패했습니다.')
    } finally {
      setLoading(false)
    }
  }

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value, type } = e.target
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? (e.target as HTMLInputElement).checked : value
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!currentUser.clinic_id) return

    setError('')
    setSuccess('')
    setSaving(true)

    const supabase = createClient()
    if (!supabase) {
      setError('데이터베이스 연결에 실패했습니다.')
      setSaving(false)
      return
    }

    try {
      const { error } = await (supabase as any)
        .from('clinics')
        .update({
          name: formData.name,
          owner_name: formData.ownerName,
          address: formData.address,
          phone: formData.phone,
          email: formData.email,
          business_number: formData.businessNumber || null,
          description: formData.description || null,
          is_public: formData.isPublic,
          allow_join_requests: formData.allowJoinRequests,
          max_users: formData.maxUsers,
          updated_at: new Date().toISOString()
        })
        .eq('id', currentUser.clinic_id)

      if (error) {
        console.error('Error updating clinic:', error)
        setError('병원 정보 업데이트에 실패했습니다.')
      } else {
        setSuccess('병원 정보가 성공적으로 업데이트되었습니다.')
        fetchClinicInfo()
      }
    } catch (err) {
      console.error('Error:', err)
      setError('병원 정보 업데이트 중 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  const getSubscriptionTierLabel = (tier: string) => {
    const labels = {
      basic: '기본',
      professional: '프로페셔널',
      enterprise: '엔터프라이즈'
    }
    return labels[tier as keyof typeof labels] || tier
  }

  if (loading) {
    return (
      <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
        <div className="text-center py-8">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-slate-600">병원 정보를 불러오는 중...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200">
      {/* 탭 네비게이션 */}
      <div className="border-b border-slate-200">
        <div className="flex">
          <button
            onClick={() => setActiveTab('info')}
            className={`flex items-center gap-2 px-6 py-4 font-medium border-b-2 transition-colors ${
              activeTab === 'info'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-slate-600 hover:text-slate-800'
            }`}
          >
            <BuildingOfficeIcon className="h-5 w-5" />
            병원 정보
          </button>
          <button
            onClick={() => setActiveTab('hours')}
            className={`flex items-center gap-2 px-6 py-4 font-medium border-b-2 transition-colors ${
              activeTab === 'hours'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-slate-600 hover:text-slate-800'
            }`}
          >
            <ClockIcon className="h-5 w-5" />
            진료시간
          </button>
        </div>
      </div>

      {/* 탭 컨텐츠 */}
      <div className="p-6">{activeTab === 'info' ? (
        <>
          {/* 기존 병원 정보 폼 */}

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md text-sm">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-600 px-4 py-3 rounded-md text-sm">
          {success}
        </div>
      )}

      {clinic && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Settings Form */}
          <div className="lg:col-span-2">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Basic Info */}
              <div>
                <h3 className="text-lg font-semibold text-slate-800 mb-4">기본 정보</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      병원명 *
                    </label>
                    <input
                      type="text"
                      name="name"
                      value={formData.name}
                      onChange={handleInputChange}
                      className="w-full p-3 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      required
                      disabled={saving}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      원장님 성함 *
                    </label>
                    <input
                      type="text"
                      name="ownerName"
                      value={formData.ownerName}
                      onChange={handleInputChange}
                      className="w-full p-3 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      required
                      disabled={saving}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    주소 *
                  </label>
                  <input
                    type="text"
                    name="address"
                    value={formData.address}
                    onChange={handleInputChange}
                    className="w-full p-3 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    required
                    disabled={saving}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      전화번호 *
                    </label>
                    <input
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleInputChange}
                      className="w-full p-3 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      required
                      disabled={saving}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      이메일 *
                    </label>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                      onChange={handleInputChange}
                      className="w-full p-3 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      required
                      disabled={saving}
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    사업자등록번호
                  </label>
                  <input
                    type="text"
                    name="businessNumber"
                    value={formData.businessNumber}
                    onChange={handleInputChange}
                    className="w-full p-3 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    placeholder="123-45-67890"
                    disabled={saving}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    병원 소개
                  </label>
                  <textarea
                    name="description"
                    value={formData.description}
                    onChange={handleInputChange}
                    rows={3}
                    className="w-full p-3 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    placeholder="병원에 대한 간단한 소개를 입력하세요..."
                    disabled={saving}
                  />
                </div>
              </div>

              {/* Visibility Settings */}
              <div>
                <h3 className="text-lg font-semibold text-slate-800 mb-4">공개 설정</h3>
                <div className="space-y-4">
                  <div className="flex items-center">
                    <input
                      type="checkbox"
                      id="isPublic"
                      name="isPublic"
                      checked={formData.isPublic}
                      onChange={handleInputChange}
                      className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                      disabled={saving}
                    />
                    <label htmlFor="isPublic" className="ml-2 block text-sm text-slate-700">
                      병원을 공개하여 직원들이 가입 신청할 수 있도록 허용
                    </label>
                  </div>

                  {formData.isPublic && (
                    <div className="ml-6">
                      <div className="flex items-center mb-2">
                        <input
                          type="checkbox"
                          id="allowJoinRequests"
                          name="allowJoinRequests"
                          checked={formData.allowJoinRequests}
                          onChange={handleInputChange}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                          disabled={saving}
                        />
                        <label htmlFor="allowJoinRequests" className="ml-2 block text-sm text-slate-700">
                          가입 신청 허용
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* User Limit */}
              <div>
                <h3 className="text-lg font-semibold text-slate-800 mb-4">사용자 제한</h3>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    최대 사용자 수
                  </label>
                  <input
                    type="number"
                    name="maxUsers"
                    value={formData.maxUsers}
                    onChange={handleInputChange}
                    min="1"
                    max="50"
                    className="w-32 p-3 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    disabled={saving}
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    구독 플랜에 따라 제한될 수 있습니다.
                  </p>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={saving}
                  className="bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold py-3 px-6 rounded-md transition-colors"
                >
                  {saving ? '저장 중...' : '설정 저장'}
                </button>
              </div>
            </form>
          </div>

          {/* Sidebar Info */}
          <div className="space-y-4">
            {/* Subscription Info */}
            <div className="bg-slate-50 p-4 rounded-lg">
              <div className="flex items-center mb-3">
                <CreditCardIcon className="h-5 w-5 text-slate-600 mr-2" />
                <h4 className="font-semibold text-slate-800">구독 정보</h4>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600">플랜:</span>
                  <span className="font-medium">
                    {getSubscriptionTierLabel(clinic.subscription_tier)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">상태:</span>
                  <span className="font-medium text-green-600">활성</span>
                </div>
                {clinic.subscription_expires_at && (
                  <div className="flex justify-between">
                    <span className="text-slate-600">만료:</span>
                    <span className="font-medium">
                      {new Date(clinic.subscription_expires_at).toLocaleDateString('ko-KR')}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Quick Stats */}
            <div className="bg-slate-50 p-4 rounded-lg">
              <div className="flex items-center mb-3">
                <UserGroupIcon className="h-5 w-5 text-slate-600 mr-2" />
                <h4 className="font-semibold text-slate-800">현황</h4>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-600">등록일:</span>
                  <span className="font-medium">
                    {new Date(clinic.created_at).toLocaleDateString('ko-KR')}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-600">최종 수정:</span>
                  <span className="font-medium">
                    {new Date(clinic.updated_at).toLocaleDateString('ko-KR')}
                  </span>
                </div>
              </div>
            </div>

            {/* Security Notice */}
            <div className="bg-blue-50 p-4 rounded-lg">
              <div className="flex items-center mb-3">
                <ShieldCheckIcon className="h-5 w-5 text-blue-600 mr-2" />
                <h4 className="font-semibold text-blue-800">보안 안내</h4>
              </div>
              <ul className="space-y-1 text-xs text-blue-700">
                <li>• 병원을 공개하면 가입 신청을 받을 수 있습니다</li>
                <li>• 모든 가입 신청은 원장님의 승인이 필요합니다</li>
                <li>• 직원의 권한은 역할에 따라 자동 설정됩니다</li>
              </ul>
            </div>
          </div>
        </div>
      )}
        </>
      ) : (
        <>
          {/* 진료시간 설정 탭 */}
          {currentUser.clinic_id && (
            <ClinicHoursSettings clinicId={currentUser.clinic_id} />
          )}
        </>
      )}
      </div>
    </div>
  )
}