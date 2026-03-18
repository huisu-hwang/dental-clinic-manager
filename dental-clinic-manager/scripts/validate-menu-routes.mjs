/**
 * 라우트-메뉴 검증 스크립트
 *
 * src/app/ 하위의 page.tsx 파일을 스캔하여
 * MENU_CONFIG 또는 KNOWN_NON_MENU_ROUTES에 등록되지 않은 라우트를 감지합니다.
 *
 * 사용법: npm run check:menu
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = path.resolve(__dirname, '..')
const APP_DIR = path.resolve(PROJECT_ROOT, 'src/app')
const MENU_CONFIG_PATH = path.resolve(PROJECT_ROOT, 'src/config/menuConfig.ts')

// src/app/ 하위의 모든 page.tsx 파일 찾기
function findPages(dir, pages = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      if (entry.name === 'api') continue // API 라우트 제외
      findPages(fullPath, pages)
    } else if (entry.name === 'page.tsx' || entry.name === 'page.ts') {
      pages.push(fullPath)
    }
  }
  return pages
}

// 파일 경로를 라우트로 변환
function filePathToRoute(filePath) {
  const relative = path.relative(APP_DIR, filePath).replace(/\\/g, '/')
  const routePath = relative.replace(/(^|\/)page\.tsx?$/, '')
  return routePath === '' ? '/' : '/' + routePath
}

// menuConfig.ts에서 MENU_CONFIG의 route 값들 추출
function extractMenuRoutes(configContent) {
  const routeRegex = /route:\s*['"]([^'"]+)['"]/g
  const routes = []
  let match
  while ((match = routeRegex.exec(configContent)) !== null) {
    routes.push(match[1].split('?')[0]) // 쿼리 파라미터 제거
  }
  return [...new Set(routes)]
}

// menuConfig.ts에서 KNOWN_NON_MENU_ROUTES 추출
function extractNonMenuRoutes(configContent) {
  const blockMatch = configContent.match(
    /KNOWN_NON_MENU_ROUTES[^=]*=\s*\[([\s\S]*?)\]/m
  )
  if (!blockMatch) return []

  const routeRegex = /['"]([^'"]+)['"]/g
  const routes = []
  let match
  while ((match = routeRegex.exec(blockMatch[1])) !== null) {
    routes.push(match[1])
  }
  return routes
}

// 라우트가 등록된 라우트 목록과 매칭되는지 확인
function isRouteRegistered(route, registeredRoutes) {
  return registeredRoutes.some(
    (registered) =>
      route === registered || route.startsWith(registered + '/')
  )
}

// 메인 실행
function main() {
  if (!fs.existsSync(APP_DIR)) {
    console.error('src/app/ 디렉토리를 찾을 수 없습니다.')
    process.exit(1)
  }

  if (!fs.existsSync(MENU_CONFIG_PATH)) {
    console.error('src/config/menuConfig.ts 파일을 찾을 수 없습니다.')
    process.exit(1)
  }

  const configContent = fs.readFileSync(MENU_CONFIG_PATH, 'utf-8')
  const menuRoutes = extractMenuRoutes(configContent)
  const nonMenuRoutes = extractNonMenuRoutes(configContent)

  const pages = findPages(APP_DIR)
  const appRoutes = pages.map(filePathToRoute)

  // 루트('/') 및 동적 라우트('[param]') 제외
  const staticRoutes = appRoutes.filter(
    (route) => route !== '/' && !route.includes('[')
  )

  const unregistered = staticRoutes.filter(
    (route) =>
      !isRouteRegistered(route, menuRoutes) &&
      !isRouteRegistered(route, nonMenuRoutes)
  )

  console.log(`\n[메뉴 라우트 검증]`)
  console.log(`  총 페이지 라우트: ${appRoutes.length}개`)
  console.log(`  검증 대상 (정적): ${staticRoutes.length}개`)
  console.log(`  메뉴 등록 라우트: ${menuRoutes.length}개`)
  console.log(`  비메뉴 등록 라우트: ${nonMenuRoutes.length}개`)

  if (unregistered.length > 0) {
    console.error(`\n  미등록 라우트: ${unregistered.length}개`)
    console.error(`  ─────────────────────────────────`)
    unregistered.forEach((r) => console.error(`  ${r}`))
    console.error(`\n  해결 방법:`)
    console.error(
      `  1. 사이드바에 표시할 라우트 → src/config/menuConfig.ts의 MENU_CONFIG에 추가`
    )
    console.error(
      `  2. 메뉴 불필요한 라우트 → src/config/menuConfig.ts의 KNOWN_NON_MENU_ROUTES에 추가\n`
    )
    process.exit(1)
  } else {
    console.log(`\n  모든 라우트가 정상 등록되어 있습니다.\n`)
  }
}

main()
