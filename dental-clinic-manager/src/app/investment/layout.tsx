'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter, usePathname } from 'next/navigation'
import Link from 'next/link'
import {
  TrendingUp,
  LayoutDashboard,
  Link2,
  Target,
  BarChart3,
  Briefcase,
  ArrowLeft,
  Menu,
  X,
  Loader2,
  Zap,
} from 'lucide-react'
import type { InvestmentTab } from '@/types/investment'
import Footer from '@/components/Layout/Footer'

interface NavItem {
  id: InvestmentTab | string
  label: string
  icon: React.ElementType
  href: string
}

const NAV_ITEMS: NavItem[] = [
  { id: 'dashboard', label: '대시보드', icon: LayoutDashboard, href: '/investment' },
  { id: 'connect', label: '계좌 연결', icon: Link2, href: '/investment/connect' },
  { id: 'strategy', label: '전략 관리', icon: Target, href: '/investment/strategy' },
  { id: 'daytrading', label: '단타 (분봉)', icon: Zap, href: '/investment/daytrading' },
  { id: 'trading', label: '자동매매', icon: TrendingUp, href: '/investment/trading' },
  { id: 'portfolio', label: '포트폴리오', icon: Briefcase, href: '/investment/portfolio' },
]

export default function InvestmentLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)

  // 미인증 사용자 리다이렉트
  useEffect(() => {
    if (!loading && !user) {
      router.replace('/')
    }
  }, [user, loading, router])

  // 모바일 메뉴 닫기 (라우트 변경 시)
  useEffect(() => {
    setIsMobileMenuOpen(false)
  }, [pathname])

  // 현재 활성 메뉴 판별
  const getActiveNav = (): string => {
    if (pathname === '/investment') return 'dashboard'
    for (const item of NAV_ITEMS) {
      if (item.href !== '/investment' && pathname.startsWith(item.href)) {
        return item.id
      }
    }
    return 'dashboard'
  }

  const activeNav = getActiveNav()

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-at-surface">
        <Loader2 className="w-8 h-8 animate-spin text-at-accent" />
      </div>
    )
  }

  if (!user) return null

  return (
    <div className="min-h-screen bg-at-surface-alt">
      {/* 헤더 */}
      <header className="fixed top-0 left-0 right-0 z-30 h-14 bg-at-surface border-b border-at-border">
        <div className="flex items-center justify-between h-full px-4">
          <div className="flex items-center gap-3">
            {/* 모바일 메뉴 토글 */}
            <button
              className="lg:hidden p-1.5 rounded-lg hover:bg-at-surface-hover"
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            >
              {isMobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>

            {/* 로고 */}
            <div className="flex items-center gap-2">
              <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-at-accent-light">
                <BarChart3 className="w-4 h-4 text-at-accent" />
              </div>
              <h1 className="text-base font-bold text-at-text hidden sm:block">투자 자동거래</h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* 대시보드로 돌아가기 */}
            <Link
              href="/dashboard"
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-at-text-secondary hover:text-at-text rounded-lg hover:bg-at-surface-hover transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              <span className="hidden sm:inline">대시보드</span>
            </Link>

            {/* 사용자 정보 */}
            <div className="text-sm text-at-text-secondary">
              {user.name || user.email}
            </div>
          </div>
        </div>
      </header>

      {/* 모바일 오버레이 */}
      {isMobileMenuOpen && (
        <div
          className="fixed inset-0 z-20 bg-black/50 lg:hidden"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}

      {/* 사이드바 */}
      <aside
        className={`fixed top-14 left-0 z-20 w-56 h-[calc(100vh-3.5rem)] bg-at-surface border-r border-at-border transition-transform duration-300 lg:translate-x-0 ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <nav className="flex flex-col p-3 gap-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const isActive = activeNav === item.id
            return (
              <Link
                key={item.id}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-at-accent-light text-at-accent'
                    : 'text-at-text-secondary hover:bg-at-surface-hover hover:text-at-text'
                }`}
              >
                <Icon className="w-4.5 h-4.5 flex-shrink-0" />
                {item.label}
              </Link>
            )
          })}
        </nav>

        {/* 하단: 모의투자/실전 상태 표시 */}
        <div className="absolute bottom-0 left-0 right-0 p-3 border-t border-at-border">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-at-surface-alt">
            <div className="w-2 h-2 rounded-full bg-amber-400" />
            <span className="text-xs text-at-text-secondary">모의투자 모드</span>
          </div>
        </div>
      </aside>

      {/* 메인 콘텐츠 */}
      <main className="pt-14 lg:pl-56 transition-[padding] duration-300">
        <div className="p-4 sm:p-6">
          {children}
        </div>
        <Footer />
      </main>
    </div>
  )
}
