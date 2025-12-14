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
      console.log('[News API] Returning cached news:', cachedNews.length, 'articles')
      return NextResponse.json({ news: cachedNews, cached: true })
    }

    console.log('[News API] Fetching fresh news from 치의신보...')

    // 치의신보 메인 페이지에서 뉴스 가져오기 시도
    const news = await fetchDailyDentalNews()

    if (news.length > 0) {
      cachedNews = news
      cacheTimestamp = now
      console.log('[News API] Successfully fetched', news.length, 'articles')
      return NextResponse.json({
        news,
        cached: false,
        success: true,
        message: `Successfully fetched ${news.length} articles`
      })
    }

    // 실패 시 폴백 데이터 반환
    console.warn('[News API] No articles found, returning fallback data')
    return NextResponse.json({
      news: fallbackNews,
      cached: false,
      fallback: true,
      message: 'Using fallback data - could not fetch live articles'
    })
  } catch (error) {
    console.error('[News API] Error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return NextResponse.json({
      news: fallbackNews,
      cached: false,
      fallback: true,
      error: errorMessage,
      message: 'Error occurred while fetching news'
    })
  }
}

async function fetchDailyDentalNews(): Promise<NewsItem[]> {
  try {
    // 치의신보 메인 페이지 (가장 많이 본 뉴스 포함)
    const response = await fetch('https://www.dailydental.co.kr/', {
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
      },
      next: { revalidate: 300 } // 5분 캐시
    })

    if (!response.ok) {
      console.error('[News API] Response not OK:', response.status, response.statusText)
      return []
    }

    const html = await response.text()

    // HTML에서 "가장 많이 본 뉴스" 파싱
    const news = parseNewsFromHtml(html)

    console.log('[News API] Fetched news count:', news.length)

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

    // 1. 먼저 "가장 많이 본 뉴스" 또는 "인기기사" 섹션 찾기
    const mostViewedPatterns = [
      // 패턴 1: 가장 많이 본 뉴스 섹션
      /<div[^>]*class="[^"]*(?:most|popular|ranking|많이|인기)[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
      // 패턴 2: ul 태그 기반
      /<ul[^>]*class="[^"]*(?:most|popular|ranking|많이|인기)[^"]*"[^>]*>([\s\S]*?)<\/ul>/gi,
    ]

    let mostViewedSection = ''
    for (const sectionPattern of mostViewedPatterns) {
      const sectionMatch = sectionPattern.exec(html)
      if (sectionMatch) {
        mostViewedSection = sectionMatch[1]
        console.log('[News API] Found most viewed section')
        break
      }
    }

    // 2. 섹션을 찾았다면 해당 섹션에서 기사 추출, 아니면 전체 HTML에서 추출
    const targetHtml = mostViewedSection || html

    // 3. 기사 링크 패턴 - 더 광범위하게 수집
    const articlePatterns = [
      // 패턴 1: 기본 articleView 링크
      /<a[^>]*href="(\/news\/articleView\.html\?idxno=\d+)"[^>]*>([\s\S]*?)<\/a>/gi,
      // 패턴 2: 전체 URL
      /<a[^>]*href="(https?:\/\/www\.dailydental\.co\.kr\/news\/articleView\.html\?idxno=\d+)"[^>]*>([\s\S]*?)<\/a>/gi,
    ]

    for (const pattern of articlePatterns) {
      pattern.lastIndex = 0
      let match

      while ((match = pattern.exec(targetHtml)) !== null && news.length < 10) {
        const link = match[1]
        let titleContent = match[2]

        // titleContent에서 실제 텍스트만 추출 (HTML 태그 제거)
        let title = titleContent
          .replace(/<[^>]+>/g, ' ') // 모든 HTML 태그 제거
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&nbsp;/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()

        // 숫자만 있는 경우 건너뛰기 (랭킹 번호)
        if (/^\d+$/.test(title)) continue

        // 숫자로 시작하는 경우 숫자 제거 (예: "1. 제목" -> "제목")
        title = title.replace(/^\d+[\.\s]+/, '').trim()

        // 빈 제목이나 너무 짧은 제목 건너뛰기
        if (!title || title.length < 5) continue

        // 중복 제목 건너뛰기
        if (seenTitles.has(title)) continue

        // 메뉴나 버튼 텍스트 제외
        const excludeKeywords = [
          '로그인', '회원가입', '기사검색', '뉴스', '오피니언', '포토', '전체기사',
          '더보기', '목록', '이전', '다음', '구독', '신청', '주요뉴스', '최신뉴스',
          '많이 본 뉴스', '인기기사', 'TOP', 'BEST'
        ]
        if (excludeKeywords.some(keyword => title === keyword || title.includes('바로가기'))) continue

        seenTitles.add(title)

        const fullLink = link.startsWith('http') ? link : `https://www.dailydental.co.kr${link}`

        news.push({
          title,
          link: fullLink,
          source: '치의신보',
          date: new Date().toISOString().split('T')[0]
        })

        console.log('[News API] Parsed article:', title.substring(0, 30) + '...')
      }

      if (news.length >= 5) break
    }

    console.log('[News API] Total parsed news count:', news.length)
  } catch (error) {
    console.error('[News API] Parse error:', error)
  }

  return news
}
