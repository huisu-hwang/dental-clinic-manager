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
            {staffFaqs.map((faq, i) => {
              const isOpen = openFaq === i
              const answerId = `staff-faq-answer-${i}`
              return (
                <div key={i} className="bg-rose-50/50 rounded-2xl overflow-hidden border border-rose-100">
                  <button
                    type="button"
                    aria-expanded={isOpen}
                    aria-controls={answerId}
                    onClick={() => setOpenFaq(isOpen ? null : i)}
                    className="w-full px-6 py-5 flex items-center justify-between text-left hover:bg-rose-50 transition-colors"
                  >
                    <span className="font-semibold text-slate-900 pr-4">{faq.q}</span>
                    <ChevronDownIcon
                      className={`w-5 h-5 text-slate-500 transition-transform duration-300 flex-shrink-0 ${isOpen ? 'rotate-180' : ''}`}
                    />
                  </button>
                  <div
                    id={answerId}
                    role="region"
                    className={`overflow-hidden transition-all duration-300 ${isOpen ? 'max-h-96' : 'max-h-0'}`}
                  >
                    <div className="px-6 pb-5">
                      <p className="text-slate-600 leading-relaxed">{faq.a}</p>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </section>
    </div>
  )
}
