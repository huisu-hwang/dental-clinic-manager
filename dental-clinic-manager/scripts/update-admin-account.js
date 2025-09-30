const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase 환경 변수가 설정되지 않았습니다.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function updateAdminAccount() {
  console.log('계정 정보 업데이트 시작...\n');

  try {
    // 1. 먼저 기존 admin@dentalmanager.com으로 로그인 시도
    console.log('Step 1: admin@dentalmanager.com으로 로그인 시도...');
    const { data: adminLogin, error: adminLoginError } = await supabase.auth.signInWithPassword({
      email: 'admin@dentalmanager.com',
      password: '123456'  // 기존 비밀번호 시도
    });

    if (!adminLoginError) {
      console.log('✅ admin@dentalmanager.com으로 로그인 성공!');
      console.log('이미 비밀번호가 123456입니다.');

      // 이메일 변경 시도
      console.log('\nStep 2: 이메일을 sani81@gmail.com으로 변경 시도...');
      const { error: updateError } = await supabase.auth.updateUser({
        email: 'sani81@gmail.com'
      });

      if (updateError) {
        console.log('❌ 이메일 변경 실패:', updateError.message);
        console.log('\n참고: Supabase 대시보드에서 직접 변경이 필요할 수 있습니다.');
      } else {
        console.log('✅ 이메일 변경 요청 성공! 확인 이메일을 체크하세요.');
      }

      // users 테이블 업데이트
      if (adminLogin.user) {
        const { error: userUpdateError } = await supabase
          .from('users')
          .update({
            email: 'sani81@gmail.com'
          })
          .eq('id', adminLogin.user.id);

        if (!userUpdateError) {
          console.log('✅ users 테이블 이메일 업데이트 완료');
        }

        // clinics 테이블 업데이트
        const { error: clinicUpdateError } = await supabase
          .from('clinics')
          .update({
            email: 'sani81@gmail.com'
          })
          .eq('email', 'admin@dentalmanager.com');

        if (!clinicUpdateError) {
          console.log('✅ clinics 테이블 이메일 업데이트 완료');
        }
      }

      await supabase.auth.signOut();
    } else {
      console.log('admin@dentalmanager.com 로그인 실패:', adminLoginError.message);
      console.log('다른 비밀번호로 시도하거나 계정이 없을 수 있습니다.');
    }

    // 2. 기존 sani81@gmail.com 계정 확인
    console.log('\nStep 3: 기존 sani81@gmail.com 계정 확인...');
    const { data: saniLogin, error: saniLoginError } = await supabase.auth.signInWithPassword({
      email: 'sani81@gmail.com',
      password: '123456'
    });

    if (!saniLoginError) {
      console.log('✅ sani81@gmail.com 계정이 존재하고 비밀번호가 123456입니다.');

      // 관련 데이터 확인
      if (saniLogin.user) {
        // users 테이블에서 확인
        const { data: userData, error: userError } = await supabase
          .from('users')
          .select('*')
          .eq('id', saniLogin.user.id)
          .single();

        if (userData) {
          console.log('\n현재 사용자 정보:');
          console.log('- 이름:', userData.name);
          console.log('- 역할:', userData.role);
          console.log('- 병원 ID:', userData.clinic_id);
        }

        // clinics 테이블에서 확인
        if (userData?.clinic_id) {
          const { data: clinicData } = await supabase
            .from('clinics')
            .select('*')
            .eq('id', userData.clinic_id)
            .single();

          if (clinicData) {
            console.log('\n연결된 병원 정보:');
            console.log('- 병원명:', clinicData.name);
            console.log('- 대표자:', clinicData.owner_name);
          }
        }
      }

      await supabase.auth.signOut();
    } else if (saniLoginError.message.includes('Email not confirmed')) {
      console.log('⚠️ sani81@gmail.com 계정이 존재하지만 이메일 확인이 필요합니다.');
    } else {
      console.log('sani81@gmail.com 계정 접속 실패:', saniLoginError.message);
    }

    console.log('\n========================================');
    console.log('작업 완료!');
    console.log('========================================');
    console.log('\n로그인 정보:');
    console.log('이메일: sani81@gmail.com');
    console.log('비밀번호: 123456');
    console.log('========================================');

  } catch (error) {
    console.error('오류 발생:', error);
  }
}

updateAdminAccount();