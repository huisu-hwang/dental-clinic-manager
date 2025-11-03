const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Supabase 환경 변수가 설정되지 않았습니다.');
  console.error('URL:', supabaseUrl ? '설정됨' : '없음');
  console.error('Service Key:', supabaseServiceKey ? '설정됨' : '없음');
  process.exit(1);
}

// Service Role Key로 Admin 클라이언트 생성
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function createTestUser() {
  console.log('테스트 사용자 생성 중...\n');

  const testEmail = 'whitedc0902@gmail.com';
  const testPassword = 'gdisclrhk0902@';

  try {
    // 1. 먼저 기존 사용자 확인
    console.log('1. 기존 사용자 확인...');
    const { data: existingUsers, error: listError } = await supabase.auth.admin.listUsers();

    if (listError) {
      console.error('사용자 목록 조회 실패:', listError.message);
      return;
    }

    const existingUser = existingUsers.users.find(u => u.email === testEmail);

    let userId;

    if (existingUser) {
      console.log('✅ 기존 사용자 발견:', existingUser.id);
      userId = existingUser.id;

      // 비밀번호 재설정
      console.log('\n2. 비밀번호 재설정...');
      const { data: updateData, error: updateError } = await supabase.auth.admin.updateUserById(
        userId,
        {
          password: testPassword,
          email_confirm: true // 이메일 확인 완료 설정
        }
      );

      if (updateError) {
        console.error('비밀번호 재설정 실패:', updateError.message);
        return;
      }

      console.log('✅ 비밀번호 재설정 완료');
    } else {
      // 2. Admin API로 사용자 생성 (이메일 확인 불필요)
      console.log('2. 새 사용자 생성...');
      const { data: createData, error: createError } = await supabase.auth.admin.createUser({
        email: testEmail,
        password: testPassword,
        email_confirm: true, // 이메일 확인 자동 완료
        user_metadata: {
          name: '테스트 사용자',
          role: 'admin'
        }
      });

      if (createError) {
        console.error('사용자 생성 실패:', createError.message);
        return;
      }

      userId = createData.user.id;
      console.log('✅ 사용자 생성 완료:', userId);
    }

    // 3. 테스트 병원 생성 또는 확인
    console.log('\n3. 테스트 병원 확인/생성...');
    const { data: existingClinic } = await supabase
      .from('clinics')
      .select('id')
      .eq('email', testEmail)
      .single();

    let clinicId;

    if (existingClinic) {
      clinicId = existingClinic.id;
      console.log('기존 테스트 병원 사용:', clinicId);
    } else {
      const { data: clinicData, error: clinicError } = await supabase
        .from('clinics')
        .insert({
          name: '테스트 치과',
          owner_name: '테스트 사용자',
          address: '서울시 테스트구 테스트동',
          phone: '010-0000-0000',
          email: testEmail,
          is_public: false
        })
        .select()
        .single();

      if (clinicError) {
        console.error('병원 생성 오류:', clinicError.message);
        // 병원 생성 실패해도 계속 진행
        clinicId = null;
      } else {
        clinicId = clinicData.id;
        console.log('✅ 테스트 병원 생성 완료:', clinicId);
      }
    }

    // 4. users 테이블에 사용자 정보 저장/업데이트
    console.log('\n4. 사용자 정보 저장/업데이트...');

    const { data: existingUserRecord } = await supabase
      .from('users')
      .select('id')
      .eq('id', userId)
      .single();

    if (existingUserRecord) {
      // 업데이트
      const { error: updateError } = await supabase
        .from('users')
        .update({
          email: testEmail,
          name: '테스트 사용자',
          role: 'admin',
          clinic_id: clinicId,
          status: 'active'
        })
        .eq('id', userId);

      if (updateError) {
        console.error('사용자 정보 업데이트 오류:', updateError.message);
      } else {
        console.log('✅ 사용자 정보 업데이트 완료');
      }
    } else {
      // 삽입
      const { error: insertError } = await supabase
        .from('users')
        .insert({
          id: userId,
          email: testEmail,
          name: '테스트 사용자',
          role: 'admin',
          clinic_id: clinicId,
          status: 'active'
        });

      if (insertError) {
        console.error('사용자 정보 저장 오류:', insertError.message);
      } else {
        console.log('✅ 사용자 정보 저장 완료');
      }
    }

    // 5. 로그인 테스트
    console.log('\n5. 로그인 테스트...');
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const testClient = createClient(supabaseUrl, anonKey);

    const { data: loginData, error: loginError } = await testClient.auth.signInWithPassword({
      email: testEmail,
      password: testPassword
    });

    if (loginError) {
      console.error('❌ 로그인 테스트 실패:', loginError.message);
    } else {
      console.log('✅ 로그인 테스트 성공!');
      await testClient.auth.signOut();
    }

    console.log('\n========================================');
    console.log('테스트 계정 설정 완료!');
    console.log('========================================');
    console.log('이메일:', testEmail);
    console.log('비밀번호:', testPassword);
    console.log('역할: admin');
    console.log('========================================');

  } catch (error) {
    console.error('오류 발생:', error);
  }
}

createTestUser();
