/**
 * Supabase 마이그레이션 실행 스크립트
 *
 * 사용법: node scripts/run-migration.js <migration-file-name>
 * 예: node scripts/run-migration.js 20250123_create_protocol_tables.sql
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// .env.local 파일 로드
require('dotenv').config({ path: '.env.local' });

async function runMigration() {
  const migrationFile = process.argv[2];

  if (!migrationFile) {
    console.error('❌ 마이그레이션 파일명을 입력해주세요.');
    console.log('사용법: node scripts/run-migration.js <migration-file-name>');
    console.log('예: node scripts/run-migration.js 20250123_create_protocol_tables.sql');
    process.exit(1);
  }

  // Supabase 설정
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    console.error('❌ NEXT_PUBLIC_SUPABASE_URL이 .env.local에 설정되어 있지 않습니다.');
    process.exit(1);
  }

  if (!supabaseServiceKey) {
    console.error('❌ SUPABASE_SERVICE_ROLE_KEY가 .env.local에 설정되어 있지 않습니다.');
    console.log('\n📝 Supabase 대시보드에서 Service Role Key를 가져와서 .env.local에 추가해주세요:');
    console.log('   SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here\n');

    console.log('🔗 Service Role Key 찾는 방법:');
    console.log('   1. https://supabase.com/dashboard 로그인');
    console.log('   2. 프로젝트 선택');
    console.log('   3. Settings > API > Project API keys > service_role 복사\n');

    console.log('⚠️  또는 Supabase 대시보드의 SQL Editor에서 직접 실행하세요:');
    console.log(`   파일 위치: supabase/migrations/${migrationFile}\n`);

    process.exit(1);
  }

  // Supabase 클라이언트 생성 (Service Role 사용)
  const supabase = createClient(supabaseUrl, supabaseServiceKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });

  // 마이그레이션 파일 읽기
  const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', migrationFile);

  if (!fs.existsSync(migrationPath)) {
    console.error(`❌ 마이그레이션 파일을 찾을 수 없습니다: ${migrationPath}`);
    process.exit(1);
  }

  const sql = fs.readFileSync(migrationPath, 'utf8');

  console.log(`🚀 마이그레이션 실행 중: ${migrationFile}\n`);

  try {
    // SQL 실행
    const { data, error } = await supabase.rpc('exec_sql', { sql_query: sql });

    if (error) {
      // exec_sql 함수가 없을 수 있으므로, 직접 실행 시도
      console.log('⚠️  exec_sql 함수를 사용할 수 없습니다. 대안 방법 사용...\n');

      // SQL을 줄바꿈과 주석을 기준으로 분할하여 실행
      const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s && !s.startsWith('--') && s !== '');

      console.log(`📝 ${statements.length}개의 SQL 문장을 실행합니다...\n`);

      // 참고: Supabase 클라이언트는 직접 SQL 실행을 지원하지 않습니다.
      // 대신 Supabase 대시보드의 SQL Editor를 사용해야 합니다.
      console.error('❌ Supabase 클라이언트로는 직접 DDL 문을 실행할 수 없습니다.\n');
      console.log('✅ 대신 다음 방법 중 하나를 사용하세요:\n');
      console.log('1. Supabase 대시보드 SQL Editor 사용:');
      console.log('   - https://supabase.com/dashboard 로그인');
      console.log('   - 프로젝트 선택');
      console.log('   - SQL Editor 메뉴');
      console.log(`   - ${migrationPath} 파일의 내용을 복사하여 붙여넣기 후 실행\n`);

      console.log('2. Supabase CLI 설치 후 사용:');
      console.log('   - npm install -g supabase');
      console.log('   - supabase link --project-ref beahjntkmkfhpcbhfnrr');
      console.log('   - supabase db push\n');

      process.exit(1);
    }

    console.log('✅ 마이그레이션이 성공적으로 완료되었습니다!\n');
    console.log(data);

  } catch (err) {
    console.error('❌ 마이그레이션 실행 중 오류 발생:');
    console.error(err);
    process.exit(1);
  }
}

runMigration();
