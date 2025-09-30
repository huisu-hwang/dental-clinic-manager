const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase 환경 변수가 설정되지 않았습니다.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function createMasterAdmin() {
  console.log('마스터 관리자 계정 생성 중...\n');

  const masterEmail = 'master@example.com';
  const masterPassword = 'master123456';

  try {
    // 1. Auth에서 마스터 계정 생성
    console.log('1. 마스터 계정 생성 시도...');
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: masterEmail,
      password: masterPassword,
      options: {
        data: {
          name: 'Master Administrator',
          role: 'master',
          is_master: true
        }
      }
    });

    if (signUpError) {
      if (signUpError.message.includes('already registered')) {
        console.log('마스터 계정이 이미 존재합니다. 로그인 시도...');

        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: masterEmail,
          password: masterPassword
        });

        if (signInError) {
          console.error('로그인 실패:', signInError.message);
          if (signInError.message.includes('Email not confirmed')) {
            console.log('\n⚠️ 이메일 확인이 필요합니다.');
            console.log('Supabase 대시보드에서 이메일을 확인하거나');
            console.log('확인 이메일의 링크를 클릭해주세요.');
          }
        } else {
          console.log('✅ 로그인 성공!');
          await setupMasterData(signInData.user.id);
        }
      } else {
        console.error('계정 생성 오류:', signUpError.message);
      }
    } else {
      console.log('✅ 마스터 계정 생성 성공!');
      if (signUpData.user) {
        await setupMasterData(signUpData.user.id);
      }
    }

  } catch (error) {
    console.error('오류 발생:', error);
  }
}

async function setupMasterData(userId) {
  try {
    // 2. 마스터 병원 생성 (마스터 관리자용 가상 병원)
    console.log('\n2. 마스터 병원 정보 생성...');

    // 먼저 기존 마스터 병원 확인
    const { data: existingClinic } = await supabase
      .from('clinics')
      .select('id')
      .eq('email', 'master@example.com')
      .single();

    let clinicId;

    if (existingClinic) {
      clinicId = existingClinic.id;
      console.log('기존 마스터 병원 사용');
    } else {
      const { data: clinicData, error: clinicError } = await supabase
        .from('clinics')
        .insert({
          name: '시스템 관리',
          owner_name: 'Master Administrator',
          address: '시스템',
          phone: '000-0000-0000',
          email: 'master@example.com',
          is_public: false
        })
        .select()
        .single();

      if (clinicError) {
        console.error('병원 생성 오류:', clinicError.message);
        return;
      }

      clinicId = clinicData.id;
      console.log('✅ 마스터 병원 생성 완료');
    }

    // 3. users 테이블에 마스터 정보 저장
    console.log('\n3. 마스터 사용자 정보 저장...');

    const { data: existingUser } = await supabase
      .from('users')
      .select('id')
      .eq('id', userId)
      .single();

    if (existingUser) {
      // 업데이트
      const { error: updateError } = await supabase
        .from('users')
        .update({
          email: 'master@example.com',
          name: 'Master Administrator',
          role: 'master',  // 마스터 역할 설정
          clinic_id: clinicId
        })
        .eq('id', userId);

      if (updateError) {
        console.error('사용자 정보 업데이트 오류:', updateError.message);
      } else {
        console.log('✅ 마스터 사용자 정보 업데이트 완료');
      }
    } else {
      // 삽입
      const { error: insertError } = await supabase
        .from('users')
        .insert({
          id: userId,
          email: 'master@example.com',
          name: 'Master Administrator',
          role: 'master',  // 마스터 역할 설정
          clinic_id: clinicId
        });

      if (insertError) {
        console.error('사용자 정보 저장 오류:', insertError.message);
      } else {
        console.log('✅ 마스터 사용자 정보 저장 완료');
      }
    }

    console.log('\n========================================');
    console.log('마스터 관리자 계정 설정 완료!');
    console.log('========================================');
    console.log('이메일: master@example.com');
    console.log('비밀번호: master123456');
    console.log('역할: Master Administrator');
    console.log('권한: 모든 병원 및 사용자 관리');
    console.log('========================================');
    console.log('\n로그인 후 /master 페이지에서 관리 기능 사용 가능');

  } catch (error) {
    console.error('마스터 데이터 설정 중 오류:', error);
  }
}

createMasterAdmin();