/**
 * 병원 진료시간 Migration 실행 스크립트
 */

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ 환경 변수가 설정되지 않았습니다.')
  console.error('NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '설정됨' : '없음')
  console.error('SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? '설정됨' : '없음')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function runMigration() {
  console.log('🚀 병원 진료시간 Migration 실행 중...\n')

  try {
    // Migration 파일 읽기
    const migrationPath = path.join(
      __dirname,
      '..',
      'supabase',
      'migrations',
      '20250131_create_clinic_hours.sql'
    )

    if (!fs.existsSync(migrationPath)) {
      console.error('❌ Migration 파일을 찾을 수 없습니다:', migrationPath)
      process.exit(1)
    }

    const migrationSQL = fs.readFileSync(migrationPath, 'utf8')

    console.log('📄 Migration SQL 실행...')

    // SQL 실행 (Supabase에서는 직접 SQL 실행이 제한될 수 있음)
    // 대신 개별 쿼리로 실행
    const queries = migrationSQL
      .split(';')
      .map((q) => q.trim())
      .filter((q) => q.length > 0 && !q.startsWith('--'))

    for (const query of queries) {
      if (query.trim()) {
        try {
          console.log(`\n실행 중: ${query.substring(0, 100)}...`)
          const { error } = await supabase.rpc('exec_sql', { sql: query })
          if (error) {
            // RPC 함수가 없을 수 있으므로 경고만 표시
            console.warn('⚠️ SQL 실행 실패 (수동으로 Supabase Dashboard에서 실행 필요):', error.message)
          }
        } catch (err) {
          console.warn('⚠️ 쿼리 실행 중 오류:', err.message)
        }
      }
    }

    console.log('\n✅ Migration 스크립트 준비 완료!')
    console.log('\n📌 다음 단계:')
    console.log('1. Supabase Dashboard (https://supabase.com)에 로그인')
    console.log('2. SQL Editor로 이동')
    console.log('3. supabase/migrations/20250131_create_clinic_hours.sql 파일 내용을 복사하여 실행')
    console.log('\n또는:')
    console.log('supabase db push (Supabase CLI 설치 필요)')

  } catch (error) {
    console.error('❌ Migration 실행 중 오류:', error)
    process.exit(1)
  }
}

async function testMigration() {
  console.log('\n🧪 Migration 테스트 중...\n')

  try {
    // clinic_hours 테이블 존재 확인
    const { data: hoursData, error: hoursError } = await supabase
      .from('clinic_hours')
      .select('*')
      .limit(1)

    if (hoursError) {
      console.error('❌ clinic_hours 테이블이 아직 생성되지 않았습니다.')
      console.error('   Supabase Dashboard에서 Migration을 수동으로 실행해주세요.')
      return false
    }

    console.log('✅ clinic_hours 테이블 확인 완료')

    // clinic_holidays 테이블 존재 확인
    const { data: holidaysData, error: holidaysError } = await supabase
      .from('clinic_holidays')
      .select('*')
      .limit(1)

    if (holidaysError) {
      console.error('❌ clinic_holidays 테이블이 아직 생성되지 않았습니다.')
      return false
    }

    console.log('✅ clinic_holidays 테이블 확인 완료')

    console.log('\n🎉 Migration이 성공적으로 적용되었습니다!')
    return true

  } catch (error) {
    console.error('❌ 테스트 중 오류:', error)
    return false
  }
}

async function main() {
  await runMigration()
  await testMigration()
}

main()
