import { describe, it, expect } from 'vitest'
import { parseNoticeText } from '../../src/parsers/noticeParser.js'

describe('parseNoticeText', () => {
  it('말소기준권리: 가장 빠른 근저당의 날짜 추출', () => {
    const txt = `
1. 등기부 기재 권리
근저당권   김** 2024.03.15  100,000,000원
가압류     박** 2024.06.20   50,000,000원
근저당권   이** 2025.01.10   30,000,000원
`
    const r = parseNoticeText(txt)
    expect(r.baseRightType).toBe('근저당')
    expect(r.baseRightDate).toBe('2024-03-15')
  })

  it('대항력 임차인: 전입신고 + 확정일자가 말소기준 이전이면 true', () => {
    const txt = `
근저당권 2024.06.15 김** 100,000,000원

임차인 현황
임차인  보증금        전입일       확정일자
홍길동  120,000,000  2023.05.10   2023.05.10
`
    const r = parseNoticeText(txt)
    expect(r.hasSeniorTenant).toBe(true)
    expect(r.tenantCount).toBe(1)
    expect(r.totalDeposit).toBe(120_000_000)
  })

  it('대항력 임차인 없음: 전입일이 말소기준 이후', () => {
    const txt = `
근저당권 2020.06.15 김** 100,000,000원

임차인 현황
임차인  보증금        전입일       확정일자
홍길동  120,000,000  2024.05.10   2024.05.10
`
    const r = parseNoticeText(txt)
    expect(r.hasSeniorTenant).toBe(false)
  })

  it('임차인 정보 없음: tenantCount=0, hasSeniorTenant=false', () => {
    const txt = `근저당권 2024.06.15 100,000,000원\n임차인 없음`
    const r = parseNoticeText(txt)
    expect(r.tenantCount).toBe(0)
    expect(r.hasSeniorTenant).toBe(false)
  })

  it('파싱 불가시 parse_status=failed', () => {
    const r = parseNoticeText('')
    expect(r.parseStatus).toBe('failed')
  })
})
