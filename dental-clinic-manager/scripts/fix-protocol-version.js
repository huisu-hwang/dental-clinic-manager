const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function fixProtocolVersion() {
  console.log('프로토콜 버전 연결 수정 중...\n');

  try {
    // 1. Get the test protocol
    const { data: protocols, error: protocolError } = await supabase
      .from('protocols')
      .select('*')
      .eq('title', 'RLS 테스트 프로토콜')
      .is('deleted_at', null);

    if (protocolError) {
      console.error('프로토콜 조회 실패:', protocolError);
      return;
    }

    if (!protocols || protocols.length === 0) {
      console.log('❌ 프로토콜을 찾을 수 없습니다.');
      return;
    }

    const protocol = protocols[0];
    console.log('✅ 프로토콜 발견:');
    console.log('   ID:', protocol.id);
    console.log('   제목:', protocol.title);
    console.log('   현재 버전 ID:', protocol.current_version_id || '(설정되지 않음)');

    // 2. Get the latest version for this protocol
    const { data: versions, error: versionsError } = await supabase
      .from('protocol_versions')
      .select('*')
      .eq('protocol_id', protocol.id)
      .order('created_at', { ascending: false })
      .limit(1);

    if (versionsError) {
      console.error('버전 조회 실패:', versionsError);
      return;
    }

    if (!versions || versions.length === 0) {
      console.log('❌ 이 프로토콜의 버전을 찾을 수 없습니다.');
      return;
    }

    const latestVersion = versions[0];
    console.log('\n✅ 최신 버전 발견:');
    console.log('   버전 ID:', latestVersion.id);
    console.log('   버전 번호:', latestVersion.version_number);
    console.log('   생성일:', latestVersion.created_at);

    // 3. Update the protocol's current_version_id
    console.log('\n프로토콜의 current_version_id 업데이트 중...');
    const { error: updateError } = await supabase
      .from('protocols')
      .update({ current_version_id: latestVersion.id })
      .eq('id', protocol.id);

    if (updateError) {
      console.error('❌ 업데이트 실패:', updateError);
      return;
    }

    console.log('✅ current_version_id 업데이트 완료!');
    console.log('\n========================================');
    console.log('프로토콜 수정 완료!');
    console.log('========================================');
    console.log('프로토콜:', protocol.title);
    console.log('현재 버전:', latestVersion.version_number);
    console.log('========================================');

  } catch (error) {
    console.error('오류 발생:', error);
  }
}

fixProtocolVersion();
