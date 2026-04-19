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
