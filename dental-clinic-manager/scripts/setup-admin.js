const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Supabase 환경 변수가 설정되지 않았습니다.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function setupAdmin() {
  try {
    console.log('마스터 Admin 계정 설정 중...');

    // 먼저 기존 사용자가 있는지 확인
    const { data: existingUsers, error: searchError } = await supabase
      .from('users')
      .select('*')
      .eq('email', 'sani81@gmail.com');

    if (searchError && searchError.code !== 'PGRST116') {
      console.error('사용자 검색 오류:', searchError);
      return;
    }

    // Auth에서 사용자 생성 또는 업데이트
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: 'sani81@gmail.com',
      password: '123456',
      email_confirm: true,
      user_metadata: {
        name: 'Master Admin',
        role: 'admin'
      }
    });

    if (authError) {
      if (authError.message.includes('already exists')) {
        // 기존 사용자가 있으면 비밀번호 업데이트
        console.log('기존 사용자 발견, 비밀번호 업데이트 중...');

        const { data: users, error: listError } = await supabase.auth.admin.listUsers();
        if (listError) {
          console.error('사용자 목록 조회 오류:', listError);
          return;
        }

        const existingUser = users.users.find(u => u.email === 'sani81@gmail.com');
        if (existingUser) {
          const { error: updateError } = await supabase.auth.admin.updateUserById(
            existingUser.id,
            {
              password: '123456',
              email_confirm: true,
              user_metadata: {
                name: 'Master Admin',
                role: 'admin'
              }
            }
          );

          if (updateError) {
            console.error('비밀번호 업데이트 오류:', updateError);
            return;
          }
          console.log('✅ 비밀번호가 성공적으로 업데이트되었습니다.');
        }
      } else {
        console.error('Auth 사용자 생성 오류:', authError);
        return;
      }
    } else {
      console.log('✅ Auth 사용자가 성공적으로 생성되었습니다.');
    }

    // users 테이블에 마스터 관리자 정보 업서트
    const userId = authData?.user?.id || (await supabase.auth.admin.listUsers()).data.users.find(u => u.email === 'sani81@gmail.com')?.id;

    if (userId) {
      // 먼저 기본 병원 생성
      const { data: clinicData, error: clinicError } = await supabase
        .from('clinics')
        .upsert({
          id: 'master-clinic',
          name: '마스터 병원',
          owner_name: 'Master Admin',
          address: '관리자용',
          phone: '000-0000-0000',
          email: 'sani81@gmail.com',
          is_public: false
        }, {
          onConflict: 'id'
        })
        .select()
        .single();

      if (clinicError && clinicError.code !== '23505') {
        console.error('병원 생성 오류:', clinicError);
      } else {
        console.log('✅ 마스터 병원 설정 완료');
      }

      // users 테이블에 정보 업서트
      const { error: userError } = await supabase
        .from('users')
        .upsert({
          id: userId,
          email: 'sani81@gmail.com',
          name: 'Master Admin',
          role: 'admin',
          clinic_id: 'master-clinic',
          user_id: 'admin'
        }, {
          onConflict: 'id'
        });

      if (userError) {
        console.error('Users 테이블 업데이트 오류:', userError);
      } else {
        console.log('✅ Users 테이블 업데이트 완료');
      }
    }

    console.log('\n========================================');
    console.log('마스터 Admin 계정 설정 완료!');
    console.log('========================================');
    console.log('이메일: sani81@gmail.com');
    console.log('비밀번호: 123456');
    console.log('역할: Master Admin');
    console.log('========================================\n');

  } catch (error) {
    console.error('설정 중 오류 발생:', error);
  }
}

setupAdmin();