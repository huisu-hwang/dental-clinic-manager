import { describe, it, expect } from 'vitest'
import { extractMonthAmount, findMonthRows } from '@/utils/hometaxAmount'

describe('hometaxAmount — 사업용 신용카드 매입세액 공제 확인/변경 (월별)', () => {
  it('새 워커가 메타데이터 행으로 삽입한 "총 사용금액"을 인식한다', () => {
    // 새 흐름: 워커가 records[0]에 메타데이터 행을 삽입
    // (구분: '총 사용금액', 총 사용금액: '1,234,567', 거래년월: '2026-04')
    const records = [
      {
        구분: '총 사용금액',
        '총 사용금액': '1,234,567',
        거래년월: '2026-04',
      },
    ]

    const amount = extractMonthAmount(records, 2026, 4)
    expect(amount).toBe(1234567)
  })

  it('"총 사용금액" 키가 "합계(①+②)" legacy 키보다 우선한다', () => {
    // 합계(①+②)는 누계 조회의 legacy 필드. 새 흐름은 총 사용금액을 사용
    const records = [
      {
        거래년월: '2026-04',
        '총 사용금액': '500,000',
        '합계(①+②)': '999,999',
      },
    ]

    const amount = extractMonthAmount(records, 2026, 4)
    expect(amount).toBe(500000)
  })

  it('legacy 누계 조회 데이터(합계(①+②))도 호환 처리한다', () => {
    // 기존 워커가 push한 데이터는 그대로 합산되어야 함
    const records = [
      { 거래년월: '2026-04', '합계(①+②)': '300,000' },
      { 거래년월: '2026-04', '합계(①+②)': '200,000' },
      { 거래년월: '2026-03', '합계(①+②)': '999,999' }, // 다른 월
    ]

    const amount = extractMonthAmount(records, 2026, 4)
    expect(amount).toBe(500000)
  })

  it('월(月) 텍스트 필드만 있는 메타데이터 행을 해당 월로 인식한다', () => {
    const records = [
      { 월: '4월', '총 사용금액': '777,777' },
      { 월: '3월', '총 사용금액': '888,888' },
    ]

    const amount = extractMonthAmount(records, 2026, 4)
    expect(amount).toBe(777777)
  })

  it('"원" / 콤마 / 공백 문자열을 정규화하여 합산한다', () => {
    const records = [
      { 거래년월: '2026-05', '총 사용금액': '1,500,000원' },
      { 거래년월: '2026-05', '총 사용금액': ' 2,500,000 ' },
    ]

    const amount = extractMonthAmount(records, 2026, 5)
    expect(amount).toBe(4000000)
  })

  it('연월 필드가 일치하지 않으면 0을 반환한다 (잘못된 폴백 방지)', () => {
    // 5월을 요청했지만 데이터는 4월만 존재 → 0 반환해야 함
    const records = [{ 거래년월: '2026-04', '총 사용금액': '500,000' }]

    const amount = extractMonthAmount(records, 2026, 5)
    expect(amount).toBe(0)
  })

  it('빈 records 배열은 0을 반환한다', () => {
    expect(extractMonthAmount([], 2026, 4)).toBe(0)
  })

  it('findMonthRows: "거래년월" 필드 기준 정확한 월 매칭', () => {
    const records = [
      { 거래년월: '2026-04', amount: '100' },
      { 거래년월: '2026-05', amount: '200' },
      { 거래년월: '2026-04', amount: '300' },
    ]

    const aprRows = findMonthRows(records, 2026, 4)
    expect(aprRows).toHaveLength(2)
    expect(aprRows.every((r) => r.거래년월 === '2026-04')).toBe(true)
  })
})
