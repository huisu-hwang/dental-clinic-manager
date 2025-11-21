'use client'

import { useEffect } from 'react'
import { useRouter, usePathname } from 'next/navigation'

export default function PasswordResetHandler() {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    // update-password 페이지에 있으면 처리하지 않음
    if (pathname === '/update-password') {
      return
    }

    // 1. PKCE Flow: 쿼리 파라미터에서 code 확인 (현재 Supabase 기본 설정)
    const searchParams = new URLSearchParams(window.location.search)
    const code = searchParams.get('code')

    if (code) {
      console.log('[PasswordResetHandler] PKCE code 감지 - /update-password로 리다이렉트')
      // 쿼리 파라미터를 그대로 전달하여 update-password 페이지로 이동
      router.push('/update-password' + window.location.search)
      return
    }

    // 2. Implicit Flow (레거시): URL 해시에서 access_token 확인
    const hash = window.location.hash
    if (hash) {
      const hashParams = new URLSearchParams(hash.substring(1))
      const type = hashParams.get('type')
      const accessToken = hashParams.get('access_token')

      // recovery 타입이고 access_token이 있으면 비밀번호 재설정 페이지로 리다이렉트
      if (type === 'recovery' && accessToken) {
        console.log('[PasswordResetHandler] Implicit flow 토큰 감지 - /update-password로 리다이렉트')
        router.push('/update-password' + hash)
      }
    }
  }, [pathname, router])

  return null
}
