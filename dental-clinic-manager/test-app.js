const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = 'https://beahjntkmkfhpcbhfnrr.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJlYWhqbnRrbWtmaHBjYmhmbnJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc5NDEyNzUsImV4cCI6MjA3MzUxNzI3NX0.Af5GbqP_qQAEax5nj_ojTSz3xy1I-rBcV-TU1CwceFA'

console.log('Supabase 연결 테스트 시작...')
console.log('URL:', supabaseUrl)
console.log('Key length:', supabaseAnonKey.length)

async function testConnection() {
  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey)
    console.log('Supabase 클라이언트 생성 완료')

    // 간단한 쿼리 테스트
    console.log('\n1. daily_reports 테이블 조회 중...')
    const { data: dailyReports, error: dailyError } = await supabase
      .from('daily_reports')
      .select('*')
      .limit(1)

    if (dailyError) {
      console.error('daily_reports 에러:', dailyError)
    } else {
      console.log('daily_reports 성공, 데이터 개수:', dailyReports?.length || 0)
    }

    console.log('\n2. gift_inventory 테이블 조회 중...')
    const { data: inventory, error: inventoryError } = await supabase
      .from('gift_inventory')
      .select('*')
      .limit(1)

    if (inventoryError) {
      console.error('gift_inventory 에러:', inventoryError)
    } else {
      console.log('gift_inventory 성공, 데이터 개수:', inventory?.length || 0)
    }

    console.log('\n연결 테스트 완료\!')

  } catch (error) {
    console.error('테스트 중 에러 발생:', error)
  }
}

testConnection()
