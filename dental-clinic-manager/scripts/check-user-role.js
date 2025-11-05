/**
 * Check User Role Script
 * 현재 로그인한 사용자의 role을 확인하는 스크립트
 */

const { createClient } = require('@supabase/supabase-js')
require('dotenv').config({ path: '.env.local' })

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Supabase 환경 변수가 설정되지 않았습니다.')
  console.log('NEXT_PUBLIC_SUPABASE_URL:', supabaseUrl ? '✅' : '❌')
  console.log('NEXT_PUBLIC_SUPABASE_ANON_KEY:', supabaseKey ? '✅' : '❌')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkUserRole(userEmail) {
  console.log('\n🔍 사용자 Role 확인 중...\n')

  try {
    // 이메일로 사용자 조회
    const { data: users, error } = await supabase
      .from('users')
      .select('id, email, name, role, status, clinic_id')
      .eq('email', userEmail)

    if (error) {
      console.error('❌ 에러:', error.message)
      return
    }

    if (!users || users.length === 0) {
      console.log(`❌ "${userEmail}" 사용자를 찾을 수 없습니다.`)
      return
    }

    const user = users[0]

    console.log('✅ 사용자 정보:')
    console.log('─'.repeat(50))
    console.log(`📧 이메일: ${user.email}`)
    console.log(`👤 이름: ${user.name}`)
    console.log(`🏷️  Role: ${user.role}`)
    console.log(`📊 상태: ${user.status}`)
    console.log(`🏥 병원 ID: ${user.clinic_id || '없음'}`)
    console.log('─'.repeat(50))

    // Role 타입 확인
    const validRoles = ['master_admin', 'owner', 'vice_director', 'manager', 'team_leader', 'staff']
    const isValidRole = validRoles.includes(user.role)

    console.log('\n📋 Role 검증:')
    if (isValidRole) {
      console.log(`✅ 유효한 role입니다: "${user.role}"`)
    } else {
      console.log(`❌ 유효하지 않은 role입니다: "${user.role}"`)
      console.log(`   유효한 role 목록:`, validRoles.join(', '))
    }

    // 삭제 권한 확인
    const canDelete = user.role === 'owner' || user.role === 'manager'
    console.log('\n🗑️  삭제 권한:')
    if (canDelete) {
      console.log(`✅ 삭제 권한이 있습니다 (role: ${user.role})`)
    } else {
      console.log(`❌ 삭제 권한이 없습니다 (role: ${user.role})`)
      console.log('   삭제 권한이 있는 role: owner, manager')
    }

    // 취소된 계약서 확인
    if (user.clinic_id) {
      console.log('\n📄 취소된 근로계약서 확인 중...')
      const { data: contracts, error: contractError } = await supabase
        .from('employment_contracts')
        .select('id, status, contract_data')
        .eq('clinic_id', user.clinic_id)
        .eq('status', 'cancelled')

      if (contractError) {
        console.error('❌ 계약서 조회 에러:', contractError.message)
      } else {
        console.log(`   취소된 계약서: ${contracts.length}개`)
        if (contracts.length > 0) {
          console.log('\n   목록:')
          contracts.forEach((contract, index) => {
            const employeeName = contract.contract_data?.employee_name || '이름 없음'
            console.log(`   ${index + 1}. ${employeeName} (ID: ${contract.id})`)
          })
        } else {
          console.log('   ⚠️  취소된 계약서가 없습니다.')
          console.log('   → 삭제 버튼이 표시되지 않는 이유일 수 있습니다.')
        }
      }
    }

    console.log('\n')
  } catch (err) {
    console.error('❌ 예외 발생:', err.message)
  }
}

// 사용자 이메일을 인자로 받기
const userEmail = process.argv[2]

if (!userEmail) {
  console.log('\n사용법:')
  console.log('  node scripts/check-user-role.js <사용자_이메일>')
  console.log('\n예시:')
  console.log('  node scripts/check-user-role.js owner@example.com')
  console.log('\n')
  process.exit(1)
}

checkUserRole(userEmail)
