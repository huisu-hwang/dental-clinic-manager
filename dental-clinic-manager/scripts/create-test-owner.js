const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('NEXT_PUBLIC_SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 가 설정되지 않았습니다.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false }
});

const EMAIL = process.env.TEST_OWNER_EMAIL || 'testowner@test.com';
const PASSWORD = process.env.TEST_OWNER_PASSWORD || 'test1234!';
const NAME = process.env.TEST_OWNER_NAME || '테스트원장';
const CLINIC_NAME = process.env.TEST_CLINIC_NAME || '테스트치과';
const CLINIC_PHONE = '02-0000-0000';
const CLINIC_ADDRESS = '서울시 테스트구 테스트동';

async function main() {
  console.log('▶ 테스트 원장 계정 생성 시작');

  // 1) 기존 auth 사용자 확인
  const { data: listResp, error: listErr } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listErr) throw listErr;
  let authUser = listResp.users.find((u) => u.email === EMAIL);

  if (authUser) {
    console.log(`• 기존 auth 사용자 발견: ${authUser.id}`);
    // 비밀번호 재설정 + 이메일 확인
    const { error: upErr } = await supabase.auth.admin.updateUserById(authUser.id, {
      password: PASSWORD,
      email_confirm: true,
    });
    if (upErr) throw upErr;
  } else {
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email: EMAIL,
      password: PASSWORD,
      email_confirm: true,
      user_metadata: { name: NAME, role: 'owner' },
    });
    if (createErr) throw createErr;
    authUser = created.user;
    console.log(`• auth 사용자 생성 완료: ${authUser.id}`);
  }

  // 2) 병원 레코드 확보 (이메일 기준 upsert)
  const { data: existingClinic } = await supabase
    .from('clinics')
    .select('id, name')
    .eq('email', EMAIL)
    .maybeSingle();

  let clinicId;
  if (existingClinic) {
    clinicId = existingClinic.id;
    console.log(`• 기존 병원 사용: ${existingClinic.name} (${clinicId})`);
  } else {
    const { data: clinic, error: clinicErr } = await supabase
      .from('clinics')
      .insert({
        name: CLINIC_NAME,
        owner_name: NAME,
        address: CLINIC_ADDRESS,
        phone: CLINIC_PHONE,
        email: EMAIL,
        is_public: false,
      })
      .select('id')
      .single();
    if (clinicErr) throw clinicErr;
    clinicId = clinic.id;
    console.log(`• 병원 생성 완료: ${clinicId}`);
  }

  // 3) users 테이블 upsert (role=owner, status=active)
  const { error: userErr } = await supabase
    .from('users')
    .upsert(
      {
        id: authUser.id,
        email: EMAIL,
        name: NAME,
        role: 'owner',
        status: 'active',
        clinic_id: clinicId,
        approved_at: new Date().toISOString(),
      },
      { onConflict: 'id' }
    );
  if (userErr) throw userErr;

  console.log('\n========================================');
  console.log('✅ 테스트 원장 계정 준비 완료');
  console.log('----------------------------------------');
  console.log(`이메일   : ${EMAIL}`);
  console.log(`비밀번호 : ${PASSWORD}`);
  console.log(`이름     : ${NAME}`);
  console.log(`역할     : owner (대표원장)`);
  console.log(`병원     : ${CLINIC_NAME} (${clinicId})`);
  console.log(`User ID  : ${authUser.id}`);
  console.log('========================================');
}

main().catch((err) => {
  console.error('❌ 오류:', err);
  process.exit(1);
});
