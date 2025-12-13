import { NextResponse } from 'next/server'

interface NewsItem {
  title: string
  link: string
  source: string
  date: string
}

// 데모 뉴스 데이터 (폴백용)
const fallbackNews: NewsItem[] = [
  { title: '치의신보 웹사이트를 방문하여 최신 뉴스를 확인하세요', link: 'https://www.dailydental.co.kr', source: '치의신보', date: new Date().toISOString().split('T')[0] },
  { title: '치과 건강보험 수가 관련 최신 소식', link: 'https://www.dailydental.co.kr/news/articleList.html?sc_section_code=S1N1', source: '치의신보', date: new Date().toISOString().split('T')[0] },
  { title: '디지털 치과 진료 시스템 최신 동향', link: 'https://www.dailydental.co.kr/news/articleList.html?sc_section_code=S1N1', source: '치의신보', date: new Date().toISOString().split('T')[0] },
  { title: '치과 감염관리 및 안전 관련 소식', link: 'https://www.dailydental.co.kr/news/articleList.html?sc_section_code=S1N1', source: '치의신보', date: new Date().toISOString().split('T')[0] },
  { title: '치과계 주요 이슈 및 정책 뉴스', link: 'https://www.dailydental.co.kr/news/articleList.html?sc_section_code=S1N1', source: '치의신보', date: new Date().toISOString().split('T')[0] },
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
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
        'Upgrade-Insecure-Requests': '1',
        'Sec-Fetch-Dest': 'document',
        'Sec-Fetch-Mode': 'navigate',
        'Sec-Fetch-Site': 'none',
        'Sec-Fetch-User': '?1',
        'Sec-Ch-Ua': '"Google Chrome";v="131", "Chromium";v="131", "Not_A Brand";v="24"',
        'Sec-Ch-Ua-Mobile': '?0',
        'Sec-Ch-Ua-Platform': '"Windows"',
        'Cache-Control': 'max-age=0',
        'Referer': 'https://www.dailydental.co.kr/',
      },
      next: { revalidate: 300 } // 5분 캐시
    })

    if (!response.ok) {
      console.error('[News API] Response not OK:', response.status, response.statusText)
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
    const seenTitles = new Set<string>()

    // 여러 패턴 시도
    const patterns = [
      // 패턴 1: 기본 링크 패턴
      /<a[^>]*href="(\/news\/articleView\.html\?idxno=\d+)"[^>]*>([^<]+)<\/a>/gi,
      // 패턴 2: 제목이 strong 태그 안에 있는 경우
      /<a[^>]*href="(\/news\/articleView\.html\?idxno=\d+)"[^>]*><strong>([^<]+)<\/strong><\/a>/gi,
      // 패턴 3: 제목이 span 태그 안에 있는 경우
      /<a[^>]*href="(\/news\/articleView\.html\?idxno=\d+)"[^>]*><span[^>]*>([^<]+)<\/span><\/a>/gi,
      // 패턴 4: div 안의 링크
      /<div[^>]*class="[^"]*article[^"]*"[^>]*>[\s\S]*?<a[^>]*href="(\/news\/articleView\.html\?idxno=\d+)"[^>]*>([^<]+)<\/a>/gi,
      // 패턴 5: list-titles 클래스
      /<div[^>]*class="[^"]*list-titles[^"]*"[^>]*>[\s\S]*?<a[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>/gi,
      // 패턴 6: 더 광범위한 패턴
      /<a[^>]*href="([^"]*articleView[^"]*)"[^>]*>([^<]+)<\/a>/gi,
    ]

    for (const pattern of patterns) {
      let match
      pattern.lastIndex = 0 // 정규식 리셋

      while ((match = pattern.exec(html)) !== null) {
        const link = match[1]
        let title = match[2].trim()

        // HTML 엔티티 디코딩
        title = title
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&nbsp;/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()

        // 빈 제목이나 너무 짧은 제목 건너뛰기
        if (!title || title.length < 5) continue

        // 중복 제목 건너뛰기
        if (seenTitles.has(title)) continue

        // 메뉴나 버튼 텍스트 제외
        const excludeKeywords = ['로그인', '회원가입', '기사검색', '뉴스', '오피니언', '포토', '전체기사', '더보기', '목록', '이전', '다음']
        if (excludeKeywords.some(keyword => title === keyword)) continue

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

      if (news.length >= 5) break
    }

    console.log('[News API] Parsed news count:', news.length)
  } catch (error) {
    console.error('[News API] Parse error:', error)
  }

  return news
}
