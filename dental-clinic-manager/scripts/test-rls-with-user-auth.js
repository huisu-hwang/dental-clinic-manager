/**
 * 사용자 인증으로 RLS 테스트
 */

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('❌ 환경 변수가 설정되지 않았습니다.')
  process.exit(1)
}

// 사용자 인증 클라이언트 (RLS 적용됨)
const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function testRLS() {
  console.log('🔍 사용자 인증으로 RLS 테스트...\n')

  try {
    // 1. 황희수 계정으로 로그인
    console.log('📝 황희수 계정으로 로그인 중...')
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: 'whitedc0902@gmail.com',
      password: 'dlzltm!23' // 실제 비밀번호로 변경 필요
    })

    if (authError) {
      console.error('❌ 로그인 실패:', authError.message)
      console.log('\n⚠️ 비밀번호를 확인하거나 다른 방법으로 테스트해주세요.')
      return
    }

    console.log('✅ 로그인 성공')
    console.log(`   사용자 ID: ${authData.user.id}`)
    console.log(`   이메일: ${authData.user.email}\n`)

    // 2. users 테이블에서 현재 사용자 정보 조회
    console.log('👤 현재 사용자 정보 조회...')
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id, name, role, clinic_id')
      .eq('id', authData.user.id)
      .single()

    if (userError) {
      console.error('❌ 사용자 정보 조회 실패:', userError.message)
    } else {
      console.log(`   이름: ${userData.name}`)
      console.log(`   역할: ${userData.role}`)
      console.log(`   clinic_id: ${userData.clinic_id}\n`)
    }

    // 3. attendance_records 조회 (RLS 적용)
    console.log('📋 오늘(2025-11-15) 출근 기록 조회 (RLS 적용):')
    const { data: records, error: recordsError } = await supabase
      .from('attendance_records')
      .select('*')
      .eq('clinic_id', userData.clinic_id)
      .eq('work_date', '2025-11-15')

    if (recordsError) {
      console.error('❌ 출근 기록 조회 실패:', recordsError.message)
      console.log(`   Error code: ${recordsError.code}`)
      console.log(`   Error details: ${JSON.stringify(recordsError.details)}`)
    } else {
      console.log(`✅ ${records.length}개의 출근 기록 조회됨`)
      if (records.length > 0) {
        records.forEach(r => {
          console.log(`   - user_id: ${r.user_id} | status: ${r.status} | check_in: ${r.check_in_time}`)
        })
      } else {
        console.log('   (출근 기록이 없습니다)')
      }
    }

    // 4. 로그아웃
    await supabase.auth.signOut()

  } catch (error) {
    console.error('❌ 오류 발생:', error.message)
  }
}

testRLS()
