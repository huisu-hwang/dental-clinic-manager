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

describe('findMonthRows — 다양한 거래년월 포맷 정규화 (1월 누락 버그 방지)', () => {
  it('zero-padding 없는 "YYYY-M" 포맷을 1월로 인식한다', () => {
    const records = [{ 거래년월: '2026-1', '총 사용금액': '111,111' }]
    expect(findMonthRows(records, 2026, 1)).toHaveLength(1)
    expect(extractMonthAmount(records, 2026, 1)).toBe(111111)
  })

  it('compact 6자리 "YYYYMM" 포맷을 인식한다', () => {
    const records = [{ 거래년월: '202601', '총 사용금액': '222,222' }]
    expect(findMonthRows(records, 2026, 1)).toHaveLength(1)
    expect(extractMonthAmount(records, 2026, 1)).toBe(222222)
  })

  it('compact 8자리 "YYYYMMDD" 날짜 포맷을 인식한다', () => {
    const records = [{ 거래일자: '20260131', '총 사용금액': '333,333' }]
    expect(findMonthRows(records, 2026, 1)).toHaveLength(1)
    expect(extractMonthAmount(records, 2026, 1)).toBe(333333)
  })

  it('점(.) 구분자 "YYYY.MM" 포맷을 인식한다', () => {
    const records = [{ 거래년월: '2026.01', '총 사용금액': '444,444' }]
    expect(findMonthRows(records, 2026, 1)).toHaveLength(1)
    expect(extractMonthAmount(records, 2026, 1)).toBe(444444)
  })

  it('점(.) 구분자 zero-pad 없는 "YYYY.M" 포맷을 인식한다', () => {
    const records = [{ 거래년월: '2026.1', '총 사용금액': '555,555' }]
    expect(findMonthRows(records, 2026, 1)).toHaveLength(1)
    expect(extractMonthAmount(records, 2026, 1)).toBe(555555)
  })

  it('한글 "YYYY년 M월" 포맷(공백 포함)을 인식한다', () => {
    const records = [{ 거래년월: '2026년 1월', '총 사용금액': '666,666' }]
    expect(findMonthRows(records, 2026, 1)).toHaveLength(1)
    expect(extractMonthAmount(records, 2026, 1)).toBe(666666)
  })

  it('전체 날짜 "YYYY-MM-DD" 포맷에서 월을 추출한다', () => {
    const records = [{ 거래일자: '2026-01-15', '총 사용금액': '777,777' }]
    expect(findMonthRows(records, 2026, 1)).toHaveLength(1)
    expect(extractMonthAmount(records, 2026, 1)).toBe(777777)
  })

  it('숫자형(number) 월 값을 MONTH_ONLY 필드에서 인식한다', () => {
    const records = [{ 월: 1, '총 사용금액': '888,888' }]
    expect(findMonthRows(records, 2026, 1)).toHaveLength(1)
    expect(extractMonthAmount(records, 2026, 1)).toBe(888888)
  })

  it('1월 데이터가 다양한 포맷으로 섞여 있어도 모두 합산한다 (실제 버그 시나리오)', () => {
    const records = [
      { 거래년월: '2026-1', '총 사용금액': '100,000' },
      { 거래년월: '202601', '총 사용금액': '200,000' },
      { 거래년월: '2026-01', '총 사용금액': '300,000' },
      { 거래년월: '2026-02', '총 사용금액': '999,999' },
    ]
    expect(extractMonthAmount(records, 2026, 1)).toBe(600000)
  })

  it('잘못된 월 번호(13~99)는 매칭하지 않는다', () => {
    const records = [
      { 거래년월: '2026-13', '총 사용금액': '111' },
      { 거래년월: '202699', '총 사용금액': '222' },
    ]
    expect(findMonthRows(records, 2026, 1)).toHaveLength(0)
    expect(extractMonthAmount(records, 2026, 1)).toBe(0)
  })

  it('연도가 다른 1월은 매칭하지 않는다', () => {
    const records = [
      { 거래년월: '2025-01', '총 사용금액': '111,111' },
      { 거래년월: '2027-01', '총 사용금액': '222,222' },
    ]
    expect(findMonthRows(records, 2026, 1)).toHaveLength(0)
  })
})
