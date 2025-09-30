const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase 환경 변수가 설정되지 않았습니다.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function testMasterLogin() {
  console.log('마스터 계정 로그인 테스트...\n');

  try {
    // sani81@gmail.com으로 로그인 시도
    console.log('sani81@gmail.com으로 로그인 시도...');
    const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
      email: 'sani81@gmail.com',
      password: 'master123456'
    });

    if (loginError) {
      console.error('❌ 로그인 실패:', loginError.message);

      if (loginError.message.includes('Email not confirmed')) {
        console.log('\n⚠️ 이메일 확인이 필요합니다.');
        console.log('\n해결 방법:');
        console.log('1. sani81@gmail.com으로 전송된 확인 이메일 확인');
        console.log('2. 또는 Supabase 대시보드에서:');
        console.log('   - Authentication > Users 메뉴로 이동');
        console.log('   - sani81@gmail.com 사용자 찾기');
        console.log('   - "Confirm email" 버튼 클릭');
      }
      return;
    }

    console.log('✅ 로그인 성공!');
    console.log('User ID:', loginData.user.id);
    console.log('Email:', loginData.user.email);

    // users 테이블에서 정보 확인
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', loginData.user.id)
      .single();

    if (userData) {
      console.log('\n사용자 정보:');
      console.log('- 이름:', userData.name);
      console.log('- 역할:', userData.role);
      console.log('- 병원 ID:', userData.clinic_id);

      if (userData.role === 'master') {
        console.log('\n✅ 마스터 권한 확인됨!');
        console.log('/master 페이지에서 시스템 관리 가능');
      } else {
        console.log('\n⚠️ 마스터 권한이 없습니다. 역할:', userData.role);
      }
    }

    await supabase.auth.signOut();

  } catch (error) {
    console.error('오류 발생:', error);
  }
}

testMasterLogin();