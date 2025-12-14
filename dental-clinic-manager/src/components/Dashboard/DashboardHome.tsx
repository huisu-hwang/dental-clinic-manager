'use client'

import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useSupabaseData } from '@/hooks/useSupabaseData'
import { attendanceService } from '@/lib/attendanceService'
import type { TeamAttendanceStatus } from '@/types/attendance'
import {
  Home,
  Sun,
  Cloud,
  CloudRain,
  CloudSnow,
  Wind,
  Newspaper,
  RefreshCw,
  MapPin,
  ExternalLink,
  Calendar,
  TrendingUp,
  BarChart3,
  AlertCircle
} from 'lucide-react'

// 날씨 아이콘 매핑
const weatherIcons: Record<string, React.ReactNode> = {
  'Clear': <Sun className="w-10 h-10 text-yellow-500" />,
  'Clouds': <Cloud className="w-10 h-10 text-gray-400" />,
  'Rain': <CloudRain className="w-10 h-10 text-blue-500" />,
  'Snow': <CloudSnow className="w-10 h-10 text-blue-300" />,
  'Drizzle': <CloudRain className="w-10 h-10 text-blue-400" />,
  'Thunderstorm': <CloudRain className="w-10 h-10 text-purple-500" />,
  'Mist': <Wind className="w-10 h-10 text-gray-400" />,
  'Fog': <Wind className="w-10 h-10 text-gray-400" />,
}

// 내일 날씨용 작은 아이콘 매핑
const weatherIconsSmall: Record<string, React.ReactNode> = {
  'Clear': <Sun className="w-8 h-8 text-yellow-500 opacity-70" />,
  'Clouds': <Cloud className="w-8 h-8 text-gray-400 opacity-70" />,
  'Rain': <CloudRain className="w-8 h-8 text-blue-500 opacity-70" />,
  'Snow': <CloudSnow className="w-8 h-8 text-blue-300 opacity-70" />,
  'Drizzle': <CloudRain className="w-8 h-8 text-blue-400 opacity-70" />,
  'Thunderstorm': <CloudRain className="w-8 h-8 text-purple-500 opacity-70" />,
  'Mist': <Wind className="w-8 h-8 text-gray-400 opacity-70" />,
  'Fog': <Wind className="w-8 h-8 text-gray-400 opacity-70" />,
}

// 현재 날씨 데이터 타입
interface CurrentWeather {
  location: string
  temp: number
  feels_like: number
  humidity: number
  description: string
  main: string
  icon: string
  wind_speed: number
}

// 내일 날씨 데이터 타입
interface TomorrowWeather {
  date: string
  tempMin: number
  tempMax: number
  description: string
  main: string
  icon: string
}

// 날씨 데이터 타입
interface WeatherData {
  current: CurrentWeather
  tomorrow: TomorrowWeather
}

// 뉴스 데이터 타입
interface NewsItem {
  title: string
  link: string
  source: string
  date: string
}

export default function DashboardHome() {
  const { user } = useAuth()
  const today = new Date().toISOString().split('T')[0]

  // 일일 보고서 데이터
  const { dailyReports, consultLogs, giftLogs, loading: dataLoading } = useSupabaseData(user?.clinic_id ?? null)

  // 팀 출퇴근 현황
  const [teamStatus, setTeamStatus] = useState<TeamAttendanceStatus | null>(null)
  const [attendanceLoading, setAttendanceLoading] = useState(false)

  // 날씨 데이터
  const [weather, setWeather] = useState<WeatherData | null>(null)
  const [weatherLoading, setWeatherLoading] = useState(false)

  // 뉴스 데이터
  const [news, setNews] = useState<NewsItem[]>([])
  const [newsLoading, setNewsLoading] = useState(false)

  // 오늘 보고서 요약 계산
  const todaySummary = useMemo(() => {
    const todayReport = dailyReports.find(r => r.date === today)
    const todayConsults = consultLogs.filter(c => c.date === today)
    const todayGifts = giftLogs.filter(g => g.date === today)

    const consultProceed = todayReport?.consult_proceed ?? todayConsults.filter(c => c.consult_status === 'O').length
    const consultHold = todayReport?.consult_hold ?? todayConsults.filter(c => c.consult_status === 'X').length

    return {
      hasReport: !!todayReport,
      consultCount: consultProceed + consultHold || todayConsults.length,
      consultProceed,
      consultHold,
      giftCount: todayGifts.reduce((sum, g) => sum + (g.quantity || 1), 0),
      recallCount: todayReport?.recall_count || 0,
      recallBookingCount: todayReport?.recall_booking_count || 0,
      naverReviewCount: todayReport?.naver_review_count || 0,
    }
  }, [dailyReports, consultLogs, giftLogs, today])

  // 주간 통계 계산 (이번 주 월요일부터 오늘까지)
  const weeklySummary = useMemo(() => {
    const now = new Date()
    const dayOfWeek = now.getDay()
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
    const monday = new Date(now)
    monday.setDate(now.getDate() + mondayOffset)
    monday.setHours(0, 0, 0, 0)

    const weekStartStr = monday.toISOString().split('T')[0]

    // 이번 주 데이터 필터링
    const weekReports = dailyReports.filter(r => r.date >= weekStartStr && r.date <= today)
    const weekConsults = consultLogs.filter(c => c.date >= weekStartStr && c.date <= today)
    const weekGifts = giftLogs.filter(g => g.date >= weekStartStr && g.date <= today)

    // 상담 건수 및 성공 건수
    let consultTotal = 0
    let consultSuccess = 0
    let recallTotal = 0
    let recallBookingTotal = 0
    let giftTotal = 0
    let reviewTotal = 0

    weekReports.forEach(report => {
      consultTotal += (report.consult_proceed || 0) + (report.consult_hold || 0)
      consultSuccess += report.consult_proceed || 0
      recallTotal += report.recall_count || 0
      recallBookingTotal += report.recall_booking_count || 0
      reviewTotal += report.naver_review_count || 0
    })

    // 보고서에 없는 날짜의 상담 로그 추가
    const reportDates = new Set(weekReports.map(r => r.date))
    weekConsults.forEach(c => {
      if (!reportDates.has(c.date)) {
        consultTotal += 1
        if (c.consult_status === 'O') consultSuccess += 1
      }
    })

    // 선물 건수
    giftTotal = weekGifts.reduce((sum, g) => sum + (g.quantity || 1), 0)

    // 성공률 계산
    const successRate = consultTotal > 0 ? ((consultSuccess / consultTotal) * 100).toFixed(0) : '0'

    return {
      weekStart: weekStartStr,
      consultTotal,
      consultSuccess,
      successRate,
      recallTotal,
      recallBookingTotal,
      giftTotal,
      reviewTotal,
    }
  }, [dailyReports, consultLogs, giftLogs, today])

  // 출퇴근 현황 로드
  useEffect(() => {
    if (user?.clinic_id) {
      loadTeamStatus()
    }
  }, [user?.clinic_id])

  const loadTeamStatus = async () => {
    if (!user?.clinic_id) return
    setAttendanceLoading(true)
    try {
      const result = await attendanceService.getTeamAttendanceStatus(user.clinic_id, today)
      if (result.success && result.status) {
        setTeamStatus(result.status)
      }
    } catch (error) {
      console.error('[DashboardHome] Error loading team status:', error)
    } finally {
      setAttendanceLoading(false)
    }
  }

  // 날씨 로드
  useEffect(() => {
    loadWeather()
  }, [])

  const loadWeather = async () => {
    setWeatherLoading(true)
    try {
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            await fetchWeather(position.coords.latitude, position.coords.longitude)
          },
          async () => {
            await fetchWeather(37.5665, 126.9780)
          }
        )
      } else {
        await fetchWeather(37.5665, 126.9780)
      }
    } catch {
      setWeatherLoading(false)
    }
  }

  const fetchWeather = async (lat: number, lon: number) => {
    try {
      // 기상청 API 호출 (서버사이드)
      const response = await fetch(`/api/weather?lat=${lat}&lon=${lon}`)
      if (!response.ok) throw new Error('날씨 데이터 로드 실패')
      const data = await response.json()

      if (data.weather) {
        setWeather({
          current: {
            location: data.weather.current?.location || '현재 위치',
            temp: data.weather.current?.temp ?? 10,
            feels_like: data.weather.current?.feels_like ?? 8,
            humidity: data.weather.current?.humidity ?? 60,
            description: data.weather.current?.description || '맑음',
            main: data.weather.current?.main || 'Clear',
            icon: data.weather.current?.icon || '01d',
            wind_speed: data.weather.current?.wind_speed ?? 2.0
          },
          tomorrow: {
            date: data.weather.tomorrow?.date || '내일',
            tempMin: data.weather.tomorrow?.tempMin ?? 5,
            tempMax: data.weather.tomorrow?.tempMax ?? 15,
            description: data.weather.tomorrow?.description || '맑음',
            main: data.weather.tomorrow?.main || 'Clear',
            icon: data.weather.tomorrow?.icon || '01d'
          }
        })
      } else {
        throw new Error('Invalid weather data')
      }
    } catch {
      setWeather({
        current: {
          location: '서울',
          temp: 10,
          feels_like: 8,
          humidity: 60,
          description: '맑음',
          main: 'Clear',
          icon: '01d',
          wind_speed: 2.0
        },
        tomorrow: {
          date: '내일',
          tempMin: 5,
          tempMax: 15,
          description: '맑음',
          main: 'Clear',
          icon: '01d'
        }
      })
    } finally {
      setWeatherLoading(false)
    }
  }

  // 뉴스 로드
  useEffect(() => {
    loadNews()
  }, [])

  const loadNews = async () => {
    setNewsLoading(true)
    try {
      console.log('[DashboardHome] Fetching news...')

      // 1단계: CORS 프록시를 통해 "많이 본 뉴스" 직접 가져오기
      // 전체기사 페이지에서 많이 본 뉴스 섹션이 있음
      const targetPages = [
        'https://www.dailydental.co.kr/news/articleList.html', // 전체기사 페이지
        'https://www.dailydental.co.kr', // 메인 페이지
      ]

      const corsProxies = [
        { name: 'allorigins', url: 'https://api.allorigins.win/raw?url=' },
        { name: 'corsproxy.io', url: 'https://corsproxy.io/?' },
        { name: 'cors-anywhere', url: 'https://cors-anywhere.herokuapp.com/' },
      ]

      for (const page of targetPages) {
        for (const proxy of corsProxies) {
          try {
            const targetUrl = encodeURIComponent(page)
            console.log(`[DashboardHome] Trying ${proxy.name} with ${page}`)

            const proxyResponse = await fetch(proxy.url + targetUrl, {
              headers: {
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
              },
              signal: AbortSignal.timeout(10000) // 10초 타임아웃
            })

            if (proxyResponse.ok) {
              const html = await proxyResponse.text()
              console.log('[DashboardHome] HTML fetched via proxy, size:', (html.length / 1024).toFixed(2), 'KB')

              const parsedNews = parseMostViewedNews(html)

              if (parsedNews.length > 0) {
                console.log('[DashboardHome] ✅ Proxy 성공:', parsedNews.length, 'articles')
                setNews(parsedNews.slice(0, 7))
                return
              } else {
                console.warn('[DashboardHome] HTML fetched but no news parsed')
              }
            } else {
              console.warn(`[DashboardHome] ${proxy.name} response not OK:`, proxyResponse.status)
            }
          } catch (proxyError) {
            console.warn(`[DashboardHome] ${proxy.name} failed:`, proxyError instanceof Error ? proxyError.message : proxyError)
            continue
          }
        }
      }

      // 2단계: 클라이언트에서 직접 RSS 피드 가져오기 시도
      const rssSources = [
        'https://www.dailydental.co.kr/rss/allArticle.xml',
        'https://www.dailydental.co.kr/rss/S1N1.xml',
      ]

      for (const rssUrl of rssSources) {
        try {
          console.log('[DashboardHome] Trying RSS:', rssUrl)
          const rssResponse = await fetch(rssUrl, {
            mode: 'cors',
            credentials: 'omit',
            headers: {
              'Accept': 'application/rss+xml, application/xml, text/xml, */*',
            }
          })

          if (rssResponse.ok) {
            const xmlText = await rssResponse.text()
            const parsedNews = parseRSSFeed(xmlText)

            if (parsedNews.length > 0) {
              console.log('[DashboardHome] ✅ RSS 성공:', parsedNews.length, 'articles')
              setNews(parsedNews.slice(0, 5))
              return
            }
          }
        } catch (rssError) {
          console.warn('[DashboardHome] RSS failed:', rssError instanceof Error ? rssError.message : rssError)
          continue
        }
      }

      // 3단계: 서버 API 시도
      console.log('[DashboardHome] Trying server API...')
      const response = await fetch('/api/news/dental')

      if (response.ok) {
        const data = await response.json()
        console.log('[DashboardHome] API response:', data.fallback ? 'fallback' : 'live')

        if (data.news && data.news.length > 0 && !data.fallback) {
          setNews(data.news)
          console.log('[DashboardHome] ✅ Server API 성공:', data.news.length, 'articles')
          return
        }
      }

      // 4단계: 모두 실패하면 fallback
      console.warn('[DashboardHome] All sources failed, using fallback')
      const fallbackNews: NewsItem[] = [
        { title: '치의신보 - 최신 치과 뉴스', link: 'https://www.dailydental.co.kr', source: '치의신보', date: new Date().toISOString().split('T')[0] },
        { title: '치과계 건강보험 및 정책 뉴스', link: 'https://www.dailydental.co.kr/news/articleList.html?sc_section_code=S1N1', source: '치의신보', date: new Date().toISOString().split('T')[0] },
        { title: '디지털 치과 기술 동향', link: 'https://www.dailydental.co.kr/news/articleList.html?sc_section_code=S1N2', source: '치의신보', date: new Date().toISOString().split('T')[0] },
        { title: '치과 학술 및 연구 소식', link: 'https://www.dailydental.co.kr/news/articleList.html?sc_section_code=S1N3', source: '치의신보', date: new Date().toISOString().split('T')[0] },
        { title: '치의신보 전체 기사 보기', link: 'https://www.dailydental.co.kr/news/articleList.html', source: '치의신보', date: new Date().toISOString().split('T')[0] },
      ]
      setNews(fallbackNews)
    } catch (error) {
      console.error('[DashboardHome] Error:', error)
      const fallbackNews: NewsItem[] = [
        { title: '치의신보 웹사이트 방문하기', link: 'https://www.dailydental.co.kr', source: '치의신보', date: new Date().toISOString().split('T')[0] },
        { title: '최신 뉴스를 확인하세요', link: 'https://www.dailydental.co.kr/news/articleList.html', source: '치의신보', date: new Date().toISOString().split('T')[0] },
      ]
      setNews(fallbackNews)
    } finally {
      setNewsLoading(false)
    }
  }

  // "많이 본 뉴스" 섹션 파싱
  const parseMostViewedNews = (html: string): NewsItem[] => {
    const news: NewsItem[] = []
    try {
      console.log('[DashboardHome] Starting HTML parsing, total size:', (html.length / 1024).toFixed(2), 'KB')

      // 1단계: "많이 본 뉴스" 섹션 찾기 - 더 광범위한 패턴
      const mostViewedPatterns = [
        // 패턴 1: "많이 본" 텍스트가 포함된 섹션
        /많이\s*본\s*뉴스[\s\S]{0,3000}?(?=<div class=|<section|$)/gi,
        // 패턴 2: class에 "most", "view", "ranking" 등 포함
        /<div[^>]*class="[^"]*(?:most|view|ranking|popular|hot|best)[^"]*"[^>]*>[\s\S]{0,5000}?<\/div>/gi,
        // 패턴 3: ul/ol 태그
        /<[uo]l[^>]*class="[^"]*(?:most|view|ranking|popular|hot|best)[^"]*"[^>]*>[\s\S]{0,5000}?<\/[uo]l>/gi,
        // 패턴 4: aside나 section 태그
        /<(?:aside|section)[^>]*class="[^"]*(?:most|view|ranking|popular|hot|best)[^"]*"[^>]*>[\s\S]{0,5000}?<\/(?:aside|section)>/gi,
      ]

      let mostViewedSection = ''
      let patternIndex = -1

      for (let i = 0; i < mostViewedPatterns.length; i++) {
        const pattern = mostViewedPatterns[i]
        const matches = html.match(pattern)

        if (matches && matches.length > 0) {
          console.log(`[DashboardHome] Pattern ${i + 1} matched:`, matches.length, 'sections')

          // 가장 긴 매치를 사용 (가장 완전한 섹션일 가능성)
          const longestMatch = matches.reduce((a, b) => a.length > b.length ? a : b, '')

          if (longestMatch.length > 100) {
            mostViewedSection = longestMatch
            patternIndex = i
            console.log(`[DashboardHome] ✓ Using pattern ${i + 1}, section size:`, longestMatch.length, 'chars')
            console.log('[DashboardHome] Section preview:', longestMatch.substring(0, 200))
            break
          }
        }
      }

      if (!mostViewedSection) {
        console.warn('[DashboardHome] No most-viewed section found, using full HTML')
      }

      // 섹션을 찾았으면 해당 섹션에서, 못 찾았으면 전체 HTML에서 파싱
      const targetHtml = mostViewedSection || html

      // 2단계: 기사 링크 추출
      const articlePattern = /<a[^>]*href="([^"]*(?:\/news\/articleView\.html\?idxno=\d+|articleView\.html\?idxno=\d+))"[^>]*>([\s\S]*?)<\/a>/gi
      const seenLinks = new Set<string>()
      const allMatches: Array<{ link: string; title: string }> = []

      let match
      let totalFound = 0

      while ((match = articlePattern.exec(targetHtml)) !== null) {
        totalFound++
        let link = match[1]
        let titleContent = match[2]

        // 링크 정규화
        if (!link.startsWith('http')) {
          link = `https://www.dailydental.co.kr${link.startsWith('/') ? '' : '/'}${link}`
        }

        // 중복 링크 건너뛰기
        if (seenLinks.has(link)) continue
        seenLinks.add(link)

        // 제목 추출 및 정제
        let title = titleContent
          .replace(/<img[^>]*>/gi, '')
          .replace(/<[^>]+>/g, ' ')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&nbsp;/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()

        // 숫자 제거 (1, [1], (1), 1. 등)
        const originalTitle = title
        title = title.replace(/^[\[\(]?\d+[\]\)]?[\.\s:：]*/, '').trim()

        // 빈 제목이나 너무 짧은/긴 제목 건너뛰기
        if (!title || title.length < 5 || title.length > 200) {
          console.log('[DashboardHome] Skipped (too short/long):', originalTitle)
          continue
        }

        // 불필요한 키워드 제외
        const excludeKeywords = [
          '로그인', '회원가입', '기사검색', '뉴스', '오피니언', '포토', '전체기사',
          '더보기', '목록', '이전', '다음', '구독', '신청', '많이 본 뉴스', '인기기사',
          'TOP', 'BEST', '바로가기', '자세히', 'more', '주요뉴스', '최신뉴스'
        ]

        const isExcluded = excludeKeywords.some(keyword => {
          const lower = title.toLowerCase()
          return lower === keyword.toLowerCase() || lower.includes(keyword.toLowerCase() + ' ')
        })

        if (isExcluded) {
          console.log('[DashboardHome] Skipped (excluded keyword):', title)
          continue
        }

        allMatches.push({ link, title })

        if (allMatches.length <= 10) {
          console.log(`[DashboardHome] ✓ Valid article [${allMatches.length}]: ${title.substring(0, 50)}...`)
        }
      }

      console.log(`[DashboardHome] Total article links found: ${totalFound}, valid after filtering: ${allMatches.length}`)

      // 최종 뉴스 배열에 추가
      for (const item of allMatches.slice(0, 10)) {
        news.push({
          title: item.title,
          link: item.link,
          source: '치의신보',
          date: new Date().toISOString().split('T')[0]
        })
      }

      console.log('[DashboardHome] ✅ Final parsed news count:', news.length)

      if (news.length === 0) {
        console.error('[DashboardHome] ❌ No news articles parsed! Debug info:')
        console.log('- HTML size:', (html.length / 1024).toFixed(2), 'KB')
        console.log('- Section found:', !!mostViewedSection)
        console.log('- Pattern used:', patternIndex >= 0 ? patternIndex + 1 : 'none')
        console.log('- Total links found:', totalFound)
      }
    } catch (error) {
      console.error('[DashboardHome] ❌ Parse error:', error)
    }
    return news
  }

  // RSS 파싱 헬퍼 함수
  const parseRSSFeed = (xml: string): NewsItem[] => {
    const news: NewsItem[] = []
    try {
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
    } catch (error) {
      console.error('[DashboardHome] RSS parse error:', error)
    }
    return news
  }

  // 날짜 포맷
  const formatDate = (date: Date) => {
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    })
  }

  const [currentTime, setCurrentTime] = useState(new Date())
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000)
    return () => clearInterval(timer)
  }, [])

  const handleRefresh = () => {
    loadTeamStatus()
    loadWeather()
    loadNews()
  }

  // 출근률 계산
  const attendanceRate = teamStatus && teamStatus.total_employees > 0
    ? ((teamStatus.checked_in / teamStatus.total_employees) * 100).toFixed(0)
    : '0'

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      {/* 헤더 */}
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-4 sm:px-6 py-3 sm:py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 sm:space-x-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-white/20 rounded-lg flex items-center justify-center">
              <Home className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white">대시보드</h2>
              <p className="text-blue-100 text-xs sm:text-sm hidden sm:block">{formatDate(currentTime)}</p>
            </div>
          </div>
          <button
            onClick={handleRefresh}
            className="inline-flex items-center px-2 sm:px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded-lg text-white text-xs sm:text-sm transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5" />
            새로고침
          </button>
        </div>
      </div>

      {/* 보고서 미작성 알림 */}
      {!dataLoading && !todaySummary.hasReport && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 sm:px-6 py-2.5">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0" />
            <span className="text-sm text-amber-800">오늘의 일일보고서가 아직 작성되지 않았습니다.</span>
          </div>
        </div>
      )}

      {/* 본문 - 2컬럼 레이아웃 */}
      <div className="p-3 sm:p-6">
        <div className="flex flex-col lg:flex-row gap-4 sm:gap-6">
          {/* 왼쪽: 메인 콘텐츠 */}
          <div className="flex-1 space-y-4 sm:space-y-5">
            {/* 오늘의 현황 */}
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-3">오늘의 현황</h3>
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                <div className="bg-slate-50 rounded-lg p-3 text-center">
                  <TrendingUp className="w-5 h-5 text-green-500 mx-auto mb-1" />
                  <p className="text-lg sm:text-xl font-bold text-green-600">{todaySummary.consultProceed}<span className="text-slate-400 font-normal">/</span><span className="text-slate-600">{todaySummary.consultCount}</span></p>
                  <p className="text-xs text-slate-500">성공/상담</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3 text-center">
                  <Calendar className="w-5 h-5 text-orange-500 mx-auto mb-1" />
                  <p className="text-lg sm:text-xl font-bold text-orange-600">{todaySummary.recallBookingCount}<span className="text-slate-400 font-normal">/</span><span className="text-slate-600">{todaySummary.recallCount}</span></p>
                  <p className="text-xs text-slate-500">예약/리콜</p>
                </div>
                <div className="bg-slate-50 rounded-lg p-3 text-center">
                  <BarChart3 className="w-5 h-5 text-purple-500 mx-auto mb-1" />
                  <p className="text-lg sm:text-xl font-bold text-purple-600">{todaySummary.naverReviewCount}<span className="text-slate-400 font-normal">/</span><span className="text-slate-600">{todaySummary.giftCount}</span></p>
                  <p className="text-xs text-slate-500">리뷰/선물</p>
                </div>
              </div>
            </div>

            {/* 팀 출퇴근 현황 */}
            <div>
              <h3 className="text-sm font-semibold text-slate-700 mb-3">팀 출퇴근 현황</h3>
              {attendanceLoading ? (
                <div className="flex justify-center py-6">
                  <div className="w-6 h-6 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : teamStatus ? (
                <div className="bg-slate-50 rounded-lg p-4">
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
                    <div>
                      <p className="text-lg font-bold text-green-600">{teamStatus.checked_in}<span className="text-slate-400 font-normal">/</span><span className="text-slate-600">{teamStatus.total_employees}</span></p>
                      <p className="text-xs text-green-600">출근/전체</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-blue-600">{teamStatus.checked_out || 0}</p>
                      <p className="text-xs text-blue-600">퇴근</p>
                    </div>
                    <div>
                      <p className="text-lg font-bold text-orange-600">{teamStatus.not_checked_in}</p>
                      <p className="text-xs text-orange-600">결근</p>
                    </div>
                    <div className="hidden sm:block">
                      <p className="text-lg font-bold text-yellow-600">{teamStatus.late_count}</p>
                      <p className="text-xs text-yellow-600">지각</p>
                    </div>
                    <div className="hidden sm:block">
                      <p className="text-lg font-bold text-red-600">{teamStatus.early_leave_count || 0}</p>
                      <p className="text-xs text-red-600">조퇴</p>
                    </div>
                    <div className="hidden sm:block">
                      <p className="text-lg font-bold text-purple-600">{teamStatus.overtime_count || 0}</p>
                      <p className="text-xs text-purple-600">초과</p>
                    </div>
                  </div>
                  {teamStatus.total_employees > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-200">
                      <div className="flex items-center justify-between text-xs text-slate-600 mb-1.5">
                        <span>출근률</span>
                        <span className="font-medium">{attendanceRate}%</span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-1.5">
                        <div
                          className="bg-green-500 h-1.5 rounded-full transition-all"
                          style={{ width: `${attendanceRate}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-6 text-slate-500 bg-slate-50 rounded-lg">
                  <p className="text-sm">출퇴근 현황을 불러올 수 없습니다.</p>
                </div>
              )}
            </div>

            {/* 주간 통계 */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-slate-700">주간 통계</h3>
                <span className="text-xs text-slate-400">
                  {weeklySummary.weekStart.replace(/-/g, '.')} ~ {today.replace(/-/g, '.')}
                </span>
              </div>
              <div className="bg-slate-50 rounded-lg p-4">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div>
                    <p className="text-lg sm:text-xl font-bold text-green-600">{weeklySummary.consultSuccess}<span className="text-slate-400 font-normal">/</span><span className="text-slate-600">{weeklySummary.consultTotal}</span></p>
                    <p className="text-xs text-slate-500">성공/상담 ({weeklySummary.successRate}%)</p>
                  </div>
                  <div>
                    <p className="text-lg sm:text-xl font-bold text-orange-600">{weeklySummary.recallBookingTotal}<span className="text-slate-400 font-normal">/</span><span className="text-slate-600">{weeklySummary.recallTotal}</span></p>
                    <p className="text-xs text-slate-500">예약/리콜</p>
                  </div>
                  <div>
                    <p className="text-lg sm:text-xl font-bold text-purple-600">{weeklySummary.giftTotal}<span className="text-slate-400 font-normal">/</span><span className="text-slate-600">{weeklySummary.reviewTotal}</span></p>
                    <p className="text-xs text-slate-500">선물/리뷰</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* 오른쪽: 사이드바 (날씨 + 뉴스) */}
          <div className="lg:w-72 space-y-4">
            {/* 날씨 카드 */}
            <div className="bg-slate-50 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-slate-700 mb-3 flex items-center">
                <Sun className="w-4 h-4 text-yellow-500 mr-1.5" />
                날씨
              </h3>
              {weatherLoading ? (
                <div className="flex justify-center py-6">
                  <div className="w-6 h-6 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : weather ? (
                <div className="space-y-3">
                  {/* 현재 날씨 */}
                  <div className="flex items-center gap-3">
                    {weatherIcons[weather.current.main] || <Cloud className="w-10 h-10 text-gray-400" />}
                    <div className="flex-1">
                      <div className="flex items-center gap-1 text-xs text-slate-500 mb-0.5">
                        <MapPin className="w-3 h-3" />
                        <span>{weather.current.location}</span>
                        <span className="ml-1 px-1.5 py-0.5 bg-blue-100 text-blue-600 rounded text-[10px] font-medium">현재</span>
                      </div>
                      <p className="text-2xl font-bold text-slate-800">{weather.current.temp}°<span className="text-sm font-normal text-slate-500 ml-1">{weather.current.description}</span></p>
                      <p className="text-xs text-slate-400 mt-0.5">체감 {weather.current.feels_like}° · 습도 {weather.current.humidity}%</p>
                    </div>
                  </div>

                  {/* 구분선 */}
                  <div className="border-t border-slate-200"></div>

                  {/* 내일 날씨 */}
                  <div className="flex items-center gap-3">
                    {weatherIconsSmall[weather.tomorrow.main] || <Cloud className="w-8 h-8 text-gray-400 opacity-70" />}
                    <div className="flex-1">
                      <div className="flex items-center gap-1 text-xs text-slate-500 mb-0.5">
                        <Calendar className="w-3 h-3" />
                        <span>내일 ({weather.tomorrow.date})</span>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-lg font-bold text-slate-700">{weather.tomorrow.tempMax}°</span>
                        <span className="text-sm text-slate-400">/ {weather.tomorrow.tempMin}°</span>
                        <span className="text-sm text-slate-500 ml-1">{weather.tomorrow.description}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            {/* 뉴스 카드 */}
            <div className="bg-slate-50 rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-200">
                <h3 className="text-sm font-semibold text-slate-700 flex items-center">
                  <Newspaper className="w-4 h-4 text-slate-500 mr-1.5" />
                  치과계 소식
                </h3>
              </div>
              {newsLoading ? (
                <div className="flex justify-center py-6">
                  <div className="w-6 h-6 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : news.length > 0 ? (
                <div className="divide-y divide-slate-200">
                  {news.map((item, index) => (
                    <a
                      key={index}
                      href={item.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-2 px-4 py-2.5 hover:bg-slate-100 transition-colors group"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-slate-700 line-clamp-2 group-hover:text-blue-600">{item.title}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{item.source}</p>
                      </div>
                      <ExternalLink className="w-3.5 h-3.5 text-slate-300 group-hover:text-blue-500 flex-shrink-0 mt-0.5" />
                    </a>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-slate-500">
                  <p className="text-sm">뉴스를 불러올 수 없습니다.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
