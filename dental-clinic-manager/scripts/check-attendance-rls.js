/**
 * attendance_records RLS 정책 확인 스크립트
 */

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ 환경 변수가 설정되지 않았습니다.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function checkRLS() {
  console.log('🔍 attendance_records RLS 정책 확인 중...\n')

  try {
    // RLS 정책 조회
    const { data: policies, error } = await supabase
      .rpc('exec_sql', {
        sql: `
          SELECT
            schemaname,
            tablename,
            policyname,
            permissive,
            roles,
            cmd,
            qual,
            with_check
          FROM pg_policies
          WHERE tablename = 'attendance_records'
          ORDER BY policyname;
        `
      })

    if (error) {
      console.log('⚠️ exec_sql RPC를 사용할 수 없습니다. 직접 SQL 실행 필요:\n')
      console.log(`
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual,
  with_check
FROM pg_policies
WHERE tablename = 'attendance_records'
ORDER BY policyname;
      `)
      return
    }

    if (!policies || policies.length === 0) {
      console.log('❌ attendance_records에 RLS 정책이 없습니다!')
      console.log('RLS가 활성화되어 있는지 확인:\n')
      console.log(`
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public' AND tablename = 'attendance_records';
      `)
      return
    }

    console.log(`✅ ${policies.length}개의 RLS 정책 발견:\n`)

    policies.forEach((policy, index) => {
      console.log(`${index + 1}. ${policy.policyname}`)
      console.log(`   명령: ${policy.cmd}`)
      console.log(`   역할: ${policy.roles}`)
      console.log(`   조건 (USING): ${policy.qual}`)
      if (policy.with_check) {
        console.log(`   확인 (WITH CHECK): ${policy.with_check}`)
      }
      console.log()
    })

  } catch (error) {
    console.error('❌ 오류 발생:', error.message)
  }
}

checkRLS()
