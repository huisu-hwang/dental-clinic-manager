'use client'

import { useState, useEffect, useCallback } from 'react'
import { getSupabase } from '@/lib/supabase'
import { applyClinicFilter, ensureClinicIds, backfillClinicIds } from '@/lib/clinicScope'
import { refreshSessionWithTimeout, handleSessionExpired } from '@/lib/sessionUtils'
import type { DailyReport, ConsultLog, GiftLog, GiftInventory, InventoryLog } from '@/types'

export const useSupabaseData = (clinicId?: string | null) => {
  const [dailyReports, setDailyReports] = useState<DailyReport[]>([])
  const [consultLogs, setConsultLogs] = useState<ConsultLog[]>([])
  const [giftLogs, setGiftLogs] = useState<GiftLog[]>([])
  const [giftInventory, setGiftInventory] = useState<GiftInventory[]>([])
  const [inventoryLogs, setInventoryLogs] = useState<InventoryLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeClinicId, setActiveClinicId] = useState<string | null>(clinicId ?? null)

  useEffect(() => {
    const normalized = clinicId ?? null
    setActiveClinicId(prev => (prev === normalized ? prev : normalized))
  }, [clinicId])

  const fetchInventoryOnly = useCallback(
    async (clinicIdOverride?: string | null) => {
      try {
        const targetClinicId = clinicIdOverride ?? activeClinicId
        if (!targetClinicId) {
          console.warn('[useSupabaseData] No clinic_id available for inventory fetch')
          return
        }

        const supabase = getSupabase()
        if (!supabase) {
          setError('Supabase client not available')
          return
        }


        const [
          { data: inventoryData, error: inventoryError },
          { data: invLogData, error: invLogError }
        ] = await Promise.all([
          applyClinicFilter(
            supabase.from('gift_inventory').select('*'),
            targetClinicId
          ).then(result => result),
          applyClinicFilter(
            supabase.from('inventory_logs').select('*'),
            targetClinicId
          ).then(result => result)
        ])

        if (inventoryError) throw inventoryError
        if (invLogError) throw invLogError

        const { normalized: normalizedInventory, missingIds: inventoryMissing } = ensureClinicIds(
          inventoryData as GiftInventory[] | null,
          targetClinicId
        )
        const { normalized: normalizedInventoryLogs, missingIds: inventoryLogMissing } = ensureClinicIds(
          invLogData as InventoryLog[] | null,
          targetClinicId
        )

        const sortedInventoryData = [...normalizedInventory].sort((a, b) => a.name.localeCompare(b.name))
        const sortedInventoryLogs = [...normalizedInventoryLogs].sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        )

        setGiftInventory(sortedInventoryData)
        setInventoryLogs(sortedInventoryLogs)

        if (inventoryMissing.length) {
          void backfillClinicIds(supabase, 'gift_inventory', targetClinicId, inventoryMissing)
        }
        if (inventoryLogMissing.length) {
          void backfillClinicIds(supabase, 'inventory_logs', targetClinicId, inventoryLogMissing)
        }
      } catch (err: unknown) {
        console.error('Error fetching inventory data:', err)
        setError(err instanceof Error ? err.message : 'Unknown error occurred')
      }
    },
    [activeClinicId]
  )

  const fetchAllData = useCallback(
    async (clinicIdOverride?: string | null) => {
      try {
        const targetClinicId = clinicIdOverride ?? activeClinicId
        if (!targetClinicId) {
          console.warn('[useSupabaseData] No clinic_id available for data fetch')
          setLoading(false)
          return
        }

        setLoading(true)
        setError(null)

        let supabase = getSupabase()
        if (!supabase) {
          setError('Supabase client not available')
          setLoading(false)
          return
        }

        // 세션 검증 및 갱신
        console.log('[useSupabaseData] 세션 확인 중...')
        let { data: sessionData, error: sessionError } = await supabase.auth.getSession()

        if (sessionError || !sessionData.session) {
          console.warn('[useSupabaseData] 세션이 유효하지 않음, 갱신 시도...')
          const { session: refreshedSession, error: refreshError, needsReinitialization } = await refreshSessionWithTimeout(supabase, 5000)

          // Connection timeout 감지 시 client 재초기화
          if (needsReinitialization) {
            console.log('[useSupabaseData] Connection timeout detected, reinitializing Supabase client...')

            try {
              const { reinitializeSupabase } = await import('@/lib/supabase')
              const reinitializedClient = reinitializeSupabase()

              if (!reinitializedClient) {
                console.error('[useSupabaseData] Failed to reinitialize Supabase client')
                handleSessionExpired('connection_timeout')
                setLoading(false)
                return
              }

              console.log('[useSupabaseData] Supabase client reinitialized successfully')
              // 재초기화된 client 사용
              supabase = reinitializedClient

              // 재초기화 후 세션 다시 확인
              const recheckResult = await supabase.auth.getSession()
              sessionData = recheckResult.data
              sessionError = recheckResult.error

              if (sessionError || !sessionData.session) {
                console.error('[useSupabaseData] Session invalid even after reinitialization')
                handleSessionExpired('session_invalid')
                setLoading(false)
                return
              }

              console.log('[useSupabaseData] Session verified after reinitialization')
            } catch (reinitError) {
              console.error('[useSupabaseData] Error during client reinitialization:', reinitError)
              handleSessionExpired('reinitialization_error')
              setLoading(false)
              return
            }
          } else if (refreshError || !refreshedSession) {
            console.error('[useSupabaseData] 세션 갱신 실패:', refreshError)
            handleSessionExpired('session_expired')
            setLoading(false)
            return
          } else {
            console.log('[useSupabaseData] 세션 갱신 성공')
          }
        } else {
          console.log('[useSupabaseData] 유효한 세션 확인됨')
        }

        console.log('[useSupabaseData] 데이터 가져오기 시작...', targetClinicId)

        const startTime = Date.now()

        // 개별 쿼리 타임아웃 헬퍼 함수 (30초)
        const withTimeout = <T,>(promise: Promise<T>, ms: number, queryName: string): Promise<T> => {
          const queryStartTime = Date.now()
          let timeoutId: NodeJS.Timeout | null = null

          const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => {
              console.error(`[useSupabaseData] ${queryName} 타임아웃 (${ms}ms 초과)`)
              reject(new Error(`${queryName} timeout after ${ms}ms`))
            }, ms)
          })

          return Promise.race([
            promise.then(result => {
              const queryElapsedTime = Date.now() - queryStartTime
              console.log(`[useSupabaseData] ${queryName} 완료 (${queryElapsedTime}ms)`)
              if (timeoutId) clearTimeout(timeoutId)
              return result
            }).catch(err => {
              if (timeoutId) clearTimeout(timeoutId)
              throw err
            }),
            timeoutPromise
          ])
        }

        // 각 쿼리를 개별 타임아웃으로 감싸기 (30초 - idle 연결 재생성 시간 고려)
        const [dailyResult, consultResult, giftResult, inventoryResult, invLogResult] = await Promise.allSettled([
          withTimeout(
            Promise.resolve(applyClinicFilter(
              supabase.from('daily_reports').select('*'),
              targetClinicId
            ).then(result => result)),
            60000,
            'daily_reports'
          ),
          withTimeout(
            Promise.resolve(applyClinicFilter(
              supabase.from('consult_logs').select('*'),
              targetClinicId
            ).then(result => result)),
            60000,
            'consult_logs'
          ),
          withTimeout(
            Promise.resolve(applyClinicFilter(
              supabase.from('gift_logs').select('*'),
              targetClinicId
            ).then(result => result)),
            60000,
            'gift_logs'
          ),
          withTimeout(
            Promise.resolve(applyClinicFilter(
              supabase.from('gift_inventory').select('*'),
              targetClinicId
            ).then(result => result)),
            60000,
            'gift_inventory'
          ),
          withTimeout(
            Promise.resolve(applyClinicFilter(
              supabase.from('inventory_logs').select('*'),
              targetClinicId
            ).then(result => result)),
            60000,
            'inventory_logs'
          )
        ])

        const elapsedTime = Date.now() - startTime
        console.log(`[useSupabaseData] 전체 데이터 로딩 완료 (${elapsedTime}ms)`)

        console.log('[useSupabaseData] 쿼리 결과:', {
          daily: dailyResult.status,
          consult: consultResult.status,
          gift: giftResult.status,
          inventory: inventoryResult.status,
          invLog: invLogResult.status
        })

        // 실패한 쿼리 로깅 및 추적
        const failedQueries: string[] = []
        const timeoutQueries: string[] = []

        if (dailyResult.status === 'rejected') {
          console.error('[useSupabaseData] Daily reports 쿼리 실패:', dailyResult.reason)
          failedQueries.push('Daily reports')
          if (dailyResult.reason instanceof Error && dailyResult.reason.message.includes('timeout')) {
            timeoutQueries.push('Daily reports')
          }
        }
        if (consultResult.status === 'rejected') {
          console.error('[useSupabaseData] Consult logs 쿼리 실패:', consultResult.reason)
          failedQueries.push('Consult logs')
          if (consultResult.reason instanceof Error && consultResult.reason.message.includes('timeout')) {
            timeoutQueries.push('Consult logs')
          }
        }
        if (giftResult.status === 'rejected') {
          console.error('[useSupabaseData] Gift logs 쿼리 실패:', giftResult.reason)
          failedQueries.push('Gift logs')
          if (giftResult.reason instanceof Error && giftResult.reason.message.includes('timeout')) {
            timeoutQueries.push('Gift logs')
          }
        }
        if (inventoryResult.status === 'rejected') {
          console.error('[useSupabaseData] Inventory 쿼리 실패:', inventoryResult.reason)
          failedQueries.push('Inventory')
          if (inventoryResult.reason instanceof Error && inventoryResult.reason.message.includes('timeout')) {
            timeoutQueries.push('Inventory')
          }
        }
        if (invLogResult.status === 'rejected') {
          console.error('[useSupabaseData] Inventory logs 쿼리 실패:', invLogResult.reason)
          failedQueries.push('Inventory logs')
          if (invLogResult.reason instanceof Error && invLogResult.reason.message.includes('timeout')) {
            timeoutQueries.push('Inventory logs')
          }
        }

        // 타임아웃 경고 메시지
        if (timeoutQueries.length > 0) {
          const errorMessage = `데이터 로딩 중 시간이 초과되었습니다. 네트워크 연결 상태가 좋지 않거나, 장시간 활동이 없었을 경우 발생할 수 있습니다. 페이지를 새로고침해주세요. (${timeoutQueries.join(', ')})`
          console.error('[useSupabaseData] Query timeout error:', errorMessage)
          setError(errorMessage)
          // 타임아웃 발생 시에도 로딩 상태를 확실히 종료
          setDailyReports([])
          setConsultLogs([])
          setGiftLogs([])
          setGiftInventory([])
          setInventoryLogs([])
          setLoading(false)
          return // 추가 데이터 처리 중단
        }

        const results = [
          dailyResult.status === 'fulfilled' ? dailyResult.value : { data: [], error: 'Failed to fetch daily reports' },
          consultResult.status === 'fulfilled' ? consultResult.value : { data: [], error: 'Failed to fetch consult logs' },
          giftResult.status === 'fulfilled' ? giftResult.value : { data: [], error: 'Failed to fetch gift logs' },
          inventoryResult.status === 'fulfilled' ? inventoryResult.value : { data: [], error: 'Failed to fetch inventory' },
          invLogResult.status === 'fulfilled' ? invLogResult.value : { data: [], error: 'Failed to fetch inventory logs' }
        ]

        const [
          { data: dailyData, error: dailyError },
          { data: consultData, error: consultError },
          { data: giftData, error: giftError },
          { data: inventoryData, error: inventoryError },
          { data: invLogData, error: invLogError }
        ] = results

        if (dailyError) console.warn('[useSupabaseData] Daily reports error:', dailyError)
        if (consultError) console.warn('[useSupabaseData] Consult logs error:', consultError)
        if (giftError) console.warn('[useSupabaseData] Gift logs error:', giftError)
        if (inventoryError) console.warn('[useSupabaseData] Inventory error:', inventoryError)
        if (invLogError) console.warn('[useSupabaseData] Inventory logs error:', invLogError)

        const { normalized: normalizedDailyReports, missingIds: dailyMissing } = ensureClinicIds(
          dailyData as DailyReport[] | null,
          targetClinicId
        )
        const { normalized: normalizedConsultLogs, missingIds: consultMissing } = ensureClinicIds(
          consultData as ConsultLog[] | null,
          targetClinicId
        )
        const { normalized: normalizedGiftLogs, missingIds: giftMissing } = ensureClinicIds(
          giftData as GiftLog[] | null,
          targetClinicId
        )
        const { normalized: normalizedInventory, missingIds: inventoryMissing } = ensureClinicIds(
          inventoryData as GiftInventory[] | null,
          targetClinicId
        )
        const { normalized: normalizedInventoryLogs, missingIds: inventoryLogMissing } = ensureClinicIds(
          invLogData as InventoryLog[] | null,
          targetClinicId
        )

        const sortedDailyReports = [...normalizedDailyReports].sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        )
        const sortedConsultLogs = [...normalizedConsultLogs].sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        )
        const sortedGiftLogs = [...normalizedGiftLogs].sort(
          (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
        )
        const sortedInventoryData = [...normalizedInventory].sort((a, b) => a.name.localeCompare(b.name))
        const sortedInventoryLogs = [...normalizedInventoryLogs].sort(
          (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        )

        setDailyReports(sortedDailyReports)
        setConsultLogs(sortedConsultLogs)
        setGiftLogs(sortedGiftLogs)
        setGiftInventory(sortedInventoryData)
        setInventoryLogs(sortedInventoryLogs)

        if (dailyMissing.length) {
          void backfillClinicIds(supabase, 'daily_reports', targetClinicId, dailyMissing)
        }
        if (consultMissing.length) {
          void backfillClinicIds(supabase, 'consult_logs', targetClinicId, consultMissing)
        }
        if (giftMissing.length) {
          void backfillClinicIds(supabase, 'gift_logs', targetClinicId, giftMissing)
        }
        if (inventoryMissing.length) {
          void backfillClinicIds(supabase, 'gift_inventory', targetClinicId, inventoryMissing)
        }
        if (inventoryLogMissing.length) {
          void backfillClinicIds(supabase, 'inventory_logs', targetClinicId, inventoryLogMissing)
        }

        if (!dailyData && !consultData && !giftData && !inventoryData) {
          console.log('[useSupabaseData] 모든 데이터가 비어있음')
        }

        console.log('[useSupabaseData] 데이터 로딩 완료')
      } catch (err: unknown) {
        console.error('[useSupabaseData] Error fetching data:', err)

        let errorMessage = 'Unknown error occurred'

        if (err instanceof Error) {
          errorMessage = err.message
          console.error('[useSupabaseData] 에러 발생:', {
            message: err.message,
            stack: err.stack
          })
        }

        setError(errorMessage)

        // 타임아웃이나 에러 발생 시에도 빈 배열로 초기화하여 UI가 표시되도록 함
        setDailyReports([])
        setConsultLogs([])
        setGiftLogs([])
        setGiftInventory([])
        setInventoryLogs([])
      } finally {
        setLoading(false)
      }
    },
    [activeClinicId]
  )

  useEffect(() => {
    if (typeof window === 'undefined') {
      console.log('[useSupabaseData] Server-side rendering, skipping data fetch')
      setLoading(false)
      return
    }

    if (!activeClinicId) {
      console.log('[useSupabaseData] Waiting for clinic_id before loading data')
      setLoading(false)
      return
    }

    console.log('[useSupabaseData] Client-side, starting data fetch for clinic:', activeClinicId)
    setLoading(true) // clinic_id 변경 시 로딩 상태를 true로 설정

    // Call fetchAllData directly without creating a wrapper function
    fetchAllData(activeClinicId)

    const supabase = getSupabase()
    if (!supabase) {
      console.log('[useSupabaseData] No supabase client for subscription')
      return
    }

    let channel = supabase
      .channel(`public-db-changes-${activeClinicId}`)
      .on('postgres_changes', { event: '*', schema: 'public', filter: `clinic_id=eq.${activeClinicId}` }, () => {
        console.log('[useSupabaseData] Database change detected, reloading data')
        fetchAllData(activeClinicId)
      })
      .subscribe((status, err) => {
        console.log('[useSupabaseData] Subscription status:', status)
        if (err) {
          console.error('[useSupabaseData] Subscription error:', err)
        }
      })

    // Realtime 연결 상태 모니터링 및 자동 재연결
    let reconnectAttempts = 0
    const maxReconnectAttempts = 5
    const reconnectIntervalId = setInterval(() => {
      const channelState = channel.state
      console.log('[useSupabaseData] Channel state check:', channelState)

      // 연결이 끊어졌거나 에러 상태인 경우 재연결 시도
      if (channelState === 'closed' || channelState === 'errored') {
        reconnectAttempts++
        console.warn(`[useSupabaseData] Channel disconnected (state: ${channelState}), attempting to reconnect (${reconnectAttempts}/${maxReconnectAttempts})...`)

        if (reconnectAttempts <= maxReconnectAttempts) {
          // 기존 채널 정리
          supabase.removeChannel(channel).then(() => {
            console.log('[useSupabaseData] Old channel removed')

            // 새 채널 생성 및 구독
            channel = supabase
              .channel(`public-db-changes-${activeClinicId}-${Date.now()}`) // 타임스탬프 추가로 유니크한 채널명 생성
              .on('postgres_changes', { event: '*', schema: 'public', filter: `clinic_id=eq.${activeClinicId}` }, () => {
                console.log('[useSupabaseData] Database change detected (after reconnect), reloading data')
                fetchAllData(activeClinicId)
              })
              .subscribe((status, err) => {
                console.log('[useSupabaseData] Reconnection subscription status:', status)
                if (err) {
                  console.error('[useSupabaseData] Reconnection subscription error:', err)
                } else if (status === 'SUBSCRIBED') {
                  console.log('[useSupabaseData] Successfully reconnected to Realtime')
                  reconnectAttempts = 0 // 재연결 성공 시 카운터 리셋
                }
              })
          }).catch(err => {
            console.error('[useSupabaseData] Error removing old channel:', err)
          })
        } else {
          console.error('[useSupabaseData] Max reconnection attempts reached, stopping reconnection')
          clearInterval(reconnectIntervalId)
        }
      } else if (channelState === 'joined') {
        // 정상 연결 상태면 재연결 카운터 리셋
        if (reconnectAttempts > 0) {
          console.log('[useSupabaseData] Channel is healthy, resetting reconnect counter')
          reconnectAttempts = 0
        }
      }
    }, 30000) // 30초마다 연결 상태 확인 (3분 타임아웃보다 짧게 설정)

    return () => {
      console.log('[useSupabaseData] Cleaning up subscription and monitor')
      clearInterval(reconnectIntervalId)
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeClinicId])

  return {
    dailyReports,
    consultLogs,
    giftLogs,
    giftInventory,
    inventoryLogs,
    loading,
    error,
    refetch: () => fetchAllData(activeClinicId),
    refetchInventory: () => fetchInventoryOnly(activeClinicId)
  }
}
