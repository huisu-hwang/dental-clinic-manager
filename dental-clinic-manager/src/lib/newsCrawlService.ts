// 치의신보 뉴스 크롤링 서비스
import { SupabaseClient } from '@supabase/supabase-js'
import * as cheerio from 'cheerio'

interface ArticleData {
  title: string
  link: string
  category: 'latest' | 'popular'
}

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
      console.error(`[News Crawl] Failed to fetch ${category}:`, response.status)
      return []
    }

    const html = await response.text()
    const $ = cheerio.load(html)

    const articles: ArticleData[] = []
    const seenLinks = new Set<string>()

    const selectors = [
      '.list-titles a',
      '.list-block a[href*="article.html"]',
      '.article-list a[href*="article.html"]',
      'a[href*="/news/article.html?no="]'
    ]

    for (const selector of selectors) {
      $(selector).each((_, element) => {
        if (articles.length >= 5) return false

        const $el = $(element)
        const href = $el.attr('href')
        const title = $el.text().trim()

        if (!href || !title || title.length < 5) return
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
    console.error(`[News Crawl] Fetch articles error (${category}):`, error)
    return []
  }
}

export async function runNewsCrawl(supabase: SupabaseClient) {
  const results = {
    latest: { fetched: 0, saved: 0 },
    popular: { fetched: 0, saved: 0 },
    errors: [] as string[]
  }

  const latestArticles = await fetchArticles(
    'https://www.dailydental.co.kr/news/articleList.html?sc_section_code=S1N1&view_type=sm',
    'latest'
  )
  results.latest.fetched = latestArticles.length

  const popularArticles = await fetchArticles(
    'https://www.dailydental.co.kr/news/articleList.html?sc_area=A&view_type=sm',
    'popular'
  )
  results.popular.fetched = popularArticles.length

  const allArticles = [...latestArticles, ...popularArticles]

  for (const article of allArticles) {
    try {
      const { data: existing } = await supabase
        .from('news_articles')
        .select('id')
        .eq('link', article.link)
        .single()

      if (!existing) {
        const { error: insertError } = await supabase.from('news_articles').insert({
          title: article.title,
          link: article.link,
          category: article.category,
        })

        if (!insertError) {
          if (article.category === 'latest') results.latest.saved++
          else results.popular.saved++
        } else {
          results.errors.push(`Insert error for "${article.title}": ${insertError.message}`)
        }
      }
    } catch (articleError) {
      const errorMsg = articleError instanceof Error ? articleError.message : 'Unknown error'
      results.errors.push(`Error processing "${article.title}": ${errorMsg}`)
    }
  }

  await supabase
    .from('news_articles')
    .delete()
    .lt('created_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())

  return results
}
