'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function RedirectPage() {
  const router = useRouter()
  useEffect(() => {
    router.replace('/dashboard?tab=investment&sub=connect')
  }, [router])
  return null
}
