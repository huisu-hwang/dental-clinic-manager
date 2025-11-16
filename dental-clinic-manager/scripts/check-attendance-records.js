/**
 * 아스클 출근 기록 확인 스크립트
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

async function checkAttendanceRecords() {
  console.log('🔍 아스클 출근 기록 확인 중...\n')

  try {
    // 아스클 user_id
    const ascleUserId = '7709ab2c-ea88-4cc5-80cd-20f4e714f7ca'
    const today = '2025-11-15'

    // 1. 아스클의 모든 출근 기록 확인
    console.log('📋 아스클의 모든 출근 기록:')
    const { data: allRecords, error: allError } = await supabase
      .from('attendance_records')
      .select('*')
      .eq('user_id', ascleUserId)
      .order('work_date', { ascending: false })
      .limit(10)

    if (allError) {
      console.error('❌ Error:', allError)
    } else {
      console.log(`총 ${allRecords.length}개 기록 (최근 10개):`)
      allRecords.forEach(record => {
        console.log(`  - ${record.work_date} | ${record.status} | branch_id: ${record.branch_id || 'NULL'} | check_in: ${record.check_in_time || 'NULL'}`)
      })
    }

    // 2. 오늘(2025-11-15) 출근 기록 확인
    console.log(`\n📅 오늘(${today}) 출근 기록:`)
    const { data: todayRecords, error: todayError } = await supabase
      .from('attendance_records')
      .select('*')
      .eq('user_id', ascleUserId)
      .eq('work_date', today)

    if (todayError) {
      console.error('❌ Error:', todayError)
    } else {
      if (todayRecords.length === 0) {
        console.log('❌ 오늘 출근 기록이 없습니다.')
      } else {
        console.log(`✅ ${todayRecords.length}개의 기록 발견:`)
        todayRecords.forEach(record => {
          console.log('\n  Record Details:')
          console.log(`    - ID: ${record.id}`)
          console.log(`    - user_id: ${record.user_id}`)
          console.log(`    - clinic_id: ${record.clinic_id}`)
          console.log(`    - branch_id: ${record.branch_id || 'NULL'}`)
          console.log(`    - work_date: ${record.work_date}`)
          console.log(`    - status: ${record.status}`)
          console.log(`    - check_in_time: ${record.check_in_time}`)
          console.log(`    - check_out_time: ${record.check_out_time || 'NULL'}`)
          console.log(`    - notes: ${record.notes || 'NULL'}`)
        })
      }
    }

    // 3. 아스클의 user 정보 확인
    console.log('\n👤 아스클 사용자 정보:')
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('id, name, role, clinic_id, primary_branch_id')
      .eq('id', ascleUserId)
      .single()

    if (userError) {
      console.error('❌ Error:', userError)
    } else {
      console.log(`  - 이름: ${userData.name}`)
      console.log(`  - 역할: ${userData.role}`)
      console.log(`  - clinic_id: ${userData.clinic_id}`)
      console.log(`  - primary_branch_id: ${userData.primary_branch_id || 'NULL'}`)
    }

    // 4. 오늘 전체 출근 기록 확인 (아스클의 clinic_id)
    if (userData) {
      console.log(`\n🏥 오늘 병원 전체 출근 기록 (clinic_id: ${userData.clinic_id}):`)
      const { data: clinicRecords, error: clinicError } = await supabase
        .from('attendance_records')
        .select('user_id, work_date, status, branch_id, check_in_time')
        .eq('clinic_id', userData.clinic_id)
        .eq('work_date', today)

      if (clinicError) {
        console.error('❌ Error:', clinicError)
      } else {
        console.log(`✅ 총 ${clinicRecords.length}개의 출근 기록:`)
        clinicRecords.forEach(record => {
          console.log(`  - user_id: ${record.user_id} | status: ${record.status} | branch_id: ${record.branch_id || 'NULL'} | check_in: ${record.check_in_time || 'NULL'}`)
        })
      }
    }

  } catch (error) {
    console.error('❌ 오류 발생:', error.message)
  }
}

checkAttendanceRecords()
