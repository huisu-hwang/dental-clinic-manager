'use client'

import { useEffect } from 'react'
import AuthFlow from '@/components/Landing/shared/AuthFlow'
import OwnerLanding from '@/components/Landing/OwnerLanding'
import { useVisitorRole } from '@/components/Landing/shared/useVisitorRole'

export default function RootPage() {
  const { setRole, hydrated, role } = useVisitorRole()

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
