'use client'

import { useState, useEffect, useRef } from 'react'
import {
  ChevronRightIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  SparklesIcon,
  ClockIcon,
  ChartBarIcon,
  UserGroupIcon,
  DocumentTextIcon,
  CalendarDaysIcon,
  ClipboardDocumentListIcon,
  BuildingOffice2Icon,
  ShieldCheckIcon,
  CpuChipIcon,
  GlobeAltIcon,
  LockClosedIcon,
  ArrowRightIcon
} from '@heroicons/react/24/outline'
import { StarIcon as StarSolid } from '@heroicons/react/24/solid'

interface LandingPageProps {
  onShowSignup: () => void
  onShowLogin: () => void
}

// 애니메이션을 위한 커스텀 훅
function useInView(options = {}) {
  const ref = useRef<HTMLDivElement>(null)
  const [isInView, setIsInView] = useState(false)

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setIsInView(true)
      }
    }, { threshold: 0.1, ...options })

    if (ref.current) {
      observer.observe(ref.current)
    }

    return () => observer.disconnect()
  }, [])

  return { ref, isInView }
}

// 숫자 카운트업 애니메이션 컴포넌트
function CountUp({ end, suffix = '', duration = 2000 }: { end: number; suffix?: string; duration?: number }) {
  const [count, setCount] = useState(0)
  const { ref, isInView } = useInView()

  useEffect(() => {
    if (!isInView) return

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
  }, [isInView, end, duration])

  return <span ref={ref}>{count}{suffix}</span>
}

export default function LandingPage({ onShowSignup, onShowLogin }: LandingPageProps) {
  const [openFaq, setOpenFaq] = useState<number | null>(null)
  const [activeFeature, setActiveFeature] = useState(0)

  // 주요 기능 목록
  const features = [
    {
      icon: ChartBarIcon,
      title: "일일 업무 보고서",
      description: "상담, 선물 증정, 해피콜, 리콜 현황을 체계적으로 기록하고 실시간 통계로 분석하세요.",
      details: ["환자 상담 기록 관리", "선물 증정 이력 추적", "해피콜 일정 관리", "특이사항 메모", "주간/월간/연간 통계"],
      color: "from-blue-500 to-cyan-500"
    },
    {
      icon: ClockIcon,
      title: "출퇴근 관리",
      description: "QR 코드 체크인, 실시간 근태 현황, 스케줄 관리까지 한 번에 해결하세요.",
      details: ["QR 코드 출퇴근 체크", "실시간 팀 현황 파악", "근무 스케줄 관리", "근태 통계 분석", "지각/조퇴 자동 추적"],
      color: "from-green-500 to-emerald-500"
    },
    {
      icon: DocumentTextIcon,
      title: "근로계약서 관리",
      description: "전자서명으로 간편하게! 계약서 생성부터 관리까지 디지털로 처리하세요.",
      details: ["계약서 템플릿 관리", "전자서명 지원", "계약 상태 추적", "직원 정보 자동 연동", "PDF 내보내기"],
      color: "from-purple-500 to-pink-500"
    },
    {
      icon: CalendarDaysIcon,
      title: "연차 관리",
      description: "연차 신청, 승인, 정책 설정까지. 복잡한 연차 관리를 간단하게 만들어드려요.",
      details: ["연차/반차/특별휴가 신청", "승인 워크플로우", "연차 정책 설정", "휴무일 관리", "연차 사용 현황 통계"],
      color: "from-orange-500 to-amber-500"
    },
    {
      icon: UserGroupIcon,
      title: "직원 관리",
      description: "직원 승인, 권한 설정, 활동 로그까지 체계적인 인사 관리 시스템.",
      details: ["신규 직원 승인", "역할별 권한 관리", "직원 정보 관리", "활동 로그 추적", "상태별 필터링"],
      color: "from-indigo-500 to-violet-500"
    },
    {
      icon: BuildingOffice2Icon,
      title: "병원 설정",
      description: "병원 정보, 진료 시간, 운영 설정을 완벽하게 관리하세요.",
      details: ["병원 기본 정보 관리", "진료 시간 설정", "휴무일 설정", "병원 로고 업로드", "공개 설정 관리"],
      color: "from-teal-500 to-cyan-500"
    },
    {
      icon: ClipboardDocumentListIcon,
      title: "프로토콜 관리",
      description: "치과 업무 프로토콜을 문서화하고 버전 관리하세요.",
      details: ["리치 텍스트 에디터", "이미지/테이블 삽입", "버전 이력 관리", "카테고리/태그 분류", "검색 기능"],
      color: "from-rose-500 to-pink-500"
    },
    {
      icon: DocumentTextIcon,
      title: "급여 명세서 관리",
      description: "직원별 급여 명세서를 손쉽게 생성하고 관리하세요.",
      details: ["급여 명세서 생성", "근로계약서 연동", "급여 항목 설정", "명세서 발급 이력", "PDF 내보내기"],
      color: "from-emerald-500 to-teal-500"
    }
  ]

  // FAQ 목록
  const faqs = [
    {
      question: "설치가 필요한가요?",
      answer: "아니요! 덴탈매니저는 웹 기반 서비스로, 별도의 설치 없이 인터넷 브라우저에서 바로 사용하실 수 있습니다. PC, 태블릿, 스마트폰 어디서든 접속 가능합니다."
    },
    {
      question: "데이터는 안전한가요?",
      answer: "덴탈매니저는 글로벌 클라우드 서비스를 통해 데이터를 암호화하여 안전하게 보관합니다. 자동 백업 기능으로 데이터 손실 걱정 없이 사용하실 수 있습니다."
    },
    {
      question: "급여 명세서 관리도 가능한가요?",
      answer: "네, 덴탈매니저에서 직원별 급여 명세서를 생성하고 관리할 수 있습니다. 근로계약서 정보와 연동하여 간편하게 급여 정보를 관리하세요."
    },
    {
      question: "직원 권한 설정이 가능한가요?",
      answer: "물론입니다. 원장, 부원장, 실장, 팀장, 일반 직원 등 세분화된 역할 기반 권한 시스템을 제공합니다. 각 직원에게 필요한 기능만 접근 권한을 부여할 수 있습니다."
    },
    {
      question: "기존 데이터 이전이 가능한가요?",
      answer: "네, Excel 파일 등을 통한 데이터 이전을 지원합니다. 필요하시다면 데이터 마이그레이션 지원도 받으실 수 있습니다."
    }
  ]

  // 자동 기능 슬라이드
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveFeature((prev) => (prev + 1) % features.length)
    }, 5000)
    return () => clearInterval(timer)
  }, [features.length])

  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      {/* Header - 고정 네비게이션 */}
      <header className="fixed top-0 left-0 right-0 bg-white/80 backdrop-blur-lg z-50 border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/25">
                <span className="text-xl">🦷</span>
              </div>
              <span className="text-xl font-bold bg-gradient-to-r from-slate-800 to-slate-600 bg-clip-text text-transparent">
                덴탈매니저
              </span>
            </div>
            <nav className="hidden md:flex items-center gap-8">
              <button
                onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
                className="text-slate-600 hover:text-blue-600 font-medium transition-colors"
              >
                기능
              </button>
              <button
                onClick={() => document.getElementById('pricing')?.scrollIntoView({ behavior: 'smooth' })}
                className="text-slate-600 hover:text-blue-600 font-medium transition-colors"
              >
                시작하기
              </button>
              <button
                onClick={() => document.getElementById('faq')?.scrollIntoView({ behavior: 'smooth' })}
                className="text-slate-600 hover:text-blue-600 font-medium transition-colors"
              >
                FAQ
              </button>
            </nav>
            <div className="flex items-center gap-3">
              <button
                onClick={onShowLogin}
                className="px-4 py-2 text-slate-700 hover:text-blue-600 font-medium transition-colors"
              >
                로그인
              </button>
              <button
                onClick={onShowSignup}
                className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-semibold rounded-xl transition-all shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 hover:-translate-y-0.5"
              >
                무료로 시작
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 lg:pt-40 lg:pb-32 overflow-hidden">
        {/* 배경 그라데이션 */}
        <div className="absolute inset-0 bg-gradient-to-br from-blue-50 via-white to-indigo-50" />
        <div className="absolute top-20 left-10 w-72 h-72 bg-blue-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse" />
        <div className="absolute bottom-20 right-10 w-72 h-72 bg-indigo-400 rounded-full mix-blend-multiply filter blur-3xl opacity-20 animate-pulse" style={{ animationDelay: '1s' }} />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center max-w-4xl mx-auto">
            {/* 배지 */}
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-blue-100 to-indigo-100 rounded-full mb-8 animate-bounce" style={{ animationDuration: '2s' }}>
              <SparklesIcon className="w-5 h-5 text-blue-600" />
              <span className="text-blue-700 font-semibold">치과 업무 관리의 새로운 표준</span>
            </div>

            {/* 메인 헤드라인 */}
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-slate-900 leading-tight mb-6">
              치과 업무 관리,
              <br />
              <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 bg-clip-text text-transparent">
                이제 스마트하게
              </span>
            </h1>

            <p className="text-lg sm:text-xl text-slate-600 mb-10 leading-relaxed max-w-2xl mx-auto">
              일일 보고서부터 출퇴근, 근로계약서, 연차 관리까지
              <br className="hidden sm:block" />
              치과 운영에 필요한 모든 기능을 한 곳에서
            </p>

            {/* CTA 버튼 */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <button
                onClick={onShowSignup}
                className="group px-8 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold text-lg rounded-2xl transition-all shadow-xl shadow-blue-500/30 hover:shadow-blue-500/50 hover:-translate-y-1 flex items-center gap-2"
              >
                무료로 시작하기
                <ArrowRightIcon className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
              </button>
              <button
                onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
                className="px-8 py-4 text-slate-700 font-semibold text-lg hover:text-blue-600 transition-colors flex items-center gap-2"
              >
                기능 살펴보기
                <ChevronDownIcon className="w-5 h-5 animate-bounce" />
              </button>
            </div>

            {/* 신뢰 지표 */}
            <div className="mt-16 flex flex-wrap justify-center items-center gap-8 text-slate-500">
              <div className="flex items-center gap-2">
                <ShieldCheckIcon className="w-5 h-5 text-green-500" />
                <span className="text-sm font-medium">안전한 데이터 보관</span>
              </div>
              <div className="flex items-center gap-2">
                <CpuChipIcon className="w-5 h-5 text-blue-500" />
                <span className="text-sm font-medium">설치 없이 바로 사용</span>
              </div>
              <div className="flex items-center gap-2">
                <GlobeAltIcon className="w-5 h-5 text-indigo-500" />
                <span className="text-sm font-medium">어디서든 접속 가능</span>
              </div>
            </div>
          </div>

          {/* 대시보드 미리보기 */}
          <div className="mt-20 relative">
            <div className="absolute inset-0 bg-gradient-to-t from-white via-transparent to-transparent z-10 pointer-events-none" />
            <div className="relative mx-auto max-w-5xl">
              <div className="bg-slate-900 rounded-t-2xl p-3 flex items-center gap-2">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <div className="w-3 h-3 rounded-full bg-yellow-500" />
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                </div>
                <div className="flex-1 text-center">
                  <span className="text-slate-400 text-sm">덴탈매니저 대시보드</span>
                </div>
              </div>
              <div className="bg-gradient-to-br from-slate-100 to-slate-200 rounded-b-2xl p-6 shadow-2xl">
                <div className="grid grid-cols-4 gap-4 mb-4">
                  {[
                    { label: '오늘 상담', value: '12건', color: 'blue' },
                    { label: '해피콜', value: '8건', color: 'green' },
                    { label: '출근 인원', value: '6명', color: 'purple' },
                    { label: '연차 신청', value: '2건', color: 'orange' },
                  ].map((stat, i) => (
                    <div key={i} className="bg-white rounded-xl p-4 shadow-sm">
                      <p className="text-slate-500 text-sm">{stat.label}</p>
                      <p className={`text-2xl font-bold text-${stat.color}-600`}>{stat.value}</p>
                    </div>
                  ))}
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2 bg-white rounded-xl p-4 h-40 shadow-sm">
                    <div className="flex justify-between items-center mb-4">
                      <span className="font-semibold text-slate-700">주간 통계</span>
                      <span className="text-sm text-slate-400">이번 주</span>
                    </div>
                    <div className="flex items-end gap-2 h-24">
                      {[40, 65, 55, 80, 70, 90, 75].map((h, i) => (
                        <div key={i} className="flex-1 bg-gradient-to-t from-blue-600 to-blue-400 rounded-t" style={{ height: `${h}%` }} />
                      ))}
                    </div>
                  </div>
                  <div className="bg-white rounded-xl p-4 shadow-sm">
                    <span className="font-semibold text-slate-700">팀 현황</span>
                    <div className="mt-3 space-y-2">
                      {['출근', '외근', '휴가'].map((status, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <div className={`w-2 h-2 rounded-full ${i === 0 ? 'bg-green-500' : i === 1 ? 'bg-blue-500' : 'bg-orange-500'}`} />
                          <span className="text-sm text-slate-600">{status}</span>
                          <span className="ml-auto text-sm font-medium">{[4, 1, 1][i]}명</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 문제 제기 섹션 */}
      <section className="py-20 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
              이런 고민, 하고 계시지 않나요?
            </h2>
            <p className="text-lg text-slate-600">
              많은 치과에서 겪고 있는 업무 관리의 어려움
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              { emoji: "📝", title: "수기 작성의 불편함", desc: "매일 반복되는 수기 기록과 정리에 많은 시간을 빼앗기고 계시나요?" },
              { emoji: "📊", title: "통계 작성의 어려움", desc: "엑셀로 통계를 내느라 퇴근 시간이 늦어지고 계시나요?" },
              { emoji: "📅", title: "스케줄 관리 혼란", desc: "직원들의 출퇴근, 연차를 따로따로 관리하느라 힘드시나요?" },
              { emoji: "📋", title: "계약서 관리 부담", desc: "종이 계약서를 찾고, 보관하고, 관리하는 게 번거로우시나요?" },
              { emoji: "🗄️", title: "분산된 데이터", desc: "업무 데이터가 여기저기 흩어져 있어 찾기 어려우시나요?" },
              { emoji: "👥", title: "정보 공유 어려움", desc: "직원 간 업무 인수인계가 제대로 되지 않아 불편하시나요?" },
            ].map((item, i) => (
              <div
                key={i}
                className="bg-white rounded-2xl p-6 shadow-sm hover:shadow-lg transition-shadow border border-slate-100"
              >
                <span className="text-4xl mb-4 block">{item.emoji}</span>
                <h3 className="text-lg font-bold text-slate-800 mb-2">{item.title}</h3>
                <p className="text-slate-600">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 해결책 - 기능 소개 섹션 */}
      <section id="features" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <span className="inline-block px-4 py-1.5 bg-blue-100 text-blue-700 font-semibold text-sm rounded-full mb-4">
              ALL-IN-ONE 솔루션
            </span>
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
              덴탈매니저 하나로 모두 해결
            </h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              치과 운영에 필요한 8가지 핵심 기능을 하나의 플랫폼에서 사용하세요
            </p>
          </div>

          {/* 기능 카드 그리드 */}
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 mb-16">
            {features.map((feature, i) => {
              const Icon = feature.icon
              return (
                <div
                  key={i}
                  onClick={() => setActiveFeature(i)}
                  className={`relative group cursor-pointer rounded-2xl p-6 transition-all duration-300 ${
                    activeFeature === i
                      ? 'bg-gradient-to-br ' + feature.color + ' text-white shadow-xl scale-105'
                      : 'bg-slate-50 hover:bg-slate-100'
                  }`}
                >
                  <Icon className={`w-10 h-10 mb-4 ${activeFeature === i ? 'text-white' : 'text-slate-700'}`} />
                  <h3 className={`text-lg font-bold mb-2 ${activeFeature === i ? 'text-white' : 'text-slate-800'}`}>
                    {feature.title}
                  </h3>
                  <p className={`text-sm ${activeFeature === i ? 'text-white/90' : 'text-slate-600'}`}>
                    {feature.description}
                  </p>
                  {activeFeature === i && (
                    <div className="absolute -bottom-2 left-1/2 transform -translate-x-1/2 w-4 h-4 rotate-45 bg-gradient-to-br from-blue-600 to-indigo-600" />
                  )}
                </div>
              )
            })}
          </div>

          {/* 선택된 기능 상세 */}
          <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl p-8 lg:p-12 text-white">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              <div>
                <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r ${features[activeFeature].color} mb-6`}>
                  {(() => {
                    const Icon = features[activeFeature].icon
                    return <Icon className="w-5 h-5" />
                  })()}
                  <span className="font-semibold">{features[activeFeature].title}</span>
                </div>
                <h3 className="text-3xl font-bold mb-4">
                  {features[activeFeature].title}
                </h3>
                <p className="text-slate-300 text-lg mb-8">
                  {features[activeFeature].description}
                </p>
                <ul className="space-y-3">
                  {features[activeFeature].details.map((detail, i) => (
                    <li key={i} className="flex items-center gap-3">
                      <CheckCircleIcon className="w-5 h-5 text-green-400 flex-shrink-0" />
                      <span className="text-slate-200">{detail}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="relative">
                <div className="bg-slate-700/50 rounded-2xl p-6 border border-slate-600">
                  <div className="space-y-4">
                    {features[activeFeature].details.map((detail, i) => (
                      <div key={i} className="flex items-center gap-4 p-3 bg-slate-800/50 rounded-xl">
                        <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${features[activeFeature].color} flex items-center justify-center`}>
                          <span className="text-white font-bold">{i + 1}</span>
                        </div>
                        <span className="text-slate-200">{detail}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* 기능 네비게이션 도트 */}
            <div className="flex justify-center gap-2 mt-8">
              {features.map((_, i) => (
                <button
                  key={i}
                  onClick={() => setActiveFeature(i)}
                  className={`w-2 h-2 rounded-full transition-all ${
                    activeFeature === i ? 'w-8 bg-white' : 'bg-slate-600 hover:bg-slate-500'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* 통계 섹션 */}
      <section className="py-20 bg-gradient-to-br from-blue-600 via-indigo-600 to-purple-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center text-white mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold mb-4">
              덴탈매니저로 달라지는 우리 치과
            </h2>
            <p className="text-blue-100 text-lg">
              데이터 기반의 체계적인 운영으로 업무 효율을 극대화하세요
            </p>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              { value: 50, suffix: '%', label: '업무 시간 단축', desc: '자동화된 기록과 통계 생성' },
              { value: 100, suffix: '%', label: '데이터 정확도', desc: '실시간 동기화로 오류 방지' },
              { value: 8, suffix: '가지', label: '핵심 기능 통합', desc: '하나의 플랫폼에서 모든 관리' },
              { value: 24, suffix: '/7', label: '언제든 접근', desc: '어디서든 업무 확인 가능' },
            ].map((stat, i) => (
              <div key={i} className="text-center">
                <div className="text-5xl font-bold text-white mb-2">
                  <CountUp end={stat.value} suffix={stat.suffix} />
                </div>
                <div className="text-xl font-semibold text-white mb-1">{stat.label}</div>
                <div className="text-blue-200">{stat.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 시작하기 섹션 */}
      <section id="pricing" className="py-20 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="relative bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl p-8 lg:p-12 overflow-hidden">
            {/* 배경 장식 */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-full filter blur-3xl opacity-20" />
            <div className="absolute bottom-0 left-0 w-64 h-64 bg-gradient-to-br from-purple-400 to-pink-500 rounded-full filter blur-3xl opacity-20" />

            <div className="relative text-center">
              <div className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full text-white font-bold text-lg mb-8">
                <SparklesIcon className="w-6 h-6" />
                ALL-IN-ONE
              </div>

              <h2 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-6">
                모든 기능을
                <br />
                <span className="bg-gradient-to-r from-blue-400 to-indigo-400 bg-clip-text text-transparent">
                  하나의 플랫폼에서
                </span>
              </h2>

              <p className="text-slate-300 text-lg mb-8 max-w-2xl mx-auto">
                복잡한 설치 과정 없이 바로 시작하세요.
                <br />
                웹 브라우저만 있으면 어디서든 사용할 수 있습니다.
              </p>

              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
                {[
                  "일일 업무 보고서",
                  "실시간 통계 분석",
                  "출퇴근 관리",
                  "근로계약서 전자서명",
                  "연차 관리",
                  "직원 권한 관리",
                  "프로토콜 문서화",
                  "급여 명세서 관리",
                  "클라우드 데이터 저장"
                ].map((feature, i) => (
                  <div key={i} className="flex items-center gap-2 text-slate-300">
                    <CheckCircleIcon className="w-5 h-5 text-blue-400 flex-shrink-0" />
                    <span>{feature}</span>
                  </div>
                ))}
              </div>

              <button
                onClick={onShowSignup}
                className="group px-10 py-4 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white font-bold text-xl rounded-2xl transition-all shadow-xl shadow-blue-500/30 hover:shadow-blue-500/50 hover:-translate-y-1 flex items-center gap-2 mx-auto"
              >
                지금 바로 시작하기
                <ArrowRightIcon className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* 사용자 후기 섹션 */}
      <section className="py-20 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
              사용자들의 이야기
            </h2>
            <p className="text-lg text-slate-600">
              덴탈매니저와 함께하는 치과들의 생생한 후기
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                name: "김OO 원장님",
                clinic: "서울 강남구 A치과",
                text: "매일 수기로 작성하던 업무 일지를 이제 클릭 몇 번으로 끝낼 수 있게 됐어요. 통계도 자동으로 나오니까 회의 준비 시간이 확 줄었습니다.",
                rating: 5
              },
              {
                name: "이OO 실장님",
                clinic: "경기 분당구 B치과",
                text: "직원들 연차 관리가 정말 편해졌어요. 예전엔 엑셀로 하나하나 계산했는데, 이제 시스템이 알아서 다 해주니까 실수도 없고 좋아요.",
                rating: 5
              },
              {
                name: "박OO 원장님",
                clinic: "부산 해운대구 C치과",
                text: "출퇴근 QR 체크 기능이 정말 편리해요. 지점이 여러 개인데 한 화면에서 전체 현황을 볼 수 있어서 관리가 수월합니다.",
                rating: 5
              }
            ].map((review, i) => (
              <div key={i} className="bg-white rounded-2xl p-8 shadow-sm hover:shadow-lg transition-shadow">
                <div className="flex items-center gap-1 mb-4">
                  {Array.from({ length: review.rating }).map((_, j) => (
                    <StarSolid key={j} className="w-5 h-5 text-yellow-400" />
                  ))}
                </div>
                <p className="text-slate-700 mb-6 leading-relaxed">"{review.text}"</p>
                <div className="border-t pt-4">
                  <p className="font-semibold text-slate-800">{review.name}</p>
                  <p className="text-sm text-slate-500">{review.clinic}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ 섹션 */}
      <section id="faq" className="py-20 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
              자주 묻는 질문
            </h2>
            <p className="text-lg text-slate-600">
              궁금한 점이 있으시면 확인해보세요
            </p>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, i) => (
              <div key={i} className="border border-slate-200 rounded-2xl overflow-hidden">
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

      {/* 최종 CTA 섹션 */}
      <section className="py-20 bg-gradient-to-br from-slate-900 to-slate-800">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-6">
            더 스마트한 치과 운영,
            <br />
            지금 바로 시작하세요
          </h2>
          <p className="text-slate-300 text-lg mb-10">
            설치 없이, 비용 없이, 바로 시작할 수 있습니다.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={onShowSignup}
              className="group px-10 py-4 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white font-bold text-xl rounded-2xl transition-all shadow-xl shadow-blue-500/30 hover:shadow-blue-500/50 hover:-translate-y-1 flex items-center gap-2 justify-center"
            >
              무료로 시작하기
              <ArrowRightIcon className="w-6 h-6 group-hover:translate-x-1 transition-transform" />
            </button>
            <button
              onClick={onShowLogin}
              className="px-10 py-4 border-2 border-slate-600 text-slate-300 hover:text-white hover:border-slate-500 font-semibold text-lg rounded-2xl transition-colors"
            >
              이미 계정이 있으신가요?
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="grid md:grid-cols-4 gap-8">
            <div className="md:col-span-2">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 bg-gradient-to-br from-blue-600 to-indigo-600 rounded-xl flex items-center justify-center">
                  <span className="text-xl">🦷</span>
                </div>
                <span className="text-xl font-bold text-white">덴탈매니저</span>
              </div>
              <p className="text-slate-400 max-w-md">
                치과 업무 관리의 새로운 표준. 일일 보고서부터 인사 관리까지,
                덴탈매니저와 함께 더 효율적인 치과 운영을 경험하세요.
              </p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">기능</h4>
              <ul className="space-y-2 text-slate-400">
                <li>일일 업무 보고서</li>
                <li>출퇴근 관리</li>
                <li>근로계약서</li>
                <li>연차 관리</li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">지원</h4>
              <ul className="space-y-2 text-slate-400">
                <li>이용 가이드</li>
                <li>FAQ</li>
                <li>문의하기</li>
              </ul>
            </div>
          </div>
          <div className="border-t border-slate-800 mt-12 pt-8 flex flex-col md:flex-row justify-between items-center">
            <p className="text-slate-500 text-sm">
              © 2024 덴탈매니저. All rights reserved.
            </p>
            <div className="flex items-center gap-2 mt-4 md:mt-0">
              <LockClosedIcon className="w-4 h-4 text-slate-500" />
              <span className="text-slate-500 text-sm">안전한 데이터 보호</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}
