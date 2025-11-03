const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Supabase 환경 변수가 설정되지 않았습니다.');
  process.exit(1);
}

// Service Role Key로 Admin 클라이언트 생성
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function restoreTestUser() {
  console.log('테스트 사용자 복구 중...\n');

  const testEmail = 'whitedc0902@gmail.com';
  const originalPassword = 'gkdisclrhk0902@';

  try {
    // 1. 사용자 찾기
    console.log('1. 사용자 찾기...');
    const { data: existingUsers, error: listError } = await supabase.auth.admin.listUsers();

    if (listError) {
      console.error('사용자 목록 조회 실패:', listError.message);
      return;
    }

    const existingUser = existingUsers.users.find(u => u.email === testEmail);

    if (!existingUser) {
      console.log('❌ 사용자를 찾을 수 없습니다.');
      return;
    }

    console.log('✅ 사용자 발견:', existingUser.id);
    const userId = existingUser.id;

    // 2. 비밀번호 복구
    console.log('\n2. 비밀번호 복구 (gkdisclrhk0902@)...');
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      userId,
      {
        password: originalPassword,
        email_confirm: true
      }
    );

    if (updateError) {
      console.error('비밀번호 복구 실패:', updateError.message);
      return;
    }

    console.log('✅ 비밀번호 복구 완료');

    // 3. users 테이블에서 권한을 원장(owner)으로 변경
    console.log('\n3. 권한을 원장으로 변경...');
    const { error: roleUpdateError } = await supabase
      .from('users')
      .update({
        role: 'owner',  // 원장 권한
        status: 'active'
      })
      .eq('id', userId);

    if (roleUpdateError) {
      console.error('권한 변경 오류:', roleUpdateError.message);
    } else {
      console.log('✅ 권한을 원장으로 변경 완료');
    }

    // 4. 로그인 테스트
    console.log('\n4. 로그인 테스트...');
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const testClient = createClient(supabaseUrl, anonKey);

    const { data: loginData, error: loginError } = await testClient.auth.signInWithPassword({
      email: testEmail,
      password: originalPassword
    });

    if (loginError) {
      console.error('❌ 로그인 테스트 실패:', loginError.message);
    } else {
      console.log('✅ 로그인 테스트 성공!');

      // 사용자 정보 확인
      const { data: userData } = await supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (userData) {
        console.log('\n현재 사용자 정보:');
        console.log('- 이름:', userData.name);
        console.log('- 역할:', userData.role);
        console.log('- 병원 ID:', userData.clinic_id);
      }

      await testClient.auth.signOut();
    }

    console.log('\n========================================');
    console.log('계정 복구 완료!');
    console.log('========================================');
    console.log('이메일:', testEmail);
    console.log('비밀번호:', originalPassword);
    console.log('역할: owner (원장)');
    console.log('========================================');

  } catch (error) {
    console.error('오류 발생:', error);
  }
}

restoreTestUser();
