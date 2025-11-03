const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkMigrationStatus() {
  console.log('\n=== Migration 상태 확인 ===\n');

  // 1. users 테이블에 work_schedule 컬럼 존재 확인
  const { data: columns, error: colError } = await supabase
    .from('users')
    .select('work_schedule')
    .limit(1);

  if (colError) {
    console.log('❌ work_schedule 컬럼 없음');
    console.log('   → Migration 실행 필요!');
    console.log('   → WORK_SCHEDULE_MIGRATION_GUIDE.md 참고');
  } else {
    console.log('✅ work_schedule 컬럼 존재');
  }

  // 2. clinic_id 확인
  const { data: users, error: userError } = await supabase
    .from('users')
    .select('id, name, clinic_id')
    .eq('status', 'active')
    .limit(3);

  console.log('\n=== 사용자 clinic_id 확인 ===');
  if (users && users.length > 0) {
    users.forEach(u => {
      console.log(`${u.name}: clinic_id = ${u.clinic_id || 'NULL'}`);
    });

    const firstClinicId = users[0]?.clinic_id;
    if (firstClinicId) {
      // clinic_hours 확인
      const { data: hours, error: hoursError } = await supabase
        .from('clinic_hours')
        .select('*')
        .eq('clinic_id', firstClinicId);

      console.log(`\n=== clinic_id ${firstClinicId.substring(0, 8)}... 의 진료시간 ===`);
      if (hours && hours.length > 0) {
        console.log(`✅ ${hours.length}건의 진료시간 설정 있음`);
        hours.forEach(h => {
          const days = ['일', '월', '화', '수', '목', '금', '토'];
          console.log(`  ${days[h.day_of_week]}: ${h.is_open ? `${h.open_time} ~ ${h.close_time}` : '휴무'}`);
        });
      } else {
        console.log('❌ 진료시간 설정 없음');
        console.log('   → 병원 설정 > 진료시간 설정에서 먼저 설정 필요');
      }
    }
  } else {
    console.log('활성 사용자 없음');
  }

  console.log('\n');
}

checkMigrationStatus()
  .catch(console.error)
  .finally(() => process.exit(0));
