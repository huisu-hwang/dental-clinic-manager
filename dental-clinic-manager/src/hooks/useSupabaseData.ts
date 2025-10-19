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
  const [currentClinicId, setCurrentClinicId] = useState<string | null>(clinicId ?? null)

  useEffect(() => {
    if (clinicId && clinicId !== currentClinicId) {
      setCurrentClinicId(clinicId)
    }
    if (!clinicId && currentClinicId) {
      setCurrentClinicId(null)
    }
  }, [clinicId, currentClinicId])

  // 재고 데이터만 업데이트하는 함수
  const fetchInventoryOnly = useCallback(async (clinicIdOverride?: string | null) => {
    try {
      const targetClinicId = clinicIdOverride ?? currentClinicId
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
          supabase.from('gift_inventory').select<'*', GiftInventory>('*'),
          targetClinicId
        ),
        applyClinicFilter(
          supabase.from('inventory_logs').select<'*', InventoryLog>('*'),
          targetClinicId
        )
      ])

      if (inventoryError) throw inventoryError
      if (invLogError) throw invLogError

      const { normalized: normalizedInventory, missingIds: inventoryIdsToBackfill } = ensureClinicIds(
        inventoryData as GiftInventory[] | null,
        targetClinicId
      )
      const { normalized: normalizedInventoryLogs, missingIds: inventoryLogIdsToBackfill } = ensureClinicIds(
        invLogData as InventoryLog[] | null,
        targetClinicId
      )

      const sortedInventoryData = normalizedInventory.sort((a, b) => a.name.localeCompare(b.name))
      const sortedInventoryLogs = normalizedInventoryLogs.sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      )

      setGiftInventory(sortedInventoryData)
      setInventoryLogs(sortedInventoryLogs)

      if (inventoryIdsToBackfill.length) {
        void backfillClinicIds(supabase, 'gift_inventory', targetClinicId, inventoryIdsToBackfill)
      }
      if (inventoryLogIdsToBackfill.length) {
        void backfillClinicIds(supabase, 'inventory_logs', targetClinicId, inventoryLogIdsToBackfill)
      }
    } catch (err: unknown) {
      console.error('Error fetching inventory data:', err)
      setError(err instanceof Error ? err.message : 'Unknown error occurred')
    }
  }, [currentClinicId])

  const fetchAllData = useCallback(async (clinicIdOverride?: string | null) => {
    try {
      setLoading(true)
      setError(null)

      const targetClinicId = clinicIdOverride ?? currentClinicId
      if (!targetClinicId) {
        console.warn('[useSupabaseData] No clinic_id available for data fetch')
        setLoading(false)
        return
      }

      const supabase = getSupabase()
      if (!supabase) {
        setError('Supabase client not available')
        setLoading(false)
        return
      }

      console.log('[useSupabaseData] 데이터 가져오기 시작...')

      // 각 쿼리를 개별적으로 실행하여 어느 쿼리에서 문제가 발생하는지 파악
      const [dailyResult, consultResult, giftResult, inventoryResult, invLogResult] = await Promise.allSettled([
        applyClinicFilter(
          supabase.from('daily_reports').select<'*', DailyReport>('*'),
          targetClinicId
        ),
        applyClinicFilter(
          supabase.from('consult_logs').select<'*', ConsultLog>('*'),
          targetClinicId
        ),
        applyClinicFilter(
          supabase.from('gift_logs').select<'*', GiftLog>('*'),
          targetClinicId
        ),
        applyClinicFilter(
          supabase.from('gift_inventory').select<'*', GiftInventory>('*'),
          targetClinicId
        ),
        applyClinicFilter(
          supabase.from('inventory_logs').select<'*', InventoryLog>('*'),
          targetClinicId
        )
      ])

      console.log('[useSupabaseData] 쿼리 결과:', {
        daily: dailyResult.status,
        consult: consultResult.status,
        gift: giftResult.status,
        inventory: inventoryResult.status,
        invLog: invLogResult.status
      })

      // 결과를 처리하여 일관된 형식으로 변환
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

      // 에러가 있어도 빈 데이터로 진행 (대시보드를 보여주기 위해)
      if (dailyError) console.warn('[useSupabaseData] Daily reports error:', dailyError)
      if (consultError) console.warn('[useSupabaseData] Consult logs error:', consultError)
      if (giftError) console.warn('[useSupabaseData] Gift logs error:', giftError)
      if (inventoryError) console.warn('[useSupabaseData] Inventory error:', inventoryError)
      if (invLogError) console.warn('[useSupabaseData] Inventory logs error:', invLogError)

      // 기존 dcm.html과 동일한 정렬 방식 적용
      const { normalized: normalizedDailyReports, missingIds: dailyIdsToBackfill } = ensureClinicIds(
        dailyData as DailyReport[] | null,
        targetClinicId
      )
      const { normalized: normalizedConsultLogs, missingIds: consultIdsToBackfill } = ensureClinicIds(
        consultData as ConsultLog[] | null,
        targetClinicId
      )
      const { normalized: normalizedGiftLogs, missingIds: giftIdsToBackfill } = ensureClinicIds(
        giftData as GiftLog[] | null,
        targetClinicId
      )
      const { normalized: normalizedInventoryData, missingIds: inventoryIdsToBackfill } = ensureClinicIds(
        inventoryData as GiftInventory[] | null,
        targetClinicId
      )
      const { normalized: normalizedInventoryLogs, missingIds: inventoryLogIdsToBackfill } = ensureClinicIds(
        invLogData as InventoryLog[] | null,
        targetClinicId
      )

      const sortedDailyReports = normalizedDailyReports.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      )
      const sortedConsultLogs = normalizedConsultLogs.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      )
      const sortedGiftLogs = normalizedGiftLogs.sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
      )
      const sortedInventoryData = normalizedInventoryData.sort((a, b) => a.name.localeCompare(b.name))
      const sortedInventoryLogs = normalizedInventoryLogs.sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      )

      setDailyReports(sortedDailyReports)
      setConsultLogs(sortedConsultLogs)
      setGiftLogs(sortedGiftLogs)
      setGiftInventory(sortedInventoryData)
      setInventoryLogs(sortedInventoryLogs)

      if (dailyIdsToBackfill.length) {
        void backfillClinicIds(supabase, 'daily_reports', targetClinicId, dailyIdsToBackfill)
      }
      if (consultIdsToBackfill.length) {
        void backfillClinicIds(supabase, 'consult_logs', targetClinicId, consultIdsToBackfill)
      }
      if (giftIdsToBackfill.length) {
        void backfillClinicIds(supabase, 'gift_logs', targetClinicId, giftIdsToBackfill)
      }
      if (inventoryIdsToBackfill.length) {
        void backfillClinicIds(supabase, 'gift_inventory', targetClinicId, inventoryIdsToBackfill)
      }
      if (inventoryLogIdsToBackfill.length) {
        void backfillClinicIds(supabase, 'inventory_logs', targetClinicId, inventoryLogIdsToBackfill)
      }

      // 모든 데이터가 비어있으면 에러 표시
      if (!dailyData && !consultData && !giftData && !inventoryData) {
        console.log('[useSupabaseData] 모든 데이터가 비어있음')
        // 에러 메시지 설정하지 않음 - 데이터가 없는 것은 정상 상태일 수 있음
      }

      console.log('[useSupabaseData] 데이터 로딩 완료')
    } catch (err: unknown) {
      console.error('[useSupabaseData] Error fetching data:', err)
      setError(err instanceof Error ? err.message : 'Unknown error occurred')
      // 에러가 있어도 빈 데이터로 대시보드 표시
      setDailyReports([])
      setConsultLogs([])
      setGiftLogs([])
      setGiftInventory([])
      setInventoryLogs([])
    } finally {
      console.log('[useSupabaseData] Finally - 로딩 상태를 false로 설정')
      setLoading(false)
    }
  }, [currentClinicId])

  useEffect(() => {
    if (typeof window === 'undefined') {
      console.log('[useSupabaseData] Server-side rendering, skipping data fetch')
      setLoading(false)
      return
    }

    if (!currentClinicId) {
      console.log('[useSupabaseData] No clinic_id yet, waiting for initialization')
      return
    }

    console.log('[useSupabaseData] Client-side, starting data fetch for clinic:', currentClinicId)

    const loadData = async () => {
      await fetchAllData(currentClinicId)
    }

    // 초기 데이터 로드
    loadData()

    // 실시간 구독 설정
    const supabase = getSupabase()
    if (!supabase) {
      console.log('[useSupabaseData] No supabase client for subscription')
      return
    }

    const channel = supabase
      .channel(`public-db-changes-${currentClinicId}`)
      .on('postgres_changes', { event: '*', schema: 'public', filter: `clinic_id=eq.${currentClinicId}` }, () => {
        console.log('[useSupabaseData] Database change detected, reloading data')
        fetchAllData(currentClinicId)
      })
      .subscribe()

    return () => {
      if (supabase && channel) {
        supabase.removeChannel(channel)
      }
    }
  }, [currentClinicId, fetchAllData])

  return {
    dailyReports,
    consultLogs,
    giftLogs,
    giftInventory,
    inventoryLogs,
    loading,
    error,
    refetch: () => fetchAllData(currentClinicId),
    refetchInventory: () => fetchInventoryOnly(currentClinicId)
  }
}
