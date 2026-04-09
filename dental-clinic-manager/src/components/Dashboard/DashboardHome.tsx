'use client'

import React, { useState, useEffect, useMemo } from 'react'
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
  AlertCircle,
  Flame,
  Download,
  Monitor,
  ArrowUpCircle,
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

// 일별 상세 데이터 타입 (주간 통계 확장 패널용)
interface DailyBreakdownItem {
  date: string           // 'YYYY-MM-DD'
  dayLabel: string       // '월', '화', '수', '목', '금'
  consultCount: number
  consultSuccess: number
  recallCount: number
  recallBookingCount: number
  giftCount: number
  reviewCount: number
  isToday: boolean
}

// 크롤링된 뉴스 기사 타입
interface CrawledArticle {
  id: number
  title: string
  link: string
  category: 'latest' | 'popular'
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

  // 치의신보 뉴스 데이터
  const [latestArticles, setLatestArticles] = useState<CrawledArticle[]>([])
  const [popularArticles, setPopularArticles] = useState<CrawledArticle[]>([])
  const [newsLoading, setNewsLoading] = useState(false)
  const [activeNewsTab, setActiveNewsTab] = useState<'popular' | 'latest'>('popular')

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

  // JSX 확장 패널용 — useMemo 밖에 선언 (todaySummary 내부 스코프는 JSX에서 접근 불가)
  const todayReport = dailyReports.find(r => r.date === today)
  const todayConsults = consultLogs.filter(c => c.date === today)
  const todayGifts = giftLogs.filter(g => g.date === today)

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

    // 일별 상세 데이터 생성 (로컬 날짜 기준, UTC 경계 문제 방지)
    const dailyBreakdown: DailyBreakdownItem[] = []
    const dayNames = ['일', '월', '화', '수', '목', '금', '토']

    for (let d = new Date(monday); d <= now; d.setDate(d.getDate() + 1)) {
      const y = d.getFullYear()
      const mo = String(d.getMonth() + 1).padStart(2, '0')
      const dy = String(d.getDate()).padStart(2, '0')
      const dateStr = `${y}-${mo}-${dy}`

      const dayReport = dailyReports.find(r => r.date === dateStr)
      const dayConsults = consultLogs.filter(c => c.date === dateStr)
      const dayGifts = giftLogs.filter(g => g.date === dateStr)

      let dayConsultCount = 0
      let dayConsultSuccess = 0
      if (dayReport) {
        dayConsultCount = (dayReport.consult_proceed || 0) + (dayReport.consult_hold || 0)
        dayConsultSuccess = dayReport.consult_proceed || 0
      } else {
        dayConsultCount = dayConsults.length
        dayConsultSuccess = dayConsults.filter(c => c.consult_status === 'O').length
      }

      const dayOfWeek = new Date(`${dateStr}T12:00:00`).getDay()

      dailyBreakdown.push({
        date: dateStr,
        dayLabel: dayNames[dayOfWeek],
        consultCount: dayConsultCount,
        consultSuccess: dayConsultSuccess,
        recallCount: dayReport?.recall_count || 0,
        recallBookingCount: dayReport?.recall_booking_count || 0,
        giftCount: dayGifts.reduce((sum, g) => sum + (g.quantity || 1), 0),
        reviewCount: dayReport?.naver_review_count || 0,
        isToday: dateStr === today,
      })
    }

    return {
      weekStart: weekStartStr,
      consultTotal,
      consultSuccess,
      successRate,
      recallTotal,
      recallBookingTotal,
      giftTotal,
      reviewTotal,
      dailyBreakdown,
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

  // 치의신보 뉴스 로드
  useEffect(() => {
    loadDentalNews()
  }, [])

  const loadDentalNews = async () => {
    setNewsLoading(true)
    try {
      const response = await fetch('/api/news/dental')
      if (response.ok) {
        const data = await response.json()
        if (data.articles) {
          setLatestArticles(data.articles.latest || [])
          setPopularArticles(data.articles.popular || [])
        }
      }
    } catch (error) {
      console.error('[DashboardHome] Error loading dental news:', error)
    } finally {
      setNewsLoading(false)
    }
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

  // 인라인 확장 패널 상태
  const [todayActivePanel, setTodayActivePanel] = useState<'consult' | 'recall' | 'gift' | null>(null)
  const [attendanceActivePanel, setAttendanceActivePanel] = useState<'checkin' | 'checkout' | 'absent' | 'late' | 'early' | 'overtime' | null>(null)
  const [weeklyActivePanel, setWeeklyActivePanel] = useState<'consult' | 'recall' | 'gift' | null>(null)

  // 아코디언 토글 헬퍼 (같은 값 클릭 시 닫힘)
  function togglePanel<T extends string>(
    current: T | null,
    next: T,
    setter: React.Dispatch<React.SetStateAction<T | null>>
  ) {
    setter(current === next ? null : next)
  }

  // 워커 설치 상태 체크
  const [workerInstalled, setWorkerInstalled] = useState<boolean | null>(null)
  const [workerUpdateAvailable, setWorkerUpdateAvailable] = useState(false)
  const [workerVersions, setWorkerVersions] = useState<{ current: string | null; latest: string | null }>({ current: null, latest: null })
  const [workerUpdating, setWorkerUpdating] = useState(false)
  useEffect(() => {
    const checkWorker = async () => {
      try {
        const res = await fetch('/api/workers/status?type=marketing', { signal: AbortSignal.timeout(10000) })
        if (res.ok) {
          const data = await res.json()
          setWorkerInstalled(data.marketing?.installed ?? false)
          setWorkerUpdateAvailable(data.marketing?.updateAvailable ?? false)
          setWorkerVersions({
            current: data.marketing?.currentVersion ?? null,
            latest: data.marketing?.latestVersion ?? null,
          })
        } else {
          setWorkerInstalled(false)
        }
      } catch {
        setWorkerInstalled(false)
      }
    }
    checkWorker()
    const interval = setInterval(checkWorker, 30000)
    return () => clearInterval(interval)
  }, [])

  const handleWorkerUpdate = async () => {
    setWorkerUpdating(true)
    try {
      await fetch('/api/master/worker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'update' }),
      })
    } catch {
      // 에러 무시 — 워커가 10초 내 시그널 감지
    } finally {
      setTimeout(() => setWorkerUpdating(false), 5000)
    }
  }

  const [workerDownloading, setWorkerDownloading] = useState(false)
  const handleWorkerDownload = async () => {
    setWorkerDownloading(true)
    try {
      const isWindows = navigator.platform.includes('Win')
      const os = isWindows ? 'windows' : 'mac'
      const response = await fetch(`/api/marketing/worker-api/download?os=${os}`)
      if (!response.ok) throw new Error('다운로드 실패')

      const contentType = response.headers.get('Content-Type') || ''
      if (contentType.includes('application/json')) {
        // Windows(.exe) / macOS(.dmg): GitHub Release URL로 직접 이동
        const data = await response.json()
        const a = document.createElement('a')
        a.href = data.downloadUrl
        a.target = '_blank'
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
      } else {
        // shell script fallback (macOS DMG 없는 경우)
        const blob = await response.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = isWindows ? '클리닉매니저워커-설치.exe' : '클리닉매니저워커-설치.command'
        a.click()
        URL.revokeObjectURL(url)
      }
    } catch {
      // GitHub Release에서 직접 다운로드
      window.open('https://github.com/huisu-hwang/dental-clinic-manager/releases/latest', '_blank')
    } finally {
      setWorkerDownloading(false)
    }
  }

  const handleRefresh = () => {
    loadTeamStatus()
    loadWeather()
    loadDentalNews()
  }

  // 출근률 계산
  const attendanceRate = teamStatus && teamStatus.total_employees > 0
    ? ((teamStatus.checked_in / teamStatus.total_employees) * 100).toFixed(0)
    : '0'

  return (
    <div className="space-y-6">
      {/* Hero — 날짜 + 새로고침 */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-label uppercase text-muted-foreground tracking-[0.05em]">대시보드 홈</p>
          <h1 className="text-title text-foreground mt-0.5">{formatDate(currentTime)}</h1>
        </div>
        <button
          onClick={handleRefresh}
          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground text-sm transition-colors duration-fast"
        >
          <RefreshCw className="size-4" strokeWidth={2} />
          새로고침
        </button>
      </div>

      {/* 워커 미설치 배너 */}
      {workerInstalled === false && (
        <div className="rounded-2xl bg-accent border border-border px-4 sm:px-5 py-3.5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <div className="size-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                <Monitor className="size-4" strokeWidth={2} />
              </div>
              <div>
                <span className="text-sm font-semibold text-accent-foreground">클리닉 매니저 워커가 설치되지 않았습니다</span>
                <p className="text-xs text-muted-foreground mt-0.5">
                  블로그 발행, 홈택스 연동, SEO 분석 등의 기능을 사용하려면 워커를 설치해주세요.
                </p>
              </div>
            </div>
            <button
              onClick={handleWorkerDownload}
              disabled={workerDownloading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-xs font-medium rounded-xl transition-colors duration-fast whitespace-nowrap"
            >
              <Download className="size-3.5" strokeWidth={2} />
              {workerDownloading ? '다운로드 중...' : '워커 설치'}
            </button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            * Windows 보호 화면이 나타나면 &apos;추가 정보&apos; → &apos;실행&apos;을 클릭하세요.
          </p>
        </div>
      )}

      {/* 워커 업데이트 배너 */}
      {workerInstalled && workerUpdateAvailable && (
        <div className="rounded-2xl bg-yellow-50 border border-yellow-200 px-4 sm:px-5 py-3.5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <div className="size-7 rounded-lg bg-yellow-100 text-yellow-700 flex items-center justify-center flex-shrink-0">
                <ArrowUpCircle className="size-4" strokeWidth={2} />
              </div>
              <div>
                <span className="text-sm font-semibold text-yellow-900">워커 업데이트가 있습니다</span>
                <p className="text-xs text-yellow-700 mt-0.5">
                  v{workerVersions.current} → v{workerVersions.latest}
                </p>
              </div>
            </div>
            <button
              onClick={handleWorkerUpdate}
              disabled={workerUpdating}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-yellow-600 hover:bg-yellow-700 disabled:opacity-50 text-white text-xs font-medium rounded-xl transition-colors duration-fast whitespace-nowrap"
            >
              <ArrowUpCircle className="size-3.5" strokeWidth={2} />
              {workerUpdating ? '요청 중...' : '업데이트'}
            </button>
          </div>
        </div>
      )}

      {/* 보고서 미작성 알림 */}
      {!dataLoading && !todaySummary.hasReport && (
        <div className="rounded-2xl bg-yellow-50 border border-yellow-200 px-4 sm:px-5 py-3">
          <div className="flex items-center gap-2.5">
            <AlertCircle className="size-4 text-yellow-600 flex-shrink-0" strokeWidth={2} />
            <span className="text-sm text-yellow-900">오늘의 일일보고서가 아직 작성되지 않았습니다.</span>
          </div>
        </div>
      )}

      {/* 본문 — 2컬럼 레이아웃 */}
      <div className="flex flex-col lg:flex-row gap-6">
        {/* 왼쪽: 메인 콘텐츠 */}
        <div className="flex-1 space-y-6">

          {/* KPI 카드 — 오늘의 현황 */}
          <div className="rounded-2xl bg-card shadow-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="size-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <TrendingUp className="size-4" strokeWidth={2} />
              </div>
              <p className="text-label uppercase text-muted-foreground">오늘의 현황</p>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              <button
                onClick={() => togglePanel(todayActivePanel, 'consult', setTodayActivePanel)}
                className={`rounded-xl p-3 text-center w-full transition-colors duration-fast ${todayActivePanel === 'consult' ? 'bg-accent ring-2 ring-primary/30' : 'bg-muted hover:bg-muted/70'}`}
              >
                <TrendingUp className="size-5 text-green-600 mx-auto mb-1.5" strokeWidth={2} />
                <p className="whitespace-nowrap">
                  <span className="text-xl font-bold text-green-700">{todaySummary.consultProceed}</span>
                  <span className="text-muted-foreground font-normal">/</span>
                  <span className="text-base font-semibold text-foreground">{todaySummary.consultCount}</span>
                </p>
                <p className="text-label uppercase text-muted-foreground mt-1">성공/상담</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{todayActivePanel === 'consult' ? '▲ 닫기' : '▼ 목록'}</p>
              </button>
              <button
                onClick={() => togglePanel(todayActivePanel, 'recall', setTodayActivePanel)}
                className={`rounded-xl p-3 text-center w-full transition-colors duration-fast ${todayActivePanel === 'recall' ? 'bg-accent ring-2 ring-primary/30' : 'bg-muted hover:bg-muted/70'}`}
              >
                <Calendar className="size-5 text-orange-500 mx-auto mb-1.5" strokeWidth={2} />
                <p className="whitespace-nowrap">
                  <span className="text-xl font-bold text-orange-600">{todaySummary.recallBookingCount}</span>
                  <span className="text-muted-foreground font-normal">/</span>
                  <span className="text-base font-semibold text-foreground">{todaySummary.recallCount}</span>
                </p>
                <p className="text-label uppercase text-muted-foreground mt-1">예약/리콜</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{todayActivePanel === 'recall' ? '▲ 닫기' : '▼ 현황'}</p>
              </button>
              <button
                onClick={() => togglePanel(todayActivePanel, 'gift', setTodayActivePanel)}
                className={`rounded-xl p-3 text-center w-full transition-colors duration-fast ${todayActivePanel === 'gift' ? 'bg-accent ring-2 ring-primary/30' : 'bg-muted hover:bg-muted/70'}`}
              >
                <BarChart3 className="size-5 text-primary mx-auto mb-1.5" strokeWidth={2} />
                <p className="whitespace-nowrap">
                  <span className="text-xl font-bold text-primary">{todaySummary.naverReviewCount}</span>
                  <span className="text-muted-foreground font-normal">/</span>
                  <span className="text-base font-semibold text-foreground">{todaySummary.giftCount}</span>
                </p>
                <p className="text-label uppercase text-muted-foreground mt-1">리뷰/선물</p>
                <p className="text-[10px] text-muted-foreground mt-0.5">{todayActivePanel === 'gift' ? '▲ 닫기' : '▼ 목록'}</p>
              </button>
            </div>

            {/* 상담 확장 패널 */}
            {todayActivePanel === 'consult' && (
              <div className="mt-3 bg-card border border-border rounded-2xl overflow-hidden">
                <div className="bg-muted px-4 py-2 flex justify-between items-center border-b border-border">
                  <span className="text-xs font-semibold text-foreground">오늘 상담 목록</span>
                  <span className="text-xs text-muted-foreground">총 {todayConsults.length}건</span>
                </div>
                {todayConsults.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">데이터가 없습니다</p>
                ) : (
                  <div className="divide-y divide-border max-h-[300px] overflow-y-auto">
                    {todayConsults.map((c, i) => (
                      <div key={c.id ?? i} className="flex items-center gap-2 px-4 py-2 text-sm">
                        <span className="font-medium text-foreground w-16 truncate">{c.patient_name}</span>
                        <span className="text-muted-foreground flex-1 truncate">{c.consult_content}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.consult_status === 'O' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                          {c.consult_status === 'O' ? '✓ 성공' : '✗ 보류'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 리콜 확장 패널 */}
            {todayActivePanel === 'recall' && (() => {
              const bookedNames = todayReport?.recall_booking_names
                ? todayReport.recall_booking_names.split(',').map(n => n.trim()).filter(Boolean)
                : []
              const unbookedCount = Math.max(0, (todayReport?.recall_count || 0) - bookedNames.length)
              return (
                <div className="mt-3 bg-card border border-border rounded-2xl overflow-hidden">
                  <div className="bg-muted px-4 py-2 flex justify-between items-center border-b border-border">
                    <span className="text-xs font-semibold text-foreground">오늘 리콜 현황</span>
                    <span className="text-xs text-muted-foreground">예약 {bookedNames.length} / 리콜 {todayReport?.recall_count || 0}건</span>
                  </div>
                  {(todayReport?.recall_count || 0) === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">데이터가 없습니다</p>
                  ) : (
                    <div className="px-4 py-3 space-y-2 max-h-[300px] overflow-y-auto">
                      {bookedNames.length > 0 && (
                        <div className="flex items-start gap-2">
                          <span className="text-xs text-muted-foreground w-14 pt-0.5">예약완료</span>
                          <div className="flex flex-wrap gap-1.5 flex-1">
                            {bookedNames.map((name, i) => (
                              <span key={i} className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">{name}</span>
                            ))}
                          </div>
                        </div>
                      )}
                      {unbookedCount > 0 && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground w-14">미예약</span>
                          <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">{unbookedCount}명</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )
            })()}

            {/* 선물 확장 패널 */}
            {todayActivePanel === 'gift' && (
              <div className="mt-3 bg-card border border-border rounded-2xl overflow-hidden">
                <div className="bg-muted px-4 py-2 flex justify-between items-center border-b border-border">
                  <span className="text-xs font-semibold text-foreground">오늘 선물/리뷰 목록</span>
                  <span className="text-xs text-muted-foreground">총 {todayGifts.length}건</span>
                </div>
                {todayGifts.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">데이터가 없습니다</p>
                ) : (
                  <div className="divide-y divide-border max-h-[300px] overflow-y-auto">
                    {todayGifts.map((g, i) => (
                      <div key={g.id ?? i} className="flex items-center gap-2 px-4 py-2 text-sm">
                        <span className="font-medium text-foreground w-16 truncate">{g.patient_name}</span>
                        <span className="text-muted-foreground flex-1 truncate">{g.gift_type} × {g.quantity}</span>
                        {g.naver_review === 'O' ? (
                          <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full font-medium">리뷰 ✓</span>
                        ) : (
                          <span className="text-xs text-muted-foreground">리뷰 없음</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* KPI 카드 — 팀 출퇴근 현황 */}
          <div className="rounded-2xl bg-card shadow-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="size-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <Calendar className="size-4" strokeWidth={2} />
              </div>
              <p className="text-label uppercase text-muted-foreground">팀 출퇴근 현황</p>
            </div>
            {attendanceLoading ? (
              <div className="flex justify-center py-6">
                <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : teamStatus ? (
              <div className="bg-muted rounded-xl p-4">
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
                  <button onClick={() => togglePanel(attendanceActivePanel, 'checkin', setAttendanceActivePanel)}
                    className={`rounded-xl p-2 text-center transition-colors duration-fast ${attendanceActivePanel === 'checkin' ? 'bg-accent ring-2 ring-primary/30' : 'hover:bg-muted/70'}`}>
                    <p className="text-lg font-bold text-green-600">{teamStatus.checked_in}<span className="text-muted-foreground font-normal">/</span><span className="text-foreground">{teamStatus.total_employees}</span></p>
                    <p className="text-label uppercase text-green-700">출근</p>
                  </button>
                  <button onClick={() => togglePanel(attendanceActivePanel, 'checkout', setAttendanceActivePanel)}
                    className={`rounded-xl p-2 text-center transition-colors duration-fast ${attendanceActivePanel === 'checkout' ? 'bg-accent ring-2 ring-primary/30' : 'hover:bg-muted/70'}`}>
                    <p className="text-lg font-bold text-primary">{teamStatus.checked_out || 0}</p>
                    <p className="text-label uppercase text-primary">퇴근</p>
                  </button>
                  <button onClick={() => togglePanel(attendanceActivePanel, 'absent', setAttendanceActivePanel)}
                    className={`rounded-xl p-2 text-center transition-colors duration-fast ${attendanceActivePanel === 'absent' ? 'bg-accent ring-2 ring-primary/30' : 'hover:bg-muted/70'}`}>
                    <p className="text-lg font-bold text-orange-600">{teamStatus.not_checked_in}</p>
                    <p className="text-label uppercase text-orange-600">결근</p>
                  </button>
                  <button onClick={() => togglePanel(attendanceActivePanel, 'late', setAttendanceActivePanel)}
                    className={`hidden sm:block rounded-xl p-2 text-center transition-colors duration-fast ${attendanceActivePanel === 'late' ? 'bg-accent ring-2 ring-primary/30' : 'hover:bg-muted/70'}`}>
                    <p className="text-lg font-bold text-yellow-600">{teamStatus.late_count}</p>
                    <p className="text-label uppercase text-yellow-600">지각</p>
                  </button>
                  <button onClick={() => togglePanel(attendanceActivePanel, 'early', setAttendanceActivePanel)}
                    className={`hidden sm:block rounded-xl p-2 text-center transition-colors duration-fast ${attendanceActivePanel === 'early' ? 'bg-accent ring-2 ring-primary/30' : 'hover:bg-muted/70'}`}>
                    <p className="text-lg font-bold text-red-600">{teamStatus.early_leave_count || 0}</p>
                    <p className="text-label uppercase text-red-600">조퇴</p>
                  </button>
                  <button onClick={() => togglePanel(attendanceActivePanel, 'overtime', setAttendanceActivePanel)}
                    className={`hidden sm:block rounded-xl p-2 text-center transition-colors duration-fast ${attendanceActivePanel === 'overtime' ? 'bg-accent ring-2 ring-primary/30' : 'hover:bg-muted/70'}`}>
                    <p className="text-lg font-bold text-purple-600">{teamStatus.overtime_count || 0}</p>
                    <p className="text-label uppercase text-purple-600">초과</p>
                  </button>
                </div>
                {teamStatus.total_employees > 0 && (
                  <div className="mt-3 pt-3 border-t border-border">
                    <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                      <span>출근률</span>
                      <span className="font-medium text-foreground">{attendanceRate}%</span>
                    </div>
                    <div className="w-full bg-border rounded-full h-1.5">
                      <div
                        className="bg-primary h-1.5 rounded-full transition-all"
                        style={{ width: `${attendanceRate}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* 출퇴근 확장 패널 */}
                {attendanceActivePanel && (() => {
                  type Emp = TeamAttendanceStatus['employees'][number]
                  const filterMap: Record<NonNullable<typeof attendanceActivePanel>, (e: Emp) => boolean> = {
                    checkin:  (e) => e.check_in_time != null,
                    checkout: (e) => e.check_out_time != null,
                    absent:   (e) => e.status === 'absent',
                    late:     (e) => e.late_minutes > 0,
                    early:    (e) => e.early_leave_minutes > 0,
                    overtime: (e) => e.overtime_minutes > 0,
                  }
                  const labelMap: Record<NonNullable<typeof attendanceActivePanel>, string> = {
                    checkin: '출근 직원', checkout: '퇴근 직원', absent: '결근 직원',
                    late: '지각 직원', early: '조퇴 직원', overtime: '초과근무 직원',
                  }
                  const filtered = (teamStatus.employees || []).filter(filterMap[attendanceActivePanel])
                  const formatTime = (iso: string | null | undefined) =>
                    iso ? new Date(iso).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }) : '-'
                  const statusTag = (e: Emp) => {
                    if (attendanceActivePanel === 'late') return `지각 ${e.late_minutes}분`
                    if (attendanceActivePanel === 'early') return `조퇴 ${e.early_leave_minutes}분`
                    if (attendanceActivePanel === 'overtime') return `초과 ${e.overtime_minutes}분`
                    if (e.status === 'absent') return '결근'
                    if (e.check_out_time) return '퇴근완료'
                    return '출근중'
                  }
                  return (
                    <div className="mt-3 bg-card border border-border rounded-2xl overflow-hidden">
                      <div className="bg-muted px-4 py-2 flex justify-between items-center border-b border-border">
                        <span className="text-xs font-semibold text-foreground">{labelMap[attendanceActivePanel]}</span>
                        <span className="text-xs text-muted-foreground">{filtered.length}명</span>
                      </div>
                      {filtered.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-4">데이터가 없습니다</p>
                      ) : (
                        <div className="divide-y divide-border max-h-[300px] overflow-y-auto">
                          {filtered.map(emp => (
                            <div key={emp.user_id} className="flex items-center gap-2 px-4 py-2 text-sm">
                              <span className="font-medium text-foreground w-16 truncate">{emp.user_name}</span>
                              <span className="text-muted-foreground flex-1 text-xs">
                                {emp.check_in_time ? `${formatTime(emp.check_in_time)} 출근` : ''}
                                {emp.check_out_time ? ` → ${formatTime(emp.check_out_time)} 퇴근` : ''}
                              </span>
                              <span className="text-xs px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{statusTag(emp)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
            ) : (
              <div className="text-center py-6 text-muted-foreground bg-muted rounded-xl">
                <p className="text-sm">출퇴근 현황을 불러올 수 없습니다.</p>
              </div>
            )}
          </div>

          {/* KPI 카드 — 주간 통계 */}
          <div className="rounded-2xl bg-card shadow-card p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="size-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <BarChart3 className="size-4" strokeWidth={2} />
                </div>
                <p className="text-label uppercase text-muted-foreground">주간 통계</p>
              </div>
              <span className="text-xs text-muted-foreground">
                {weeklySummary.weekStart.replace(/-/g, '.') } ~ {today.replace(/-/g, '.')}
              </span>
            </div>
            <div className="bg-muted rounded-xl p-4">
              <div className="grid grid-cols-3 gap-2 text-center">
                <button
                  onClick={() => togglePanel(weeklyActivePanel, 'consult', setWeeklyActivePanel)}
                  className={`rounded-xl p-2 transition-colors duration-fast text-left ${weeklyActivePanel === 'consult' ? 'bg-accent ring-2 ring-primary/30' : 'hover:bg-muted/70'}`}
                >
                  <p className="text-lg sm:text-xl font-bold text-green-700 text-center whitespace-nowrap">{weeklySummary.consultSuccess}<span className="text-muted-foreground font-normal">/</span><span className="text-foreground">{weeklySummary.consultTotal}</span></p>
                  <p className="text-label uppercase text-muted-foreground text-center mt-1">상담 {weeklySummary.successRate}%</p>
                </button>
                <button
                  onClick={() => togglePanel(weeklyActivePanel, 'recall', setWeeklyActivePanel)}
                  className={`rounded-xl p-2 transition-colors duration-fast text-left ${weeklyActivePanel === 'recall' ? 'bg-accent ring-2 ring-primary/30' : 'hover:bg-muted/70'}`}
                >
                  <p className="text-lg sm:text-xl font-bold text-orange-600 text-center whitespace-nowrap">{weeklySummary.recallBookingTotal}<span className="text-muted-foreground font-normal">/</span><span className="text-foreground">{weeklySummary.recallTotal}</span></p>
                  <p className="text-label uppercase text-muted-foreground text-center mt-1">예약/리콜</p>
                </button>
                <button
                  onClick={() => togglePanel(weeklyActivePanel, 'gift', setWeeklyActivePanel)}
                  className={`rounded-xl p-2 transition-colors duration-fast text-left ${weeklyActivePanel === 'gift' ? 'bg-accent ring-2 ring-primary/30' : 'hover:bg-muted/70'}`}
                >
                  <p className="text-lg sm:text-xl font-bold text-primary text-center whitespace-nowrap">{weeklySummary.giftTotal}<span className="text-muted-foreground font-normal">/</span><span className="text-foreground">{weeklySummary.reviewTotal}</span></p>
                  <p className="text-label uppercase text-muted-foreground text-center mt-1">선물/리뷰</p>
                </button>
              </div>
              {weeklyActivePanel && (
                <div className="mt-3 border-t border-border pt-3 max-h-[300px] overflow-y-auto animate-slideDown">
                  {weeklySummary.dailyBreakdown.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4">데이터가 없습니다</p>
                  ) : (
                    <div className="space-y-1">
                      {weeklySummary.dailyBreakdown.map(day => {
                        const numerator = weeklyActivePanel === 'consult' ? day.consultSuccess : weeklyActivePanel === 'recall' ? day.recallBookingCount : day.giftCount
                        const denominator = weeklyActivePanel === 'consult' ? day.consultCount : weeklyActivePanel === 'recall' ? day.recallCount : day.reviewCount
                        const pct = denominator > 0 ? Math.round((numerator / denominator) * 100) : 0
                        return (
                          <div key={day.date} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg ${day.isToday ? 'bg-accent' : ''}`}>
                            <span className={`text-xs font-medium w-6 ${day.isToday ? 'text-primary' : 'text-muted-foreground'}`}>{day.dayLabel}</span>
                            <span className={`text-xs w-20 ${day.isToday ? 'text-primary' : 'text-muted-foreground'}`}>{day.date.slice(5).replace('-', '/')}{day.isToday ? ' 진행중' : ''}</span>
                            <span className={`text-xs font-medium w-12 text-right ${day.isToday ? 'text-accent-foreground' : 'text-foreground'}`}>{numerator}/{denominator}</span>
                            <div className="flex-1 bg-border rounded-full h-[5px]">
                              <div className="bg-primary h-[5px] rounded-full transition-all" style={{ width: `${pct}%` }} />
                            </div>
                            <span className="text-xs text-muted-foreground w-8 text-right">{pct}%</span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

        </div>

        {/* 오른쪽: 사이드바 (날씨 + 뉴스) */}
        <div className="lg:w-72 space-y-6">

          {/* 날씨 카드 */}
          <div className="rounded-2xl bg-card shadow-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <div className="size-7 rounded-lg bg-yellow-100 text-yellow-600 flex items-center justify-center">
                <Sun className="size-4" strokeWidth={2} />
              </div>
              <p className="text-label uppercase text-muted-foreground">날씨</p>
            </div>
            {weatherLoading ? (
              <div className="flex justify-center py-6">
                <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : weather ? (
              <div className="space-y-3">
                {/* 현재 날씨 */}
                <div className="flex items-center gap-3">
                  {weatherIcons[weather.current.main] || <Cloud className="w-10 h-10 text-gray-400" />}
                  <div className="flex-1">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mb-0.5">
                      <MapPin className="w-3 h-3" />
                      <span>{weather.current.location}</span>
                      <span className="ml-1 px-1.5 py-0.5 bg-accent text-accent-foreground rounded text-[10px] font-medium">현재</span>
                    </div>
                    <p className="text-2xl font-bold text-foreground">{weather.current.temp}°<span className="text-sm font-normal text-muted-foreground ml-1">{weather.current.description}</span></p>
                    <p className="text-xs text-muted-foreground mt-0.5">체감 {weather.current.feels_like}° · 습도 {weather.current.humidity}%</p>
                  </div>
                </div>
                <div className="border-t border-border"></div>
                {/* 내일 날씨 */}
                <div className="flex items-center gap-3">
                  {weatherIconsSmall[weather.tomorrow.main] || <Cloud className="w-8 h-8 text-gray-400 opacity-70" />}
                  <div className="flex-1">
                    <div className="flex items-center gap-1 text-xs text-muted-foreground mb-0.5">
                      <Calendar className="w-3 h-3" />
                      <span>내일 ({weather.tomorrow.date})</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-lg font-bold text-foreground">{weather.tomorrow.tempMax}°</span>
                      <span className="text-sm text-muted-foreground">/ {weather.tomorrow.tempMin}°</span>
                      <span className="text-sm text-muted-foreground ml-1">{weather.tomorrow.description}</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {/* 치의신보 뉴스 카드 */}
          <div className="rounded-2xl bg-card shadow-card overflow-hidden">
            <div className="px-5 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <div className="size-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <Newspaper className="size-4" strokeWidth={2} />
                </div>
                <p className="text-label uppercase text-muted-foreground">치의신보</p>
              </div>
            </div>
            <div className="flex border-b border-border">
              <button
                onClick={() => setActiveNewsTab('popular')}
                className={`flex-1 px-3 py-2 text-xs font-medium transition-colors duration-fast flex items-center justify-center gap-1.5 ${
                  activeNewsTab === 'popular'
                    ? 'text-accent-foreground border-b-2 border-primary bg-accent'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                <Flame className="size-3.5" strokeWidth={2} />
                인기
              </button>
              <button
                onClick={() => setActiveNewsTab('latest')}
                className={`flex-1 px-3 py-2 text-xs font-medium transition-colors duration-fast flex items-center justify-center gap-1.5 ${
                  activeNewsTab === 'latest'
                    ? 'text-accent-foreground border-b-2 border-primary bg-accent'
                    : 'text-muted-foreground hover:text-foreground hover:bg-muted'
                }`}
              >
                <Newspaper className="size-3.5" strokeWidth={2} />
                최신
              </button>
            </div>
            {newsLoading ? (
              <div className="flex justify-center py-6">
                <div className="w-6 h-6 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : (
              <div className="divide-y divide-border">
                {(activeNewsTab === 'popular' ? popularArticles : latestArticles).length > 0 ? (
                  (activeNewsTab === 'popular' ? popularArticles : latestArticles).map((article) => (
                    <a
                      key={article.id}
                      href={article.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-2 px-4 py-2.5 hover:bg-muted transition-colors duration-fast group"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-foreground line-clamp-2 group-hover:text-primary">{article.title}</p>
                      </div>
                      <ExternalLink className="size-3.5 text-muted-foreground/50 group-hover:text-primary flex-shrink-0 mt-0.5" strokeWidth={2} />
                    </a>
                  ))
                ) : (
                  <div className="text-center py-6 text-muted-foreground">
                    <p className="text-sm">
                      {activeNewsTab === 'popular' ? '인기 게시물이 없습니다.' : '최신 게시물이 없습니다.'}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
