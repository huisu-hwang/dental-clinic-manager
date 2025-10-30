/**
 * 병원 진료시간 데이터 확인 스크립트
 */

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ 환경 변수가 설정되지 않았습니다.')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function checkData() {
  console.log('🔍 병원 진료시간 데이터 확인 중...\n')

  try {
    // clinic_hours 데이터 확인
    const { data: hoursData, error: hoursError } = await supabase
      .from('clinic_hours')
      .select('*')
      .order('clinic_id')
      .order('day_of_week')

    if (hoursError) {
      console.error('❌ 에러:', hoursError.message)
      return
    }

    console.log('📊 clinic_hours 테이블 데이터:')
    console.log('총 레코드 수:', hoursData.length)
    console.log('\n상세 내용:')
    console.table(hoursData.map(h => ({
      clinic_id: h.clinic_id.substring(0, 8) + '...',
      요일: h.day_of_week,
      진료여부: h.is_open ? '✓' : '✗',
      시작시간: h.open_time || '-',
      종료시간: h.close_time || '-',
      휴게시작: h.break_start || '-',
      휴게종료: h.break_end || '-',
    })))

    // clinic_holidays 데이터 확인
    const { data: holidaysData, error: holidaysError } = await supabase
      .from('clinic_holidays')
      .select('*')
      .order('holiday_date')

    if (holidaysError) {
      console.error('❌ 휴진일 조회 에러:', holidaysError.message)
      return
    }

    console.log('\n📅 clinic_holidays 테이블 데이터:')
    console.log('총 레코드 수:', holidaysData.length)
    if (holidaysData.length > 0) {
      console.log('\n상세 내용:')
      console.table(holidaysData.map(h => ({
        clinic_id: h.clinic_id.substring(0, 8) + '...',
        날짜: h.holiday_date,
        설명: h.description || '-',
      })))
    }

    // 모든 병원 ID 확인
    console.log('\n🏥 등록된 병원 확인:')
    const { data: clinicsData, error: clinicsError } = await supabase
      .from('clinics')
      .select('id, name')

    if (clinicsError) {
      console.error('❌ 병원 조회 에러:', clinicsError.message)
      return
    }

    console.table(clinicsData.map(c => ({
      id: c.id.substring(0, 8) + '...',
      name: c.name,
    })))

  } catch (error) {
    console.error('❌ 오류 발생:', error)
  }
}

checkData()
