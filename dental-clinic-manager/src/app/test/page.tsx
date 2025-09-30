'use client'

import { useState, useEffect } from 'react'
import { getSupabase } from '@/lib/supabase'

export default function TestPage() {
  const [status, setStatus] = useState<string>('초기화 중...')
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const testSupabase = async () => {
      console.log('[TestPage] 테스트 시작')
      setStatus('Supabase 클라이언트 가져오는 중...')

      try {
        const supabase = getSupabase()

        if (!supabase) {
          setError('Supabase 클라이언트를 가져올 수 없습니다')
          setLoading(false)
          return
        }

        setStatus('데이터 가져오는 중...')
        console.log('[TestPage] 데이터 쿼리 시작')

        const { data: inventoryData, error: inventoryError } = await supabase
          .from('gift_inventory')
          .select('*')
          .limit(5)

        console.log('[TestPage] 쿼리 결과:', {
          dataCount: inventoryData?.length,
          error: inventoryError
        })

        if (inventoryError) {
          setError(inventoryError.message)
          setStatus('에러 발생')
        } else {
          setData(inventoryData)
          setStatus('완료')
        }
      } catch (err) {
        console.error('[TestPage] 에러:', err)
        setError(err instanceof Error ? err.message : '알 수 없는 에러')
        setStatus('에러 발생')
      } finally {
        console.log('[TestPage] Finally - 로딩 false로 설정')
        setLoading(false)
      }
    }

    testSupabase()
  }, [])

  return (
    <div className="p-8">
      <h1 className="text-2xl font-bold mb-4">Supabase 연결 테스트</h1>

      <div className="space-y-2">
        <p>상태: {status}</p>
        <p>로딩: {loading ? '예' : '아니오'}</p>

        {error && (
          <div className="text-red-500">
            에러: {error}
          </div>
        )}

        {data && (
          <div className="mt-4">
            <h2 className="font-bold">데이터 ({data.length}개):</h2>
            <pre className="bg-gray-100 p-2 rounded mt-2">
              {JSON.stringify(data, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  )
}