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
  AlertCircle,
  Flame,
  Sparkles
} from 'lucide-react'
import Link from 'next/link'

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

            {/* 치의신보 뉴스 카드 (탭 UI) */}
            <div className="bg-slate-50 rounded-lg overflow-hidden">
              {/* 헤더 */}
              <div className="px-4 py-3 border-b border-slate-200">
                <h3 className="text-sm font-semibold text-slate-700 flex items-center">
                  <Newspaper className="w-4 h-4 text-blue-500 mr-1.5" />
                  치의신보
                </h3>
              </div>

              {/* 탭 버튼 */}
              <div className="flex border-b border-slate-200">
                <button
                  onClick={() => setActiveNewsTab('popular')}
                  className={`flex-1 px-3 py-2 text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${
                    activeNewsTab === 'popular'
                      ? 'text-orange-600 border-b-2 border-orange-500 bg-white'
                      : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <Flame className="w-3.5 h-3.5" />
                  인기 게시물
                </button>
                <button
                  onClick={() => setActiveNewsTab('latest')}
                  className={`flex-1 px-3 py-2 text-xs font-medium transition-colors flex items-center justify-center gap-1.5 ${
                    activeNewsTab === 'latest'
                      ? 'text-blue-600 border-b-2 border-blue-500 bg-white'
                      : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <Newspaper className="w-3.5 h-3.5" />
                  최신 게시물
                </button>
              </div>

              {/* 기사 목록 */}
              {newsLoading ? (
                <div className="flex justify-center py-6">
                  <div className="w-6 h-6 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : (
                <div className="divide-y divide-slate-200">
                  {(activeNewsTab === 'popular' ? popularArticles : latestArticles).length > 0 ? (
                    (activeNewsTab === 'popular' ? popularArticles : latestArticles).map((article) => (
                      <a
                        key={article.id}
                        href={article.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-start gap-2 px-4 py-2.5 hover:bg-slate-100 transition-colors group"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-slate-700 line-clamp-2 group-hover:text-blue-600">{article.title}</p>
                        </div>
                        <ExternalLink className="w-3.5 h-3.5 text-slate-300 group-hover:text-blue-500 flex-shrink-0 mt-0.5" />
                      </a>
                    ))
                  ) : (
                    <div className="text-center py-6 text-slate-500">
                      <p className="text-sm">
                        {activeNewsTab === 'popular' ? '인기 게시물이 없습니다.' : '최신 게시물이 없습니다.'}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* AI 데이터 분석 바로가기 */}
            <Link href="/dashboard/ai-analysis" className="block">
              <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg p-4 text-white hover:from-indigo-600 hover:to-purple-700 transition-all shadow-lg hover:shadow-xl group">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                      <Sparkles className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-semibold">AI 데이터 분석</h3>
                      <p className="text-xs text-white/80 mt-0.5">자연어로 병원 데이터 분석</p>
                    </div>
                  </div>
                  <ArrowRight className="w-5 h-5 opacity-70 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </div>
  )
}
