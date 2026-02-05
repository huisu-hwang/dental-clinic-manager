'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useAuth } from '@/contexts/AuthContext'
import { EyeIcon, EyeSlashIcon, LockClosedIcon } from '@heroicons/react/24/outline'

interface PasswordVerificationModalProps {
  isOpen: boolean
  onVerified: () => void
  onCancel: () => void
  purpose: 'contract' | 'profile' | 'payroll'
}

const PURPOSE_LABELS = {
  contract: '근로계약서',
  profile: '계정 정보',
  payroll: '급여 명세서',
}

export default function PasswordVerificationModal({
  isOpen,
  onVerified,
  onCancel,
  purpose,
}: PasswordVerificationModalProps) {
  const { user } = useAuth()
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  if (!isOpen) return null

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (!password) {
      setError('비밀번호를 입력해주세요.')
      return
    }

    if (!user?.email) {
      setError('사용자 정보를 찾을 수 없습니다.')
      return
    }

    setLoading(true)

    try {
      const supabase = createClient()

      // Supabase로 비밀번호 재확인
      const { error: authError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: password,
      })

      if (authError) {
        console.error('[PasswordVerification] Auth error:', authError)
        setError('비밀번호가 올바르지 않습니다.')
        setLoading(false)
        return
      }

      // 인증 성공
      console.log('[PasswordVerification] Password verified successfully')
      setPassword('')
      onVerified()
    } catch (error) {
      console.error('[PasswordVerification] Unexpected error:', error)
      setError('인증 중 오류가 발생했습니다.')
      setLoading(false)
    }
  }

  const handleClose = () => {
    setPassword('')
    setError('')
    onCancel()
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl p-8 max-w-md w-full mx-4">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-blue-100 mb-4">
            <LockClosedIcon className="h-6 w-6 text-blue-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-800 mb-2">
            비밀번호 확인
          </h2>
          <p className="text-slate-600 text-sm">
            <span className="font-semibold text-blue-600">
              {PURPOSE_LABELS[purpose]}
            </span>
            는 민감한 정보입니다.
            <br />
            본인 확인을 위해 비밀번호를 입력해주세요.
          </p>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="relative">
            <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
              비밀번호
            </label>
            <input
              type={showPassword ? 'text' : 'password'}
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-3 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500 pr-10"
              placeholder="비밀번호를 입력하세요"
              disabled={loading}
              autoFocus
              autoComplete="current-password"
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

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md text-sm">
              {error}
            </div>
          )}

          <div className="bg-amber-50 border border-amber-200 px-4 py-3 rounded-md">
            <p className="text-amber-800 text-xs">
              💡 인증 후 10분 동안 재확인 없이 {PURPOSE_LABELS[purpose]}에 접근할 수 있습니다.
            </p>
          </div>

          {/* Buttons */}
          <div className="flex space-x-3 pt-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={loading}
              className="flex-1 bg-slate-200 hover:bg-slate-300 disabled:bg-slate-100 text-slate-700 font-medium py-3 px-4 rounded-md transition-colors"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-medium py-3 px-4 rounded-md transition-colors"
            >
              {loading ? '확인 중...' : '확인'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
