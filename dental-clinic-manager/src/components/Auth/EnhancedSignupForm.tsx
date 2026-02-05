'use client'

import { useState } from 'react'
import { EyeIcon, EyeSlashIcon } from '@heroicons/react/24/outline'
import ClinicSelectionForm from './ClinicSelectionForm'
import { authService } from '@/lib/authService'
import { autoFormatPhoneNumber } from '@/utils/phoneUtils'

interface EnhancedSignupFormProps {
  onBackToLanding: () => void
  onShowLogin: () => void
  onSignupSuccess: () => void
}

type SignupStep = 'clinic-selection' | 'new-clinic' | 'join-clinic'

export default function EnhancedSignupForm({
  onBackToLanding,
  onShowLogin,
  onSignupSuccess
}: EnhancedSignupFormProps) {
  const [currentStep, setCurrentStep] = useState<SignupStep>('clinic-selection')
  const [selectedClinicId, setSelectedClinicId] = useState<string | null>(null)

  // Form data for new clinic registration
  const [formData, setFormData] = useState({
    userId: '',
    password: '',
    confirmPassword: '',
    clinicOwnerName: '',
    clinicName: '',
    clinicAddress: '',
    clinicPhone: '',
    clinicEmail: '',
    businessNumber: ''
  })

  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const validateForm = () => {
    if (!formData.userId.trim()) {
      setError('아이디를 입력해주세요.')
      return false
    }
    if (formData.userId.length < 4) {
      setError('아이디는 4글자 이상이어야 합니다.')
      return false
    }
    if (!formData.password) {
      setError('비밀번호를 입력해주세요.')
      return false
    }
    if (formData.password.length < 6) {
      setError('비밀번호는 6글자 이상이어야 합니다.')
      return false
    }
    if (formData.password !== formData.confirmPassword) {
      setError('비밀번호가 일치하지 않습니다.')
      return false
    }
    if (!formData.clinicOwnerName.trim()) {
      setError('원장 이름을 입력해주세요.')
      return false
    }
    if (!formData.clinicName.trim()) {
      setError('치과명을 입력해주세요.')
      return false
    }
    if (!formData.clinicAddress.trim()) {
      setError('치과 주소를 입력해주세요.')
      return false
    }
    if (!formData.clinicPhone.trim()) {
      setError('치과 전화번호를 입력해주세요.')
      return false
    }
    if (!formData.clinicEmail.trim()) {
      setError('이메일 주소를 입력해주세요.')
      return false
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(formData.clinicEmail)) {
      setError('올바른 이메일 형식을 입력해주세요.')
      return false
    }
    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSuccess('')

    if (!validateForm()) return

    setLoading(true)

    try {
      const authServiceInstance = authService.getInstance()
      const result = await authServiceInstance.register({
        email: formData.clinicEmail,
        password: formData.password,
        name: formData.clinicOwnerName,
        phone: formData.clinicPhone,
        clinicName: formData.clinicName,
        clinicOwnerName: formData.clinicOwnerName,
        clinicAddress: formData.clinicAddress,
        clinicPhone: formData.clinicPhone,
        clinicEmail: formData.clinicEmail,
        businessNumber: formData.businessNumber || undefined
      })

      if (result.success) {
        setSuccess('회원가입이 완료되었습니다! 로그인 페이지로 이동합니다.')
        setTimeout(() => {
          onSignupSuccess()
        }, 2000)
      } else {
        setError(result.error || '회원가입 중 오류가 발생했습니다.')
      }

    } catch (err) {
      setError('회원가입 중 오류가 발생했습니다. 다시 시도해주세요.')
    } finally {
      setLoading(false)
    }
  }

  const handleClinicSelection = (clinicId: string | null) => {
    setSelectedClinicId(clinicId)
    if (clinicId) {
      // User selected an existing clinic and submitted join request
      setSuccess('가입 신청이 접수되었습니다. 병원 관리자의 승인을 기다려주세요.')
      setTimeout(() => {
        onShowLogin()
      }, 3000)
    }
  }

  const handleCreateNewClinic = () => {
    setCurrentStep('new-clinic')
  }

  // Show different forms based on current step
  if (currentStep === 'clinic-selection') {
    return (
      <ClinicSelectionForm
        onBack={onBackToLanding}
        onSelectClinic={handleClinicSelection}
        onCreateNewClinic={handleCreateNewClinic}
      />
    )
  }

  // New clinic registration form (for clinic owners)
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <button
            onClick={() => setCurrentStep('clinic-selection')}
            className="inline-flex items-center text-blue-600 hover:text-blue-700 font-medium mb-4"
          >
            ← 돌아가기
          </button>
          <div className="flex items-center justify-center space-x-2 mb-4">
            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold">🦷</span>
            </div>
            <h1 className="text-2xl font-bold text-slate-800">클리닉 매니저</h1>
          </div>
          <h2 className="text-3xl font-bold text-slate-800 mb-2">새 병원 등록</h2>
          <p className="text-slate-600">병원 정보를 입력하여 계정을 생성하세요</p>
        </div>

        {/* Form */}
        <div className="bg-white p-8 rounded-lg shadow-md border border-slate-200">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* 로그인 정보 */}
            <div className="pb-4 border-b border-slate-200">
              <h3 className="text-lg font-semibold text-slate-800 mb-4">로그인 정보</h3>

              <div className="space-y-4">
                <div>
                  <label htmlFor="userId" className="block text-sm font-medium text-slate-700 mb-1">
                    아이디 *
                  </label>
                  <input
                    type="text"
                    id="userId"
                    name="userId"
                    value={formData.userId}
                    onChange={handleInputChange}
                    className="w-full p-3 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    placeholder="4글자 이상의 아이디"
                    disabled={loading}
                  />
                </div>

                <div className="relative">
                  <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
                    비밀번호 *
                  </label>
                  <input
                    type={showPassword ? "text" : "password"}
                    id="password"
                    name="password"
                    value={formData.password}
                    onChange={handleInputChange}
                    className="w-full p-3 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500 pr-10"
                    placeholder="6글자 이상"
                    disabled={loading}
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 top-6 pr-3 flex items-center"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeSlashIcon className="h-5 w-5 text-gray-400" />
                    ) : (
                      <EyeIcon className="h-5 w-5 text-gray-400" />
                    )}
                  </button>
                </div>

                <div className="relative">
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-700 mb-1">
                    비밀번호 확인 *
                  </label>
                  <input
                    type={showConfirmPassword ? "text" : "password"}
                    id="confirmPassword"
                    name="confirmPassword"
                    value={formData.confirmPassword}
                    onChange={handleInputChange}
                    className="w-full p-3 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500 pr-10"
                    placeholder="비밀번호를 다시 입력하세요"
                    disabled={loading}
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 top-6 pr-3 flex items-center"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    {showConfirmPassword ? (
                      <EyeSlashIcon className="h-5 w-5 text-gray-400" />
                    ) : (
                      <EyeIcon className="h-5 w-5 text-gray-400" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* 병원 정보 */}
            <div>
              <h3 className="text-lg font-semibold text-slate-800 mb-4">병원 정보</h3>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="clinicOwnerName" className="block text-sm font-medium text-slate-700 mb-1">
                      원장 이름 *
                    </label>
                    <input
                      type="text"
                      id="clinicOwnerName"
                      name="clinicOwnerName"
                      value={formData.clinicOwnerName}
                      onChange={handleInputChange}
                      className="w-full p-3 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      placeholder="홍길동"
                      disabled={loading}
                    />
                  </div>

                  <div>
                    <label htmlFor="clinicName" className="block text-sm font-medium text-slate-700 mb-1">
                      치과명 *
                    </label>
                    <input
                      type="text"
                      id="clinicName"
                      name="clinicName"
                      value={formData.clinicName}
                      onChange={handleInputChange}
                      className="w-full p-3 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      placeholder="○○치과"
                      disabled={loading}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="clinicAddress" className="block text-sm font-medium text-slate-700 mb-1">
                    치과 주소 *
                  </label>
                  <input
                    type="text"
                    id="clinicAddress"
                    name="clinicAddress"
                    value={formData.clinicAddress}
                    onChange={handleInputChange}
                    className="w-full p-3 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    placeholder="서울시 강남구 테헤란로 123 4층"
                    disabled={loading}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="clinicPhone" className="block text-sm font-medium text-slate-700 mb-1">
                      치과 전화번호 *
                    </label>
                    <input
                      type="tel"
                      id="clinicPhone"
                      name="clinicPhone"
                      value={formData.clinicPhone}
                      onChange={(e) => {
                        const formatted = autoFormatPhoneNumber(e.target.value);
                        setFormData(prev => ({ ...prev, clinicPhone: formatted.value }));
                      }}
                      className="w-full p-3 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      placeholder="02-1234-5678"
                      maxLength={13}
                      disabled={loading}
                    />
                  </div>

                  <div>
                    <label htmlFor="clinicEmail" className="block text-sm font-medium text-slate-700 mb-1">
                      이메일 주소 *
                    </label>
                    <input
                      type="email"
                      id="clinicEmail"
                      name="clinicEmail"
                      value={formData.clinicEmail}
                      onChange={handleInputChange}
                      className="w-full p-3 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                      placeholder="clinic@example.com"
                      disabled={loading}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="businessNumber" className="block text-sm font-medium text-slate-700 mb-1">
                    사업자등록번호 (선택)
                  </label>
                  <input
                    type="text"
                    id="businessNumber"
                    name="businessNumber"
                    value={formData.businessNumber}
                    onChange={handleInputChange}
                    className="w-full p-3 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    placeholder="123-45-67890"
                    disabled={loading}
                  />
                </div>
              </div>
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
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold py-3 px-4 rounded-md transition-colors"
            >
              {loading ? '가입 중...' : '병원 등록 및 회원가입'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <p className="text-slate-600">
              이미 계정이 있으신가요?{' '}
              <button
                onClick={onShowLogin}
                className="text-blue-600 hover:text-blue-700 font-medium"
              >
                로그인하기
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}