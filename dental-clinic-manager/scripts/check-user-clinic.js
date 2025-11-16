/**
 * 사용자 clinic_id 확인 스크립트
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

async function checkUserClinic() {
  console.log('🔍 사용자 clinic_id 확인 중...\n')

  try {
    // 황희수 (owner)
    const hwangUserId = 'eb46c51d-95a1-4be9-9b30-edcdbd9eb8be'

    const { data: hwangUser, error: hwangError } = await supabase
      .from('users')
      .select('id, name, email, role, clinic_id, status')
      .eq('id', hwangUserId)
      .single()

    if (hwangError) {
      console.error('❌ Error:', hwangError)
      return
    }

    console.log('👤 황희수 (Owner) 정보:')
    console.log(`  - ID: ${hwangUser.id}`)
    console.log(`  - 이름: ${hwangUser.name}`)
    console.log(`  - 이메일: ${hwangUser.email}`)
    console.log(`  - 역할: ${hwangUser.role}`)
    console.log(`  - clinic_id: ${hwangUser.clinic_id}`)
    console.log(`  - status: ${hwangUser.status}\n`)

    // 아스클 (vice_director)
    const ascleUserId = '7709ab2c-ea88-4cc5-80cd-20f4e714f7ca'

    const { data: ascleUser, error: ascleError } = await supabase
      .from('users')
      .select('id, name, email, role, clinic_id, status')
      .eq('id', ascleUserId)
      .single()

    if (ascleError) {
      console.error('❌ Error:', ascleError)
      return
    }

    console.log('👤 아스클 (Vice Director) 정보:')
    console.log(`  - ID: ${ascleUser.id}`)
    console.log(`  - 이름: ${ascleUser.name}`)
    console.log(`  - 이메일: ${ascleUser.email}`)
    console.log(`  - 역할: ${ascleUser.role}`)
    console.log(`  - clinic_id: ${ascleUser.clinic_id}`)
    console.log(`  - status: ${ascleUser.status}\n`)

    // clinic_id 비교
    if (hwangUser.clinic_id === ascleUser.clinic_id) {
      console.log('✅ 두 사용자의 clinic_id가 일치합니다.')
      console.log(`   공통 clinic_id: ${hwangUser.clinic_id}\n`)

      // 해당 clinic의 출근 기록 조회 (RLS 테스트)
      console.log('📋 해당 clinic의 오늘(2025-11-15) 출근 기록 조회 (Service Role):')
      const { data: records, error: recordsError } = await supabase
        .from('attendance_records')
        .select('*')
        .eq('clinic_id', hwangUser.clinic_id)
        .eq('work_date', '2025-11-15')

      if (recordsError) {
        console.error('❌ Error:', recordsError)
      } else {
        console.log(`   총 ${records.length}개의 기록`)
        records.forEach(r => {
          console.log(`   - user_id: ${r.user_id} | status: ${r.status}`)
        })
      }
    } else {
      console.log('❌ 두 사용자의 clinic_id가 다릅니다!')
      console.log(`   황희수: ${hwangUser.clinic_id}`)
      console.log(`   아스클: ${ascleUser.clinic_id}`)
    }

  } catch (error) {
    console.error('❌ 오류 발생:', error.message)
  }
}

checkUserClinic()
