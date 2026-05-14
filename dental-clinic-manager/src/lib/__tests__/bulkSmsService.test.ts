import { describe, it, expect } from 'vitest'
import { normalizePhone, calculateAge, applyVariables, isExcluded } from '@/lib/bulkSmsService'

describe('normalizePhone', () => {
  it('하이픈·공백 제거 후 숫자만 반환', () => {
    expect(normalizePhone('010-1234-5678')).toBe('01012345678')
    expect(normalizePhone(' 010 1234 5678 ')).toBe('01012345678')
    expect(normalizePhone(null)).toBe('')
    expect(normalizePhone(undefined)).toBe('')
  })
})

describe('calculateAge', () => {
  it('생년월일 기준 만 나이를 계산한다', () => {
    const today = new Date('2026-05-14')
    expect(calculateAge('2000-01-01', today)).toBe(26)
    expect(calculateAge('2000-12-31', today)).toBe(25)  // 아직 생일 전
    expect(calculateAge(null, today)).toBeNull()
  })
})

describe('applyVariables', () => {
  it('환자명/병원명/전화번호 변수를 치환', () => {
    const t = '안녕하세요 {환자명}님, {병원명}입니다. 문의: {전화번호}'
    const r = applyVariables(t, { patientName: '홍길동', clinicName: '하얀치과', clinicPhone: '02-1234-5678' })
    expect(r).toBe('안녕하세요 홍길동님, 하얀치과입니다. 문의: 02-1234-5678')
  })

  it('환자명이 없을 때는 변수를 그대로 둔다', () => {
    const r = applyVariables('{환자명}님 안녕하세요', { clinicName: '', clinicPhone: '' })
    expect(r).toBe('{환자명}님 안녕하세요')
  })
})

describe('isExcluded', () => {
  it('전화번호 일치 시 제외', () => {
    const rules = [{ phone_number: '010-1111-2222', patient_name: null, chart_number: null }]
    expect(isExcluded({ phone_number: '01011112222', patient_name: '김철수', chart_number: null }, rules)).toBe(true)
  })

  it('차트번호 일치 시 제외', () => {
    const rules = [{ phone_number: null, patient_name: null, chart_number: 'C-100' }]
    expect(isExcluded({ phone_number: '010', patient_name: '김', chart_number: 'C-100' }, rules)).toBe(true)
  })

  it('이름만 일치 + 다른 키 모두 NULL 인 룰은 환자 이름이 동일할 때 제외', () => {
    const rules = [{ phone_number: null, patient_name: '홍길동', chart_number: null }]
    expect(isExcluded({ phone_number: '010', patient_name: '홍길동', chart_number: 'X' }, rules)).toBe(true)
  })

  it('어떤 키도 일치하지 않으면 포함', () => {
    const rules = [{ phone_number: '010-9999-9999', patient_name: '아무개', chart_number: 'Z-1' }]
    expect(isExcluded({ phone_number: '01011112222', patient_name: '김철수', chart_number: 'C-100' }, rules)).toBe(false)
  })
})
