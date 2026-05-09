export interface ParsedNotice {
  baseRightType: string | null
  baseRightDate: string | null  // ISO yyyy-mm-dd
  hasSeniorTenant: boolean
  tenantCount: number
  totalDeposit: number
  unsettledTaxes: number
  riskFlags: Record<string, boolean>
  parseStatus: 'ok' | 'partial' | 'failed'
}

const BASE_RIGHT_KEYWORDS = [
  { keyword: '근저당권', label: '근저당' },
  { keyword: '저당권',   label: '저당' },
  { keyword: '담보가등기', label: '담보가등기' },
  { keyword: '가압류',    label: '가압류' },
  { keyword: '경매개시결정', label: '경매개시결정' },
]

const DATE_RE = /(\d{4})[.\-/](\d{1,2})[.\-/](\d{1,2})/

export function parseNoticeText(text: string): ParsedNotice {
  if (!text || text.trim().length < 10) {
    return failResult()
  }

  let baseRightType: string | null = null
  let baseRightDate: string | null = null

  for (const line of text.split('\n')) {
    for (const k of BASE_RIGHT_KEYWORDS) {
      if (line.includes(k.keyword)) {
        const m = line.match(DATE_RE)
        if (!m) continue
        const iso = `${m[1]}-${m[2].padStart(2,'0')}-${m[3].padStart(2,'0')}`
        if (!baseRightDate || iso < baseRightDate) {
          baseRightDate = iso
          baseRightType = k.label
        }
      }
    }
  }

  let tenantCount = 0
  let totalDeposit = 0
  let hasSeniorTenant = false

  const tenantBlock = text.split(/임차인\s*현황|임차인\s*정보/i)[1] ?? ''
  if (tenantBlock && !text.includes('임차인 없음')) {
    const lines = tenantBlock.split('\n').filter(l => l.match(DATE_RE))
    for (const line of lines) {
      const dateMatch = line.match(DATE_RE)
      if (!dateMatch) continue
      const iso = `${dateMatch[1]}-${dateMatch[2].padStart(2,'0')}-${dateMatch[3].padStart(2,'0')}`
      const depositMatch = line.match(/([\d,]{6,})/)
      const deposit = depositMatch ? Number(depositMatch[1].replace(/,/g,'')) : 0
      tenantCount++
      totalDeposit += deposit
      if (baseRightDate && iso < baseRightDate) {
        hasSeniorTenant = true
      }
    }
  }

  const status: ParsedNotice['parseStatus'] = baseRightDate ? 'ok' : 'partial'

  return {
    baseRightType,
    baseRightDate,
    hasSeniorTenant,
    tenantCount,
    totalDeposit,
    unsettledTaxes: 0,
    riskFlags: {
      senior_tenant: hasSeniorTenant,
      no_base_right: !baseRightDate,
    },
    parseStatus: status,
  }
}

function failResult(): ParsedNotice {
  return {
    baseRightType: null,
    baseRightDate: null,
    hasSeniorTenant: false,
    tenantCount: 0,
    totalDeposit: 0,
    unsettledTaxes: 0,
    riskFlags: {},
    parseStatus: 'failed',
  }
}
