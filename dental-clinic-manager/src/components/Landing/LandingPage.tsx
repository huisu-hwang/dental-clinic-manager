'use client'

import { useState } from 'react'
import { ChevronRightIcon, CheckCircleIcon } from '@heroicons/react/24/outline'

interface LandingPageProps {
  onShowSignup: () => void
  onShowLogin: () => void
}

export default function LandingPage({ onShowSignup, onShowLogin }: LandingPageProps) {
  const [currentFeature, setCurrentFeature] = useState(0)

  const features = [
    {
      title: "일일 업무 보고서",
      description: "상담, 선물, 해피콜 등 모든 업무를 체계적으로 기록하고 관리",
      icon: "📊",
      details: ["환자 상담 현황 추적", "선물 재고 관리", "해피콜 기록", "특이사항 메모"]
    },
    {
      title: "실시간 통계 분석",
      description: "주간, 월간, 연간 통계를 자동으로 계산하고 시각화",
      icon: "📈",
      details: ["상담 진행률 분석", "매출 현황", "담당자별 성과", "기간별 비교"]
    },
    {
      title: "선물 재고 관리",
      description: "치과 선물 재고를 실시간으로 추적하고 자동 알림",
      icon: "🎁",
      details: ["재고 현황 파악", "자동 재고 차감", "부족 알림", "입출고 기록"]
    },
    {
      title: "데이터 백업 & 보안",
      description: "클라우드 기반 안전한 데이터 저장 및 백업",
      icon: "🔒",
      details: ["자동 백업", "데이터 암호화", "접근 권한 관리", "데이터 복구"]
    }
  ]

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-2">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">🦷</span>
              </div>
              <h1 className="text-xl font-bold text-slate-800">덴탈매니저</h1>
            </div>
            <div className="flex space-x-3">
              <button
                onClick={onShowLogin}
                className="px-4 py-2 text-blue-600 hover:text-blue-700 font-medium"
              >
                로그인
              </button>
              <button
                onClick={onShowSignup}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
              >
                무료 체험 시작
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl sm:text-5xl font-bold text-slate-800 mb-6">
            치과 데스크 업무를
            <span className="text-blue-600 block mt-2">더 똑똑하게 관리하세요</span>
          </h2>
          <p className="text-xl text-slate-600 mb-8 leading-relaxed">
            번거로운 수기 작성은 그만! 덴탈매니저와 함께 체계적이고 효율적인<br />
            치과 운영을 시작하세요. 데이터 기반 의사결정으로 더 나은 진료 환경을 만들어보세요.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={onShowSignup}
              className="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-lg rounded-lg transition-colors shadow-lg"
            >
              무료로 시작하기
              <ChevronRightIcon className="inline w-5 h-5 ml-2" />
            </button>
            <button
              onClick={() => document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' })}
              className="px-8 py-4 border-2 border-blue-600 text-blue-600 hover:bg-blue-50 font-bold text-lg rounded-lg transition-colors"
            >
              기능 살펴보기
            </button>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h3 className="text-3xl font-bold text-slate-800 mb-4">
              치과 운영에 필요한 모든 기능
            </h3>
            <p className="text-lg text-slate-600">
              하나의 플랫폼으로 모든 데스크 업무를 체계적으로 관리하세요
            </p>
          </div>

          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div className="space-y-4">
              {features.map((feature, index) => (
                <div
                  key={index}
                  className={`p-6 rounded-xl cursor-pointer transition-all ${
                    currentFeature === index
                      ? 'bg-blue-50 border-2 border-blue-200 shadow-lg'
                      : 'bg-gray-50 hover:bg-gray-100 border-2 border-transparent'
                  }`}
                  onClick={() => setCurrentFeature(index)}
                >
                  <div className="flex items-start space-x-4">
                    <div className="text-3xl">{feature.icon}</div>
                    <div className="flex-1">
                      <h4 className="text-lg font-bold text-slate-800 mb-2">
                        {feature.title}
                      </h4>
                      <p className="text-slate-600">{feature.description}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-slate-50 rounded-2xl p-8">
              <div className="text-center mb-6">
                <div className="text-5xl mb-4">{features[currentFeature].icon}</div>
                <h4 className="text-2xl font-bold text-slate-800 mb-3">
                  {features[currentFeature].title}
                </h4>
                <p className="text-slate-600 text-lg">
                  {features[currentFeature].description}
                </p>
              </div>
              <div className="space-y-3">
                {features[currentFeature].details.map((detail, index) => (
                  <div key={index} className="flex items-center space-x-3">
                    <CheckCircleIcon className="w-5 h-5 text-green-500" />
                    <span className="text-slate-700">{detail}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-20 bg-gradient-to-r from-blue-600 to-indigo-700">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-white">
          <h3 className="text-3xl font-bold mb-12">덴탈매니저로 달라지는 우리 치과</h3>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="bg-white/10 backdrop-blur rounded-xl p-6">
              <div className="text-4xl mb-4">⏰</div>
              <h4 className="text-xl font-bold mb-3">업무 시간 50% 단축</h4>
              <p className="text-blue-100">자동화된 데이터 입력과 통계 생성으로 업무 효율성 대폭 향상</p>
            </div>
            <div className="bg-white/10 backdrop-blur rounded-xl p-6">
              <div className="text-4xl mb-4">📋</div>
              <h4 className="text-xl font-bold mb-3">체계적인 기록 관리</h4>
              <p className="text-blue-100">모든 데이터를 한 곳에서 관리하여 정확성과 일관성 확보</p>
            </div>
            <div className="bg-white/10 backdrop-blur rounded-xl p-6">
              <div className="text-4xl mb-4">💡</div>
              <h4 className="text-xl font-bold mb-3">데이터 기반 의사결정</h4>
              <p className="text-blue-100">실시간 통계와 분석으로 더 나은 치과 운영 전략 수립</p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-slate-50">
        <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
          <h3 className="text-3xl font-bold text-slate-800 mb-6">
            지금 시작하세요!
          </h3>
          <p className="text-lg text-slate-600 mb-8">
            설치나 복잡한 설정 없이 바로 사용할 수 있습니다.<br />
            30일 무료 체험으로 덴탈매니저의 모든 기능을 경험해보세요.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={onShowSignup}
              className="px-8 py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold text-lg rounded-lg transition-colors shadow-lg"
            >
              무료 체험 시작하기
            </button>
            <button
              onClick={onShowLogin}
              className="px-8 py-4 text-blue-600 hover:text-blue-700 font-bold text-lg"
            >
              이미 계정이 있나요? 로그인 →
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-800 text-white py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <div className="flex items-center space-x-2 mb-4 md:mb-0">
              <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">🦷</span>
              </div>
              <span className="text-lg font-bold">덴탈매니저</span>
            </div>
            <div className="text-slate-400 text-sm">
              © 2024 덴탈매니저. 치과 데스크 업무의 새로운 표준.
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}