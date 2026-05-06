/**
 * 권한 정합성 검증 스크립트
 *
 * 신규 메뉴/기능을 추가할 때 권한 관리 UI에 자동으로 노출되도록
 * src/types/permissions.ts와 src/config/menuConfig.ts 사이의 정합성을 검증한다.
 *
 * 검사 항목:
 *   1) Permission union 멤버 ↔ PERMISSION_GROUPS / PERMISSION_DESCRIPTIONS 일치
 *   2) MENU_CONFIG가 참조하는 모든 permission key가 union에 존재
 *   3) 신규 prefix가 NEW_FEATURE_PREFIXES에 등록되어 있는지 (경고)
 *   4) 모든 permission이 owner 기본 권한에 포함되어 있는지 (경고)
 *
 * 사용법: npm run check:permissions
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const PERMS_PATH = path.resolve(ROOT, 'src/types/permissions.ts')
const MENU_PATH = path.resolve(ROOT, 'src/config/menuConfig.ts')

function readFile(p) {
  if (!fs.existsSync(p)) {
    console.error(`파일을 찾을 수 없습니다: ${p}`)
    process.exit(1)
  }
  return fs.readFileSync(p, 'utf-8')
}

function extractUnionMembers(content) {
  const match = content.match(/export type Permission =([\s\S]*?)\n\n/)
  if (!match) return []
  return [...match[1].matchAll(/'([a-z_][a-z0-9_]*)'/gi)].map((m) => m[1])
}

function extractGroupKeys(content) {
  const match = content.match(/PERMISSION_GROUPS\s*=\s*\{([\s\S]*?)\n\}\n/)
  if (!match) return []
  return [...match[1].matchAll(/key:\s*'([a-z_][a-z0-9_]*)'/gi)].map((m) => m[1])
}

function extractDescriptionKeys(content) {
  const match = content.match(
    /PERMISSION_DESCRIPTIONS:\s*Record<Permission,\s*string>\s*=\s*\{([\s\S]*?)\n\}\s*$/m,
  )
  if (!match) return []
  return [...match[1].matchAll(/^\s*'([a-z_][a-z0-9_]*)':\s*'/gm)].map((m) => m[1])
}

function extractNewFeaturePrefixes(content) {
  const match = content.match(/NEW_FEATURE_PREFIXES\s*=\s*\[([\s\S]*?)\]/)
  if (!match) return []
  return [...match[1].matchAll(/'([a-z_]+_)'/gi)].map((m) => m[1])
}

function extractOwnerDefaults(content) {
  const match = content.match(/owner:\s*\[([\s\S]*?)\],\s*\n\s*vice_director:/)
  if (!match) return []
  return [...match[1].matchAll(/'([a-z_][a-z0-9_]*)'/gi)].map((m) => m[1])
}

function extractMenuPermissions(menuContent) {
  const re = /id:\s*'([^']+)',[\s\S]*?permissions:\s*\[([^\]]*)\]/g
  const items = [...menuContent.matchAll(re)]
  return items.map((m) => ({
    id: m[1],
    perms: [...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1]),
  }))
}

function main() {
  const permsContent = readFile(PERMS_PATH)
  const menuContent = readFile(MENU_PATH)

  const unionMembers = extractUnionMembers(permsContent)
  const groupKeys = extractGroupKeys(permsContent)
  const descKeys = extractDescriptionKeys(permsContent)
  const newPrefixes = extractNewFeaturePrefixes(permsContent)
  const ownerDefaults = extractOwnerDefaults(permsContent)
  const menuPerms = extractMenuPermissions(menuContent)

  const unionSet = new Set(unionMembers)
  const groupSet = new Set(groupKeys)
  const descSet = new Set(descKeys)
  const ownerSet = new Set(ownerDefaults)

  let errors = 0
  let warnings = 0

  console.log('\n[권한 정합성 검증]')
  console.log(`  Permission union   : ${unionMembers.length}`)
  console.log(`  PERMISSION_GROUPS  : ${groupKeys.length}`)
  console.log(`  DESCRIPTIONS       : ${descKeys.length}`)
  console.log(`  NEW_FEATURE_PREFIXES: ${newPrefixes.length}`)

  const missingGroups = unionMembers.filter((p) => !groupSet.has(p))
  if (missingGroups.length > 0) {
    console.error(`\n  [ERROR] PERMISSION_GROUPS에 누락된 권한:`)
    missingGroups.forEach((p) => console.error(`    - ${p}`))
    errors += missingGroups.length
  }

  const missingDescs = unionMembers.filter((p) => !descSet.has(p))
  if (missingDescs.length > 0) {
    console.error(`\n  [ERROR] PERMISSION_DESCRIPTIONS에 누락된 권한:`)
    missingDescs.forEach((p) => console.error(`    - ${p}`))
    errors += missingDescs.length
  }

  const extraInGroups = groupKeys.filter((p) => !unionSet.has(p))
  if (extraInGroups.length > 0) {
    console.error(`\n  [ERROR] PERMISSION_GROUPS에만 있고 union에 없는 권한:`)
    extraInGroups.forEach((p) => console.error(`    - ${p}`))
    errors += extraInGroups.length
  }

  const missingMenuPerms = []
  for (const m of menuPerms) {
    for (const p of m.perms) {
      if (!unionSet.has(p)) {
        missingMenuPerms.push({ id: m.id, perm: p })
      }
    }
  }
  if (missingMenuPerms.length > 0) {
    console.error(`\n  [ERROR] MENU_CONFIG가 참조하지만 Permission union에 없는 권한:`)
    missingMenuPerms.forEach((x) => console.error(`    - menu '${x.id}': ${x.perm}`))
    errors += missingMenuPerms.length
  }

  const missingMenuInGroups = []
  for (const m of menuPerms) {
    for (const p of m.perms) {
      if (!groupSet.has(p)) {
        missingMenuInGroups.push({ id: m.id, perm: p })
      }
    }
  }
  if (missingMenuInGroups.length > 0) {
    console.error(
      `\n  [ERROR] MENU_CONFIG의 권한이 PERMISSION_GROUPS에 없습니다 (직원 권한 관리 UI에 노출되지 않음):`,
    )
    missingMenuInGroups.forEach((x) =>
      console.error(`    - menu '${x.id}': ${x.perm}`),
    )
    errors += missingMenuInGroups.length
  }

  const missingFromOwner = unionMembers.filter((p) => !ownerSet.has(p))
  if (missingFromOwner.length > 0) {
    console.warn(`\n  [WARN] owner 기본 권한에 누락된 권한 (대표원장은 모든 권한 보유 권장):`)
    missingFromOwner.forEach((p) => console.warn(`    - ${p}`))
    warnings += missingFromOwner.length
  }

  // 신규 prefix 추천: union에 있지만 NEW_FEATURE_PREFIXES에 빠진 prefix가 있는지
  // (기존 직원에게 자동 보충되도록 등록 권장)
  const newPrefixSet = new Set(newPrefixes)
  const recentCandidates = [
    'task_directive_',
    'monthly_report_',
    'referral_',
    'community_',
    'recall_',
    'ai_analysis_',
    'financial_',
    'marketing_',
    'investment_',
    'task_checklist_',
    'bulletin_',
    'payroll_',
  ]
  const missingFromNew = recentCandidates.filter(
    (pref) =>
      !newPrefixSet.has(pref) &&
      unionMembers.some((p) => p.startsWith(pref)),
  )
  if (missingFromNew.length > 0) {
    console.warn(
      `\n  [WARN] 권장: 다음 prefix를 NEW_FEATURE_PREFIXES에 추가하면 기존 직원에게도 자동 보충됩니다:`,
    )
    missingFromNew.forEach((p) => console.warn(`    - ${p}`))
    warnings += missingFromNew.length
  }

  console.log()
  if (errors === 0 && warnings === 0) {
    console.log('  통과: 권한 정합성 OK\n')
    return
  }
  if (errors === 0) {
    console.log(`  통과: 에러 없음 (경고 ${warnings}개)\n`)
    return
  }

  console.error(`  실패: 에러 ${errors}개 / 경고 ${warnings}개\n`)
  console.error(`  해결 방법:`)
  console.error(`  1. 신규 권한 → src/types/permissions.ts 의 Permission union, PERMISSION_GROUPS, PERMISSION_DESCRIPTIONS 모두에 추가`)
  console.error(`  2. 신규 메뉴 권한 → 위 union에 추가하고 그룹에 등록`)
  console.error(`  3. 기존 직원에게도 자동 노출하려면 → NEW_FEATURE_PREFIXES에 prefix 추가\n`)
  process.exit(1)
}

main()
