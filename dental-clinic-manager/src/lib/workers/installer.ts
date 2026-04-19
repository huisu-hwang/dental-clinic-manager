// src/lib/workers/installer.ts

export type DetectedOS = 'windows' | 'mac' | 'unknown'

/**
 * navigator.userAgent로 OS 감지.
 * SSR 환경에서는 'unknown' 반환.
 */
export function detectOS(): DetectedOS {
  if (typeof navigator === 'undefined') return 'unknown'
  const ua = navigator.userAgent
  if (/Windows/i.test(ua)) return 'windows'
  if (/Mac OS X|Macintosh/i.test(ua)) return 'mac'
  return 'unknown'
}

export type DownloadResult =
  | { ok: true }
  | { ok: false; reason: 'unsupported_os' | 'api_error' }

/**
 * 통합 워커 인스톨러 다운로드를 트리거한다.
 * - Windows: GitHub Release `.exe` URL → window.location.assign() 자동 다운로드
 * - Mac (DMG 있음): GitHub Release `.dmg` URL → window.location.assign()
 * - Mac (DMG 없음): /api 응답이 shell script binary → blob anchor 다운로드
 * - Linux/모바일: unsupported_os
 */
export async function triggerWorkerDownload(): Promise<DownloadResult> {
  const os = detectOS()
  if (os === 'unknown') return { ok: false, reason: 'unsupported_os' }

  try {
    const res = await fetch(`/api/marketing/worker-api/download?os=${os}`)
    if (!res.ok) return { ok: false, reason: 'api_error' }

    const contentType = res.headers.get('content-type') || ''

    // JSON 응답: { downloadUrl } → 직접 이동
    if (contentType.includes('application/json')) {
      const data = (await res.json()) as { downloadUrl?: string }
      if (!data.downloadUrl) return { ok: false, reason: 'api_error' }
      window.location.assign(data.downloadUrl)
      return { ok: true }
    }

    // 바이너리 응답 (Mac shell script): blob 다운로드
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = os === 'mac' ? 'marketing-worker-setup.command' : 'marketing-worker-setup.sh'
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
    return { ok: true }
  } catch {
    return { ok: false, reason: 'api_error' }
  }
}
