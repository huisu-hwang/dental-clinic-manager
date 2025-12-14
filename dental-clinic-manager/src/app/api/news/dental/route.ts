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
  // 여러 소스를 시도 (우선순위 순서)
  const sources = [
    {
      name: 'RSS 피드 (allArticle)',
      url: 'https://www.dailydental.co.kr/rss/allArticle.xml',
      parser: parseRSSFeed
    },
    {
      name: 'RSS 피드 (S1N1)',
      url: 'https://www.dailydental.co.kr/rss/S1N1.xml',
      parser: parseRSSFeed
    },
    {
      name: '메인 페이지',
      url: 'https://www.dailydental.co.kr/',
      parser: parseNewsFromHtml
    },
    {
      name: '뉴스 목록 페이지',
      url: 'https://www.dailydental.co.kr/news/articleList.html?sc_section_code=S1N1',
      parser: parseNewsFromHtml
    }
  ]

  for (const source of sources) {
    try {
      console.log(`[News API] Trying ${source.name}: ${source.url}`)

      const response = await fetch(source.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Accept': source.url.endsWith('.xml')
            ? 'application/rss+xml, application/xml, text/xml, */*'
            : 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
          'Accept-Encoding': 'gzip, deflate, br',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Sec-Fetch-User': '?1',
          'Cache-Control': 'max-age=0',
        },
        next: { revalidate: 300 } // 5분 캐시
      })

      console.log(`[News API] ${source.name} response:`, response.status, response.statusText)

      if (!response.ok) {
        console.warn(`[News API] ${source.name} failed:`, response.status)
        continue // 다음 소스 시도
      }

      const content = await response.text()
      console.log(`[News API] ${source.name} content size:`, (content.length / 1024).toFixed(2), 'KB')

      const news = source.parser(content)

      if (news.length > 0) {
        console.log(`[News API] ✅ ${source.name} succeeded: ${news.length} articles`)
        return news.slice(0, 5)
      } else {
        console.warn(`[News API] ${source.name} returned no articles`)
      }
    } catch (error) {
      console.error(`[News API] ${source.name} error:`, error instanceof Error ? error.message : error)
      continue // 다음 소스 시도
    }
  }

  console.error('[News API] ❌ All sources failed')
  return []
}

function parseRSSFeed(xml: string): NewsItem[] {
  const news: NewsItem[] = []

  try {
    // RSS 아이템 추출
    const itemPattern = /<item>([\s\S]*?)<\/item>/gi
    const titlePattern = /<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?<\/title>/i
    const linkPattern = /<link>(.*?)<\/link>/i
    const pubDatePattern = /<pubDate>(.*?)<\/pubDate>/i

    let match
    while ((match = itemPattern.exec(xml)) !== null && news.length < 10) {
      const item = match[1]

      const titleMatch = titlePattern.exec(item)
      const linkMatch = linkPattern.exec(item)
      const dateMatch = pubDatePattern.exec(item)

      if (titleMatch && linkMatch) {
        let title = titleMatch[1]
          .replace(/<!\[CDATA\[/g, '')
          .replace(/\]\]>/g, '')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .trim()

        const link = linkMatch[1].trim()

        if (title && title.length >= 5) {
          news.push({
            title,
            link,
            source: '치의신보',
            date: dateMatch ? new Date(dateMatch[1]).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
          })
        }
      }
    }

    console.log('[News API] RSS parsed:', news.length, 'articles')
  } catch (error) {
    console.error('[News API] RSS parse error:', error)
  }

  return news
}

function parseNewsFromHtml(html: string): NewsItem[] {
  const news: NewsItem[] = []

  try {
    const seenLinks = new Set<string>()

    // 기사 링크를 모두 찾기
    const articlePattern = /<a[^>]*href="([^"]*(?:\/news\/articleView\.html\?idxno=\d+|articleView\.html\?idxno=\d+))"[^>]*>([\s\S]*?)<\/a>/gi

    let match
    let count = 0
    const MAX_ARTICLES = 20 // 더 많이 수집해서 필터링

    while ((match = articlePattern.exec(html)) !== null && count < MAX_ARTICLES) {
      let link = match[1]
      let titleContent = match[2]

      // 링크 정규화
      if (!link.startsWith('http')) {
        link = `https://www.dailydental.co.kr${link.startsWith('/') ? '' : '/'}${link}`
      }

      // 중복 링크 건너뛰기
      if (seenLinks.has(link)) continue
      seenLinks.add(link)

      // titleContent에서 실제 텍스트만 추출
      let title = titleContent
        .replace(/<img[^>]*>/gi, '') // 이미지 태그 제거
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

      // 숫자로 시작하는 경우 숫자 제거
      title = title.replace(/^\d+[\.\s:：]+/, '').trim()

      // 괄호 안의 숫자 제거 (예: "[1] 제목" -> "제목")
      title = title.replace(/^[\[\(]\d+[\]\)]\s*/, '').trim()

      // 빈 제목이나 너무 짧은 제목 건너뛰기
      if (!title || title.length < 5 || title.length > 200) continue

      // 메뉴나 버튼 텍스트 제외
      const excludeKeywords = [
        '로그인', '회원가입', '기사검색', '뉴스', '오피니언', '포토', '전체기사',
        '더보기', '목록', '이전', '다음', '구독', '신청', '주요뉴스', '최신뉴스',
        '많이 본 뉴스', '인기기사', 'TOP', 'BEST', '바로가기', '자세히', 'more',
        '기사보기', '계속읽기', '전문보기'
      ]

      const isExcluded = excludeKeywords.some(keyword => {
        const lowerTitle = title.toLowerCase()
        const lowerKeyword = keyword.toLowerCase()
        return lowerTitle === lowerKeyword || lowerTitle.includes(lowerKeyword + ' ') || lowerTitle.endsWith(' ' + lowerKeyword)
      })

      if (isExcluded) continue

      // 유효한 기사로 판단
      news.push({
        title,
        link,
        source: '치의신보',
        date: new Date().toISOString().split('T')[0]
      })

      count++
      console.log(`[News API] Parsed [${count}]: ${title}`)
    }

    console.log('[News API] HTML parsed:', news.length, 'articles')
  } catch (error) {
    console.error('[News API] HTML parse error:', error)
  }

  return news
}
