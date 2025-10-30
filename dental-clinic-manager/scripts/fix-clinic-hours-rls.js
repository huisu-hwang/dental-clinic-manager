/**
 * RLS 정책 수정 스크립트
 * WITH CHECK 절을 추가하여 INSERT 작업이 가능하도록 수정
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

async function fixRLS() {
  console.log('🔧 RLS 정책 수정 중...\n')

  try {
    // Migration 파일 읽기
    const migrationPath = path.join(
      __dirname,
      '..',
      'supabase',
      'migrations',
      '20250131_fix_clinic_hours_rls.sql'
    )

    if (!fs.existsSync(migrationPath)) {
      console.error('❌ Migration 파일을 찾을 수 없습니다:', migrationPath)
      process.exit(1)
    }

    const migrationSQL = fs.readFileSync(migrationPath, 'utf8')

    console.log('📄 수정할 내용:')
    console.log('  1. 기존 RLS 정책 삭제')
    console.log('  2. WITH CHECK 절이 포함된 새 정책 생성')
    console.log('\n이 변경사항은 INSERT 작업을 가능하게 합니다.\n')

    console.log('📋 실행할 SQL:')
    console.log(migrationSQL)
    console.log('\n' + '='.repeat(60))

    console.log('\n📌 다음 단계:')
    console.log('1. Supabase Dashboard (https://supabase.com)에 로그인')
    console.log('2. 프로젝트 선택')
    console.log('3. SQL Editor로 이동')
    console.log('4. 위의 SQL을 복사하여 실행')
    console.log('\n또는:')
    console.log('supabase db push (Supabase CLI가 설치되어 있는 경우)')

  } catch (error) {
    console.error('❌ 오류 발생:', error)
    process.exit(1)
  }
}

fixRLS()
