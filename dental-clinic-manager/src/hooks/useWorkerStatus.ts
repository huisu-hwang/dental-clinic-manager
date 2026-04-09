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
      // 1. 공통 DB 기반 상태 조회 (Heartbeat 확인)
      const res = await fetch(`/api/workers/status?type=${type}`, {
        signal: AbortSignal.timeout(5000),
      })
      if (!res.ok) return false

      const data: WorkerStatusResult = await res.json()
      let isDbOnline = false

      if (type === 'marketing') {
        isDbOnline = data.marketing?.online ?? false
        
        // 마케팅 워커인 경우: 로컬 호스트 API Ping(이중 확인)
        try {
          // 로컬 워커가 응답하는지 (워커가 켜져있는지) 확인
          const localRes = await fetch('http://localhost:4001/health', {
            signal: AbortSignal.timeout(2000), // 로컬이므로 짧은 타임아웃
            mode: 'cors'
          })
          if (localRes.ok) {
            const localData = await localRes.json()
            // 로컬 연결도 성공하고, 실행 중이면 true
            if (localData.running) {
              return true
            }
          }
        } catch (localError) {
          // 로컬 호스트 연결 실패 
          // (앱이 켜지지 않았거나, 설치되지 않았음)
          console.warn('[useWorkerStatus] Marketing worker local ping failed:', localError);
        }

        // 로컬 핑에 실패했지만 DB가 살아있다고 리포트하면, 
        // 외부 워커 서버가 돌고 있을 수도 있으니 설정에 따라 DB 상태로 fallback 가능
        // 단, 클라이언트가 직접 설치-로컬 확인하는 "통합 워커" 정책상 
        // 로컬 응답을 기준으로 하는게 확실함. 
        // 여기서는 DB상태만 통과해도 어느 하나라도 켜져있다고 판단하도록 보수적 처리할지,
        // (현재는 DB 상태가 온라인이면 임시로 온라인이라 쳐줌. 원격/분산 워커 대비)
        return isDbOnline
      }
      
      if (type === 'scraping') {
        isDbOnline = data.scraping?.online ?? false
        return isDbOnline
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
