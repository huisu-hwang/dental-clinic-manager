'use client'

import { useState, useCallback, useEffect } from 'react'

type WorkerType = 'marketing' | 'scraping'

interface WorkerStatusResult {
  marketing?: { online: boolean }
  scraping?: { online: boolean; workerCount: number }
}

/**
 * 워커 상태를 확인하는 커스텀 훅
 * - checkWorkerStatus(type): 워커가 온라인인지 확인하고 boolean 반환
 * - checking: 현재 확인 중인지 여부
 * - workerOnline: 자동 확인 결과 (autoCheck 옵션 설정 시)
 * - initialCheckDone: 초기 확인 완료 여부 (autoCheck 옵션 설정 시)
 * - recheckWorker: 워커 상태 수동 재확인 (autoCheck 옵션 설정 시)
 */
export function useWorkerStatus(options?: {
  /** 마운트 시 자동으로 확인할 워커 타입 */
  autoCheck?: WorkerType
  /** 자동 확인 주기 (ms). 기본값: 없음 (마운트 시 1회만) */
  refreshInterval?: number
}) {
  const [checking, setChecking] = useState(false)
  const [workerOnline, setWorkerOnline] = useState<boolean | null>(null)
  const [initialCheckDone, setInitialCheckDone] = useState(false)

  const autoCheck = options?.autoCheck
  const refreshInterval = options?.refreshInterval

  const checkWorkerStatus = useCallback(async (type: WorkerType): Promise<boolean> => {
    setChecking(true)
    try {
      const res = await fetch(`/api/workers/status?type=${type}`, {
        signal: AbortSignal.timeout(5000),
      })
      if (!res.ok) return false

      const data: WorkerStatusResult = await res.json()

      if (type === 'marketing') {
        return data.marketing?.online ?? false
      }
      if (type === 'scraping') {
        return data.scraping?.online ?? false
      }
      return false
    } catch {
      return false
    } finally {
      setChecking(false)
    }
  }, [])

  // 워커 상태 수동 재확인 (배너의 새로고침 버튼용)
  const recheckWorker = useCallback(async () => {
    if (!autoCheck) return
    setWorkerOnline(null)
    setInitialCheckDone(false)
    const online = await checkWorkerStatus(autoCheck)
    setWorkerOnline(online)
    setInitialCheckDone(true)
  }, [autoCheck, checkWorkerStatus])

  // 마운트 시 자동 확인
  useEffect(() => {
    if (!autoCheck) return

    let cancelled = false

    const check = async () => {
      const online = await checkWorkerStatus(autoCheck)
      if (!cancelled) {
        setWorkerOnline(online)
        setInitialCheckDone(true)
      }
    }

    check()

    let interval: ReturnType<typeof setInterval> | undefined
    if (refreshInterval && refreshInterval > 0) {
      interval = setInterval(check, refreshInterval)
    }

    return () => {
      cancelled = true
      if (interval) clearInterval(interval)
    }
  }, [autoCheck, refreshInterval, checkWorkerStatus])

  return { checkWorkerStatus, checking, workerOnline, initialCheckDone, recheckWorker }
}
