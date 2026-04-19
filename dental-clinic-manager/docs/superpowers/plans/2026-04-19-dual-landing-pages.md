# Dual Landing Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 단일 랜딩 페이지를 대표원장(`/owner`)·실장(`/staff`) 분리 랜딩 + 역할 선택 라우터(`/`)로 교체한다.

**Architecture:** Next.js App Router 3개 페이지(`/`, `/owner`, `/staff`) + 공유 `AuthFlow` 래퍼로 기존 로그인/회원가입 플로우 재사용. localStorage(`clinicmgr.visitor_role`)로 선택 기억 후 `/`에서 자동 리디렉션.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS 4, Heroicons. 기존 `useAuth`(Supabase), `LoginForm`, `SignupForm`, `ForgotPasswordForm`, `Footer` 재사용.

**Verification:** 프로젝트에 자동화된 unit test가 없으므로 각 Task 후 `npm run build`와 `npm run lint`로 타입/빌드 검증. 최종 Task에서 `npm run dev` + 브라우저 수동 테스트.

**Spec:** `docs/superpowers/specs/2026-04-19-dual-landing-pages-design.md`

---

## File Structure

**생성:**
- `src/components/Landing/shared/useVisitorRole.ts` — localStorage 헬퍼
- `src/components/Landing/shared/useScrollAnimation.ts` — 스크롤 인터섹션 훅
- `src/components/Landing/shared/TypeWriter.tsx` — 타이핑 애니메이션
- `src/components/Landing/shared/CountUp.tsx` — 카운트업 애니메이션
- `src/components/Landing/shared/LandingHeader.tsx` — 공통 헤더 (dark/light)
- `src/components/Landing/shared/AuthFlow.tsx` — 로그인/가입 래퍼 (render prop)
- `src/components/Landing/RoleSelector.tsx` — 역할 선택 카드 UI
- `src/components/Landing/OwnerLanding.tsx` — 대표원장 랜딩
- `src/components/Landing/StaffLanding.tsx` — 실장·직원 랜딩
- `src/app/owner/page.tsx` — `/owner` 라우트
- `src/app/staff/page.tsx` — `/staff` 라우트

**수정:**
- `src/app/page.tsx` — `RoleSelector` + `AuthFlow`로 교체

**삭제:**
- `src/app/AuthApp.tsx`
- `src/components/Landing/LandingPage.tsx`

---

## Task 1: useVisitorRole 훅

**Files:**
- Create: `src/components/Landing/shared/useVisitorRole.ts`

- [ ] **Step 1: 훅 작성**

`src/components/Landing/shared/useVisitorRole.ts`:

```ts
'use client'

import { useCallback, useEffect, useState } from 'react'

export type VisitorRole = 'owner' | 'staff'
const STORAGE_KEY = 'clinicmgr.visitor_role'

function isVisitorRole(value: unknown): value is VisitorRole {
  return value === 'owner' || value === 'staff'
}

export function useVisitorRole() {
  const [role, setRoleState] = useState<VisitorRole | null>(null)
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY)
      if (isVisitorRole(stored)) {
        setRoleState(stored)
      }
    } catch {
      // localStorage 접근 실패 시 무시
    }
    setHydrated(true)
  }, [])

  const setRole = useCallback((next: VisitorRole) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // 무시
    }
    setRoleState(next)
  }, [])

  const clearRole = useCallback(() => {
    try {
      window.localStorage.removeItem(STORAGE_KEY)
    } catch {
      // 무시
    }
    setRoleState(null)
  }, [])

  return { role, setRole, clearRole, hydrated }
}
```

- [ ] **Step 2: 빌드 및 타입 체크**

```bash
npm run lint -- src/components/Landing/shared/useVisitorRole.ts
```
Expected: lint 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add src/components/Landing/shared/useVisitorRole.ts
git commit -m "feat(landing): useVisitorRole 훅 추가"
```

---

## Task 2: 애니메이션 훅·컴포넌트 추출

기존 `LandingPage.tsx`에 인라인으로 있던 `useScrollAnimation`, `TypeWriter`, `CountUp`을 공용 모듈로 추출.

**Files:**
- Create: `src/components/Landing/shared/useScrollAnimation.ts`
- Create: `src/components/Landing/shared/TypeWriter.tsx`
- Create: `src/components/Landing/shared/CountUp.tsx`

- [ ] **Step 1: useScrollAnimation 훅 작성**

`src/components/Landing/shared/useScrollAnimation.ts`:

```ts
'use client'

import { useEffect, useRef, useState } from 'react'

export function useScrollAnimation() {
  const ref = useRef<HTMLDivElement>(null)
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true)
        }
      },
      { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
    )

    if (ref.current) {
      observer.observe(ref.current)
    }

    return () => observer.disconnect()
  }, [])

  return { ref, isVisible }
}
```

- [ ] **Step 2: TypeWriter 컴포넌트 작성**

`src/components/Landing/shared/TypeWriter.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useScrollAnimation } from './useScrollAnimation'

export default function TypeWriter({ text, delay = 50 }: { text: string; delay?: number }) {
  const [displayText, setDisplayText] = useState('')
  const [isStarted, setIsStarted] = useState(false)
  const { ref, isVisible } = useScrollAnimation()

  useEffect(() => {
    if (isVisible && !isStarted) {
      setIsStarted(true)
      let i = 0
      const timer = setInterval(() => {
        if (i < text.length) {
          setDisplayText(text.slice(0, i + 1))
          i++
        } else {
          clearInterval(timer)
        }
      }, delay)
      return () => clearInterval(timer)
    }
  }, [isVisible, isStarted, text, delay])

  return (
    <span ref={ref}>
      {displayText}
      {displayText.length < text.length && isStarted && (
        <span className="animate-pulse">|</span>
      )}
    </span>
  )
}
```

- [ ] **Step 3: CountUp 컴포넌트 작성**

`src/components/Landing/shared/CountUp.tsx`:

```tsx
'use client'

import { useEffect, useState } from 'react'
import { useScrollAnimation } from './useScrollAnimation'

interface CountUpProps {
  end: number
  suffix?: string
  duration?: number
}

export default function CountUp({ end, suffix = '', duration = 2000 }: CountUpProps) {
  const [count, setCount] = useState(0)
  const { ref, isVisible } = useScrollAnimation()

  useEffect(() => {
    if (!isVisible) return

    let startTime: number
    const animate = (currentTime: number) => {
      if (!startTime) startTime = currentTime
      const progress = Math.min((currentTime - startTime) / duration, 1)
      setCount(Math.floor(progress * end))
      if (progress < 1) {
        requestAnimationFrame(animate)
      }
    }
    requestAnimationFrame(animate)
  }, [isVisible, end, duration])

  return <span ref={ref}>{count}{suffix}</span>
}
```

- [ ] **Step 4: lint 체크**

```bash
npm run lint
```
Expected: 새 파일에 관한 lint 에러 없음

- [ ] **Step 5: 커밋**

```bash
git add src/components/Landing/shared/useScrollAnimation.ts src/components/Landing/shared/TypeWriter.tsx src/components/Landing/shared/CountUp.tsx
git commit -m "refactor(landing): 스크롤 애니메이션 훅/컴포넌트를 shared로 분리"
```

---

## Task 3: LandingHeader 공통 헤더

**Files:**
- Create: `src/components/Landing/shared/LandingHeader.tsx`

- [ ] **Step 1: 컴포넌트 작성**

`src/components/Landing/shared/LandingHeader.tsx`:

```tsx
'use client'

import Image from 'next/image'

export type LandingHeaderVariant = 'dark' | 'light'

interface LandingHeaderProps {
  variant: LandingHeaderVariant
  onShowLogin: () => void
  onShowSignup: () => void
}

export default function LandingHeader({ variant, onShowLogin, onShowSignup }: LandingHeaderProps) {
  const isDark = variant === 'dark'
  const wrapperClass = isDark
    ? 'bg-slate-950/80 border-b border-white/10'
    : 'bg-white/80 border-b border-at-border/50 shadow-at-card'
  const logoTextClass = isDark ? 'text-white' : 'text-at-text'
  const loginClass = isDark
    ? 'text-slate-300 hover:text-white'
    : 'text-at-text-secondary hover:text-at-text'
  const signupClass = isDark
    ? 'bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white'
    : 'bg-slate-900 hover:bg-slate-800 text-white'

  return (
    <header className={`fixed top-0 left-0 right-0 backdrop-blur-xl z-50 ${wrapperClass}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center gap-3">
            <Image
              src="/icons/icon-192x192.png"
              alt="클리닉 매니저 로고"
              width={40}
              height={40}
              className="w-10 h-10 rounded-xl shadow-at-card"
            />
            <span className={`text-xl font-bold ${logoTextClass}`}>클리닉 매니저</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onShowLogin}
              className={`px-4 py-2 font-medium transition-colors ${loginClass}`}
            >
              로그인
            </button>
            <button
              onClick={onShowSignup}
              className={`px-5 py-2.5 font-semibold rounded-xl transition-all shadow-at-card hover:shadow-lg ${signupClass}`}
            >
              시작하기
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}
```

- [ ] **Step 2: lint 체크**

```bash
npm run lint
```
Expected: lint 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add src/components/Landing/shared/LandingHeader.tsx
git commit -m "feat(landing): LandingHeader 공통 컴포넌트 추가"
```

---

## Task 4: AuthFlow 래퍼

기존 `AuthApp.tsx`의 로그인/회원가입/비밀번호 상태 관리 로직을 재사용 가능한 래퍼로 이식한다. 렌더 프롭으로 랜딩 컴포넌트에 `onShowLogin`/`onShowSignup` 콜백을 주입한다.

**Files:**
- Create: `src/components/Landing/shared/AuthFlow.tsx`

- [ ] **Step 1: 컴포넌트 작성**

`src/components/Landing/shared/AuthFlow.tsx`:

```tsx
'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import LoginForm from '@/components/Auth/LoginForm'
import SignupForm from '@/components/Auth/SignupForm'
import ForgotPasswordForm from '@/components/Auth/ForgotPasswordForm'
import Footer from '@/components/Layout/Footer'

type AppState = 'landing' | 'login' | 'signup' | 'forgotPassword'

export interface AuthFlowRenderProps {
  onShowLogin: () => void
  onShowSignup: () => void
}

interface AuthFlowProps {
  children: (props: AuthFlowRenderProps) => ReactNode
}

export default function AuthFlow({ children }: AuthFlowProps) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { isAuthenticated, user, loading } = useAuth()
  const [appState, setAppState] = useState<AppState>('landing')

  useEffect(() => {
    const show = searchParams.get('show')
    if (show === 'login') {
      setAppState('login')
    } else if (show === 'signup') {
      setAppState('signup')
    }
  }, [searchParams])

  useEffect(() => {
    if (isAuthenticated) {
      if (user?.status === 'pending' || user?.status === 'rejected') {
        router.push('/pending-approval')
        return
      }
      const redirect = searchParams.get('redirect')
      router.push(redirect || '/dashboard')
    }
  }, [isAuthenticated, user, router, searchParams])

  if (loading) {
    return (
      <div className="min-h-screen bg-at-surface-alt flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-at-accent mx-auto mb-4"></div>
          <p className="text-at-text-secondary">로딩 중...</p>
        </div>
      </div>
    )
  }

  if (isAuthenticated) {
    return null
  }

  const showLogin = () => setAppState('login')
  const showSignup = () => setAppState('signup')
  const showLanding = () => setAppState('landing')
  const showForgot = () => setAppState('forgotPassword')

  let content: ReactNode
  switch (appState) {
    case 'login':
      content = (
        <LoginForm
          onBackToLanding={showLanding}
          onShowSignup={showSignup}
          onShowForgotPassword={showForgot}
          onLoginSuccess={() => {
            setTimeout(() => { window.location.reload() }, 150)
          }}
        />
      )
      break
    case 'signup':
      content = (
        <SignupForm
          onBackToLanding={showLanding}
          onShowLogin={showLogin}
          onSignupSuccess={() => { setAppState('login') }}
        />
      )
      break
    case 'forgotPassword':
      content = <ForgotPasswordForm onBackToLogin={showLogin} />
      break
    default:
      content = children({ onShowLogin: showLogin, onShowSignup: showSignup })
  }

  return (
    <>
      {content}
      <Footer />
    </>
  )
}
```

- [ ] **Step 2: lint + 타입체크**

```bash
npm run lint
```
Expected: lint 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add src/components/Landing/shared/AuthFlow.tsx
git commit -m "feat(landing): AuthFlow 래퍼 컴포넌트 추가 (기존 AuthApp 로직 이식)"
```

---

## Task 5: RoleSelector 컴포넌트

**Files:**
- Create: `src/components/Landing/RoleSelector.tsx`

- [ ] **Step 1: 컴포넌트 작성**

`src/components/Landing/RoleSelector.tsx`:

```tsx
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
```

- [ ] **Step 2: lint 체크**

```bash
npm run lint
```
Expected: lint 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add src/components/Landing/RoleSelector.tsx
git commit -m "feat(landing): RoleSelector 역할 선택 컴포넌트 추가"
```

---

## Task 6: `/` 페이지를 RoleSelector로 교체

**Files:**
- Modify: `src/app/page.tsx`

- [ ] **Step 1: page.tsx 교체**

`src/app/page.tsx`의 전체 내용을 다음으로 교체:

```tsx
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
```

- [ ] **Step 2: 빌드 체크**

```bash
npm run build
```
Expected: 빌드 성공 (`/` 라우트가 새 구성으로 컴파일됨). `AuthApp.tsx`는 아직 존재하지만 import 되지 않으므로 빌드는 성공.

- [ ] **Step 3: 커밋**

```bash
git add src/app/page.tsx
git commit -m "feat(landing): / 루트를 RoleSelector로 교체"
```

---

## Task 7: OwnerLanding — Hero + Problem 섹션

OwnerLanding은 섹션 수가 많아 3단계로 나눠 작성한다. Task 7은 Hero + Problem, Task 8은 Solution + Features + Premium, Task 9는 Trust + CTA + FAQ.

**Files:**
- Create: `src/components/Landing/OwnerLanding.tsx`

- [ ] **Step 1: 뼈대 + Hero + Problem 작성**

`src/components/Landing/OwnerLanding.tsx`:

```tsx
'use client'

import { useState } from 'react'
import {
  ArrowRightIcon,
  BoltIcon,
  ChartBarIcon,
  ChevronDownIcon,
  ClockIcon,
  DocumentTextIcon,
  CalendarDaysIcon,
  UserGroupIcon,
  CurrencyDollarIcon,
  HeartIcon,
  SparklesIcon,
  CheckCircleIcon,
  CpuChipIcon,
  PresentationChartLineIcon,
  PencilSquareIcon,
} from '@heroicons/react/24/outline'
import LandingHeader from './shared/LandingHeader'
import { useScrollAnimation } from './shared/useScrollAnimation'

interface OwnerLandingProps {
  onShowLogin: () => void
  onShowSignup: () => void
}

function StoryBlock({ children }: { children: React.ReactNode }) {
  const { ref, isVisible } = useScrollAnimation()
  return (
    <div
      ref={ref}
      className={`transition-all duration-1000 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
      }`}
    >
      {children}
    </div>
  )
}

const problemItems = [
  { icon: CalendarDaysIcon, label: '엑셀 연차 계산' },
  { icon: ClockIcon, label: '출퇴근 수기 집계' },
  { icon: UserGroupIcon, label: '스케쥴 수동 조율' },
  { icon: CurrencyDollarIcon, label: '급여 명세서 취합' },
  { icon: HeartIcon, label: '환자 리콜 추적' },
  { icon: DocumentTextIcon, label: '상담 기록 정리' },
]

export default function OwnerLanding({ onShowLogin, onShowSignup }: OwnerLandingProps) {
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      <LandingHeader variant="dark" onShowLogin={onShowLogin} onShowSignup={onShowSignup} />

      {/* HERO */}
      <section className="relative min-h-screen flex items-center justify-center pt-16 overflow-hidden bg-slate-950">
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950" />
        <div className="absolute top-1/4 -left-32 w-96 h-96 bg-blue-500/20 rounded-full filter blur-[120px] opacity-40" />
        <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-indigo-500/20 rounded-full filter blur-[120px] opacity-40" />

        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center z-10">
          <div className="mb-10">
            <span className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/5 backdrop-blur-sm border border-white/10 text-blue-300 rounded-full text-sm font-medium">
              <SparklesIcon className="w-4 h-4" />
              FOR CLINIC OWNERS
            </span>
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-white leading-[1.15] tracking-tight mb-8">
            <span className="block mb-2 sm:mb-4">능력있는 실장을</span>
            <span className="block bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-400 bg-clip-text text-transparent pb-2">
              엑셀과 연차 계산에
            </span>
            <span className="block">낭비하지 마세요</span>
          </h1>

          <p className="text-slate-300 text-lg sm:text-xl max-w-2xl mx-auto mb-12 leading-relaxed">
            잡무는 시스템에 맡기고,{' '}
            <span className="text-white font-medium">실장은 매출에만 집중</span>하게 하세요.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-16">
            <button
              onClick={onShowSignup}
              className="group px-8 py-4 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white font-bold text-lg rounded-2xl transition-all shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:-translate-y-1 flex items-center gap-2"
            >
              무료로 시작하기
              <ArrowRightIcon className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
            <button
              onClick={() => document.getElementById('owner-problem')?.scrollIntoView({ behavior: 'smooth' })}
              className="px-8 py-4 text-slate-300 hover:text-white font-medium transition-colors flex items-center gap-2"
            >
              기능 살펴보기
              <ChevronDownIcon className="w-5 h-5" />
            </button>
          </div>

          <div className="flex justify-center items-center gap-6 sm:gap-10">
            <div className="flex items-center gap-2.5 px-4 py-2 bg-white/5 backdrop-blur-sm rounded-full border border-white/10">
              <div className="w-2.5 h-2.5 rounded-full bg-green-400 shadow-lg shadow-green-400/50" />
              <span className="text-sm text-slate-300 font-medium">현직 원장 개발</span>
            </div>
            <div className="flex items-center gap-2.5 px-4 py-2 bg-white/5 backdrop-blur-sm rounded-full border border-white/10">
              <div className="w-2.5 h-2.5 rounded-full bg-blue-400 shadow-lg shadow-blue-400/50" />
              <span className="text-sm text-slate-300 font-medium">실제 병원 운영 중</span>
            </div>
          </div>
        </div>

        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 animate-bounce">
          <ChevronDownIcon className="w-5 h-5 text-slate-400" />
        </div>
      </section>

      {/* PROBLEM */}
      <section id="owner-problem" className="relative py-32 bg-slate-900">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <StoryBlock>
            <div className="flex items-center gap-4 mb-10">
              <div className="w-16 h-16 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl flex items-center justify-center shadow-lg">
                <BoltIcon className="w-8 h-8 text-white" />
              </div>
              <div>
                <span className="text-amber-400 font-semibold text-sm tracking-wider uppercase">The Problem</span>
                <h2 className="text-2xl font-bold text-white">실장이 하루에 버리는 시간</h2>
              </div>
            </div>

            <p className="text-2xl sm:text-3xl lg:text-4xl font-medium text-white leading-relaxed mb-10">
              능력있는 실장이 매일 처리하는{' '}
              <span className="text-amber-400">반복 잡무</span>들.
            </p>

            <div className="grid sm:grid-cols-2 gap-3 mb-10">
              {problemItems.map(({ icon: Icon, label }) => (
                <div
                  key={label}
                  className="flex items-center gap-3 bg-slate-800/50 backdrop-blur-sm rounded-xl p-4 border border-slate-700/50"
                >
                  <Icon className="w-5 h-5 text-amber-400 flex-shrink-0" />
                  <span className="text-slate-200">{label}</span>
                </div>
              ))}
            </div>

            <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl p-6 sm:p-8 border border-slate-700/50 shadow-xl">
              <p className="text-xl text-slate-200 leading-relaxed text-center">
                이 시간에 실장은{' '}
                <span className="text-amber-400 font-semibold">상담 한 건을 더</span> 받을 수 있었습니다.
              </p>
            </div>
          </StoryBlock>
        </div>
      </section>

      {/* 나머지 섹션은 다음 Task에서 추가 */}
    </div>
  )
}
```

- [ ] **Step 2: lint + 빌드 체크**

```bash
npm run lint
```
Expected: lint 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add src/components/Landing/OwnerLanding.tsx
git commit -m "feat(landing): OwnerLanding Hero + Problem 섹션 추가"
```

---

## Task 8: OwnerLanding — Solution + Features + Premium

**Files:**
- Modify: `src/components/Landing/OwnerLanding.tsx`

- [ ] **Step 1: Features 배열과 Premium 배열을 `problemItems` 아래에 추가**

`src/components/Landing/OwnerLanding.tsx`의 `problemItems` 아래에 다음을 추가:

```tsx
const ownerFeatures = [
  {
    icon: ChartBarIcon,
    title: '일일 업무 보고서',
    description: '상담·선물·해피콜·리콜 자동 집계와 통계 분석',
    color: 'from-blue-500 to-cyan-500',
  },
  {
    icon: ClockIcon,
    title: '출퇴근 · 근태',
    description: 'QR 체크인, 팀 현황, 스케쥴을 한 화면에서',
    color: 'from-green-500 to-emerald-500',
  },
  {
    icon: DocumentTextIcon,
    title: '근로계약서 관리',
    description: '템플릿 기반 계약서 생성과 체계적 보관',
    color: 'from-purple-500 to-pink-500',
  },
  {
    icon: CalendarDaysIcon,
    title: '연차 자동 계산',
    description: '정책·발생·잔여·승인 워크플로우까지',
    color: 'from-orange-500 to-amber-500',
  },
  {
    icon: CurrencyDollarIcon,
    title: '급여 명세서',
    description: '월별 급여 자동 생성과 직원 배포',
    color: 'from-rose-500 to-pink-500',
  },
  {
    icon: UserGroupIcon,
    title: '직원 권한 · 프로토콜',
    description: '역할별 접근 통제와 업무 표준 문서화',
    color: 'from-indigo-500 to-violet-500',
  },
]

const premiumItems = [
  {
    icon: CpuChipIcon,
    title: 'AI 데이터 분석',
    description: '매출·상담 지표에서 인사이트를 자동 추출',
  },
  {
    icon: PresentationChartLineIcon,
    title: '경영현황 대시보드',
    description: '재무·매출·KPI를 한 화면에서 실시간 확인',
  },
  {
    icon: PencilSquareIcon,
    title: '마케팅 자동화',
    description: '네이버 블로그 자동 기획·발행·KPI 추적',
  },
]
```

- [ ] **Step 2: Solution 섹션을 Problem 섹션 뒤에 추가**

`OwnerLanding.tsx`에서 `{/* 나머지 섹션은 다음 Task에서 추가 */}` 주석을 아래로 교체:

```tsx
      {/* SOLUTION */}
      <section className="relative py-32 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <StoryBlock>
            <div className="flex items-center gap-4 mb-10">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center shadow-lg">
                <HeartIcon className="w-8 h-8 text-white" />
              </div>
              <div>
                <span className="text-at-accent font-semibold text-sm tracking-wider uppercase">The Solution</span>
                <h2 className="text-2xl font-bold text-at-text">잡무는 시스템에게, 실장은 매출에게</h2>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-6 mb-8">
              <div className="bg-at-surface-alt rounded-2xl p-6 border border-at-border shadow-at-card">
                <div className="text-4xl mb-4">🔁</div>
                <h3 className="font-bold text-at-text mb-2">Before</h3>
                <p className="text-at-text-secondary">
                  반복 업무에 <span className="text-red-500 font-semibold">70%</span>의 집중력 소진,
                  상담·매출에는 30%만 남습니다.
                </p>
              </div>
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-6 border border-at-border shadow-at-card">
                <div className="text-4xl mb-4">✨</div>
                <h3 className="font-bold text-at-text mb-2">After</h3>
                <p className="text-at-text-secondary">
                  잡무는 시스템이 처리하고, 실장은{' '}
                  <span className="text-at-accent font-semibold">상담·해피콜·매출 관리</span>에 집중합니다.
                </p>
              </div>
            </div>

            <div className="text-center">
              <p className="text-xl text-at-text-secondary font-medium">
                실장의 에너지가{' '}
                <span className="text-at-accent font-bold">매출로 전환</span>됩니다.
              </p>
            </div>
          </StoryBlock>
        </div>
      </section>

      {/* FEATURES */}
      <section id="owner-features" className="py-32 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <span className="inline-block px-4 py-1.5 bg-at-surface-alt text-at-text-secondary font-semibold text-sm rounded-full mb-4">
              FEATURES
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold text-at-text mb-4">
              병원 운영에 필요한 모든 것
            </h2>
            <p className="text-lg text-at-text-secondary max-w-2xl mx-auto">
              반복 업무를 시스템이 처리하는 6가지 핵심 기능
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {ownerFeatures.map((feature) => {
              const Icon = feature.icon
              return (
                <div
                  key={feature.title}
                  className="group bg-at-surface-alt hover:bg-white rounded-2xl p-8 transition-all duration-500 hover:shadow-2xl hover:-translate-y-1 border border-at-border"
                >
                  <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${feature.color} flex items-center justify-center mb-6 shadow-lg`}>
                    <Icon className="w-7 h-7 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-at-text mb-3">{feature.title}</h3>
                  <p className="text-at-text-secondary leading-relaxed">{feature.description}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* PREMIUM */}
      <section className="py-32 bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-950 relative overflow-hidden">
        <div className="absolute top-0 left-1/3 w-96 h-96 bg-purple-500/10 rounded-full filter blur-3xl" />
        <div className="absolute bottom-0 right-1/3 w-96 h-96 bg-blue-500/10 rounded-full filter blur-3xl" />

        <div className="relative max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <span className="inline-flex items-center gap-2 px-4 py-1.5 bg-gradient-to-r from-amber-400/20 to-orange-400/20 border border-amber-400/30 text-amber-300 font-bold text-xs tracking-wider uppercase rounded-full mb-4">
              <SparklesIcon className="w-4 h-4" /> PREMIUM · 월 ₩499,000
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">
              경영자의 시간을 위해 준비된 한 단계 더
            </h2>
            <p className="text-lg text-slate-300 max-w-2xl mx-auto">
              기본 기능에 더해, 매출 성장을 직접 끌어올리는 도구
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            {premiumItems.map((item) => {
              const Icon = item.icon
              return (
                <div
                  key={item.title}
                  className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8 hover:bg-white/10 transition-all"
                >
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center mb-6 shadow-lg">
                    <Icon className="w-7 h-7 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-white mb-3">{item.title}</h3>
                  <p className="text-slate-300 leading-relaxed">{item.description}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* 나머지 섹션은 다음 Task에서 추가 */}
```

- [ ] **Step 3: lint 체크**

```bash
npm run lint
```
Expected: lint 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add src/components/Landing/OwnerLanding.tsx
git commit -m "feat(landing): OwnerLanding Solution/Features/Premium 섹션 추가"
```

---

## Task 9: OwnerLanding — Trust + CTA + FAQ

**Files:**
- Modify: `src/components/Landing/OwnerLanding.tsx`

- [ ] **Step 1: FAQ 배열 추가**

`premiumItems` 아래에 다음을 추가:

```tsx
const ownerFaqs = [
  {
    q: '설치가 필요한가요?',
    a: '아니요. 웹 브라우저에서 바로 사용 가능합니다. PC·태블릿·스마트폰 어디서든 접속됩니다.',
  },
  {
    q: '데이터는 안전한가요?',
    a: '글로벌 클라우드 인프라에서 암호화되어 저장되며, 자동 백업으로 손실 없이 보관됩니다.',
  },
  {
    q: '직원 권한 설정이 가능한가요?',
    a: '원장·부원장·실장·팀장·일반 직원 등 역할별 권한을 세분화해 설정할 수 있습니다.',
  },
  {
    q: '기존 데이터 이전이 가능한가요?',
    a: 'Excel 파일 등을 통한 기존 데이터 이전을 지원합니다.',
  },
  {
    q: '프리미엄 패키지는 무엇이 다른가요?',
    a: '기본 기능은 그대로 사용 가능하며, 월 ₩499,000에 AI 데이터 분석·경영현황 대시보드·마케팅 자동화(네이버 블로그)가 포함됩니다.',
  },
]
```

- [ ] **Step 2: Trust + CTA + FAQ 섹션 추가**

`{/* 나머지 섹션은 다음 Task에서 추가 */}` 주석을 아래로 교체:

```tsx
      {/* TRUST */}
      <section className="relative py-32 bg-gradient-to-br from-slate-50 to-blue-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <StoryBlock>
            <div className="text-center mb-12">
              <span className="inline-flex items-center gap-2 px-4 py-2 bg-at-tag text-at-accent rounded-full text-sm font-semibold mb-6">
                <SparklesIcon className="w-4 h-4" />
                Why Clinic Manager?
              </span>
              <h2 className="text-3xl sm:text-4xl font-bold text-at-text leading-tight">
                현장의 필요를 느낀{' '}
                <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                  치과 원장이 직접 개발
                </span>
                했습니다
              </h2>
            </div>

            <div className="bg-white rounded-3xl p-8 sm:p-10 shadow-xl border border-at-border">
              <div className="flex flex-col sm:flex-row items-center gap-6 mb-8">
                <div className="w-20 h-20 bg-gradient-to-br from-slate-700 to-slate-900 rounded-2xl flex items-center justify-center shadow-lg">
                  <span className="text-3xl">👨‍⚕️</span>
                </div>
                <div className="text-center sm:text-left">
                  <p className="text-at-text-weak text-sm mb-1">개발자이자 사용자</p>
                  <p className="text-2xl font-bold text-at-text">현직 치과 원장</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <CheckCircleIcon className="w-6 h-6 text-green-500 flex-shrink-0 mt-0.5" />
                  <p className="text-lg text-at-text-secondary">
                    <span className="font-semibold">현장의 불편함</span>을 직접 경험하고 해결한 솔루션
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircleIcon className="w-6 h-6 text-green-500 flex-shrink-0 mt-0.5" />
                  <p className="text-lg text-at-text-secondary">
                    <span className="font-semibold">본인 병원에서 매일 사용</span>하며 지속 개선 중
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircleIcon className="w-6 h-6 text-green-500 flex-shrink-0 mt-0.5" />
                  <p className="text-lg text-at-text-secondary">
                    치과 업무 흐름을 <span className="font-semibold">정확히 이해</span>한 맞춤형 설계
                  </p>
                </div>
              </div>

              <div className="mt-8 pt-8 border-t border-at-border">
                <p className="text-at-text-secondary italic text-center">
                  "직접 쓰면서 불편한 건 바로바로 고칩니다.<br />제가 매일 쓰니까요."
                </p>
              </div>
            </div>
          </StoryBlock>
        </div>
      </section>

      {/* CTA */}
      <section className="py-32 bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-96 h-96 bg-white/10 rounded-full filter blur-3xl -translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-white/10 rounded-full filter blur-3xl translate-x-1/2 translate-y-1/2" />

        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-6">
            실장의 시간을 매출로 전환할 때입니다
          </h2>
          <p className="text-xl text-white/80 mb-10 max-w-2xl mx-auto">
            복잡한 설치 없이, 웹 브라우저로 바로 시작하세요.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={onShowSignup}
              className="group px-10 py-4 bg-white text-at-text font-bold text-lg rounded-2xl transition-all shadow-xl hover:shadow-2xl hover:-translate-y-1 flex items-center gap-2 justify-center"
            >
              무료로 시작하기
              <ArrowRightIcon className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
            <button
              onClick={onShowLogin}
              className="px-10 py-4 border-2 border-white/30 text-white hover:bg-white/10 font-semibold text-lg rounded-2xl transition-all backdrop-blur-sm"
            >
              로그인
            </button>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="owner-faq" className="py-24 bg-at-surface-alt">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-at-text mb-4">자주 묻는 질문</h2>
          </div>

          <div className="space-y-4">
            {ownerFaqs.map((faq, i) => (
              <div key={i} className="bg-white rounded-2xl overflow-hidden shadow-at-card border border-at-border">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full px-6 py-5 flex items-center justify-between text-left hover:bg-at-surface-alt transition-colors"
                >
                  <span className="font-semibold text-at-text pr-4">{faq.q}</span>
                  <ChevronDownIcon
                    className={`w-5 h-5 text-at-text-weak transition-transform duration-300 flex-shrink-0 ${openFaq === i ? 'rotate-180' : ''}`}
                  />
                </button>
                <div className={`overflow-hidden transition-all duration-300 ${openFaq === i ? 'max-h-48' : 'max-h-0'}`}>
                  <div className="px-6 pb-5">
                    <p className="text-at-text-secondary leading-relaxed">{faq.a}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
```

- [ ] **Step 3: lint 체크**

```bash
npm run lint
```
Expected: lint 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add src/components/Landing/OwnerLanding.tsx
git commit -m "feat(landing): OwnerLanding Trust/CTA/FAQ 섹션 추가"
```

---

## Task 10: `/owner` 라우트

**Files:**
- Create: `src/app/owner/page.tsx`

- [ ] **Step 1: 페이지 작성**

`src/app/owner/page.tsx`:

```tsx
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
      {({ onShowLogin, onShowSignup }) => (
        <OwnerLanding onShowLogin={onShowLogin} onShowSignup={onShowSignup} />
      )}
    </AuthFlow>
  )
}
```

- [ ] **Step 2: 빌드 체크**

```bash
npm run build
```
Expected: `/owner` 라우트가 성공적으로 컴파일됨

- [ ] **Step 3: 커밋**

```bash
git add src/app/owner/page.tsx
git commit -m "feat(landing): /owner 라우트 추가"
```

---

## Task 11: StaffLanding — Hero + 공감 + 해결 섹션

**Files:**
- Create: `src/components/Landing/StaffLanding.tsx`

- [ ] **Step 1: 뼈대 + Hero + 공감 + 해결 작성**

`src/components/Landing/StaffLanding.tsx`:

```tsx
'use client'

import { useState } from 'react'
import {
  ArrowRightIcon,
  ChevronDownIcon,
  ClockIcon,
  CalendarDaysIcon,
  ChartBarIcon,
  CheckCircleIcon,
  GiftIcon,
  ChatBubbleLeftRightIcon,
  SparklesIcon,
  QrCodeIcon,
} from '@heroicons/react/24/outline'
import LandingHeader from './shared/LandingHeader'
import { useScrollAnimation } from './shared/useScrollAnimation'

interface StaffLandingProps {
  onShowLogin: () => void
  onShowSignup: () => void
}

function StoryBlock({ children }: { children: React.ReactNode }) {
  const { ref, isVisible } = useScrollAnimation()
  return (
    <div
      ref={ref}
      className={`transition-all duration-1000 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
      }`}
    >
      {children}
    </div>
  )
}

const staffFeatures = [
  {
    icon: QrCodeIcon,
    title: 'QR 출퇴근',
    description: '스마트폰으로 1초 체크인. 수기 기록 없이 자동 집계.',
    color: 'from-pink-400 to-rose-500',
  },
  {
    icon: CalendarDaysIcon,
    title: '스케쥴 · 연차',
    description: '신청부터 승인까지 앱에서. 잔여일도 한눈에.',
    color: 'from-violet-400 to-purple-500',
  },
  {
    icon: ChartBarIcon,
    title: '일일 업무 보고',
    description: '상담·해피콜·리콜을 탭 한 번으로 기록.',
    color: 'from-amber-400 to-orange-500',
  },
  {
    icon: CheckCircleIcon,
    title: '업무 체크리스트',
    description: '오늘 할 일과 완료 현황을 팀 단위로 공유.',
    color: 'from-emerald-400 to-teal-500',
  },
  {
    icon: GiftIcon,
    title: '선물 재고',
    description: '실시간 수량 확인·알림. 부족분 체크 걱정 끝.',
    color: 'from-rose-400 to-pink-500',
  },
  {
    icon: ChatBubbleLeftRightIcon,
    title: '팀 커뮤니티 · 텔레그램',
    description: '공지·질문·빠른 소통을 한 채널에서.',
    color: 'from-cyan-400 to-sky-500',
  },
]

const staffFaqs = [
  {
    q: '개인정보가 안전한가요?',
    a: '모든 데이터는 암호화되어 저장되며, 원장님과 권한이 있는 관리자만 접근할 수 있습니다.',
  },
  {
    q: '휴대폰으로도 잘 되나요?',
    a: '모바일 최적화 웹앱이라 스마트폰에서 바로 사용 가능하고, 홈 화면에 추가해 앱처럼 쓸 수 있습니다.',
  },
  {
    q: '연차 잔여일은 어떻게 확인하나요?',
    a: '연차 메뉴에서 발생·사용·잔여일이 자동 계산되어 실시간으로 표시됩니다.',
  },
  {
    q: '실수로 출근 체크를 빼먹으면요?',
    a: '관리자에게 수정 요청을 보낼 수 있고, 승인되면 반영됩니다. 놓치지 않게 알림도 설정할 수 있습니다.',
  },
]

export default function StaffLanding({ onShowLogin, onShowSignup }: StaffLandingProps) {
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      <LandingHeader variant="light" onShowLogin={onShowLogin} onShowSignup={onShowSignup} />

      {/* HERO */}
      <section className="relative min-h-screen flex items-center justify-center pt-16 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-amber-50 via-rose-100 to-violet-100" />
        <div className="absolute top-1/4 -left-20 w-80 h-80 bg-rose-300/30 rounded-full filter blur-[120px]" />
        <div className="absolute bottom-1/4 -right-20 w-80 h-80 bg-violet-300/30 rounded-full filter blur-[120px]" />

        <div className="absolute top-24 left-10 text-3xl opacity-50 animate-bounce" style={{ animationDuration: '3s' }}>☕</div>
        <div className="absolute top-32 right-16 text-3xl opacity-50 animate-bounce" style={{ animationDuration: '4s', animationDelay: '0.5s' }}>✨</div>
        <div className="absolute bottom-32 left-20 text-3xl opacity-50 animate-bounce" style={{ animationDuration: '3.5s', animationDelay: '1s' }}>🎈</div>

        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center z-10">
          <div className="mb-8">
            <span className="inline-flex items-center gap-2 px-5 py-2.5 bg-white/70 backdrop-blur-sm border border-pink-200 text-pink-600 rounded-full text-sm font-semibold">
              <SparklesIcon className="w-4 h-4" />
              FOR STAFF · 실장님, 팀원님
            </span>
          </div>

          <h1 className="text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold text-slate-900 leading-[1.2] tracking-tight mb-8">
            <span className="block mb-2 sm:mb-4">출퇴근부터 연차까지</span>
            <span className="block bg-gradient-to-r from-pink-500 via-rose-500 to-violet-500 bg-clip-text text-transparent pb-2">
              간단하게 끝내고
            </span>
            <span className="block">정시 퇴근하세요 ~</span>
          </h1>

          <p className="text-slate-700 text-lg sm:text-xl max-w-xl mx-auto mb-12 leading-relaxed">
            반복 업무는 앱이 대신합니다.{' '}
            <span className="text-slate-900 font-semibold">손 덜 쓰는 하루 루틴.</span>
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <button
              onClick={onShowSignup}
              className="group px-8 py-4 bg-slate-900 hover:bg-slate-800 text-white font-bold text-lg rounded-2xl transition-all shadow-xl hover:shadow-2xl hover:-translate-y-1 flex items-center gap-2"
            >
              지금 시작하기
              <ArrowRightIcon className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
            <button
              onClick={() => document.getElementById('staff-empathy')?.scrollIntoView({ behavior: 'smooth' })}
              className="px-8 py-4 bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 font-medium text-lg rounded-2xl transition-all flex items-center gap-2"
            >
              기능 살펴보기
              <ChevronDownIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 animate-bounce">
          <ChevronDownIcon className="w-5 h-5 text-slate-500" />
        </div>
      </section>

      {/* EMPATHY */}
      <section id="staff-empathy" className="py-28 bg-gradient-to-b from-rose-50 to-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <StoryBlock>
            <p className="text-3xl sm:text-4xl font-bold text-slate-900 leading-snug mb-6">
              혹시 오늘도…<br />
              <span className="text-rose-500">퇴근하고 엑셀 켜셨나요?</span>
            </p>
            <p className="text-lg text-slate-600 leading-relaxed">
              연차 계산, 스케쥴 조율, 업무 집계…<br />
              이제 그만 하셔도 됩니다.
            </p>
          </StoryBlock>
        </div>
      </section>

      {/* SOLUTION */}
      <section className="py-28 bg-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <StoryBlock>
            <div className="text-center mb-14">
              <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 leading-snug">
                클릭 몇 번이면{' '}
                <span className="bg-gradient-to-r from-pink-500 to-violet-500 bg-clip-text text-transparent">
                  끝.
                </span>
              </h2>
            </div>

            <div className="grid sm:grid-cols-3 gap-4">
              {[
                { n: '1', title: 'QR로 출근', desc: '스마트폰으로 1초', color: 'from-pink-400 to-rose-500' },
                { n: '2', title: '하루 업무 관리', desc: '앱에서 탭 한 번', color: 'from-violet-400 to-purple-500' },
                { n: '3', title: 'QR로 퇴근', desc: '정시에 귀가 ~', color: 'from-amber-400 to-orange-500' },
              ].map((step) => (
                <div
                  key={step.n}
                  className="relative bg-white border border-slate-100 rounded-3xl p-8 shadow-at-card hover:shadow-xl transition-all"
                >
                  <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${step.color} text-white font-bold text-xl flex items-center justify-center shadow-lg mb-4`}>
                    {step.n}
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">{step.title}</h3>
                  <p className="text-slate-600">{step.desc}</p>
                </div>
              ))}
            </div>
          </StoryBlock>
        </div>
      </section>

      {/* 나머지 섹션은 다음 Task에서 추가 */}
    </div>
  )
}
```

- [ ] **Step 2: lint 체크**

```bash
npm run lint
```
Expected: lint 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add src/components/Landing/StaffLanding.tsx
git commit -m "feat(landing): StaffLanding Hero/공감/해결 섹션 추가"
```

---

## Task 12: StaffLanding — Features + CTA + FAQ

**Files:**
- Modify: `src/components/Landing/StaffLanding.tsx`

- [ ] **Step 1: Features + CTA + FAQ 섹션 추가**

`{/* 나머지 섹션은 다음 Task에서 추가 */}` 주석을 아래로 교체:

```tsx
      {/* FEATURES */}
      <section className="py-28 bg-gradient-to-b from-white to-rose-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <span className="inline-block px-4 py-1.5 bg-pink-100 text-pink-700 font-semibold text-sm rounded-full mb-4">
              FEATURES
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-3">
              하루 업무가 앱 하나로
            </h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              실장·직원이 매일 쓰는 6가지 기능
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {staffFeatures.map((feature) => {
              const Icon = feature.icon
              return (
                <div
                  key={feature.title}
                  className="group bg-white rounded-3xl p-8 transition-all hover:shadow-xl hover:-translate-y-1 border border-slate-100"
                >
                  <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${feature.color} flex items-center justify-center mb-6 shadow-lg`}>
                    <Icon className="w-7 h-7 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-3">{feature.title}</h3>
                  <p className="text-slate-600 leading-relaxed">{feature.description}</p>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-28 bg-gradient-to-br from-cyan-500 via-teal-500 to-emerald-500 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-96 h-96 bg-white/10 rounded-full filter blur-3xl -translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-white/10 rounded-full filter blur-3xl translate-x-1/2 translate-y-1/2" />

        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-6">
            오늘 퇴근은 정시에 🕕
          </h2>
          <p className="text-xl text-white/90 mb-10">
            앱 하나로 오늘 업무를 깔끔하게 끝내세요.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={onShowSignup}
              className="group px-10 py-4 bg-white text-slate-900 font-bold text-lg rounded-2xl transition-all shadow-xl hover:shadow-2xl hover:-translate-y-1 flex items-center gap-2 justify-center"
            >
              지금 바로 시작
              <ArrowRightIcon className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
            <button
              onClick={onShowLogin}
              className="px-10 py-4 border-2 border-white/40 text-white hover:bg-white/10 font-semibold text-lg rounded-2xl transition-all backdrop-blur-sm"
            >
              로그인
            </button>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-24 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">자주 묻는 질문</h2>
          </div>

          <div className="space-y-4">
            {staffFaqs.map((faq, i) => (
              <div key={i} className="bg-rose-50/50 rounded-2xl overflow-hidden border border-rose-100">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full px-6 py-5 flex items-center justify-between text-left hover:bg-rose-50 transition-colors"
                >
                  <span className="font-semibold text-slate-900 pr-4">{faq.q}</span>
                  <ChevronDownIcon
                    className={`w-5 h-5 text-slate-500 transition-transform duration-300 flex-shrink-0 ${openFaq === i ? 'rotate-180' : ''}`}
                  />
                </button>
                <div className={`overflow-hidden transition-all duration-300 ${openFaq === i ? 'max-h-48' : 'max-h-0'}`}>
                  <div className="px-6 pb-5">
                    <p className="text-slate-600 leading-relaxed">{faq.a}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
```

- [ ] **Step 2: lint 체크**

```bash
npm run lint
```
Expected: lint 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add src/components/Landing/StaffLanding.tsx
git commit -m "feat(landing): StaffLanding Features/CTA/FAQ 섹션 추가"
```

---

## Task 13: `/staff` 라우트

**Files:**
- Create: `src/app/staff/page.tsx`

- [ ] **Step 1: 페이지 작성**

`src/app/staff/page.tsx`:

```tsx
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
```

- [ ] **Step 2: 빌드 체크**

```bash
npm run build
```
Expected: `/staff` 라우트가 성공적으로 컴파일됨. 전체 빌드 성공.

- [ ] **Step 3: 커밋**

```bash
git add src/app/staff/page.tsx
git commit -m "feat(landing): /staff 라우트 추가"
```

---

## Task 14: 기존 AuthApp·LandingPage 제거

**Files:**
- Delete: `src/app/AuthApp.tsx`
- Delete: `src/components/Landing/LandingPage.tsx`

- [ ] **Step 1: 사용처 확인**

```bash
npm run lint 2>&1 | head -30
```

추가로 검색으로 남은 참조가 없는지 확인:

```bash
grep -r "from '@/app/AuthApp'" src/ 2>/dev/null
grep -r "from './AuthApp'" src/ 2>/dev/null
grep -r "from '@/components/Landing/LandingPage'" src/ 2>/dev/null
grep -r "from './LandingPage'" src/components/Landing/ 2>/dev/null
```

Expected: 아무 결과 없음. 있으면 해당 파일들을 먼저 수정해 참조 제거.

- [ ] **Step 2: 파일 삭제**

```bash
rm src/app/AuthApp.tsx
rm src/components/Landing/LandingPage.tsx
```

- [ ] **Step 3: 빌드 체크**

```bash
npm run build
```
Expected: 전체 빌드 성공. 타입 에러나 import 에러 없음.

- [ ] **Step 4: 커밋**

```bash
git add -A src/app/AuthApp.tsx src/components/Landing/LandingPage.tsx
git commit -m "refactor(landing): 기존 AuthApp·LandingPage 제거 (신규 구조로 대체)"
```

---

## Task 15: 최종 수동 검증 및 푸시

**검증 시나리오**: `npm run dev`로 실행하고 브라우저에서 다음을 확인.

- [ ] **Step 1: 개발 서버 실행**

```bash
npm run dev
```
백그라운드에서 실행하여 서버 로그 확인. `http://localhost:3000` 접속 가능해야 함.

- [ ] **Step 2: localStorage 초기 상태에서 `/` 확인**

1. 브라우저 DevTools → Application → Local Storage → `clinicmgr.visitor_role` 삭제
2. `http://localhost:3000/` 접속
3. 기대: 역할 선택 카드 2개가 보이고, 헤더에 로그인/시작하기 버튼 존재
4. 콘솔 에러 없음

- [ ] **Step 3: 역할 선택 → `/owner` 이동 확인**

1. "대표원장" 카드 클릭
2. 기대: `/owner`로 이동, localStorage에 `clinicmgr.visitor_role=owner` 저장됨
3. OwnerLanding 전체 섹션이 Hero → Problem → Solution → Features → Premium → Trust → CTA → FAQ 순으로 렌더링
4. "기능 살펴보기" 버튼 → Problem 섹션으로 스크롤
5. FAQ 항목 클릭 → 펼침/접힘 작동

- [ ] **Step 4: `/`로 돌아가 자동 리디렉션 확인**

1. 주소창에 `http://localhost:3000/` 입력
2. 기대: localStorage에 저장된 `owner` 값으로 자동 `/owner`로 리디렉션 (플래시 최소)

- [ ] **Step 5: localStorage 초기화 후 `/staff` 직접 접속**

1. DevTools에서 `clinicmgr.visitor_role` 삭제
2. `http://localhost:3000/staff` 접속
3. 기대: StaffLanding 렌더링, localStorage에 `staff` 저장됨
4. Hero → 공감 → 해결 → Features → CTA → FAQ 순 렌더링 확인
5. CTA/헤더 색상이 파스텔·시안 톤인지 확인

- [ ] **Step 6: 로그인/회원가입 플로우 확인**

1. `/owner`에서 "로그인" 클릭 → LoginForm 렌더링 확인
2. "뒤로" 또는 랜딩 복귀 → OwnerLanding 다시 보임
3. 테스트 계정 `whitedc0902@gmail.com` / `ghkdgmltn81!`로 로그인
4. 기대: `/dashboard`로 자동 리디렉션 (기존 동작 유지)
5. 로그아웃 후 `/staff`에서도 동일 확인

- [ ] **Step 7: 쿼리 파라미터 동작 확인**

1. `http://localhost:3000/owner?show=signup` 접속 → SignupForm 바로 표시
2. `http://localhost:3000/staff?show=login` 접속 → LoginForm 바로 표시

- [ ] **Step 8: 선택 기억 해제 버튼 확인**

1. localStorage에 값이 없는 상태에서 `/`에 접속
2. footer의 "선택 기억 해제" 버튼 클릭
3. 기대: 페이지 유지(리디렉션 안 됨), localStorage에 값 없음 유지

- [ ] **Step 9: 모바일 뷰 간단 확인**

DevTools 디바이스 모드로 폭 375px에서:
- `/`, `/owner`, `/staff` 모두 세로 스크롤만 생기고 가로 오버플로 없음
- CTA 버튼들이 세로로 쌓임
- Features 그리드가 1열로 변경됨

- [ ] **Step 10: 전체 빌드 최종 확인**

```bash
npm run build
npm run lint
```
Expected: 둘 다 에러 없이 성공

- [ ] **Step 11: develop 브랜치에 푸시**

```bash
git push origin develop
```
Expected: 성공. 실패 시 `git pull --rebase origin develop` 후 재시도.

---

## Rollback 전략

빌드 실패나 심각한 렌더링 이슈 발생 시:

```bash
# 마지막 안전 커밋 ID 확인 (4bb7cb6f: spec commit 직전)
git log --oneline -n 20

# 해당 커밋으로 소프트 리셋 후 변경사항 검토
git reset --soft 4bb7cb6f
```

단, Task별로 커밋이 분리되어 있으므로 실패한 Task만 해당 커밋을 `git revert`하는 것이 1차 선택이다.
