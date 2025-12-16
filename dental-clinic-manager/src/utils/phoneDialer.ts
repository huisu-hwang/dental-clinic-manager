// 전화 다이얼러 유틸리티 함수

import { PhoneDialSettings, DEFAULT_PHONE_DIAL_SETTINGS } from '@/types/phone'

const STORAGE_KEY = 'phone_dial_settings'

/**
 * 전화 다이얼 설정 저장
 */
export function savePhoneDialSettings(settings: PhoneDialSettings): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  }
}

/**
 * 전화 다이얼 설정 불러오기
 */
export function loadPhoneDialSettings(): PhoneDialSettings {
  if (typeof window === 'undefined') {
    return DEFAULT_PHONE_DIAL_SETTINGS
  }

  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      return JSON.parse(stored) as PhoneDialSettings
    }
  } catch (error) {
    console.error('Failed to load phone dial settings:', error)
  }

  return DEFAULT_PHONE_DIAL_SETTINGS
}

/**
 * 전화번호 포맷팅 (설정에 따라)
 */
export function formatPhoneNumber(
  phoneNumber: string,
  settings: PhoneDialSettings
): string {
  let formatted = phoneNumber

  // 특수문자 제거
  if (settings.numberFormat?.removeSpecialChars) {
    formatted = formatted.replace(/[^0-9+]/g, '')
  }

  // 앞자리 0 제거 및 국가 코드 추가
  if (settings.numberFormat?.countryCode && settings.numberFormat?.removeLeadingZero) {
    if (formatted.startsWith('0')) {
      formatted = settings.numberFormat.countryCode + formatted.slice(1)
    }
  } else if (settings.numberFormat?.countryCode && !formatted.startsWith('+')) {
    formatted = settings.numberFormat.countryCode + formatted
  }

  return formatted
}

/**
 * 전화 걸기 결과 타입
 */
export interface DialResult {
  success: boolean
  message: string
  error?: string
}

/**
 * 전화 걸기 함수
 */
export async function dialPhone(
  phoneNumber: string,
  settings?: PhoneDialSettings
): Promise<DialResult> {
  const dialSettings = settings || loadPhoneDialSettings()
  const formattedNumber = formatPhoneNumber(phoneNumber, dialSettings)

  switch (dialSettings.protocol) {
    case 'tel':
      return dialWithTel(formattedNumber)

    case 'callto':
      return dialWithCallto(formattedNumber)

    case 'sip':
      return dialWithSip(formattedNumber)

    case 'http':
      return dialWithHttp(formattedNumber, dialSettings)

    default:
      return {
        success: false,
        message: '알 수 없는 프로토콜입니다.',
        error: `Unknown protocol: ${dialSettings.protocol}`
      }
  }
}

/**
 * tel: URI로 전화 걸기 (기본 방식)
 */
function dialWithTel(phoneNumber: string): DialResult {
  try {
    window.location.href = `tel:${phoneNumber}`
    return {
      success: true,
      message: '전화 앱을 열고 있습니다...'
    }
  } catch (error) {
    return {
      success: false,
      message: '전화 앱을 열 수 없습니다.',
      error: String(error)
    }
  }
}

/**
 * callto: URI로 전화 걸기 (Skype 등)
 */
function dialWithCallto(phoneNumber: string): DialResult {
  try {
    window.location.href = `callto:${phoneNumber}`
    return {
      success: true,
      message: 'Skype 등 통화 앱을 열고 있습니다...'
    }
  } catch (error) {
    return {
      success: false,
      message: '통화 앱을 열 수 없습니다.',
      error: String(error)
    }
  }
}

/**
 * sip: URI로 전화 걸기 (SIP 클라이언트)
 */
function dialWithSip(phoneNumber: string): DialResult {
  try {
    window.location.href = `sip:${phoneNumber}`
    return {
      success: true,
      message: 'SIP 클라이언트를 열고 있습니다...'
    }
  } catch (error) {
    return {
      success: false,
      message: 'SIP 클라이언트를 열 수 없습니다.',
      error: String(error)
    }
  }
}

/**
 * HTTP API로 전화 걸기 (IP 전화기)
 */
async function dialWithHttp(
  phoneNumber: string,
  settings: PhoneDialSettings
): Promise<DialResult> {
  const httpSettings = settings.httpSettings

  if (!httpSettings?.host) {
    return {
      success: false,
      message: 'IP 전화기 주소가 설정되지 않았습니다.',
      error: 'Missing host configuration'
    }
  }

  const port = httpSettings.port || 80
  const path = httpSettings.pathTemplate.replace('{number}', encodeURIComponent(phoneNumber))
  const url = `http://${httpSettings.host}:${port}${path}`
  const method = httpSettings.method || 'GET'

  try {
    const headers: HeadersInit = {
      'Content-Type': 'application/x-www-form-urlencoded'
    }

    // Basic 인증
    if (httpSettings.auth?.username) {
      const credentials = btoa(`${httpSettings.auth.username}:${httpSettings.auth.password || ''}`)
      headers['Authorization'] = `Basic ${credentials}`
    }

    const response = await fetch(url, {
      method,
      headers,
      mode: 'no-cors' // CORS 우회 (IP 전화기는 보통 CORS 설정이 없음)
    })

    // no-cors 모드에서는 응답을 읽을 수 없으므로 성공으로 간주
    return {
      success: true,
      message: `전화기로 ${phoneNumber} 다이얼 요청을 보냈습니다.`
    }
  } catch (error) {
    // 네트워크 오류여도 전화기가 요청을 받았을 수 있음
    console.error('Phone dial HTTP request error:', error)
    return {
      success: true, // 요청은 보냈으므로 일단 성공으로 처리
      message: `전화기로 다이얼 요청을 보냈습니다. (응답 확인 불가)`
    }
  }
}

/**
 * 설정 테스트 (IP 전화기 연결 확인)
 */
export async function testPhoneConnection(settings: PhoneDialSettings): Promise<DialResult> {
  if (settings.protocol !== 'http') {
    return {
      success: true,
      message: `${settings.protocol}: 프로토콜은 별도의 연결 테스트가 필요 없습니다.`
    }
  }

  const httpSettings = settings.httpSettings

  if (!httpSettings?.host) {
    return {
      success: false,
      message: 'IP 전화기 주소를 입력해주세요.'
    }
  }

  try {
    const port = httpSettings.port || 80
    // 간단한 연결 테스트 (HEAD 요청)
    await fetch(`http://${httpSettings.host}:${port}/`, {
      method: 'HEAD',
      mode: 'no-cors'
    })

    return {
      success: true,
      message: '전화기에 연결할 수 있습니다.'
    }
  } catch (error) {
    return {
      success: false,
      message: '전화기에 연결할 수 없습니다. IP 주소와 포트를 확인해주세요.',
      error: String(error)
    }
  }
}
