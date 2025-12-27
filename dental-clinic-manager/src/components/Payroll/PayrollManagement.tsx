'use client'

import { useState } from 'react'
import { Banknote, FileText, Settings } from 'lucide-react'
import PayrollForm from './PayrollForm'

type PayrollSubTab = 'create' | 'history' | 'settings'

export default function PayrollManagement() {
  const [activeSubTab, setActiveSubTab] = useState<PayrollSubTab>('create')

  const subTabs = [
    { id: 'create' as const, label: '명세서 생성', icon: FileText },
    { id: 'history' as const, label: '발급 이력', icon: Banknote },
    { id: 'settings' as const, label: '급여 설정', icon: Settings },
  ]

  return (
    <div className="space-y-4">
      {/* 헤더 */}
      <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 px-6 py-4 rounded-t-xl shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
            <Banknote className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">급여 명세서</h2>
            <p className="text-emerald-100 text-sm">Payroll Statement</p>
          </div>
        </div>
      </div>

      {/* 서브 탭 */}
      <div className="border-x border-b border-slate-200 bg-slate-50">
        <nav className="flex space-x-1 p-1.5 sm:p-2 overflow-x-auto scrollbar-hide" aria-label="Tabs">
          {subTabs.map(tab => {
            const Icon = tab.icon
            return (
              <button
                key={tab.id}
                onClick={() => setActiveSubTab(tab.id)}
                className={`py-1.5 sm:py-2 px-2.5 sm:px-4 inline-flex items-center rounded-lg font-medium text-xs sm:text-sm transition-all whitespace-nowrap ${
                  activeSubTab === tab.id
                    ? 'bg-white text-emerald-600 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
                }`}
              >
                <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" />
                {tab.label}
              </button>
            )
          })}
        </nav>
      </div>

      {/* 콘텐츠 */}
      <div className="bg-white border-x border-b border-slate-200 rounded-b-xl p-6">
        {activeSubTab === 'create' && <PayrollForm />}

        {activeSubTab === 'history' && (
          <div className="text-center py-12 text-slate-500">
            <Banknote className="w-12 h-12 mx-auto mb-4 text-slate-300" />
            <p className="text-lg font-medium">발급 이력</p>
            <p className="text-sm mt-2">
              급여 명세서 발급 이력이 여기에 표시됩니다.
            </p>
            <p className="text-xs text-slate-400 mt-4">
              (향후 구현 예정)
            </p>
          </div>
        )}

        {activeSubTab === 'settings' && (
          <div className="text-center py-12 text-slate-500">
            <Settings className="w-12 h-12 mx-auto mb-4 text-slate-300" />
            <p className="text-lg font-medium">급여 설정</p>
            <p className="text-sm mt-2">
              4대보험 기본값, 비과세 한도 등 급여 관련 설정을 관리합니다.
            </p>
            <p className="text-xs text-slate-400 mt-4">
              (향후 구현 예정)
            </p>
          </div>
        )}
      </div>

      {/* 안내 사항 */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm">
        <h4 className="font-medium text-amber-800 mb-2">급여 명세서 작성 안내</h4>
        <ul className="list-disc list-inside text-amber-700 space-y-1">
          <li>직원 선택 시 근로계약서가 있으면 급여 정보가 자동으로 불러와집니다.</li>
          <li>4대보험료는 매년 1월에 결정되어 연말까지 유지되므로, 처음 입력 후 필요시 수정하세요.</li>
          <li>소득세는 간이세액표에 따라 자동 계산됩니다.</li>
          <li>세후 계약의 경우 실수령액을 입력하면 세전 급여가 역산됩니다.</li>
        </ul>
      </div>
    </div>
  )
}
