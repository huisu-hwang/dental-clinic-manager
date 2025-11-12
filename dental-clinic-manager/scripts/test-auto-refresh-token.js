/**
 * autoRefreshToken 활성화 테스트
 *
 * 목적: Supabase 클라이언트가 autoRefreshToken: true로 설정되었는지 검증
 *
 * 참고:
 * - Supabase 공식 문서: 미들웨어에서 토큰 갱신 권장
 * - @supabase/ssr 문서: 자동 갱신이 기본 동작
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

console.log('\n🧪 autoRefreshToken 활성화 테스트\n')

// 테스트 1: supabase.ts 파일에서 autoRefreshToken: true 확인
test('supabase.ts는 autoRefreshToken: true로 설정되어야 함', () => {
  const filePath = path.join(projectRoot, 'src', 'lib', 'supabase.ts')
  const content = fs.readFileSync(filePath, 'utf8')

  // autoRefreshToken: true 패턴
  const pattern = /autoRefreshToken:\s*true/
  expect(content).toMatch(pattern)
})

// 테스트 2: autoRefreshToken: false가 없어야 함
test('supabase.ts는 autoRefreshToken: false를 사용하지 않아야 함', () => {
  const filePath = path.join(projectRoot, 'src', 'lib', 'supabase.ts')
  const content = fs.readFileSync(filePath, 'utf8')

  // autoRefreshToken: false 패턴 (있으면 안 됨)
  const pattern = /autoRefreshToken:\s*false/
  expect(content).not.toMatch(pattern)
})

// 테스트 3: persistSession: true 확인
test('supabase.ts는 persistSession: true로 설정되어야 함', () => {
  const filePath = path.join(projectRoot, 'src', 'lib', 'supabase.ts')
  const content = fs.readFileSync(filePath, 'utf8')

  // persistSession: true 패턴
  const pattern = /persistSession:\s*true/
  expect(content).toMatch(pattern)
})

// 테스트 4: 주석에 변경 이유 명시
test('supabase.ts에 autoRefreshToken 활성화 이유가 명시되어야 함', () => {
  const filePath = path.join(projectRoot, 'src', 'lib', 'supabase.ts')
  const content = fs.readFileSync(filePath, 'utf8')

  // "autoRefreshToken" 또는 "자동 갱신" 관련 주석이 있어야 함
  const hasComment =
    content.includes('autoRefreshToken') ||
    content.includes('자동 갱신') ||
    content.includes('auto refresh')

  if (!hasComment) {
    throw new Error('autoRefreshToken 설정에 대한 설명 주석이 필요합니다')
  }
})

// 결과 출력
console.log(`\n${'='.repeat(50)}`)
console.log(`총 테스트: ${totalTests}`)
console.log(`${GREEN}통과: ${passedTests}${RESET}`)
console.log(`${RED}실패: ${failedTests}${RESET}`)
console.log(`${'='.repeat(50)}\n`)

if (failedTests > 0) {
  console.log(`${RED}테스트 실패!${RESET} 위의 오류를 수정하세요.\n`)
  process.exit(1)
} else {
  console.log(`${GREEN}모든 테스트 통과!${RESET}\n`)
  process.exit(0)
}
