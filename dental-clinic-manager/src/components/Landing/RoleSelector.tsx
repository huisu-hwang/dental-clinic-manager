'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  ArrowRightIcon,
  SparklesIcon,
  ChartBarIcon,
  Cog6ToothIcon,
  CurrencyDollarIcon,
  QrCodeIcon,
  CalendarDaysIcon,
  ClockIcon,
} from '@heroicons/react/24/outline'
import { useVisitorRole, type VisitorRole } from './shared/useVisitorRole'
import { useAuthFlow } from './shared/AuthFlow'
import LandingHeader from './shared/LandingHeader'

type Accent = 'owner' | 'staff'

interface RoleCardProps {
  role: VisitorRole
  emoji: string
  label: string
  title: string
  tagline: string
  tags: { icon: React.ComponentType<{ className?: string }>; text: string }[]
  accent: Accent
  onSelect: (role: VisitorRole) => void
}

function RoleCard({ role, emoji, label, title, tagline, tags, accent, onSelect }: RoleCardProps) {
  const cardRef = useRef<HTMLButtonElement>(null)
  const [tilt, setTilt] = useState({ x: 0, y: 0 })
  const [spot, setSpot] = useState({ x: 50, y: 50 })
  const [hovering, setHovering] = useState(false)

  // 3D 틸트 + spotlight 좌표
  const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (!cardRef.current) return
    const rect = cardRef.current.getBoundingClientRect()
    const xPct = ((e.clientX - rect.left) / rect.width) * 100
    const yPct = ((e.clientY - rect.top) / rect.height) * 100
    setSpot({ x: xPct, y: yPct })
    setTilt({ x: -((yPct / 100) - 0.5) * 4, y: ((xPct / 100) - 0.5) * 4 })
  }
  const handleMouseEnter = () => setHovering(true)
  const handleMouseLeave = () => {
    setHovering(false)
    setTilt({ x: 0, y: 0 })
  }

  const accentGradient = accent === 'owner'
    ? 'from-indigo-500 via-violet-500 to-purple-600'
    : 'from-rose-500 via-pink-500 to-cyan-500'
  const accentSoftBg = accent === 'owner'
    ? 'from-indigo-50/90 via-white to-violet-50/60'
    : 'from-rose-50/90 via-white to-cyan-50/60'
  const accentRing = accent === 'owner'
    ? 'ring-indigo-200/60 hover:ring-indigo-300/80'
    : 'ring-rose-200/60 hover:ring-rose-300/80'
  const labelColor = accent === 'owner' ? 'text-indigo-600' : 'text-rose-600'
  const ctaGradient = accent === 'owner'
    ? 'from-indigo-600 to-violet-600'
    : 'from-rose-500 to-cyan-500'
  const spotlightColor = accent === 'owner'
    ? 'rgba(165, 180, 252, 0.35)' // indigo-300
    : 'rgba(253, 164, 175, 0.35)' // rose-300
  const borderGlowColor = accent === 'owner'
    ? 'rgba(99, 102, 241, 0.5)' // indigo-500
    : 'rgba(244, 63, 94, 0.5)' // rose-500

  return (
    <button
      ref={cardRef}
      onClick={() => onSelect(role)}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      style={{
        transform: `perspective(1200px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
        transition: 'transform 220ms ease-out, box-shadow 400ms ease-out',
      }}
      className={`group relative text-left rounded-[2rem] p-8 sm:p-10 ring-1 ${accentRing}
        bg-gradient-to-br ${accentSoftBg}
        backdrop-blur-xl shadow-xl shadow-slate-200/40
        hover:shadow-2xl hover:-translate-y-1
        transition-[transform] duration-500 overflow-hidden`}
    >
      {/* 마우스 따라다니는 밝은 spotlight (어두워지지 않음) */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-[2rem] transition-opacity duration-500"
        style={{
          opacity: hovering ? 1 : 0,
          background: `radial-gradient(420px circle at ${spot.x}% ${spot.y}%, ${spotlightColor}, transparent 55%)`,
        }}
      />

      {/* 외곽 border glow — 호버 시 은은한 accent 링 (마우스 위치 방향으로 포커스) */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-px rounded-[2rem] transition-opacity duration-500"
        style={{
          opacity: hovering ? 1 : 0,
          background: `radial-gradient(600px circle at ${spot.x}% ${spot.y}%, ${borderGlowColor}, transparent 40%)`,
          WebkitMaskImage: 'linear-gradient(black, black)',
          maskImage: 'linear-gradient(black, black)',
          filter: 'blur(18px)',
        }}
      />

      {/* Eyebrow 라벨 */}
      <div className="relative flex items-center gap-2 mb-6">
        <span className={`h-1.5 w-1.5 rounded-full bg-gradient-to-r ${accentGradient}`} />
        <span className={`text-[11px] font-bold tracking-[0.18em] uppercase ${labelColor}`}>{label}</span>
      </div>

      {/* 이모지 + 아이콘 버블 */}
      <div className="relative mb-6 flex items-end gap-3">
        <div className={`relative flex h-20 w-20 items-center justify-center rounded-2xl
          bg-gradient-to-br ${accentGradient} shadow-lg shadow-slate-900/10
          transition-transform duration-500 group-hover:scale-105 group-hover:rotate-[-3deg]`}>
          <span className="text-4xl">{emoji}</span>
          {/* 반짝이 */}
          <span className="pointer-events-none absolute -top-1 -right-1 text-white/80 text-xs animate-pulse">
            <SparklesIcon className="h-4 w-4" />
          </span>
        </div>
      </div>

      {/* 타이틀 + 태그라인 */}
      <div className="relative mb-7">
        <div className="text-3xl sm:text-4xl font-extrabold tracking-tight text-slate-900 leading-tight mb-3">
          {title}
        </div>
        <p className="text-[15px] sm:text-base text-slate-600 leading-relaxed">{tagline}</p>
      </div>

      {/* 기능 태그 */}
      <div className="relative flex flex-wrap gap-1.5 mb-8">
        {tags.map(({ icon: Icon, text }) => (
          <span
            key={text}
            className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/80
              bg-white/70 backdrop-blur px-3 py-1 text-xs font-medium text-slate-700"
          >
            <Icon className="h-3.5 w-3.5 text-slate-500" />
            {text}
          </span>
        ))}
      </div>

      {/* CTA bar — 호버 시 텍스트 슬라이드 */}
      <div
        className={`relative rounded-2xl bg-gradient-to-r ${ctaGradient}
          px-5 py-3.5 flex items-center justify-between text-white font-semibold
          shadow-md shadow-slate-900/10 overflow-hidden`}
      >
        <span className="relative z-10">페이지로 이동</span>
        <span className="relative z-10 inline-flex items-center gap-2 text-sm opacity-90 group-hover:gap-3 transition-all">
          <ArrowRightIcon className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1" />
        </span>
        {/* 내부 shimmer */}
        <span
          className="absolute inset-y-0 -left-full w-1/3 bg-white/30 skew-x-[-20deg]
            group-hover:left-[120%] transition-all duration-700"
        />
      </div>
    </button>
  )
}

export default function RoleSelector() {
  const router = useRouter()
  const { onShowLogin, onShowSignup } = useAuthFlow()
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
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-slate-400" />
      </div>
    )
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-50">
      {/* 메쉬 그라데이션 배경 */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-indigo-50/80 via-white to-rose-50/60" />
      <div className="pointer-events-none absolute -top-32 -left-32 h-[32rem] w-[32rem] rounded-full bg-indigo-300/30 blur-3xl animate-pulse-slow" />
      <div className="pointer-events-none absolute top-1/3 -right-40 h-[28rem] w-[28rem] rounded-full bg-rose-300/30 blur-3xl animate-pulse-slow" style={{ animationDelay: '2s' }} />
      <div className="pointer-events-none absolute bottom-0 left-1/4 h-[24rem] w-[24rem] rounded-full bg-cyan-200/30 blur-3xl animate-pulse-slow" style={{ animationDelay: '4s' }} />

      {/* 그리드 패턴 */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage: `linear-gradient(rgba(15,23,42,0.6) 1px, transparent 1px),
                           linear-gradient(90deg, rgba(15,23,42,0.6) 1px, transparent 1px)`,
          backgroundSize: '48px 48px',
        }}
      />

      {/* 로컬 CSS: pulse-slow 애니메이션 + 진입 fade-in */}
      <style>{`
        @keyframes pulseSlow {
          0%, 100% { opacity: 0.35; transform: scale(1); }
          50% { opacity: 0.6; transform: scale(1.05); }
        }
        .animate-pulse-slow { animation: pulseSlow 8s ease-in-out infinite; }

        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .fade-up-1 { animation: fadeUp 0.7s ease-out 0.1s both; }
        .fade-up-2 { animation: fadeUp 0.7s ease-out 0.25s both; }
        .fade-up-3 { animation: fadeUp 0.7s ease-out 0.4s both; }
        .fade-up-4 { animation: fadeUp 0.7s ease-out 0.55s both; }
      `}</style>

      <LandingHeader variant="light" onShowLogin={onShowLogin} onShowSignup={onShowSignup} />

      <main className="relative pt-32 pb-24 px-4 sm:px-6 lg:px-8">
        <div className="max-w-6xl mx-auto">
          {/* Eyebrow + 헤드라인 */}
          <div className="text-center mb-14 sm:mb-20">
            <div className="fade-up-1 inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/70 backdrop-blur px-4 py-1.5 text-xs font-semibold tracking-wider uppercase text-slate-600 mb-6">
              <SparklesIcon className="h-3.5 w-3.5 text-indigo-500" />
              Welcome
            </div>
            <h1 className="fade-up-2 text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-slate-900 leading-[1.1] mb-5">
              먼저, 어느 쪽이신가요?
            </h1>
            <p className="fade-up-3 text-lg text-slate-600 max-w-xl mx-auto leading-relaxed">
              클리닉 매니저는 역할에 맞춰{' '}
              <span className="font-semibold text-slate-900">다른 화면</span>을 보여드려요.
            </p>
          </div>

          {/* 카드 그리드 */}
          <div className="fade-up-4 grid sm:grid-cols-2 gap-5 sm:gap-7">
            <RoleCard
              role="owner"
              emoji="👨‍⚕️"
              label="FOR OWNERS"
              title={"대표원장"}
              tagline="실장을 매출에 집중하게. 경영 지표와 프리미엄 기능까지 한눈에."
              tags={[
                { icon: ChartBarIcon, text: '매출·경영 지표' },
                { icon: Cog6ToothIcon, text: '잡무 자동화' },
                { icon: CurrencyDollarIcon, text: 'ROI·프리미엄' },
              ]}
              accent="owner"
              onSelect={handleSelect}
            />
            <RoleCard
              role="staff"
              emoji="🧑‍💼"
              label="FOR STAFF"
              title={"실장 · 직원"}
              tagline="출퇴근부터 연차·스케쥴까지 몇 번 탭으로 끝. 정시 퇴근 루틴."
              tags={[
                { icon: QrCodeIcon, text: 'QR 출퇴근' },
                { icon: CalendarDaysIcon, text: '스케쥴 · 연차' },
                { icon: ClockIcon, text: '정시 퇴근' },
              ]}
              accent="staff"
              onSelect={handleSelect}
            />
          </div>

          {/* 선택 기억 해제 */}
          <div className="text-center mt-14">
            <p className="text-sm text-slate-500">
              선택한 페이지는 다음 방문 시 자동으로 열려요 ·{' '}
              <button
                onClick={clearRole}
                className="font-medium text-slate-600 underline decoration-slate-300 underline-offset-4 hover:text-slate-900 hover:decoration-slate-600 transition-colors"
              >
                선택 기억 해제
              </button>
            </p>
          </div>
        </div>
      </main>
    </div>
  )
}
