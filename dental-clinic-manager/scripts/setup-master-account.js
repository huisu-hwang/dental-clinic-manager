const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Supabase 환경 변수가 설정되지 않았습니다.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function setupMasterAccount() {
  console.log('마스터 계정 설정 중...\n');

  const masterEmail = 'sani81@gmail.com';
  const masterPassword = 'master123456';

  try {
    // 1. 먼저 기존 계정으로 로그인 시도
    console.log('1. 기존 계정 로그인 시도...');
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email: masterEmail,
      password: masterPassword
    });

    if (!signInError && signInData.user) {
      console.log('✅ 로그인 성공! 계정이 이미 존재합니다.');

      // users 테이블에서 role을 master로 업데이트
      const { error: updateError } = await supabase
        .from('users')
        .update({ role: 'master' })
        .eq('id', signInData.user.id);

      if (!updateError) {
        console.log('✅ 역할을 master로 업데이트했습니다.');
      }

      return;
    }

    // 2. 로그인 실패 시 새 계정 생성
    console.log('2. 새 계정 생성 시도...');
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: masterEmail,
      password: masterPassword,
      options: {
        data: {
          name: 'Master Administrator',
          role: 'master'
        }
      }
    });

    if (signUpError) {
      if (signUpError.message.includes('already registered')) {
        console.log('⚠️  계정이 이미 존재합니다.');
        console.log('\n다음 방법을 시도해보세요:');
        console.log('1. Supabase Dashboard에서 비밀번호 재설정');
        console.log('2. 또는 이메일로 비밀번호 재설정 링크 요청');
      } else {
        console.error('계정 생성 실패:', signUpError.message);
      }
      return;
    }

    if (signUpData.user) {
      console.log('✅ 계정 생성 성공!');

      // 3. users 테이블에 마스터 정보 저장
      const { error: insertError } = await supabase
        .from('users')
        .insert({
          id: signUpData.user.id,
          email: masterEmail,
          name: 'Master Administrator',
          role: 'master',
          status: 'active',
          clinic_id: null // 마스터는 특정 병원에 속하지 않음
        });

      if (!insertError) {
        console.log('✅ 마스터 사용자 정보 저장 완료');
      }
    }

    console.log('\n========================================');
    console.log('마스터 계정 설정 완료!');
    console.log('========================================');
    console.log('이메일: sani81@gmail.com');
    console.log('비밀번호: master123456');
    console.log('역할: Master Administrator');
    console.log('========================================');
    console.log('\n⚠️  주의: 이메일 확인이 필요할 수 있습니다.');
    console.log('이메일을 확인하거나 Supabase Dashboard에서 직접 확인하세요.');

  } catch (error) {
    console.error('오류 발생:', error);
  }
}

setupMasterAccount();