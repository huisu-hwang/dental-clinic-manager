import { NextResponse } from 'next/server'

interface NewsItem {
  title: string
  link: string
  source: string
  date: string
}

// 데모 뉴스 데이터 (폴백용)
const fallbackNews: NewsItem[] = [
  { title: '2024년 치과 건강보험 수가 인상 확정', link: 'https://www.dailydental.co.kr', source: '치의신보', date: new Date().toISOString().split('T')[0] },
  { title: '디지털 치과 진료 시스템 도입 가속화', link: 'https://www.dailydental.co.kr', source: '치의신보', date: new Date().toISOString().split('T')[0] },
  { title: '치과 감염관리 가이드라인 개정안 발표', link: 'https://www.dailydental.co.kr', source: '치의신보', date: new Date().toISOString().split('T')[0] },
]

// 캐시 (5분)
let cachedNews: NewsItem[] | null = null
let cacheTimestamp: number = 0
const CACHE_DURATION = 5 * 60 * 1000 // 5분

export async function GET() {
  try {
    // 캐시 확인
    const now = Date.now()
    if (cachedNews && (now - cacheTimestamp) < CACHE_DURATION) {
      return NextResponse.json({ news: cachedNews, cached: true })
    }

    // 치의신보 메인 페이지에서 뉴스 가져오기 시도
    const news = await fetchDailyDentalNews()

    if (news.length > 0) {
      cachedNews = news
      cacheTimestamp = now
      return NextResponse.json({ news, cached: false })
    }

    // 실패 시 폴백 데이터 반환
    return NextResponse.json({ news: fallbackNews, cached: false, fallback: true })
  } catch (error) {
    console.error('[News API] Error:', error)
    return NextResponse.json({ news: fallbackNews, cached: false, fallback: true, error: 'Failed to fetch news' })
  }
}

async function fetchDailyDentalNews(): Promise<NewsItem[]> {
  try {
    // 치의신보 최신기사 페이지
    const response = await fetch('https://www.dailydental.co.kr/news/articleList.html?sc_section_code=S1N1&view_type=sm', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache',
      },
      next: { revalidate: 300 } // 5분 캐시
    })

    if (!response.ok) {
      console.error('[News API] Response not OK:', response.status)
      return []
    }

    const html = await response.text()

    // HTML에서 뉴스 기사 파싱
    const news = parseNewsFromHtml(html)
    return news.slice(0, 5) // 최대 5개
  } catch (error) {
    console.error('[News API] Fetch error:', error)
    return []
  }
}

function parseNewsFromHtml(html: string): NewsItem[] {
  const news: NewsItem[] = []

  try {
    // 기사 목록 패턴 찾기 (치의신보 HTML 구조에 맞게 조정)
    // <a href="/news/articleView.html?idxno=XXXXX" class="..." >기사제목</a>
    const articlePattern = /<a[^>]*href="(\/news\/articleView\.html\?idxno=\d+)"[^>]*>([^<]+)<\/a>/gi
    const datePattern = /(\d{4})\.(\d{2})\.(\d{2})/g

    let match
    const seenTitles = new Set<string>()

    while ((match = articlePattern.exec(html)) !== null) {
      const link = match[1]
      let title = match[2].trim()

      // HTML 엔티티 디코딩
      title = title
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/\s+/g, ' ')
        .trim()

      // 빈 제목이나 너무 짧은 제목 건너뛰기
      if (!title || title.length < 5) continue

      // 중복 제목 건너뛰기
      if (seenTitles.has(title)) continue
      seenTitles.add(title)

      // 메뉴나 버튼 텍스트 제외
      if (['로그인', '회원가입', '기사검색', '뉴스', '오피니언', '포토', '전체기사'].includes(title)) continue

      news.push({
        title,
        link: `https://www.dailydental.co.kr${link}`,
        source: '치의신보',
        date: new Date().toISOString().split('T')[0]
      })

      if (news.length >= 5) break
    }

    // 대체 패턴 시도 (다른 HTML 구조)
    if (news.length === 0) {
      const altPattern = /<div[^>]*class="[^"]*list-titles[^"]*"[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/gi

      while ((match = altPattern.exec(html)) !== null) {
        const link = match[1]
        let title = match[2].trim()

        title = title
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/\s+/g, ' ')
          .trim()

        if (!title || title.length < 5) continue
        if (seenTitles.has(title)) continue
        seenTitles.add(title)

        const fullLink = link.startsWith('http') ? link : `https://www.dailydental.co.kr${link}`

        news.push({
          title,
          link: fullLink,
          source: '치의신보',
          date: new Date().toISOString().split('T')[0]
        })

        if (news.length >= 5) break
      }
    }
  } catch (error) {
    console.error('[News API] Parse error:', error)
  }

  return news
}
