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
  LightBulbIcon,
  RocketLaunchIcon,
  CurrencyDollarIcon,
  GlobeAltIcon
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

// 타이핑 애니메이션 컴포넌트
function TypeWriter({ text, delay = 50 }: { text: string; delay?: number }) {
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
  const [scrollY, setScrollY] = useState(0)

  useEffect(() => {
    const handleScroll = () => setScrollY(window.scrollY)
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  // 핵심 기능 목록
  const features = [
    {
      icon: ChartBarIcon,
      title: "일일 업무 보고서",
      description: "상담, 선물, 해피콜, 리콜 현황을 자동으로 기록하고 통계로 분석",
    },
    {
      icon: ClockIcon,
      title: "출퇴근 관리",
      description: "QR 코드 체크인과 실시간 근태 현황 파악",
    },
    {
      icon: DocumentTextIcon,
      title: "근로계약서 관리",
      description: "전자서명으로 간편하게 계약서 생성과 관리",
    },
    {
      icon: CalendarDaysIcon,
      title: "연차 관리",
      description: "연차 신청부터 승인, 정책 설정까지 체계적으로",
    },
    {
      icon: UserGroupIcon,
      title: "직원 관리",
      description: "승인, 권한 설정, 활동 로그까지 한 번에",
    },
    {
      icon: ClipboardDocumentListIcon,
      title: "프로토콜 관리",
      description: "업무 프로토콜 문서화와 버전 관리",
    }
  ]

  // FAQ 목록
  const faqs = [
    {
      question: "설치가 필요한가요?",
      answer: "아니요. 웹 기반 서비스로, 별도의 설치 없이 인터넷 브라우저에서 바로 사용하실 수 있습니다. PC, 태블릿, 스마트폰 어디서든 접속 가능합니다."
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
    <div className="min-h-screen bg-[#FAFAFA] overflow-x-hidden">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 bg-white/90 backdrop-blur-xl z-50 border-b border-gray-200/60 shadow-card">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gray-900 rounded-xl flex items-center justify-center">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18" />
                </svg>
              </div>
              <span className="text-xl font-bold text-gray-900">클리닉 매니저</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={onShowLogin}
                className="min-h-[44px] px-4 py-2 text-gray-600 hover:text-gray-900 font-medium transition-colors duration-fast text-sm"
              >
                로그인
              </button>
              <button
                onClick={onShowSignup}
                className="min-h-[44px] px-5 py-2.5 bg-primary hover:bg-primary/90 text-white font-semibold rounded-xl transition-colors duration-fast text-sm shadow-button"
              >
                시작하기
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ========== HERO SECTION (Type D) ========== */}
      <section className="relative min-h-screen flex items-center justify-center pt-16 overflow-hidden bg-gray-950">
        {/* 배경 — 단색 + 단일 블루 광원 */}
        <div className="absolute inset-0 bg-gradient-to-b from-gray-950 via-gray-950 to-gray-900" />
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-blue-500/10 rounded-full filter blur-[160px]" />

        {/* 미세 그리드 */}
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px),
                             linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)`,
            backgroundSize: '64px 64px'
          }}
        />

        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center z-10">
          {/* 섹션 라벨 */}
          <div className="mb-10 opacity-0 animate-fade-in" style={{ animationDelay: '0.1s', animationFillMode: 'forwards' }}>
            <span className="inline-flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 text-blue-300 rounded-full text-label uppercase">
              <SparklesIcon className="w-3.5 h-3.5" />
              병원 경영의 본질
            </span>
          </div>

          {/* 메인 카피 */}
          <div className="mb-14">
            <style>{`
              @keyframes fadeIn {
                from { opacity: 0; transform: translateY(20px); }
                to { opacity: 1; transform: translateY(0); }
              }
              .animate-fade-in {
                animation: fadeIn 0.8s ease-out;
              }
            `}</style>

            <p
              className="block mb-4 text-gray-400 text-xl sm:text-2xl font-medium opacity-0 animate-fade-in"
              style={{ animationDelay: '0.2s', animationFillMode: 'forwards' }}
            >
              &ldquo;좋은 시스템 없이
            </p>
            <h1 className="text-display text-white leading-[1.1] tracking-tight mb-4">
              <span
                className="block text-blue-400 opacity-0 animate-fade-in"
                style={{ animationDelay: '0.4s', animationFillMode: 'forwards' }}
              >
                지속적인 성장은
              </span>
              <span
                className="block opacity-0 animate-fade-in"
                style={{ animationDelay: '0.6s', animationFillMode: 'forwards' }}
              >
                없다<span className="text-gray-500">&rdquo;</span>
              </span>
            </h1>
          </div>

          {/* 서브 카피 */}
          <p
            className="text-gray-400 text-title font-normal max-w-xl mx-auto mb-12 leading-relaxed opacity-0 animate-fade-in"
            style={{ animationDelay: '0.8s', animationFillMode: 'forwards' }}
          >
            반복되는 업무에서 벗어나,{' '}
            <span className="text-white font-semibold">본질에 집중</span>하는 병원 운영
          </p>

          {/* CTA 버튼 */}
          <div
            className="flex flex-col sm:flex-row gap-4 justify-center items-center mb-16 opacity-0 animate-fade-in"
            style={{ animationDelay: '1.0s', animationFillMode: 'forwards' }}
          >
            <button
              onClick={onShowSignup}
              className="group min-h-[52px] px-8 py-4 bg-primary hover:bg-primary/90 text-white font-bold text-base rounded-2xl transition-colors duration-fast shadow-button flex items-center gap-2"
            >
              지금 시작하기
              <ArrowRightIcon className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-fast" />
            </button>
            <button
              onClick={() => document.getElementById('story-2')?.scrollIntoView({ behavior: 'smooth' })}
              className="min-h-[52px] px-8 py-4 text-gray-400 hover:text-white font-medium transition-colors duration-fast flex items-center gap-2 text-base"
            >
              자세히 알아보기
              <ChevronDownIcon className="w-5 h-5" />
            </button>
          </div>

          {/* 신뢰 뱃지 */}
          <div
            className="flex justify-center items-center gap-6 sm:gap-8 opacity-0 animate-fade-in"
            style={{ animationDelay: '1.2s', animationFillMode: 'forwards' }}
          >
            <div className="flex items-center gap-2.5 px-4 py-2 bg-white/5 rounded-full border border-white/10">
              <div className="w-2 h-2 rounded-full bg-green-400" />
              <span className="text-label text-gray-300">현직 원장 개발</span>
            </div>
            <div className="flex items-center gap-2.5 px-4 py-2 bg-white/5 rounded-full border border-white/10">
              <div className="w-2 h-2 rounded-full bg-blue-400" />
              <span className="text-label text-gray-300">실제 병원 운영 중</span>
            </div>
          </div>
        </div>

        {/* 스크롤 안내 */}
        <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 animate-bounce">
          <button
            onClick={() => document.getElementById('story-2')?.scrollIntoView({ behavior: 'smooth' })}
            className="min-h-[44px] flex flex-col items-center gap-1 text-gray-600 hover:text-gray-400 transition-colors duration-fast"
          >
            <span className="text-label uppercase">Scroll</span>
            <ChevronDownIcon className="w-5 h-5" />
          </button>
        </div>
      </section>

      {/* ========== PROBLEM SECTION (Type B — 2-col contrast grid) ========== */}
      <section id="story-2" className="relative py-28 bg-gray-900">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <StoryBlock>
            <div className="flex items-center gap-4 mb-10">
              <div className="w-14 h-14 bg-yellow-500/15 rounded-2xl flex items-center justify-center">
                <BoltIcon className="w-7 h-7 text-yellow-400" />
              </div>
              <div>
                <span className="text-label uppercase text-yellow-400">The Problem</span>
                <h2 className="text-headline text-white mt-0.5">에너지의 한계</h2>
              </div>
            </div>

            <p className="text-2xl sm:text-3xl font-semibold text-white leading-relaxed mb-10">
              사람이 하루에 쓸 수 있는
              <br />
              <span className="text-yellow-400">정신적 에너지는 한정</span>되어 있습니다.
            </p>

            <div className="bg-gray-800/60 rounded-2xl p-6 sm:p-8 border border-gray-700/40 shadow-card">
              <p className="text-lg text-gray-300 leading-relaxed">
                매일 반복되는 <span className="text-white font-semibold">수기 기록</span>,
                <span className="text-white font-semibold"> 엑셀 통계</span>,
                <span className="text-white font-semibold"> 연차 계산</span>,
                <span className="text-white font-semibold"> 스케줄 관리</span>...
                <br /><br />
                이런 반복 업무에 에너지를 쏟다 보면,
                <br />
                정작 <span className="text-yellow-400 font-semibold">환자 진료</span>와 <span className="text-yellow-400 font-semibold">병원 성장</span>에
                집중할 에너지가 남지 않습니다.
              </p>
            </div>
          </StoryBlock>
        </div>
      </section>

      {/* ========== SOLUTION SECTION (Type A — Full card) ========== */}
      <section className="relative py-28 bg-[#FAFAFA]">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <StoryBlock>
            <div className="flex items-center gap-4 mb-10">
              <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center">
                <HeartIcon className="w-7 h-7 text-primary" />
              </div>
              <div>
                <span className="text-label uppercase text-primary">The Solution</span>
                <h2 className="text-headline text-gray-900 mt-0.5">본질에 집중하세요</h2>
              </div>
            </div>

            <p className="text-2xl sm:text-3xl font-semibold text-gray-800 leading-relaxed mb-10">
              좋은 시스템은
              <br />
              <span className="text-primary">
                반복 업무의 에너지를 줄여줍니다.
              </span>
            </p>

            <div className="grid sm:grid-cols-2 gap-5 mb-10">
              <div className="bg-card rounded-2xl p-6 border border-border shadow-card">
                <p className="text-label uppercase text-gray-400 mb-3">Before</p>
                <p className="text-gray-600 leading-relaxed">
                  반복 업무에 <span className="text-red-500 font-semibold">70%</span>의 에너지 소모
                  <br />
                  본질적 업무에 30%만 집중
                </p>
              </div>
              <div className="bg-accent/40 rounded-2xl p-6 border border-primary/20 shadow-card">
                <p className="text-label uppercase text-primary mb-3">After</p>
                <p className="text-gray-600 leading-relaxed">
                  반복 업무를 <span className="text-primary font-semibold">시스템</span>이 처리
                  <br />
                  <span className="text-primary font-semibold">본질에 집중</span>할 에너지 확보
                </p>
              </div>
            </div>

            <div className="text-center">
              <p className="text-lg text-gray-700 font-medium">
                그래야 <span className="text-primary font-bold">병원의 지속적인 성장</span>을 도모할 수 있습니다.
              </p>
            </div>
          </StoryBlock>
        </div>
      </section>

      {/* ========== DEVELOPER TRUST (Type C — testimonial/card) ========== */}
      <section className="relative py-28 bg-gray-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <StoryBlock>
            <div className="text-center mb-12">
              <span className="inline-flex items-center gap-2 px-4 py-2 bg-primary/10 text-primary rounded-full text-label uppercase mb-6">
                <SparklesIcon className="w-3.5 h-3.5" />
                Why Dental Manager?
              </span>
              <h2 className="text-headline text-gray-900 leading-tight">
                실제로 이러한 필요성을 느낀
                <br />
                <span className="text-primary">
                  치과 원장이 직접 개발했습니다
                </span>
              </h2>
            </div>

            <div className="bg-card rounded-2xl p-8 sm:p-10 shadow-card border border-border">
              <div className="flex flex-col sm:flex-row items-center gap-6 mb-8">
                <div className="w-20 h-20 bg-gray-900 rounded-2xl flex items-center justify-center flex-shrink-0">
                  <UserGroupIcon className="w-9 h-9 text-gray-300" />
                </div>
                <div className="text-center sm:text-left">
                  <p className="text-label uppercase text-gray-400 mb-1">개발자이자 사용자</p>
                  <p className="text-title text-gray-900">현직 치과 원장</p>
                </div>
              </div>

              <div className="space-y-4 mb-8">
                <div className="flex items-start gap-3">
                  <CheckCircleIcon className="w-6 h-6 text-green-500 flex-shrink-0 mt-0.5" />
                  <p className="text-base text-gray-700">
                    <span className="font-semibold">현장의 불편함</span>을 직접 경험하고 해결한 솔루션
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircleIcon className="w-6 h-6 text-green-500 flex-shrink-0 mt-0.5" />
                  <p className="text-base text-gray-700">
                    <span className="font-semibold">본인 병원에서 매일 사용</span>하며 지속적으로 개선 중
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircleIcon className="w-6 h-6 text-green-500 flex-shrink-0 mt-0.5" />
                  <p className="text-base text-gray-700">
                    치과 업무 흐름을 <span className="font-semibold">정확히 이해</span>한 맞춤형 설계
                  </p>
                </div>
              </div>

              <div className="pt-6 border-t border-border">
                <p className="text-gray-500 italic text-center text-base leading-relaxed">
                  &ldquo;직접 쓰면서 불편한 건 바로바로 고칩니다.<br />
                  제가 매일 쓰니까요.&rdquo;
                </p>
              </div>
            </div>
          </StoryBlock>
        </div>
      </section>

      {/* ========== FEATURES SECTION (Type B — 2×3 grid) ========== */}
      <section id="features" className="py-28 bg-[#FAFAFA]">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <span className="inline-block text-label uppercase text-primary mb-4">
              Features
            </span>
            <h2 className="text-headline text-gray-900 mb-4">
              반복 업무를 효율적으로 처리하세요
            </h2>
            <p className="text-base text-gray-500 max-w-xl mx-auto">
              치과 운영에 필요한 핵심 기능들을 하나의 플랫폼에서
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {features.map((feature, i) => {
              const Icon = feature.icon
              return (
                <FeatureCard key={i}>
                  <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mb-5">
                    <Icon className="w-6 h-6 text-primary" />
                  </div>
                  <h3 className="text-title text-gray-900 mb-2">{feature.title}</h3>
                  <p className="text-sm text-gray-500 leading-relaxed">{feature.description}</p>
                </FeatureCard>
              )
            })}
          </div>

          <div className="mt-10 text-center">
            <p className="text-sm text-gray-400">
              + 급여 명세서 관리, 병원 설정, PDF 내보내기 등 더 많은 기능
            </p>
          </div>
        </div>
      </section>

      {/* ========== STATS SECTION (Type D — dark full-bleed) ========== */}
      <section className="py-20 bg-gray-950">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8 text-center">
            {[
              { icon: ClockIcon, value: 50, suffix: '%', label: '업무 시간 단축' },
              { icon: RocketLaunchIcon, value: 6, suffix: '가지', label: '핵심 기능 통합' },
              { icon: CurrencyDollarIcon, value: 0, suffix: '원', label: '설치 비용' },
              { icon: GlobeAltIcon, value: 24, suffix: '/7', label: '언제든 접근' },
            ].map((stat, i) => {
              const Icon = stat.icon
              return (
                <div key={i} className="group">
                  <div className="flex justify-center mb-3">
                    <Icon className="w-9 h-9 text-blue-400 transition-transform duration-fast group-hover:scale-110" />
                  </div>
                  <div className="text-[40px] font-bold text-white leading-none mb-2 whitespace-nowrap">
                    <CountUp end={stat.value} suffix={stat.suffix} />
                  </div>
                  <div className="text-label uppercase text-gray-500">{stat.label}</div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* ========== FAQ SECTION (Type A — full card list) ========== */}
      <section id="faq" className="py-24 bg-gray-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <span className="inline-block text-label uppercase text-primary mb-4">FAQ</span>
            <h2 className="text-headline text-gray-900">자주 묻는 질문</h2>
          </div>

          <div className="space-y-3">
            {faqs.map((faq, i) => (
              <div key={i} className="bg-card rounded-2xl overflow-hidden shadow-card border border-border transition-shadow duration-fast hover:shadow-hover">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full min-h-[56px] px-6 py-4 flex items-center justify-between text-left hover:bg-gray-50 transition-colors duration-fast"
                >
                  <span className="font-semibold text-gray-800 pr-4 text-base">{faq.question}</span>
                  <ChevronDownIcon
                    className={`w-5 h-5 text-gray-400 transition-transform duration-300 flex-shrink-0 ${openFaq === i ? 'rotate-180' : ''}`}
                  />
                </button>
                <div
                  className={`overflow-hidden transition-all duration-300 ${
                    openFaq === i ? 'max-h-48' : 'max-h-0'
                  }`}
                >
                  <div className="px-6 pb-5">
                    <p className="text-gray-500 leading-relaxed text-sm">{faq.answer}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========== CTA SECTION (Type D — dark, single color) ========== */}
      <section className="py-28 bg-primary relative overflow-hidden">
        {/* 단일 밝기 톤 오버레이 — 그라디언트 없음 */}
        <div className="absolute inset-0 bg-blue-600/20" />

        <div className="relative max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <span className="inline-block text-label uppercase text-white/60 mb-6">시작하기</span>
          <h2 className="text-headline text-white mb-5 leading-tight">
            본질에 집중하는 병원 운영,
            <br />
            지금 시작하세요
          </h2>
          <p className="text-base text-white/70 mb-10 max-w-xl mx-auto leading-relaxed">
            복잡한 설치 없이, 웹 브라우저만 있으면 바로 시작할 수 있습니다.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={onShowSignup}
              className="group min-h-[52px] px-10 py-4 bg-white text-gray-900 font-bold text-base rounded-2xl transition-colors duration-fast shadow-modal flex items-center gap-2 justify-center hover:bg-gray-50"
            >
              무료로 시작하기
              <ArrowRightIcon className="w-5 h-5 group-hover:translate-x-1 transition-transform duration-fast" />
            </button>
            <button
              onClick={onShowLogin}
              className="min-h-[52px] px-10 py-4 border-2 border-white/30 text-white hover:bg-white/10 font-semibold text-base rounded-2xl transition-colors duration-fast"
            >
              로그인
            </button>
          </div>
        </div>
      </section>

      {/* ========== FOOTER ========== */}
      <footer className="bg-gray-950 border-t border-gray-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-gray-800 rounded-xl flex items-center justify-center">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 3H5a2 2 0 0 0-2 2v4m6-6h10a2 2 0 0 1 2 2v4M9 3v18m0 0h10a2 2 0 0 0 2-2V9M9 21H5a2 2 0 0 1-2-2V9m0 0h18" />
                </svg>
              </div>
              <span className="text-base font-bold text-white">클리닉 매니저</span>
            </div>
            <div className="flex items-center gap-4 text-gray-500 text-sm">
              <div className="flex items-center gap-2">
                <LockClosedIcon className="w-4 h-4" />
                <span>안전한 데이터 보호</span>
              </div>
              <span className="hidden sm:inline">|</span>
              <span>© 2024 클리닉 매니저</span>
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
      className={`transition-all duration-1000 ${
        isVisible
          ? 'opacity-100 translate-y-0'
          : 'opacity-0 translate-y-10'
      }`}
    >
      {children}
    </div>
  )
}

// 기능 카드 컴포넌트 (호버 애니메이션)
function FeatureCard({ children }: { children: React.ReactNode }) {
  const { ref, isVisible } = useScrollAnimation()

  return (
    <div
      ref={ref}
      className={`group bg-card rounded-2xl p-7 transition-all duration-300 shadow-card hover:shadow-hover border border-border ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
      }`}
    >
      {children}
    </div>
  )
}
