'use client'

import { useState, useEffect } from 'react'
import { validateDataConnection } from '@/utils/dataValidator'

interface DatabaseInfo {
  connected: boolean
  url?: string
  tableInfo?: Record<string, number>
  sampleData?: {
    dailyReports: any[]
    consultLogs: any[]
    giftLogs: any[]
    giftInventory: any[]
  }
  total?: number
  error?: string
}

export default function DatabaseVerifier() {
  const [dbInfo, setDbInfo] = useState<DatabaseInfo>({ connected: false })
  const [loading, setLoading] = useState(false)

  const verifyDatabase = async () => {
    setLoading(true)
    
    try {
      const result = await validateDataConnection()
      
      if (!result.success) {
        setDbInfo({ 
          connected: false, 
          error: result.error || '알 수 없는 오류가 발생했습니다.'
        })
        return
      }

      setDbInfo({
        connected: true,
        url: process.env.NEXT_PUBLIC_SUPABASE_URL,
        tableInfo: result.counts,
        sampleData: {
          dailyReports: result.sampleData?.dailyReports || [],
          consultLogs: result.sampleData?.consultLogs || [],
          giftLogs: result.sampleData?.giftLogs || [],
          giftInventory: []
        },
        total: result.total
      })

    } catch (error: any) {
      setDbInfo({
        connected: false,
        error: `데이터베이스 연결 실패: ${error.message}`
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    verifyDatabase()
  }, [])

  if (loading) {
    return (
      <div className="bg-white p-6 rounded-xl shadow-at-card border border-at-border">
        <h3 className="text-lg font-semibold mb-4">데이터베이스 연결 확인 중...</h3>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-at-accent"></div>
      </div>
    )
  }

  return (
    <div className="bg-white p-6 rounded-xl shadow-at-card border border-at-border">
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-semibold">데이터베이스 연결 상태</h3>
        <button 
          onClick={verifyDatabase}
          className="px-3 py-1 bg-at-accent text-white text-sm rounded hover:bg-at-accent"
        >
          다시 확인
        </button>
      </div>

      {!dbInfo.connected ? (
        <div className="text-at-error">
          <h4 className="font-semibold">❌ 연결 실패</h4>
          <p className="mt-2">{dbInfo.error}</p>
          
          <div className="mt-4 p-4 bg-at-warning-bg border border-yellow-200 rounded">
            <h5 className="font-semibold text-yellow-800">해결 방법:</h5>
            <ol className="list-decimal list-inside text-sm text-at-warning mt-2 space-y-1">
              <li>브라우저에서 dcm.html 파일을 열어 Supabase 설정이 되어있는지 확인</li>
              <li>개발자 도구 Console에서 <code className="bg-yellow-200 px-1 rounded">localStorage.getItem(&apos;supabaseConfig&apos;)</code> 실행</li>
              <li>또는 check-existing-config.html 파일을 열어서 설정값 확인</li>
              <li>확인된 설정값을 .env.local 파일에 입력</li>
            </ol>
          </div>
        </div>
      ) : (
        <div className="text-at-success">
          <h4 className="font-semibold">✅ 연결 성공</h4>
          <div className="mt-4 space-y-4">
            <div>
              <h5 className="font-semibold text-at-text-secondary">Supabase URL:</h5>
              <code className="text-sm bg-at-surface-alt px-2 py-1 rounded">{dbInfo.url}</code>
            </div>
            
            <div>
              <h5 className="font-semibold text-at-text-secondary">
                테이블별 데이터 개수 (총 {dbInfo.total || 0}개):
              </h5>
              <div className="grid grid-cols-2 gap-2 mt-2">
                {Object.entries(dbInfo.tableInfo || {}).map(([table, count]) => (
                  <div key={table} className="bg-at-surface-alt p-2 rounded">
                    <span className="font-medium">{table}:</span> 
                    <span className={count > 0 ? "text-at-success font-semibold" : "text-at-text-weak"}>
                      {count}개
                    </span>
                  </div>
                ))}
              </div>
              {(dbInfo.total || 0) >= 50 && (
                <div className="mt-2 p-2 bg-at-success-bg border border-green-200 rounded">
                  <span className="text-at-success font-semibold">
                    ✅ 기존 데이터 {dbInfo.total}개를 성공적으로 연결했습니다!
                  </span>
                </div>
              )}
            </div>

            {dbInfo.sampleData && (
              <div>
                <h5 className="font-semibold text-at-text-secondary">샘플 데이터 (최근 3개):</h5>
                <div className="mt-2 space-y-2">
                  {Object.entries(dbInfo.sampleData).map(([table, data]) => (
                    <details key={table} className="bg-at-surface-alt p-2 rounded">
                      <summary className="cursor-pointer font-medium">{table} ({data.length}개)</summary>
                      <pre className="text-xs mt-2 overflow-x-auto">
                        {JSON.stringify(data, null, 2)}
                      </pre>
                    </details>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}