'use client'

import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { useSupabaseData } from '@/hooks/useSupabaseData'
import { attendanceService } from '@/lib/attendanceService'
import type { TeamAttendanceStatus } from '@/types/attendance'
import {
  Home,
  FileText,
  Users,
  Clock,
  Sun,
  Cloud,
  CloudRain,
  CloudSnow,
  Wind,
  Newspaper,
  TrendingUp,
  Gift,
  Calendar,
  AlertCircle,
  RefreshCw,
  MapPin,
  Thermometer,
  Droplets,
  ExternalLink
} from 'lucide-react'

// 날씨 아이콘 매핑
const weatherIcons: Record<string, React.ReactNode> = {
  'Clear': <Sun className="w-8 h-8 text-yellow-500" />,
  'Clouds': <Cloud className="w-8 h-8 text-gray-500" />,
  'Rain': <CloudRain className="w-8 h-8 text-blue-500" />,
  'Snow': <CloudSnow className="w-8 h-8 text-blue-200" />,
  'Drizzle': <CloudRain className="w-8 h-8 text-blue-400" />,
  'Thunderstorm': <CloudRain className="w-8 h-8 text-purple-500" />,
  'Mist': <Wind className="w-8 h-8 text-gray-400" />,
  'Fog': <Wind className="w-8 h-8 text-gray-400" />,
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
  const [weatherError, setWeatherError] = useState<string | null>(null)

  // 뉴스 데이터
  const [news, setNews] = useState<NewsItem[]>([])
  const [newsLoading, setNewsLoading] = useState(false)

  // 오늘 보고서 요약 계산
  const todaySummary = useMemo(() => {
    const todayReport = dailyReports.find(r => r.date === today)
    const todayConsults = consultLogs.filter(c => c.date === today)
    const todayGifts = giftLogs.filter(g => g.date === today)

    // 상담 상태 계산 (consultLogs에서 consult_status가 'O' = 진행, 'X' = 보류)
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

  // 날씨 로드 (위치 기반)
  useEffect(() => {
    loadWeather()
  }, [])

  const loadWeather = async () => {
    setWeatherLoading(true)
    setWeatherError(null)

    try {
      // 사용자 위치 가져오기
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          async (position) => {
            const { latitude, longitude } = position.coords
            await fetchWeather(latitude, longitude)
          },
          async () => {
            // 위치 권한 거부 시 서울 기본값 사용
            await fetchWeather(37.5665, 126.9780)
          }
        )
      } else {
        // Geolocation 미지원 시 서울 기본값
        await fetchWeather(37.5665, 126.9780)
      }
    } catch (error) {
      console.error('[DashboardHome] Weather error:', error)
      setWeatherError('날씨 정보를 불러올 수 없습니다.')
      setWeatherLoading(false)
    }
  }

  const fetchWeather = async (lat: number, lon: number) => {
    try {
      // OpenWeatherMap 무료 API 사용 (키 없이는 작동 안함, 데모 데이터 표시)
      // 실제 서비스에서는 .env에 API 키 설정 필요
      const API_KEY = process.env.NEXT_PUBLIC_OPENWEATHER_API_KEY

      if (!API_KEY) {
        // API 키가 없으면 데모 데이터 표시
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
    } catch (error) {
      console.error('[DashboardHome] Fetch weather error:', error)
      // 에러 시 기본 데이터
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

  // 치과 뉴스 로드
  useEffect(() => {
    loadNews()
  }, [])

  const loadNews = async () => {
    setNewsLoading(true)
    try {
      // 실제 서비스에서는 백엔드 API를 통해 뉴스를 가져오거나
      // RSS 피드를 파싱하는 API 엔드포인트를 사용
      // 여기서는 데모 데이터 사용
      const demoNews: NewsItem[] = [
        {
          title: '2024년 치과 건강보험 수가 인상 확정',
          link: '#',
          source: '대한치과의사협회',
          date: '2024-12-12'
        },
        {
          title: '디지털 치과 진료 시스템 도입 가속화',
          link: '#',
          source: '치의신보',
          date: '2024-12-11'
        },
        {
          title: '치과 감염관리 가이드라인 개정안 발표',
          link: '#',
          source: '보건복지부',
          date: '2024-12-10'
        },
        {
          title: '치과위생사 인력난 해소를 위한 정책 논의',
          link: '#',
          source: '대한치과위생사협회',
          date: '2024-12-09'
        },
        {
          title: '스마트 덴탈 케어: AI 기반 구강 건강 관리',
          link: '#',
          source: '헬스케어 뉴스',
          date: '2024-12-08'
        }
      ]

      setNews(demoNews)
    } catch (error) {
      console.error('[DashboardHome] News error:', error)
    } finally {
      setNewsLoading(false)
    }
  }

  // 현재 시간 포맷
  const formatDate = (date: Date) => {
    return date.toLocaleDateString('ko-KR', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      weekday: 'long'
    })
  }

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString('ko-KR', {
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  const [currentTime, setCurrentTime] = useState(new Date())

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="space-y-6">
      {/* 헤더 */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-2xl p-6 text-white shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Home className="w-6 h-6" />
              <h1 className="text-2xl font-bold">대시보드</h1>
            </div>
            <p className="text-blue-100">
              {formatDate(currentTime)} {formatTime(currentTime)}
            </p>
            {user && (
              <p className="text-blue-200 text-sm mt-1">
                안녕하세요, <span className="font-semibold text-white">{user.name}</span>님
              </p>
            )}
          </div>
          <button
            onClick={() => {
              loadTeamStatus()
              loadWeather()
              loadNews()
            }}
            className="flex items-center gap-2 px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg transition-colors"
          >
            <RefreshCw className="w-4 h-4" />
            새로고침
          </button>
        </div>
      </div>

      {/* 메인 그리드 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* 왼쪽 컬럼: 일일보고서 요약 + 출퇴근 현황 */}
        <div className="lg:col-span-2 space-y-6">
          {/* 일일보고서 요약 */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                  <FileText className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">오늘의 업무 현황</h2>
                  <p className="text-emerald-100 text-sm">Daily Report Summary</p>
                </div>
              </div>
            </div>

            <div className="p-6">
              {dataLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500"></div>
                </div>
              ) : (
                <>
                  {!todaySummary.hasReport && (
                    <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2 text-amber-700">
                      <AlertCircle className="w-5 h-5 flex-shrink-0" />
                      <span className="text-sm">오늘의 일일보고서가 아직 작성되지 않았습니다.</span>
                    </div>
                  )}

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                    <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Users className="w-4 h-4 text-blue-600" />
                        <span className="text-sm text-blue-600 font-medium">상담</span>
                      </div>
                      <p className="text-2xl font-bold text-blue-700">{todaySummary.consultCount}건</p>
                      <div className="mt-2 text-xs text-blue-600">
                        <span className="inline-block px-2 py-0.5 bg-blue-200 rounded mr-1">진행 {todaySummary.consultProceed}</span>
                        <span className="inline-block px-2 py-0.5 bg-blue-200 rounded">보류 {todaySummary.consultHold}</span>
                      </div>
                    </div>

                    <div className="bg-gradient-to-br from-green-50 to-green-100 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <TrendingUp className="w-4 h-4 text-green-600" />
                        <span className="text-sm text-green-600 font-medium">네이버 리뷰</span>
                      </div>
                      <p className="text-2xl font-bold text-green-700">{todaySummary.naverReviewCount}건</p>
                    </div>

                    <div className="bg-gradient-to-br from-purple-50 to-purple-100 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Gift className="w-4 h-4 text-purple-600" />
                        <span className="text-sm text-purple-600 font-medium">선물 증정</span>
                      </div>
                      <p className="text-2xl font-bold text-purple-700">{todaySummary.giftCount}건</p>
                    </div>

                    <div className="bg-gradient-to-br from-orange-50 to-orange-100 rounded-xl p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Calendar className="w-4 h-4 text-orange-600" />
                        <span className="text-sm text-orange-600 font-medium">리콜</span>
                      </div>
                      <p className="text-2xl font-bold text-orange-700">{todaySummary.recallCount}건</p>
                      <div className="mt-2 text-xs text-orange-600">
                        <span className="inline-block px-2 py-0.5 bg-orange-200 rounded">예약 {todaySummary.recallBookingCount}</span>
                      </div>
                    </div>
                  </div>

                  {todaySummary.recallBookingCount > 0 && (
                    <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700">
                      <TrendingUp className="w-5 h-5" />
                      <span className="text-sm">오늘 리콜 예약 <strong>{todaySummary.recallBookingCount}건</strong> 달성!</span>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          {/* 출퇴근 현황 */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-gradient-to-r from-violet-500 to-purple-500 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                  <Clock className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">팀 출퇴근 현황</h2>
                  <p className="text-violet-100 text-sm">Team Attendance Status</p>
                </div>
              </div>
            </div>

            <div className="p-6">
              {attendanceLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-500"></div>
                </div>
              ) : teamStatus ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
                  <div className="bg-slate-50 rounded-xl p-4 text-center">
                    <p className="text-xs text-slate-500 mb-1">전체</p>
                    <p className="text-2xl font-bold text-slate-700">{teamStatus.total_employees}</p>
                    <p className="text-xs text-slate-400">명</p>
                  </div>

                  <div className="bg-green-50 rounded-xl p-4 text-center">
                    <p className="text-xs text-green-600 mb-1">출근</p>
                    <p className="text-2xl font-bold text-green-700">{teamStatus.checked_in}</p>
                    <p className="text-xs text-green-500">명</p>
                  </div>

                  <div className="bg-blue-50 rounded-xl p-4 text-center">
                    <p className="text-xs text-blue-600 mb-1">퇴근</p>
                    <p className="text-2xl font-bold text-blue-700">{teamStatus.checked_out || 0}</p>
                    <p className="text-xs text-blue-500">명</p>
                  </div>

                  <div className="bg-orange-50 rounded-xl p-4 text-center">
                    <p className="text-xs text-orange-600 mb-1">미출근</p>
                    <p className="text-2xl font-bold text-orange-700">{teamStatus.not_checked_in}</p>
                    <p className="text-xs text-orange-500">명</p>
                  </div>

                  <div className="bg-yellow-50 rounded-xl p-4 text-center">
                    <p className="text-xs text-yellow-600 mb-1">지각</p>
                    <p className="text-2xl font-bold text-yellow-700">{teamStatus.late_count}</p>
                    <p className="text-xs text-yellow-500">명</p>
                  </div>

                  <div className="bg-red-50 rounded-xl p-4 text-center">
                    <p className="text-xs text-red-600 mb-1">조퇴</p>
                    <p className="text-2xl font-bold text-red-700">{teamStatus.early_leave_count || 0}</p>
                    <p className="text-xs text-red-500">명</p>
                  </div>

                  <div className="bg-purple-50 rounded-xl p-4 text-center">
                    <p className="text-xs text-purple-600 mb-1">초과근무</p>
                    <p className="text-2xl font-bold text-purple-700">{teamStatus.overtime_count || 0}</p>
                    <p className="text-xs text-purple-500">명</p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-slate-500">
                  <Users className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                  <p>출퇴근 현황을 불러올 수 없습니다.</p>
                </div>
              )}

              {teamStatus && teamStatus.total_employees > 0 && (
                <div className="mt-4">
                  <div className="flex items-center justify-between text-sm text-slate-600 mb-2">
                    <span>출근률</span>
                    <span className="font-semibold">
                      {((teamStatus.checked_in / teamStatus.total_employees) * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="w-full bg-slate-200 rounded-full h-2">
                    <div
                      className="bg-gradient-to-r from-green-500 to-emerald-500 h-2 rounded-full transition-all"
                      style={{ width: `${(teamStatus.checked_in / teamStatus.total_employees) * 100}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 오른쪽 컬럼: 날씨 + 뉴스 */}
        <div className="space-y-6">
          {/* 날씨 카드 */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-gradient-to-r from-sky-500 to-blue-500 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                  <Sun className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">오늘의 날씨</h2>
                  <p className="text-sky-100 text-sm">Weather Forecast</p>
                </div>
              </div>
            </div>

            <div className="p-6">
              {weatherLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500"></div>
                </div>
              ) : weatherError ? (
                <div className="text-center py-8 text-slate-500">
                  <Cloud className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                  <p>{weatherError}</p>
                </div>
              ) : weather ? (
                <div className="text-center">
                  <div className="flex items-center justify-center gap-2 text-slate-600 mb-4">
                    <MapPin className="w-4 h-4" />
                    <span className="text-sm">{weather.location}</span>
                  </div>

                  <div className="flex items-center justify-center gap-4 mb-4">
                    {weatherIcons[weather.main] || <Cloud className="w-8 h-8 text-gray-500" />}
                    <div className="text-left">
                      <p className="text-4xl font-bold text-slate-800">{weather.temp}°</p>
                      <p className="text-sm text-slate-500">{weather.description}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="bg-slate-50 rounded-lg p-2">
                      <Thermometer className="w-4 h-4 mx-auto text-red-400 mb-1" />
                      <p className="text-xs text-slate-500">체감</p>
                      <p className="text-sm font-semibold text-slate-700">{weather.feels_like}°</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-2">
                      <Droplets className="w-4 h-4 mx-auto text-blue-400 mb-1" />
                      <p className="text-xs text-slate-500">습도</p>
                      <p className="text-sm font-semibold text-slate-700">{weather.humidity}%</p>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-2">
                      <Wind className="w-4 h-4 mx-auto text-slate-400 mb-1" />
                      <p className="text-xs text-slate-500">바람</p>
                      <p className="text-sm font-semibold text-slate-700">{weather.wind_speed}m/s</p>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>

          {/* 치과계 뉴스 */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="bg-gradient-to-r from-rose-500 to-pink-500 px-6 py-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                  <Newspaper className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">치과계 소식</h2>
                  <p className="text-rose-100 text-sm">Dental News</p>
                </div>
              </div>
            </div>

            <div className="p-4">
              {newsLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-rose-500"></div>
                </div>
              ) : news.length > 0 ? (
                <ul className="space-y-3">
                  {news.map((item, index) => (
                    <li key={index}>
                      <a
                        href={item.link}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block p-3 rounded-lg hover:bg-slate-50 transition-colors group"
                      >
                        <div className="flex items-start gap-2">
                          <span className="text-rose-500 font-bold text-sm">{index + 1}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm text-slate-800 font-medium line-clamp-2 group-hover:text-rose-600 transition-colors">
                              {item.title}
                            </p>
                            <div className="flex items-center gap-2 mt-1">
                              <span className="text-xs text-slate-400">{item.source}</span>
                              <span className="text-xs text-slate-300">•</span>
                              <span className="text-xs text-slate-400">{item.date}</span>
                            </div>
                          </div>
                          <ExternalLink className="w-4 h-4 text-slate-300 group-hover:text-rose-500 transition-colors flex-shrink-0" />
                        </div>
                      </a>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="text-center py-8 text-slate-500">
                  <Newspaper className="w-12 h-12 mx-auto mb-2 text-slate-300" />
                  <p>뉴스를 불러올 수 없습니다.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
