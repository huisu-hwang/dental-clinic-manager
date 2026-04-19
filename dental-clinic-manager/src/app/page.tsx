'use client'

import AuthFlow from '@/components/Landing/shared/AuthFlow'
import RoleSelector from '@/components/Landing/RoleSelector'

export default function RootPage() {
  return (
    <AuthFlow>
      {({ onShowLogin, onShowSignup }) => (
        <RoleSelector onShowLogin={onShowLogin} onShowSignup={onShowSignup} />
      )}
    </AuthFlow>
  )
}