'use client'

import { useState, useEffect } from 'react'
import { getSupabase } from '@/lib/supabase'
import type { DailyReport, ConsultLog, GiftLog, GiftInventory, InventoryLog } from '@/types'

export const useSupabaseData = () => {
  const [dailyReports, setDailyReports] = useState<DailyReport[]>([])
  const [consultLogs, setConsultLogs] = useState<ConsultLog[]>([])
  const [giftLogs, setGiftLogs] = useState<GiftLog[]>([])
  const [giftInventory, setGiftInventory] = useState<GiftInventory[]>([])
  const [inventoryLogs, setInventoryLogs] = useState<InventoryLog[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // 재고 데이터만 업데이트하는 함수
  const fetchInventoryOnly = async () => {
    try {
      const supabase = getSupabase()
      if (!supabase) {
        setError('Supabase client not available')
        return
      }

      const [
        { data: inventoryData, error: inventoryError },
        { data: invLogData, error: invLogError }
      ] = await Promise.all([
        supabase.from('gift_inventory').select<'*', GiftInventory>('*'),
        supabase.from('inventory_logs').select<'*', InventoryLog>('*')
      ])

      if (inventoryError) throw inventoryError
      if (invLogError) throw invLogError

      const sortedInventoryData = (inventoryData || []).sort((a, b) => a.name.localeCompare(b.name))
      const sortedInventoryLogs = (invLogData || []).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

      setGiftInventory(sortedInventoryData)
      setInventoryLogs(sortedInventoryLogs)
    } catch (err: unknown) {
      console.error('Error fetching inventory data:', err)
      setError(err instanceof Error ? err.message : 'Unknown error occurred')
    }
  }

  const fetchAllData = async () => {
    try {
      setLoading(true)
      setError(null)

      const supabase = getSupabase()
      if (!supabase) {
        setError('Supabase client not available')
        setLoading(false)
        return
      }

      // 타임아웃 설정 (5초)
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('데이터 로딩 시간 초과')), 5000)
      })

      const dataPromise = Promise.all([
        supabase.from('daily_reports').select<'*', DailyReport>('*'),
        supabase.from('consult_logs').select<'*', ConsultLog>('*'),
        supabase.from('gift_logs').select<'*', GiftLog>('*'),
        supabase.from('gift_inventory').select<'*', GiftInventory>('*'),
        supabase.from('inventory_logs').select<'*', InventoryLog>('*')
      ])

      const results = await Promise.race([dataPromise, timeoutPromise]) as any

      const [
        { data: dailyData, error: dailyError },
        { data: consultData, error: consultError },
        { data: giftData, error: giftError },
        { data: inventoryData, error: inventoryError },
        { data: invLogData, error: invLogError }
      ] = results

      // 에러가 있어도 빈 데이터로 진행 (대시보드를 보여주기 위해)
      if (dailyError) console.warn('Daily reports error:', dailyError)
      if (consultError) console.warn('Consult logs error:', consultError)
      if (giftError) console.warn('Gift logs error:', giftError)
      if (inventoryError) console.warn('Inventory error:', inventoryError)
      if (invLogError) console.warn('Inventory logs error:', invLogError)

      // 기존 dcm.html과 동일한 정렬 방식 적용
      const sortedDailyReports = (dailyData || []).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      const sortedConsultLogs = (consultData || []).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      const sortedGiftLogs = (giftData || []).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      const sortedInventoryData = (inventoryData || []).sort((a, b) => a.name.localeCompare(b.name))
      const sortedInventoryLogs = (invLogData || []).sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

      setDailyReports(sortedDailyReports)
      setConsultLogs(sortedConsultLogs)
      setGiftLogs(sortedGiftLogs)
      setGiftInventory(sortedInventoryData)
      setInventoryLogs(sortedInventoryLogs)

      // 모든 데이터가 비어있으면 에러 표시
      if (!dailyData && !consultData && !giftData && !inventoryData) {
        setError('데이터베이스에 연결할 수 없거나 데이터가 없습니다')
      }
    } catch (err: unknown) {
      console.error('Error fetching data:', err)
      setError(err instanceof Error ? err.message : 'Unknown error occurred')
      // 에러가 있어도 빈 데이터로 대시보드 표시
      setDailyReports([])
      setConsultLogs([])
      setGiftLogs([])
      setGiftInventory([])
      setInventoryLogs([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    const loadData = async () => {
      await fetchAllData()
    }
    loadData()

    const supabase = getSupabase()
    if (!supabase) return

    const channel = supabase
      .channel('public-db-changes')
      .on('postgres_changes', { event: '*', schema: 'public' }, () => {
        loadData()
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [])

  return {
    dailyReports,
    consultLogs,
    giftLogs,
    giftInventory,
    inventoryLogs,
    loading,
    error,
    refetch: fetchAllData,
    refetchInventory: fetchInventoryOnly
  }
}