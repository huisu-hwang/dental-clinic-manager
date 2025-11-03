const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Service role for insert

const supabase = createClient(supabaseUrl, supabaseKey);

async function createSampleClinicHours() {
  console.log('\n=== 샘플 병원 진료시간 생성 ===\n');

  // 1. clinic_id 가져오기
  const { data: users, error: userError } = await supabase
    .from('users')
    .select('clinic_id')
    .eq('status', 'active')
    .not('clinic_id', 'is', null)
    .limit(1)
    .single();

  if (userError || !users || !users.clinic_id) {
    console.error('❌ clinic_id를 찾을 수 없습니다.');
    return;
  }

  const clinicId = users.clinic_id;
  console.log(`Clinic ID: ${clinicId}\n`);

  // 2. 기존 진료시간 확인
  const { data: existing } = await supabase
    .from('clinic_hours')
    .select('*')
    .eq('clinic_id', clinicId);

  if (existing && existing.length > 0) {
    console.log('⚠️  이미 진료시간이 설정되어 있습니다.');
    console.log('   기존 데이터를 삭제하시겠습니까? (이 스크립트는 삭제하지 않음)');
    return;
  }

  // 3. 샘플 진료시간 데이터 생성
  const sampleHours = [
    // 일요일 - 휴무
    {
      clinic_id: clinicId,
      day_of_week: 0,
      is_open: false,
      open_time: null,
      close_time: null,
      break_start: null,
      break_end: null,
    },
    // 월요일 - 09:00~18:00 (점심: 12:00~13:00)
    {
      clinic_id: clinicId,
      day_of_week: 1,
      is_open: true,
      open_time: '09:00:00',
      close_time: '18:00:00',
      break_start: '12:00:00',
      break_end: '13:00:00',
    },
    // 화요일
    {
      clinic_id: clinicId,
      day_of_week: 2,
      is_open: true,
      open_time: '09:00:00',
      close_time: '18:00:00',
      break_start: '12:00:00',
      break_end: '13:00:00',
    },
    // 수요일
    {
      clinic_id: clinicId,
      day_of_week: 3,
      is_open: true,
      open_time: '09:00:00',
      close_time: '18:00:00',
      break_start: '12:00:00',
      break_end: '13:00:00',
    },
    // 목요일
    {
      clinic_id: clinicId,
      day_of_week: 4,
      is_open: true,
      open_time: '09:00:00',
      close_time: '18:00:00',
      break_start: '12:00:00',
      break_end: '13:00:00',
    },
    // 금요일
    {
      clinic_id: clinicId,
      day_of_week: 5,
      is_open: true,
      open_time: '09:00:00',
      close_time: '18:00:00',
      break_start: '12:00:00',
      break_end: '13:00:00',
    },
    // 토요일 - 09:00~14:00 (점심 없음)
    {
      clinic_id: clinicId,
      day_of_week: 6,
      is_open: true,
      open_time: '09:00:00',
      close_time: '14:00:00',
      break_start: null,
      break_end: null,
    },
  ];

  // 4. 삽입
  const { data, error } = await supabase
    .from('clinic_hours')
    .insert(sampleHours)
    .select();

  if (error) {
    console.error('❌ 오류:', error.message);
    return;
  }

  console.log('✅ 샘플 진료시간이 생성되었습니다!\n');
  console.log('생성된 진료시간:');
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  sampleHours.forEach(h => {
    if (h.is_open) {
      console.log(`  ${days[h.day_of_week]}요일: ${h.open_time.substring(0, 5)} ~ ${h.close_time.substring(0, 5)}${h.break_start ? ` (점심: ${h.break_start.substring(0, 5)} ~ ${h.break_end.substring(0, 5)})` : ''}`);
    } else {
      console.log(`  ${days[h.day_of_week]}요일: 휴무`);
    }
  });

  console.log('\n다음 단계:');
  console.log('1. node scripts/init-user-work-schedules.js 실행 (기존 직원 work_schedule 초기화)');
  console.log('2. 근로계약서 작성 페이지에서 직원 선택 시 자동 입력 확인');
  console.log('');
}

createSampleClinicHours()
  .catch(console.error)
  .finally(() => process.exit(0));
