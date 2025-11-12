/**
 * 타임아웃 상수 통합 테스트
 *
 * 목적: 하드코딩된 타임아웃 값을 상수로 통합했는지 검증
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
    toBeDefined() {
      if (actual === undefined || actual === null) {
        throw new Error('Expected value to be defined')
      }
    },
    toMatch(regex) {
      if (!regex.test(actual)) {
        throw new Error(`Expected to match ${regex}, but got ${actual}`)
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

console.log('\n🧪 타임아웃 상수 통합 테스트\n')

// 테스트 1: 타임아웃 상수 파일이 존재하는가?
test('타임아웃 상수 파일이 존재해야 함', () => {
  const filePath = path.join(projectRoot, 'src', 'lib', 'constants', 'timeouts.ts')
  const exists = fs.existsSync(filePath)
  if (!exists) {
    throw new Error(`파일이 존재하지 않음: ${filePath}`)
  }
})

// 테스트 2: TIMEOUTS 상수가 정의되어 있는가?
test('TIMEOUTS 상수가 정의되어 있어야 함', () => {
  const filePath = path.join(projectRoot, 'src', 'lib', 'constants', 'timeouts.ts')

  if (!fs.existsSync(filePath)) {
    throw new Error('타임아웃 상수 파일이 존재하지 않음')
  }

  const content = fs.readFileSync(filePath, 'utf8')
  expect(content).toMatch(/export const TIMEOUTS/)
  expect(content).toMatch(/SESSION_REFRESH/)
  expect(content).toMatch(/SESSION_CHECK/)
  expect(content).toMatch(/QUERY_DEFAULT/)
  expect(content).toMatch(/QUERY_LONG/)
})

// 테스트 3: useSupabaseData.ts가 하드코딩된 5000을 사용하지 않는가?
test('useSupabaseData.ts는 하드코딩된 5000을 사용하지 않아야 함', () => {
  const filePath = path.join(projectRoot, 'src', 'hooks', 'useSupabaseData.ts')
  const content = fs.readFileSync(filePath, 'utf8')

  // refreshSessionWithTimeout의 두 번째 인자로 5000이 오면 안 됨
  const hardcodedPattern = /refreshSessionWithTimeout\([^,]+,\s*5000\s*\)/
  expect(content).not.toMatch(hardcodedPattern)
})

// 테스트 4: useSupabaseData.ts가 TIMEOUTS 상수를 import하는가?
test('useSupabaseData.ts는 TIMEOUTS 상수를 import해야 함', () => {
  const filePath = path.join(projectRoot, 'src', 'hooks', 'useSupabaseData.ts')
  const content = fs.readFileSync(filePath, 'utf8')

  const importPattern = /import.*TIMEOUTS.*from.*constants\/timeouts/
  expect(content).toMatch(importPattern)
})

// 테스트 5: useSupabaseData.ts가 하드코딩된 60000을 사용하지 않는가?
test('useSupabaseData.ts는 하드코딩된 60000을 사용하지 않아야 함', () => {
  const filePath = path.join(projectRoot, 'src', 'hooks', 'useSupabaseData.ts')
  const content = fs.readFileSync(filePath, 'utf8')

  // withTimeout의 두 번째 인자로 60000이 오면 안 됨 (상수 사용해야 함)
  const hardcodedPattern = /withTimeout\([^,]+,\s*60000\s*,/
  expect(content).not.toMatch(hardcodedPattern)
})

// 테스트 6: sessionUtils.ts의 상수가 유지되는가?
test('sessionUtils.ts의 SESSION_REFRESH_TIMEOUT이 10000이어야 함', () => {
  const filePath = path.join(projectRoot, 'src', 'lib', 'sessionUtils.ts')
  const content = fs.readFileSync(filePath, 'utf8')

  expect(content).toMatch(/SESSION_REFRESH_TIMEOUT\s*=\s*10000/)
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
