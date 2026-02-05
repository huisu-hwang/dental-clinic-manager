import { NextResponse } from 'next/server'
import * as cheerio from 'cheerio'

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
      console.log('[News API] Returning cached data')
      return returnResponse(cachedLatest, cachedPopular, type, true)
    }

    // 실시간 크롤링 - 메인 페이지에서 모두 가져옴
    const { latest, popular } = await crawlDailyDentalMainPage()

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

// 치의신보 메인 페이지에서 인기/최신 기사 모두 크롤링
async function crawlDailyDentalMainPage(): Promise<{ latest: CrawledArticle[], popular: CrawledArticle[] }> {
  // 메인 페이지에서 인기 기사와 최신 기사 모두 가져옴
  const mainUrl = 'https://www.dailydental.co.kr/'
  const listUrl = 'https://www.dailydental.co.kr/news/articleList.html?sc_section_code=S1N1&view_type=sm'

  const latestArticles: CrawledArticle[] = []
  const popularArticles: CrawledArticle[] = []

  try {
    // 두 페이지를 병렬로 가져오기
    const [mainResponse, listResponse] = await Promise.all([
      fetch(mainUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
          'Cache-Control': 'no-cache',
        },
        next: { revalidate: 600 }
      }),
      fetch(listUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
          'Cache-Control': 'no-cache',
        },
        next: { revalidate: 600 }
      })
    ])

    // 메인 페이지에서 인기 기사 크롤링
    if (mainResponse.ok) {
      const mainHtml = await mainResponse.text()
      const $main = cheerio.load(mainHtml)

      // "많이 본 뉴스" 섹션의 rate_list에서 기사 추출
      $main('ul.rate_list li a.ofe').each((index, element) => {
        if (popularArticles.length >= 5) return false

        const $el = $main(element)
        const href = $el.attr('href')
        const fullText = $el.text().trim()

        // 숫자 + 제목 형식에서 제목만 추출 (예: "1불법 광고로..." → "불법 광고로...")
        // span.i_rate 안에 숫자가 있고, 그 뒤에 제목
        const $rank = $el.find('span.i_rate')
        let title = fullText
        if ($rank.length > 0) {
          const rankText = $rank.text().trim()
          title = fullText.replace(rankText, '').trim()
        } else {
          // span이 없으면 숫자로 시작하는지 확인
          const titleMatch = fullText.match(/^\d+(.+)$/)
          if (titleMatch) {
            title = titleMatch[1].trim()
          }
        }

        if (!href || !title || title.length < 5) return

        const fullLink = href.startsWith('http')
          ? href
          : `https://www.dailydental.co.kr${href}`

        popularArticles.push({
          id: popularArticles.length + 1,
          title: title.substring(0, 100).trim(),
          link: fullLink,
          category: 'popular'
        })
      })

      console.log(`[News API] Crawled popular: ${popularArticles.length} articles`)
    }

    // 기사 목록 페이지에서 최신 기사 크롤링
    if (listResponse.ok) {
      const listHtml = await listResponse.text()
      const $list = cheerio.load(listHtml)
      const seenLinks = new Set<string>()

      // 제외할 텍스트
      const excludeTexts = ['로그인', '회원가입', '기사검색', '전체기사', '더보기', '기사목록', '디지털 치의신보', '많이 본 뉴스', '임상강좌', '메뉴', '치의신보TV']

      // 페이지 상단의 기사 링크들에서 최신 기사 추출
      // article.html?no= 패턴을 가진 모든 링크 검색
      $list('a[href*="article.html?no="]').each((_, element) => {
        if (latestArticles.length >= 5) return false

        const $el = $list(element)
        const href = $el.attr('href')

        if (!href) return

        const fullLink = href.startsWith('http')
          ? href
          : `https://www.dailydental.co.kr${href}`

        // 이미 추가된 링크는 건너뛰기
        if (seenLinks.has(fullLink)) return

        // 제목 추출 시도
        let title = ''

        // 1. 먼저 링크 내의 h2, h4 태그에서 제목 찾기
        const $heading = $el.find('h2, h4')
        if ($heading.length > 0) {
          title = $heading.first().text().trim()
        }

        // 2. 없으면 링크 텍스트 직접 사용 (인기기사 링크 제외)
        if (!title) {
          const linkText = $el.text().trim()
          // 숫자로 시작하면 인기기사 섹션이므로 건너뛰기
          if (/^\d+/.test(linkText)) return
          title = linkText
        }

        // 유효성 검사
        if (!title || title.length < 5) return
        if (excludeTexts.some(text => title.includes(text))) return

        seenLinks.add(fullLink)

        latestArticles.push({
          id: latestArticles.length + 1,
          title: title.substring(0, 100).trim(),
          link: fullLink,
          category: 'latest'
        })
      })

      console.log(`[News API] Crawled latest: ${latestArticles.length} articles`)
    }

    return { latest: latestArticles, popular: popularArticles }
  } catch (error) {
    console.error('[News API] Crawl error:', error)
    return { latest: [], popular: [] }
  }
}
