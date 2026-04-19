'use client'

import { useEffect } from 'react'
import AuthFlow from '@/components/Landing/shared/AuthFlow'
import StaffLanding from '@/components/Landing/StaffLanding'
import { useVisitorRole } from '@/components/Landing/shared/useVisitorRole'

export default function StaffPage() {
  const { setRole, hydrated, role } = useVisitorRole()

  useEffect(() => {
    if (!hydrated) return
    if (role !== 'staff') {
      setRole('staff')
    }
  }, [hydrated, role, setRole])

  return (
    <AuthFlow>
      {({ onShowLogin, onShowSignup }) => (
        <StaffLanding onShowLogin={onShowLogin} onShowSignup={onShowSignup} />
      )}
    </AuthFlow>
  )
}
