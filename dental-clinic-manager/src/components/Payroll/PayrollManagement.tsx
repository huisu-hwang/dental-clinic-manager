'use client'

import { useState, useMemo, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Banknote, FileText, Settings, History, Upload } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { checkSecuritySession, setSecuritySession } from '@/lib/securitySession'
import PasswordVerificationModal from '@/components/Security/PasswordVerificationModal'
import PayrollForm from './PayrollForm'
import PayrollSettings from './PayrollSettings'
import TaxOfficeUploadModal from './TaxOfficeUploadModal'
import { getEmployeesForPayroll } from '@/lib/payrollService'

type PayrollSubTab = 'view' | 'history' | 'settings'

export default function PayrollManagement() {
  const router = useRouter()
  const { user } = useAuth()
  const [activeSubTab, setActiveSubTab] = useState<PayrollSubTab>('view')
  const [showPasswordModal, setShowPasswordModal] = useState(false)
  const [isVerified, setIsVerified] = useState(false)
  const [showUploadModal, setShowUploadModal] = useState(false)
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([])
  const [uploadKey, setUploadKey] = useState(0) // to trigger PayrollForm refresh

  const isOwner = user?.role === 'owner'

  // 직원 목록 로드 (업로드 모달용)
  useEffect(() => {
    if (isOwner && user?.clinic_id && isVerified) {
      getEmployeesForPayroll(user.clinic_id).then(emps => {
        setEmployees(emps.map(e => ({ id: e.id, name: e.name })))
      }).catch(console.error)
    }
  }, [isOwner, user?.clinic_id, isVerified])

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
    console.log('[PayrollManagement] Password verification cancelled, redirecting to home')
    router.push('/dashboard?tab=home')
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

  // Show password modal if not verified
  if (!isVerified) {
    return (
      <div className="flex justify-center items-center h-64">
        <PasswordVerificationModal
          isOpen={showPasswordModal}
          onVerified={handlePasswordVerified}
          onCancel={handlePasswordCancel}
          purpose="payroll"
        />
        {!showPasswordModal && (
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-at-accent"></div>
        )}
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 bg-white min-h-screen">
      {/* 헤더 */}
      <div className="flex items-center justify-between pb-4 border-b border-at-border">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-at-accent-light rounded-lg flex items-center justify-center">
            <Banknote className="w-4 h-4 text-at-accent" />
          </div>
          <h2 className="text-lg font-bold text-at-text">급여 명세서</h2>
        </div>
        {isOwner && (
          <button
            onClick={() => setShowUploadModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-at-accent-light hover:bg-at-tag text-at-accent rounded-xl text-sm font-medium transition-all border border-at-border"
          >
            <Upload className="w-4 h-4" />
            <span className="hidden sm:inline">세무사무실 명세서 업로드</span>
            <span className="sm:hidden">업로드</span>
          </button>
        )}
      </div>

      {/* 서브 탭 */}
      <div className="flex space-x-1 overflow-x-auto scrollbar-hide">
        {subTabs.map(tab => {
          const Icon = tab.icon
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id)}
              className={`py-1.5 sm:py-2 px-2.5 sm:px-4 inline-flex items-center rounded-lg font-medium text-xs sm:text-sm transition-all whitespace-nowrap ${
                activeSubTab === tab.id
                  ? 'bg-at-accent-light text-at-accent'
                  : 'text-at-text-weak hover:bg-at-surface-alt'
              }`}
            >
              <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" />
              {tab.label}
            </button>
          )
        })}
      </div>

      {/* 콘텐츠 */}
      <div>
        {activeSubTab === 'view' && <PayrollForm key={uploadKey} />}

        {activeSubTab === 'history' && (
          <div className="text-center py-12 text-at-text">
            <History className="w-12 h-12 mx-auto mb-4 text-at-text" />
            <p className="text-lg font-medium">발급 이력</p>
            <p className="text-sm mt-2">
              급여 명세서 발급 이력이 여기에 표시됩니다.
            </p>
            <p className="text-xs text-at-text mt-4">
              (향후 구현 예정)
            </p>
          </div>
        )}

        {activeSubTab === 'settings' && isOwner && <PayrollSettings />}
      </div>

      {/* 안내 사항 */}
      <div className="bg-at-accent-light border border-at-border rounded-xl p-4 text-sm">
        <h4 className="font-medium text-at-accent mb-2">급여 명세서 안내</h4>
        <ul className="list-disc list-inside text-at-accent space-y-1">
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

      {/* 세무사무실 명세서 업로드 모달 */}
      {isOwner && user?.clinic_id && (
        <TaxOfficeUploadModal
          isOpen={showUploadModal}
          onClose={() => setShowUploadModal(false)}
          onUploadComplete={() => {
            setShowUploadModal(false)
            setUploadKey(prev => prev + 1)
          }}
          clinicId={user.clinic_id}
          uploadedBy={user.id}
          employees={employees}
        />
      )}
    </div>
  )
}
