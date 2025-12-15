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
  LightBulbIcon
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
      color: "from-blue-500 to-cyan-500"
    },
    {
      icon: ClockIcon,
      title: "출퇴근 관리",
      description: "QR 코드 체크인과 실시간 근태 현황 파악",
      color: "from-green-500 to-emerald-500"
    },
    {
      icon: DocumentTextIcon,
      title: "근로계약서 관리",
      description: "전자서명으로 간편하게 계약서 생성과 관리",
      color: "from-purple-500 to-pink-500"
    },
    {
      icon: CalendarDaysIcon,
      title: "연차 관리",
      description: "연차 신청부터 승인, 정책 설정까지 체계적으로",
      color: "from-orange-500 to-amber-500"
    },
    {
      icon: UserGroupIcon,
      title: "직원 관리",
      description: "승인, 권한 설정, 활동 로그까지 한 번에",
      color: "from-indigo-500 to-violet-500"
    },
    {
      icon: ClipboardDocumentListIcon,
      title: "프로토콜 관리",
      description: "업무 프로토콜 문서화와 버전 관리",
      color: "from-rose-500 to-pink-500"
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
      answer: "물론입니다. 원장, 부원장, 실장, 팀장, 일반 직원 등 세분화된 역할 기반 권한 시스템을 제공합니다."
    },
    {
      question: "기존 데이터 이전이 가능한가요?",
      answer: "네, Excel 파일 등을 통한 데이터 이전을 지원합니다."
    }
  ]

  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 bg-white/90 backdrop-blur-lg z-50 border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl flex items-center justify-center shadow-lg">
                <span className="text-xl">🦷</span>
              </div>
              <span className="text-xl font-bold text-slate-800">덴탈매니저</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={onShowLogin}
                className="px-4 py-2 text-slate-600 hover:text-slate-900 font-medium transition-colors"
              >
                로그인
              </button>
              <button
                onClick={onShowSignup}
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl transition-all"
              >
                시작하기
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* ========== STORY SECTION 1: 후킹 - 명언 ========== */}
      <section className="relative min-h-screen flex items-center justify-center pt-16">
        {/* 배경 */}
        <div className="absolute inset-0 bg-gradient-to-b from-slate-50 to-white" />
        <div
          className="absolute inset-0 opacity-30"
          style={{
            backgroundImage: `radial-gradient(circle at 25% 25%, rgba(59, 130, 246, 0.1) 0%, transparent 50%),
                             radial-gradient(circle at 75% 75%, rgba(99, 102, 241, 0.1) 0%, transparent 50%)`
          }}
        />

        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          {/* 작은 라벨 */}
          <div className="mb-8">
            <span className="inline-flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-600 rounded-full text-sm font-medium">
              <LightBulbIcon className="w-4 h-4" />
              병원 경영의 본질
            </span>
          </div>

          {/* 메인 명언 */}
          <blockquote className="mb-12">
            <p className="text-3xl sm:text-4xl lg:text-5xl font-bold text-slate-800 leading-tight tracking-tight">
              <span className="block mb-4">
                "좋은 시스템이 지속적인 성장을
              </span>
              <span className="block mb-4">
                <span className="text-slate-400">담보할 수는 없지만</span>
              </span>
              <span className="block">
                좋은 시스템 <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">없이는</span>
              </span>
              <span className="block mt-4">
                지속적인 성장이 <span className="underline decoration-blue-500 decoration-4 underline-offset-8">불가능</span>하다"
              </span>
            </p>
          </blockquote>

          {/* 스크롤 안내 */}
          <div className="absolute bottom-12 left-1/2 transform -translate-x-1/2 animate-bounce">
            <button
              onClick={() => document.getElementById('story-2')?.scrollIntoView({ behavior: 'smooth' })}
              className="flex flex-col items-center gap-2 text-slate-400 hover:text-slate-600 transition-colors"
            >
              <span className="text-sm font-medium">스크롤하여 계속</span>
              <ChevronDownIcon className="w-6 h-6" />
            </button>
          </div>
        </div>
      </section>

      {/* ========== STORY SECTION 2: 에너지의 한계 ========== */}
      <section id="story-2" className="relative py-32 bg-slate-900">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <StoryBlock>
            <div className="flex items-center gap-4 mb-8">
              <div className="w-16 h-16 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl flex items-center justify-center">
                <BoltIcon className="w-8 h-8 text-white" />
              </div>
              <div>
                <span className="text-amber-400 font-semibold text-sm tracking-wider uppercase">The Problem</span>
                <h2 className="text-2xl font-bold text-white">에너지의 한계</h2>
              </div>
            </div>

            <p className="text-2xl sm:text-3xl lg:text-4xl font-medium text-white leading-relaxed mb-8">
              사람이 하루에 쓸 수 있는
              <br />
              <span className="text-amber-400">정신적 에너지는 한정</span>되어 있습니다.
            </p>

            <div className="bg-slate-800/50 rounded-2xl p-6 sm:p-8 border border-slate-700">
              <p className="text-lg sm:text-xl text-slate-300 leading-relaxed">
                매일 반복되는 <span className="text-white font-semibold">수기 기록</span>,
                <span className="text-white font-semibold"> 엑셀 통계</span>,
                <span className="text-white font-semibold"> 연차 계산</span>,
                <span className="text-white font-semibold"> 스케줄 관리</span>...
                <br /><br />
                이런 반복 업무에 에너지를 쏟다 보면,
                <br />
                정작 <span className="text-amber-400 font-semibold">환자 진료</span>와 <span className="text-amber-400 font-semibold">병원 성장</span>에
                집중할 에너지가 남지 않습니다.
              </p>
            </div>
          </StoryBlock>
        </div>
      </section>

      {/* ========== STORY SECTION 3: 본질에 집중하라 ========== */}
      <section className="relative py-32 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <StoryBlock>
            <div className="flex items-center gap-4 mb-8">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center">
                <HeartIcon className="w-8 h-8 text-white" />
              </div>
              <div>
                <span className="text-blue-600 font-semibold text-sm tracking-wider uppercase">The Solution</span>
                <h2 className="text-2xl font-bold text-slate-800">본질에 집중하세요</h2>
              </div>
            </div>

            <p className="text-2xl sm:text-3xl lg:text-4xl font-medium text-slate-800 leading-relaxed mb-8">
              좋은 시스템은
              <br />
              <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                반복 업무의 에너지를 줄여줍니다.
              </span>
            </p>

            <div className="grid sm:grid-cols-2 gap-6 mb-8">
              <div className="bg-slate-50 rounded-2xl p-6 border border-slate-100">
                <div className="text-4xl mb-4">🔄</div>
                <h3 className="font-bold text-slate-800 mb-2">Before</h3>
                <p className="text-slate-600">
                  반복 업무에 <span className="text-red-500 font-semibold">70%</span>의 에너지 소모
                  <br />
                  본질적 업무에 30%만 집중
                </p>
              </div>
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-6 border border-blue-100">
                <div className="text-4xl mb-4">✨</div>
                <h3 className="font-bold text-slate-800 mb-2">After</h3>
                <p className="text-slate-600">
                  반복 업무를 <span className="text-blue-600 font-semibold">시스템</span>이 처리
                  <br />
                  <span className="text-blue-600 font-semibold">본질에 집중</span>할 에너지 확보
                </p>
              </div>
            </div>

            <div className="text-center">
              <p className="text-xl text-slate-700 font-medium">
                그래야 <span className="text-blue-600 font-bold">병원의 지속적인 성장</span>을 도모할 수 있습니다.
              </p>
            </div>
          </StoryBlock>
        </div>
      </section>

      {/* ========== STORY SECTION 4: 신뢰 - 원장이 직접 개발 ========== */}
      <section className="relative py-32 bg-gradient-to-br from-slate-50 to-blue-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <StoryBlock>
            <div className="text-center mb-12">
              <span className="inline-flex items-center gap-2 px-4 py-2 bg-blue-100 text-blue-700 rounded-full text-sm font-semibold mb-6">
                <SparklesIcon className="w-4 h-4" />
                Why Dental Manager?
              </span>
              <h2 className="text-3xl sm:text-4xl font-bold text-slate-800 leading-tight">
                실제로 이러한 필요성을 느낀
                <br />
                <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                  치과 원장이 직접 개발했습니다
                </span>
              </h2>
            </div>

            <div className="bg-white rounded-3xl p-8 sm:p-10 shadow-xl border border-slate-100">
              <div className="flex flex-col sm:flex-row items-center gap-6 mb-8">
                <div className="w-20 h-20 bg-gradient-to-br from-slate-700 to-slate-900 rounded-2xl flex items-center justify-center shadow-lg">
                  <span className="text-3xl">👨‍⚕️</span>
                </div>
                <div className="text-center sm:text-left">
                  <p className="text-slate-500 text-sm mb-1">개발자이자 사용자</p>
                  <p className="text-2xl font-bold text-slate-800">현직 치과 원장</p>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <CheckCircleIcon className="w-6 h-6 text-green-500 flex-shrink-0 mt-0.5" />
                  <p className="text-lg text-slate-700">
                    <span className="font-semibold">현장의 불편함</span>을 직접 경험하고 해결한 솔루션
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircleIcon className="w-6 h-6 text-green-500 flex-shrink-0 mt-0.5" />
                  <p className="text-lg text-slate-700">
                    <span className="font-semibold">본인 병원에서 매일 사용</span>하며 지속적으로 개선 중
                  </p>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircleIcon className="w-6 h-6 text-green-500 flex-shrink-0 mt-0.5" />
                  <p className="text-lg text-slate-700">
                    치과 업무 흐름을 <span className="font-semibold">정확히 이해</span>한 맞춤형 설계
                  </p>
                </div>
              </div>

              <div className="mt-8 pt-8 border-t border-slate-100">
                <p className="text-slate-600 italic text-center">
                  "직접 쓰면서 불편한 건 바로바로 고칩니다.<br />
                  제가 매일 쓰니까요."
                </p>
              </div>
            </div>
          </StoryBlock>
        </div>
      </section>

      {/* ========== FEATURES SECTION ========== */}
      <section id="features" className="py-32 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <span className="inline-block px-4 py-1.5 bg-slate-100 text-slate-600 font-semibold text-sm rounded-full mb-4">
              FEATURES
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
              반복 업무를 시스템이 대신합니다
            </h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              치과 운영에 필요한 핵심 기능들을 하나의 플랫폼에서
            </p>
          </div>

          {/* 기능 그리드 */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {features.map((feature, i) => {
              const Icon = feature.icon
              return (
                <FeatureCard key={i}>
                  <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${feature.color} flex items-center justify-center mb-6 shadow-lg`}>
                    <Icon className="w-7 h-7 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-800 mb-3">{feature.title}</h3>
                  <p className="text-slate-600">{feature.description}</p>
                </FeatureCard>
              )
            })}
          </div>

          {/* 추가 기능 언급 */}
          <div className="mt-12 text-center">
            <p className="text-slate-500">
              + 급여 명세서 관리, 병원 설정, PDF 내보내기 등 더 많은 기능
            </p>
          </div>
        </div>
      </section>

      {/* ========== STATS SECTION ========== */}
      <section className="py-20 bg-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8 text-center">
            {[
              { value: 50, suffix: '%', label: '업무 시간 단축' },
              { value: 6, suffix: '가지', label: '핵심 기능 통합' },
              { value: 0, suffix: '원', label: '설치 비용' },
              { value: 24, suffix: '/7', label: '언제든 접근' },
            ].map((stat, i) => (
              <div key={i}>
                <div className="text-4xl sm:text-5xl font-bold text-white mb-2">
                  <CountUp end={stat.value} suffix={stat.suffix} />
                </div>
                <div className="text-slate-400">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========== CTA SECTION ========== */}
      <section className="py-32 bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-700 relative overflow-hidden">
        {/* 배경 장식 */}
        <div className="absolute top-0 left-0 w-96 h-96 bg-white/10 rounded-full filter blur-3xl -translate-x-1/2 -translate-y-1/2" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-white/10 rounded-full filter blur-3xl translate-x-1/2 translate-y-1/2" />

        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-6">
            본질에 집중하는 병원 운영,
            <br />
            지금 시작하세요
          </h2>
          <p className="text-xl text-white/80 mb-10 max-w-2xl mx-auto">
            복잡한 설치 없이, 웹 브라우저만 있으면
            <br />
            바로 시작할 수 있습니다.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={onShowSignup}
              className="group px-10 py-4 bg-white text-slate-900 font-bold text-lg rounded-2xl transition-all shadow-xl hover:shadow-2xl hover:-translate-y-1 flex items-center gap-2 justify-center"
            >
              무료로 시작하기
              <ArrowRightIcon className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </button>
            <button
              onClick={onShowLogin}
              className="px-10 py-4 border-2 border-white/30 text-white hover:bg-white/10 font-semibold text-lg rounded-2xl transition-colors"
            >
              로그인
            </button>
          </div>
        </div>
      </section>

      {/* ========== FAQ SECTION ========== */}
      <section id="faq" className="py-24 bg-slate-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl font-bold text-slate-900 mb-4">자주 묻는 질문</h2>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, i) => (
              <div key={i} className="bg-white rounded-2xl overflow-hidden shadow-sm">
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full px-6 py-5 flex items-center justify-between text-left hover:bg-slate-50 transition-colors"
                >
                  <span className="font-semibold text-slate-800">{faq.question}</span>
                  <ChevronDownIcon
                    className={`w-5 h-5 text-slate-500 transition-transform ${openFaq === i ? 'rotate-180' : ''}`}
                  />
                </button>
                {openFaq === i && (
                  <div className="px-6 pb-5">
                    <p className="text-slate-600 leading-relaxed">{faq.answer}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ========== FOOTER ========== */}
      <footer className="bg-slate-900 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center gap-3 mb-4 md:mb-0">
              <div className="w-10 h-10 bg-gradient-to-br from-slate-700 to-slate-800 rounded-xl flex items-center justify-center">
                <span className="text-xl">🦷</span>
              </div>
              <span className="text-xl font-bold text-white">덴탈매니저</span>
            </div>
            <div className="flex items-center gap-4 text-slate-400 text-sm">
              <div className="flex items-center gap-2">
                <LockClosedIcon className="w-4 h-4" />
                <span>안전한 데이터 보호</span>
              </div>
              <span>|</span>
              <span>© 2024 덴탈매니저</span>
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
      className={`bg-slate-50 hover:bg-white rounded-2xl p-8 transition-all duration-500 hover:shadow-xl hover:-translate-y-1 border border-slate-100 ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-10'
      }`}
    >
      {children}
    </div>
  )
}
