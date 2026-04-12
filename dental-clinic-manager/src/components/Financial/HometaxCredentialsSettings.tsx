'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Building2,
  Loader2,
  Check,
  X,
  Eye,
  EyeOff,
  AlertCircle,
  CheckCircle2,
} from 'lucide-react'
import { appConfirm } from '@/components/ui/AppDialog'

interface Credentials {
  id: string
  hometax_user_id?: string
  business_number: string
  login_method: string
  is_active: boolean
  last_login_success: boolean | null
  last_login_attempt: string | null
  last_login_error: string | null
  has_resident_number?: boolean
}

interface HometaxCredentialsSettingsProps {
  clinicId: string
}

export default function HometaxCredentialsSettings({ clinicId }: HometaxCredentialsSettingsProps) {
  const [credentials, setCredentials] = useState<Credentials | null>(null)
  const [showCredForm, setShowCredForm] = useState(false)
  const [loginId, setLoginId] = useState('')
  const [loginPw, setLoginPw] = useState('')
  const [bizNo, setBizNo] = useState('')
  const [residentNumber, setResidentNumber] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [saving, setSaving] = useState(false)
  const [loading, setLoading] = useState(true)

  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  // 인증정보 로드
  const loadCredentials = useCallback(async () => {
    try {
      const res = await fetch(`/api/hometax/credentials?clinicId=${clinicId}`)
      const data = await res.json()
      if (data.success) {
        setCredentials(data.data)
      }
    } catch {
      // 조회 실패 무시
    } finally {
      setLoading(false)
    }
  }, [clinicId])

  useEffect(() => {
    loadCredentials()
  }, [loadCredentials])

  // 인증정보 저장
  const handleSaveCredentials = async () => {
    const isEditing = !!credentials

    if (!loginId || !bizNo) {
      setError('아이디와 사업자등록번호를 입력해주세요.')
      return
    }
    if (!isEditing && (!loginPw || !residentNumber)) {
      setError('신규 등록 시 비밀번호와 주민등록번호를 모두 입력해주세요.')
      return
    }

    const residentClean = residentNumber.replace(/[^0-9]/g, '')
    if (residentNumber && residentClean.length !== 7) {
      setError('주민등록번호는 생년월일 6자리 + 뒷자리 1자리 (총 7자리)를 입력해주세요.')
      return
    }

    setSaving(true)
    setError(null)

    try {
      const res = await fetch('/api/hometax/credentials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinicId,
          loginId,
          loginPw,
          businessNumber: bizNo,
          residentNumber: residentClean,
        }),
      })
      const data = await res.json()

      if (data.success) {
        setShowCredForm(false)
        setLoginId('')
        setLoginPw('')
        setBizNo('')
        setResidentNumber('')
        setSuccess('인증정보가 저장되었습니다.')
        await loadCredentials()
      } else {
        setError(data.error || '저장에 실패했습니다.')
      }
    } catch {
      setError('서버 연결 중 오류가 발생했습니다.')
    } finally {
      setSaving(false)
    }
  }

  // 인증정보 삭제
  const handleDeleteCredentials = async () => {
    if (!await appConfirm('홈택스 인증정보를 삭제하시겠습니까?')) return

    try {
      const res = await fetch(`/api/hometax/credentials?clinicId=${clinicId}`, {
        method: 'DELETE',
      })
      const data = await res.json()
      if (data.success) {
        setCredentials(null)
        setSuccess('인증정보가 삭제되었습니다.')
      }
    } catch {
      setError('삭제 중 오류가 발생했습니다.')
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 메시지 */}
      {error && (
        <div className="flex items-start gap-2 p-3 bg-at-error-bg border border-at-border rounded-xl text-sm text-at-error">
          <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}
      {success && (
        <div className="flex items-start gap-2 p-3 bg-at-success-bg border border-at-border rounded-xl text-sm text-at-success">
          <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0" />
          <span>{success}</span>
          <button onClick={() => setSuccess(null)} className="ml-auto"><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* 인증정보 섹션 */}
      <div className="bg-white rounded-2xl border border-at-border overflow-hidden">
        <div className="p-4 border-b border-at-border flex items-center justify-between bg-at-surface-alt">
          <div className="flex items-center gap-2">
            <Building2 className="w-5 h-5 text-indigo-500" />
            <h3 className="font-bold text-at-text text-sm">홈택스 인증정보</h3>
          </div>
          {credentials && (
            <div className="flex items-center gap-2">
              <span className={`text-xs px-2 py-0.5 rounded-full ${credentials.last_login_success ? 'bg-at-success-bg text-at-success' : credentials.last_login_success === false ? 'bg-at-error-bg text-at-error' : 'bg-at-surface-alt text-at-text-secondary'}`}>
                {credentials.last_login_success ? '연동 정상' : credentials.last_login_success === false ? '로그인 실패' : '미확인'}
              </span>
            </div>
          )}
        </div>

        <div className="p-4">
          {credentials && !showCredForm ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-at-text-weak">사업자등록번호</span>
                <span className="font-medium text-at-text">
                  {credentials.business_number.replace(/(\d{3})(\d{2})(\d{5})/, '$1-$2-$3')}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-at-text-weak">로그인 방식</span>
                <span className="font-medium text-at-text">ID/PW</span>
              </div>
              {credentials.last_login_attempt && (
                <div className="flex items-center justify-between text-sm">
                  <span className="text-at-text-weak">마지막 로그인</span>
                  <span className="text-at-text-secondary text-xs">
                    {new Date(credentials.last_login_attempt).toLocaleString('ko-KR')}
                  </span>
                </div>
              )}
              {credentials.last_login_error && (
                <div className="p-2 bg-at-error-bg rounded-xl text-xs text-at-error">
                  {credentials.last_login_error}
                </div>
              )}
              <div className="flex gap-2 pt-2">
                <button
                  onClick={() => {
                    setBizNo(credentials.business_number)
                    setLoginId(credentials.hometax_user_id || '')
                    setLoginPw('')
                    setResidentNumber('')
                    setShowCredForm(true)
                  }}
                  className="flex-1 py-2 text-sm font-medium text-at-accent bg-at-accent-light rounded-xl hover:bg-at-tag transition-colors"
                >
                  수정
                </button>
                <button
                  onClick={handleDeleteCredentials}
                  className="py-2 px-4 text-sm font-medium text-at-error bg-at-error-bg rounded-xl hover:bg-at-error-bg transition-colors"
                >
                  삭제
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-at-text-secondary mb-1 block">사업자등록번호</label>
                <input
                  type="text"
                  value={bizNo}
                  onChange={(e) => setBizNo(e.target.value)}
                  placeholder="000-00-00000"
                  className="w-full px-3 py-2 border border-at-border rounded-xl text-sm focus:ring-2 focus:ring-at-accent focus:border-at-accent"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-at-text-secondary mb-1 block">홈택스 아이디</label>
                <input
                  type="text"
                  value={loginId}
                  onChange={(e) => setLoginId(e.target.value)}
                  placeholder="홈택스 로그인 아이디"
                  className="w-full px-3 py-2 border border-at-border rounded-xl text-sm focus:ring-2 focus:ring-at-accent focus:border-at-accent"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-at-text-secondary mb-1 flex items-center gap-1.5">
                  홈택스 비밀번호
                  {credentials && !loginPw && (
                    <span className="flex items-center gap-0.5 text-at-success font-medium">
                      <Check className="w-3 h-3" />저장됨
                    </span>
                  )}
                </label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={loginPw}
                    onChange={(e) => setLoginPw(e.target.value)}
                    placeholder={credentials ? '변경하려면 입력 (비워두면 기존값 유지)' : '홈택스 로그인 비밀번호'}
                    className="w-full px-3 py-2 pr-10 border border-at-border rounded-xl text-sm focus:ring-2 focus:ring-at-accent focus:border-at-accent"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-at-text-weak hover:text-at-text"
                  >
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="text-xs font-medium text-at-text-secondary mb-1 flex items-center gap-1.5">
                  주민등록번호 (생년월일 + 뒷자리 1자리)
                  {credentials?.has_resident_number && !residentNumber && (
                    <span className="flex items-center gap-0.5 text-at-success font-medium">
                      <Check className="w-3 h-3" />저장됨
                    </span>
                  )}
                </label>
                <div className="relative">
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={residentNumber}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^0-9-]/g, '')
                      if (val.replace(/-/g, '').length <= 7) {
                        setResidentNumber(val)
                      }
                    }}
                    placeholder={credentials?.has_resident_number ? '변경하려면 입력 (비워두면 기존값 유지)' : '000000-0'}
                    maxLength={8}
                    className="w-full px-3 py-2 pr-10 border border-at-border rounded-xl text-sm focus:ring-2 focus:ring-at-accent focus:border-at-accent"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPw(!showPw)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-at-text-weak hover:text-at-text"
                  >
                    {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[10px] text-at-text-weak mt-1">홈택스 ID/PW 로그인 시 본인확인에 필요합니다</p>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleSaveCredentials}
                  disabled={saving}
                  className="flex-1 py-2 text-sm font-medium text-white bg-at-accent rounded-xl hover:bg-at-accent-hover disabled:opacity-50 transition-colors flex items-center justify-center gap-1"
                >
                  {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  저장
                </button>
                {credentials && (
                  <button
                    onClick={() => setShowCredForm(false)}
                    className="py-2 px-4 text-sm font-medium text-at-text-secondary bg-at-surface-alt rounded-xl hover:bg-at-surface-hover transition-colors"
                  >
                    취소
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
