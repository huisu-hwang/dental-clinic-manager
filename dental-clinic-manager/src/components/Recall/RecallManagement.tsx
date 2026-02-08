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
  PhoneCall,
  UserX,
  Heart,
  ShieldOff,
  Undo2
} from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import type {
  RecallCampaign,
  RecallPatient,
  RecallPatientUploadData,
  RecallPatientFilters,
  RecallStats as RecallStatsType,
  PatientRecallStatus,
  RecallExcludeReason
} from '@/types/recall'
import { recallService } from '@/lib/recallService'
import PatientFileUpload from './PatientFileUpload'
import PatientList from './PatientList'
import PatientAddModal from './PatientAddModal'
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
  const [showExcludeUpload, setShowExcludeUpload] = useState(false)
  const [excludeUploadReason, setExcludeUploadReason] = useState<RecallExcludeReason>('family')
  const [showCampaignSelector, setShowCampaignSelector] = useState(false)

  // 데이터 상태
  const [campaigns, setCampaigns] = useState<RecallCampaign[]>([])
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null)
  const [patients, setPatients] = useState<RecallPatient[]>([])
  const [stats, setStats] = useState<RecallStatsType | null>(null)
  const [filters, setFilters] = useState<RecallPatientFilters>({})

  // 페이지네이션 상태
  const [currentPage, setCurrentPage] = useState(1)
  const [totalPages, setTotalPages] = useState(1)
  const [totalPatients, setTotalPatients] = useState(0)
  const pageSize = 20

  // 선택 상태
  const [selectedPatients, setSelectedPatients] = useState<string[]>([])

  // 모달 상태
  const [smsModalOpen, setSmsModalOpen] = useState(false)
  const [patientAddModalOpen, setPatientAddModalOpen] = useState(false)
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

  const loadPatients = useCallback(async (page: number = currentPage) => {
    setIsLoading(true)
    const filterWithCampaign = {
      ...filters,
      campaign_id: selectedCampaignId || undefined,
      page,
      pageSize
    }
    const result = await recallService.patients.getPatients(filterWithCampaign)
    if (result.success && result.data) {
      setPatients(result.data.data)
      setTotalPages(result.data.totalPages)
      setTotalPatients(result.data.total)
      setCurrentPage(result.data.page)
    }
    setIsLoading(false)
  }, [filters, selectedCampaignId, currentPage, pageSize])

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
      setCurrentPage(1) // 필터 변경 시 첫 페이지로
      loadPatients(1)
      loadStats()
    }
  }, [selectedCampaignId, filters])

  // 페이지 변경
  const handlePageChange = (page: number) => {
    setCurrentPage(page)
    loadPatients(page)
  }

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

  // 상태 변경 (직접 상태 전달 시 바로 업데이트, 없으면 모달 열기)
  const handleUpdateStatus = async (patient: RecallPatient, newStatus?: PatientRecallStatus) => {
    if (newStatus) {
      // 낙관적 업데이트: 먼저 UI를 즉시 업데이트
      const previousStatus = patient.status
      setPatients(prev => prev.map(p =>
        p.id === patient.id ? { ...p, status: newStatus } : p
      ))

      // 백그라운드에서 서버 업데이트
      const result = await recallService.patients.updatePatientStatus(patient.id, newStatus)
      if (result.success) {
        // 통계만 업데이트 (환자 목록은 이미 업데이트됨)
        loadStats()
      } else {
        // 실패 시 이전 상태로 복원
        setPatients(prev => prev.map(p =>
          p.id === patient.id ? { ...p, status: previousStatus } : p
        ))
        showToast(result.error || '상태 변경에 실패했습니다.', 'error')
      }
    } else {
      // 모달로 상태 변경
      setStatusModalPatient(patient)
    }
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

  // 리콜 제외/복원
  const handleExcludePatient = async (patient: RecallPatient, reason: RecallExcludeReason | null) => {
    const result = await recallService.patients.updateExcludeReason(patient.id, reason)
    if (result.success) {
      if (reason) {
        const label = reason === 'family' ? '친인척/가족' : '비우호적'
        showToast(`${patient.patient_name}님이 리콜 제외(${label})되었습니다.`, 'success')
      } else {
        showToast(`${patient.patient_name}님이 리콜 대상으로 복원되었습니다.`, 'success')
      }
      loadPatients()
      loadStats()
    } else {
      showToast(result.error || '처리에 실패했습니다.', 'error')
    }
  }

  // 일괄 리콜 제외
  const handleBulkExclude = async (reason: RecallExcludeReason) => {
    if (selectedPatients.length === 0) {
      showToast('환자를 선택해주세요.', 'warning')
      return
    }
    const label = reason === 'family' ? '친인척/가족' : '비우호적'
    const result = await recallService.patients.updateExcludeReasonBulk(selectedPatients, reason)
    if (result.success) {
      showToast(`${selectedPatients.length}명이 리콜 제외(${label})되었습니다.`, 'success')
      setSelectedPatients([])
      loadPatients()
      loadStats()
    } else {
      showToast(result.error || '일괄 제외에 실패했습니다.', 'error')
    }
  }

  // 일괄 리콜 복원
  const handleBulkRestore = async () => {
    if (selectedPatients.length === 0) {
      showToast('환자를 선택해주세요.', 'warning')
      return
    }
    const result = await recallService.patients.updateExcludeReasonBulk(selectedPatients, null)
    if (result.success) {
      showToast(`${selectedPatients.length}명이 리콜 대상으로 복원되었습니다.`, 'success')
      setSelectedPatients([])
      loadPatients()
      loadStats()
    } else {
      showToast(result.error || '일괄 복원에 실패했습니다.', 'error')
    }
  }

  // 제외 환자 파일 업로드
  const handleExcludeFileUpload = async (uploadedPatients: RecallPatientUploadData[], filename: string) => {
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

      if (result.success && result.insertedCount && result.insertedCount > 0) {
        // 등록된 환자들을 조회하여 ID 가져오기 (최근 등록된 환자들)
        const patientsResult = await recallService.patients.getPatients({
          campaign_id: campaignId,
          page: 1,
          pageSize: result.insertedCount,
          showExcluded: false
        })

        if (patientsResult.success && patientsResult.data) {
          // 방금 등록한 환자들 (pending 상태, exclude_reason이 null인)
          const newPatientIds = patientsResult.data.data
            .filter(p => !p.exclude_reason)
            .slice(0, result.insertedCount)
            .map(p => p.id)

          if (newPatientIds.length > 0) {
            await recallService.patients.updateExcludeReasonBulk(newPatientIds, excludeUploadReason)
          }
        }

        const label = excludeUploadReason === 'family' ? '친인척/가족' : '비우호적'
        showToast(`${result.insertedCount}명이 제외 환자(${label})로 등록되었습니다.`, 'success')
        setShowExcludeUpload(false)
        loadPatients()
        loadStats()
        loadCampaigns()
      } else {
        showToast(result.error || '환자 등록에 실패했습니다.', 'error')
      }
    } catch (error) {
      console.error('Exclude upload error:', error)
      showToast('업로드 중 오류가 발생했습니다.', 'error')
    } finally {
      setIsUploading(false)
    }
  }

  // 새로고침
  const handleRefresh = () => {
    loadPatients()
    loadStats()
    showToast('새로고침되었습니다.', 'info')
  }

  // 환자 추가 완료
  const handlePatientAddComplete = () => {
    loadPatients()
    loadStats()
    loadCampaigns()
    showToast('환자가 추가되었습니다.', 'success')
  }

  // 선택된 환자 객체들
  const selectedPatientObjects = patients.filter(p => selectedPatients.includes(p.id))

  return (
    <div className="max-w-6xl">
      {/* 블루 그라데이션 헤더 */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-4 sm:px-6 py-3 sm:py-4 rounded-t-xl shadow-sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-white/20 rounded-lg flex items-center justify-center">
              <PhoneCall className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">환자 리콜 관리</h2>
              <p className="text-blue-100 text-xs sm:text-sm hidden sm:block">Patient Recall Management</p>
            </div>
          </div>

          {/* 캠페인 선택 */}
          <div className="relative">
            <button
              onClick={() => setShowCampaignSelector(!showCampaignSelector)}
              className="flex items-center gap-2 px-3 py-1.5 sm:px-4 sm:py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors text-white text-sm"
            >
              <FolderOpen className="w-4 h-4" />
              <span className="hidden sm:inline">{selectedCampaign?.name || '캠페인 선택'}</span>
              <span className="sm:hidden">{selectedCampaign?.name ? selectedCampaign.name.substring(0, 8) : '캠페인'}</span>
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
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm text-blue-600 hover:bg-blue-50 rounded-lg"
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
                            selectedCampaignId === campaign.id ? 'bg-blue-50 text-blue-700' : 'text-gray-700'
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
          <div className="grid grid-cols-5 gap-2 sm:gap-4 mt-4">
            <div className="bg-white/10 rounded-lg p-2 sm:p-3 text-center">
              <p className="text-lg sm:text-2xl font-bold text-white">{stats.total_patients}</p>
              <p className="text-xs text-blue-100">전체</p>
            </div>
            <div className="bg-white/10 rounded-lg p-2 sm:p-3 text-center">
              <p className="text-lg sm:text-2xl font-bold text-white">{stats.pending_count}</p>
              <p className="text-xs text-blue-100">대기</p>
            </div>
            <div className="bg-white/10 rounded-lg p-2 sm:p-3 text-center">
              <p className="text-lg sm:text-2xl font-bold text-white">{stats.contacted_count}</p>
              <p className="text-xs text-blue-100">연락</p>
            </div>
            <div className="bg-white/10 rounded-lg p-2 sm:p-3 text-center">
              <p className="text-lg sm:text-2xl font-bold text-white">{stats.appointment_count}</p>
              <p className="text-xs text-blue-100">예약</p>
            </div>
            <div className="bg-white/10 rounded-lg p-2 sm:p-3 text-center">
              <p className="text-lg sm:text-2xl font-bold text-white">{stats.success_rate}%</p>
              <p className="text-xs text-blue-100">성공률</p>
            </div>
          </div>
        )}
      </div>

      {/* 서브 탭 네비게이션 */}
      <div className="border-x border-b border-slate-200 bg-slate-50">
        <nav className="flex space-x-1 p-1.5 sm:p-2 overflow-x-auto scrollbar-hide" aria-label="Tabs">
          <button
            onClick={() => setActiveTab('patients')}
            className={`py-1.5 sm:py-2 px-2.5 sm:px-4 inline-flex items-center rounded-lg font-medium text-xs sm:text-sm transition-all whitespace-nowrap ${
              activeTab === 'patients'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
            }`}
          >
            <Users className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" />
            환자 목록
          </button>
          <button
            onClick={() => setActiveTab('stats')}
            className={`py-1.5 sm:py-2 px-2.5 sm:px-4 inline-flex items-center rounded-lg font-medium text-xs sm:text-sm transition-all whitespace-nowrap ${
              activeTab === 'stats'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" />
            통계
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`py-1.5 sm:py-2 px-2.5 sm:px-4 inline-flex items-center rounded-lg font-medium text-xs sm:text-sm transition-all whitespace-nowrap ${
              activeTab === 'settings'
                ? 'bg-white text-blue-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-700 hover:bg-white/50'
            }`}
          >
            <Settings className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5 sm:mr-2" />
            설정
          </button>
        </nav>
      </div>

      {/* 탭 콘텐츠 */}
      <div className="bg-white border-x border-b border-slate-200 rounded-b-xl p-3 sm:p-6">
        {/* 환자 목록 탭 */}
        {activeTab === 'patients' && (
          <div className="space-y-4">
            {/* 액션 버튼들 */}
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <button
                onClick={() => setShowUpload(true)}
                className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
              >
                <Upload className="w-4 h-4" />
                <span className="hidden sm:inline">환자 업로드</span>
                <span className="sm:hidden">업로드</span>
              </button>

              <button
                onClick={() => setPatientAddModalOpen(true)}
                className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">환자 추가</span>
                <span className="sm:hidden">추가</span>
              </button>

              {/* 일반 환자 목록: 문자 + 제외 버튼 (항상 표시) */}
              {!filters.showExcluded && (
                <>
                  <div className="relative group">
                    <button
                      onClick={selectedPatients.length > 0 ? handleBulkSms : undefined}
                      className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-lg transition-colors text-sm ${
                        selectedPatients.length > 0
                          ? 'bg-purple-600 text-white hover:bg-purple-700 cursor-pointer'
                          : 'bg-purple-200 text-purple-400 cursor-default'
                      }`}
                    >
                      <MessageSquare className="w-4 h-4" />
                      문자 {selectedPatients.length > 0 && `(${selectedPatients.length})`}
                    </button>
                    {selectedPatients.length === 0 && (
                      <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-48 px-3 py-2 bg-gray-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none text-center">
                        환자를 선택한 후 클릭하세요
                        <div className="absolute left-1/2 -translate-x-1/2 top-full w-2 h-2 bg-gray-800 rotate-45"></div>
                      </div>
                    )}
                  </div>

                  {/* 일괄 제외 드롭다운 (항상 표시) */}
                  <div className="relative group">
                    <button
                      className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-lg transition-colors text-sm ${
                        selectedPatients.length > 0
                          ? 'bg-rose-600 text-white hover:bg-rose-700 cursor-pointer'
                          : 'bg-rose-200 text-rose-400 cursor-default'
                      }`}
                    >
                      <UserX className="w-4 h-4" />
                      제외 {selectedPatients.length > 0 && `(${selectedPatients.length})`}
                      {selectedPatients.length > 0 && <ChevronDown className="w-3 h-3" />}
                    </button>
                    {selectedPatients.length === 0 ? (
                      <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-48 px-3 py-2 bg-gray-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none text-center">
                        환자를 선택한 후 클릭하세요
                        <div className="absolute left-1/2 -translate-x-1/2 top-full w-2 h-2 bg-gray-800 rotate-45"></div>
                      </div>
                    ) : (
                      <div className="absolute left-0 top-full mt-1 w-44 bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-30 hidden group-hover:block">
                        <button
                          onClick={() => handleBulkExclude('family')}
                          className="w-full px-3 py-2.5 text-left text-sm hover:bg-amber-50 flex items-center gap-2 text-gray-700"
                        >
                          <Heart className="w-4 h-4 text-amber-500" />
                          친인척/가족
                        </button>
                        <button
                          onClick={() => handleBulkExclude('unfavorable')}
                          className="w-full px-3 py-2.5 text-left text-sm hover:bg-rose-50 flex items-center gap-2 text-gray-700"
                        >
                          <ShieldOff className="w-4 h-4 text-rose-500" />
                          비우호적
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* 제외 환자 목록: 복원 + 문자 버튼 (항상 표시) */}
              {filters.showExcluded && (
                <>
                  <div className="relative group">
                    <button
                      onClick={selectedPatients.length > 0 ? handleBulkSms : undefined}
                      className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-lg transition-colors text-sm ${
                        selectedPatients.length > 0
                          ? 'bg-purple-600 text-white hover:bg-purple-700 cursor-pointer'
                          : 'bg-purple-200 text-purple-400 cursor-default'
                      }`}
                    >
                      <MessageSquare className="w-4 h-4" />
                      문자 {selectedPatients.length > 0 && `(${selectedPatients.length})`}
                    </button>
                    {selectedPatients.length === 0 && (
                      <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-48 px-3 py-2 bg-gray-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none text-center">
                        환자를 선택한 후 클릭하세요
                        <div className="absolute left-1/2 -translate-x-1/2 top-full w-2 h-2 bg-gray-800 rotate-45"></div>
                      </div>
                    )}
                  </div>

                  <div className="relative group">
                    <button
                      onClick={selectedPatients.length > 0 ? handleBulkRestore : undefined}
                      className={`flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 rounded-lg transition-colors text-sm ${
                        selectedPatients.length > 0
                          ? 'bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer'
                          : 'bg-emerald-200 text-emerald-400 cursor-default'
                      }`}
                    >
                      <Undo2 className="w-4 h-4" />
                      복원 {selectedPatients.length > 0 && `(${selectedPatients.length})`}
                    </button>
                    {selectedPatients.length === 0 && (
                      <div className="absolute left-1/2 -translate-x-1/2 bottom-full mb-2 w-48 px-3 py-2 bg-gray-800 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none text-center">
                        환자를 선택한 후 클릭하세요
                        <div className="absolute left-1/2 -translate-x-1/2 top-full w-2 h-2 bg-gray-800 rotate-45"></div>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* 제외 환자 파일 업로드 버튼 */}
              {filters.showExcluded && (
                <button
                  onClick={() => setShowExcludeUpload(true)}
                  className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors text-sm"
                >
                  <Upload className="w-4 h-4" />
                  <span className="hidden sm:inline">제외 환자 업로드</span>
                  <span className="sm:hidden">업로드</span>
                </button>
              )}

              <button
                onClick={handleRefresh}
                className="flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors ml-auto text-sm"
              >
                <RefreshCw className="w-4 h-4" />
                <span className="hidden sm:inline">새로고침</span>
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

            {/* 제외 환자 파일 업로드 */}
            {showExcludeUpload && (
              <div className="space-y-3">
                <div className="flex items-center gap-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
                  <UserX className="w-5 h-5 text-amber-600 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-amber-800">제외 환자 파일 업로드</p>
                    <p className="text-xs text-amber-600">업로드된 환자가 자동으로 리콜 제외 처리됩니다.</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <label className="text-sm text-amber-700">제외 사유:</label>
                    <select
                      value={excludeUploadReason}
                      onChange={(e) => setExcludeUploadReason(e.target.value as RecallExcludeReason)}
                      className="px-3 py-1.5 text-sm border border-amber-300 rounded-lg bg-white focus:ring-2 focus:ring-amber-500"
                    >
                      <option value="family">친인척/가족</option>
                      <option value="unfavorable">비우호적</option>
                    </select>
                  </div>
                </div>
                <PatientFileUpload
                  onUpload={handleExcludeFileUpload}
                  onCancel={() => setShowExcludeUpload(false)}
                  isLoading={isUploading}
                />
              </div>
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
              onExcludePatient={handleExcludePatient}
              filters={filters}
              onFiltersChange={setFilters}
              isLoading={isLoading}
              currentPage={currentPage}
              totalPages={totalPages}
              totalPatients={totalPatients}
              onPageChange={handlePageChange}
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

      {/* 모달들 */}
      <PatientAddModal
        isOpen={patientAddModalOpen}
        onClose={() => setPatientAddModalOpen(false)}
        campaignId={selectedCampaignId || undefined}
        onAddComplete={handlePatientAddComplete}
      />

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
