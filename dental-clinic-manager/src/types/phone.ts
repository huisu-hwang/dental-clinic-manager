// 전화 다이얼 설정 타입 정의

// 지원되는 전화 다이얼 프로토콜
export type PhoneDialProtocol =
  | 'tel'       // 기본 tel: URI (모바일, 소프트폰)
  | 'callto'    // Skype 등
  | 'sip'       // SIP 클라이언트
  | 'http'      // IP 전화기 HTTP API

// 전화 다이얼 설정
export interface PhoneDialSettings {
  // 사용할 프로토콜
  protocol: PhoneDialProtocol

  // HTTP API 설정 (protocol이 'http'일 때 사용)
  httpSettings?: {
    // IP 전화기 IP 주소 또는 호스트명
    host: string
    // 포트 번호 (기본값: 80)
    port?: number
    // API 경로 템플릿 ({number}가 전화번호로 대체됨)
    // 예: /dial?number={number} 또는 /cgi-bin/api-make_call?phonenumber={number}
    pathTemplate: string
    // HTTP 메서드
    method?: 'GET' | 'POST'
    // 인증 정보 (선택)
    auth?: {
      username: string
      password: string
    }
  }

  // 전화번호 포맷 설정
  numberFormat?: {
    // 국가 코드 자동 추가 (예: +82)
    countryCode?: string
    // 앞자리 0 제거 여부 (국제 전화 시)
    removeLeadingZero?: boolean
    // 특수문자 제거 여부
    removeSpecialChars?: boolean
  }
}

// 기본 설정값
export const DEFAULT_PHONE_DIAL_SETTINGS: PhoneDialSettings = {
  protocol: 'tel',
  numberFormat: {
    removeSpecialChars: true
  }
}

// IP 전화기 프리셋 (일반적인 제조사별 설정)
export interface PhonePreset {
  id: string
  name: string
  description: string
  settings: Partial<PhoneDialSettings['httpSettings']>
}

export const PHONE_PRESETS: PhonePreset[] = [
  {
    id: 'yealink',
    name: 'Yealink',
    description: 'Yealink IP 전화기',
    settings: {
      pathTemplate: '/servlet?key=number={number}&outgoing_uri=',
      method: 'GET'
    }
  },
  {
    id: 'grandstream',
    name: 'Grandstream',
    description: 'Grandstream IP 전화기',
    settings: {
      pathTemplate: '/cgi-bin/api-make_call?phonenumber={number}',
      method: 'GET'
    }
  },
  {
    id: 'cisco',
    name: 'Cisco',
    description: 'Cisco IP 전화기',
    settings: {
      pathTemplate: '/CGI/Execute?XML=<CiscoIPPhoneExecute><ExecuteItem Priority="0" URL="Dial:{number}"/></CiscoIPPhoneExecute>',
      method: 'POST'
    }
  },
  {
    id: 'polycom',
    name: 'Polycom',
    description: 'Polycom IP 전화기',
    settings: {
      pathTemplate: '/api/v1/callctrl/dial?number={number}',
      method: 'POST'
    }
  },
  {
    id: 'snom',
    name: 'Snom',
    description: 'Snom IP 전화기',
    settings: {
      pathTemplate: '/command.htm?number={number}',
      method: 'GET'
    }
  },
  {
    id: 'custom',
    name: '사용자 정의',
    description: '직접 API 경로 설정',
    settings: {
      pathTemplate: '/dial?number={number}',
      method: 'GET'
    }
  }
]
