const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase 환경 변수가 설정되지 않았습니다.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function createAdminAccount() {
  try {
    console.log('마스터 Admin 계정 생성 중...');

    // 1. 먼저 일반 사용자로 회원가입
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: 'sani81@gmail.com',
      password: '123456',
      options: {
        data: {
          name: 'Master Admin',
          role: 'admin',
          user_id: 'admin'
        }
      }
    });

    if (signUpError) {
      if (signUpError.message.includes('already registered') || signUpError.message.includes('security purposes')) {
        console.log('이미 등록된 사용자입니다. 로그인을 시도합니다...');

        // 로그인 시도
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: 'sani81@gmail.com',
          password: '123456'
        });

        if (signInError) {
          console.error('로그인 실패:', signInError.message);
          console.log('\n비밀번호 재설정이 필요할 수 있습니다.');
          console.log('Supabase 대시보드에서 직접 비밀번호를 재설정하거나');
          console.log('비밀번호 재설정 이메일을 요청하세요.');
        } else {
          console.log('✅ 로그인 성공!');
          await updateUserInfo(signInData.user.id);
        }
      } else {
        console.error('회원가입 오류:', signUpError.message);
      }
    } else {
      console.log('✅ 회원가입 성공!');
      if (signUpData.user) {
        await updateUserInfo(signUpData.user.id);
      }
    }

  } catch (error) {
    console.error('오류 발생:', error);
  }
}

async function updateUserInfo(userId) {
  try {
    // 먼저 기존 병원 확인
    const { data: existingClinic } = await supabase
      .from('clinics')
      .select('id')
      .eq('email', 'sani81@gmail.com')
      .single();

    let clinicId;

    if (existingClinic) {
      clinicId = existingClinic.id;
    } else {
      // 마스터 병원 생성 (UUID 자동 생성)
      const { data: clinicData, error: clinicError } = await supabase
        .from('clinics')
        .insert({
          name: '마스터 병원',
          owner_name: 'Master Admin',
          address: '서울시 강남구',
          phone: '02-1234-5678',
          email: 'sani81@gmail.com',
          is_public: false
        })
        .select()
        .single();

      if (clinicError) {
        console.error('병원 생성 오류:', clinicError);
        return;
      }
      clinicId = clinicData.id;
    }

    // users 테이블에 정보 추가/업데이트
    const { error: userError } = await supabase
      .from('users')
      .upsert({
        id: userId,
        email: 'sani81@gmail.com',
        name: 'Master Admin',
        role: 'owner', // owner로 설정 (테이블 제약 조건에 맞춰서)
        clinic_id: clinicId
      }, {
        onConflict: 'id'
      });

    if (userError) {
      console.error('Users 테이블 업데이트 오류:', userError);
    } else {
      console.log('✅ 사용자 정보 업데이트 완료');
    }

    console.log('\n========================================');
    console.log('마스터 Admin 계정 설정 완료!');
    console.log('========================================');
    console.log('이메일: sani81@gmail.com');
    console.log('비밀번호: 123456');
    console.log('역할: Master Admin (owner)');
    console.log('병원 ID:', clinicId);
    console.log('========================================');
    console.log('\n앱에서 로그인하여 사용하세요!');

  } catch (error) {
    console.error('사용자 정보 업데이트 중 오류:', error);
  }
}

createAdminAccount();