const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkAllData() {
  console.log('\n=== 전체 Clinic Hours 확인 (Service Role) ===\n');

  // 1. 모든 clinic_hours 조회
  const { data: allHours, error } = await supabase
    .from('clinic_hours')
    .select('*')
    .order('clinic_id')
    .order('day_of_week');

  if (error) {
    console.error('에러:', error.message);
    return;
  }

  console.log(`총 ${allHours.length}건\n`);

  // clinic_id별로 그룹화
  const byClinic = {};
  allHours.forEach(h => {
    if (!byClinic[h.clinic_id]) {
      byClinic[h.clinic_id] = [];
    }
    byClinic[h.clinic_id].push(h);
  });

  const days = ['일', '월', '화', '수', '목', '금', '토'];

  Object.entries(byClinic).forEach(([clinicId, hours]) => {
    console.log(`\nClinic ID: ${clinicId.substring(0, 8)}...`);
    hours.forEach(h => {
      if (h.is_open) {
        console.log(`  ${days[h.day_of_week]}: ${h.open_time} ~ ${h.close_time}${h.break_start ? ` (점심: ${h.break_start} ~ ${h.break_end})` : ''}`);
      } else {
        console.log(`  ${days[h.day_of_week]}: 휴무`);
      }
    });
  });

  // 2. users와 매칭
  const { data: users } = await supabase
    .from('users')
    .select('id, name, clinic_id, work_schedule')
    .eq('status', 'active')
    .not('clinic_id', 'is', null)
    .limit(5);

  console.log('\n\n=== 사용자와 Clinic 매칭 ===\n');
  if (users) {
    users.forEach(u => {
      const hasHours = byClinic[u.clinic_id] ? '✅' : '❌';
      const hasWorkSchedule = u.work_schedule ? '✅' : '❌';
      console.log(`${u.name}:`);
      console.log(`  clinic_id: ${u.clinic_id.substring(0, 8)}...`);
      console.log(`  clinic_hours: ${hasHours}`);
      console.log(`  work_schedule: ${hasWorkSchedule}`);
    });
  }

  console.log('\n');
}

checkAllData()
  .catch(console.error)
  .finally(() => process.exit(0));
