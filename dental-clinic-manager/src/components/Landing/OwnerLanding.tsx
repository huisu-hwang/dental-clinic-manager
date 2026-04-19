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
