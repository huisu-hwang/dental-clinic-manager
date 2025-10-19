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

    // URL 해시에서 recovery 토큰 확인
    const hash = window.location.hash
    if (hash) {
      const hashParams = new URLSearchParams(hash.substring(1))
      const type = hashParams.get('type')
      const accessToken = hashParams.get('access_token')

      // recovery 타입이고 access_token이 있으면 비밀번호 재설정 페이지로 리다이렉트
      if (type === 'recovery' && accessToken) {
        console.log('비밀번호 재설정 토큰 감지 - /update-password로 리다이렉트')
        router.push('/update-password' + hash)
      }
    }
  }, [pathname, router])

  return null
}
