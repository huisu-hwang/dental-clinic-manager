'use client'

import React, { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react'

interface SyncJob {
  id: string
  status: string
  data_types: string[]
  result_summary: Record<string, unknown> | null
  error_message: string | null
  progress_message?: string
  created_at: string
  started_at: string | null
  completed_at: string | null
  completedTypes?: string[]
}

interface HometaxSyncContextType {
  currentJob: SyncJob | null
  syncing: boolean
  cancelling: boolean
  error: string | null
  success: string | null
  clinicId: string | null
  startSync: (params: {
    clinicId: string
    year: number
    month: number
    dataTypes: string[]
  }) => Promise<void>
  cancelSync: () => Promise<void>
  loadActiveJob: (clinicId: string) => Promise<void>
  clearMessages: () => void
  onSyncComplete: React.MutableRefObject<(() => void) | null>
}

const HometaxSyncContext = createContext<HometaxSyncContextType | null>(null)

export function useHometaxSync() {
  const ctx = useContext(HometaxSyncContext)
  if (!ctx) {
    throw new Error('useHometaxSync must be used within HometaxSyncProvider')
  }
  return ctx
}

export function HometaxSyncProvider({ children }: { children: ReactNode }) {
  const [currentJob, setCurrentJob] = useState<SyncJob | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [cancelling, setCancelling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const onSyncComplete = useRef<(() => void) | null>(null)
  const clinicIdRef = useRef<string | null>(null)

  // Poll job status
  useEffect(() => {
    if (!currentJob || currentJob.status === 'completed' || currentJob.status === 'failed' || currentJob.status === 'cancelled') return

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/hometax/sync/status?jobId=${currentJob.id}`)
        const data = await res.json()
        if (data.success && data.data) {
          setCurrentJob(data.data)
          if (['completed', 'failed', 'cancelled'].includes(data.data.status)) {
            setSyncing(false)
            if (data.data.status === 'completed') {
              setSuccess('동기화가 완료되었습니다.')
              onSyncComplete.current?.()
            } else if (data.data.status === 'cancelled') {
              setError('동기화가 취소되었습니다.')
            } else {
              setError(`동기화 실패: ${data.data.error_message || '알 수 없는 오류'}`)
            }
          }
        }
      } catch {
        // polling failure ignored
      }
    }, 3000)

    return () => clearInterval(interval)
  }, [currentJob])

  const loadActiveJob = useCallback(async (clinicId: string) => {
    clinicIdRef.current = clinicId
    try {
      const res = await fetch(`/api/hometax/sync/status?clinicId=${clinicId}`)
      const data = await res.json()
      if (data.success && data.data && ['pending', 'running'].includes(data.data.status)) {
        setCurrentJob(data.data)
        setSyncing(true)
      }
    } catch {
      // ignored
    }
  }, [])

  const startSync = useCallback(async (params: {
    clinicId: string
    year: number
    month: number
    dataTypes: string[]
  }) => {
    if (params.dataTypes.length === 0) {
      setError('동기화할 데이터 유형을 선택해주세요.')
      return
    }

    setSyncing(true)
    setError(null)
    setSuccess(null)
    clinicIdRef.current = params.clinicId

    try {
      const res = await fetch('/api/hometax/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinicId: params.clinicId,
          year: params.year,
          month: params.month,
          dataTypes: params.dataTypes,
          jobType: 'manual_sync',
        }),
      })
      const data = await res.json()

      if (res.status === 409 && data.jobId) {
        const statusRes = await fetch(`/api/hometax/sync/status?jobId=${data.jobId}`)
        const statusData = await statusRes.json()
        if (statusData.success && statusData.data) {
          setCurrentJob(statusData.data)
          setSuccess('진행 중인 동기화 작업을 불러왔습니다.')
        } else {
          setError('진행 중인 동기화 작업이 있습니다.')
          setSyncing(false)
        }
      } else if (data.success) {
        setCurrentJob(data.data)
        setSuccess('동기화 작업이 시작되었습니다.')
      } else {
        setError(data.error || '동기화 요청에 실패했습니다.')
        setSyncing(false)
      }
    } catch {
      setError('서버 연결 중 오류가 발생했습니다.')
      setSyncing(false)
    }
  }, [])

  const cancelSync = useCallback(async () => {
    if (!currentJob || !clinicIdRef.current) return

    setCancelling(true)
    try {
      const res = await fetch('/api/hometax/sync/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: currentJob.id, clinicId: clinicIdRef.current }),
      })
      const data = await res.json()
      if (data.success) {
        setCurrentJob(prev => prev ? { ...prev, status: 'cancelled' } : null)
        setSyncing(false)
        setSuccess('동기화가 취소되었습니다.')
      } else {
        setError(data.error || '취소에 실패했습니다.')
      }
    } catch {
      setError('취소 중 오류가 발생했습니다.')
    } finally {
      setCancelling(false)
    }
  }, [currentJob])

  const clearMessages = useCallback(() => {
    setError(null)
    setSuccess(null)
  }, [])

  return (
    <HometaxSyncContext.Provider value={{
      currentJob,
      syncing,
      cancelling,
      error,
      success,
      clinicId: clinicIdRef.current,
      startSync,
      cancelSync,
      loadActiveJob,
      clearMessages,
      onSyncComplete,
    }}>
      {children}
    </HometaxSyncContext.Provider>
  )
}
