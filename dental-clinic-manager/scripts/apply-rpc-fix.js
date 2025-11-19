/**
 * Supabase RPC 함수 타입 불일치 문제 수정 스크립트
 *
 * 이 스크립트는 save_daily_report_v2 RPC 함수의 p_date 파라미터를
 * DATE에서 TEXT로 변경하고, SQL 내에서 ::date 캐스팅을 사용하도록 수정합니다.
 *
 * 실행: node scripts/apply-rpc-fix.js
 */

const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')
const dotenv = require('dotenv')

// .env.local 파일 로드
const envPath = path.join(__dirname, '..', '.env.local')
dotenv.config({ path: envPath })

// 환경 변수 확인
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceRoleKey) {
  console.error('❌ 환경 변수가 설정되지 않았습니다:')
  console.error('   NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '✓' : '✗')
  console.error('   SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceRoleKey ? '✓' : '✗')
  process.exit(1)
}

// Supabase 클라이언트 생성 (Service Role Key 사용)
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

// SQL 파일 읽기
const sqlFilePath = path.join(__dirname, '..', 'fix_rpc_type_mismatch.sql')
const sql = fs.readFileSync(sqlFilePath, 'utf8')

console.log('🔧 Supabase RPC 함수 업데이트 시작...')
console.log('')
console.log('📄 SQL 파일:', sqlFilePath)
console.log('🌐 Supabase URL:', supabaseUrl)
console.log('')

async function applyFix() {
  try {
    // Supabase에서는 .rpc()로 직접 CREATE FUNCTION을 실행할 수 없으므로
    // Management API를 사용하거나, 임시 헬퍼 함수를 사용해야 합니다.

    // 방법 1: PostgreSQL의 exec_sql 헬퍼 함수가 있다면 사용
    // 방법 2: Supabase Management API 사용 (추천)

    // 여기서는 Management API를 사용합니다.
    const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1]

    if (!projectRef) {
      throw new Error('Supabase Project Ref를 추출할 수 없습니다.')
    }

    console.log('📌 Project Ref:', projectRef)
    console.log('')
    console.log('⚠️  안내:')
    console.log('   Supabase JavaScript SDK는 raw SQL 실행을 지원하지 않습니다.')
    console.log('   대신 아래 단계를 따라주세요:')
    console.log('')
    console.log('   1. https://supabase.com/dashboard/project/' + projectRef + '/sql 접속')
    console.log('   2. 새 쿼리 생성')
    console.log('   3. 아래 SQL을 복사하여 붙여넣기')
    console.log('   4. Run 클릭')
    console.log('')
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log(sql)
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    console.log('')

    // 클립보드에 복사 (Windows)
    const proc = require('child_process')
    try {
      proc.execSync(`echo ${sql} | clip`, { stdio: 'ignore' })
      console.log('✅ SQL이 클립보드에 복사되었습니다!')
    } catch (err) {
      console.log('⚠️  클립보드 복사 실패 (수동으로 복사해주세요)')
    }

  } catch (error) {
    console.error('❌ 오류 발생:', error.message)
    process.exit(1)
  }
}

applyFix()
