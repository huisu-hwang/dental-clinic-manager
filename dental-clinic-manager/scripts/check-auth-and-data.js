/**
 * 사용자 인증 상태 및 데이터 확인 스크립트
 *
 * 이 스크립트는:
 * 1. Supabase Auth 세션 확인
 * 2. auth.uid() 확인
 * 3. users 테이블에서 clinic_id 확인
 * 4. daily_reports 및 protocols 데이터 확인
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Error: Missing Supabase configuration');
  console.error('NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? 'SET' : 'MISSING');
  console.error('SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? 'SET' : 'MISSING');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function checkAuthAndData() {
  console.log('='.repeat(60));
  console.log('사용자 인증 상태 및 데이터 확인');
  console.log('='.repeat(60));
  console.log('');

  try {
    // 1. 모든 사용자 확인
    console.log('1️⃣  모든 사용자 확인...');
    const { data: allUsers, error: usersError } = await supabase
      .from('users')
      .select('id, email, name, role, clinic_id, status')
      .order('created_at', { ascending: false });

    if (usersError) {
      console.error('❌ 사용자 조회 실패:', usersError.message);
    } else {
      console.log(`✅ 총 ${allUsers.length}명의 사용자 발견`);
      console.log('');
      allUsers.forEach((user, index) => {
        console.log(`   사용자 ${index + 1}:`);
        console.log(`     - ID: ${user.id}`);
        console.log(`     - 이메일: ${user.email}`);
        console.log(`     - 이름: ${user.name}`);
        console.log(`     - 역할: ${user.role}`);
        console.log(`     - 상태: ${user.status}`);
        console.log(`     - clinic_id: ${user.clinic_id || '❌ NULL'}`);
        console.log('');
      });
    }

    // 2. Supabase Auth 사용자 확인
    console.log('2️⃣  Supabase Auth 사용자 확인...');
    const { data: { users: authUsers }, error: authUsersError } = await supabase.auth.admin.listUsers();

    if (authUsersError) {
      console.error('❌ Auth 사용자 조회 실패:', authUsersError.message);
    } else {
      console.log(`✅ 총 ${authUsers.length}명의 Auth 사용자 발견`);
      console.log('');
      authUsers.forEach((authUser, index) => {
        console.log(`   Auth 사용자 ${index + 1}:`);
        console.log(`     - ID: ${authUser.id}`);
        console.log(`     - 이메일: ${authUser.email}`);
        console.log(`     - 생성일: ${authUser.created_at}`);
        console.log(`     - 마지막 로그인: ${authUser.last_sign_in_at || '없음'}`);
        console.log('');
      });
    }

    // 3. daily_reports 데이터 확인
    console.log('3️⃣  daily_reports 데이터 확인...');
    const { data: dailyReports, error: reportsError } = await supabase
      .from('daily_reports')
      .select('id, date, clinic_id, created_by')
      .order('date', { ascending: false })
      .limit(10);

    if (reportsError) {
      console.error('❌ daily_reports 조회 실패:', reportsError.message);
    } else {
      console.log(`✅ 최근 ${dailyReports.length}개의 일일 보고서 발견`);
      console.log('');
      if (dailyReports.length > 0) {
        dailyReports.forEach((report, index) => {
          console.log(`   보고서 ${index + 1}:`);
          console.log(`     - ID: ${report.id}`);
          console.log(`     - 날짜: ${report.date}`);
          console.log(`     - clinic_id: ${report.clinic_id || '❌ NULL'}`);
          console.log(`     - created_by: ${report.created_by || '없음'}`);
          console.log('');
        });
      } else {
        console.log('   ⚠️  데이터 없음');
        console.log('');
      }
    }

    // 4. protocols 데이터 확인
    console.log('4️⃣  protocols 데이터 확인...');
    const { data: protocols, error: protocolsError } = await supabase
      .from('protocols')
      .select('id, title, clinic_id, created_by, status')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(10);

    if (protocolsError) {
      console.error('❌ protocols 조회 실패:', protocolsError.message);
    } else {
      console.log(`✅ 최근 ${protocols.length}개의 프로토콜 발견`);
      console.log('');
      if (protocols.length > 0) {
        protocols.forEach((protocol, index) => {
          console.log(`   프로토콜 ${index + 1}:`);
          console.log(`     - ID: ${protocol.id}`);
          console.log(`     - 제목: ${protocol.title}`);
          console.log(`     - clinic_id: ${protocol.clinic_id || '❌ NULL'}`);
          console.log(`     - created_by: ${protocol.created_by || '없음'}`);
          console.log(`     - 상태: ${protocol.status}`);
          console.log('');
        });
      } else {
        console.log('   ⚠️  데이터 없음');
        console.log('');
      }
    }

    // 5. 클리닉 정보 확인
    console.log('5️⃣  클리닉 정보 확인...');
    const { data: clinics, error: clinicsError } = await supabase
      .from('clinics')
      .select('id, name, owner_name, status')
      .order('created_at', { ascending: false });

    if (clinicsError) {
      console.error('❌ clinics 조회 실패:', clinicsError.message);
    } else {
      console.log(`✅ 총 ${clinics.length}개의 클리닉 발견`);
      console.log('');
      clinics.forEach((clinic, index) => {
        console.log(`   클리닉 ${index + 1}:`);
        console.log(`     - ID: ${clinic.id}`);
        console.log(`     - 이름: ${clinic.name}`);
        console.log(`     - 대표: ${clinic.owner_name}`);
        console.log(`     - 상태: ${clinic.status}`);
        console.log('');
      });
    }

    // 6. 데이터 일관성 확인
    console.log('6️⃣  데이터 일관성 확인...');
    console.log('');

    // users 테이블에서 clinic_id가 null인 사용자
    const usersWithoutClinic = allUsers?.filter(u => !u.clinic_id) || [];
    if (usersWithoutClinic.length > 0) {
      console.log(`   ⚠️  clinic_id가 없는 사용자: ${usersWithoutClinic.length}명`);
      usersWithoutClinic.forEach(u => {
        console.log(`      - ${u.email} (${u.name})`);
      });
      console.log('');
    } else {
      console.log('   ✅ 모든 사용자가 clinic_id를 가지고 있습니다.');
      console.log('');
    }

    // daily_reports에서 clinic_id가 null인 보고서
    const reportsWithoutClinic = dailyReports?.filter(r => !r.clinic_id) || [];
    if (reportsWithoutClinic.length > 0) {
      console.log(`   ⚠️  clinic_id가 없는 일일 보고서: ${reportsWithoutClinic.length}개`);
      reportsWithoutClinic.forEach(r => {
        console.log(`      - 날짜: ${r.date}, ID: ${r.id}`);
      });
      console.log('');
    } else if (dailyReports && dailyReports.length > 0) {
      console.log('   ✅ 모든 일일 보고서가 clinic_id를 가지고 있습니다.');
      console.log('');
    }

    // protocols에서 clinic_id가 null인 프로토콜
    const protocolsWithoutClinic = protocols?.filter(p => !p.clinic_id) || [];
    if (protocolsWithoutClinic.length > 0) {
      console.log(`   ⚠️  clinic_id가 없는 프로토콜: ${protocolsWithoutClinic.length}개`);
      protocolsWithoutClinic.forEach(p => {
        console.log(`      - 제목: ${p.title}, ID: ${p.id}`);
      });
      console.log('');
    } else if (protocols && protocols.length > 0) {
      console.log('   ✅ 모든 프로토콜이 clinic_id를 가지고 있습니다.');
      console.log('');
    }

    // 7. RLS 정책 테스트 (특정 사용자로 시뮬레이션)
    if (allUsers && allUsers.length > 0 && authUsers && authUsers.length > 0) {
      console.log('7️⃣  RLS 정책 테스트 (첫 번째 사용자로 시뮬레이션)...');
      console.log('');

      const testUser = authUsers[0];
      console.log(`   테스트 사용자: ${testUser.email}`);
      console.log('');

      // 해당 사용자의 clinic_id 찾기
      const userProfile = allUsers.find(u => u.id === testUser.id);
      if (userProfile && userProfile.clinic_id) {
        console.log(`   사용자의 clinic_id: ${userProfile.clinic_id}`);
        console.log('');

        // daily_reports 조회 (RLS 적용)
        const { data: userReports, error: userReportsError } = await supabase
          .from('daily_reports')
          .select('id, date, clinic_id')
          .eq('clinic_id', userProfile.clinic_id)
          .limit(5);

        if (userReportsError) {
          console.log(`   ❌ daily_reports 조회 실패: ${userReportsError.message}`);
        } else {
          console.log(`   ✅ 이 사용자로 조회 가능한 일일 보고서: ${userReports.length}개`);
        }
        console.log('');

        // protocols 조회 (RLS 적용)
        const { data: userProtocols, error: userProtocolsError } = await supabase
          .from('protocols')
          .select('id, title, clinic_id')
          .eq('clinic_id', userProfile.clinic_id)
          .is('deleted_at', null)
          .limit(5);

        if (userProtocolsError) {
          console.log(`   ❌ protocols 조회 실패: ${userProtocolsError.message}`);
        } else {
          console.log(`   ✅ 이 사용자로 조회 가능한 프로토콜: ${userProtocols.length}개`);
        }
        console.log('');
      } else {
        console.log('   ⚠️  사용자의 clinic_id가 설정되지 않았습니다!');
        console.log('');
      }
    }

    console.log('='.repeat(60));
    console.log('✅ 모든 확인 완료!');
    console.log('='.repeat(60));

  } catch (error) {
    console.error('❌ 예상치 못한 오류:', error);
  }
}

checkAuthAndData();
