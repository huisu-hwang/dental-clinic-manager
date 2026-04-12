'use client'
import { useState, useEffect } from 'react'
import Image from 'next/image'
import { EyeIcon, EyeSlashIcon, MagnifyingGlassIcon } from '@heroicons/react/24/outline'
import { dataService } from '@/lib/dataService'
import { getSupabase } from '@/lib/supabase'
import { encryptResidentNumber } from '@/utils/encryptionUtils'
import {
  validateResidentNumberWithMessage,
  autoFormatResidentNumber,
  sanitizeResidentNumberInput
} from '@/utils/residentNumberUtils'
import { autoFormatPhoneNumber } from '@/utils/phoneUtils'

interface SignupFormProps {
  onBackToLanding: () => void
  onShowLogin: () => void
  onSignupSuccess: (clinicInfo: any) => void
  onSearchClinics?: (query: string) => void
}

export default function SignupForm({
  onBackToLanding,
  onShowLogin,
  onSignupSuccess,
  onSearchClinics,
}: SignupFormProps) {
  const [formData, setFormData] = useState({
    userId: '',
    name: '', // 사용자 이름 필드 추가
    password: '',
    confirmPassword: '',
    role: 'owner', // 직책 기본값을 '대표원장'으로 변경
    phone: '', // 개인 전화번호
    address: '', // 주소
    residentNumber: '', // 주민등록번호
    clinicOwnerName: '',
    clinicName: '',
    clinicAddress: '',
    clinicPhone: '',
    clinicEmail: ''
  });
  const [publicClinics, setPublicClinics] = useState<any[]>([]);
  const [selectedClinicId, setSelectedClinicId] = useState('');
  const [selectedClinicName, setSelectedClinicName] = useState('');
  const [isSearchingClinics, setIsSearchingClinics] = useState(false);
  const [clinicSearchQuery, setClinicSearchQuery] = useState('');
  const [showClinicSearchResults, setShowClinicSearchResults] = useState(false);
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('');
  const [passwordMatch, setPasswordMatch] = useState({ message: '', color: '' });

  // 역할이 변경될 때마다 병원 목록을 가져오거나 초기화합니다.
  useEffect(() => {
    if (formData.role !== 'owner') {
      const fetchClinics = async () => {
        setIsSearchingClinics(true);
        try {
          const result = await dataService.searchPublicClinics();
          if ('error' in result) {
            setError('공개된 병원 목록을 불러오는 데 실패했습니다.');
            setPublicClinics([]);
          } else {
            setPublicClinics(result.data || []);
          }
        } catch {
          setError('공개된 병원 목록을 불러오는 데 실패했습니다.');
          setPublicClinics([]);
        } finally {
          setIsSearchingClinics(false);
        }
      };
      fetchClinics();
    } else {
      setPublicClinics([]);
      setSelectedClinicId('');
    }
  }, [formData.role]);

  useEffect(() => {
    if (formData.confirmPassword) {
      if (formData.password === formData.confirmPassword) {
        setPasswordMatch({ message: '비밀번호가 일치합니다.', color: 'text-at-success' });
      } else {
        setPasswordMatch({ message: '비밀번호가 일치하지 않습니다.', color: 'text-at-error' });
      }
    } else {
      setPasswordMatch({ message: '', color: '' });
    }
  }, [formData.password, formData.confirmPassword]);

  // 대표원장일 때 치과 정보를 사용자 정보와 자동 동기화
  useEffect(() => {
    if (formData.role === 'owner') {
      setFormData(prev => ({
        ...prev,
        clinicOwnerName: prev.name,
        clinicEmail: prev.userId
      }));
    }
  }, [formData.role, formData.name, formData.userId]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => { // HTMLSelectElement 추가
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleGoToEmailProvider = () => {
    if (!formData.userId) return;

    const email = formData.userId;
    const domain = email.substring(email.lastIndexOf('@') + 1);

    const emailProviderLinks: { [key: string]: string } = {
      'gmail.com': 'https://mail.google.com',
      'naver.com': 'https://mail.naver.com',
      'hanmail.net': 'https://mail.daum.net',
      'daum.net': 'https://mail.daum.net',
      'kakao.com': 'https://mail.daum.net',
      'nate.com': 'https://mail.nate.com',
      'icloud.com': 'https://www.icloud.com/mail',
      'me.com': 'https://www.icloud.com/mail',
      'mac.com': 'https://www.icloud.com/mail',
      'outlook.com': 'https://outlook.live.com',
      'hotmail.com': 'https://outlook.live.com',
      'live.com': 'https://outlook.live.com',
    };

    const url = emailProviderLinks[domain];

    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }

  const validateForm = () => {
    const emailRegex = /^[\w-\.]+@([\w-]+\.)+[\w-]{2,4}$/;
    const phoneRegex = /^0[0-9]{1,2}[0-9]{3,4}[0-9]{4}$/;

    if (!emailRegex.test(formData.userId)) {
      setError('올바른 이메일 주소(아이디)를 입력해주세요.');
      return false;
    }
    if (!formData.name.trim()) {
      setError('이름을 입력해주세요.');
      return false;
    }
    if (formData.password.length < 6) {
      setError('비밀번호는 6글자 이상이어야 합니다.');
      return false;
    }
    if (formData.password !== formData.confirmPassword) {
      setError('비밀번호가 일치하지 않습니다.');
      return false;
    }
    if (!formData.role) {
      setError('직책을 선택해주세요.');
      return false;
    }

    // 개인정보 필수 입력 검증
    if (!formData.phone.trim()) {
      setError('전화번호를 입력해주세요.');
      return false;
    }
    if (!phoneRegex.test(formData.phone.replace(/-/g, ''))) {
      setError('올바른 전화번호 형식을 입력해주세요. (예: 010-1234-5678)');
      return false;
    }
    if (!formData.address.trim()) {
      setError('주소를 입력해주세요.');
      return false;
    }

    // 주민등록번호 검증
    const residentValidation = validateResidentNumberWithMessage(formData.residentNumber);
    if (!residentValidation.isValid) {
      setError(residentValidation.error || '주민등록번호가 유효하지 않습니다.');
      return false;
    }

    if (formData.role === 'owner') {
      if (!formData.clinicOwnerName.trim() || !formData.clinicName.trim() || !formData.clinicAddress.trim() || !formData.clinicPhone.trim() || !formData.clinicEmail.trim()) {
        setError('대표원장으로 가입 시, 모든 치과 정보를 입력해야 합니다.');
        return false;
      }
      if (!emailRegex.test(formData.clinicEmail)) {
        setError('치과 정보에 올바른 이메일 주소를 입력해주세요.');
        return false;
      }
    } else {
      if (!selectedClinicId) {
        setError('소속될 병원을 선택해주세요.');
        return false;
      }
    }

    return true;
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!validateForm()) return;

    setLoading(true);

    const supabase = getSupabase();
    if (!supabase) {
      setError('데이터베이스 연결에 실패했습니다.');
      setLoading(false);
      return;
    }

    try {
      console.log('[Signup] Starting signup process...');

      // 0. 주민등록번호 암호화
      console.log('[Signup] Encrypting resident registration number...');
      const encryptedResidentNumber = await encryptResidentNumber(formData.residentNumber);
      if (!encryptedResidentNumber) {
        throw new Error('주민등록번호 암호화에 실패했습니다.');
      }

      // 1. 인증 사용자 생성
      console.log('[Signup] Creating auth user...');
      const { data: authData, error: authError} = await supabase.auth.signUp({
        email: formData.userId,
        password: formData.password,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
        }
      });

      console.log('[Signup] Auth response:', { authData, authError });

      if (authError) {
        console.error('[Signup] Auth error:', authError);
        throw new Error(authError.message);
      }
      if (!authData.user) {
        console.error('[Signup] No user data returned');
        throw new Error('사용자 정보를 가져오지 못했습니다.');
      }

      const newUserId = authData.user.id;
      console.log('[Signup] User created with ID:', newUserId);

      if (formData.role === 'owner') {
        // 시나리오 A: 대표원장으로 신규 병원 생성
        // SECURITY DEFINER 함수를 사용하여 RLS 우회 및 트랜잭션 보장
        console.log('[Signup] Creating new clinic with owner via RPC...');
        const { data: result, error: rpcError } = await supabase.rpc('create_clinic_with_owner', {
          p_user_id: newUserId,
          p_clinic_name: formData.clinicName,
          p_owner_name: formData.clinicOwnerName,
          p_clinic_address: formData.clinicAddress,
          p_clinic_phone: formData.clinicPhone,
          p_clinic_email: formData.clinicEmail,
          p_user_name: formData.name,
          p_user_email: formData.userId,
          p_user_phone: formData.phone,
          p_user_address: formData.address,
          p_resident_number: encryptedResidentNumber,
        });

        console.log('[Signup] RPC result:', { result, rpcError });

        if (rpcError) {
          console.error('[Signup] RPC error:', rpcError);
          throw new Error('병원 정보 생성 실패: ' + rpcError.message);
        }

        if (!result || !result.success) {
          console.error('[Signup] RPC returned unsuccessful result');
          throw new Error('병원 정보 생성 실패: 알 수 없는 오류');
        }

        console.log('[Signup] Clinic and user created successfully:', result);

      } else {
        // 시나리오 B: 기존 병원에 가입 신청
        console.log('[Signup] Creating user profile for existing clinic...');
        const { error: userProfileError } = await (supabase.from('users') as any).insert({
          id: newUserId,
          clinic_id: selectedClinicId,
          email: formData.userId,
          name: formData.name,
          phone: formData.phone,
          address: formData.address,
          resident_registration_number: encryptedResidentNumber,
          role: formData.role,
          status: 'pending', // 승인 대기 상태
        });

        console.log('[Signup] User profile creation result:', { userProfileError });

        if (userProfileError) {
          console.error('[Signup] User profile creation error:', userProfileError);
          throw new Error('가입 신청 실패: ' + userProfileError.message);
        }
      }

      console.log('[Signup] Signup completed successfully!');

      // 역할별 성공 메시지 - 이메일 인증 강조
      setSuccess(`📧 이메일 인증이 필요합니다!\n\n${formData.userId}로 인증 이메일이 발송되었습니다.\n\n아래 버튼을 클릭하여 이메일함에서\n인증 링크를 확인해주세요.\n\n※ 이메일이 보이지 않으면 스팸함을 확인해주세요.`);

    } catch (error: unknown) {
      console.error('[Signup] Signup error:', error);
      const rawMessage = error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.';
      console.error('[Signup] Error message:', rawMessage);

      // Supabase Auth 에러 메시지를 사용자 친화적 메시지로 변환
      let errorMessage = rawMessage;
      if (rawMessage.includes('User already registered') || rawMessage.includes('already been registered')) {
        errorMessage = '이미 등록된 이메일 주소입니다. 로그인 페이지에서 로그인하거나 다른 이메일을 사용해주세요.';
      } else if (rawMessage.includes('Password should be at least')) {
        errorMessage = '비밀번호는 6글자 이상이어야 합니다.';
      } else if (rawMessage.includes('Unable to validate email address') || rawMessage.includes('invalid email')) {
        errorMessage = '유효하지 않은 이메일 주소입니다. 올바른 이메일 주소를 입력해주세요.';
      } else if (rawMessage.includes('Signups not allowed') || rawMessage.includes('signup_disabled')) {
        errorMessage = '현재 회원가입이 비활성화되어 있습니다. 관리자에게 문의해주세요.';
      } else if (rawMessage.includes('rate limit') || rawMessage.includes('too many requests')) {
        errorMessage = '너무 많은 요청이 있었습니다. 잠시 후 다시 시도해주세요.';
      }
      setError(errorMessage);
    } finally {
      console.log('[Signup] Finally block - setting loading to false');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <button
            onClick={onBackToLanding}
            className="inline-flex items-center text-at-accent hover:text-at-accent font-medium mb-4"
          >
            ← 돌아가기
          </button>
          <div className="flex items-center justify-center space-x-2 mb-4">
            <Image src="/icons/icon-192x192.png" alt="클리닉 매니저 로고" width={40} height={40} className="w-10 h-10 rounded-xl" />
            <h1 className="text-2xl font-bold text-at-text">클리닉 매니저</h1>
          </div>
          <h2 className="text-3xl font-bold text-at-text mb-2">회원가입</h2>
          <p className="text-at-text-secondary">치과 정보를 입력하여 계정을 생성하세요</p>
        </div>

        {/* Form */}
        <div className="bg-white p-8 rounded-2xl shadow-at-card border border-at-border">
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* 로그인 정보 */}
            <div className="pb-4 border-b border-at-border">
              <h3 className="text-lg font-semibold text-at-text mb-4">로그인 정보</h3>

              <div>
                <label htmlFor="userId" className="block text-sm font-medium text-at-text-secondary mb-1">
                  이메일 주소 (아이디) *
                </label>
                <input
                  type="email"
                  id="userId"
                  name="userId"
                  value={formData.userId}
                  onChange={handleInputChange}
                  className="w-full p-3 border border-at-border rounded-xl focus:ring-at-accent focus:border-at-accent"
                  placeholder="email@example.com"
                  disabled={loading}
                  autoComplete="off"
                />
              </div>

              <div>
                <label htmlFor="name" className="block text-sm font-medium text-at-text-secondary mb-1">
                  이름 *
                </label>
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={formData.name}
                  onChange={handleInputChange}
                  className="w-full p-3 border border-at-border rounded-xl focus:ring-at-accent focus:border-at-accent"
                  placeholder="홍길동"
                  required
                  disabled={loading}
                />
              </div>

              <div>
                <label htmlFor="phone" className="block text-sm font-medium text-at-text-secondary mb-1">
                  전화번호 *
                </label>
                <input
                  type="tel"
                  id="phone"
                  name="phone"
                  value={formData.phone}
                  onChange={(e) => {
                    const formatted = autoFormatPhoneNumber(e.target.value);
                    setFormData(prev => ({ ...prev, phone: formatted.value }));
                  }}
                  className="w-full p-3 border border-at-border rounded-xl focus:ring-at-accent focus:border-at-accent"
                  placeholder="010-1234-5678"
                  maxLength={13}
                  required
                  disabled={loading}
                />
              </div>

              <div>
                <label htmlFor="address" className="block text-sm font-medium text-at-text-secondary mb-1">
                  주소 *
                </label>
                <input
                  type="text"
                  id="address"
                  name="address"
                  value={formData.address}
                  onChange={handleInputChange}
                  className="w-full p-3 border border-at-border rounded-xl focus:ring-at-accent focus:border-at-accent"
                  placeholder="서울시 강남구 테헤란로 123"
                  required
                  disabled={loading}
                />
              </div>

              <div>
                <label htmlFor="residentNumber" className="block text-sm font-medium text-at-text-secondary mb-1">
                  주민등록번호 * <span className="text-xs text-at-text-weak">(암호화되어 저장됩니다)</span>
                </label>
                <input
                  type="text"
                  id="residentNumber"
                  name="residentNumber"
                  value={formData.residentNumber}
                  onChange={(e) => {
                    const formatted = autoFormatResidentNumber(e.target.value);
                    setFormData(prev => ({ ...prev, residentNumber: formatted.value }));
                  }}
                  className="w-full p-3 border border-at-border rounded-xl focus:ring-at-accent focus:border-at-accent"
                  placeholder="123456-7890123"
                  maxLength={14}
                  required
                  disabled={loading}
                />
                <p className="text-xs text-at-text-weak mt-1">
                  ※ 근로계약서 작성 시 필요합니다. 암호화되어 안전하게 보관됩니다.
                </p>
              </div>

              <div className="relative">
                <label htmlFor="password" className="block text-sm font-medium text-at-text-secondary mb-1">
                  비밀번호 *
                </label>
                <input
                  type={showPassword ? "text" : "password"}
                  id="password"
                  name="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  className="w-full p-3 border border-at-border rounded-xl focus:ring-at-accent focus:border-at-accent pr-10"
                  placeholder="6글자 이상"
                  disabled={loading}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 top-6 pr-3 flex items-center"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? (
                    <EyeSlashIcon className="h-5 w-5 text-at-text-weak" />
                  ) : (
                    <EyeIcon className="h-5 w-5 text-at-text-weak" />
                  )}
                </button>
              </div>

              <div className="relative">
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-at-text-secondary mb-1">
                  비밀번호 확인 *
                </label>
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  id="confirmPassword"
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleInputChange}
                  className="w-full p-3 border border-at-border rounded-xl focus:ring-at-accent focus:border-at-accent pr-10"
                  placeholder="비밀번호를 다시 입력하세요"
                  disabled={loading}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 top-6 pr-3 flex items-center"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                >
                  {showConfirmPassword ? (
                    <EyeSlashIcon className="h-5 w-5 text-at-text-weak" />
                  ) : (
                    <EyeIcon className="h-5 w-5 text-at-text-weak" />
                  )}
                </button>
              </div>
              {passwordMatch.message && (
                <p className={`text-sm ${passwordMatch.color}`}>
                  {passwordMatch.message}
                </p>
              )}

              <div>
                <label htmlFor="role" className="block text-sm font-medium text-at-text-secondary mb-1">
                  직책 *
                </label>
                <select
                  id="role"
                  name="role"
                  value={formData.role}
                  onChange={handleInputChange}
                  className="w-full p-3 border border-at-border rounded-xl focus:ring-at-accent focus:border-at-accent bg-white"
                  disabled={loading}
                >
                  <option value="owner">대표원장</option>
                  <option value="vice_director">부원장</option>
                  <option value="manager">실장</option>
                  <option value="team_leader">진료팀장</option>
                  <option value="staff">진료팀원</option>
                </select>
              </div>
            </div>

            {/* 역할에 따른 분기 UI */}
            {formData.role === 'owner' ? (
              // 대표원장 선택 시: 신규 치과 정보 입력
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-at-text mb-4">치과 정보</h3>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="clinicOwnerName" className="block text-sm font-medium text-at-text-secondary mb-1">
                      원장 이름 *
                    </label>
                    <input
                      type="text"
                      id="clinicOwnerName"
                      name="clinicOwnerName"
                      value={formData.clinicOwnerName}
                      onChange={handleInputChange}
                      className={`w-full p-3 border rounded-xl ${
                        formData.role === 'owner'
                          ? 'bg-at-surface-alt border-at-border text-at-text-secondary cursor-not-allowed'
                          : 'border-at-border focus:ring-at-accent focus:border-at-accent'
                      }`}
                      placeholder="홍길동"
                      disabled={loading || formData.role === 'owner'}
                      readOnly={formData.role === 'owner'}
                    />
                    {formData.role === 'owner' && (
                      <p className="mt-1 text-xs text-at-accent">
                        ℹ️ 대표원장 이름이 자동으로 사용됩니다
                      </p>
                    )}
                  </div>

                  <div>
                    <label htmlFor="clinicName" className="block text-sm font-medium text-at-text-secondary mb-1">
                      치과명 *
                    </label>
                    <input
                      type="text"
                      id="clinicName"
                      name="clinicName"
                      value={formData.clinicName}
                      onChange={handleInputChange}
                      className="w-full p-3 border border-at-border rounded-xl focus:ring-at-accent focus:border-at-accent"
                      placeholder="○○치과"
                      disabled={loading}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="clinicAddress" className="block text-sm font-medium text-at-text-secondary mb-1">
                    치과 주소 *
                  </label>
                  <input
                    type="text"
                    id="clinicAddress"
                    name="clinicAddress"
                    value={formData.clinicAddress}
                    onChange={handleInputChange}
                    className="w-full p-3 border border-at-border rounded-xl focus:ring-at-accent focus:border-at-accent"
                    placeholder="서울시 강남구 테헤란로 123 4층"
                    disabled={loading}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="clinicPhone" className="block text-sm font-medium text-at-text-secondary mb-1">
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
                      className="w-full p-3 border border-at-border rounded-xl focus:ring-at-accent focus:border-at-accent"
                      placeholder="02-1234-5678"
                      maxLength={13}
                      disabled={loading}
                    />
                  </div>

                  <div>
                    <label htmlFor="clinicEmail" className="block text-sm font-medium text-at-text-secondary mb-1">
                      이메일 주소 *
                    </label>
                    <input
                      type="email"
                      id="clinicEmail"
                      name="clinicEmail"
                      value={formData.clinicEmail}
                      onChange={handleInputChange}
                      className={`w-full p-3 border rounded-xl ${
                        formData.role === 'owner'
                          ? 'bg-at-surface-alt border-at-border text-at-text-secondary cursor-not-allowed'
                          : 'border-at-border focus:ring-at-accent focus:border-at-accent'
                      }`}
                      placeholder="clinic@example.com"
                      disabled={loading || formData.role === 'owner'}
                      readOnly={formData.role === 'owner'}
                    />
                    {formData.role === 'owner' && (
                      <p className="mt-1 text-xs text-at-accent">
                        ℹ️ 대표원장 이메일이 자동으로 사용됩니다
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              // 그 외 직책 선택 시: 기존 치과 검색
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-at-text mb-4">소속 병원 선택</h3>
                <div>
                  <label htmlFor="clinicSearch" className="block text-sm font-medium text-at-text-secondary mb-1">
                    병원 검색 *
                  </label>
                  <div className="relative">
                    <MagnifyingGlassIcon className="absolute left-3 top-3 h-5 w-5 text-at-text-weak z-10" />
                    <input
                      type="text"
                      id="clinicSearch"
                      placeholder="병원 이름 또는 주소로 검색..."
                      value={clinicSearchQuery}
                      onChange={(e) => {
                        setClinicSearchQuery(e.target.value)
                        setShowClinicSearchResults(e.target.value.length > 0)
                      }}
                      onFocus={() => setShowClinicSearchResults(clinicSearchQuery.length > 0)}
                      onBlur={() => setTimeout(() => setShowClinicSearchResults(false), 200)}
                      className="w-full pl-10 pr-4 py-3 border border-at-border rounded-xl focus:ring-at-accent focus:border-at-accent"
                      disabled={loading || isSearchingClinics}
                    />

                    {/* 검색 결과 드롭다운 */}
                    {showClinicSearchResults && (
                      <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-at-border rounded-xl shadow-lg max-h-60 overflow-y-auto z-50">
                        {isSearchingClinics ? (
                          <div className="p-4 text-center text-sm text-at-text-weak">
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
                                  className="w-full p-3 hover:bg-at-accent-light text-left transition-colors border-b border-at-border last:border-b-0"
                                >
                                  <div>
                                    <p className="font-medium text-at-text">{clinic.name}</p>
                                    <p className="text-sm text-at-text-weak mt-1">{clinic.address}</p>
                                    {clinic.phone && (
                                      <p className="text-xs text-at-text-weak mt-1">{clinic.phone}</p>
                                    )}
                                  </div>
                                </button>
                              ))}
                            {clinicSearchQuery && publicClinics.filter(clinic =>
                              clinic.name.toLowerCase().includes(clinicSearchQuery.toLowerCase()) ||
                              clinic.address.toLowerCase().includes(clinicSearchQuery.toLowerCase())
                            ).length === 0 && (
                              <div className="p-4 text-center text-sm text-at-text-weak">
                                검색 결과가 없습니다
                              </div>
                            )}
                            {!clinicSearchQuery && publicClinics.length === 0 && (
                              <div className="p-4 text-center text-sm text-at-text-weak">
                                등록 가능한 병원이 없습니다
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {/* 선택된 병원 표시 */}
                  {selectedClinicId && (
                    <div className="mt-2 p-2 bg-at-accent-light rounded-xl">
                      <p className="text-sm text-at-accent">
                        선택된 병원: <strong>{selectedClinicName}</strong>
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            {error && (
              <div className="bg-at-error-bg border border-red-200 text-at-error px-4 py-3 rounded-xl text-sm">
                {error}
              </div>
            )}

            {success && (
              <div className="bg-gradient-to-r from-green-50 to-emerald-50 border-2 border-green-300 rounded-xl p-6 shadow-at-card">
                <div className="flex items-start space-x-3 mb-4">
                  <div className="flex-shrink-0">
                    <svg className="h-6 w-6 text-at-success" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <div className="flex-1">
                    <p className="text-green-800 font-semibold whitespace-pre-line leading-relaxed">
                      {success}
                    </p>
                  </div>
                </div>
                <div className="space-y-3">
                  <button
                    onClick={handleGoToEmailProvider}
                    className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-xl transition-colors shadow-at-card hover:shadow-at-card flex items-center justify-center space-x-2"
                  >
                    <span>📧</span>
                    <span>이메일 인증하러 가기</span>
                  </button>
                  <button
                    onClick={() => onSignupSuccess({
                      email: formData.userId,
                      name: formData.name,
                      role: formData.role
                    })}
                    className="w-full bg-at-border hover:bg-at-border text-at-text-secondary font-medium py-2.5 px-4 rounded-xl transition-colors"
                  >
                    나중에 하기
                  </button>
                </div>
              </div>
            )}

            {!success && (
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-at-accent hover:bg-at-accent-hover disabled:bg-blue-300 text-white font-bold py-3 px-4 rounded-xl transition-colors"
              >
                {loading ? '가입 중...' : '회원가입 완료'}
              </button>
            )}
          </form>

          <div className="mt-6 text-center">
            <p className="text-at-text-secondary">
              이미 계정이 있으신가요?{' '}
              <button
                onClick={onShowLogin}
                className="text-at-accent hover:text-at-accent font-medium"
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