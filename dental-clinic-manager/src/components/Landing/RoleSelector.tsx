'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useVisitorRole, type VisitorRole } from './shared/useVisitorRole'
import LandingHeader from './shared/LandingHeader'

interface RoleSelectorProps {
  onShowLogin: () => void
  onShowSignup: () => void
}

interface RoleCardProps {
  role: VisitorRole
  emoji: string
  title: string
  tagline: string
  accent: 'owner' | 'staff'
  onSelect: (role: VisitorRole) => void
}

function RoleCard({ role, emoji, title, tagline, accent, onSelect }: RoleCardProps) {
  const accentClasses = accent === 'owner'
    ? 'from-indigo-50 to-white border-indigo-200 hover:border-indigo-400 hover:shadow-indigo-200/50'
    : 'from-cyan-50 to-white border-cyan-200 hover:border-cyan-400 hover:shadow-cyan-200/50'
  const labelClasses = accent === 'owner'
    ? 'text-indigo-600'
    : 'text-cyan-700'

  return (
    <button
      onClick={() => onSelect(role)}
      className={`group text-left bg-gradient-to-b ${accentClasses} border-2 rounded-3xl p-8 sm:p-10 transition-all hover:-translate-y-1 hover:shadow-2xl`}
    >
      <div className="text-5xl mb-4">{emoji}</div>
      <div className={`text-xs font-bold tracking-wider uppercase mb-2 ${labelClasses}`}>
        {accent === 'owner' ? 'FOR OWNERS' : 'FOR STAFF'}
      </div>
      <div className="text-2xl sm:text-3xl font-bold text-at-text mb-3">{title}</div>
      <div className="text-at-text-secondary leading-relaxed">{tagline}</div>
      <div className={`mt-6 inline-flex items-center gap-2 font-semibold ${labelClasses} group-hover:gap-3 transition-all`}>
        페이지 보기 <span>→</span>
      </div>
    </button>
  )
}

export default function RoleSelector({ onShowLogin, onShowSignup }: RoleSelectorProps) {
  const router = useRouter()
  const { role, setRole, clearRole, hydrated } = useVisitorRole()

  // 저장된 역할이 있으면 자동 리디렉션
  useEffect(() => {
    if (!hydrated) return
    if (role === 'owner') {
      router.replace('/owner')
    } else if (role === 'staff') {
      router.replace('/staff')
    }
  }, [hydrated, role, router])

  const handleSelect = (selected: VisitorRole) => {
    setRole(selected)
    router.push(selected === 'owner' ? '/owner' : '/staff')
  }

  // 하이드레이션 완료 전이거나 리디렉션 중일 때 플래시 방지
  if (!hydrated || role) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-at-accent" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-white">
      <LandingHeader variant="light" onShowLogin={onShowLogin} onShowSignup={onShowSignup} />

      <main className="pt-32 pb-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h1 className="text-3xl sm:text-5xl font-bold text-at-text leading-tight mb-4">
              먼저 알려주세요 —{' '}
              <span className="bg-gradient-to-r from-indigo-600 to-cyan-600 bg-clip-text text-transparent">
                누구신가요?
              </span>
            </h1>
            <p className="text-lg text-at-text-secondary">
              역할에 맞는 페이지로 안내해드립니다
            </p>
          </div>

          <div className="grid sm:grid-cols-2 gap-6">
            <RoleCard
              role="owner"
              emoji="👨‍⚕️"
              title="대표원장"
              tagline="병원 경영·매출 중심 뷰. 실장을 매출에만 집중하게 하는 시스템."
              accent="owner"
              onSelect={handleSelect}
            />
            <RoleCard
              role="staff"
              emoji="🧑‍💼"
              title="실장 · 직원"
              tagline="출퇴근·스케쥴·연차까지 간단하게 끝내고 정시 퇴근하는 업무 앱."
              accent="staff"
              onSelect={handleSelect}
            />
          </div>

          <div className="text-center mt-10 text-sm text-at-text-weak">
            선택한 페이지는 다음 방문 시 자동으로 열립니다 ·{' '}
            <button
              onClick={clearRole}
              className="underline hover:text-at-text-secondary"
            >
              선택 기억 해제
            </button>
          </div>
        </div>
      </main>
    </div>
  )
}
