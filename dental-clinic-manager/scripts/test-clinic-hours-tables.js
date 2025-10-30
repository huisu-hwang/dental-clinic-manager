/**
 * 병원 진료시간 테이블 존재 확인 스크립트
 */

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ 환경 변수가 설정되지 않았습니다.')
  console.error('NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '설정됨' : '없음')
  console.error('SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? '설정됨' : '없음')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function testTables() {
  console.log('🔍 데이터베이스 테이블 확인 중...\n')

  try {
    // clinic_hours 테이블 확인
    console.log('1️⃣ clinic_hours 테이블 확인...')
    const { data: hoursData, error: hoursError } = await supabase
      .from('clinic_hours')
      .select('*')
      .limit(1)

    if (hoursError) {
      console.error('❌ clinic_hours 테이블이 없습니다.')
      console.error('   에러:', hoursError.message)
      console.log('\n📝 해결 방법:')
      console.log('   1. Supabase Dashboard (https://supabase.com) 로그인')
      console.log('   2. SQL Editor 메뉴로 이동')
      console.log('   3. supabase/migrations/20250131_create_clinic_hours.sql 파일 내용을 복사하여 실행')
      return false
    }

    console.log('✅ clinic_hours 테이블이 존재합니다.')
    if (hoursData && hoursData.length > 0) {
      console.log(`   데이터 개수: ${hoursData.length}개`)
    } else {
      console.log('   데이터: 없음 (정상)')
    }

    // clinic_holidays 테이블 확인
    console.log('\n2️⃣ clinic_holidays 테이블 확인...')
    const { data: holidaysData, error: holidaysError } = await supabase
      .from('clinic_holidays')
      .select('*')
      .limit(1)

    if (holidaysError) {
      console.error('❌ clinic_holidays 테이블이 없습니다.')
      console.error('   에러:', holidaysError.message)
      return false
    }

    console.log('✅ clinic_holidays 테이블이 존재합니다.')
    if (holidaysData && holidaysData.length > 0) {
      console.log(`   데이터 개수: ${holidaysData.length}개`)
    } else {
      console.log('   데이터: 없음 (정상)')
    }

    console.log('\n🎉 모든 테이블이 정상적으로 생성되어 있습니다!')
    console.log('\n다음 단계:')
    console.log('✓ 병원 설정 > 진료시간 탭에서 진료시간을 설정하세요.')
    return true

  } catch (error) {
    console.error('❌ 테스트 중 오류 발생:', error)
    return false
  }
}

testTables()
