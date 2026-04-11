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
  'Clouds': <Cloud className="w-10 h-10 text-at-text-weak" />,
  'Rain': <CloudRain className="w-10 h-10 text-blue-500" />,
  'Snow': <CloudSnow className="w-10 h-10 text-blue-300" />,
  'Drizzle': <CloudRain className="w-10 h-10 text-at-accent" />,
  'Thunderstorm': <CloudRain className="w-10 h-10 text-purple-500" />,
  'Mist': <Wind className="w-10 h-10 text-at-text-weak" />,
  'Fog': <Wind className="w-10 h-10 text-at-text-weak" />,
}

// 내일 날씨용 작은 아이콘 매핑
const weatherIconsSmall: Record<string, React.ReactNode> = {
  'Clear': <Sun className="w-8 h-8 text-yellow-500 opacity-70" />,
  'Clouds': <Cloud className="w-8 h-8 text-at-text-weak opacity-70" />,
  'Rain': <CloudRain className="w-8 h-8 text-blue-500 opacity-70" />,
  'Snow': <CloudSnow className="w-8 h-8 text-blue-300 opacity-70" />,
  'Drizzle': <CloudRain className="w-8 h-8 text-at-accent opacity-70" />,
  'Thunderstorm': <CloudRain className="w-8 h-8 text-purple-500 opacity-70" />,
  'Mist': <Wind className="w-8 h-8 text-at-text-weak opacity-70" />,
  'Fog': <Wind className="w-8 h-8 text-at-text-weak opacity-70" />,
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
  const [workerUpdateStatus, setWorkerUpdateStatus] = useState<string | null>(null)
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
          setWorkerUpdateStatus(data.marketing?.updateStatus ?? null)
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
    <div className="bg-white rounded-2xl overflow-hidden border border-at-border shadow-at-card">
      {/* 헤더 — Airtable Blue */}
      <div className="bg-at-accent px-4 sm:px-6 py-3 sm:py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2 sm:space-x-3">
            <div className="w-8 h-8 sm:w-10 sm:h-10 bg-white/15 rounded-xl flex items-center justify-center">
              <Home className="w-4 h-4 sm:w-5 sm:h-5 text-white" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white tracking-[0.08px]">대시보드</h2>
              <p className="text-white/70 text-xs sm:text-sm hidden sm:block tracking-[0.12px]">{formatDate(currentTime)}</p>
            </div>
          </div>
          <button
            onClick={handleRefresh}
            className="inline-flex items-center px-2 sm:px-3 py-1.5 bg-white/15 hover:bg-white/25 rounded-xl text-white text-xs sm:text-sm transition-colors tracking-[0.08px]"
          >
            <RefreshCw className="w-3.5 h-3.5 sm:w-4 sm:h-4 mr-1.5" />
            새로고침
          </button>
        </div>
      </div>

      {/* 워커 미설치 배너 */}
      {workerInstalled === false && (
        <div className="bg-at-accent-light border-b border-at-border px-4 sm:px-6 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Monitor className="w-4 h-4 text-at-accent flex-shrink-0" />
              <div>
                <span className="text-sm font-medium text-at-text tracking-[0.08px]">클리닉 매니저 워커가 설치되지 않았습니다</span>
                <p className="text-xs text-at-text-secondary mt-0.5 tracking-[0.07px]">
                  블로그 발행, 홈택스 연동, SEO 분석 등의 기능을 사용하려면 워커를 설치해주세요.
                </p>
              </div>
            </div>
            <button
              onClick={handleWorkerDownload}
              disabled={workerDownloading}
              className="inline-flex items-center px-3 py-1.5 bg-at-accent hover:bg-at-accent-hover disabled:bg-at-accent/60 text-white text-xs font-medium rounded-xl transition-colors whitespace-nowrap ml-4 tracking-[0.08px]"
            >
              <Download className="w-3.5 h-3.5 mr-1.5" />
              {workerDownloading ? '다운로드 중...' : '워커 설치'}
            </button>
          </div>
          <p className="text-xs text-at-text-weak mt-1.5 tracking-[0.07px]">
            * Windows 보호 화면이 나타나면 &apos;추가 정보&apos; → &apos;실행&apos;을 클릭하세요.
          </p>
        </div>
      )}

      {/* 워커 업데이트 배너 */}
      {workerInstalled && workerUpdateAvailable && (
        <div className={`border-b px-4 sm:px-6 py-3 ${workerUpdateStatus === 'downloaded' ? 'bg-green-50 border-green-200' : 'bg-amber-50 border-amber-200'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <ArrowUpCircle className={`w-4 h-4 flex-shrink-0 ${workerUpdateStatus === 'downloaded' ? 'text-green-600' : 'text-amber-600'}`} />
              <div>
                {workerUpdateStatus === 'downloaded' ? (
                  <>
                    <span className="text-sm font-medium text-green-800">업데이트 다운로드 완료</span>
                    <p className="text-xs text-green-600 mt-0.5">
                      v{workerVersions.current} → v{workerVersions.latest} · 워커 앱을 재시작하면 최신 버전이 적용됩니다.
                    </p>
                  </>
                ) : workerUpdateStatus === 'downloading' ? (
                  <>
                    <span className="text-sm font-medium text-amber-800">업데이트 다운로드 중...</span>
                    <p className="text-xs text-amber-600 mt-0.5">
                      v{workerVersions.current} → v{workerVersions.latest}
                    </p>
                  </>
                ) : (
                  <>
                    <span className="text-sm font-medium text-amber-800">워커 업데이트가 있습니다</span>
                    <p className="text-xs text-amber-600 mt-0.5">
                      v{workerVersions.current} → v{workerVersions.latest}
                    </p>
                  </>
                )}
              </div>
            </div>
            {workerUpdateStatus !== 'downloaded' && workerUpdateStatus !== 'downloading' && (
              <button
                onClick={handleWorkerUpdate}
                disabled={workerUpdating}
                className="inline-flex items-center px-3 py-1.5 bg-amber-600 hover:bg-amber-700 disabled:bg-amber-400 text-white text-xs font-medium rounded-lg transition-colors whitespace-nowrap ml-4"
              >
                <ArrowUpCircle className="w-3.5 h-3.5 mr-1.5" />
                {workerUpdating ? '요청 중...' : '업데이트'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* 보고서 미작성 알림 */}
      {!dataLoading && !todaySummary.hasReport && (
        <div className="bg-at-warning-bg border-b border-at-border px-4 sm:px-6 py-2.5">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-at-warning flex-shrink-0" />
            <span className="text-sm text-at-text tracking-[0.08px]">오늘의 일일보고서가 아직 작성되지 않았습니다.</span>
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
              <h3 className="text-sm font-semibold text-at-text mb-3 tracking-[0.08px]">오늘의 현황</h3>
              <div className="grid grid-cols-3 gap-2 sm:gap-3">
                <button
                  onClick={() => togglePanel(todayActivePanel, 'consult', setTodayActivePanel)}
                  className={`rounded-2xl p-3 text-center w-full transition-all border ${todayActivePanel === 'consult' ? 'bg-at-accent-light border-at-accent ring-1 ring-at-accent shadow-at-card' : 'bg-at-surface-alt border-at-border hover:bg-at-surface-hover'}`}
                >
                  <TrendingUp className="w-5 h-5 text-at-success mx-auto mb-1" />
                  <p className="text-lg sm:text-xl font-bold text-at-success tracking-[0.1px]">{todaySummary.consultProceed}<span className="text-at-text-weak font-normal">/</span><span className="text-at-text">{todaySummary.consultCount}</span></p>
                  <p className="text-xs text-at-text-secondary tracking-[0.07px]">성공/상담</p>
                  <p className="text-[10px] text-at-text-weak mt-0.5">{todayActivePanel === 'consult' ? '▲ 닫기' : '▼ 목록 보기'}</p>
                </button>
                <button
                  onClick={() => togglePanel(todayActivePanel, 'recall', setTodayActivePanel)}
                  className={`rounded-2xl p-3 text-center w-full transition-all border ${todayActivePanel === 'recall' ? 'bg-at-accent-light border-at-accent ring-1 ring-at-accent shadow-at-card' : 'bg-at-surface-alt border-at-border hover:bg-at-surface-hover'}`}
                >
                  <Calendar className="w-5 h-5 text-at-warning mx-auto mb-1" />
                  <p className="text-lg sm:text-xl font-bold text-at-warning tracking-[0.1px]">{todaySummary.recallBookingCount}<span className="text-at-text-weak font-normal">/</span><span className="text-at-text">{todaySummary.recallCount}</span></p>
                  <p className="text-xs text-at-text-secondary tracking-[0.07px]">예약/리콜</p>
                  <p className="text-[10px] text-at-text-weak mt-0.5">{todayActivePanel === 'recall' ? '▲ 닫기' : '▼ 현황 보기'}</p>
                </button>
                <button
                  onClick={() => togglePanel(todayActivePanel, 'gift', setTodayActivePanel)}
                  className={`rounded-2xl p-3 text-center w-full transition-all border ${todayActivePanel === 'gift' ? 'bg-at-accent-light border-at-accent ring-1 ring-at-accent shadow-at-card' : 'bg-at-surface-alt border-at-border hover:bg-at-surface-hover'}`}
                >
                  <BarChart3 className="w-5 h-5 text-at-purple mx-auto mb-1" />
                  <p className="text-lg sm:text-xl font-bold text-at-purple tracking-[0.1px]">{todaySummary.naverReviewCount}<span className="text-at-text-weak font-normal">/</span><span className="text-at-text">{todaySummary.giftCount}</span></p>
                  <p className="text-xs text-at-text-secondary tracking-[0.07px]">리뷰/선물</p>
                  <p className="text-[10px] text-at-text-weak mt-0.5">{todayActivePanel === 'gift' ? '▲ 닫기' : '▼ 목록 보기'}</p>
                </button>
              </div>

              {/* 상담 확장 패널 */}
              {todayActivePanel === 'consult' && (
                <div className="mt-2 bg-white border border-at-border rounded-2xl overflow-hidden shadow-at-soft">
                  <div className="bg-at-surface-alt px-4 py-2 flex justify-between items-center border-b border-at-border">
                    <span className="text-xs font-semibold text-at-text tracking-[0.07px]">📋 오늘 상담 목록</span>
                    <span className="text-xs text-at-text-weak">총 {todayConsults.length}건</span>
                  </div>
                  {todayConsults.length === 0 ? (
                    <p className="text-sm text-at-text-weak text-center py-4">데이터가 없습니다</p>
                  ) : (
                    <div className="divide-y divide-at-border/50 max-h-[300px] overflow-y-auto">
                      {todayConsults.map((c, i) => (
                        <div key={c.id ?? i} className="flex items-center gap-2 px-4 py-2 text-sm">
                          <span className="font-medium text-at-text w-16 truncate tracking-[0.08px]">{c.patient_name}</span>
                          <span className="text-at-text-secondary flex-1 truncate tracking-[0.07px]">{c.consult_content}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.consult_status === 'O' ? 'bg-at-success-bg text-at-success' : 'bg-at-error-bg text-at-error'}`}>
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
                  <div className="mt-2 bg-white border border-at-border rounded-2xl overflow-hidden shadow-at-soft">
                    <div className="bg-at-surface-alt px-4 py-2 flex justify-between items-center border-b border-at-border">
                      <span className="text-xs font-semibold text-at-text tracking-[0.07px]">📞 오늘 리콜 현황</span>
                      <span className="text-xs text-at-text-weak">예약 {bookedNames.length} / 리콜 {todayReport?.recall_count || 0}건</span>
                    </div>
                    {(todayReport?.recall_count || 0) === 0 ? (
                      <p className="text-sm text-at-text-weak text-center py-4">데이터가 없습니다</p>
                    ) : (
                      <div className="px-4 py-3 space-y-2 max-h-[300px] overflow-y-auto">
                        {bookedNames.length > 0 && (
                          <div className="flex items-start gap-2">
                            <span className="text-xs text-at-text-secondary w-14 pt-0.5">예약완료</span>
                            <div className="flex flex-wrap gap-1.5 flex-1">
                              {bookedNames.map((name, i) => (
                                <span key={i} className="text-xs bg-at-success-bg text-at-success px-2 py-0.5 rounded-full">{name}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {unbookedCount > 0 && (
                          <div className="flex items-center gap-2">
                            <span className="text-xs text-at-text-secondary w-14">미예약</span>
                            <span className="text-xs bg-at-error-bg text-at-error px-2 py-0.5 rounded-full">{unbookedCount}명</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )
              })()}

              {/* 선물 확장 패널 */}
              {todayActivePanel === 'gift' && (
                <div className="mt-2 bg-white border border-at-border rounded-2xl overflow-hidden shadow-at-soft">
                  <div className="bg-at-surface-alt px-4 py-2 flex justify-between items-center border-b border-at-border">
                    <span className="text-xs font-semibold text-at-text tracking-[0.07px]">🎁 오늘 선물/리뷰 목록</span>
                    <span className="text-xs text-at-text-weak">총 {todayGifts.length}건</span>
                  </div>
                  {todayGifts.length === 0 ? (
                    <p className="text-sm text-at-text-weak text-center py-4">데이터가 없습니다</p>
                  ) : (
                    <div className="divide-y divide-at-border/50 max-h-[300px] overflow-y-auto">
                      {todayGifts.map((g, i) => (
                        <div key={g.id ?? i} className="flex items-center gap-2 px-4 py-2 text-sm">
                          <span className="font-medium text-at-text w-16 truncate tracking-[0.08px]">{g.patient_name}</span>
                          <span className="text-at-text-secondary flex-1 truncate tracking-[0.07px]">{g.gift_type} × {g.quantity}</span>
                          {g.naver_review === 'O' ? (
                            <span className="text-xs bg-at-warning-bg text-at-warning px-2 py-0.5 rounded-full font-medium">리뷰 ✓</span>
                          ) : (
                            <span className="text-xs text-at-text-weak">리뷰 없음</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* 팀 출퇴근 현황 */}
            <div>
              <h3 className="text-sm font-semibold text-at-text mb-3 tracking-[0.08px]">팀 출퇴근 현황</h3>
              {attendanceLoading ? (
                <div className="flex justify-center py-6">
                  <div className="w-6 h-6 border-4 border-at-accent border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : teamStatus ? (
                <div className="bg-at-surface-alt rounded-2xl p-4 border border-at-border">
                  <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
                    <button onClick={() => togglePanel(attendanceActivePanel, 'checkin', setAttendanceActivePanel)}
                      className={`rounded-xl p-2 text-center transition-all ${attendanceActivePanel === 'checkin' ? 'bg-at-accent-light ring-1 ring-at-accent' : 'hover:bg-at-surface-hover'}`}>
                      <p className="text-lg font-bold text-at-success">{teamStatus.checked_in}<span className="text-at-text-weak font-normal">/</span><span className="text-at-text">{teamStatus.total_employees}</span></p>
                      <p className="text-xs text-at-success tracking-[0.07px]">출근/전체</p>
                    </button>
                    <button onClick={() => togglePanel(attendanceActivePanel, 'checkout', setAttendanceActivePanel)}
                      className={`rounded-xl p-2 text-center transition-all ${attendanceActivePanel === 'checkout' ? 'bg-at-accent-light ring-1 ring-at-accent' : 'hover:bg-at-surface-hover'}`}>
                      <p className="text-lg font-bold text-at-accent">{teamStatus.checked_out || 0}</p>
                      <p className="text-xs text-at-accent tracking-[0.07px]">퇴근</p>
                    </button>
                    <button onClick={() => togglePanel(attendanceActivePanel, 'absent', setAttendanceActivePanel)}
                      className={`rounded-xl p-2 text-center transition-all ${attendanceActivePanel === 'absent' ? 'bg-at-accent-light ring-1 ring-at-accent' : 'hover:bg-at-surface-hover'}`}>
                      <p className="text-lg font-bold text-at-warning">{teamStatus.not_checked_in}</p>
                      <p className="text-xs text-at-warning tracking-[0.07px]">결근</p>
                    </button>
                    <button onClick={() => togglePanel(attendanceActivePanel, 'late', setAttendanceActivePanel)}
                      className={`hidden sm:block rounded-xl p-2 text-center transition-all ${attendanceActivePanel === 'late' ? 'bg-at-accent-light ring-1 ring-at-accent' : 'hover:bg-at-surface-hover'}`}>
                      <p className="text-lg font-bold text-at-warning">{teamStatus.late_count}</p>
                      <p className="text-xs text-at-warning tracking-[0.07px]">지각</p>
                    </button>
                    <button onClick={() => togglePanel(attendanceActivePanel, 'early', setAttendanceActivePanel)}
                      className={`hidden sm:block rounded-xl p-2 text-center transition-all ${attendanceActivePanel === 'early' ? 'bg-at-accent-light ring-1 ring-at-accent' : 'hover:bg-at-surface-hover'}`}>
                      <p className="text-lg font-bold text-at-error">{teamStatus.early_leave_count || 0}</p>
                      <p className="text-xs text-at-error tracking-[0.07px]">조퇴</p>
                    </button>
                    <button onClick={() => togglePanel(attendanceActivePanel, 'overtime', setAttendanceActivePanel)}
                      className={`hidden sm:block rounded-xl p-2 text-center transition-all ${attendanceActivePanel === 'overtime' ? 'bg-at-accent-light ring-1 ring-at-accent' : 'hover:bg-at-surface-hover'}`}>
                      <p className="text-lg font-bold text-at-purple">{teamStatus.overtime_count || 0}</p>
                      <p className="text-xs text-at-purple tracking-[0.07px]">초과</p>
                    </button>
                  </div>
                  {teamStatus.total_employees > 0 && (
                    <div className="mt-3 pt-3 border-t border-at-border">
                      <div className="flex items-center justify-between text-xs text-at-text mb-1.5 tracking-[0.07px]">
                        <span>출근률</span>
                        <span className="font-medium">{attendanceRate}%</span>
                      </div>
                      <div className="w-full bg-at-border rounded-full h-1.5">
                        <div
                          className="bg-at-accent h-1.5 rounded-full transition-all"
                          style={{ width: `${attendanceRate}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* 출퇴근 확장 패널 — teamStatus ? 블록 안 */}
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
                      checkin: '🟢 출근 직원', checkout: '🔵 퇴근 직원', absent: '🔴 결근 직원',
                      late: '🟡 지각 직원', early: '🟠 조퇴 직원', overtime: '🟣 초과근무 직원',
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
                      <div className="mt-3 bg-white border border-at-border rounded-2xl overflow-hidden shadow-at-soft">
                        <div className="bg-at-surface-alt px-4 py-2 flex justify-between items-center border-b border-at-border">
                          <span className="text-xs font-semibold text-at-text tracking-[0.07px]">{labelMap[attendanceActivePanel]}</span>
                          <span className="text-xs text-at-text-weak">{filtered.length}명</span>
                        </div>
                        {filtered.length === 0 ? (
                          <p className="text-sm text-at-text-weak text-center py-4">데이터가 없습니다</p>
                        ) : (
                          <div className="divide-y divide-at-border/50 max-h-[300px] overflow-y-auto">
                            {filtered.map(emp => (
                              <div key={emp.user_id} className="flex items-center gap-2 px-4 py-2 text-sm">
                                <span className="font-medium text-at-text w-16 truncate tracking-[0.08px]">{emp.user_name}</span>
                                <span className="text-at-text-secondary flex-1 text-xs tracking-[0.07px]">
                                  {emp.check_in_time ? `${formatTime(emp.check_in_time)} 출근` : ''}
                                  {emp.check_out_time ? ` → ${formatTime(emp.check_out_time)} 퇴근` : ''}
                                </span>
                                <span className="text-xs px-2 py-0.5 rounded-full bg-at-surface-hover text-at-text-secondary tracking-[0.07px]">{statusTag(emp)}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )
                  })()}
                </div>
              ) : (
                <div className="text-center py-6 text-at-text-secondary bg-at-surface-alt rounded-2xl border border-at-border">
                  <p className="text-sm tracking-[0.08px]">출퇴근 현황을 불러올 수 없습니다.</p>
                </div>
              )}
            </div>

            {/* 주간 통계 */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-at-text tracking-[0.08px]">주간 통계</h3>
                <span className="text-xs text-at-text-weak tracking-[0.07px]">
                  {weeklySummary.weekStart.replace(/-/g, '.')} ~ {today.replace(/-/g, '.')}
                </span>
              </div>
              <div className="bg-at-surface-alt rounded-2xl p-4 border border-at-border">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <button
                    onClick={() => togglePanel(weeklyActivePanel, 'consult', setWeeklyActivePanel)}
                    className={`rounded-xl p-2 transition-all text-left ${weeklyActivePanel === 'consult' ? 'bg-at-accent-light ring-1 ring-at-accent' : 'hover:bg-at-surface-hover'}`}
                  >
                    <p className="text-lg sm:text-xl font-bold text-at-success text-center tracking-[0.1px]">{weeklySummary.consultSuccess}<span className="text-at-text-weak font-normal">/</span><span className="text-at-text">{weeklySummary.consultTotal}</span></p>
                    <p className="text-xs text-at-text-secondary text-center tracking-[0.07px]">성공/상담 ({weeklySummary.successRate}%)</p>
                  </button>
                  <button
                    onClick={() => togglePanel(weeklyActivePanel, 'recall', setWeeklyActivePanel)}
                    className={`rounded-xl p-2 transition-all text-left ${weeklyActivePanel === 'recall' ? 'bg-at-accent-light ring-1 ring-at-accent' : 'hover:bg-at-surface-hover'}`}
                  >
                    <p className="text-lg sm:text-xl font-bold text-at-warning text-center tracking-[0.1px]">{weeklySummary.recallBookingTotal}<span className="text-at-text-weak font-normal">/</span><span className="text-at-text">{weeklySummary.recallTotal}</span></p>
                    <p className="text-xs text-at-text-secondary text-center tracking-[0.07px]">예약/리콜</p>
                  </button>
                  <button
                    onClick={() => togglePanel(weeklyActivePanel, 'gift', setWeeklyActivePanel)}
                    className={`rounded-xl p-2 transition-all text-left ${weeklyActivePanel === 'gift' ? 'bg-at-accent-light ring-1 ring-at-accent' : 'hover:bg-at-surface-hover'}`}
                  >
                    <p className="text-lg sm:text-xl font-bold text-at-purple text-center tracking-[0.1px]">{weeklySummary.giftTotal}<span className="text-at-text-weak font-normal">/</span><span className="text-at-text">{weeklySummary.reviewTotal}</span></p>
                    <p className="text-xs text-at-text-secondary text-center tracking-[0.07px]">선물/리뷰</p>
                  </button>
                </div>
                {weeklyActivePanel && (
                  <div className="mt-3 border-t border-at-border pt-3 max-h-[300px] overflow-y-auto animate-slideDown">
                    {weeklySummary.dailyBreakdown.length === 0 ? (
                      <p className="text-sm text-at-text-weak text-center py-4">데이터가 없습니다</p>
                    ) : (
                      <div className="space-y-1">
                        {weeklySummary.dailyBreakdown.map(day => {
                          const numerator = weeklyActivePanel === 'consult' ? day.consultSuccess : weeklyActivePanel === 'recall' ? day.recallBookingCount : day.giftCount
                          const denominator = weeklyActivePanel === 'consult' ? day.consultCount : weeklyActivePanel === 'recall' ? day.recallCount : day.reviewCount
                          const pct = denominator > 0 ? Math.round((numerator / denominator) * 100) : 0
                          return (
                            <div key={day.date} className={`flex items-center gap-2 px-2 py-1.5 rounded-lg ${day.isToday ? 'bg-at-accent-light' : ''}`}>
                              <span className={`text-xs font-medium w-6 ${day.isToday ? 'text-at-accent' : 'text-at-text-secondary'}`}>{day.dayLabel}</span>
                              <span className={`text-xs w-20 ${day.isToday ? 'text-at-accent' : 'text-at-text-weak'} tracking-[0.07px]`}>{day.date.slice(5).replace('-', '/')}{day.isToday ? ' 진행중' : ''}</span>
                              <span className={`text-xs font-medium w-12 text-right ${day.isToday ? 'text-at-accent-hover' : 'text-at-text'}`}>{numerator}/{denominator}</span>
                              <div className="flex-1 bg-at-border rounded-full h-[5px]">
                                <div className="bg-at-accent h-[5px] rounded-full transition-all" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="text-xs text-at-text-weak w-8 text-right">{pct}%</span>
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
          <div className="lg:w-72 space-y-4">
            {/* 날씨 카드 */}
            <div className="bg-at-surface-alt rounded-2xl p-4 border border-at-border">
              <h3 className="text-sm font-semibold text-at-text mb-3 flex items-center tracking-[0.08px]">
                <Sun className="w-4 h-4 text-at-warning mr-1.5" />
                날씨
              </h3>
              {weatherLoading ? (
                <div className="flex justify-center py-6">
                  <div className="w-6 h-6 border-4 border-at-accent border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : weather ? (
                <div className="space-y-3">
                  {/* 현재 날씨 */}
                  <div className="flex items-center gap-3">
                    {weatherIcons[weather.current.main] || <Cloud className="w-10 h-10 text-at-text-weak" />}
                    <div className="flex-1">
                      <div className="flex items-center gap-1 text-xs text-at-text-secondary mb-0.5 tracking-[0.07px]">
                        <MapPin className="w-3 h-3" />
                        <span>{weather.current.location}</span>
                        <span className="ml-1 px-1.5 py-0.5 bg-at-tag text-at-accent rounded text-[10px] font-medium">현재</span>
                      </div>
                      <p className="text-2xl font-bold text-at-text">{weather.current.temp}°<span className="text-sm font-normal text-at-text-secondary ml-1">{weather.current.description}</span></p>
                      <p className="text-xs text-at-text-weak mt-0.5 tracking-[0.07px]">체감 {weather.current.feels_like}° · 습도 {weather.current.humidity}%</p>
                    </div>
                  </div>

                  {/* 구분선 */}
                  <div className="border-t border-at-border"></div>

                  {/* 내일 날씨 */}
                  <div className="flex items-center gap-3">
                    {weatherIconsSmall[weather.tomorrow.main] || <Cloud className="w-8 h-8 text-at-text-weak opacity-70" />}
                    <div className="flex-1">
                      <div className="flex items-center gap-1 text-xs text-at-text-secondary mb-0.5 tracking-[0.07px]">
                        <Calendar className="w-3 h-3" />
                        <span>내일 ({weather.tomorrow.date})</span>
                      </div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-lg font-bold text-at-text">{weather.tomorrow.tempMax}°</span>
                        <span className="text-sm text-at-text-weak">/ {weather.tomorrow.tempMin}°</span>
                        <span className="text-sm text-at-text-secondary ml-1">{weather.tomorrow.description}</span>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>

            {/* 치의신보 뉴스 카드 (탭 UI) */}
            <div className="bg-at-surface-alt rounded-2xl overflow-hidden border border-at-border">
              {/* 헤더 */}
              <div className="px-4 py-3 border-b border-at-border">
                <h3 className="text-sm font-semibold text-at-text flex items-center tracking-[0.08px]">
                  <Newspaper className="w-4 h-4 text-at-accent mr-1.5" />
                  치의신보
                </h3>
              </div>

              {/* 탭 버튼 */}
              <div className="flex border-b border-at-border">
                <button
                  onClick={() => setActiveNewsTab('popular')}
                  className={`flex-1 px-3 py-2 text-xs font-medium transition-colors flex items-center justify-center gap-1.5 tracking-[0.07px] ${
                    activeNewsTab === 'popular'
                      ? 'text-at-warning border-b-2 border-at-warning bg-white'
                      : 'text-at-text-secondary hover:text-at-text hover:bg-at-surface-hover'
                  }`}
                >
                  <Flame className="w-3.5 h-3.5" />
                  인기 게시물
                </button>
                <button
                  onClick={() => setActiveNewsTab('latest')}
                  className={`flex-1 px-3 py-2 text-xs font-medium transition-colors flex items-center justify-center gap-1.5 tracking-[0.07px] ${
                    activeNewsTab === 'latest'
                      ? 'text-at-accent border-b-2 border-at-accent bg-white'
                      : 'text-at-text-secondary hover:text-at-text hover:bg-at-surface-hover'
                  }`}
                >
                  <Newspaper className="w-3.5 h-3.5" />
                  최신 게시물
                </button>
              </div>

              {/* 기사 목록 */}
              {newsLoading ? (
                <div className="flex justify-center py-6">
                  <div className="w-6 h-6 border-4 border-at-accent border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : (
                <div className="divide-y divide-at-border">
                  {(activeNewsTab === 'popular' ? popularArticles : latestArticles).length > 0 ? (
                    (activeNewsTab === 'popular' ? popularArticles : latestArticles).map((article) => (
                      <a
                        key={article.id}
                        href={article.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-start gap-2 px-4 py-2.5 hover:bg-at-surface-hover transition-colors group"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-at-text line-clamp-2 group-hover:text-at-accent tracking-[0.08px]">{article.title}</p>
                        </div>
                        <ExternalLink className="w-3.5 h-3.5 text-at-text-weak group-hover:text-at-accent flex-shrink-0 mt-0.5" />
                      </a>
                    ))
                  ) : (
                    <div className="text-center py-6 text-at-text-secondary">
                      <p className="text-sm tracking-[0.08px]">
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
    </div>
  )
}
