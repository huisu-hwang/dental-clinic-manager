#!/usr/bin/env node

/**
 * marketing-worker 소스를 tarball로 패키징하여 public/downloads에 배치
 * 유저가 대시보드에서 다운로드할 때 GitHub 접속 없이 직접 제공
 */

const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const WORKER_DIR = path.join(__dirname, '..', 'marketing-worker')
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'downloads')
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'marketing-worker.tar.gz')

try {
  // marketing-worker 디렉토리 확인
  if (!fs.existsSync(WORKER_DIR)) {
    console.log('[bundle-worker] marketing-worker 디렉토리 없음, 건너뜀')
    process.exit(0)
  }

  // 출력 디렉토리 생성
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true })
  }

  // tarball 생성 (node_modules, dist, .env*, naver-cookies.json 제외)
  execFileSync('tar', [
    'czf', OUTPUT_FILE,
    '--exclude=node_modules',
    '--exclude=dist',
    '--exclude=.env*',
    '--exclude=naver-cookies.json',
    '--exclude=package-lock.json',
    '--exclude=.omc',
    '--exclude=test-naver-login.ts',
    '-C', path.dirname(WORKER_DIR),
    'marketing-worker'
  ], { stdio: 'pipe' })

  const stats = fs.statSync(OUTPUT_FILE)
  const sizeKB = Math.round(stats.size / 1024)
  console.log(`[bundle-worker] marketing-worker.tar.gz 생성 완료 (${sizeKB}KB)`)
} catch (err) {
  console.error('[bundle-worker] 번들링 실패:', err.message)
  // 빌드를 중단하지 않음 (워커 번들은 선택사항)
}
