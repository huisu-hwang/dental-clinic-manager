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
  GiftIcon,
  HeartIcon,
  SparklesIcon,
  CheckCircleIcon,
  CpuChipIcon,
  PresentationChartLineIcon,
  PencilSquareIcon,
} from '@heroicons/react/24/outline'
import LandingHeader from './shared/LandingHeader'
import { useScrollAnimation } from './shared/useScrollAnimation'
import { useAuthFlow } from './shared/AuthFlow'

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
  { icon: GiftIcon, label: '선물 재고 확인' },
  { icon: DocumentTextIcon, label: '상담 기록 정리' },
]

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

const ownerFaqs = [
  { q: '설치가 필요한가요?', a: '아니요. 웹 브라우저에서 바로 사용 가능합니다. PC·태블릿·스마트폰 어디서든 접속됩니다.' },
  { q: '데이터는 안전한가요?', a: '글로벌 클라우드 인프라에서 암호화되어 저장되며, 자동 백업으로 손실 없이 보관됩니다.' },
  { q: '직원 권한 설정이 가능한가요?', a: '원장·부원장·실장·팀장·일반 직원 등 역할별 권한을 세분화해 설정할 수 있습니다.' },
  { q: '기존 데이터 이전이 가능한가요?', a: 'Excel 파일 등을 통한 기존 데이터 이전을 지원합니다.' },
  { q: '프리미엄 패키지는 무엇이 다른가요?', a: '기본 기능은 그대로 사용 가능하며, 유료 기능으로 AI 데이터 분석·경영현황 대시보드·마케팅 자동화(네이버 블로그)가 포함됩니다.' },
]

export default function OwnerLanding() {
  const { onShowLogin, onShowSignup } = useAuthFlow()
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
              반복 업무에
            </span>
            <span className="block">지치게 하지 마세요</span>
          </h1>

          <p className="text-slate-300 text-lg sm:text-xl max-w-2xl mx-auto mb-12 leading-relaxed">
            업무는 시스템에 맡기고,{' '}
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
              <span className="text-amber-400">반복 업무</span>들.
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
                반복 업무에 쓰는 에너지를 줄여{' '}
                <span className="text-amber-400 font-semibold">상담에 집중</span>할 수 있게 해주세요.
              </p>
            </div>
          </StoryBlock>
        </div>
      </section>

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
                <h2 className="text-2xl font-bold text-at-text">업무는 시스템에게, 실장은 매출에 집중</h2>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-6 mb-8">
              <div className="bg-at-surface-alt rounded-2xl p-6 border border-at-border shadow-at-card">
                <div className="text-4xl mb-4">🔁</div>
                <h3 className="font-bold text-at-text mb-2">Before</h3>
                <p className="text-at-text-secondary">
                  반복 업무에 <span className="text-red-500 font-semibold">집중력과 체력이 소진</span>되면
                  상담, 리콜에 쓸 에너지가 부족해집니다.
                </p>
              </div>
              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-6 border border-at-border shadow-at-card">
                <div className="text-4xl mb-4">✨</div>
                <h3 className="font-bold text-at-text mb-2">After</h3>
                <p className="text-at-text-secondary">
                  업무는 시스템이 처리하고, 실장은{' '}
                  <span className="text-at-accent font-semibold">상담, 리콜</span>에 집중합니다.
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
              <SparklesIcon className="w-4 h-4" /> PREMIUM · 유료 기능
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
                  &quot;직접 쓰면서 불편한 건 바로바로 고칩니다.<br />제가 매일 쓰니까요.&quot;
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
            {ownerFaqs.map((faq, i) => {
              const isOpen = openFaq === i
              const answerId = `owner-faq-answer-${i}`
              return (
                <div key={i} className="bg-white rounded-2xl overflow-hidden shadow-at-card border border-at-border">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={answerId}
                    onClick={() => setOpenFaq(isOpen ? null : i)}
                    className="w-full px-6 py-5 flex items-center justify-between text-left hover:bg-at-surface-alt transition-colors"
                  >
                    <span className="font-semibold text-at-text pr-4">{faq.q}</span>
                    <ChevronDownIcon
                      className={`w-5 h-5 text-at-text-weak transition-transform duration-300 flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`}
                    />
                  </button>
                  <div
                    id={answerId}
                    role="region"
                    className={`overflow-hidden transition-all duration-300 ${isOpen ? 'max-h-96' : 'max-h-0'}`}
                  >
                    <div className="px-6 pb-5">
                      <p className="text-at-text-secondary leading-relaxed">{faq.a}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>

      {/* 반대 랜딩 이동 + 역할 선택 초기화 */}
      <section className="py-14 bg-white border-t border-at-border">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-sm text-at-text-secondary mb-5">
            실장·직원이신가요? 직원용 랜딩에서 실제 업무 기능을 둘러보세요.
          </p>
          <a
            href="/staff"
            className="group inline-flex items-center gap-2 rounded-xl border border-at-border bg-at-surface-alt hover:bg-white hover:border-at-accent/40 px-6 py-3 text-at-text font-semibold shadow-at-card transition-all hover:-translate-y-0.5"
          >
            실장·직원 페이지로 이동
            <ArrowRightIcon className="h-4 w-4 text-at-accent group-hover:translate-x-0.5 transition-transform" />
          </a>
          <p className="mt-5 text-xs text-at-text-weak">
            <a
              href="/?clear=1"
              className="underline decoration-at-text-weak/40 underline-offset-4 hover:decoration-at-text-weak"
            >
              역할 선택 초기화
            </a>
          </p>
        </div>
      </section>
    </div>
  )
}
