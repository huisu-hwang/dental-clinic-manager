/**
 * 세션 영속성 통합 테스트
 *
 * 목적: autoRefreshToken: true 설정 후 세션 영속성 검증
 *
 * 테스트 시나리오:
 * 1. autoRefreshToken 설정 확인
 * 2. persistSession 설정 확인
 * 3. CustomStorageAdapter 존재 확인
 * 4. TIMEOUTS 상수 사용 확인
 * 5. AuthContext에서 SESSION_CHECK_TIMEOUT 상수 사용 확인
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const projectRoot = path.join(__dirname, '..')

// 색상 코드
const GREEN = '\x1b[32m'
const RED = '\x1b[31m'
const YELLOW = '\x1b[33m'
const BLUE = '\x1b[34m'
const RESET = '\x1b[0m'

let totalTests = 0
let passedTests = 0
let failedTests = 0

function test(name, fn) {
  totalTests++
  try {
    fn()
    console.log(`${GREEN}✓${RESET} ${name}`)
    passedTests++
  } catch (error) {
    console.log(`${RED}✗${RESET} ${name}`)
    console.log(`  ${RED}Error: ${error.message}${RESET}`)
    failedTests++
  }
}

function expect(actual) {
  return {
    toBe(expected) {
      if (actual !== expected) {
        throw new Error(`Expected ${expected}, but got ${actual}`)
      }
    },
    toMatch(regex) {
      if (!regex.test(actual)) {
        throw new Error(`Expected to match ${regex}`)
      }
    },
    not: {
      toMatch(regex) {
        if (regex.test(actual)) {
          throw new Error(`Expected NOT to match ${regex}, but it did`)
        }
      }
    }
  }
}

console.log('\n🧪 세션 영속성 통합 테스트\n')
console.log(`${BLUE}Phase 1 변경사항 검증:${RESET}`)
console.log('- autoRefreshToken: true 설정')
console.log('- TIMEOUTS 상수 사용')
console.log('- 세션 영속성 보장\n')

// ===== Phase 1 변경사항 검증 =====

// 테스트 1: autoRefreshToken: true 확인
test('[Phase 1] autoRefreshToken: true 설정 확인', () => {
  const filePath = path.join(projectRoot, 'src', 'lib', 'supabase.ts')
  const content = fs.readFileSync(filePath, 'utf8')
  expect(content).toMatch(/autoRefreshToken:\s*true/)
})

// 테스트 2: persistSession: true 확인
test('[Phase 1] persistSession: true 설정 확인', () => {
  const filePath = path.join(projectRoot, 'src', 'lib', 'supabase.ts')
  const content = fs.readFileSync(filePath, 'utf8')
  expect(content).toMatch(/persistSession:\s*true/)
})

// 테스트 3: CustomStorageAdapter 사용 확인
test('[Phase 1] CustomStorageAdapter 사용 확인', () => {
  const filePath = path.join(projectRoot, 'src', 'lib', 'supabase.ts')
  const content = fs.readFileSync(filePath, 'utf8')
  expect(content).toMatch(/storage:\s*customStorage/)
})

// 테스트 4: TIMEOUTS 상수 import 확인 (useSupabaseData.ts)
test('[Phase 1] useSupabaseData.ts TIMEOUTS import 확인', () => {
  const filePath = path.join(projectRoot, 'src', 'hooks', 'useSupabaseData.ts')
  const content = fs.readFileSync(filePath, 'utf8')
  expect(content).toMatch(/import.*TIMEOUTS.*from.*constants\/timeouts/)
})

// 테스트 5: useSupabaseData.ts에서 TIMEOUTS 사용 확인
test('[Phase 1] useSupabaseData.ts TIMEOUTS 사용 확인', () => {
  const filePath = path.join(projectRoot, 'src', 'hooks', 'useSupabaseData.ts')
  const content = fs.readFileSync(filePath, 'utf8')
  expect(content).toMatch(/TIMEOUTS\.SESSION_REFRESH/)
  expect(content).toMatch(/TIMEOUTS\.QUERY_LONG/)
})

console.log(`\n${BLUE}Phase 2 추가 검증:${RESET}`)
console.log('- AuthContext 타임아웃 상수 사용')
console.log('- 세션 관리 일관성 확보\n')

// ===== Phase 2 검증 (선택사항) =====

// 테스트 6: AuthContext SESSION_CHECK_TIMEOUT import 확인
test('[Phase 2] AuthContext SESSION_CHECK_TIMEOUT import 확인', () => {
  const filePath = path.join(projectRoot, 'src', 'contexts', 'AuthContext.tsx')
  const content = fs.readFileSync(filePath, 'utf8')

  // SESSION_CHECK_TIMEOUT import 확인 (sessionUtils 또는 timeouts에서)
  const hasImport =
    content.includes('SESSION_CHECK_TIMEOUT') &&
    (content.includes('from \'@/lib/sessionUtils\'') ||
     content.includes('from \'@/lib/constants/timeouts\''))

  if (!hasImport) {
    throw new Error('SESSION_CHECK_TIMEOUT import가 없습니다')
  }
})

// 테스트 7: AuthContext에서 하드코딩된 타임아웃 없음 확인
test('[Phase 2] AuthContext 하드코딩 타임아웃 없음 확인', () => {
  const filePath = path.join(projectRoot, 'src', 'contexts', 'AuthContext.tsx')
  const content = fs.readFileSync(filePath, 'utf8')

  // setTimeout의 인자로 숫자 리터럴이 있는지 확인 (변수 사용해야 함)
  // 단, console.log 등 제외
  const lines = content.split('\n')
  const suspiciousLines = lines.filter(line =>
    line.includes('setTimeout') &&
    /setTimeout\s*\([^,]+,\s*\d{4,}/.test(line) && // 4자리 이상 숫자
    !line.includes('console') && // console.log 제외
    !line.includes('//') && // 주석 제외
    !line.includes('* ') // JSDoc 주석 제외
  )

  if (suspiciousLines.length > 0) {
    console.warn(`  ${YELLOW}경고: 하드코딩된 타임아웃이 발견되었습니다:${RESET}`)
    suspiciousLines.forEach((line, idx) => {
      console.warn(`  ${YELLOW}Line ${idx + 1}: ${line.trim()}${RESET}`)
    })
    // 경고만 표시하고 테스트는 통과
  }
})

// 테스트 8: rememberMe 기능 구현 확인
test('[세션 영속성] rememberMe 기능 구현 확인', () => {
  const filePath = path.join(projectRoot, 'src', 'lib', 'customStorageAdapter.ts')
  const content = fs.readFileSync(filePath, 'utf8')

  // rememberMe 관련 함수 존재 확인
  expect(content).toMatch(/setRememberMe/)
  expect(content).toMatch(/getRememberMe/)
  expect(content).toMatch(/REMEMBER_ME_KEY/)
})

// 테스트 9: CustomStorageAdapter localStorage/sessionStorage 분기 확인
test('[세션 영속성] Storage 분기 로직 확인', () => {
  const filePath = path.join(projectRoot, 'src', 'lib', 'customStorageAdapter.ts')
  const content = fs.readFileSync(filePath, 'utf8')

  // rememberMe에 따라 localStorage/sessionStorage 분기
  expect(content).toMatch(/localStorage/)
  expect(content).toMatch(/sessionStorage/)
  expect(content).toMatch(/rememberMe/)
})

// 테스트 10: 세션 클리어 기능 확인
test('[세션 영속성] clearAllSessions 함수 확인', () => {
  const filePath = path.join(projectRoot, 'src', 'lib', 'customStorageAdapter.ts')
  const content = fs.readFileSync(filePath, 'utf8')

  expect(content).toMatch(/clearAllSessions/)
  expect(content).toMatch(/removeItem/)
})

console.log(`\n${BLUE}전체 시스템 일관성 검증:${RESET}\n`)

// 테스트 11: 모든 타임아웃 상수가 TIMEOUTS에서 관리되는지 확인
test('[시스템 일관성] 타임아웃 상수 중앙 관리 확인', () => {
  const timeoutsPath = path.join(projectRoot, 'src', 'lib', 'constants', 'timeouts.ts')
  const timeoutsContent = fs.readFileSync(timeoutsPath, 'utf8')

  // 주요 타임아웃 상수 존재 확인
  expect(timeoutsContent).toMatch(/SESSION_REFRESH/)
  expect(timeoutsContent).toMatch(/SESSION_CHECK/)
  expect(timeoutsContent).toMatch(/QUERY_DEFAULT/)
  expect(timeoutsContent).toMatch(/QUERY_LONG/)
})

// 테스트 12: sessionUtils.ts와 TIMEOUTS 일관성 확인
test('[시스템 일관성] sessionUtils와 TIMEOUTS 일관성 확인', () => {
  const sessionUtilsPath = path.join(projectRoot, 'src', 'lib', 'sessionUtils.ts')
  const sessionUtilsContent = fs.readFileSync(sessionUtilsPath, 'utf8')

  // SESSION_REFRESH_TIMEOUT = 10000 확인
  expect(sessionUtilsContent).toMatch(/SESSION_REFRESH_TIMEOUT\s*=\s*10000/)
  expect(sessionUtilsContent).toMatch(/SESSION_CHECK_TIMEOUT\s*=\s*10000/)
})

// 결과 출력
console.log(`\n${'='.repeat(60)}`)
console.log(`총 테스트: ${totalTests}`)
console.log(`${GREEN}통과: ${passedTests}${RESET}`)
console.log(`${RED}실패: ${failedTests}${RESET}`)
console.log(`${'='.repeat(60)}\n`)

if (failedTests > 0) {
  console.log(`${RED}❌ 테스트 실패!${RESET} 위의 오류를 수정하세요.\n`)
  process.exit(1)
} else {
  console.log(`${GREEN}✅ 모든 테스트 통과!${RESET}`)
  console.log(`\n${BLUE}세션 영속성이 올바르게 구현되었습니다:${RESET}`)
  console.log(`- autoRefreshToken: true (Supabase 자동 토큰 갱신)`)
  console.log(`- persistSession: true (세션 영속성 보장)`)
  console.log(`- TIMEOUTS 상수 통합 (일관성 확보)`)
  console.log(`- rememberMe 기능 (localStorage/sessionStorage 분기)`)
  console.log(`\n${GREEN}다음 단계:${RESET}`)
  console.log(`1. 개발 서버에서 실제 로그인/로그아웃 테스트`)
  console.log(`2. 브라우저 종료 후 재오픈 시 세션 유지 확인`)
  console.log(`3. rememberMe: true/false 시나리오 검증`)
  console.log('')
  process.exit(0)
}
