'use client'

import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { usePermissions } from '@/hooks/usePermissions'
import PayrollSettingsList from './PayrollSettingsList'
import PayrollStatementsList from './PayrollStatementsList'
import PayrollSettingForm from './PayrollSettingForm'
import PayrollStatementDetail from './PayrollStatementDetail'
import Toast from '@/components/ui/Toast'
import {
  Settings,
  FileText,
  Plus,
  Users,
  Calculator,
  Wallet
} from 'lucide-react'
import type { PayrollSetting, PayrollStatement } from '@/types/payroll'

interface PayrollManagementProps {
  currentUser: {
    id: string
    name?: string
    email?: string
    role?: string
    clinic_id?: string
  }
}

type TabType = 'settings' | 'statements' | 'my-statements'

export default function PayrollManagement({ currentUser }: PayrollManagementProps) {
  const { hasPermission } = usePermissions()
  const [activeTab, setActiveTab] = useState<TabType>('statements')
  const [settings, setSettings] = useState<PayrollSetting[]>([])
  const [statements, setStatements] = useState<PayrollStatement[]>([])
  const [myStatements, setMyStatements] = useState<PayrollStatement[]>([])
  const [loading, setLoading] = useState(true)
  const [showSettingForm, setShowSettingForm] = useState(false)
  const [selectedSetting, setSelectedSetting] = useState<PayrollSetting | null>(null)
  const [selectedStatement, setSelectedStatement] = useState<PayrollStatement | null>(null)
  const [employees, setEmployees] = useState<any[]>([])
  const [toast, setToast] = useState<{
    show: boolean
    message: string
    type: 'success' | 'error' | 'warning' | 'info'
  }>({ show: false, message: '', type: 'info' })

  const canManagePayroll = hasPermission('payroll_manage') || currentUser.role === 'owner' || currentUser.role === 'vice_director'
  const canViewOwnPayroll = hasPermission('payroll_view_own') || true // 모든 직원이 본인 급여 조회 가능

  const showToast = (message: string, type: 'success' | 'error' | 'warning' | 'info') => {
    setToast({ show: true, message, type })
  }

  // 직원 목록 조회
  const fetchEmployees = useCallback(async () => {
    if (!currentUser.clinic_id) return

    try {
      const response = await fetch(`/api/admin/users?clinic_id=${currentUser.clinic_id}`)
      const result = await response.json()
      if (result.success && result.users) {
        setEmployees(result.users.filter((u: any) => u.status === 'active'))
      }
    } catch (error) {
      console.error('Failed to fetch employees:', error)
    }
  }, [currentUser.clinic_id])

  // 급여 설정 조회
  const fetchSettings = useCallback(async () => {
    if (!currentUser.clinic_id || !canManagePayroll) return

    try {
      const response = await fetch(`/api/payroll/settings?clinic_id=${currentUser.clinic_id}`)
      const result = await response.json()
      if (result.success) {
        setSettings(result.data || [])
      }
    } catch (error) {
      console.error('Failed to fetch payroll settings:', error)
    }
  }, [currentUser.clinic_id, canManagePayroll])

  // 급여 명세서 목록 조회 (관리자용)
  const fetchStatements = useCallback(async () => {
    if (!currentUser.clinic_id || !canManagePayroll) return

    try {
      const response = await fetch(`/api/payroll/statements?clinic_id=${currentUser.clinic_id}`)
      const result = await response.json()
      if (result.success) {
        setStatements(result.data || [])
      }
    } catch (error) {
      console.error('Failed to fetch payroll statements:', error)
    }
  }, [currentUser.clinic_id, canManagePayroll])

  // 본인 급여 명세서 조회
  const fetchMyStatements = useCallback(async () => {
    try {
      const response = await fetch(`/api/payroll/statements?employee_user_id=${currentUser.id}`)
      const result = await response.json()
      if (result.success) {
        setMyStatements(result.data || [])
      }
    } catch (error) {
      console.error('Failed to fetch my payroll statements:', error)
    }
  }, [currentUser.id])

  useEffect(() => {
    const loadData = async () => {
      setLoading(true)
      await Promise.all([
        fetchEmployees(),
        fetchSettings(),
        fetchStatements(),
        fetchMyStatements()
      ])
      setLoading(false)
    }
    loadData()
  }, [fetchEmployees, fetchSettings, fetchStatements, fetchMyStatements])

  // 급여 설정 저장
  const handleSaveSetting = async (data: any) => {
    try {
      const response = await fetch('/api/payroll/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          clinic_id: currentUser.clinic_id,
          current_user_id: currentUser.id
        })
      })

      const result = await response.json()
      if (result.success) {
        showToast('급여 설정이 저장되었습니다.', 'success')
        setShowSettingForm(false)
        setSelectedSetting(null)
        fetchSettings()
      } else {
        showToast(result.error || '저장에 실패했습니다.', 'error')
      }
    } catch (error) {
      showToast('저장 중 오류가 발생했습니다.', 'error')
    }
  }

  // 급여 설정 삭제
  const handleDeleteSetting = async (settingId: string) => {
    if (!confirm('이 급여 설정을 삭제하시겠습니까?')) return

    try {
      const response = await fetch(`/api/payroll/settings?id=${settingId}`, {
        method: 'DELETE'
      })

      const result = await response.json()
      if (result.success) {
        showToast('급여 설정이 삭제되었습니다.', 'success')
        fetchSettings()
      } else {
        showToast(result.error || '삭제에 실패했습니다.', 'error')
      }
    } catch (error) {
      showToast('삭제 중 오류가 발생했습니다.', 'error')
    }
  }

  // 급여 명세서 일괄 생성
  const handleGenerateStatements = async (year: number, month: number) => {
    try {
      const response = await fetch('/api/payroll/statements/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinic_id: currentUser.clinic_id,
          year,
          month,
          current_user_id: currentUser.id
        })
      })

      const result = await response.json()
      if (result.success) {
        showToast(result.message || `${result.count}개의 급여 명세서가 생성되었습니다.`, 'success')
        fetchStatements()
      } else {
        showToast(result.error || '생성에 실패했습니다.', 'error')
      }
    } catch (error) {
      showToast('생성 중 오류가 발생했습니다.', 'error')
    }
  }

  // 급여 명세서 확정
  const handleConfirmStatement = async (statementId: string) => {
    try {
      const response = await fetch(`/api/payroll/statements/${statementId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'confirm',
          current_user_id: currentUser.id
        })
      })

      const result = await response.json()
      if (result.success) {
        showToast('급여 명세서가 확정되었습니다.', 'success')
        fetchStatements()
        if (selectedStatement?.id === statementId) {
          setSelectedStatement(result.data)
        }
      } else {
        showToast(result.error || '확정에 실패했습니다.', 'error')
      }
    } catch (error) {
      showToast('확정 중 오류가 발생했습니다.', 'error')
    }
  }

  // 카카오톡 발송
  const handleSendKakao = async (statementId: string, phoneNumber: string) => {
    try {
      const response = await fetch('/api/payroll/kakao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          statement_id: statementId,
          phone_number: phoneNumber,
          current_user_id: currentUser.id
        })
      })

      const result = await response.json()
      if (result.success) {
        showToast('카카오톡 알림이 발송되었습니다.', 'success')
        fetchStatements()
      } else {
        showToast(result.error || '발송에 실패했습니다.', 'error')
      }
    } catch (error) {
      showToast('발송 중 오류가 발생했습니다.', 'error')
    }
  }

  // 일괄 카카오톡 발송
  const handleBulkSendKakao = async (year: number, month: number) => {
    try {
      const response = await fetch('/api/payroll/kakao', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bulk: true,
          clinic_id: currentUser.clinic_id,
          year,
          month,
          current_user_id: currentUser.id
        })
      })

      const result = await response.json()
      if (result.success) {
        showToast(result.message || '카카오톡 알림이 발송되었습니다.', 'success')
        fetchStatements()
      } else {
        showToast(result.error || '발송에 실패했습니다.', 'error')
      }
    } catch (error) {
      showToast('발송 중 오류가 발생했습니다.', 'error')
    }
  }

  // 급여 명세서 삭제
  const handleDeleteStatement = async (statementId: string) => {
    if (!confirm('이 급여 명세서를 삭제하시겠습니까?')) return

    try {
      const response = await fetch(`/api/payroll/statements?id=${statementId}`, {
        method: 'DELETE'
      })

      const result = await response.json()
      if (result.success) {
        showToast('급여 명세서가 삭제되었습니다.', 'success')
        fetchStatements()
        if (selectedStatement?.id === statementId) {
          setSelectedStatement(null)
        }
      } else {
        showToast(result.error || '삭제에 실패했습니다.', 'error')
      }
    } catch (error) {
      showToast('삭제 중 오류가 발생했습니다.', 'error')
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-slate-600">데이터를 불러오는 중...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-0">
      {/* 헤더 */}
      <div className="sticky top-14 z-10 bg-gradient-to-r from-emerald-600 to-emerald-700 px-6 py-4 rounded-t-xl shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
              <Wallet className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">급여 관리</h2>
              <p className="text-emerald-100 text-sm">Payroll Management</p>
            </div>
          </div>
        </div>
      </div>

      {/* 탭 네비게이션 */}
      <div className="sticky top-[calc(3.5rem+72px)] z-10 border-x border-b border-slate-200 bg-slate-50">
        <nav className="flex space-x-1 p-1.5 sm:p-2 overflow-x-auto scrollbar-hide" aria-label="Tabs">
          {canViewOwnPayroll && (
            <button
              onClick={() => setActiveTab('my-statements')}
              className={`py-1.5 sm:py-2 px-2.5 sm:px-4 inline-flex items-center rounded-lg font-medium text-xs sm:text-sm transition-all whitespace-nowrap ${
                activeTab === 'my-statements'
                  ? 'bg-white text-emerald-600 shadow-sm'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
              }`}
            >
              <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" />
              내 급여 명세서
            </button>
          )}

          {canManagePayroll && (
            <>
              <button
                onClick={() => setActiveTab('statements')}
                className={`py-1.5 sm:py-2 px-2.5 sm:px-4 inline-flex items-center rounded-lg font-medium text-xs sm:text-sm transition-all whitespace-nowrap ${
                  activeTab === 'statements'
                    ? 'bg-white text-emerald-600 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
                }`}
              >
                <Calculator className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" />
                급여 명세서 관리
              </button>

              <button
                onClick={() => setActiveTab('settings')}
                className={`py-1.5 sm:py-2 px-2.5 sm:px-4 inline-flex items-center rounded-lg font-medium text-xs sm:text-sm transition-all whitespace-nowrap ${
                  activeTab === 'settings'
                    ? 'bg-white text-emerald-600 shadow-sm'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
                }`}
              >
                <Settings className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" />
                급여 설정
              </button>
            </>
          )}
        </nav>
      </div>

      {/* 콘텐츠 */}
      <div className="bg-white border-x border-b border-slate-200 rounded-b-xl p-6">
        {/* 내 급여 명세서 */}
        {activeTab === 'my-statements' && (
          <PayrollStatementsList
            statements={myStatements}
            onSelect={setSelectedStatement}
            isMyStatements
            showToast={showToast}
          />
        )}

        {/* 급여 명세서 관리 (관리자) */}
        {activeTab === 'statements' && canManagePayroll && (
          <PayrollStatementsList
            statements={statements}
            settings={settings}
            onSelect={setSelectedStatement}
            onGenerate={handleGenerateStatements}
            onConfirm={handleConfirmStatement}
            onDelete={handleDeleteStatement}
            onSendKakao={handleSendKakao}
            onBulkSendKakao={handleBulkSendKakao}
            showToast={showToast}
          />
        )}

        {/* 급여 설정 (관리자) */}
        {activeTab === 'settings' && canManagePayroll && (
          <div>
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-semibold text-slate-800">직원별 급여 설정</h3>
              <button
                onClick={() => {
                  setSelectedSetting(null)
                  setShowSettingForm(true)
                }}
                className="inline-flex items-center px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors text-sm font-medium"
              >
                <Plus className="w-4 h-4 mr-2" />
                급여 설정 추가
              </button>
            </div>

            <PayrollSettingsList
              settings={settings}
              onEdit={(setting) => {
                setSelectedSetting(setting)
                setShowSettingForm(true)
              }}
              onDelete={handleDeleteSetting}
            />
          </div>
        )}
      </div>

      {/* 급여 설정 폼 모달 */}
      {showSettingForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <PayrollSettingForm
              setting={selectedSetting}
              employees={employees}
              existingSettings={settings}
              onSave={handleSaveSetting}
              onCancel={() => {
                setShowSettingForm(false)
                setSelectedSetting(null)
              }}
            />
          </div>
        </div>
      )}

      {/* 급여 명세서 상세 모달 */}
      {selectedStatement && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
            <PayrollStatementDetail
              statement={selectedStatement}
              onClose={() => setSelectedStatement(null)}
              onConfirm={canManagePayroll ? () => handleConfirmStatement(selectedStatement.id) : undefined}
              onSendKakao={canManagePayroll ? handleSendKakao : undefined}
              canManage={canManagePayroll}
              showToast={showToast}
            />
          </div>
        </div>
      )}

      <Toast
        message={toast.message}
        type={toast.type}
        show={toast.show}
        onClose={() => setToast(prev => ({ ...prev, show: false }))}
      />
    </div>
  )
}
