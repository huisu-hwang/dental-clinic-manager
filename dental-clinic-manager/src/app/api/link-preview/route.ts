/**
 * Link Preview API
 * GET /api/link-preview?url=... - URL의 OG 메타데이터 추출
 */

import { NextRequest, NextResponse } from 'next/server'

// SSRF 방지: 내부 IP 차단
const isInternalUrl = (urlStr: string): boolean => {
  try {
    const url = new URL(urlStr)
    const hostname = url.hostname.toLowerCase()
    // 내부 IP 범위 차단
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname.startsWith('192.168.') ||
      hostname.startsWith('10.') ||
      hostname.startsWith('172.16.') ||
      hostname.startsWith('172.17.') ||
      hostname.startsWith('172.18.') ||
      hostname.startsWith('172.19.') ||
      hostname.startsWith('172.2') ||
      hostname.startsWith('172.30.') ||
      hostname.startsWith('172.31.') ||
      hostname === '[::1]' ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal')
    ) {
      return true
    }
    return false
  } catch {
    return true
  }
}

// HTML에서 OG 메타 태그 추출
const extractOgMeta = (html: string): { title?: string; description?: string; image?: string; siteName?: string } => {
  const meta: { title?: string; description?: string; image?: string; siteName?: string } = {}

  // og:title
  const titleMatch = html.match(/<meta[^>]*property=["']og:title["'][^>]*content=["']([^"']*)["']/i)
    || html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*property=["']og:title["']/i)
  if (titleMatch) meta.title = titleMatch[1]

  // og:description
  const descMatch = html.match(/<meta[^>]*property=["']og:description["'][^>]*content=["']([^"']*)["']/i)
    || html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*property=["']og:description["']/i)
  if (descMatch) meta.description = descMatch[1]

  // og:image
  const imgMatch = html.match(/<meta[^>]*property=["']og:image["'][^>]*content=["']([^"']*)["']/i)
    || html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*property=["']og:image["']/i)
  if (imgMatch) meta.image = imgMatch[1]

  // og:site_name
  const siteMatch = html.match(/<meta[^>]*property=["']og:site_name["'][^>]*content=["']([^"']*)["']/i)
    || html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*property=["']og:site_name["']/i)
  if (siteMatch) meta.siteName = siteMatch[1]

  // Fallback: <title> 태그
  if (!meta.title) {
    const titleTagMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i)
    if (titleTagMatch) meta.title = titleTagMatch[1].trim()
  }

  // Fallback: meta description
  if (!meta.description) {
    const metaDescMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i)
      || html.match(/<meta[^>]*content=["']([^"']*)["'][^>]*name=["']description["']/i)
    if (metaDescMatch) meta.description = metaDescMatch[1]
  }

  return meta
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const url = searchParams.get('url')

    if (!url) {
      return NextResponse.json({ error: 'URL이 필요합니다.' }, { status: 400 })
    }

    // URL 유효성 검사
    let parsedUrl: URL
    try {
      parsedUrl = new URL(url)
    } catch {
      return NextResponse.json({ error: '유효하지 않은 URL입니다.' }, { status: 400 })
    }

    // HTTPS/HTTP만 허용
    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return NextResponse.json({ error: '지원하지 않는 프로토콜입니다.' }, { status: 400 })
    }

    // SSRF 방지
    if (isInternalUrl(url)) {
      return NextResponse.json({ error: '내부 URL은 접근할 수 없습니다.' }, { status: 403 })
    }

    // URL에서 HTML 가져오기 (5초 타임아웃)
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LinkPreviewBot/1.0)',
        'Accept': 'text/html',
      },
      redirect: 'follow',
    })

    clearTimeout(timeout)

    if (!response.ok) {
      return NextResponse.json({ error: '페이지를 가져올 수 없습니다.' }, { status: 502 })
    }

    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('text/html')) {
      return NextResponse.json({ error: 'HTML 페이지가 아닙니다.' }, { status: 400 })
    }

    // HTML 일부만 읽기 (메타 태그는 보통 head 영역에 있으므로 50KB면 충분)
    const reader = response.body?.getReader()
    if (!reader) {
      return NextResponse.json({ error: '응답을 읽을 수 없습니다.' }, { status: 502 })
    }

    let html = ''
    const decoder = new TextDecoder()
    const maxBytes = 50 * 1024

    while (html.length < maxBytes) {
      const { done, value } = await reader.read()
      if (done) break
      html += decoder.decode(value, { stream: true })
    }
    reader.cancel()

    const meta = extractOgMeta(html)

    if (!meta.title && !meta.description && !meta.image) {
      return NextResponse.json({ error: '메타데이터를 찾을 수 없습니다.' }, { status: 404 })
    }

    // 5분 캐시
    return NextResponse.json(
      {
        url,
        title: meta.title || null,
        description: meta.description || null,
        image: meta.image || null,
        siteName: meta.siteName || parsedUrl.hostname,
      },
      {
        headers: {
          'Cache-Control': 'public, max-age=300, s-maxage=300',
        },
      }
    )
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return NextResponse.json({ error: '요청 시간이 초과되었습니다.' }, { status: 504 })
    }
    console.error('[GET /api/link-preview] Error:', error)
    return NextResponse.json(
      { error: '링크 미리보기를 가져올 수 없습니다.' },
      { status: 500 }
    )
  }
}
