'use client'

import { useState, useEffect, useCallback } from 'react'
import { getSupabase } from '@/lib/supabase'
import { applyClinicFilter, ensureClinicIds, backfillClinicIds } from '@/lib/clinicScope'
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
          ),
          applyClinicFilter(
            supabase.from('inventory_logs').select('*'),
            targetClinicId
          )
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

        const supabase = getSupabase()
        if (!supabase) {
          setError('Supabase client not available')
          setLoading(false)
          return
        }

        console.log('[useSupabaseData] 데이터 가져오기 시작...', targetClinicId)

        // 타임아웃 설정 (10초)
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Data fetch timeout')), 10000)
        )

        const dataPromise = Promise.allSettled([
          applyClinicFilter(
            supabase.from('daily_reports').select('*'),
            targetClinicId
          ),
          applyClinicFilter(
            supabase.from('consult_logs').select('*'),
            targetClinicId
          ),
          applyClinicFilter(
            supabase.from('gift_logs').select('*'),
            targetClinicId
          ),
          applyClinicFilter(
            supabase.from('gift_inventory').select('*'),
            targetClinicId
          ),
          applyClinicFilter(
            supabase.from('inventory_logs').select('*'),
            targetClinicId
          )
        ])

        const [dailyResult, consultResult, giftResult, inventoryResult, invLogResult] = await Promise.race([
          dataPromise,
          timeoutPromise
        ]) as any

        console.log('[useSupabaseData] 쿼리 결과:', {
          daily: dailyResult.status,
          consult: consultResult.status,
          gift: giftResult.status,
          inventory: inventoryResult.status,
          invLog: invLogResult.status
        })

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
        const errorMessage = err instanceof Error && err.message === 'Data fetch timeout'
          ? '데이터 로딩 시간이 초과되었습니다. 네트워크 연결을 확인하거나 페이지를 새로고침해주세요.'
          : err instanceof Error ? err.message : 'Unknown error occurred'
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

    // Call fetchAllData directly without creating a wrapper function
    fetchAllData(activeClinicId)

    const supabase = getSupabase()
    if (!supabase) {
      console.log('[useSupabaseData] No supabase client for subscription')
      return
    }

    const channel = supabase
      .channel(`public-db-changes-${activeClinicId}`)
      .on('postgres_changes', { event: '*', schema: 'public', filter: `clinic_id=eq.${activeClinicId}` }, () => {
        console.log('[useSupabaseData] Database change detected, reloading data')
        fetchAllData(activeClinicId)
      })
      .subscribe()

    return () => {
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
