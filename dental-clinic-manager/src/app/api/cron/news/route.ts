// 치의신보 기사 자동 크롤링 API
import { NextResponse } from 'next/server'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import * as cheerio from 'cheerio'

export const maxDuration = 60 // Vercel 타임아웃 연장

// Supabase 클라이언트를 런타임에 생성
function getSupabaseClient(): SupabaseClient | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    return null
  }

  return createClient(supabaseUrl, supabaseServiceKey)
}

interface ArticleData {
  title: string
  link: string
  category: 'latest' | 'popular'
}

export async function GET(request: Request) {
  // Cron Secret 검증 (보안)
  const authHeader = request.headers.get('authorization')
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  // Supabase 클라이언트 확인
  const supabase = getSupabaseClient()
  if (!supabase) {
    return NextResponse.json({
      success: false,
      error: 'Supabase configuration missing'
    }, { status: 500 })
  }

  try {
    const results = {
      latest: { fetched: 0, saved: 0 },
      popular: { fetched: 0, saved: 0 },
      errors: [] as string[]
    }

    // 1. 최신 기사 크롤링
    const latestArticles = await fetchArticles(
      'https://www.dailydental.co.kr/news/articleList.html?sc_section_code=S1N1&view_type=sm',
      'latest'
    )
    results.latest.fetched = latestArticles.length

    // 2. 인기 기사 크롤링 (주간 인기기사)
    const popularArticles = await fetchArticles(
      'https://www.dailydental.co.kr/news/articleList.html?sc_area=A&view_type=sm',
      'popular'
    )
    results.popular.fetched = popularArticles.length

    // 3. 모든 기사 처리
    const allArticles = [...latestArticles, ...popularArticles]

    for (const article of allArticles) {
      try {
        // 중복 확인
        const { data: existing } = await supabase
          .from('news_articles')
          .select('id')
          .eq('link', article.link)
          .single()

        if (!existing) {
          // DB 저장
          const { error: insertError } = await supabase.from('news_articles').insert({
            title: article.title,
            link: article.link,
            category: article.category,
          })

          if (!insertError) {
            if (article.category === 'latest') {
              results.latest.saved++
            } else {
              results.popular.saved++
            }
          } else {
            results.errors.push(`Insert error for "${article.title}": ${insertError.message}`)
          }
        }
      } catch (articleError) {
        const errorMsg = articleError instanceof Error ? articleError.message : 'Unknown error'
        results.errors.push(`Error processing "${article.title}": ${errorMsg}`)
      }
    }

    // 4. 오래된 기사 정리 (30일 이상)
    await supabase
      .from('news_articles')
      .delete()
      .lt('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())

    return NextResponse.json({
      success: true,
      results,
      timestamp: new Date().toISOString()
    })
  } catch (error) {
    console.error('[Cron News] Error:', error)
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    }, { status: 500 })
  }
}

// 기사 목록 크롤링
async function fetchArticles(url: string, category: 'latest' | 'popular'): Promise<ArticleData[]> {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    })

    if (!response.ok) {
      console.error(`[Cron News] Failed to fetch ${category}:`, response.status)
      return []
    }

    const html = await response.text()
    const $ = cheerio.load(html)

    const articles: ArticleData[] = []
    const seenLinks = new Set<string>()

    // 치의신보 기사 목록 파싱 (여러 선택자 시도)
    const selectors = [
      '.list-titles a',
      '.list-block a[href*="article.html"]',
      '.article-list a[href*="article.html"]',
      'a[href*="/news/article.html?no="]'
    ]

    for (const selector of selectors) {
      $(selector).each((_, element) => {
        if (articles.length >= 5) return false // 최대 5개

        const $el = $(element)
        const href = $el.attr('href')
        const title = $el.text().trim()

        if (!href || !title || title.length < 5) return

        // 메뉴/버튼 텍스트 제외
        if (['로그인', '회원가입', '기사검색', '뉴스', '오피니언', '포토', '전체기사'].includes(title)) return

        const fullLink = href.startsWith('http')
          ? href
          : `https://www.dailydental.co.kr${href}`

        if (seenLinks.has(fullLink)) return
        seenLinks.add(fullLink)

        articles.push({
          title: title.replace(/\s+/g, ' ').trim(),
          link: fullLink,
          category
        })
      })

      if (articles.length >= 5) break
    }

    return articles.slice(0, 5)
  } catch (error) {
    console.error(`[Cron News] Fetch articles error (${category}):`, error)
    return []
  }
}
