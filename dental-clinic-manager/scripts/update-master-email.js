const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase 환경 변수가 설정되지 않았습니다.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function updateMasterEmail() {
  console.log('마스터 관리자 이메일 변경 프로세스 시작...\n');

  try {
    // 1. 먼저 기존 마스터 계정으로 로그인 시도
    console.log('Step 1: master@dentalmanager.com으로 로그인 시도...');
    const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
      email: 'master@dentalmanager.com',
      password: 'master123456'
    });

    if (loginError) {
      console.error('로그인 실패:', loginError.message);

      if (loginError.message.includes('Email not confirmed')) {
        console.log('\n⚠️ 이메일 확인이 필요합니다.');
        console.log('새로운 계정을 생성합니다...\n');

        // 새 계정 생성
        await createNewMasterAccount();
        return;
      }
      return;
    }

    console.log('✅ 로그인 성공!');
    const userId = loginData.user.id;

    // 2. Auth에서 이메일 변경 (이것은 확인 이메일을 보낼 것임)
    console.log('\nStep 2: 이메일 변경 시도...');
    const { error: updateAuthError } = await supabase.auth.updateUser({
      email: 'sani81@gmail.com'
    });

    if (updateAuthError) {
      console.log('Auth 이메일 변경 실패:', updateAuthError.message);
    } else {
      console.log('✅ 이메일 변경 요청 전송 (확인 이메일 필요)');
    }

    // 3. users 테이블 업데이트
    console.log('\nStep 3: users 테이블 업데이트...');
    const { error: userUpdateError } = await supabase
      .from('users')
      .update({
        email: 'sani81@gmail.com'
      })
      .eq('id', userId);

    if (userUpdateError) {
      console.error('users 테이블 업데이트 실패:', userUpdateError.message);
    } else {
      console.log('✅ users 테이블 이메일 업데이트 완료');
    }

    // 4. clinics 테이블 업데이트
    console.log('\nStep 4: clinics 테이블 업데이트...');
    const { error: clinicUpdateError } = await supabase
      .from('clinics')
      .update({
        email: 'sani81@gmail.com'
      })
      .eq('email', 'master@dentalmanager.com');

    if (clinicUpdateError) {
      console.error('clinics 테이블 업데이트 실패:', clinicUpdateError.message);
    } else {
      console.log('✅ clinics 테이블 이메일 업데이트 완료');
    }

    await supabase.auth.signOut();

  } catch (error) {
    console.error('오류 발생:', error);
  }
}

async function createNewMasterAccount() {
  console.log('새 마스터 계정을 sani81@gmail.com으로 생성합니다...\n');

  try {
    // 1. 새 계정 생성
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: 'sani81@gmail.com',
      password: 'master123456',
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
        console.log('sani81@gmail.com 계정이 이미 존재합니다.');

        // 로그인 시도
        const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
          email: 'sani81@gmail.com',
          password: 'master123456'
        });

        if (!signInError && signInData.user) {
          console.log('✅ 기존 계정으로 로그인 성공');
          await updateToMaster(signInData.user.id);
        } else {
          console.log('비밀번호가 다릅니다. 비밀번호 리셋이 필요할 수 있습니다.');
        }
      } else {
        console.error('계정 생성 실패:', signUpError.message);
      }
      return;
    }

    console.log('✅ 새 마스터 계정 생성 성공!');
    if (signUpData.user) {
      await updateToMaster(signUpData.user.id);
    }

  } catch (error) {
    console.error('새 계정 생성 중 오류:', error);
  }
}

async function updateToMaster(userId) {
  console.log('\n사용자를 마스터로 업데이트 중...');

  try {
    // 마스터 병원 생성/확인
    let clinicId;

    // 기존 마스터 병원 찾기
    const { data: existingClinic } = await supabase
      .from('clinics')
      .select('id')
      .or('email.eq.master@dentalmanager.com,email.eq.sani81@gmail.com')
      .single();

    if (existingClinic) {
      clinicId = existingClinic.id;

      // 이메일 업데이트
      await supabase
        .from('clinics')
        .update({ email: 'sani81@gmail.com' })
        .eq('id', clinicId);

      console.log('✅ 기존 마스터 병원 사용');
    } else {
      // 새 마스터 병원 생성
      const { data: newClinic, error: clinicError } = await supabase
        .from('clinics')
        .insert({
          name: '시스템 관리',
          owner_name: 'Master Administrator',
          address: '시스템',
          phone: '000-0000-0000',
          email: 'sani81@gmail.com',
          is_public: false
        })
        .select()
        .single();

      if (clinicError) {
        console.error('병원 생성 실패:', clinicError.message);
        return;
      }

      clinicId = newClinic.id;
      console.log('✅ 새 마스터 병원 생성');
    }

    // users 테이블 업데이트
    const { error: userError } = await supabase
      .from('users')
      .upsert({
        id: userId,
        email: 'sani81@gmail.com',
        name: 'Master Administrator',
        role: 'master',
        clinic_id: clinicId
      }, {
        onConflict: 'id'
      });

    if (userError) {
      console.error('users 테이블 업데이트 실패:', userError.message);
    } else {
      console.log('✅ 마스터 권한 설정 완료');
    }

  } catch (error) {
    console.error('마스터 업데이트 중 오류:', error);
  }
}

async function main() {
  await updateMasterEmail();

  console.log('\n========================================');
  console.log('마스터 관리자 계정 업데이트 완료!');
  console.log('========================================');
  console.log('이메일: sani81@gmail.com');
  console.log('비밀번호: master123456');
  console.log('역할: Master Administrator');
  console.log('========================================');
  console.log('\n참고: 이메일 확인이 필요할 수 있습니다.');
  console.log('확인 이메일을 체크하거나 Supabase 대시보드에서');
  console.log('직접 이메일을 확인 처리해주세요.');
}

main();