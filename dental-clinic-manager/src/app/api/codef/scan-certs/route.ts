// ============================================
// NPKI 공동인증서 자동 검색 API (서버사이드 파일시스템 스캔)
// GET: 저장매체별 인증서 자동 검색
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import os from 'os'
import forge from 'node-forge'

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

interface ScannedCert {
  type: 'der' | 'pfx'
  subjectCN: string
  issuerCN: string
  issuerOU: string
  serialNumber: string
  notBefore: string
  notAfter: string
  isExpired: boolean
  certDerBase64: string
  keyDerBase64: string
  pfxBase64: string
  certPath: string
  policyOid: string
  usage: string
  fileName: string
}

/**
 * 인증서 정책 OID 추출
 */
function extractPolicyOid(cert: forge.pki.Certificate): string {
  try {
    const ext = cert.getExtension('certificatePolicies')
    if (ext && (ext as any).value) {
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
    // ignore
  }
  return ''
}

/**
 * DER 인증서 파싱
 */
function parseDerCert(certPath: string, keyPath: string, dirPath: string): ScannedCert | null {
  try {
    const certBuf = fs.readFileSync(certPath)
    const keyBuf = fs.readFileSync(keyPath)

    const certBase64 = certBuf.toString('base64')
    const keyBase64 = keyBuf.toString('base64')

    // node-forge로 DER 파싱
    const derBuffer = forge.util.decode64(certBase64)
    const asn1 = forge.asn1.fromDer(derBuffer)
    const cert = forge.pki.certificateFromAsn1(asn1)

    const subjectCN = (cert.subject.getField('CN')?.value as string) || '알 수 없음'
    const issuerCN = (cert.issuer.getField('CN')?.value as string) || ''
    const issuerOU = (cert.issuer.getField('OU')?.value as string) || ''
    const notBefore = cert.validity.notBefore
    const notAfter = cert.validity.notAfter
    const isExpired = new Date() > notAfter
    const serialNumber = cert.serialNumber
    const policyOid = extractPolicyOid(cert)
    const usage = CERT_POLICY_USAGE[policyOid] || '일반'

    return {
      type: 'der',
      subjectCN,
      issuerCN,
      issuerOU,
      serialNumber,
      notBefore: notBefore.toISOString(),
      notAfter: notAfter.toISOString(),
      isExpired,
      certDerBase64: certBase64,
      keyDerBase64: keyBase64,
      pfxBase64: '',
      certPath: dirPath,
      policyOid,
      usage,
      fileName: path.basename(certPath),
    }
  } catch (err) {
    console.warn('DER 인증서 파싱 실패:', dirPath, err)
    return null
  }
}

/**
 * PFX 파일 정보 (비밀번호 없이는 파싱 불가 → 파일명만 반환)
 */
function scanPfxFile(filePath: string): ScannedCert | null {
  try {
    const buf = fs.readFileSync(filePath)
    const pfxBase64 = buf.toString('base64')
    const fileName = path.basename(filePath)

    return {
      type: 'pfx',
      subjectCN: fileName.replace(/\.(pfx|p12)$/i, ''),
      issuerCN: 'PFX 인증서 (비밀번호 입력 후 확인)',
      issuerOU: '',
      serialNumber: '',
      notBefore: '',
      notAfter: '',
      isExpired: false,
      certDerBase64: '',
      keyDerBase64: '',
      pfxBase64,
      certPath: path.dirname(filePath),
      policyOid: '',
      usage: '',
      fileName,
    }
  } catch (err) {
    console.warn('PFX 파일 읽기 실패:', filePath, err)
    return null
  }
}

/**
 * 디렉토리를 재귀적으로 스캔하여 인증서 검색
 */
function scanDirectory(dir: string, certType: 'der' | 'pfx', results: ScannedCert[], depth = 0): void {
  if (depth > 5) return // 최대 5단계까지만 탐색

  try {
    if (!fs.existsSync(dir)) return
    const entries = fs.readdirSync(dir, { withFileTypes: true })

    if (certType === 'der') {
      // signCert.der + signPri.key 쌍 검색
      const hasCert = entries.some(e => e.isFile() && (e.name === 'signCert.der' || e.name.toLowerCase().endsWith('.der')))
      const hasKey = entries.some(e => e.isFile() && (e.name === 'signPri.key' || e.name.toLowerCase().endsWith('.key')))

      if (hasCert && hasKey) {
        const certFile = entries.find(e => e.isFile() && e.name === 'signCert.der')
          || entries.find(e => e.isFile() && e.name.toLowerCase().endsWith('.der'))
        const keyFile = entries.find(e => e.isFile() && e.name === 'signPri.key')
          || entries.find(e => e.isFile() && e.name.toLowerCase().endsWith('.key'))

        if (certFile && keyFile) {
          const cert = parseDerCert(
            path.join(dir, certFile.name),
            path.join(dir, keyFile.name),
            dir
          )
          if (cert) results.push(cert)
        }
      }
    } else {
      // PFX/P12 파일 검색
      for (const entry of entries) {
        if (entry.isFile()) {
          const name = entry.name.toLowerCase()
          if (name.endsWith('.pfx') || name.endsWith('.p12')) {
            const pfx = scanPfxFile(path.join(dir, entry.name))
            if (pfx) results.push(pfx)
          }
        }
      }
    }

    // 하위 디렉토리 재귀 탐색
    for (const entry of entries) {
      if (entry.isDirectory() && !entry.name.startsWith('.')) {
        scanDirectory(path.join(dir, entry.name), certType, results, depth + 1)
      }
    }
  } catch (err) {
    // 권한 없는 디렉토리 등 무시
  }
}

/**
 * OS별 NPKI 기본 경로 반환
 */
function getNpkiPaths(mediaType: 'hard' | 'removable'): string[] {
  const platform = os.platform()
  const homeDir = os.homedir()
  const paths: string[] = []

  if (mediaType === 'hard') {
    if (platform === 'darwin') {
      // Mac: ~/Library/Preferences/NPKI/
      paths.push(path.join(homeDir, 'Library', 'Preferences', 'NPKI'))
    } else if (platform === 'win32') {
      // Windows: C:\Users\{user}\AppData\LocalLow\NPKI\
      paths.push(path.join(homeDir, 'AppData', 'LocalLow', 'NPKI'))
      // 추가 경로: C:\Program Files\NPKI
      paths.push('C:\\Program Files\\NPKI')
      paths.push('C:\\Program Files (x86)\\NPKI')
    } else {
      // Linux: ~/NPKI/
      paths.push(path.join(homeDir, 'NPKI'))
    }
  } else {
    // 이동식디스크
    if (platform === 'darwin') {
      // Mac: /Volumes/*/NPKI/
      try {
        const volumes = fs.readdirSync('/Volumes')
        for (const vol of volumes) {
          // 시스템 볼륨 제외
          if (vol === 'Macintosh HD' || vol === 'Recovery') continue
          paths.push(path.join('/Volumes', vol, 'NPKI'))
        }
      } catch {
        // /Volumes 접근 실패 무시
      }
    } else if (platform === 'win32') {
      // Windows: D:\NPKI, E:\NPKI, ... Z:\NPKI
      for (let i = 68; i <= 90; i++) { // D ~ Z
        const drive = String.fromCharCode(i)
        paths.push(`${drive}:\\NPKI`)
      }
    } else {
      // Linux: /media/*/NPKI, /mnt/*/NPKI
      for (const mountDir of ['/media', '/mnt']) {
        try {
          const mounts = fs.readdirSync(mountDir)
          for (const m of mounts) {
            const subPath = path.join(mountDir, m)
            try {
              const subs = fs.readdirSync(subPath)
              for (const s of subs) {
                paths.push(path.join(subPath, s, 'NPKI'))
              }
            } catch {
              paths.push(path.join(subPath, 'NPKI'))
            }
          }
        } catch {
          // 접근 실패 무시
        }
      }
    }
  }

  return paths
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const mediaType = (searchParams.get('mediaType') || 'all') as 'hard' | 'removable' | 'all'
    const certType = (searchParams.get('certType') || 'all') as 'der' | 'pfx' | 'all'

    // 'all'이면 하드+이동식 모두 검색
    const npkiPaths: string[] = mediaType === 'all'
      ? [...getNpkiPaths('hard'), ...getNpkiPaths('removable')]
      : getNpkiPaths(mediaType)

    // 'all'이면 DER+PFX 모두 검색
    const typesToScan: ('der' | 'pfx')[] = certType === 'all' ? ['der', 'pfx'] : [certType]

    const results: ScannedCert[] = []

    for (const npkiPath of npkiPaths) {
      for (const t of typesToScan) {
        scanDirectory(npkiPath, t, results)
      }
    }

    // 정렬: 유효한 것 우선, DER 우선, 만료일 늦은 것 우선
    results.sort((a, b) => {
      if (a.isExpired !== b.isExpired) return a.isExpired ? 1 : -1
      if (a.type !== b.type) return a.type === 'der' ? -1 : 1
      if (a.notAfter && b.notAfter) {
        return new Date(b.notAfter).getTime() - new Date(a.notAfter).getTime()
      }
      return 0
    })

    return NextResponse.json({
      success: true,
      certs: results,
      scannedPaths: npkiPaths.filter(p => fs.existsSync(p)),
      platform: os.platform(),
    })
  } catch (error) {
    console.error('인증서 스캔 오류:', error)
    return NextResponse.json(
      { success: false, error: '인증서 검색 중 오류가 발생했습니다.', certs: [] },
      { status: 500 }
    )
  }
}
