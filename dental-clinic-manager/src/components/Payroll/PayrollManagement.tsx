'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Banknote, FileText, Settings, History } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { checkSecuritySession, setSecuritySession } from '@/lib/securitySession'
import PasswordVerificationModal from '@/components/Security/PasswordVerificationModal'
import PayrollForm from './PayrollForm'
import PayrollSettings from './PayrollSettings'

type PayrollSubTab = 'view' | 'history' | 'settings'

export default function PayrollManagement() {
  const router = useRouter()
  const { user } = useAuth()
  const [activeSubTab, setActiveSubTab] = useState<PayrollSubTab>('view')
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [isVerified, setIsVerified] = useState(false)

  const isOwner = user?.role === 'owner'

  // Check security session on mount
  useEffect(() => {
    console.log('[PayrollManagement] Checking security session...')
    const hasValidSession = checkSecuritySession('payroll')

    if (hasValidSession) {
      console.log('[PayrollManagement] Valid security session found')
      setIsVerified(true)
    } else {
      console.log('[PayrollManagement] No valid security session, showing password modal')
      setShowPasswordModal(true)
    }
  }, [])

  // Handle successful password verification
  const handlePasswordVerified = () => {
    console.log('[PayrollManagement] Password verified, creating security session')
    setSecuritySession('payroll')
    setShowPasswordModal(false)
    setIsVerified(true)
  }

  // Handle password verification cancel
  const handlePasswordCancel = () => {
    console.log('[PayrollManagement] Password verification cancelled, redirecting to dashboard')
    router.push('/dashboard')
  }

  // 탭 목록 생성 (owner만 급여 설정 탭 표시)
  const subTabs = useMemo(() => {
    const tabs: { id: PayrollSubTab; label: string; icon: typeof FileText }[] = [
      { id: 'view', label: '명세서 조회', icon: FileText },
      { id: 'history', label: '발급 이력', icon: History },
    ]

    // owner만 급여 설정 탭 표시
    if (isOwner) {
      tabs.push({ id: 'settings', label: '급여 설정', icon: Settings })
    }

    return tabs
  }, [isOwner])

  // Show loading while checking verification
  if (!isVerified && !showPasswordModal) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* 비밀번호 확인 모달 */}
      <PasswordVerificationModal
        isOpen={showPasswordModal}
        onVerified={handlePasswordVerified}
        onCancel={handlePasswordCancel}
        purpose="payroll"
      />

      {/* 헤더 */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 rounded-t-xl shadow-sm">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
            <Banknote className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white">급여 명세서</h2>
            <p className="text-blue-100 text-sm">Payroll Statement</p>
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
                    ? 'bg-white text-blue-600 shadow-sm'
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
        {activeSubTab === 'view' && <PayrollForm />}

        {activeSubTab === 'history' && (
          <div className="text-center py-12 text-slate-500">
            <History className="w-12 h-12 mx-auto mb-4 text-slate-300" />
            <p className="text-lg font-medium">발급 이력</p>
            <p className="text-sm mt-2">
              급여 명세서 발급 이력이 여기에 표시됩니다.
            </p>
            <p className="text-xs text-slate-400 mt-4">
              (향후 구현 예정)
            </p>
          </div>
        )}

        {activeSubTab === 'settings' && isOwner && <PayrollSettings />}
      </div>

      {/* 안내 사항 */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm">
        <h4 className="font-medium text-blue-800 mb-2">급여 명세서 안내</h4>
        <ul className="list-disc list-inside text-blue-700 space-y-1">
          {isOwner ? (
            <>
              <li><strong>급여 설정</strong> 탭에서 직원별 급여 기본 정보를 설정하세요.</li>
              <li>설정이 완료되면 매월 급여 명세서가 자동으로 생성됩니다.</li>
              <li>4대보험료는 매년 1월에 결정되어 연말까지 유지됩니다.</li>
              <li>소득세는 간이세액표에 따라 자동 계산됩니다.</li>
            </>
          ) : (
            <>
              <li>직원 본인의 급여 명세서만 조회할 수 있습니다.</li>
              <li>급여 관련 문의는 원장님께 문의해주세요.</li>
            </>
          )}
        </ul>
      </div>
    </div>
  )
}
