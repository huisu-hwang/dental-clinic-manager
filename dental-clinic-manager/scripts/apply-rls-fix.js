/**
 * RLS 정책 자동 수정 스크립트
 * Supabase Management API를 통해 직접 SQL 실행
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

async function applyFix() {
  console.log('🔧 RLS 정책 자동 수정 중...\n')

  try {
    // 1. 기존 정책 삭제 (clinic_hours)
    console.log('1️⃣ 기존 clinic_hours 정책 삭제 중...')
    const { error: drop1Error } = await supabase.rpc('exec_sql', {
      sql: 'DROP POLICY IF EXISTS "Owners can manage clinic hours" ON clinic_hours;'
    }).catch(() => ({ error: { message: 'RPC not available' } }))

    // 2. 기존 정책 삭제 (clinic_holidays)
    console.log('2️⃣ 기존 clinic_holidays 정책 삭제 중...')
    const { error: drop2Error } = await supabase.rpc('exec_sql', {
      sql: 'DROP POLICY IF EXISTS "Owners can manage clinic holidays" ON clinic_holidays;'
    }).catch(() => ({ error: { message: 'RPC not available' } }))

    // RPC가 작동하지 않는 경우
    if (drop1Error?.message === 'RPC not available' || drop2Error?.message === 'RPC not available') {
      console.log('\n⚠️ Supabase RPC 함수를 사용할 수 없습니다.')
      console.log('수동으로 Supabase Dashboard에서 실행해주세요.\n')

      console.log('📋 실행할 SQL:')
      console.log('='.repeat(60))
      console.log(`
-- 기존 정책 삭제
DROP POLICY IF EXISTS "Owners can manage clinic hours" ON clinic_hours;
DROP POLICY IF EXISTS "Owners can manage clinic holidays" ON clinic_holidays;

-- clinic_hours RLS 정책 재생성 (WITH CHECK 추가)
CREATE POLICY "Owners can manage clinic hours"
  ON clinic_hours FOR ALL
  USING (
    clinic_id IN (
      SELECT clinic_id FROM users
      WHERE id = auth.uid() AND role IN ('owner', 'manager')
    )
  )
  WITH CHECK (
    clinic_id IN (
      SELECT clinic_id FROM users
      WHERE id = auth.uid() AND role IN ('owner', 'manager')
    )
  );

-- clinic_holidays RLS 정책 재생성 (WITH CHECK 추가)
CREATE POLICY "Owners can manage clinic holidays"
  ON clinic_holidays FOR ALL
  USING (
    clinic_id IN (
      SELECT clinic_id FROM users
      WHERE id = auth.uid() AND role IN ('owner', 'manager')
    )
  )
  WITH CHECK (
    clinic_id IN (
      SELECT clinic_id FROM users
      WHERE id = auth.uid() AND role IN ('owner', 'manager')
    )
  );
      `)
      console.log('='.repeat(60))
      console.log('\n📌 실행 방법:')
      console.log('1. https://supabase.com/dashboard 접속')
      console.log('2. 프로젝트 선택')
      console.log('3. SQL Editor 클릭')
      console.log('4. 위 SQL 복사 & 붙여넣기')
      console.log('5. Run 버튼 클릭\n')
      return
    }

    // 3. 새 정책 생성 (clinic_hours)
    console.log('3️⃣ clinic_hours 새 정책 생성 중...')
    const { error: create1Error } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE POLICY "Owners can manage clinic hours"
          ON clinic_hours FOR ALL
          USING (
            clinic_id IN (
              SELECT clinic_id FROM users
              WHERE id = auth.uid() AND role IN ('owner', 'manager')
            )
          )
          WITH CHECK (
            clinic_id IN (
              SELECT clinic_id FROM users
              WHERE id = auth.uid() AND role IN ('owner', 'manager')
            )
          );
      `
    })

    if (create1Error) {
      console.error('❌ clinic_hours 정책 생성 실패:', create1Error.message)
      return
    }

    // 4. 새 정책 생성 (clinic_holidays)
    console.log('4️⃣ clinic_holidays 새 정책 생성 중...')
    const { error: create2Error } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE POLICY "Owners can manage clinic holidays"
          ON clinic_holidays FOR ALL
          USING (
            clinic_id IN (
              SELECT clinic_id FROM users
              WHERE id = auth.uid() AND role IN ('owner', 'manager')
            )
          )
          WITH CHECK (
            clinic_id IN (
              SELECT clinic_id FROM users
              WHERE id = auth.uid() AND role IN ('owner', 'manager')
            )
          );
      `
    })

    if (create2Error) {
      console.error('❌ clinic_holidays 정책 생성 실패:', create2Error.message)
      return
    }

    console.log('\n✅ RLS 정책이 성공적으로 수정되었습니다!')
    console.log('\n이제 진료시간 저장이 정상적으로 작동할 것입니다.')

  } catch (error) {
    console.error('❌ 오류 발생:', error)
    console.log('\n수동으로 Supabase Dashboard에서 SQL을 실행해주세요.')
  }
}

applyFix()
