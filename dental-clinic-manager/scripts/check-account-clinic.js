const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function checkAccountClinic() {
  console.log('계정과 병원 연결 상태 확인 중...\n');

  const testEmail = 'whitedc0902@gmail.com';

  try {
    // 1. 사용자 정보 확인
    console.log('1. 사용자 정보 확인...');
    const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();

    if (authError) {
      console.error('인증 사용자 조회 실패:', authError);
      return;
    }

    const authUser = authUsers.users.find(u => u.email === testEmail);
    if (!authUser) {
      console.log('❌ 인증 사용자를 찾을 수 없습니다.');
      return;
    }

    console.log('✅ 인증 사용자 발견:');
    console.log('   User ID:', authUser.id);
    console.log('   Email:', authUser.email);

    // 2. users 테이블 정보 확인
    console.log('\n2. users 테이블 정보 확인...');
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', authUser.id)
      .single();

    if (userError) {
      console.error('사용자 정보 조회 실패:', userError);
      return;
    }

    console.log('✅ 사용자 정보:');
    console.log('   이름:', user.name);
    console.log('   역할:', user.role);
    console.log('   병원 ID:', user.clinic_id || '(연결되지 않음)');
    console.log('   상태:', user.status);

    // 3. 병원 정보 확인
    console.log('\n3. 병원 정보 확인...');

    // 하얀치과 찾기
    const { data: clinics, error: clinicsError } = await supabase
      .from('clinics')
      .select('*')
      .eq('name', '하얀치과');

    if (clinicsError) {
      console.error('병원 조회 실패:', clinicsError);
      return;
    }

    if (!clinics || clinics.length === 0) {
      console.log('❌ "하얀치과"를 찾을 수 없습니다. 병원 생성이 필요합니다.');

      // 모든 병원 목록 보기
      const { data: allClinics } = await supabase
        .from('clinics')
        .select('id, name, owner_name, email')
        .is('deleted_at', null);

      console.log('\n현재 등록된 병원 목록:');
      allClinics?.forEach((c, idx) => {
        console.log(`   ${idx + 1}. ${c.name} (원장: ${c.owner_name}, 이메일: ${c.email})`);
      });

      return {
        needsClinicCreation: true,
        userId: authUser.id,
        userEmail: testEmail
      };
    }

    const clinic = clinics[0];
    console.log('✅ 하얀치과 발견:');
    console.log('   병원 ID:', clinic.id);
    console.log('   병원명:', clinic.name);
    console.log('   원장명:', clinic.owner_name);
    console.log('   이메일:', clinic.email);
    console.log('   주소:', clinic.address);
    console.log('   전화:', clinic.phone);

    // 4. 연결 상태 확인
    console.log('\n4. 연결 상태 확인...');
    if (user.clinic_id === clinic.id) {
      console.log('✅ 사용자가 하얀치과에 올바르게 연결되어 있습니다.');

      if (user.role === 'owner') {
        console.log('✅ 역할이 원장(owner)으로 올바르게 설정되어 있습니다.');
        console.log('\n========================================');
        console.log('모든 설정이 올바릅니다! 👍');
        console.log('========================================');
      } else {
        console.log('⚠️  역할이 원장(owner)이 아닙니다. 현재 역할:', user.role);
        return {
          needsRoleUpdate: true,
          userId: authUser.id,
          clinicId: clinic.id
        };
      }
    } else {
      console.log('⚠️  사용자가 하얀치과에 연결되어 있지 않습니다.');
      console.log('   현재 clinic_id:', user.clinic_id || '(없음)');
      console.log('   하얀치과 ID:', clinic.id);
      return {
        needsClinicUpdate: true,
        userId: authUser.id,
        clinicId: clinic.id,
        currentRole: user.role
      };
    }

  } catch (error) {
    console.error('오류 발생:', error);
  }
}

checkAccountClinic().then(result => {
  if (result) {
    console.log('\n수정이 필요합니다.');
  }
});
