#!/usr/bin/env node

/**
 * sw.js의 __SW_VERSION__ 플레이스홀더를 현재 빌드 타임스탬프로 교체합니다.
 * 이렇게 하면 매 빌드마다 sw.js 파일 내용이 변경되어
 * 브라우저가 서비스 워커 업데이트를 감지할 수 있습니다.
 */

const fs = require('fs')
const path = require('path')

const SW_PATH = path.join(__dirname, '..', 'public', 'sw.js')
const version = `v${Date.now()}`

try {
  let content = fs.readFileSync(SW_PATH, 'utf-8')
  content = content.replace(/__SW_VERSION__/g, version)
  fs.writeFileSync(SW_PATH, content, 'utf-8')
  console.log(`[stamp-sw-version] sw.js stamped with version: ${version}`)
} catch (err) {
  console.error('[stamp-sw-version] Failed to stamp sw.js:', err.message)
  process.exit(1)
}
