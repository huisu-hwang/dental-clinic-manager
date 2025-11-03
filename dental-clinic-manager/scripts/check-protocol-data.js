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

async function checkProtocolData() {
  console.log('프로토콜 데이터 확인 중...\n');

  try {
    // 1. Get the test protocol
    console.log('1. RLS 테스트 프로토콜 찾기...');
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
    console.log('   현재 버전 ID:', protocol.current_version_id);
    console.log('   상태:', protocol.status);
    console.log('   카테고리 ID:', protocol.category_id);

    // 2. Get protocol version
    if (protocol.current_version_id) {
      console.log('\n2. 현재 버전 정보 확인...');
      const { data: version, error: versionError } = await supabase
        .from('protocol_versions')
        .select('*')
        .eq('id', protocol.current_version_id)
        .single();

      if (versionError) {
        console.error('버전 조회 실패:', versionError);
      } else {
        console.log('✅ 버전 정보:');
        console.log('   버전 ID:', version.id);
        console.log('   버전 번호:', version.version_number);
        console.log('   변경 유형:', version.change_type);
        console.log('   변경 요약:', version.change_summary);
        console.log('   생성일:', version.created_at);
        console.log('   Content 길이:', version.content ? version.content.length : 0);
        console.log('   Content 미리보기:', version.content ? version.content.substring(0, 200) : '(비어있음)');
      }

      // 3. Get protocol steps
      console.log('\n3. 프로토콜 단계 확인...');
      const { data: steps, error: stepsError } = await supabase
        .from('protocol_steps')
        .select('*')
        .eq('protocol_id', protocol.id)
        .eq('version_id', protocol.current_version_id)
        .order('step_order', { ascending: true });

      if (stepsError) {
        console.error('단계 조회 실패:', stepsError);
      } else {
        console.log(`✅ 총 ${steps.length}개의 단계 발견`);
        steps.forEach((step, index) => {
          console.log(`\n   단계 ${index + 1}:`);
          console.log('      ID:', step.id);
          console.log('      제목:', step.title);
          console.log('      순서:', step.step_order);
          console.log('      선택사항:', step.is_optional);
          console.log('      Content 길이:', step.content ? step.content.length : 0);
          console.log('      Content 미리보기:', step.content ? step.content.substring(0, 100) : '(비어있음)');
          console.log('      참고사항:', step.notes || '(없음)');
        });
      }
    } else {
      console.log('\n❌ 현재 버전이 설정되지 않았습니다.');
    }

    // 4. Get all versions for this protocol
    console.log('\n4. 모든 버전 확인...');
    const { data: allVersions, error: allVersionsError } = await supabase
      .from('protocol_versions')
      .select('id, version_number, change_type, created_at')
      .eq('protocol_id', protocol.id)
      .order('created_at', { ascending: false });

    if (allVersionsError) {
      console.error('전체 버전 조회 실패:', allVersionsError);
    } else {
      console.log(`✅ 총 ${allVersions.length}개의 버전 발견:`);
      allVersions.forEach(v => {
        console.log(`   - v${v.version_number} (${v.change_type}) - ${v.created_at}${v.id === protocol.current_version_id ? ' ← 현재' : ''}`);
      });
    }

  } catch (error) {
    console.error('오류 발생:', error);
  }
}

checkProtocolData();
