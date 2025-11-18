/**
 * Supabase RPC 함수 업데이트 스크립트
 * create_clinic_with_owner 함수를 status='pending'으로 수정
 */

const fs = require('fs')
const path = require('path')

// 환경 변수 로드
require('dotenv').config({ path: path.join(__dirname, '..', '.env.local') })

const { createClient } = require('@supabase/supabase-js')

// 환경 변수 확인
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error('❌ 환경 변수 누락:')
  console.error('  NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '✅' : '❌')
  console.error('  SUPABASE_SERVICE_ROLE_KEY:', serviceRoleKey ? '✅' : '❌')
  console.error('\n💡 해결 방법:')
  console.error('  Windows: setx SUPABASE_SERVICE_ROLE_KEY "your-service-role-key"')
  console.error('  그 후 터미널 재시작 필요')
  process.exit(1)
}

// Service Role로 Supabase 클라이언트 생성
const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function applyRpcFix() {
  console.log('🚀 RPC 함수 업데이트 시작...\n')

  // 마이그레이션 파일 읽기
  const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '20251117_create_clinic_with_owner.sql')

  if (!fs.existsSync(migrationPath)) {
    console.error(`❌ 마이그레이션 파일을 찾을 수 없습니다: ${migrationPath}`)
    process.exit(1)
  }

  const sqlContent = fs.readFileSync(migrationPath, 'utf8')
  console.log('📄 마이그레이션 파일 읽기 완료')
  console.log(`   파일: ${path.basename(migrationPath)}`)
  console.log(`   크기: ${(sqlContent.length / 1024).toFixed(2)} KB\n`)

  // SQL을 여러 개의 statement로 분리하여 실행
  console.log('⚙️  SQL 실행 중...')

  // PostgreSQL 클라이언트로 직접 연결하여 실행
  const { Pool } = require('pg')
  const databaseUrl = process.env.DATABASE_URL

  if (!databaseUrl) {
    console.error('❌ DATABASE_URL 환경 변수가 설정되지 않았습니다.')
    console.error('\n💡 수동 적용 방법:')
    console.error('  1. Supabase Studio 접속: https://supabase.com/dashboard/project/beahjntkmkfhpcbhfnrr/sql/new')
    console.error('  2. SQL Editor에서 아래 파일 내용을 복사하여 실행:')
    console.error(`     ${migrationPath}`)
    process.exit(1)
  }

  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  })

  try {
    const client = await pool.connect()
    console.log('✅ 데이터베이스 연결 성공')

    // SQL 실행
    await client.query(sqlContent)
    console.log('✅ SQL 실행 완료\n')

    // 검증: 함수가 존재하는지 확인
    console.log('🔍 함수 존재 여부 확인 중...')
    const result = await client.query(`
      SELECT routine_name, routine_type, routine_definition
      FROM information_schema.routines
      WHERE routine_schema = 'public'
      AND routine_name = 'create_clinic_with_owner'
    `)

    if (result.rows.length > 0) {
      console.log('✅ 함수 확인 완료: create_clinic_with_owner 존재')

      // status='pending' 확인
      const funcDef = result.rows[0].routine_definition || ''
      if (funcDef.includes("'pending'")) {
        console.log('✅ status=\'pending\' 설정 확인 완료\n')
      } else {
        console.log('⚠️  함수 정의에서 \'pending\'을 찾을 수 없습니다.\n')
      }
    } else {
      console.log('❌ 함수를 찾을 수 없습니다.\n')
    }

    client.release()
    await pool.end()

    console.log('📋 변경 사항:')
    console.log('   - create_clinic_with_owner 함수 재생성')
    console.log('   - status: \'active\' → \'pending\' 변경')
    console.log('   - 이제 대표원장 가입 시 승인 대기 상태로 생성됩니다.\n')
    console.log('🎉 작업 완료!')

  } catch (error) {
    console.error('❌ SQL 실행 실패:', error.message)
    console.error('\n💡 수동 적용 방법:')
    console.error('  1. Supabase Studio 접속: https://supabase.com/dashboard/project/beahjntkmkfhpcbhfnrr/sql/new')
    console.error('  2. SQL Editor에서 아래 파일 내용을 복사하여 실행:')
    console.error(`     ${migrationPath}`)

    await pool.end()
    process.exit(1)
  }
}

// 실행
applyRpcFix().catch(error => {
  console.error('💥 예상치 못한 에러:', error)
  process.exit(1)
})
