'use client'

import { useState, useEffect, useRef } from 'react'
import {
  ChevronDownIcon,
  CheckCircleIcon,
  ArrowRightIcon,
  SparklesIcon,
  ChartBarIcon,
  ClockIcon,
  DocumentTextIcon,
  CalendarDaysIcon,
  UserGroupIcon,
  ClipboardDocumentListIcon,
  LockClosedIcon,
  BoltIcon,
  HeartIcon,
} from '@heroicons/react/24/outline'

interface LandingPageProps {
  onShowSignup: () => void
  onShowLogin: () => void
}

// 스크롤 기반 애니메이션 훅
function useScrollAnimation() {
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

// 숫자 카운트업 컴포넌트
function CountUp({ end, suffix = '', duration = 2000 }: { end: number; suffix?: string; duration?: number }) {
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

export default function LandingPage({ onShowSignup, onShowLogin }: LandingPageProps) {
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  // 핵심 기능 목록
  const features = [
    {
      icon: ChartBarIcon,
      title: "일일 업무 보고서",
      description: "상담, 선물, 해피콜, 리콜 현황을 자동으로 기록하고 통계로 분석",
      color: "from-sky-500 to-blue-600",
    },
    {
      icon: ClockIcon,
      title: "출퇴근 관리",
      description: "QR 코드 체크인과 실시간 근태 현황 파악",
      color: "from-emerald-500 to-teal-600",
    },
    {
      icon: DocumentTextIcon,
      title: "근로계약서 관리",
      description: "전자서명으로 간편하게 계약서 생성과 관리",
      color: "from-violet-500 to-purple-600",
    },
    {
      icon: CalendarDaysIcon,
      title: "연차 관리",
      description: "연차 신청부터 승인, 정책 설정까지 체계적으로",
      color: "from-amber-500 to-orange-600",
    },
    {
      icon: UserGroupIcon,
      title: "직원 관리",
      description: "승인, 권한 설정, 활동 로그까지 한 번에",
      color: "from-blue-500 to-indigo-600",
    },
    {
      icon: ClipboardDocumentListIcon,
      title: "프로토콜 관리",
      description: "업무 프로토콜 문서화와 버전 관리",
      color: "from-rose-500 to-pink-600",
    }
  ]

  // FAQ 목록
  const faqs = [
    {
      question: "설치가 필요한가요?",
      answer: "아니요! 웹 기반 서비스로, 별도의 설치 없이 인터넷 브라우저에서 바로 사용하실 수 있습니다. PC, 태블릿, 스마트폰 어디서든 접속 가능합니다."
    },
    {
      question: "데이터는 안전한가요?",
      answer: "글로벌 클라우드 서비스를 통해 데이터를 암호화하여 안전하게 보관합니다. 자동 백업 기능으로 데이터 손실 걱정 없이 사용하실 수 있습니다."
    },
    {
      question: "직원 권한 설정이 가능한가요?",
      answer: "원장, 부원장, 실장, 팀장, 일반 직원 등 세분화된 역할 기반 권한 시스템을 제공합니다."
    },
    {
      question: "기존 데이터 이전이 가능한가요?",
      answer: "Excel 파일 등을 통한 데이터 이전을 지원합니다."
    }
  ]

  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      <style>{`
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(24px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes slideInLeft {
          from { opacity: 0; transform: translateX(-20px); }
          to { opacity: 1; transform: translateX(0); }
        }
        @keyframes gentlePulse {
          0%, 100% { opacity: 0.4; }
          50% { opacity: 0.7; }
        }
        @keyframes float {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-8px); }
        }
        .anim-fade-up {
          animation: fadeUp 0.7s cubic-bezier(0.22, 1, 0.36, 1) forwards;
          opacity: 0;
        }
        .anim-fade-in {
          animation: fadeIn 0.8s ease-out forwards;
          opacity: 0;
        }
        .anim-slide-left {
          animation: slideInLeft 0.7s cubic-bezier(0.22, 1, 0.36, 1) forwards;
          opacity: 0;
        }
      `}</style>

      {/* ===== HEADER ===== */}
      <header className="fixed top-0 left-0 right-0 bg-white/85 backdrop-blur-2xl z-50 border-b border-slate-100">
        <div className="max-w-6xl mx-auto px-5 sm:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 bg-slate-900 rounded-lg flex items-center justify-center">
                <span className="text-lg">🦷</span>
              </div>
              <span className="text-lg font-bold tracking-tight text-slate-900">클리닉 매니저</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onShowLogin}
                className="px-4 py-2 text-sm text-slate-500 hover:text-slate-900 font-medium transition-colors"
              >
                로그인
              </button>
              <button
                onClick={onShowSignup}
                className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold rounded-lg transition-all hover:shadow-lg"
              >
                무료로 시작
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ===== HERO SECTION ===== */}
      <section className="relative min-h-[100svh] flex items-center pt-16 overflow-hidden">
        {/* 배경: 따뜻한 크림/아이보리 그라데이션 */}
        <div className="absolute inset-0 bg-gradient-to-b from-stone-50 via-white to-slate-50" />

        {/* 미니멀 장식 요소 */}
        <div
          className="absolute top-32 right-[10%] w-[400px] h-[400px] rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(59, 130, 246, 0.06) 0%, transparent 70%)',
            animation: 'gentlePulse 6s ease-in-out infinite',
          }}
        />
        <div
          className="absolute bottom-32 left-[5%] w-[300px] h-[300px] rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(139, 92, 246, 0.05) 0%, transparent 70%)',
            animation: 'gentlePulse 8s ease-in-out infinite 2s',
          }}
        />

        {/* 미세한 도트 패턴 */}
        <div
          className="absolute inset-0 opacity-[0.3]"
          style={{
            backgroundImage: 'radial-gradient(circle, #cbd5e1 0.5px, transparent 0.5px)',
            backgroundSize: '32px 32px'
          }}
        />

        <div className="relative max-w-6xl mx-auto px-5 sm:px-8 w-full z-10">
          <div className="max-w-3xl">
            {/* 태그라인 */}
            <div className="anim-fade-up mb-8" style={{ animationDelay: '0.1s' }}>
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 tracking-wide">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                치과 전용 업무 플랫폼
              </span>
            </div>

            {/* 메인 카피 */}
            <h1 className="mb-8">
              <span
                className="anim-fade-up block text-4xl sm:text-5xl md:text-6xl font-bold text-slate-900 leading-[1.15] tracking-tight"
                style={{ animationDelay: '0.2s' }}
              >
                진료에만 집중하세요.
              </span>
              <span
                className="anim-fade-up block text-4xl sm:text-5xl md:text-6xl font-bold leading-[1.15] tracking-tight mt-2"
                style={{ animationDelay: '0.35s' }}
              >
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-violet-600">
                  나머지는 시스템이
                </span>{' '}
                <span className="text-slate-900">합니다.</span>
              </span>
            </h1>

            {/* 서브 카피 */}
            <p
              className="anim-fade-up text-lg sm:text-xl text-slate-500 max-w-xl leading-relaxed mb-10"
              style={{ animationDelay: '0.5s' }}
            >
              수기 기록, 엑셀 통계, 연차 계산에 쓰던 시간을
              <br className="hidden sm:block" />
              환자와 병원 성장에 쓰세요.
            </p>

            {/* CTA */}
            <div
              className="anim-fade-up flex flex-col sm:flex-row items-start gap-3 mb-16"
              style={{ animationDelay: '0.65s' }}
            >
              <button
                onClick={onShowSignup}
                className="group px-7 py-3.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl transition-all shadow-lg shadow-slate-900/10 hover:shadow-xl hover:shadow-slate-900/15 hover:-translate-y-0.5 flex items-center gap-2"
              >
                무료로 시작하기
                <ArrowRightIcon className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </button>
              <button
                onClick={() => document.getElementById('story-problem')?.scrollIntoView({ behavior: 'smooth' })}
                className="px-7 py-3.5 text-slate-500 hover:text-slate-700 font-medium transition-colors flex items-center gap-1.5"
              >
                어떤 서비스인가요?
                <ChevronDownIcon className="w-4 h-4" />
              </button>
            </div>

            {/* 신뢰 뱃지 */}
            <div
              className="anim-fade-up flex flex-wrap gap-4 sm:gap-6"
              style={{ animationDelay: '0.8s' }}
            >
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-emerald-500" />
                <span className="text-sm text-slate-400 font-medium">현직 원장이 만들고 직접 사용 중</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-blue-500" />
                <span className="text-sm text-slate-400 font-medium">설치 없이 웹에서 바로 시작</span>
              </div>
            </div>
          </div>
        </div>

        {/* 스크롤 힌트 */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2">
          <button
            onClick={() => document.getElementById('story-problem')?.scrollIntoView({ behavior: 'smooth' })}
            className="flex flex-col items-center gap-1 text-slate-300 hover:text-slate-500 transition-colors"
            style={{ animation: 'float 3s ease-in-out infinite' }}
          >
            <ChevronDownIcon className="w-5 h-5" />
          </button>
        </div>
      </section>

      {/* ===== THE PROBLEM ===== */}
      <section id="story-problem" className="relative py-28 sm:py-36 bg-slate-950">
        {/* 미세 그레인 텍스처 */}
        <div className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.5'/%3E%3C/svg%3E")`,
          }}
        />

        <div className="relative max-w-3xl mx-auto px-5 sm:px-8">
          <StoryBlock>
            <div className="flex items-center gap-3 mb-10">
              <div className="w-px h-8 bg-amber-500" />
              <span className="text-amber-400 font-semibold text-sm tracking-widest uppercase">Problem</span>
            </div>

            <h2 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-bold text-white leading-snug mb-8">
              원장님의 하루에서
              <br />
              <span className="text-amber-400">진료 외 업무</span>가 차지하는 비중,
              <br />
              생각보다 큽니다.
            </h2>

            <div className="space-y-5 mb-10">
              {[
                '매일 반복되는 수기 기록과 엑셀 정리',
                '직원 출퇴근, 연차, 근로계약서 관리',
                '상담·리콜·해피콜 현황 파악',
                '프로토콜 공유와 업데이트',
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-slate-500 mt-2.5 flex-shrink-0" />
                  <p className="text-lg text-slate-400">{item}</p>
                </div>
              ))}
            </div>

            <div className="bg-white/[0.04] backdrop-blur-sm rounded-2xl p-6 sm:p-8 border border-white/[0.06]">
              <p className="text-xl sm:text-2xl text-slate-300 leading-relaxed font-light">
                이런 업무들이 쌓이면 정작
                <br />
                <span className="text-white font-medium">환자 진료</span>와{' '}
                <span className="text-white font-medium">병원 성장</span>에
                쓸 에너지가 남지 않습니다.
              </p>
            </div>
          </StoryBlock>
        </div>
      </section>

      {/* ===== THE SOLUTION ===== */}
      <section className="relative py-28 sm:py-36 bg-white">
        <div className="max-w-3xl mx-auto px-5 sm:px-8">
          <StoryBlock>
            <div className="flex items-center gap-3 mb-10">
              <div className="w-px h-8 bg-blue-600" />
              <span className="text-blue-600 font-semibold text-sm tracking-widest uppercase">Solution</span>
            </div>

            <h2 className="text-3xl sm:text-4xl lg:text-[2.75rem] font-bold text-slate-900 leading-snug mb-10">
              반복 업무는 시스템에 맡기고,
              <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-violet-600">
                원장님은 진료에 집중하세요.
              </span>
            </h2>

            {/* Before / After */}
            <div className="grid sm:grid-cols-2 gap-5 mb-10">
              <div className="rounded-2xl p-6 sm:p-7 bg-slate-50 border border-slate-100">
                <span className="text-xs font-bold tracking-widest text-slate-400 uppercase">Before</span>
                <div className="mt-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-full bg-red-100 rounded-full h-2.5">
                      <div className="bg-red-400 h-2.5 rounded-full" style={{ width: '70%' }} />
                    </div>
                    <span className="text-sm text-red-500 font-semibold whitespace-nowrap">70%</span>
                  </div>
                  <p className="text-slate-500 text-sm leading-relaxed">
                    반복 업무에 에너지의 대부분을 소모
                  </p>
                </div>
              </div>

              <div className="rounded-2xl p-6 sm:p-7 bg-gradient-to-br from-blue-50 to-violet-50 border border-blue-100">
                <span className="text-xs font-bold tracking-widest text-blue-500 uppercase">After</span>
                <div className="mt-4 space-y-3">
                  <div className="flex items-center gap-3">
                    <div className="w-full bg-blue-100 rounded-full h-2.5">
                      <div className="bg-blue-500 h-2.5 rounded-full" style={{ width: '85%' }} />
                    </div>
                    <span className="text-sm text-blue-600 font-semibold whitespace-nowrap">85%</span>
                  </div>
                  <p className="text-slate-500 text-sm leading-relaxed">
                    핵심 업무에 집중할 수 있는 에너지 확보
                  </p>
                </div>
              </div>
            </div>

            <p className="text-lg text-slate-600 leading-relaxed">
              시스템이 반복을 처리하면, 원장님과 직원들은{' '}
              <span className="text-slate-900 font-semibold">더 가치 있는 일</span>에 집중할 수 있습니다.
            </p>
          </StoryBlock>
        </div>
      </section>

      {/* ===== DEVELOPER TRUST ===== */}
      <section className="relative py-28 sm:py-36 bg-stone-50">
        <div className="max-w-3xl mx-auto px-5 sm:px-8">
          <StoryBlock>
            <div className="text-center mb-14">
              <span className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600 tracking-wide mb-5">
                <SparklesIcon className="w-4 h-4" />
                Why Us
              </span>
              <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 leading-snug">
                현장을 아는 원장이
                <br />
                직접 만들었습니다.
              </h2>
            </div>

            <div className="bg-white rounded-2xl p-7 sm:p-10 shadow-sm border border-slate-100">
              <div className="flex items-center gap-5 mb-8 pb-8 border-b border-slate-100">
                <div className="w-16 h-16 bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl flex items-center justify-center flex-shrink-0">
                  <span className="text-2xl">👨‍⚕️</span>
                </div>
                <div>
                  <p className="text-sm text-slate-400 mb-0.5">만든 사람 = 쓰는 사람</p>
                  <p className="text-xl font-bold text-slate-900">현직 치과 원장</p>
                </div>
              </div>

              <div className="space-y-5">
                {[
                  { text: '현장의 불편함을 직접 겪고 해결한 솔루션', bold: '현장의 불편함' },
                  { text: '본인 병원에서 매일 사용하며 지속 개선 중', bold: '매일 사용' },
                  { text: '치과 업무 흐름을 정확히 이해한 맞춤 설계', bold: '정확히 이해' },
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <CheckCircleIcon className="w-5 h-5 text-emerald-500 flex-shrink-0 mt-0.5" />
                    <p className="text-slate-600">
                      <span className="font-semibold text-slate-800">{item.bold}</span>
                      {item.text.replace(item.bold, '')}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-8 pt-8 border-t border-slate-100">
                <blockquote className="text-slate-500 italic text-center text-[15px] leading-relaxed">
                  &ldquo;직접 쓰면서 불편한 건 바로 고칩니다.
                  <br />
                  제가 매일 쓰는 서비스니까요.&rdquo;
                </blockquote>
              </div>
            </div>
          </StoryBlock>
        </div>
      </section>

      {/* ===== FEATURES ===== */}
      <section id="features" className="py-28 sm:py-36 bg-white">
        <div className="max-w-6xl mx-auto px-5 sm:px-8">
          <div className="text-center mb-16">
            <span className="inline-block px-3.5 py-1 bg-slate-100 text-slate-500 font-semibold text-xs tracking-widest uppercase rounded-full mb-4">
              Features
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
              치과 운영에 필요한 모든 것
            </h2>
            <p className="text-lg text-slate-500 max-w-xl mx-auto">
              하나의 플랫폼에서 핵심 업무를 통합 관리하세요.
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((feature, i) => {
              const Icon = feature.icon
              return (
                <FeatureCard key={i} index={i}>
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${feature.color} flex items-center justify-center mb-5 shadow-sm`}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-800 mb-2">{feature.title}</h3>
                  <p className="text-slate-500 text-[15px] leading-relaxed">{feature.description}</p>
                </FeatureCard>
              )
            })}
          </div>

          <div className="mt-10 text-center">
            <p className="text-sm text-slate-400">
              + 급여 명세서, 병원 설정, PDF 내보내기 등 더 많은 기능을 제공합니다.
            </p>
          </div>
        </div>
      </section>

      {/* ===== STATS ===== */}
      <section className="py-20 sm:py-24 bg-slate-950 relative overflow-hidden">
        <div className="absolute inset-0 opacity-[0.15]"
          style={{
            backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.5'/%3E%3C/svg%3E")`,
          }}
        />
        <div className="relative max-w-5xl mx-auto px-5 sm:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 sm:gap-10">
            {[
              { value: 50, suffix: '%', label: '업무 시간 절감', accent: 'text-sky-400' },
              { value: 6, suffix: '가지', label: '핵심 기능 통합', accent: 'text-emerald-400' },
              { value: 0, suffix: '원', label: '초기 비용', accent: 'text-amber-400' },
              { value: 24, suffix: '/7', label: '언제 어디서든', accent: 'text-violet-400' },
            ].map((stat, i) => (
              <div key={i} className="text-center">
                <div className={`text-3xl sm:text-4xl md:text-5xl font-bold ${stat.accent} mb-1.5`}>
                  <CountUp end={stat.value} suffix={stat.suffix} />
                </div>
                <div className="text-sm text-slate-500 font-medium">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section className="relative py-28 sm:py-36 overflow-hidden">
        {/* 그라데이션 배경 */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900" />

        {/* 미세 빛 효과 */}
        <div
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full"
          style={{
            background: 'radial-gradient(circle, rgba(99, 102, 241, 0.12) 0%, transparent 60%)',
          }}
        />

        <div className="relative max-w-3xl mx-auto px-5 sm:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-5 leading-tight">
            더 나은 병원 운영,
            <br />
            오늘 시작하세요.
          </h2>
          <p className="text-lg text-slate-400 mb-10 max-w-lg mx-auto leading-relaxed">
            복잡한 설치 없이 웹 브라우저에서 바로.
            <br />
            지금 무료로 시작할 수 있습니다.
          </p>

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={onShowSignup}
              className="group px-8 py-4 bg-white text-slate-900 font-bold rounded-xl transition-all shadow-xl hover:shadow-2xl hover:-translate-y-0.5 flex items-center gap-2 justify-center"
            >
              무료로 시작하기
              <ArrowRightIcon className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
            </button>
            <button
              onClick={onShowLogin}
              className="px-8 py-4 border border-white/20 text-white hover:bg-white/5 font-semibold rounded-xl transition-all"
            >
              로그인
            </button>
          </div>
        </div>
      </section>

      {/* ===== FAQ ===== */}
      <section id="faq" className="py-24 sm:py-28 bg-stone-50">
        <div className="max-w-2xl mx-auto px-5 sm:px-8">
          <div className="text-center mb-14">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">자주 묻는 질문</h2>
          </div>

          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <div
                key={i}
                className="bg-white rounded-xl overflow-hidden border border-slate-100 transition-all hover:border-slate-200"
              >
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full px-6 py-5 flex items-center justify-between text-left"
                >
                  <span className="font-semibold text-slate-800 text-[15px] pr-4">{faq.question}</span>
                  <ChevronDownIcon
                    className={`w-4 h-4 text-slate-400 transition-transform duration-300 flex-shrink-0 ${openFaq === i ? 'rotate-180' : ''}`}
                  />
                </button>
                <div
                  className={`overflow-hidden transition-all duration-300 ${
                    openFaq === i ? 'max-h-48' : 'max-h-0'
                  }`}
                >
                  <div className="px-6 pb-5">
                    <p className="text-slate-500 text-[15px] leading-relaxed">{faq.answer}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ===== FOOTER ===== */}
      <footer className="bg-slate-950 border-t border-slate-900">
        <div className="max-w-6xl mx-auto px-5 sm:px-8 py-10">
          <div className="flex flex-col sm:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 bg-slate-800 rounded-lg flex items-center justify-center">
                <span className="text-base">🦷</span>
              </div>
              <span className="text-base font-bold text-white">클리닉 매니저</span>
            </div>
            <div className="flex items-center gap-4 text-slate-500 text-sm">
              <div className="flex items-center gap-1.5">
                <LockClosedIcon className="w-3.5 h-3.5" />
                <span>데이터 암호화 보호</span>
              </div>
              <span className="text-slate-700">|</span>
              <span>&copy; {new Date().getFullYear()} 클리닉 매니저</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

// 스토리 블록 컴포넌트 (스크롤 애니메이션)
function StoryBlock({ children }: { children: React.ReactNode }) {
  const { ref, isVisible } = useScrollAnimation()

  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${
        isVisible
          ? 'opacity-100 translate-y-0'
          : 'opacity-0 translate-y-8'
      }`}
    >
      {children}
    </div>
  )
}

// 기능 카드 컴포넌트
function FeatureCard({ children, index }: { children: React.ReactNode; index: number }) {
  const { ref, isVisible } = useScrollAnimation()

  return (
    <div
      ref={ref}
      className={`group bg-white hover:bg-slate-50/80 rounded-2xl p-7 transition-all duration-500 hover:shadow-lg hover:-translate-y-0.5 border border-slate-100 hover:border-slate-200 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'
      }`}
      style={{ transitionDelay: isVisible ? `${index * 80}ms` : '0ms' }}
    >
      {children}
    </div>
  )
}
