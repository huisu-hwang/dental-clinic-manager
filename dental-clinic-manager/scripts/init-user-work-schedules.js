const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function initWorkSchedules() {
  console.log('\n=== 기존 직원 work_schedule 초기화 ===\n');

  // 1. work_schedule이 NULL인 직원 조회
  const { data: users, error: userError } = await supabase
    .from('users')
    .select('id, name, clinic_id, role')
    .is('work_schedule', null)
    .not('clinic_id', 'is', null)
    .eq('status', 'active')
    .not('role', 'in', '(master_admin,owner)');

  if (userError) {
    console.error('❌ 사용자 조회 실패:', userError.message);
    return;
  }

  if (!users || users.length === 0) {
    console.log('✅ 초기화할 직원이 없습니다. (모든 직원이 이미 work_schedule을 가지고 있음)');
    return;
  }

  console.log(`초기화 대상: ${users.length}명\n`);

  // 2. 각 직원별로 clinic_hours 조회 후 work_schedule 생성
  for (const user of users) {
    console.log(`[${user.name}] 초기화 중...`);

    // clinic_hours 조회
    const { data: clinicHours, error: hoursError } = await supabase
      .from('clinic_hours')
      .select('*')
      .eq('clinic_id', user.clinic_id)
      .order('day_of_week');

    if (hoursError || !clinicHours || clinicHours.length === 0) {
      console.log(`  ❌ clinic_hours 없음. 건너뜀.`);
      continue;
    }

    // work_schedule 객체 생성
    const dayMap = {
      0: 'sunday',
      1: 'monday',
      2: 'tuesday',
      3: 'wednesday',
      4: 'thursday',
      5: 'friday',
      6: 'saturday'
    };

    const workSchedule = {};

    clinicHours.forEach(hours => {
      const dayName = dayMap[hours.day_of_week];

      if (hours.is_open) {
        workSchedule[dayName] = {
          start: hours.open_time ? hours.open_time.substring(0, 5) : null,
          end: hours.close_time ? hours.close_time.substring(0, 5) : null,
          breakStart: hours.break_start ? hours.break_start.substring(0, 5) : null,
          breakEnd: hours.break_end ? hours.break_end.substring(0, 5) : null,
          isWorking: true
        };
      } else {
        workSchedule[dayName] = {
          start: null,
          end: null,
          breakStart: null,
          breakEnd: null,
          isWorking: false
        };
      }
    });

    // work_schedule 업데이트
    const { error: updateError } = await supabase
      .from('users')
      .update({ work_schedule: workSchedule })
      .eq('id', user.id);

    if (updateError) {
      console.log(`  ❌ 업데이트 실패: ${updateError.message}`);
    } else {
      console.log(`  ✅ 초기화 완료`);
      console.log(`     월: ${workSchedule.monday?.isWorking ? `${workSchedule.monday.start} ~ ${workSchedule.monday.end}` : '휴무'}`);
      console.log(`     화: ${workSchedule.tuesday?.isWorking ? `${workSchedule.tuesday.start} ~ ${workSchedule.tuesday.end}` : '휴무'}`);
    }
  }

  console.log('\n=== 초기화 완료 ===\n');
}

initWorkSchedules()
  .catch(console.error)
  .finally(() => process.exit(0));
