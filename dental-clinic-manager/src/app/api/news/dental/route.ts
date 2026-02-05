import { NextResponse } from 'next/server'
import * as cheerio from 'cheerio'

interface NewsItem {
  title: string
  link: string
  source: string
  date: string
}

interface CrawledArticle {
  id: number
  title: string
  link: string
  category: 'latest' | 'popular'
}

// 캐시 (10분)
let cachedLatest: CrawledArticle[] | null = null
let cachedPopular: CrawledArticle[] | null = null
let cacheTimestamp: number = 0
const CACHE_DURATION = 10 * 60 * 1000 // 10분

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type') // 'latest' | 'popular' | null (all)

  try {
    const now = Date.now()

    // 캐시 확인
    if (cachedLatest && cachedPopular && (now - cacheTimestamp) < CACHE_DURATION) {
      return returnResponse(cachedLatest, cachedPopular, type, true)
    }

    // 실시간 크롤링
    const [latest, popular] = await Promise.all([
      crawlDailyDental('latest'),
      crawlDailyDental('popular')
    ])

    // 캐시 업데이트
    if (latest.length > 0 || popular.length > 0) {
      cachedLatest = latest
      cachedPopular = popular
      cacheTimestamp = now
    }

    return returnResponse(latest, popular, type, false)
  } catch (error) {
    console.error('[News API] Error:', error)
    // 캐시가 있으면 캐시 반환
    if (cachedLatest && cachedPopular) {
      return returnResponse(cachedLatest, cachedPopular, type, true)
    }
    return NextResponse.json({
      articles: { latest: [], popular: [] },
      error: 'Failed to fetch news'
    }, { status: 500 })
  }
}

function returnResponse(
  latest: CrawledArticle[],
  popular: CrawledArticle[],
  type: string | null,
  cached: boolean
) {
  // 각 카테고리 3개씩만 반환
  const limitedLatest = latest.slice(0, 3)
  const limitedPopular = popular.slice(0, 3)

  if (type === 'latest') {
    return NextResponse.json({
      articles: limitedLatest,
      cached,
      source: 'crawled'
    })
  }
  if (type === 'popular') {
    return NextResponse.json({
      articles: limitedPopular,
      cached,
      source: 'crawled'
    })
  }

  // 기본: 둘 다 반환
  return NextResponse.json({
    articles: {
      latest: limitedLatest,
      popular: limitedPopular
    },
    cached,
    source: 'crawled'
  })
}

// 치의신보 크롤링 함수
async function crawlDailyDental(category: 'latest' | 'popular'): Promise<CrawledArticle[]> {
  // 최신기사와 인기기사 모두 전체기사 페이지에서 가져옴
  const url = 'https://www.dailydental.co.kr/news/articleList.html?sc_section_code=S1N1&view_type=sm'

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
        'Cache-Control': 'no-cache',
      },
      next: { revalidate: 600 } // 10분 캐시
    })

    if (!response.ok) {
      console.error(`[News API] Failed to fetch ${category}:`, response.status)
      return []
    }

    const html = await response.text()
    const $ = cheerio.load(html)

    const articles: CrawledArticle[] = []
    const seenLinks = new Set<string>()

    // 인기 게시물: "많이 본 뉴스" 섹션에서 가져오기
    if (category === 'popular') {
      // 방법 1: 'h2 a' 링크 텍스트로 찾기
      $('h2 a').each((_, heading) => {
        const $heading = $(heading)
        if ($heading.text().includes('많이 본 뉴스')) {
          // 상위 div를 찾아서 그 안의 ul > li > a 추출
          const $container = $heading.closest('div').parent()
          $container.find('ul li a[href*="article.html"]').each((index, element) => {
            if (articles.length >= 5) return false

            const $el = $(element)
            const href = $el.attr('href')
            // 텍스트에서 숫자 제거하고 제목만 추출
            const text = $el.text().trim()
            const titleMatch = text.match(/^\d+\s*(.+)$/)
            const articleTitle = titleMatch ? titleMatch[1].trim() : text

            if (!href || !articleTitle || articleTitle.length < 5) return

            const fullLink = href.startsWith('http')
              ? href
              : `https://www.dailydental.co.kr${href}`

            if (seenLinks.has(fullLink)) return
            seenLinks.add(fullLink)

            articles.push({
              id: articles.length + 1,
              title: articleTitle.substring(0, 100).trim(),
              link: fullLink,
              category
            })
          })
        }
      })

      // 방법 2: 첫 번째 방법이 실패한 경우 직접 패턴으로 찾기
      if (articles.length === 0) {
        // 숫자 + 제목 패턴의 링크 찾기
        $('a[href*="article.html"]').each((_, element) => {
          if (articles.length >= 5) return false

          const $el = $(element)
          const href = $el.attr('href')
          const text = $el.text().trim()

          // "1 제목" 형식인지 확인
          const titleMatch = text.match(/^(\d+)\s+(.+)$/)
          if (!titleMatch) return

          const articleTitle = titleMatch[2].trim()
          if (!href || !articleTitle || articleTitle.length < 5) return

          const fullLink = href.startsWith('http')
            ? href
            : `https://www.dailydental.co.kr${href}`

          if (seenLinks.has(fullLink)) return
          seenLinks.add(fullLink)

          articles.push({
            id: articles.length + 1,
            title: articleTitle.substring(0, 100).trim(),
            link: fullLink,
            category
          })
        })
      }
    }

    // 최신 기사: 메인 기사 목록에서 가져오기
    if (category === 'latest') {
      // 기사 목록의 각 항목에서 h2 제목 추출
      $('ul li').each((_, element) => {
        if (articles.length >= 5) return false

        const $el = $(element)
        const $link = $el.find('a[href*="article.html"]').first()
        const href = $link.attr('href')

        // h2 태그에서 제목 추출
        const $title = $link.find('h2')
        const title = $title.text().trim()

        if (!href || !title || title.length < 5) return

        // 메뉴/버튼 텍스트 제외
        const excludeTexts = ['로그인', '회원가입', '기사검색', '뉴스', '오피니언', '포토', '전체기사', '더보기', '기사목록', '디지털 치의신보', '많이 본 뉴스', '임상강좌']
        if (excludeTexts.some(text => title.includes(text))) return

        const fullLink = href.startsWith('http')
          ? href
          : `https://www.dailydental.co.kr${href}`

        if (seenLinks.has(fullLink)) return
        seenLinks.add(fullLink)

        articles.push({
          id: articles.length + 1,
          title: title.substring(0, 100).trim(),
          link: fullLink,
          category
        })
      })
    }

    console.log(`[News API] Crawled ${category}: ${articles.length} articles`)
    return articles.slice(0, 5)
  } catch (error) {
    console.error(`[News API] Crawl error (${category}):`, error)
    return []
  }
}
