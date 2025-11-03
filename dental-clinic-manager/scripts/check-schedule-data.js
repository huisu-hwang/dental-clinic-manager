const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://beahjntkmkfhpcbhfnrr.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJlYWhqbnRrbWtmaHBjYmhmbnJyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc5NDEyNzUsImV4cCI6MjA3MzUxNzI3NX0.Af5GbqP_qQAEax5nj_ojTSz3xy1I-rBcV-TU1CwceFA';

const supabase = createClient(supabaseUrl, supabaseKey);

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

async function checkData() {
  console.log('\n================================================');
  console.log('   스케줄 데이터 확인');
  console.log('================================================\n');

  // 1. 병원 진료시간 확인
  const { data: clinicHours, error: clinicError } = await supabase
    .from('clinic_hours')
    .select('*')
    .order('day_of_week');

  console.log('=== 1. 병원 진료시간 (clinic_hours 테이블) ===');
  if (clinicError) {
    console.error('에러:', clinicError.message);
  } else if (clinicHours && clinicHours.length > 0) {
    clinicHours.forEach(h => {
      const dayName = DAY_NAMES[h.day_of_week];
      if (h.is_open) {
        console.log(`${dayName}요일: ${h.open_time} ~ ${h.close_time}${h.break_start ? ` (점심: ${h.break_start} ~ ${h.break_end})` : ''}`);
      } else {
        console.log(`${dayName}요일: 휴무`);
      }
    });
  } else {
    console.log('병원 진료시간 설정 없음');
  }

  // 2. 직원 work_schedule JSONB 확인
  const { data: users, error: usersError } = await supabase
    .from('users')
    .select('id, name, work_schedule, role')
    .eq('status', 'active')
    .neq('role', 'master_admin')
    .neq('role', 'owner')
    .limit(5);

  console.log('\n=== 2. 직원 개인 스케줄 (users.work_schedule JSONB) ===');
  if (usersError) {
    console.error('에러:', usersError.message);
  } else if (users && users.length > 0) {
    users.forEach(u => {
      console.log(`\n[${u.name}]`);
      if (u.work_schedule) {
        console.log('  ✅ work_schedule 있음');
        if (u.work_schedule.monday) {
          console.log(`  월요일: ${u.work_schedule.monday.isWorking ? `${u.work_schedule.monday.start} ~ ${u.work_schedule.monday.end}` : '휴무'}`);
        }
        if (u.work_schedule.tuesday) {
          console.log(`  화요일: ${u.work_schedule.tuesday.isWorking ? `${u.work_schedule.tuesday.start} ~ ${u.work_schedule.tuesday.end}` : '휴무'}`);
        }
      } else {
        console.log('  ❌ work_schedule NULL');
      }
    });
  } else {
    console.log('활성 직원 없음');
  }

  // 3. work_schedules 테이블 확인
  const { data: workSchedules, error: schedError } = await supabase
    .from('work_schedules')
    .select('user_id, day_of_week, start_time, end_time, is_work_day')
    .order('user_id')
    .order('day_of_week')
    .limit(14);

  console.log('\n=== 3. 출퇴근 스케줄 (work_schedules 테이블) ===');
  if (schedError) {
    console.error('에러:', schedError.message);
  } else if (workSchedules && workSchedules.length > 0) {
    console.log(`총 ${workSchedules.length}건`);
    const byUser = {};
    workSchedules.forEach(s => {
      if (!byUser[s.user_id]) byUser[s.user_id] = [];
      byUser[s.user_id].push(s);
    });

    Object.entries(byUser).forEach(([userId, schedules]) => {
      console.log(`\nUser ID: ${userId.substring(0, 8)}...`);
      schedules.forEach(s => {
        const dayName = DAY_NAMES[s.day_of_week];
        console.log(`  ${dayName}: ${s.is_work_day ? `${s.start_time} ~ ${s.end_time}` : '휴무'}`);
      });
    });
  } else {
    console.log('work_schedules 테이블 데이터 없음');
  }

  console.log('\n================================================\n');
}

checkData()
  .catch(console.error)
  .finally(() => process.exit(0));
