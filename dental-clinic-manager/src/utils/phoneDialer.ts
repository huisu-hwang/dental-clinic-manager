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

// ========================================
// 네트워크 자동 감지 기능
// ========================================

/**
 * 네트워크 정보 타입
 */
export interface NetworkInfo {
  localIP: string | null
  subnet: string | null
  suggestedIPs: string[]
  commonPorts: number[]
}

/**
 * WebRTC를 사용하여 로컬 IP 주소 감지
 */
export async function detectLocalIP(): Promise<string | null> {
  if (typeof window === 'undefined' || !window.RTCPeerConnection) {
    return null
  }

  return new Promise((resolve) => {
    const pc = new RTCPeerConnection({
      iceServers: [] // STUN 서버 없이 로컬 후보만 수집
    })

    const ips: string[] = []
    let resolved = false

    pc.onicecandidate = (event) => {
      if (resolved) return

      if (event.candidate) {
        const candidate = event.candidate.candidate
        // IP 주소 추출 (IPv4)
        const ipMatch = candidate.match(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})/)
        if (ipMatch) {
          const ip = ipMatch[1]
          // 로컬 네트워크 IP만 수집 (10.x.x.x, 172.16-31.x.x, 192.168.x.x)
          if (isPrivateIP(ip) && !ips.includes(ip)) {
            ips.push(ip)
          }
        }
      } else {
        // 모든 후보 수집 완료
        resolved = true
        pc.close()
        // 192.168.x.x 또는 10.x.x.x 우선
        const preferredIP = ips.find(ip => ip.startsWith('192.168.')) ||
                           ips.find(ip => ip.startsWith('10.')) ||
                           ips[0] || null
        resolve(preferredIP)
      }
    }

    // 데이터 채널 생성하여 ICE 수집 시작
    pc.createDataChannel('')
    pc.createOffer()
      .then(offer => pc.setLocalDescription(offer))
      .catch(() => {
        resolved = true
        pc.close()
        resolve(null)
      })

    // 3초 타임아웃
    setTimeout(() => {
      if (!resolved) {
        resolved = true
        pc.close()
        const preferredIP = ips.find(ip => ip.startsWith('192.168.')) ||
                           ips.find(ip => ip.startsWith('10.')) ||
                           ips[0] || null
        resolve(preferredIP)
      }
    }, 3000)
  })
}

/**
 * 사설 IP 주소인지 확인
 */
function isPrivateIP(ip: string): boolean {
  const parts = ip.split('.').map(Number)
  if (parts.length !== 4) return false

  // 10.0.0.0 - 10.255.255.255
  if (parts[0] === 10) return true

  // 172.16.0.0 - 172.31.255.255
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true

  // 192.168.0.0 - 192.168.255.255
  if (parts[0] === 192 && parts[1] === 168) return true

  return false
}

/**
 * IP 주소에서 서브넷 추출 (예: 192.168.1.100 -> 192.168.1)
 */
function getSubnet(ip: string): string {
  const parts = ip.split('.')
  return parts.slice(0, 3).join('.')
}

/**
 * 서브넷 기반으로 일반적인 기기 IP 주소 목록 생성
 */
function generateSuggestedIPs(subnet: string): string[] {
  const suggestions: string[] = []

  // 일반적인 IP 전화기/네트워크 기기 주소
  const commonEndings = [
    1,    // 게이트웨이 (라우터)
    2, 3, 4, 5,  // 초기 할당 주소
    10, 11, 12,  // 고정 IP 대역
    100, 101, 102, 103, 104, 105, // DHCP 시작 대역
    200, 201, 202, // 고정 기기 대역
    254   // 보조 게이트웨이
  ]

  for (const ending of commonEndings) {
    suggestions.push(`${subnet}.${ending}`)
  }

  return suggestions
}

/**
 * 일반적인 IP 전화기 포트 목록
 */
const COMMON_PHONE_PORTS = [80, 8080, 443, 8443, 5060, 5061]

/**
 * 네트워크 정보 감지
 */
export async function detectNetworkInfo(): Promise<NetworkInfo> {
  const localIP = await detectLocalIP()

  if (!localIP) {
    return {
      localIP: null,
      subnet: null,
      suggestedIPs: [],
      commonPorts: COMMON_PHONE_PORTS
    }
  }

  const subnet = getSubnet(localIP)
  const suggestedIPs = generateSuggestedIPs(subnet)

  return {
    localIP,
    subnet,
    suggestedIPs,
    commonPorts: COMMON_PHONE_PORTS
  }
}

/**
 * 특정 IP:포트로 연결 가능한지 빠르게 테스트
 * no-cors 모드로 요청하므로 실제 응답 확인은 불가하지만, 연결 시도는 가능
 */
export async function quickTestConnection(host: string, port: number): Promise<boolean> {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 2000) // 2초 타임아웃

    await fetch(`http://${host}:${port}/`, {
      method: 'HEAD',
      mode: 'no-cors',
      signal: controller.signal
    })

    clearTimeout(timeoutId)
    return true
  } catch {
    return false
  }
}

/**
 * 여러 IP 주소에 대해 연결 테스트 (IP 전화기 검색)
 */
export async function scanForPhones(
  ips: string[],
  ports: number[] = [80],
  onProgress?: (current: number, total: number, found: string[]) => void
): Promise<string[]> {
  const foundDevices: string[] = []
  const total = ips.length * ports.length
  let current = 0

  for (const ip of ips) {
    for (const port of ports) {
      current++
      const isReachable = await quickTestConnection(ip, port)
      if (isReachable) {
        const device = port === 80 ? ip : `${ip}:${port}`
        if (!foundDevices.includes(device)) {
          foundDevices.push(device)
        }
      }
      onProgress?.(current, total, foundDevices)
    }
  }

  return foundDevices
}
