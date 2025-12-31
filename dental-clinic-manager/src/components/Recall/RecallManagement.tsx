'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  Users,
  Upload,
  MessageSquare,
  Phone,
  BarChart3,
  Settings,
  Plus,
  RefreshCw,
  ChevronDown,
  FolderOpen,
  Trash2,
  Edit,
  PhoneCall
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import type {
  RecallCampaign,
  RecallPatient,
  RecallPatientUploadData,
  RecallPatientFilters,
  RecallStats as RecallStatsType
} from '@/types/recall'
import { recallService } from '@/lib/recallService'
import PatientFileUpload from './PatientFileUpload'
import PatientList from './PatientList'
import SmsSendModal from './SmsSendModal'
import CallModal from './CallModal'
import StatusUpdateModal from './StatusUpdateModal'
import ContactHistoryModal from './ContactHistoryModal'
import RecallStats from './RecallStats'
import RecallSettings from './RecallSettings'
import Toast from '@/components/ui/Toast'

type TabType = 'patients' | 'stats' | 'settings'

export default function RecallManagement() {
  const { user } = useAuth()

  // 탭 및 뷰 상태
  const [activeTab, setActiveTab] = useState<TabType>('patients')
  const [showUpload, setShowUpload] = useState(false)
  const [showCampaignSelector, setShowCampaignSelector] = useState(false)

  // 데이터 상태
  const [campaigns, setCampaigns] = useState<RecallCampaign[]>([])
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null)
  const [patients, setPatients] = useState<RecallPatient[]>([])
  const [stats, setStats] = useState<RecallStatsType | null>(null)
  const [filters, setFilters] = useState<RecallPatientFilters>({})

  // 선택 상태
  const [selectedPatients, setSelectedPatients] = useState<string[]>([])

  // 모달 상태
  const [smsModalOpen, setSmsModalOpen] = useState(false)
  const [callModalPatient, setCallModalPatient] = useState<RecallPatient | null>(null)
  const [statusModalPatient, setStatusModalPatient] = useState<RecallPatient | null>(null)
  const [historyModalPatient, setHistoryModalPatient] = useState<RecallPatient | null>(null)

  // 로딩 상태
  const [isLoading, setIsLoading] = useState(true)
  const [isUploading, setIsUploading] = useState(false)

  // 토스트
  const [toast, setToast] = useState<{
    show: boolean
    message: string
    type: 'success' | 'error' | 'warning' | 'info'
  }>({ show: false, message: '', type: 'info' })

  const showToast = (message: string, type: 'success' | 'error' | 'warning' | 'info') => {
    setToast({ show: true, message, type })
  }

  // 현재 선택된 캠페인
  const selectedCampaign = campaigns.find(c => c.id === selectedCampaignId)

  // 데이터 로드
  const loadCampaigns = useCallback(async () => {
    const result = await recallService.campaigns.getCampaigns()
    if (result.success && result.data) {
      setCampaigns(result.data)
      // 첫 번째 캠페인 자동 선택
      if (result.data.length > 0 && !selectedCampaignId) {
        setSelectedCampaignId(result.data[0].id)
      }
    }
  }, [selectedCampaignId])

  const loadPatients = useCallback(async () => {
    setIsLoading(true)
    const filterWithCampaign = {
      ...filters,
      campaign_id: selectedCampaignId || undefined
    }
    const result = await recallService.patients.getPatients(filterWithCampaign)
    if (result.success && result.data) {
      setPatients(result.data)
    }
    setIsLoading(false)
  }, [filters, selectedCampaignId])

  const loadStats = useCallback(async () => {
    const result = await recallService.patients.getStats(selectedCampaignId || undefined)
    if (result.success && result.data) {
      setStats(result.data)
    }
  }, [selectedCampaignId])

  // 초기 로드
  useEffect(() => {
    loadCampaigns()
  }, [])

  useEffect(() => {
    if (selectedCampaignId) {
      loadPatients()
      loadStats()
    }
  }, [selectedCampaignId, filters])

  // 캠페인 생성
  const handleCreateCampaign = async (name: string) => {
    const result = await recallService.campaigns.createCampaign({ name })
    if (result.success && result.data) {
      await loadCampaigns()
      setSelectedCampaignId(result.data.id)
      showToast('새 캠페인이 생성되었습니다.', 'success')
      return result.data
    } else {
      showToast(result.error || '캠페인 생성에 실패했습니다.', 'error')
      return null
    }
  }

  // 파일 업로드
  const handleFileUpload = async (uploadedPatients: RecallPatientUploadData[], filename: string) => {
    setIsUploading(true)

    try {
      // 캠페인이 없으면 새로 생성
      let campaignId = selectedCampaignId
      if (!campaignId) {
        const campaignName = filename.replace(/\.[^/.]+$/, '') || `리콜 ${new Date().toLocaleDateString('ko-KR')}`
        const newCampaign = await handleCreateCampaign(campaignName)
        if (!newCampaign) {
          setIsUploading(false)
          return
        }
        campaignId = newCampaign.id
      }

      // 환자 일괄 등록
      const result = await recallService.patients.addPatientsBulk(
        uploadedPatients,
        campaignId,
        filename
      )

      if (result.success) {
        showToast(`${result.insertedCount}명의 환자가 등록되었습니다.`, 'success')
        setShowUpload(false)
        loadPatients()
        loadStats()
        loadCampaigns()
      } else {
        showToast(result.error || '환자 등록에 실패했습니다.', 'error')
      }
    } catch (error) {
      console.error('Upload error:', error)
      showToast('업로드 중 오류가 발생했습니다.', 'error')
    } finally {
      setIsUploading(false)
    }
  }

  // 환자 선택
  const handleSelectPatient = (id: string) => {
    setSelectedPatients(prev =>
      prev.includes(id)
        ? prev.filter(p => p !== id)
        : [...prev, id]
    )
  }

  const handleSelectAll = (selected: boolean) => {
    setSelectedPatients(selected ? patients.map(p => p.id) : [])
  }

  // 선택된 환자들에게 문자 발송
  const handleBulkSms = () => {
    if (selectedPatients.length === 0) {
      showToast('환자를 선택해주세요.', 'warning')
      return
    }
    setSmsModalOpen(true)
  }

  // 개별 문자 발송
  const handleSmsPatient = (patient: RecallPatient) => {
    setSelectedPatients([patient.id])
    setSmsModalOpen(true)
  }

  // 문자 발송 완료
  const handleSmsComplete = async (successCount: number, failCount: number) => {
    // 선택된 환자들 상태 업데이트
    if (successCount > 0) {
      await recallService.patients.updatePatientStatusBulk(selectedPatients, 'sms_sent')
      loadPatients()
      loadStats()
    }
    setSelectedPatients([])
  }

  // 전화 걸기
  const handleCallPatient = (patient: RecallPatient) => {
    setCallModalPatient(patient)
  }

  // 전화 완료
  const handleCallComplete = () => {
    loadPatients()
    loadStats()
  }

  // 상태 변경
  const handleUpdateStatus = (patient: RecallPatient) => {
    setStatusModalPatient(patient)
  }

  // 상태 변경 완료
  const handleStatusUpdateComplete = () => {
    loadPatients()
    loadStats()
  }

  // 이력 보기
  const handleViewHistory = (patient: RecallPatient) => {
    setHistoryModalPatient(patient)
  }

  // 새로고침
  const handleRefresh = () => {
    loadPatients()
    loadStats()
    showToast('새로고침되었습니다.', 'info')
  }

  // 선택된 환자 객체들
  const selectedPatientObjects = patients.filter(p => selectedPatients.includes(p.id))

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="bg-gradient-to-r from-indigo-600 to-purple-600 rounded-xl p-6 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center">
              <PhoneCall className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold">환자 리콜 관리</h1>
              <p className="text-indigo-200 mt-1">
                문자 발송 및 전화 리콜을 관리하세요
              </p>
            </div>
          </div>

          {/* 캠페인 선택 */}
          <div className="relative">
            <button
              onClick={() => setShowCampaignSelector(!showCampaignSelector)}
              className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
            >
              <FolderOpen className="w-5 h-5" />
              <span>{selectedCampaign?.name || '캠페인 선택'}</span>
              <ChevronDown className="w-4 h-4" />
            </button>

            {showCampaignSelector && (
              <>
                <div
                  className="fixed inset-0 z-10"
                  onClick={() => setShowCampaignSelector(false)}
                />
                <div className="absolute right-0 mt-2 w-64 bg-white rounded-lg shadow-xl border border-gray-200 py-2 z-20">
                  <div className="px-3 py-2 border-b border-gray-100">
                    <button
                      onClick={async () => {
                        const name = prompt('새 캠페인 이름을 입력하세요:')
                        if (name) {
                          await handleCreateCampaign(name)
                        }
                        setShowCampaignSelector(false)
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-indigo-600 hover:bg-indigo-50 rounded-lg"
                    >
                      <Plus className="w-4 h-4" />
                      새 캠페인 만들기
                    </button>
                  </div>
                  <div className="max-h-60 overflow-y-auto">
                    {campaigns.length === 0 ? (
                      <p className="px-4 py-3 text-sm text-gray-500 text-center">
                        캠페인이 없습니다
                      </p>
                    ) : (
                      campaigns.map(campaign => (
                        <button
                          key={campaign.id}
                          onClick={() => {
                            setSelectedCampaignId(campaign.id)
                            setShowCampaignSelector(false)
                          }}
                          className={`w-full px-4 py-2 text-left text-sm hover:bg-gray-50 ${
                            selectedCampaignId === campaign.id ? 'bg-indigo-50 text-indigo-700' : 'text-gray-700'
                          }`}
                        >
                          <p className="font-medium">{campaign.name}</p>
                          <p className="text-xs text-gray-400">
                            {campaign.total_patients}명 | {new Date(campaign.created_at).toLocaleDateString('ko-KR')}
                          </p>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        {/* 통계 요약 */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-6">
            <div className="bg-white/10 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold">{stats.total_patients}</p>
              <p className="text-sm text-indigo-200">전체 환자</p>
            </div>
            <div className="bg-white/10 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold">{stats.pending_count}</p>
              <p className="text-sm text-indigo-200">대기 중</p>
            </div>
            <div className="bg-white/10 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold">{stats.contacted_count}</p>
              <p className="text-sm text-indigo-200">연락 완료</p>
            </div>
            <div className="bg-white/10 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold">{stats.appointment_count}</p>
              <p className="text-sm text-indigo-200">예약 성공</p>
            </div>
            <div className="bg-white/10 rounded-lg p-3 text-center">
              <p className="text-2xl font-bold">{stats.success_rate}%</p>
              <p className="text-sm text-indigo-200">성공률</p>
            </div>
          </div>
        )}
      </div>

      {/* 탭 네비게이션 */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('patients')}
            className={`flex-1 flex items-center justify-center gap-2 py-4 text-sm font-medium transition-colors ${
              activeTab === 'patients'
                ? 'text-indigo-600 border-b-2 border-indigo-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Users className="w-5 h-5" />
            환자 목록
          </button>
          <button
            onClick={() => setActiveTab('stats')}
            className={`flex-1 flex items-center justify-center gap-2 py-4 text-sm font-medium transition-colors ${
              activeTab === 'stats'
                ? 'text-indigo-600 border-b-2 border-indigo-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <BarChart3 className="w-5 h-5" />
            통계
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`flex-1 flex items-center justify-center gap-2 py-4 text-sm font-medium transition-colors ${
              activeTab === 'settings'
                ? 'text-indigo-600 border-b-2 border-indigo-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Settings className="w-5 h-5" />
            설정
          </button>
        </div>

        {/* 탭 콘텐츠 */}
        <div className="p-4">
          {/* 환자 목록 탭 */}
          {activeTab === 'patients' && (
            <div className="space-y-4">
              {/* 액션 버튼들 */}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={() => setShowUpload(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                >
                  <Upload className="w-4 h-4" />
                  환자 업로드
                </button>

                {selectedPatients.length > 0 && (
                  <>
                    <button
                      onClick={handleBulkSms}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      <MessageSquare className="w-4 h-4" />
                      문자 발송 ({selectedPatients.length})
                    </button>
                  </>
                )}

                <button
                  onClick={handleRefresh}
                  className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors ml-auto"
                >
                  <RefreshCw className="w-4 h-4" />
                  새로고침
                </button>
              </div>

              {/* 파일 업로드 */}
              {showUpload && (
                <PatientFileUpload
                  onUpload={handleFileUpload}
                  onCancel={() => setShowUpload(false)}
                  isLoading={isUploading}
                />
              )}

              {/* 환자 목록 */}
              <PatientList
                patients={patients}
                selectedPatients={selectedPatients}
                onSelectPatient={handleSelectPatient}
                onSelectAll={handleSelectAll}
                onCallPatient={handleCallPatient}
                onSmsPatient={handleSmsPatient}
                onUpdateStatus={handleUpdateStatus}
                onViewHistory={handleViewHistory}
                filters={filters}
                onFiltersChange={setFilters}
                isLoading={isLoading}
              />
            </div>
          )}

          {/* 통계 탭 */}
          {activeTab === 'stats' && (
            <RecallStats
              campaignId={selectedCampaignId || undefined}
              campaignName={selectedCampaign?.name}
            />
          )}

          {/* 설정 탭 */}
          {activeTab === 'settings' && (
            <RecallSettings
              clinicId={user?.clinic_id || ''}
              clinicName={user?.clinic?.name || ''}
              clinicPhone={user?.clinic?.phone || ''}
            />
          )}
        </div>
      </div>

      {/* 모달들 */}
      <SmsSendModal
        isOpen={smsModalOpen}
        onClose={() => {
          setSmsModalOpen(false)
          setSelectedPatients([])
        }}
        patients={selectedPatientObjects}
        clinicName={user?.clinic?.name || ''}
        clinicPhone={user?.clinic?.phone || ''}
        clinicId={user?.clinic_id || ''}
        onSendComplete={handleSmsComplete}
      />

      <CallModal
        isOpen={!!callModalPatient}
        onClose={() => setCallModalPatient(null)}
        patient={callModalPatient}
        clinicId={user?.clinic_id || ''}
        onCallComplete={handleCallComplete}
      />

      <StatusUpdateModal
        isOpen={!!statusModalPatient}
        onClose={() => setStatusModalPatient(null)}
        patient={statusModalPatient}
        onUpdateComplete={handleStatusUpdateComplete}
      />

      <ContactHistoryModal
        isOpen={!!historyModalPatient}
        onClose={() => setHistoryModalPatient(null)}
        patient={historyModalPatient}
      />

      {/* 토스트 */}
      <Toast
        show={toast.show}
        message={toast.message}
        type={toast.type}
        onClose={() => setToast(prev => ({ ...prev, show: false }))}
      />
    </div>
  )
}
