'use client'

import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useSupabaseData } from '@/hooks/useSupabaseData'
import { attendanceService } from '@/lib/attendanceService'
import type { TeamAttendanceStatus } from '@/types/attendance'
import {
  Sun,
  Cloud,
  CloudRain,
  CloudSnow,
  Wind,
  Newspaper,
  RefreshCw,
  MapPin,
  ExternalLink
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

// 날씨 데이터 타입
interface WeatherData {
  location: string
  temp: number
  feels_like: number
  humidity: number
  description: string
  main: string
  icon: string
  wind_speed: number
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
      const API_KEY = process.env.NEXT_PUBLIC_OPENWEATHER_API_KEY
      if (!API_KEY) {
        setWeather({
          location: '서울',
          temp: 8,
          feels_like: 5,
          humidity: 55,
          description: '맑음',
          main: 'Clear',
          icon: '01d',
          wind_speed: 2.5
        })
        setWeatherLoading(false)
        return
      }

      const response = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${API_KEY}&units=metric&lang=kr`
      )
      if (!response.ok) throw new Error('날씨 데이터 로드 실패')
      const data = await response.json()

      setWeather({
        location: data.name || '현재 위치',
        temp: Math.round(data.main.temp),
        feels_like: Math.round(data.main.feels_like),
        humidity: data.main.humidity,
        description: data.weather[0].description,
        main: data.weather[0].main,
        icon: data.weather[0].icon,
        wind_speed: data.wind.speed
      })
    } catch {
      setWeather({
        location: '서울',
        temp: 8,
        feels_like: 5,
        humidity: 55,
        description: '맑음',
        main: 'Clear',
        icon: '01d',
        wind_speed: 2.5
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
      const demoNews: NewsItem[] = [
        { title: '2024년 치과 건강보험 수가 인상 확정', link: '#', source: '대한치과의사협회', date: '2024-12-12' },
        { title: '디지털 치과 진료 시스템 도입 가속화', link: '#', source: '치의신보', date: '2024-12-11' },
        { title: '치과 감염관리 가이드라인 개정안 발표', link: '#', source: '보건복지부', date: '2024-12-10' },
        { title: '치과위생사 인력난 해소를 위한 정책 논의', link: '#', source: '대한치과위생사협회', date: '2024-12-09' },
      ]
      setNews(demoNews)
    } catch {
      // ignore
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
    loadNews()
  }

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">대시보드</h1>
          <p className="text-sm text-gray-500 mt-1">{formatDate(currentTime)}</p>
        </div>
        <button
          onClick={handleRefresh}
          className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          새로고침
        </button>
      </div>

      {/* 상단 요약 카드 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-4">
        {/* 오늘 상담 */}
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs text-gray-500 mb-1">오늘 상담</p>
          <p className="text-2xl font-bold text-gray-900">{todaySummary.consultCount}<span className="text-sm font-normal text-gray-500">건</span></p>
          <div className="mt-2 flex gap-2 text-xs">
            <span className="text-green-600">진행 {todaySummary.consultProceed}</span>
            <span className="text-orange-600">보류 {todaySummary.consultHold}</span>
          </div>
        </div>

        {/* 선물 증정 */}
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs text-gray-500 mb-1">선물 증정</p>
          <p className="text-2xl font-bold text-gray-900">{todaySummary.giftCount}<span className="text-sm font-normal text-gray-500">건</span></p>
        </div>

        {/* 리콜 */}
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs text-gray-500 mb-1">리콜</p>
          <p className="text-2xl font-bold text-gray-900">{todaySummary.recallCount}<span className="text-sm font-normal text-gray-500">건</span></p>
          <p className="mt-2 text-xs text-blue-600">예약 {todaySummary.recallBookingCount}</p>
        </div>

        {/* 네이버 리뷰 */}
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs text-gray-500 mb-1">네이버 리뷰</p>
          <p className="text-2xl font-bold text-gray-900">{todaySummary.naverReviewCount}<span className="text-sm font-normal text-gray-500">건</span></p>
        </div>

        {/* 출근 인원 */}
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs text-gray-500 mb-1">출근 인원</p>
          <p className="text-2xl font-bold text-green-600">{teamStatus?.checked_in || 0}<span className="text-sm font-normal text-gray-500">명</span></p>
          <p className="mt-2 text-xs text-gray-500">전체 {teamStatus?.total_employees || 0}명</p>
        </div>

        {/* 지각 */}
        <div className="bg-white rounded-lg shadow p-4">
          <p className="text-xs text-gray-500 mb-1">지각</p>
          <p className="text-2xl font-bold text-yellow-600">{teamStatus?.late_count || 0}<span className="text-sm font-normal text-gray-500">명</span></p>
        </div>
      </div>

      {/* 메인 컨텐츠 그리드 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 출퇴근 현황 */}
        <div className="lg:col-span-2 bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">팀 출퇴근 현황</h2>
          </div>
          <div className="p-6">
            {attendanceLoading ? (
              <div className="flex justify-center py-8">
                <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
              </div>
            ) : teamStatus ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                  <div className="text-center p-3 bg-gray-50 rounded-lg">
                    <p className="text-xs text-gray-500">전체</p>
                    <p className="text-xl font-bold text-gray-900">{teamStatus.total_employees}</p>
                  </div>
                  <div className="text-center p-3 bg-green-50 rounded-lg">
                    <p className="text-xs text-green-600">출근</p>
                    <p className="text-xl font-bold text-green-600">{teamStatus.checked_in}</p>
                  </div>
                  <div className="text-center p-3 bg-blue-50 rounded-lg">
                    <p className="text-xs text-blue-600">퇴근</p>
                    <p className="text-xl font-bold text-blue-600">{teamStatus.checked_out || 0}</p>
                  </div>
                  <div className="text-center p-3 bg-orange-50 rounded-lg">
                    <p className="text-xs text-orange-600">미출근</p>
                    <p className="text-xl font-bold text-orange-600">{teamStatus.not_checked_in}</p>
                  </div>
                  <div className="text-center p-3 bg-yellow-50 rounded-lg">
                    <p className="text-xs text-yellow-600">지각</p>
                    <p className="text-xl font-bold text-yellow-600">{teamStatus.late_count}</p>
                  </div>
                  <div className="text-center p-3 bg-red-50 rounded-lg">
                    <p className="text-xs text-red-600">조퇴</p>
                    <p className="text-xl font-bold text-red-600">{teamStatus.early_leave_count || 0}</p>
                  </div>
                  <div className="text-center p-3 bg-purple-50 rounded-lg">
                    <p className="text-xs text-purple-600">초과근무</p>
                    <p className="text-xl font-bold text-purple-600">{teamStatus.overtime_count || 0}</p>
                  </div>
                </div>

                {teamStatus.total_employees > 0 && (
                  <div className="mt-6">
                    <div className="flex items-center justify-between text-sm text-gray-600 mb-2">
                      <span>출근률</span>
                      <span className="font-medium">{((teamStatus.checked_in / teamStatus.total_employees) * 100).toFixed(0)}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-green-500 h-2 rounded-full transition-all"
                        style={{ width: `${(teamStatus.checked_in / teamStatus.total_employees) * 100}%` }}
                      />
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <p>출퇴근 현황을 불러올 수 없습니다.</p>
              </div>
            )}
          </div>
        </div>

        {/* 오른쪽 사이드바 */}
        <div className="space-y-6">
          {/* 날씨 */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900">오늘의 날씨</h2>
            </div>
            <div className="p-6">
              {weatherLoading ? (
                <div className="flex justify-center py-4">
                  <div className="w-6 h-6 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : weather ? (
                <div className="flex items-center gap-4">
                  {weatherIcons[weather.main] || <Cloud className="w-10 h-10 text-gray-400" />}
                  <div className="flex-1">
                    <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
                      <MapPin className="w-3 h-3" />
                      <span>{weather.location}</span>
                    </div>
                    <p className="text-3xl font-bold text-gray-900">{weather.temp}°</p>
                    <p className="text-sm text-gray-500">{weather.description}</p>
                  </div>
                  <div className="text-right text-xs text-gray-500">
                    <p>체감 {weather.feels_like}°</p>
                    <p>습도 {weather.humidity}%</p>
                    <p>바람 {weather.wind_speed}m/s</p>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {/* 치과계 뉴스 */}
          <div className="bg-white rounded-lg shadow">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center gap-2">
              <Newspaper className="w-5 h-5 text-gray-400" />
              <h2 className="text-lg font-semibold text-gray-900">치과계 소식</h2>
            </div>
            <div className="divide-y divide-gray-100">
              {newsLoading ? (
                <div className="flex justify-center py-8">
                  <div className="w-6 h-6 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
                </div>
              ) : news.length > 0 ? (
                news.map((item, index) => (
                  <a
                    key={index}
                    href={item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block px-6 py-3 hover:bg-gray-50 transition-colors group"
                  >
                    <div className="flex items-start gap-3">
                      <span className="text-sm font-medium text-gray-400">{index + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800 line-clamp-1 group-hover:text-blue-600">{item.title}</p>
                        <p className="text-xs text-gray-400 mt-0.5">{item.source} · {item.date}</p>
                      </div>
                      <ExternalLink className="w-4 h-4 text-gray-300 group-hover:text-blue-500 flex-shrink-0" />
                    </div>
                  </a>
                ))
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <p>뉴스를 불러올 수 없습니다.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 보고서 미작성 알림 */}
      {!dataLoading && !todaySummary.hasReport && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
              <svg className="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div>
              <p className="font-medium text-amber-800">오늘의 일일보고서가 아직 작성되지 않았습니다.</p>
              <p className="text-sm text-amber-600 mt-0.5">일일보고서 탭에서 오늘의 업무 내용을 기록해주세요.</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
