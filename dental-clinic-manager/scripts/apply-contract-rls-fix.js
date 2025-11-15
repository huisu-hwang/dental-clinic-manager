/**
 * 근로계약서 RLS 정책 수정 스크립트
 * Supabase에 마이그레이션 적용
 */

require('dotenv').config({ path: '.env.local' })
const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ 환경 변수가 설정되지 않았습니다.')
  console.error('NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '✅' : '❌')
  console.error('SUPABASE_SERVICE_ROLE_KEY:', supabaseServiceKey ? '✅' : '❌')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function applyMigration() {
  console.log('🔧 근로계약서 RLS 정책 수정 중...\n')

  try {
    // 마이그레이션 파일 읽기
    const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', '20251115_fix_contract_rls_permissions.sql')

    if (!fs.existsSync(migrationPath)) {
      console.error('❌ 마이그레이션 파일을 찾을 수 없습니다:', migrationPath)
      process.exit(1)
    }

    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8')
    console.log('📄 마이그레이션 파일 로드 완료\n')

    // SQL을 개별 명령어로 분리 (주석 제거 및 빈 줄 제거)
    const sqlCommands = migrationSQL
      .split('\n')
      .filter(line => !line.trim().startsWith('--') && line.trim() !== '')
      .join('\n')
      .split(';')
      .map(cmd => cmd.trim())
      .filter(cmd => cmd.length > 0)

    console.log(`📋 총 ${sqlCommands.length}개의 SQL 명령어 실행 예정\n`)

    // 각 명령어 실행
    for (let i = 0; i < sqlCommands.length; i++) {
      const cmd = sqlCommands[i]

      // 명령어 타입 파악
      let cmdType = 'UNKNOWN'
      if (cmd.includes('DROP POLICY')) cmdType = 'DROP POLICY'
      else if (cmd.includes('CREATE POLICY')) cmdType = 'CREATE POLICY'
      else if (cmd.includes('COMMENT ON POLICY')) cmdType = 'COMMENT'

      console.log(`${i + 1}/${sqlCommands.length} ${cmdType} 실행 중...`)

      let result
      try {
        result = await supabase.rpc('exec_sql', {
          sql: cmd + ';'
        })
      } catch (e) {
        result = { error: { message: 'RPC not available' } }
      }

      const { error } = result

      if (error) {
        if (error.message === 'RPC not available') {
          console.log('\n⚠️ Supabase RPC 함수를 사용할 수 없습니다.')
          console.log('수동으로 Supabase Dashboard에서 실행해주세요.\n')
          console.log('📋 실행할 SQL:')
          console.log('='.repeat(80))
          console.log(migrationSQL)
          console.log('='.repeat(80))
          console.log('\n📌 실행 방법:')
          console.log('1. https://supabase.com/dashboard 접속')
          console.log('2. 프로젝트 선택')
          console.log('3. SQL Editor 클릭')
          console.log('4. 위 SQL 복사 & 붙여넣기')
          console.log('5. Run 버튼 클릭\n')
          return
        }

        console.error(`❌ 실패: ${error.message}`)

        // policy 이미 존재하지 않는 경우는 무시
        if (!error.message.includes('does not exist')) {
          throw error
        } else {
          console.log('   (이미 삭제됨 - 무시)\n')
        }
      } else {
        console.log('   ✅ 완료\n')
      }
    }

    console.log('✅ 근로계약서 RLS 정책이 성공적으로 수정되었습니다!\n')
    console.log('📋 변경 사항:')
    console.log('  - 부원장/매니저는 더 이상 다른 직원의 계약서를 볼 수 없습니다')
    console.log('  - 원장과 계약 당사자만 계약서에 접근할 수 있습니다')
    console.log('  - 계약서 생성은 원장만 가능합니다\n')

  } catch (error) {
    console.error('❌ 오류 발생:', error.message)
    console.log('\n수동으로 Supabase Dashboard에서 마이그레이션 파일을 실행해주세요.')
    console.log('파일 위치: supabase/migrations/20251115_fix_contract_rls_permissions.sql')
    process.exit(1)
  }
}

applyMigration()
