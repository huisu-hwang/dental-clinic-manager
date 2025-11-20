import { createClient } from '@/lib/supabase/client'
export const inspectDatabase = async () => {
  const supabase = createClient()
  if (!supabase) {
    throw new Error('Supabase client not available')
  }

  try {
    // 알려진 테이블들을 직접 확인
    const knownTables = ['daily_reports', 'consult_logs', 'gift_logs', 'gift_inventory', 'inventory_logs']
    
    console.log('🔍 데이터베이스 검사 시작...')
    
    const tableResults = []
    
    for (const tableName of knownTables) {
      try {
        // 테이블 존재 여부와 데이터 개수 확인
        const { count, error: countError } = await supabase
          .from(tableName)
          .select('*', { count: 'exact', head: true })

        if (countError) {
          console.log(`❌ Table ${tableName}: ${countError.message}`)
          tableResults.push({ table: tableName, exists: false, count: 0, error: countError.message })
          continue
        }

        // 샘플 데이터 구조 확인
        const { data: sampleData } = await supabase
          .from(tableName)
          .select('*')
          .limit(1)

        const structure = sampleData && sampleData.length > 0 ? Object.keys(sampleData[0]) : []
        
        console.log(`✅ Table ${tableName}: ${count}개 레코드, 구조: [${structure.join(', ')}]`)
        
        if (sampleData && sampleData.length > 0) {
          console.log(`📄 ${tableName} 샘플:`, sampleData[0])
        }

        tableResults.push({ 
          table: tableName, 
          exists: true, 
          count: count || 0, 
          structure, 
          sample: sampleData?.[0] 
        })

      } catch (err) {
        console.log(`❌ Table ${tableName} 검사 실패:`, err)
        tableResults.push({ table: tableName, exists: false, count: 0, error: String(err) })
      }
    }

    const totalRecords = tableResults.reduce((sum, result) => sum + (result.count || 0), 0)
    console.log(`📊 총 레코드 수: ${totalRecords}개`)
    
    return tableResults
  } catch (error) {
    console.error('❌ 데이터베이스 검사 실패:', error)
    return null
  }
}