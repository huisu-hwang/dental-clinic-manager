'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { getSupabase } from '@/lib/supabase'

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [isRecoveryMode, setIsRecoveryMode] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) {
      setError('데이터베이스 연결에 실패했습니다.');
      return;
    }

    // 전체 URL 로깅
    console.log('전체 URL:', window.location.href);
    console.log('Hash:', window.location.hash);
    console.log('Search:', window.location.search);

    // URL에서 토큰 확인 (다양한 형식 지원)
    const hash = window.location.hash;
    const searchParams = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(hash.substring(1));
    
    const hasAccessToken = hashParams.has('access_token') || searchParams.has('access_token');
    const hasToken = hashParams.has('token') || searchParams.has('token');
    const isRecoveryType = hash.includes('type=recovery') || searchParams.get('type') === 'recovery';
    const hasRefreshToken = hashParams.has('refresh_token') || searchParams.has('refresh_token');
    
    console.log('URL 파라미터 확인:', { 
      hasAccessToken, 
      hasToken,
      isRecoveryType, 
      hasRefreshToken,
      hash, 
      search: window.location.search 
    });

    // 토큰이 있으면 복구 모드로 활성화
    if (hasAccessToken || hasToken || isRecoveryType || hasRefreshToken) {
      console.log('비밀번호 복구 토큰 감지. 복구 모드를 활성화합니다.');
      setIsRecoveryMode(true);
    }

    // 초기 세션 확인
    supabase.auth.getSession().then(({ data: { session }, error }) => {
      console.log('초기 세션 확인:', { hasSession: !!session, error });
      if (session) {
        console.log('활성 세션 감지. 복구 모드를 활성화합니다.');
        setIsRecoveryMode(true);
      } else if (!hasAccessToken && !hasToken && !isRecoveryType) {
        // 토큰도 없고 세션도 없으면 에러 표시
        console.warn('토큰과 세션이 모두 없습니다.');
      }
    });

    // PASSWORD_RECOVERY 이벤트가 발생하면, Supabase가 자동으로 세션을 처리하고
    // 사용자는 인증된 상태가 됩니다. 이 상태에서 비밀번호를 업데이트할 수 있습니다.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('Auth 상태 변경:', { event, hasSession: !!session });
      if (event === 'PASSWORD_RECOVERY') {
        console.log('PASSWORD_RECOVERY 이벤트 감지. 복구 모드를 활성화합니다.');
        setIsRecoveryMode(true);
      } else if (event === 'SIGNED_IN' && session) {
        console.log('SIGNED_IN 이벤트 감지. 복구 모드를 활성화합니다.');
        setIsRecoveryMode(true);
      }
    });

    return () => {
      subscription.unsubscribe();
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

    const supabase = getSupabase()
    if (!supabase) {
        setError('데이터베이스 연결에 실패했습니다.')
        setLoading(false)
        return
    }

    const { error: updateError } = await supabase.auth.updateUser({ password })

    if (updateError) {
      console.error('비밀번호 업데이트 오류:', updateError)
      setError('비밀번호 업데이트에 실패했습니다. 다시 시도해주세요.')
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
          {!isRecoveryMode && !error ? (
            <div className="text-center space-y-4">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
              <p className="text-slate-600">비밀번호 재설정 토큰을 확인하는 중...</p>
              <div className="mt-6 p-4 bg-yellow-50 border border-yellow-200 rounded-md text-left">
                <p className="text-sm text-yellow-800 font-medium mb-2">⚠️ 토큰이 감지되지 않았습니다</p>
                <p className="text-sm text-yellow-700">
                  이 페이지는 <strong>비밀번호 재설정 이메일의 링크를 클릭</strong>해야만 접근할 수 있습니다.
                </p>
                <ul className="text-sm text-yellow-700 mt-2 ml-4 list-disc">
                  <li>받은 편지함에서 비밀번호 재설정 이메일을 확인하세요</li>
                  <li>이메일에 있는 <strong>&quot;비밀번호 재설정&quot;</strong> 링크를 클릭하세요</li>
                  <li>브라우저 주소창에 직접 입력하면 작동하지 않습니다</li>
                </ul>
                <button
                  onClick={() => router.push('/')}
                  className="mt-4 w-full bg-yellow-600 hover:bg-yellow-700 text-white font-medium py-2 px-4 rounded-md transition-colors text-sm"
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
