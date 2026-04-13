'use client'

import { BookOpen, Settings, Database, Info, Terminal } from 'lucide-react'

const SectionHeader = ({ number, title, icon: Icon }: { number: number; title: string; icon: React.ElementType }) => (
  <div className="flex items-center space-x-3 pb-3 mb-4 border-b border-at-border">
    <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-at-accent-light text-at-accent">
      <Icon className="w-4 h-4" />
    </div>
    <h3 className="text-base font-semibold text-at-text">
      <span className="text-at-accent mr-1">{number}.</span>
      {title}
    </h3>
  </div>
)

export default function GuideSection() {
  return (
    <div>
      {/* 블루 그라데이션 헤더 - 스크롤 시 고정 */}
      <div className="sticky top-14 z-10 bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 rounded-t-xl shadow-at-card">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
            <BookOpen className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">사용 안내</h2>
            <p className="text-blue-100 text-sm">User Guide</p>
          </div>
        </div>
      </div>

      {/* 콘텐츠 영역 */}
      <div className="bg-white border-x border-b border-at-border rounded-b-xl p-6 space-y-8">
        {/* 최초 설정 */}
        <div>
          <SectionHeader number={1} title="최초 설정 (관리자)" icon={Settings} />
          <ul className="space-y-3 text-at-text-secondary">
            <li className="flex items-start">
              <span className="text-red-500 font-bold mr-2">•</span>
              <span>
                <strong className="text-at-error">가장 먼저, Supabase 데이터베이스 테이블을 생성해야 합니다.</strong>{' '}
                이 작업은 최초 한 번만 필요합니다.
              </span>
            </li>
            <li className="flex items-start">
              <span className="text-at-text-weak mr-2">•</span>
              <span>
                프로젝트 루트의 <code className="bg-at-surface-alt px-2 py-0.5 rounded text-sm">supabase-schema.sql</code> 파일의 내용을 Supabase SQL Editor에서 실행하여 테이블을 생성하세요.
              </span>
            </li>
            <li className="flex items-start">
              <span className="text-at-text-weak mr-2">•</span>
              <span>
                <code className="bg-at-surface-alt px-2 py-0.5 rounded text-sm">.env.local</code> 파일에 Supabase 프로젝트의 <strong>URL</strong>과 <strong>anon public key</strong>를 설정하세요.
              </span>
            </li>
          </ul>
        </div>

        {/* 데이터 관리 */}
        <div>
          <SectionHeader number={2} title="데이터 관리" icon={Database} />
          <ul className="space-y-3 text-at-text-secondary">
            <li className="flex items-start">
              <span className="text-at-text-weak mr-2">•</span>
              <span>
                이제 모든 데이터는 클라우드에 실시간으로 저장됩니다. 한 명이 데이터를 입력하면 다른 모든 사람의 화면에도 즉시 반영됩니다.
              </span>
            </li>
            <li className="flex items-start">
              <span className="text-at-text-weak mr-2">•</span>
              <span>
                <strong>일일 보고 종합 기록</strong> 테이블 우측의 삭제 버튼을 클릭하여 해당 날짜의 모든 기록(상담, 선물 등)을 한 번에 삭제할 수 있습니다.
              </span>
            </li>
          </ul>
        </div>

        {/* 기능 설명 */}
        <div>
          <SectionHeader number={3} title="기능 설명" icon={Info} />
          <ul className="space-y-3 text-at-text-secondary">
            <li className="flex items-start">
              <span className="text-at-text-weak mr-2">•</span>
              <span><strong>일일 보고서 입력:</strong> 환자 상담 결과, 리콜 현황, 선물 및 리뷰 관리를 입력할 수 있습니다.</span>
            </li>
            <li className="flex items-start">
              <span className="text-at-text-weak mr-2">•</span>
              <span><strong>통계:</strong> 주간, 월간, 연간 통계를 확인할 수 있습니다.</span>
            </li>
            <li className="flex items-start">
              <span className="text-at-text-weak mr-2">•</span>
              <span><strong>상세 기록:</strong> 모든 입력된 데이터의 상세 내역을 확인할 수 있습니다.</span>
            </li>
            <li className="flex items-start">
              <span className="text-at-text-weak mr-2">•</span>
              <span><strong>설정:</strong> 선물 재고를 관리하고 새로운 선물 종류를 추가할 수 있습니다.</span>
            </li>
          </ul>
        </div>

        {/* 환경 설정 */}
        <div>
          <SectionHeader number={4} title="환경 설정" icon={Terminal} />
          <div className="bg-slate-900 p-4 rounded-xl">
            <code className="text-sm text-green-400 font-mono">
              NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url<br/>
              NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
            </code>
          </div>
        </div>
      </div>
    </div>
  )
}
