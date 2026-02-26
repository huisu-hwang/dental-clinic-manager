// ============================================
// NPKI 공동인증서 파싱 유틸리티 (클라이언트 사이드)
// signCert.der / signPri.key 파일에서 인증서 정보 추출
// Created: 2026-02-26
// ============================================

import forge from 'node-forge'

export interface ParsedCertificate {
  subjectCN: string        // 소유자 이름
  issuerCN: string         // 발급기관
  issuerOU: string         // 발급기관 부서
  serialNumber: string     // 일련번호
  notBefore: Date          // 유효기간 시작
  notAfter: Date           // 유효기간 종료
  isExpired: boolean       // 만료 여부
  certDerBase64: string    // 인증서 DER (base64)
  keyDerBase64: string     // 개인키 DER (base64)
  certPath: string         // 인증서 파일 경로 (표시용)
  policyOid: string        // 인증서 정책 OID (용도 판별)
  usage: string            // 인증서 용도 (표시용)
}

export interface CertificateFile {
  certFile: File           // signCert.der
  keyFile: File            // signPri.key
  dirPath: string          // 디렉토리 경로
}

// 한국 공인인증기관(CA) 매핑
const CA_NAMES: Record<string, string> = {
  yessign: '금융결제원(yessign)',
  SignKorea: '코스콤(SignKorea)',
  CrossCert: '한국전자인증(CrossCert)',
  kica: '한국정보인증(KICA)',
  TradeSign: '한국무역정보통신(TradeSign)',
  KFTC: '금융결제원(KFTC)',
  NCASign: 'NCA인증(NCASign)',
}

// 인증서 정책 OID → 용도 매핑
const CERT_POLICY_USAGE: Record<string, string> = {
  '1.2.410.200004.5.1.1.7': '범용(개인)',
  '1.2.410.200004.5.1.1.9': '범용(법인)',
  '1.2.410.200004.5.2.1.1': '은행/보험용',
  '1.2.410.200004.5.2.1.2': '증권/카드용',
  '1.2.410.200004.5.4.1.1': '전자세금계산서용',
  '1.2.410.200005.1.1.5': '범용(개인)',
  '1.2.410.200005.1.1.6.2': '서버용',
}

/**
 * FileList에서 NPKI 인증서 쌍(signCert.der + signPri.key)을 찾아 반환
 */
export function findCertificatePairs(files: FileList): CertificateFile[] {
  type CertEntry = { cert?: File; key?: File; path: string }
  const fileMap = new Map<string, CertEntry>()

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    const relativePath = (file as any).webkitRelativePath || file.name
    const dirPath = relativePath.substring(0, relativePath.lastIndexOf('/'))

    if (file.name === 'signCert.der') {
      const entry: CertEntry = fileMap.get(dirPath) || { path: dirPath }
      entry.cert = file
      fileMap.set(dirPath, entry)
    } else if (file.name === 'signPri.key') {
      const entry: CertEntry = fileMap.get(dirPath) || { path: dirPath }
      entry.key = file
      fileMap.set(dirPath, entry)
    }
  }

  const pairs: CertificateFile[] = []
  fileMap.forEach((value, dirPath) => {
    if (value.cert && value.key) {
      pairs.push({
        certFile: value.cert,
        keyFile: value.key,
        dirPath,
      })
    }
  })

  return pairs
}

/**
 * Uint8Array → base64 변환
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/**
 * 인증서 정책 OID 추출
 */
function extractPolicyOid(cert: forge.pki.Certificate): string {
  try {
    const ext = cert.getExtension('certificatePolicies')
    if (ext && (ext as any).value) {
      // ASN.1에서 정책 OID 추출 시도
      const asn1 = forge.asn1.fromDer((ext as any).value)
      if (asn1.value && Array.isArray(asn1.value) && asn1.value.length > 0) {
        const policyInfo = asn1.value[0]
        if (policyInfo && Array.isArray((policyInfo as any).value) && (policyInfo as any).value.length > 0) {
          const oid = (policyInfo as any).value[0]
          if (oid && oid.value) {
            return forge.asn1.derToOid(oid.value)
          }
        }
      }
    }
  } catch {
    // 파싱 실패 시 무시
  }
  return ''
}

/**
 * DER 인증서 파일을 파싱하여 인증서 정보 추출
 */
export async function parseCertificate(certPair: CertificateFile): Promise<ParsedCertificate> {
  const certArrayBuffer = await certPair.certFile.arrayBuffer()
  const keyArrayBuffer = await certPair.keyFile.arrayBuffer()

  const certBytes = new Uint8Array(certArrayBuffer)
  const keyBytes = new Uint8Array(keyArrayBuffer)

  const certDerBase64 = uint8ArrayToBase64(certBytes)
  const keyDerBase64 = uint8ArrayToBase64(keyBytes)

  // node-forge로 DER 인증서 파싱
  const derBuffer = forge.util.decode64(certDerBase64)
  const asn1 = forge.asn1.fromDer(derBuffer)
  const cert = forge.pki.certificateFromAsn1(asn1)

  // 소유자 이름(CN) 추출
  const subjectCN = cert.subject.getField('CN')?.value as string || '알 수 없음'

  // 발급기관 정보
  const issuerCN = cert.issuer.getField('CN')?.value as string || ''
  const issuerOU = cert.issuer.getField('OU')?.value as string || ''

  // 유효기간
  const notBefore = cert.validity.notBefore
  const notAfter = cert.validity.notAfter
  const isExpired = new Date() > notAfter

  // 일련번호
  const serialNumber = cert.serialNumber

  // 인증서 정책 OID → 용도
  const policyOid = extractPolicyOid(cert)
  const usage = CERT_POLICY_USAGE[policyOid] || '일반'

  return {
    subjectCN,
    issuerCN,
    issuerOU,
    serialNumber,
    notBefore,
    notAfter,
    isExpired,
    certDerBase64,
    keyDerBase64,
    certPath: certPair.dirPath,
    policyOid,
    usage,
  }
}

/**
 * 인증서 경로에서 발급기관(CA) 이름 추출
 */
export function getCANameFromPath(path: string): string {
  for (const [key, name] of Object.entries(CA_NAMES)) {
    if (path.includes(key)) return name
  }
  return '인증기관'
}

/**
 * 날짜 포맷팅 (한국어)
 */
export function formatCertDate(date: Date): string {
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
}

/**
 * 남은 유효일수 계산
 */
export function getRemainingDays(notAfter: Date): number {
  const now = new Date()
  const diff = notAfter.getTime() - now.getTime()
  return Math.ceil(diff / (1000 * 60 * 60 * 24))
}
