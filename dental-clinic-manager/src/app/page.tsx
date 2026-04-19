import AuthFlow from '@/components/Landing/shared/AuthFlow'
import RoleSelector from '@/components/Landing/RoleSelector'

export const dynamic = 'force-dynamic'

export default function RootPage() {
  return (
    <AuthFlow>
      {({ onShowLogin, onShowSignup }) => (
        <RoleSelector onShowLogin={onShowLogin} onShowSignup={onShowSignup} />
      )}
    </AuthFlow>
  )
}