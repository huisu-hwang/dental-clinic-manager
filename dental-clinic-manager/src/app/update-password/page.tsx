'use client'

import { useState, useEffect } from 'react'
import type { Session, AuthChangeEvent } from '@supabase/supabase-js'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [isRecoveryMode, setIsRecoveryMode] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const router = useRouter()

  useEffect(() => {
    const supabase = createClient();
    if (!supabase) {
      setError('데이터베이스 연결에 실패했습니다.');
      setCheckingAuth(false);
      return;
    }

    console.log('[PasswordReset] 페이지 로드됨');
    console.log('[PasswordReset] URL:', window.location.href);
    console.log('[PasswordReset] Hash:', window.location.hash);

    let recoveryDetected = false;

    // 1. URL 해시에서 토큰 확인
    const hash = window.location.hash;
    if (hash) {
      const hashParams = new URLSearchParams(hash.substring(1));
      const accessToken = hashParams.get('access_token');
      const type = hashParams.get('type');

      if (accessToken && type === 'recovery') {
        console.log('[PasswordReset] Recovery 토큰 감지');
        recoveryDetected = true;
        setIsRecoveryMode(true);
        setCheckingAuth(false);
      }
    }

    // 2. 현재 세션 확인
    supabase.auth.getSession().then(({ data: { session } }: { data: { session: Session | null } }) => {
      if (session) {
        console.log('[PasswordReset] 활성 세션 감지');
        setIsRecoveryMode(true);
      }
      if (!recoveryDetected) {
        setCheckingAuth(false);
      }
    });

    // 3. Auth 상태 변경 감지
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
      console.log('[PasswordReset] Auth 이벤트:', event);

      if (event === 'PASSWORD_RECOVERY' || (event === 'SIGNED_IN' && session)) {
        console.log('[PasswordReset] Recovery 모드 활성화');
        setIsRecoveryMode(true);
        setCheckingAuth(false);
      }
    });

    // 4. 타임아웃: 5초 후에도 토큰이 없으면 체크 종료
    const timeout = setTimeout(() => {
      if (!recoveryDetected) {
        console.log('[PasswordReset] 토큰 감지 타임아웃');
        setCheckingAuth(false);
      }
    }, 5000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setMessage('')
    setLoading(true)

    if (password.length < 6) {
        setError('비밀번호는 6자 이상이어야 합니다.')
        setLoading(false)
        return
    }

    if (password !== confirmPassword) {
        setError('비밀번호가 일치하지 않습니다.')
        setLoading(false)
        return
    }

    const supabase = createClient()
    if (!supabase) {
        setError('데이터베이스 연결에 실패했습니다.')
        setLoading(false)
        return
    }

    // 세션 확인 (필수)
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) {
        console.error('[PasswordReset] 세션 없음 - updateUser 호출 불가')
        setError('세션이 만료되었거나 유효하지 않습니다. 비밀번호 재설정 이메일을 다시 요청해주세요.')
        setLoading(false)
        return
    }

    console.log('[PasswordReset] 세션 확인됨, 비밀번호 업데이트 시도:', session.user.id)

    const { error: updateError } = await supabase.auth.updateUser({ password })

    if (updateError) {
      console.error('비밀번호 업데이트 오류:', updateError)
      // 에러 메시지 상세화
      if (updateError.message.includes('should be different')) {
         setError('새 비밀번호는 이전 비밀번호와 달라야 합니다.')
      } else {
         setError(`비밀번호 업데이트 실패: ${updateError.message}`)
      }
    } else {
      setMessage('비밀번호가 성공적으로 변경되었습니다. 잠시 후 대시보드로 이동합니다.')

      setTimeout(() => {
        router.push('/dashboard') // 대시보드 페이지로 리디렉션
      }, 2000)
    }

    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md mx-auto">
        <div className="text-center mb-8">
            <h2 className="text-3xl font-bold text-slate-800 mb-2">새 비밀번호 설정</h2>
            <p className="text-slate-600">새로운 비밀번호를 입력하세요.</p>
        </div>

        <div className="bg-white p-8 rounded-lg shadow-md border border-slate-200">
          {checkingAuth ? (
            <div className="text-center space-y-4">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p className="text-slate-600">비밀번호 재설정 토큰을 확인하는 중...</p>
            </div>
          ) : !isRecoveryMode ? (
            <div className="text-center space-y-4">
              <div className="p-4 bg-red-50 border border-red-200 rounded-md text-left">
                <p className="text-sm text-red-800 font-medium mb-2">❌ 유효한 재설정 토큰이 없습니다</p>
                <p className="text-sm text-red-700 mb-2">
                  이 페이지는 <strong>비밀번호 재설정 이메일의 링크를 통해서만</strong> 접근할 수 있습니다.
                </p>
                <ul className="text-sm text-red-700 mt-2 ml-4 list-disc space-y-1">
                  <li>받은 편지함에서 비밀번호 재설정 이메일을 확인하세요</li>
                  <li>이메일의 <strong>&quot;비밀번호 재설정&quot;</strong> 버튼을 클릭하세요</li>
                  <li>브라우저 주소창에 직접 입력하면 작동하지 않습니다</li>
                  <li>링크가 만료되었을 수 있습니다 (24시간 유효)</li>
                </ul>
                <button
                  onClick={() => router.push('/')}
                  className="mt-4 w-full bg-red-600 hover:bg-red-700 text-white font-medium py-2 px-4 rounded-md transition-colors text-sm"
                >
                  로그인 페이지로 돌아가기
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="password" className="block text-sm font-medium text-slate-700 mb-1">
                  새 비밀번호
                </label>
                <input
                  type="password"
                  id="password"
                  name="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full p-3 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  placeholder="6자 이상 입력하세요"
                  required
                  disabled={loading || !!message}
                />
              </div>

              <div>
                <label htmlFor="confirmPassword" className="block text-sm font-medium text-slate-700 mb-1">
                  비밀번호 확인
                </label>
                <input
                  type="password"
                  id="confirmPassword"
                  name="confirmPassword"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full p-3 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  placeholder="비밀번호를 다시 입력하세요"
                  required
                  disabled={loading || !!message}
                />
              </div>

              {message && (
                <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-md text-sm">
                  {message}
                </div>
              )}

              {error && (
                <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-md text-sm">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !!message || !isRecoveryMode}
                className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-300 text-white font-bold py-3 px-4 rounded-md transition-colors"
              >
                {loading ? '변경 중...' : '비밀번호 변경'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
