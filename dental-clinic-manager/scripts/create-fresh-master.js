const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase 환경 변수가 설정되지 않았습니다.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function createFreshMaster() {
  console.log('새로운 마스터 계정 생성 프로세스...\n');

  const masterEmail = 'master.admin@dentalclinic.com';
  const masterPassword = 'Admin123456!';

  try {
    // 1. 새 계정 생성
    console.log(`Step 1: ${masterEmail}로 새 계정 생성 시도...`);
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: masterEmail,
      password: masterPassword,
      options: {
        data: {
          name: 'System Master',
          role: 'master',
          is_master: true
        }
      }
    });

    if (signUpError) {
      if (signUpError.message.includes('already registered')) {
        console.log('계정이 이미 존재합니다. 로그인 시도...');

        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: masterEmail,
          password: masterPassword
        });

        if (!signInError && signInData.user) {
          console.log('✅ 로그인 성공');
          await setupMasterData(signInData.user.id, masterEmail);
        } else {
          console.error('로그인 실패:', signInError?.message);
        }
      } else {
        console.error('계정 생성 실패:', signUpError.message);
      }
      return;
    }

    console.log('✅ 계정 생성 성공!');
    if (signUpData.user) {
      await setupMasterData(signUpData.user.id, masterEmail);
    }

  } catch (error) {
    console.error('오류 발생:', error);
  }
}

async function setupMasterData(userId, email) {
  console.log('\nStep 2: 마스터 데이터 설정...');

  try {
    // 마스터 병원 생성
    const { data: clinicData, error: clinicError } = await supabase
      .from('clinics')
      .insert({
        name: '시스템 관리',
        owner_name: 'System Master',
        address: '관리자',
        phone: '010-0000-0000',
        email: email,
        is_public: false
      })
      .select()
      .single();

    if (clinicError && !clinicError.message.includes('duplicate')) {
      console.error('병원 생성 오류:', clinicError.message);
    }

    const clinicId = clinicData?.id;

    // users 테이블에 마스터 정보 저장
    const { error: userError } = await supabase
      .from('users')
      .upsert({
        id: userId,
        email: email,
        name: 'System Master',
        role: 'master',
        clinic_id: clinicId
      }, {
        onConflict: 'id'
      });

    if (userError) {
      console.error('사용자 정보 저장 오류:', userError.message);
    } else {
      console.log('✅ 마스터 설정 완료');
    }

    console.log('\n========================================');
    console.log('새 마스터 관리자 계정 생성 완료!');
    console.log('========================================');
    console.log(`이메일: ${email}`);
    console.log(`비밀번호: Admin123456!`);
    console.log('역할: System Master');
    console.log('========================================');
    console.log('\n이제 이 계정으로 로그인할 수 있습니다.');
    console.log('로그인 후 /master 페이지에서 관리 기능 사용 가능');
    console.log('\n⚠️ 이메일 확인이 필요할 수 있습니다.');

  } catch (error) {
    console.error('마스터 데이터 설정 오류:', error);
  }
}

createFreshMaster();