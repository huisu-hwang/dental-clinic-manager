'use client'

import { useEffect } from 'react'
import AuthFlow from '@/components/Landing/shared/AuthFlow'
import OwnerLanding from '@/components/Landing/OwnerLanding'
import { useVisitorRole } from '@/components/Landing/shared/useVisitorRole'

export default function OwnerPage() {
  const { setRole, hydrated, role } = useVisitorRole()

  // 첫 방문 시 localStorage에 저장
  useEffect(() => {
    if (!hydrated) return
    if (role !== 'owner') {
      setRole('owner')
    }
  }, [hydrated, role, setRole])

  return (
    <AuthFlow>
      <OwnerLanding />
    </AuthFlow>
  )
}
