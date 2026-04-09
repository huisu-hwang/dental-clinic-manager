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

  // ── Local presentational helpers (no new files) ──────────────────────────

  // Skeleton shimmer used for loading states
  const Skeleton = ({ className }: { className?: string }) => (
    <div className={`animate-pulse rounded-lg bg-muted ${className ?? ''}`} />
  )

  // Reusable accordion content wrapper
  const AccordionPanel = ({ children }: { children: React.ReactNode }) => (
    <div className="border-t border-border/60 mt-4 pt-4">{children}</div>
  )

  // ── Derived display values ────────────────────────────────────────────────

  const consultSuccessRate = todaySummary.consultCount > 0
    ? Math.round((todaySummary.consultProceed / todaySummary.consultCount) * 100)
    : 0

  // ── JSX ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-0 pb-8">

      {/* ═══════════════════════════════════════════════════════════════════
          ZONE A — 오늘의 성과
      ═══════════════════════════════════════════════════════════════════ */}
      <div className="pt-2 pb-2">
        {/* Zone header */}
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="text-[15px] font-bold text-foreground">오늘의 성과</h2>
            <p className="text-[11px] text-muted-foreground/70 uppercase tracking-widest mt-0.5">TODAY&apos;S PERFORMANCE</p>
          </div>
          <button
            onClick={handleRefresh}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-muted hover:bg-muted/80 text-muted-foreground hover:text-foreground text-sm transition-colors duration-fast min-h-[44px]"
          >
            <RefreshCw className="size-4" strokeWidth={2} />
            <span className="hidden sm:inline">새로고침</span>
          </button>
        </div>

        {/* Hero row: progress ring + clock tile */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
          {/* Hero card — 출근률 ring */}
          <div className="lg:col-span-2 rounded-2xl bg-card shadow-card p-6 hover:shadow-hover transition-shadow duration-fast">
            <div className="flex items-center gap-2 mb-4">
              <div className="size-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <Home className="size-4" strokeWidth={2.5} />
              </div>
              <span className="text-label uppercase tracking-[0.05em] text-muted-foreground">팀 출근률</span>
              {!dataLoading && !todaySummary.hasReport && (
                <div className="ml-auto flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-yellow-50 border border-yellow-200">
                  <AlertCircle className="size-3.5 text-yellow-600 flex-shrink-0" strokeWidth={2} />
                  <span className="text-[11px] text-yellow-900 break-keep">일일보고서 미작성</span>
                </div>
              )}
            </div>
            <div className="flex items-center gap-8 flex-wrap">
              {/* SVG Progress Ring */}
              <div className="relative flex-shrink-0">
                {attendanceLoading ? (
                  <div className="w-[120px] h-[120px] rounded-full animate-pulse bg-muted" />
                ) : (
                  <div className="relative">
                    <ProgressRing value={Number(attendanceRate)} size={120} stroke={10} />
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-[28px] font-bold leading-none text-foreground">{attendanceRate}</span>
                      <span className="text-[13px] text-muted-foreground">%</span>
                    </div>
                  </div>
                )}
              </div>
              {/* Stats beside ring */}
              <div className="flex-1 min-w-0 space-y-3">
                {teamStatus && teamStatus.total_employees > 0 ? (
                  <>
                    <div>
                      <p className="text-[12px] text-muted-foreground mb-1">출근 인원</p>
                      <p className="text-[22px] font-bold text-foreground leading-none">
                        {teamStatus.checked_in}
                        <span className="text-[14px] font-normal text-muted-foreground ml-1">/ {teamStatus.total_employees}명</span>
                      </p>
                    </div>
                    <div className="flex gap-3 flex-wrap">
                      {teamStatus.late_count > 0 && (
                        <span className="text-[12px] px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
                          지각 {teamStatus.late_count}명
                        </span>
                      )}
                      {teamStatus.not_checked_in > 0 && (
                        <span className="text-[12px] px-2 py-0.5 rounded-full bg-red-50 text-destructive border border-red-200">
                          결근 {teamStatus.not_checked_in}명
                        </span>
                      )}
                      {(teamStatus.overtime_count || 0) > 0 && (
                        <span className="text-[12px] px-2 py-0.5 rounded-full bg-primary/5 text-primary border border-primary/20">
                          초과 {teamStatus.overtime_count}명
                        </span>
                      )}
                    </div>
                    {/* Mini progress bar */}
                    <div>
                      <div className="w-full bg-muted rounded-full h-1.5">
                        <div
                          className="bg-primary h-1.5 rounded-full transition-all duration-[600ms] ease-out"
                          style={{ width: `${attendanceRate}%` }}
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  <p className="text-[13px] text-muted-foreground">출퇴근 데이터를 불러오는 중...</p>
                )}
              </div>
            </div>
          </div>

          {/* Clock + date tile */}
          <div className="rounded-2xl bg-card shadow-card p-6 hover:shadow-hover transition-shadow duration-fast flex flex-col justify-between">
            <div>
              <p className="text-label uppercase tracking-[0.05em] text-muted-foreground mb-3">현재 시각</p>
              <p className="text-[40px] font-bold leading-none text-foreground tabular-nums">
                {currentTime.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false })}
              </p>
            </div>
            <div className="mt-4 pt-4 border-t border-border/60">
              <p className="text-[13px] text-muted-foreground leading-relaxed">
                {currentTime.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
              <p className="text-[12px] text-muted-foreground/70">
                {currentTime.toLocaleDateString('ko-KR', { weekday: 'long' })}
              </p>
            </div>
          </div>
        </div>

        {/* KPI strip — 4 cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">

          {/* KPI 1 — 상담 성공률 + progress bar spark */}
          <button
            onClick={() => togglePanel(todayActivePanel, 'consult', setTodayActivePanel)}
            className={`rounded-2xl bg-card shadow-card p-5 overflow-hidden text-left hover:shadow-hover transition-shadow duration-fast ${todayActivePanel === 'consult' ? 'ring-2 ring-primary/30' : ''}`}
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="size-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <TrendingUp className="size-4" strokeWidth={2} />
              </div>
              <span className="text-label uppercase tracking-[0.05em] text-muted-foreground">상담 성공률</span>
            </div>
            {dataLoading ? (
              <Skeleton className="h-10 w-24 mb-3" />
            ) : (
              <div className="mb-3 whitespace-nowrap">
                <span className="text-[36px] font-bold leading-none text-foreground">{consultSuccessRate}</span>
                <span className="text-[18px] ms-0.5 text-muted-foreground">%</span>
              </div>
            )}
            {/* Inline horizontal progress bar spark */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>성공 {todaySummary.consultProceed}건</span>
                <span>전체 {todaySummary.consultCount}건</span>
              </div>
              <div className="w-full bg-muted rounded-full h-1.5">
                <div
                  className="bg-primary h-1.5 rounded-full transition-all duration-[600ms] ease-out"
                  style={{ width: `${consultSuccessRate}%` }}
                />
              </div>
            </div>
          </button>

          {/* KPI 2 — 예약·리콜 + segmented dot indicator */}
          <button
            onClick={() => togglePanel(todayActivePanel, 'recall', setTodayActivePanel)}
            className={`rounded-2xl bg-card shadow-card p-5 overflow-hidden text-left hover:shadow-hover transition-shadow duration-fast ${todayActivePanel === 'recall' ? 'ring-2 ring-primary/30' : ''}`}
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="size-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <Calendar className="size-4" strokeWidth={2} />
              </div>
              <span className="text-label uppercase tracking-[0.05em] text-muted-foreground">예약·리콜</span>
            </div>
            {dataLoading ? (
              <Skeleton className="h-10 w-20 mb-3" />
            ) : (
              <div className="mb-3 whitespace-nowrap">
                <span className="text-[36px] font-bold leading-none text-foreground">{todaySummary.recallBookingCount}</span>
                <span className="text-[18px] ms-0.5 text-muted-foreground">건</span>
              </div>
            )}
            {/* Segmented dot indicator */}
            <div className="space-y-1.5">
              <p className="text-[11px] text-muted-foreground">리콜 {todaySummary.recallCount}건 중 예약</p>
              <SegmentedDots filled={todaySummary.recallBookingCount} total={Math.max(todaySummary.recallCount, todaySummary.recallBookingCount, 1)} />
            </div>
          </button>

          {/* KPI 3 — 리뷰·선물 + two stacked mini bars */}
          <button
            onClick={() => togglePanel(todayActivePanel, 'gift', setTodayActivePanel)}
            className={`rounded-2xl bg-card shadow-card p-5 overflow-hidden text-left hover:shadow-hover transition-shadow duration-fast ${todayActivePanel === 'gift' ? 'ring-2 ring-primary/30' : ''}`}
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="size-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <BarChart3 className="size-4" strokeWidth={2} />
              </div>
              <span className="text-label uppercase tracking-[0.05em] text-muted-foreground">리뷰·선물</span>
            </div>
            {dataLoading ? (
              <Skeleton className="h-10 w-20 mb-3" />
            ) : (
              <div className="mb-3 whitespace-nowrap">
                <span className="text-[36px] font-bold leading-none text-foreground">{todaySummary.naverReviewCount}</span>
                <span className="text-[18px] ms-0.5 text-muted-foreground">건</span>
              </div>
            )}
            {/* Two stacked mini bars */}
            <TwoBarComparison
              labelA="리뷰"
              valueA={todaySummary.naverReviewCount}
              labelB="선물"
              valueB={todaySummary.giftCount}
            />
          </button>

          {/* KPI 4 — 주간 상담 + 7-day sparkline */}
          <button
            onClick={() => togglePanel(weeklyActivePanel, 'consult', setWeeklyActivePanel)}
            className={`rounded-2xl bg-card shadow-card p-5 overflow-hidden text-left hover:shadow-hover transition-shadow duration-fast ${weeklyActivePanel === 'consult' ? 'ring-2 ring-primary/30' : ''}`}
          >
            <div className="flex items-center gap-2 mb-3">
              <div className="size-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <Flame className="size-4" strokeWidth={2} />
              </div>
              <span className="text-label uppercase tracking-[0.05em] text-muted-foreground">주간 상담</span>
            </div>
            {dataLoading ? (
              <Skeleton className="h-10 w-20 mb-3" />
            ) : (
              <div className="mb-3 whitespace-nowrap">
                <span className="text-[36px] font-bold leading-none text-foreground">{weeklySummary.successRate}</span>
                <span className="text-[18px] ms-0.5 text-muted-foreground">%</span>
              </div>
            )}
            {/* 7-day sparkline area chart */}
            <div className="space-y-1">
              <Sparkline
                data={weeklySummary.dailyBreakdown.map(d => d.consultCount)}
                width={120}
                height={28}
              />
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                <TrendingUp className="size-3 text-emerald-600" strokeWidth={2.5} />
                <span className="font-semibold text-foreground">{weeklySummary.consultSuccess}</span>
                <span>/ {weeklySummary.consultTotal}건</span>
              </div>
            </div>
          </button>

        </div>

        {/* KPI accordion panels — appear below the grid, full-width */}
        {(todayActivePanel || weeklyActivePanel) && (
          <div className="mt-4 rounded-2xl bg-card shadow-card p-5">
            {/* 오늘 상담 패널 */}
            {todayActivePanel === 'consult' && (
              <>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[14px] font-semibold text-foreground">오늘 상담 목록</span>
                  <span className="text-xs text-muted-foreground">총 {todayConsults.length}건</span>
                </div>
                {todayConsults.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-6 gap-2">
                    <div className="size-8 rounded-xl bg-muted flex items-center justify-center">
                      <TrendingUp className="size-4 text-muted-foreground" strokeWidth={2} />
                    </div>
                    <p className="text-[14px] text-muted-foreground">데이터가 없습니다</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/60 max-h-[300px] overflow-y-auto">
                    {todayConsults.map((c, i) => (
                      <div key={c.id ?? i} className="flex items-center gap-2 py-2 text-sm">
                        <span className="font-medium text-foreground w-16 truncate">{c.patient_name}</span>
                        <span className="text-muted-foreground flex-1 truncate">{c.consult_content}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.consult_status === 'O' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
                          {c.consult_status === 'O' ? '✓ 성공' : '✗ 보류'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            {/* 오늘 리콜 패널 */}
            {todayActivePanel === 'recall' && (() => {
              const bookedNames = todayReport?.recall_booking_names
                ? todayReport.recall_booking_names.split(',').map((n: string) => n.trim()).filter(Boolean)
                : []
              const unbookedCount = Math.max(0, (todayReport?.recall_count || 0) - bookedNames.length)
              return (
                <>
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[14px] font-semibold text-foreground">오늘 리콜 현황</span>
                    <span className="text-xs text-muted-foreground">예약 {bookedNames.length} / 리콜 {todayReport?.recall_count || 0}건</span>
                  </div>
                  {(todayReport?.recall_count || 0) === 0 ? (
                    <div className="flex flex-col items-center justify-center py-6 gap-2">
                      <div className="size-8 rounded-xl bg-muted flex items-center justify-center">
                        <Calendar className="size-4 text-muted-foreground" strokeWidth={2} />
                      </div>
                      <p className="text-[14px] text-muted-foreground">데이터가 없습니다</p>
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[300px] overflow-y-auto">
                      {bookedNames.length > 0 && (
                        <div className="flex items-start gap-2">
                          <span className="text-xs text-muted-foreground w-14 pt-0.5">예약완료</span>
                          <div className="flex flex-wrap gap-1.5 flex-1">
                            {bookedNames.map((name: string, i: number) => (
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
                </>
              )
            })()}

            {/* 오늘 선물 패널 */}
            {todayActivePanel === 'gift' && (
              <>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[14px] font-semibold text-foreground">오늘 선물·리뷰 목록</span>
                  <span className="text-xs text-muted-foreground">총 {todayGifts.length}건</span>
                </div>
                {todayGifts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-6 gap-2">
                    <div className="size-8 rounded-xl bg-muted flex items-center justify-center">
                      <BarChart3 className="size-4 text-muted-foreground" strokeWidth={2} />
                    </div>
                    <p className="text-[14px] text-muted-foreground">데이터가 없습니다</p>
                  </div>
                ) : (
                  <div className="divide-y divide-border/60 max-h-[300px] overflow-y-auto">
                    {todayGifts.map((g, i) => (
                      <div key={g.id ?? i} className="flex items-center gap-2 py-2 text-sm">
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
              </>
            )}

            {/* 주간 상담 일별 패널 */}
            {weeklyActivePanel === 'consult' && !todayActivePanel && (
              <>
                <div className="flex items-center justify-between mb-3">
                  <span className="text-[14px] font-semibold text-foreground">주간 일별 상담</span>
                  <span className="text-xs text-muted-foreground">{weeklySummary.weekStart.replace(/-/g, '.')} ~ {today.replace(/-/g, '.')}</span>
                </div>
                {weeklySummary.dailyBreakdown.length === 0 ? (
                  <p className="text-[14px] text-muted-foreground text-center py-4">데이터가 없습니다</p>
                ) : (
                  <div className="space-y-1 max-h-[300px] overflow-y-auto">
                    {weeklySummary.dailyBreakdown.map(day => {
                      const pct = day.consultCount > 0 ? Math.round((day.consultSuccess / day.consultCount) * 100) : 0
                      return (
                        <div key={day.date} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg ${day.isToday ? 'bg-accent' : ''}`}>
                          <span className={`text-xs font-medium w-6 ${day.isToday ? 'text-primary' : 'text-muted-foreground'}`}>{day.dayLabel}</span>
                          <span className={`text-xs w-20 ${day.isToday ? 'text-primary' : 'text-muted-foreground'}`}>{day.date.slice(5).replace('-', '/')}{day.isToday ? ' 진행중' : ''}</span>
                          <span className={`text-xs font-medium w-12 text-right ${day.isToday ? 'text-accent-foreground' : 'text-foreground'}`}>{day.consultSuccess}/{day.consultCount}</span>
                          <div className="flex-1 bg-muted rounded-full h-[5px]">
                            <div className="bg-primary h-[5px] rounded-full transition-all" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs text-muted-foreground w-8 text-right">{pct}%</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          ZONE B — 팀 & 주간 흐름
      ═══════════════════════════════════════════════════════════════════ */}
      <div className="mt-10 pt-2 pb-2">
        {/* Zone header */}
        <div className="mb-5">
          <h2 className="text-[15px] font-bold text-foreground">팀 &amp; 주간 흐름</h2>
          <p className="text-[11px] text-muted-foreground/70 uppercase tracking-widest mt-0.5">TEAM &amp; WEEKLY FLOW</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Left (lg:col-span-2) — 주간 통계 with bar chart */}
          <div className={`lg:col-span-2 rounded-2xl bg-card shadow-card p-5 hover:shadow-hover transition-shadow duration-fast ${weeklyActivePanel && weeklyActivePanel !== 'consult' ? 'ring-2 ring-primary/30' : ''}`}>
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <div className="size-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <BarChart3 className="size-4" strokeWidth={2} />
                </div>
                <span className="text-[18px] font-bold text-foreground">주간 통계</span>
              </div>
              <span className="text-xs text-muted-foreground">
                {weeklySummary.weekStart.replace(/-/g, '.')} ~ {today.replace(/-/g, '.')}
              </span>
            </div>

            {/* SVG Bar chart */}
            {dataLoading ? (
              <Skeleton className="h-40 w-full mb-4" />
            ) : (
              <WeekBarChart
                data={weeklySummary.dailyBreakdown.map(d => d.consultCount)}
                labels={weeklySummary.dailyBreakdown.map(d => d.dayLabel)}
                todayIndex={weeklySummary.dailyBreakdown.findIndex(d => d.isToday)}
              />
            )}

            {/* Footer: 3 mini stats as clickable tiles */}
            <div className="border-t border-border pt-5 mt-2">
              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={() => togglePanel(weeklyActivePanel, 'recall', setWeeklyActivePanel)}
                  className={`rounded-xl p-3 text-center transition-colors duration-fast ${weeklyActivePanel === 'recall' ? 'bg-accent ring-2 ring-primary/30' : 'bg-muted hover:bg-muted/70'}`}
                >
                  <p className="whitespace-nowrap mb-1">
                    <span className="text-xl font-bold text-green-700">{weeklySummary.consultSuccess}</span>
                    <span className="text-muted-foreground font-normal text-sm">/</span>
                    <span className="text-base font-semibold text-foreground">{weeklySummary.consultTotal}</span>
                  </p>
                  <p className="text-label uppercase text-muted-foreground">상담 {weeklySummary.successRate}%</p>
                </button>

                <button
                  onClick={() => togglePanel(weeklyActivePanel, 'recall', setWeeklyActivePanel)}
                  className={`rounded-xl p-3 text-center transition-colors duration-fast ${weeklyActivePanel === 'recall' ? 'bg-accent ring-2 ring-primary/30' : 'bg-muted hover:bg-muted/70'}`}
                >
                  <p className="whitespace-nowrap mb-1">
                    <span className="text-xl font-bold text-foreground">{weeklySummary.recallBookingTotal}</span>
                    <span className="text-muted-foreground font-normal text-sm">/</span>
                    <span className="text-base font-semibold text-foreground">{weeklySummary.recallTotal}</span>
                  </p>
                  <p className="text-label uppercase text-muted-foreground">예약·리콜</p>
                </button>

                <button
                  onClick={() => togglePanel(weeklyActivePanel, 'gift', setWeeklyActivePanel)}
                  className={`rounded-xl p-3 text-center transition-colors duration-fast ${weeklyActivePanel === 'gift' ? 'bg-accent ring-2 ring-primary/30' : 'bg-muted hover:bg-muted/70'}`}
                >
                  <p className="whitespace-nowrap mb-1">
                    <span className="text-xl font-bold text-foreground">{weeklySummary.giftTotal}</span>
                    <span className="text-muted-foreground font-normal text-sm">/</span>
                    <span className="text-base font-semibold text-foreground">{weeklySummary.reviewTotal}</span>
                  </p>
                  <p className="text-label uppercase text-muted-foreground">선물·리뷰</p>
                </button>
              </div>
            </div>

            {/* Weekly accordion — recall / gift daily breakdown */}
            {(weeklyActivePanel === 'recall' || weeklyActivePanel === 'gift') && (
              <AccordionPanel>
                {weeklySummary.dailyBreakdown.length === 0 ? (
                  <p className="text-[14px] text-muted-foreground text-center py-4">데이터가 없습니다</p>
                ) : (
                  <div className="space-y-1 max-h-[260px] overflow-y-auto">
                    {weeklySummary.dailyBreakdown.map(day => {
                      const numerator = weeklyActivePanel === 'recall' ? day.recallBookingCount : day.giftCount
                      const denominator = weeklyActivePanel === 'recall' ? day.recallCount : day.reviewCount
                      const pct = denominator > 0 ? Math.round((numerator / denominator) * 100) : 0
                      return (
                        <div key={day.date} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg ${day.isToday ? 'bg-accent' : ''}`}>
                          <span className={`text-xs font-medium w-6 ${day.isToday ? 'text-primary' : 'text-muted-foreground'}`}>{day.dayLabel}</span>
                          <span className={`text-xs w-20 ${day.isToday ? 'text-primary' : 'text-muted-foreground'}`}>{day.date.slice(5).replace('-', '/')}{day.isToday ? ' 진행중' : ''}</span>
                          <span className={`text-xs font-medium w-12 text-right ${day.isToday ? 'text-accent-foreground' : 'text-foreground'}`}>{numerator}/{denominator}</span>
                          <div className="flex-1 bg-muted rounded-full h-[5px]">
                            <div className="bg-primary h-[5px] rounded-full transition-all" style={{ width: `${pct}%` }} />
                          </div>
                          <span className="text-xs text-muted-foreground w-8 text-right">{pct}%</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </AccordionPanel>
            )}
          </div>

          {/* Right (lg:col-span-1) — 팀 출퇴근 with donut ring */}
          <div className={`rounded-2xl bg-card shadow-card p-5 hover:shadow-hover transition-shadow duration-fast ${attendanceActivePanel ? 'ring-2 ring-primary/30' : ''}`}>
            <div className="flex items-center gap-2 mb-4">
              <div className="size-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <Calendar className="size-4" strokeWidth={2} />
              </div>
              <span className="text-[18px] font-bold text-foreground">팀 출퇴근</span>
            </div>

            {attendanceLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-24 w-24 rounded-full mx-auto" />
                <div className="grid grid-cols-2 gap-2">
                  {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
                </div>
              </div>
            ) : teamStatus ? (
              <>
                {/* Donut ring centered */}
                <div className="flex justify-center mb-4">
                  <div className="relative">
                    <DonutMini
                      percent={teamStatus.total_employees > 0 ? Math.round((teamStatus.checked_in / teamStatus.total_employees) * 100) : 0}
                      size={96}
                      stroke={10}
                    />
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-[18px] font-bold text-foreground leading-none">{attendanceRate}%</span>
                      <span className="text-[10px] text-muted-foreground">출근</span>
                    </div>
                  </div>
                </div>

                {/* 2x3 status grid */}
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => togglePanel(attendanceActivePanel, 'checkin', setAttendanceActivePanel)}
                    className={`rounded-xl p-2.5 text-center transition-colors duration-fast ${attendanceActivePanel === 'checkin' ? 'bg-accent ring-2 ring-primary/30' : 'bg-muted hover:bg-muted/70'}`}>
                    <div className="flex items-center justify-center gap-1.5 mb-0.5">
                      <span className="size-1.5 rounded-full bg-emerald-500 flex-shrink-0" />
                      <span className="text-[11px] text-muted-foreground">출근</span>
                    </div>
                    <p className="text-base font-bold text-emerald-600">{teamStatus.checked_in}<span className="text-[11px] text-muted-foreground font-normal">/{teamStatus.total_employees}</span></p>
                  </button>

                  <button onClick={() => togglePanel(attendanceActivePanel, 'checkout', setAttendanceActivePanel)}
                    className={`rounded-xl p-2.5 text-center transition-colors duration-fast ${attendanceActivePanel === 'checkout' ? 'bg-accent ring-2 ring-primary/30' : 'bg-muted hover:bg-muted/70'}`}>
                    <div className="flex items-center justify-center gap-1.5 mb-0.5">
                      <span className="size-1.5 rounded-full bg-muted-foreground/40 flex-shrink-0" />
                      <span className="text-[11px] text-muted-foreground">퇴근</span>
                    </div>
                    <p className="text-base font-bold text-foreground">{teamStatus.checked_out || 0}</p>
                  </button>

                  <button onClick={() => togglePanel(attendanceActivePanel, 'absent', setAttendanceActivePanel)}
                    className={`rounded-xl p-2.5 text-center transition-colors duration-fast ${attendanceActivePanel === 'absent' ? 'bg-accent ring-2 ring-primary/30' : 'bg-muted hover:bg-muted/70'}`}>
                    <div className="flex items-center justify-center gap-1.5 mb-0.5">
                      <span className="size-1.5 rounded-full bg-destructive flex-shrink-0" />
                      <span className="text-[11px] text-muted-foreground">결근</span>
                    </div>
                    <p className="text-base font-bold text-destructive">{teamStatus.not_checked_in}</p>
                  </button>

                  <button onClick={() => togglePanel(attendanceActivePanel, 'late', setAttendanceActivePanel)}
                    className={`rounded-xl p-2.5 text-center transition-colors duration-fast ${attendanceActivePanel === 'late' ? 'bg-accent ring-2 ring-primary/30' : 'bg-muted hover:bg-muted/70'}`}>
                    <div className="flex items-center justify-center gap-1.5 mb-0.5">
                      <span className="size-1.5 rounded-full bg-amber-500 flex-shrink-0" />
                      <span className="text-[11px] text-muted-foreground">지각</span>
                    </div>
                    <p className="text-base font-bold text-amber-500">{teamStatus.late_count}</p>
                  </button>

                  <button onClick={() => togglePanel(attendanceActivePanel, 'early', setAttendanceActivePanel)}
                    className={`rounded-xl p-2.5 text-center transition-colors duration-fast ${attendanceActivePanel === 'early' ? 'bg-accent ring-2 ring-primary/30' : 'bg-muted hover:bg-muted/70'}`}>
                    <div className="flex items-center justify-center gap-1.5 mb-0.5">
                      <span className="size-1.5 rounded-full bg-rose-400 flex-shrink-0" />
                      <span className="text-[11px] text-muted-foreground">조퇴</span>
                    </div>
                    <p className="text-base font-bold text-rose-400">{teamStatus.early_leave_count || 0}</p>
                  </button>

                  <button onClick={() => togglePanel(attendanceActivePanel, 'overtime', setAttendanceActivePanel)}
                    className={`rounded-xl p-2.5 text-center transition-colors duration-fast ${attendanceActivePanel === 'overtime' ? 'bg-accent ring-2 ring-primary/30' : 'bg-muted hover:bg-muted/70'}`}>
                    <div className="flex items-center justify-center gap-1.5 mb-0.5">
                      <span className="size-1.5 rounded-full bg-primary flex-shrink-0" />
                      <span className="text-[11px] text-muted-foreground">초과</span>
                    </div>
                    <p className="text-base font-bold text-primary">{teamStatus.overtime_count || 0}</p>
                  </button>
                </div>

                {/* Attendance accordion */}
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
                    <AccordionPanel>
                      <div className="flex items-center justify-between mb-3">
                        <span className="text-[14px] font-semibold text-foreground">{labelMap[attendanceActivePanel]}</span>
                        <span className="text-xs text-muted-foreground">{filtered.length}명</span>
                      </div>
                      {filtered.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-6 gap-2">
                          <div className="size-8 rounded-xl bg-muted flex items-center justify-center">
                            <Calendar className="size-4 text-muted-foreground" strokeWidth={2} />
                          </div>
                          <p className="text-[14px] text-muted-foreground">데이터가 없습니다</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-border/60 max-h-[300px] overflow-y-auto">
                          {filtered.map(emp => (
                            <div key={emp.user_id} className="flex items-center gap-2 py-2 text-sm">
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
                    </AccordionPanel>
                  )
                })()}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <div className="size-8 rounded-xl bg-muted flex items-center justify-center">
                  <Calendar className="size-4 text-muted-foreground" strokeWidth={2} />
                </div>
                <p className="text-[14px] text-muted-foreground">출퇴근 현황을 불러올 수 없습니다</p>
              </div>
            )}
          </div>

        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          ZONE C — 병원 밖 컨텍스트
      ═══════════════════════════════════════════════════════════════════ */}
      <div className="mt-10 pt-2 pb-2">
        {/* Zone header */}
        <div className="mb-5">
          <h2 className="text-[15px] font-bold text-foreground">병원 밖 컨텍스트</h2>
          <p className="text-[11px] text-muted-foreground/70 uppercase tracking-widest mt-0.5">EXTERNAL CONTEXT</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Card 1 — 날씨 */}
          <div className="rounded-2xl bg-card shadow-card p-5 hover:shadow-hover transition-shadow duration-fast">
            <div className="flex items-start justify-between mb-2">
              <div>
                <p className="text-label uppercase tracking-[0.05em] text-muted-foreground mb-1">날씨</p>
                {weatherLoading ? (
                  <Skeleton className="h-12 w-24" />
                ) : weather ? (
                  <p className="text-[48px] font-bold leading-none text-foreground">
                    {weather.current.temp}°
                  </p>
                ) : null}
              </div>
              {weather && !weatherLoading && (
                <div className="text-muted-foreground">
                  {weatherIcons[weather.current.main] || <Cloud className="w-10 h-10 text-muted-foreground" />}
                </div>
              )}
            </div>

            {weather && !weatherLoading && (
              <>
                <div className="space-y-1 mb-4">
                  <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <MapPin className="w-3 h-3 flex-shrink-0" />
                    <span>{weather.current.location}</span>
                    <span className="text-muted-foreground/60">{weather.current.description}</span>
                  </div>
                  <p className="text-[12px] text-muted-foreground">체감 {weather.current.feels_like}°</p>
                  <p className="text-[12px] text-muted-foreground">습도 {weather.current.humidity}%</p>
                  <p className="text-[12px] text-muted-foreground">바람 {weather.current.wind_speed}m/s</p>
                </div>

                <div className="border-t border-border/60 pt-4">
                  <div className="flex items-center gap-3">
                    <div className="opacity-70">
                      {weatherIconsSmall[weather.tomorrow.main] || <Cloud className="w-6 h-6 text-muted-foreground" />}
                    </div>
                    <div>
                      <p className="text-[11px] text-muted-foreground mb-0.5">내일 ({weather.tomorrow.date})</p>
                      <p className="text-[13px] font-semibold text-foreground">
                        {weather.tomorrow.tempMax}° <span className="text-muted-foreground font-normal text-[12px]">/ {weather.tomorrow.tempMin}°</span>
                        <span className="text-muted-foreground font-normal text-[12px] ml-1.5">{weather.tomorrow.description}</span>
                      </p>
                    </div>
                  </div>
                </div>
              </>
            )}

            {!weather && !weatherLoading && (
              <div className="flex flex-col items-center justify-center py-6 gap-2">
                <Sun className="size-8 text-muted-foreground" strokeWidth={1.5} />
                <p className="text-[14px] text-muted-foreground">날씨 정보를 불러올 수 없습니다</p>
              </div>
            )}
          </div>

          {/* Card 2 — 치의신보 뉴스 */}
          <div className="rounded-2xl bg-card shadow-card overflow-hidden hover:shadow-hover transition-shadow duration-fast">
            <div className="px-5 py-4">
              <div className="flex items-center gap-2 mb-4">
                <div className="size-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <Newspaper className="size-4" strokeWidth={2} />
                </div>
                <span className="text-[15px] font-bold text-foreground">치의신보</span>
              </div>

              {/* Pill-toggle tab segment */}
              <div className="flex bg-muted rounded-full p-1 gap-1 mb-4">
                <button
                  onClick={() => setActiveNewsTab('popular')}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition-all duration-fast min-h-[36px] ${
                    activeNewsTab === 'popular'
                      ? 'bg-card shadow-card text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Flame className="size-3" strokeWidth={2} />
                  인기
                </button>
                <button
                  onClick={() => setActiveNewsTab('latest')}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium transition-all duration-fast min-h-[36px] ${
                    activeNewsTab === 'latest'
                      ? 'bg-card shadow-card text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Newspaper className="size-3" strokeWidth={2} />
                  최신
                </button>
              </div>

              {/* News list */}
              {newsLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
                </div>
              ) : (
                <div className="space-y-0 divide-y divide-border/60">
                  {(activeNewsTab === 'popular' ? popularArticles : latestArticles).slice(0, 3).length > 0 ? (
                    (activeNewsTab === 'popular' ? popularArticles : latestArticles).slice(0, 3).map((article, idx) => (
                      <a
                        key={article.id}
                        href={article.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-start gap-3 py-3 hover:bg-muted/50 rounded-lg px-1 -mx-1 transition-colors duration-fast group"
                      >
                        <span className="text-[11px] font-bold text-muted-foreground w-5 flex-shrink-0 mt-0.5">{idx + 1}</span>
                        <p className="text-[13px] text-foreground line-clamp-2 flex-1 group-hover:text-primary break-keep leading-relaxed">{article.title}</p>
                        <ExternalLink className="size-3 text-muted-foreground/40 group-hover:text-primary flex-shrink-0 mt-1" strokeWidth={2} />
                      </a>
                    ))
                  ) : (
                    <div className="flex flex-col items-center justify-center py-8 gap-2">
                      <Newspaper className="size-6 text-muted-foreground" strokeWidth={1.5} />
                      <p className="text-[13px] text-muted-foreground">
                        {activeNewsTab === 'popular' ? '인기 게시물이 없습니다' : '최신 게시물이 없습니다'}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Card 3 — 시스템 상태 (워커) */}
          <div className="rounded-2xl bg-card shadow-card p-5 hover:shadow-hover transition-shadow duration-fast">
            <div className="flex items-center gap-2 mb-4">
              <div className="size-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                <Monitor className="size-4" strokeWidth={2} />
              </div>
              <span className="text-[15px] font-bold text-foreground">시스템 상태</span>
            </div>

            {workerInstalled === null ? (
              <Skeleton className="h-16 w-full" />
            ) : workerInstalled === false ? (
              <div className="space-y-3">
                {/* Status indicator */}
                <div className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-destructive flex-shrink-0" />
                  <span className="text-[13px] font-semibold text-foreground">워커 미설치</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <AlertCircle className="size-4 text-muted-foreground flex-shrink-0 mt-0.5" strokeWidth={2} />
                  <p className="text-[12px] text-muted-foreground break-keep">블로그 발행, 홈택스 연동, SEO 분석 기능을 사용하려면 설치해주세요.</p>
                </div>
                <button
                  onClick={handleWorkerDownload}
                  disabled={workerDownloading}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-sm font-medium rounded-xl transition-colors duration-fast min-h-[44px]"
                >
                  <Download className="size-4" strokeWidth={2} />
                  {workerDownloading ? '다운로드 중...' : '워커 설치'}
                </button>
                <p className="text-[11px] text-muted-foreground break-keep">
                  Windows 보호 화면이 나타나면 &apos;추가 정보&apos; → &apos;실행&apos;을 클릭하세요.
                </p>
              </div>
            ) : workerUpdateAvailable ? (
              <div className="space-y-3">
                {/* Status indicator */}
                <div className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-amber-500 flex-shrink-0" />
                  <span className="text-[13px] font-semibold text-foreground">업데이트 있음</span>
                </div>
                <div className="flex items-start gap-2.5">
                  <ArrowUpCircle className="size-4 text-amber-500 flex-shrink-0 mt-0.5" strokeWidth={2} />
                  <p className="text-[12px] text-muted-foreground">
                    v{workerVersions.current} → v{workerVersions.latest}
                  </p>
                </div>
                {workerVersions.current && (
                  <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-muted text-[11px] text-muted-foreground">
                    현재 v{workerVersions.current}
                  </span>
                )}
                <button
                  onClick={handleWorkerUpdate}
                  disabled={workerUpdating}
                  className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2.5 bg-primary hover:bg-primary/90 disabled:opacity-50 text-primary-foreground text-sm font-medium rounded-xl transition-colors duration-fast min-h-[44px]"
                >
                  <ArrowUpCircle className="size-4" strokeWidth={2} />
                  {workerUpdating ? '업데이트 중...' : '업데이트'}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Running status with ping animation */}
                <div className="flex items-center gap-2.5">
                  <div className="relative flex-shrink-0">
                    <span className="absolute inline-flex size-2 rounded-full bg-emerald-500 opacity-75 animate-ping" />
                    <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
                  </div>
                  <span className="text-[13px] font-semibold text-foreground">워커 실행 중</span>
                </div>
                {workerVersions.current && (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-muted text-[12px] text-muted-foreground">
                    v{workerVersions.current}
                  </span>
                )}
                <div className="pt-2 border-t border-border/60">
                  <p className="text-[11px] text-muted-foreground">블로그 발행 · 홈택스 연동 · SEO 분석 활성화</p>
                </div>
              </div>
            )}
          </div>

        </div>
      </div>

    </div>
  )
}

// ── Pure SVG visualization components ────────────────────────────────────────
// These are file-local (not exported) — defined outside the component
// to avoid re-creation on every render.

function ProgressRing({ value, size = 160, stroke = 12 }: { value: number; size?: number; stroke?: number }) {
  const radius = (size - stroke) / 2
  const circumference = radius * 2 * Math.PI
  const clamped = Math.min(Math.max(value, 0), 100)
  const offset = circumference - (clamped / 100) * circumference
  return (
    <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={radius} stroke="hsl(var(--muted))" strokeWidth={stroke} fill="none" />
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        stroke="hsl(var(--primary))" strokeWidth={stroke} fill="none"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-[600ms] ease-out"
      />
    </svg>
  )
}

function DonutMini({ percent, size = 96, stroke = 10 }: { percent: number; size?: number; stroke?: number }) {
  const radius = (size - stroke) / 2
  const c = radius * 2 * Math.PI
  const clamped = Math.min(Math.max(percent, 0), 100)
  const offset = c - (clamped / 100) * c
  return (
    <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
      <circle cx={size / 2} cy={size / 2} r={radius} stroke="hsl(var(--muted))" strokeWidth={stroke} fill="none" />
      <circle
        cx={size / 2} cy={size / 2} r={radius}
        stroke="hsl(var(--primary))" strokeWidth={stroke} fill="none"
        strokeDasharray={c} strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-[600ms]"
      />
    </svg>
  )
}

function Sparkline({ data, width = 120, height = 32 }: { data: number[]; width?: number; height?: number }) {
  if (!data.length || data.every(v => v === 0)) {
    return <div className="h-[28px] w-full bg-muted/40 rounded" />
  }
  const max = Math.max(...data, 1)
  const pad = 3
  const points = data.map((d, i) => {
    const x = data.length === 1 ? width / 2 : (i / (data.length - 1)) * width
    const y = height - pad - (d / max) * (height - pad * 2)
    return `${x},${y}`
  }).join(' ')
  const areaPoints = `0,${height} ${points} ${width},${height}`
  return (
    <svg width={width} height={height} className="overflow-visible w-full" aria-hidden="true">
      <polyline points={areaPoints} fill="hsl(var(--primary) / 0.12)" stroke="none" />
      <polyline points={points} fill="none" stroke="hsl(var(--primary))" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function WeekBarChart({ data, labels, todayIndex }: { data: number[]; labels: string[]; todayIndex: number }) {
  const max = Math.max(...data, 1)
  return (
    <div className="h-40 flex items-end justify-between gap-1.5 px-1">
      {data.map((v, i) => {
        const hPct = Math.max((v / max) * 100, v > 0 ? 4 : 1)
        const isToday = i === todayIndex
        const isMax = v === max && v > 0
        return (
          <div key={i} className="flex-1 flex flex-col items-center gap-2">
            <div className="w-full flex items-end justify-center" style={{ height: 128 }}>
              <div
                className={`w-full rounded-t-[4px] transition-all duration-[600ms] ease-out ${
                  isToday ? 'bg-primary' : isMax ? 'bg-primary/70' : 'bg-primary/30'
                }`}
                style={{ height: `${hPct}%` }}
                title={`${labels[i]}: ${v}건`}
              />
            </div>
            <span className={`text-[10px] ${isToday ? 'text-primary font-semibold' : 'text-muted-foreground'}`}>
              {labels[i]}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function SegmentedDots({ filled, total }: { filled: number; total: number }) {
  const clampedTotal = Math.min(Math.max(total, 1), 10)
  const clampedFilled = Math.min(filled, clampedTotal)
  return (
    <div className="flex gap-1 flex-wrap">
      {Array.from({ length: clampedTotal }).map((_, i) => (
        <span
          key={i}
          className={`size-2 rounded-full flex-shrink-0 ${i < clampedFilled ? 'bg-primary' : 'bg-muted'}`}
        />
      ))}
    </div>
  )
}

function TwoBarComparison({ labelA, valueA, labelB, valueB }: {
  labelA: string; valueA: number; labelB: string; valueB: number
}) {
  const max = Math.max(valueA, valueB, 1)
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-muted-foreground w-8">{labelA}</span>
        <div className="flex-1 bg-muted rounded-full h-1.5">
          <div
            className="bg-primary h-1.5 rounded-full transition-all duration-[600ms] ease-out"
            style={{ width: `${(valueA / max) * 100}%` }}
          />
        </div>
        <span className="text-[11px] font-semibold text-foreground w-4 text-right">{valueA}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[11px] text-muted-foreground w-8">{labelB}</span>
        <div className="flex-1 bg-muted rounded-full h-1.5">
          <div
            className="bg-primary/50 h-1.5 rounded-full transition-all duration-[600ms] ease-out"
            style={{ width: `${(valueB / max) * 100}%` }}
          />
        </div>
        <span className="text-[11px] font-semibold text-foreground w-4 text-right">{valueB}</span>
      </div>
    </div>
  )
}
