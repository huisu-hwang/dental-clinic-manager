// ========================================
// 전화 걸기 서비스
// Phone Call Service
// ========================================

import type { DeviceType, VoipProvider } from '@/types/recall'
import type { PhoneDialSettings } from '@/types/phone'

// 디바이스 타입 감지
export function detectDeviceType(): DeviceType {
  if (typeof window === 'undefined') return 'desktop'

  const userAgent = navigator.userAgent.toLowerCase()

  // 모바일 디바이스 감지
  if (/android|webos|iphone|ipod|blackberry|iemobile|opera mini/i.test(userAgent)) {
    return 'mobile'
  }

  // 태블릿 감지
  if (/ipad|tablet|playbook|silk/i.test(userAgent)) {
    return 'tablet'
  }

  return 'desktop'
}

// 전화번호 포맷팅 (특수문자 제거)
export function formatPhoneNumber(phone: string, options?: {
  removeLeadingZero?: boolean
  addCountryCode?: string
}): string {
  // 숫자만 추출
  let formatted = phone.replace(/[^0-9]/g, '')

  // 앞의 0 제거 (국제 전화용)
  if (options?.removeLeadingZero && formatted.startsWith('0')) {
    formatted = formatted.substring(1)
  }

  // 국가 코드 추가
  if (options?.addCountryCode) {
    formatted = options.addCountryCode + formatted
  }

  return formatted
}

// 모바일에서 직접 전화 걸기
export function makeDirectCall(phoneNumber: string): void {
  const formattedNumber = formatPhoneNumber(phoneNumber)
  window.location.href = `tel:${formattedNumber}`
}

// tel: URI를 사용한 전화 걸기 (데스크톱 소프트폰 지원)
export function makeTelCall(phoneNumber: string): void {
  const formattedNumber = formatPhoneNumber(phoneNumber)
  window.open(`tel:${formattedNumber}`, '_self')
}

// SIP URI를 사용한 전화 걸기
export function makeSipCall(phoneNumber: string, sipDomain?: string): void {
  const formattedNumber = formatPhoneNumber(phoneNumber)
  const sipUri = sipDomain ? `sip:${formattedNumber}@${sipDomain}` : `sip:${formattedNumber}`
  window.open(sipUri, '_self')
}

// Callto URI를 사용한 전화 걸기 (Skype 등)
export function makeCalltoCall(phoneNumber: string): void {
  const formattedNumber = formatPhoneNumber(phoneNumber)
  window.open(`callto:${formattedNumber}`, '_self')
}

// IP 전화기 HTTP API를 통한 전화 걸기
export async function makeHttpCall(
  phoneNumber: string,
  settings: PhoneDialSettings['httpSettings']
): Promise<{ success: boolean; error?: string }> {
  if (!settings?.host || !settings?.pathTemplate) {
    return { success: false, error: 'IP 전화기 설정이 올바르지 않습니다.' }
  }

  const formattedNumber = formatPhoneNumber(phoneNumber)
  const port = settings.port || 80
  const path = settings.pathTemplate.replace('{number}', formattedNumber)
  const url = `http://${settings.host}:${port}${path}`

  try {
    const fetchOptions: RequestInit = {
      method: settings.method || 'GET',
      mode: 'no-cors', // IP 전화기는 CORS를 지원하지 않을 수 있음
    }

    // 인증 정보가 있는 경우
    if (settings.auth?.username && settings.auth?.password) {
      const authString = btoa(`${settings.auth.username}:${settings.auth.password}`)
      fetchOptions.headers = {
        'Authorization': `Basic ${authString}`
      }
    }

    await fetch(url, fetchOptions)

    // no-cors 모드에서는 응답을 읽을 수 없으므로 성공으로 간주
    return { success: true }
  } catch (error) {
    console.error('[makeHttpCall] Error:', error)
    return { success: false, error: '전화 연결에 실패했습니다.' }
  }
}

// VoIP 제공업체 API를 통한 전화 걸기
export async function makeVoipCall(
  phoneNumber: string,
  provider: VoipProvider,
  clinicId: string
): Promise<{ success: boolean; error?: string }> {
  const formattedNumber = formatPhoneNumber(phoneNumber)

  try {
    const response = await fetch('/api/recall/voip/call', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        clinic_id: clinicId,
        phone_number: formattedNumber,
        provider
      })
    })

    const result = await response.json()
    return result

  } catch (error) {
    console.error('[makeVoipCall] Error:', error)
    return { success: false, error: '전화 연결에 실패했습니다.' }
  }
}

// 통합 전화 걸기 함수
export async function makePhoneCall(
  phoneNumber: string,
  options?: {
    deviceType?: DeviceType
    settings?: PhoneDialSettings
    voipProvider?: VoipProvider
    clinicId?: string
  }
): Promise<{ success: boolean; method: string; error?: string }> {
  const deviceType = options?.deviceType || detectDeviceType()
  const settings = options?.settings

  // 1. 모바일/태블릿: 직접 전화
  if (deviceType === 'mobile' || deviceType === 'tablet') {
    try {
      makeDirectCall(phoneNumber)
      return { success: true, method: 'direct' }
    } catch (error) {
      return { success: false, method: 'direct', error: '전화 앱을 열 수 없습니다.' }
    }
  }

  // 2. 데스크톱: 설정에 따라 분기
  if (settings) {
    switch (settings.protocol) {
      case 'tel':
        makeTelCall(phoneNumber)
        return { success: true, method: 'tel' }

      case 'sip':
        makeSipCall(phoneNumber)
        return { success: true, method: 'sip' }

      case 'callto':
        makeCalltoCall(phoneNumber)
        return { success: true, method: 'callto' }

      case 'http':
        if (settings.httpSettings) {
          const result = await makeHttpCall(phoneNumber, settings.httpSettings)
          return { ...result, method: 'http' }
        }
        return { success: false, method: 'http', error: 'HTTP 설정이 없습니다.' }
    }
  }

  // 3. VoIP 제공업체 사용
  if (options?.voipProvider && options?.clinicId) {
    const result = await makeVoipCall(phoneNumber, options.voipProvider, options.clinicId)
    return { ...result, method: 'voip' }
  }

  // 4. 기본: tel: URI 시도
  try {
    makeTelCall(phoneNumber)
    return { success: true, method: 'tel' }
  } catch (error) {
    return { success: false, method: 'tel', error: '전화를 걸 수 없습니다.' }
  }
}

// 전화번호 유효성 검사
export function isValidPhoneNumber(phone: string): boolean {
  const cleaned = phone.replace(/[^0-9]/g, '')

  // 한국 전화번호 패턴
  // 휴대폰: 010, 011, 016, 017, 018, 019로 시작 + 7-8자리
  // 일반전화: 02-0n + 7-8자리
  const mobilePattern = /^01[016789]\d{7,8}$/
  const landlinePattern = /^0[2-6]\d{7,8}$/

  return mobilePattern.test(cleaned) || landlinePattern.test(cleaned)
}

// 전화번호 마스킹 (개인정보 보호)
export function maskPhoneNumber(phone: string): string {
  const cleaned = phone.replace(/[^0-9]/g, '')

  if (cleaned.length === 11) {
    // 010-****-1234
    return `${cleaned.slice(0, 3)}-****-${cleaned.slice(7)}`
  } else if (cleaned.length === 10) {
    // 02-****-1234 또는 010-***-1234
    if (cleaned.startsWith('02')) {
      return `02-****-${cleaned.slice(6)}`
    }
    return `${cleaned.slice(0, 3)}-***-${cleaned.slice(6)}`
  }

  return phone
}

// 전화번호 포맷 표시 (하이픈 추가)
export function displayPhoneNumber(phone: string): string {
  const cleaned = phone.replace(/[^0-9]/g, '')

  if (cleaned.length === 11) {
    // 010-1234-5678
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 7)}-${cleaned.slice(7)}`
  } else if (cleaned.length === 10) {
    if (cleaned.startsWith('02')) {
      // 02-1234-5678
      return `02-${cleaned.slice(2, 6)}-${cleaned.slice(6)}`
    }
    // 031-123-4567
    return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}-${cleaned.slice(6)}`
  } else if (cleaned.length === 9 && cleaned.startsWith('02')) {
    // 02-123-4567
    return `02-${cleaned.slice(2, 5)}-${cleaned.slice(5)}`
  }

  return phone
}
