'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import PatientFilterPanel from './PatientFilterPanel'
import PatientSelectionList from './PatientSelectionList'
import RecallExcludeToggle from './RecallExcludeToggle'
import MessageEditor from './MessageEditor'
import SendActionBar from './SendActionBar'
import SendConfirmDialog from './SendConfirmDialog'
import type { BulkSmsFilter, BulkSmsEligiblePatient } from '@/types/bulkSms'

// 진입 시 기본값: "오늘 생일자" 자동 조회 — 데스크의 주요 use case
const INITIAL_FILTER: BulkSmsFilter = {
  gender: 'all', ageMin: null, ageMax: null,
  lastVisitFrom: null, lastVisitTo: null,
  lastTreatmentTypes: [], hasNextAppointment: null,
  birthMonths: [], birthToday: true, searchKeyword: '', activeOnly: true,
}

export default function SendTab() {
  const [filter, setFilter] = useState<BulkSmsFilter>(INITIAL_FILTER)
  const [excludeRecall, setExcludeRecall] = useState(true)
  const [patients, setPatients] = useState<BulkSmsEligiblePatient[]>([])
  const [excludedCount, setExcludedCount] = useState(0)
  const [noPhoneCount, setNoPhoneCount] = useState(0)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [title, setTitle] = useState('')
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingMode, setPendingMode] = useState<'immediate' | 'scheduled'>('immediate')
  const [pendingScheduledAt, setPendingScheduledAt] = useState<string | undefined>()
  const [sending, setSending] = useState(false)

  const fetchPatients = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/bulk-sms/patients', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filter, excludeRecallExcluded: excludeRecall }),
      })
      const d = await res.json()
      if (d.success) {
        setPatients(d.patients)
        setExcludedCount(d.excluded_count)
        setNoPhoneCount(d.no_phone_count)
        setSelectedIds(new Set(d.patients.map((p: BulkSmsEligiblePatient) => p.dentweb_patient_id)))
      } else {
        alert(d.error || '조회 실패')
      }
    } finally {
      setLoading(false)
    }
  }, [filter, excludeRecall])

  // 진입 시 1회 자동 조회 (기본 필터 = 오늘 생일자)
  const didAutoLoadRef = useRef(false)
  useEffect(() => {
    if (didAutoLoadRef.current) return
    didAutoLoadRef.current = true
    fetchPatients()
  }, [fetchPatients])

  const toggleOne = (id: string) => {
    const next = new Set(selectedIds)
    if (next.has(id)) next.delete(id); else next.add(id)
    setSelectedIds(next)
  }
  const toggleAll = (checked: boolean) => {
    setSelectedIds(checked ? new Set(patients.map(p => p.dentweb_patient_id)) : new Set())
  }

  const handleTest = async (phone: string) => {
    const res = await fetch('/api/bulk-sms/test-send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message, phoneNumber: phone, title, samplePatientName: '테스트' }),
    })
    const d = await res.json()
    if (!d.success) throw new Error(d.error || '발송 실패')
  }

  const openConfirm = (mode: 'immediate' | 'scheduled', scheduledAt?: string) => {
    if (!message.trim()) { alert('메시지를 입력하세요'); return }
    if (selectedIds.size === 0) { alert('선택된 환자가 없습니다'); return }
    setPendingMode(mode)
    setPendingScheduledAt(scheduledAt)
    setConfirmOpen(true)
  }

  const confirmSend = async () => {
    setSending(true)
    try {
      const endpoint = pendingMode === 'immediate' ? '/api/bulk-sms/send' : '/api/bulk-sms/schedule'
      const body = {
        filter,
        excludeRecallExcluded: excludeRecall,
        message,
        title: title || undefined,
        selectedPatientIds: Array.from(selectedIds),
        ...(pendingMode === 'scheduled' ? { scheduledAt: pendingScheduledAt } : {}),
      }
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await res.json()
      if (d.success) {
        alert(pendingMode === 'immediate'
          ? `발송 완료: 성공 ${d.success_count}건 / 실패 ${d.fail_count}건`
          : `예약 완료: ${new Date(d.scheduled_at).toLocaleString('ko-KR')}`)
        setConfirmOpen(false)
        setMessage('')
        setTitle('')
        setSelectedIds(new Set())
        setPatients([])
      } else {
        alert(d.error || '발송 실패')
      }
    } finally {
      setSending(false)
    }
  }

  const sampleName = patients.find(p => selectedIds.has(p.dentweb_patient_id))?.patient_name ?? '홍길동'

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      <div className="lg:col-span-1 space-y-4">
        <PatientFilterPanel value={filter} onChange={setFilter} onApply={fetchPatients} loading={loading} />
        <RecallExcludeToggle enabled={excludeRecall} onChange={(v) => { setExcludeRecall(v); fetchPatients() }} />
      </div>
      <div className="lg:col-span-2 space-y-4">
        <PatientSelectionList
          patients={patients}
          selectedIds={selectedIds}
          onToggle={toggleOne}
          onToggleAll={toggleAll}
          excludedCount={excludedCount}
          noPhoneCount={noPhoneCount}
          loading={loading}
        />
        <MessageEditor message={message} onMessageChange={setMessage} title={title} onTitleChange={setTitle} />
        <SendActionBar
          canSend={selectedIds.size > 0 && message.trim().length > 0}
          onTestSend={handleTest}
          onSubmitImmediate={() => openConfirm('immediate')}
          onSubmitScheduled={(iso) => openConfirm('scheduled', iso)}
        />
      </div>

      <SendConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={confirmSend}
        selectedCount={selectedIds.size}
        message={message}
        sampleName={sampleName}
        excludeRecallExcluded={excludeRecall}
        mode={pendingMode}
        scheduledAt={pendingScheduledAt}
        sending={sending}
      />
    </div>
  )
}
