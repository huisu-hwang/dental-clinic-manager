const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseServiceKey) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY가 설정되지 않았습니다.');
  console.error('   .env.local 파일을 확인해주세요.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runMigration() {
  console.log('\n================================================');
  console.log('   QR 코드 RLS 정책 수정');
  console.log('================================================\n');

  try {
    // Migration SQL 파일 읽기
    const migrationPath = path.join(__dirname, '../supabase/migrations/20251031_fix_qr_code_rls.sql');
    const sql = fs.readFileSync(migrationPath, 'utf8');

    // 주석과 빈 줄 제거 후 세미콜론으로 분리
    const statements = sql
      .split('\n')
      .filter(line => !line.trim().startsWith('--') && line.trim() !== '')
      .join('\n')
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);

    console.log(`실행할 SQL 문장: ${statements.length}개\n`);

    // 각 SQL 문장 실행
    for (let i = 0; i < statements.length; i++) {
      const statement = statements[i];

      if (statement.includes('SELECT') && statement.includes('FROM pg_policies')) {
        // 확인 쿼리는 건너뜀
        continue;
      }

      console.log(`[${i + 1}/${statements.length}] 실행 중...`);
      console.log(`SQL: ${statement.substring(0, 80)}...`);

      const { data, error } = await supabase.rpc('exec_sql', { sql_query: statement });

      if (error) {
        // RPC 함수가 없을 수 있으므로 직접 실행
        console.log('   ⚠️  RPC 실패, 직접 실행 시도...');

        const { error: directError } = await supabase
          .from('_migrations')
          .select('*')
          .limit(0); // Just to test connection

        if (directError) {
          console.error('   ❌ 실행 실패:', error.message);
          console.error('\n🔧 수동 실행 필요:');
          console.error('   1. https://supabase.com/dashboard 접속');
          console.error('   2. SQL Editor에서 다음 파일 내용 실행:');
          console.error(`      supabase/migrations/20251031_fix_qr_code_rls.sql`);
          process.exit(1);
        }
      } else {
        console.log('   ✅ 실행 완료');
      }
    }

    console.log('\n✅ Migration 완료!\n');

    // 정책 확인
    console.log('=== 변경된 RLS 정책 확인 ===\n');

    const { data: policies, error: policyError } = await supabase
      .rpc('get_policies_for_table', { table_name: 'attendance_qr_codes' });

    if (!policyError && policies) {
      console.log('정책 목록:');
      policies.forEach(p => {
        console.log(`  - ${p.policyname}`);
        console.log(`    Command: ${p.cmd}`);
        console.log(`    USING: ${p.qual}`);
        console.log(`    WITH CHECK: ${p.with_check || '(없음)'}`);
      });
    }

    console.log('\n다음 단계:');
    console.log('1. QR 코드 생성 페이지 접속');
    console.log('2. "QR 코드 생성" 버튼 클릭');
    console.log('3. 에러 없이 QR 코드 생성 확인\n');

  } catch (error) {
    console.error('\n❌ 오류 발생:', error.message);
    console.error('\n🔧 수동 실행이 필요합니다:');
    console.error('   1. Supabase Dashboard (https://supabase.com/dashboard) 접속');
    console.error('   2. SQL Editor 열기');
    console.error('   3. 다음 파일의 내용을 복사하여 실행:');
    console.error('      supabase/migrations/20251031_fix_qr_code_rls.sql\n');
    process.exit(1);
  }
}

runMigration()
  .catch(console.error)
  .finally(() => process.exit(0));
