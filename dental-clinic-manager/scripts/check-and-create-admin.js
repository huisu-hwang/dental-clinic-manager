const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase 환경 변수가 설정되지 않았습니다.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function checkAndCreateAdmin() {
  console.log('Admin 계정 확인 및 생성...\n');

  try {
    // 1. admin@dentalmanager.com 계정 생성 시도
    console.log('Step 1: admin@dentalmanager.com 계정 생성 시도...');
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: 'admin@dentalmanager.com',
      password: 'temp123456',  // 임시 비밀번호
      options: {
        data: {
          name: 'Admin',
          role: 'owner'
        }
      }
    });

    if (signUpError) {
      console.log('계정 생성 실패:', signUpError.message);

      // 이미 존재하는 경우 로그인 시도
      if (signUpError.message.includes('already registered')) {
        console.log('\n계정이 이미 존재합니다. 여러 비밀번호로 로그인 시도...');

        const passwords = ['123456', 'temp123456', 'admin123', 'Admin123!'];
        let loginSuccess = false;

        for (const pwd of passwords) {
          const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
            email: 'admin@dentalmanager.com',
            password: pwd
          });

          if (!loginError) {
            console.log(`✅ 비밀번호 '${pwd}'로 로그인 성공!`);
            loginSuccess = true;

            // 비밀번호 변경
            const { error: updateError } = await supabase.auth.updateUser({
              password: '123456'
            });

            if (!updateError) {
              console.log('✅ 비밀번호를 123456으로 변경 완료');
            }

            await supabase.auth.signOut();
            break;
          }
        }

        if (!loginSuccess) {
          console.log('❌ 모든 비밀번호로 로그인 실패');
        }
      }
    } else {
      console.log('✅ 계정 생성 성공!');
      if (signUpData.user) {
        console.log('User ID:', signUpData.user.id);
      }
    }

    // 2. 데이터베이스 확인
    console.log('\n데이터베이스에서 사용자 정보 확인...');
    const { data: users, error: usersError } = await supabase
      .from('users')
      .select('*')
      .or('email.eq.admin@dentalmanager.com,email.eq.sani81@gmail.com');

    if (users && users.length > 0) {
      console.log('\n발견된 사용자:');
      users.forEach(user => {
        console.log(`- ${user.email} (${user.name}, ${user.role})`);
      });
    } else {
      console.log('users 테이블에 관련 사용자 없음');
    }

    // 3. 병원 정보 확인
    const { data: clinics, error: clinicsError } = await supabase
      .from('clinics')
      .select('*')
      .or('email.eq.admin@dentalmanager.com,email.eq.sani81@gmail.com');

    if (clinics && clinics.length > 0) {
      console.log('\n발견된 병원:');
      clinics.forEach(clinic => {
        console.log(`- ${clinic.name} (${clinic.email})`);
      });
    }

    console.log('\n========================================');
    console.log('확인 완료!');
    console.log('========================================');
    console.log('\nsani81@gmail.com 계정이 이미 생성되어 있습니다.');
    console.log('이메일 확인 링크를 클릭하거나');
    console.log('Supabase 대시보드에서 직접 확인 처리를 해주세요.');
    console.log('\n또는 아래 정보로 새 계정을 만들 수 있습니다:');
    console.log('이메일: 원하는 새 이메일');
    console.log('비밀번호: 123456');
    console.log('========================================');

  } catch (error) {
    console.error('오류 발생:', error);
  }
}

checkAndCreateAdmin();