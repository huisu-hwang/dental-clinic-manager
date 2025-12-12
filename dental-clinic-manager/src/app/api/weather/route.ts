import { NextResponse } from 'next/server'

interface WeatherResponse {
  location: string
  temp: number
  feels_like: number
  humidity: number
  description: string
  main: string
  icon: string
  wind_speed: number
  sky: string
  precipitation: string
}

// 기상청 격자 좌표 변환 (위도/경도 -> nx, ny)
function convertToGrid(lat: number, lon: number): { nx: number; ny: number } {
  const RE = 6371.00877 // 지구 반경(km)
  const GRID = 5.0 // 격자 간격(km)
  const SLAT1 = 30.0 // 투영 위도1(degree)
  const SLAT2 = 60.0 // 투영 위도2(degree)
  const OLON = 126.0 // 기준점 경도(degree)
  const OLAT = 38.0 // 기준점 위도(degree)
  const XO = 43 // 기준점 X좌표(GRID)
  const YO = 136 // 기준점 Y좌표(GRID)

  const DEGRAD = Math.PI / 180.0

  const re = RE / GRID
  const slat1 = SLAT1 * DEGRAD
  const slat2 = SLAT2 * DEGRAD
  const olon = OLON * DEGRAD
  const olat = OLAT * DEGRAD

  let sn = Math.tan(Math.PI * 0.25 + slat2 * 0.5) / Math.tan(Math.PI * 0.25 + slat1 * 0.5)
  sn = Math.log(Math.cos(slat1) / Math.cos(slat2)) / Math.log(sn)
  let sf = Math.tan(Math.PI * 0.25 + slat1 * 0.5)
  sf = (Math.pow(sf, sn) * Math.cos(slat1)) / sn
  let ro = Math.tan(Math.PI * 0.25 + olat * 0.5)
  ro = (re * sf) / Math.pow(ro, sn)

  let ra = Math.tan(Math.PI * 0.25 + lat * DEGRAD * 0.5)
  ra = (re * sf) / Math.pow(ra, sn)
  let theta = lon * DEGRAD - olon
  if (theta > Math.PI) theta -= 2.0 * Math.PI
  if (theta < -Math.PI) theta += 2.0 * Math.PI
  theta *= sn

  const nx = Math.floor(ra * Math.sin(theta) + XO + 0.5)
  const ny = Math.floor(ro - ra * Math.cos(theta) + YO + 0.5)

  return { nx, ny }
}

// 현재 시간 기준 base_date, base_time 계산 (초단기실황)
function getBaseDateTime(): { baseDate: string; baseTime: string } {
  const now = new Date()
  // 한국 시간으로 변환
  const kstOffset = 9 * 60 * 60 * 1000
  const kstNow = new Date(now.getTime() + kstOffset)

  // 매 정시 40분 이후에 발표 (예: 0640, 0740, ...)
  // 현재 시간이 40분 이전이면 1시간 전 데이터 사용
  let hour = kstNow.getUTCHours()
  const minute = kstNow.getUTCMinutes()

  if (minute < 40) {
    hour = hour - 1
    if (hour < 0) {
      hour = 23
      kstNow.setUTCDate(kstNow.getUTCDate() - 1)
    }
  }

  const year = kstNow.getUTCFullYear()
  const month = String(kstNow.getUTCMonth() + 1).padStart(2, '0')
  const day = String(kstNow.getUTCDate()).padStart(2, '0')

  return {
    baseDate: `${year}${month}${day}`,
    baseTime: `${String(hour).padStart(2, '0')}00`
  }
}

// 하늘 상태 코드 -> 텍스트
function getSkyDescription(sky: string, pty: string): { description: string; main: string } {
  // PTY(강수형태): 0-없음, 1-비, 2-비/눈, 3-눈, 4-소나기, 5-빗방울, 6-빗방울눈날림, 7-눈날림
  if (pty !== '0') {
    switch (pty) {
      case '1':
      case '4':
      case '5':
        return { description: '비', main: 'Rain' }
      case '2':
      case '6':
        return { description: '비/눈', main: 'Rain' }
      case '3':
      case '7':
        return { description: '눈', main: 'Snow' }
      default:
        return { description: '강수', main: 'Rain' }
    }
  }

  // SKY(하늘상태): 1-맑음, 3-구름많음, 4-흐림
  switch (sky) {
    case '1':
      return { description: '맑음', main: 'Clear' }
    case '3':
      return { description: '구름많음', main: 'Clouds' }
    case '4':
      return { description: '흐림', main: 'Clouds' }
    default:
      return { description: '맑음', main: 'Clear' }
  }
}

// 지역명 조회 (격자 좌표 기반 대략적인 지역)
function getLocationName(nx: number, ny: number): string {
  // 주요 도시 격자 좌표 매핑
  const locations: { name: string; nx: number; ny: number }[] = [
    { name: '서울', nx: 60, ny: 127 },
    { name: '인천', nx: 55, ny: 124 },
    { name: '수원', nx: 60, ny: 121 },
    { name: '대전', nx: 67, ny: 100 },
    { name: '대구', nx: 89, ny: 90 },
    { name: '부산', nx: 98, ny: 76 },
    { name: '광주', nx: 58, ny: 74 },
    { name: '울산', nx: 102, ny: 84 },
    { name: '세종', nx: 66, ny: 103 },
    { name: '제주', nx: 52, ny: 38 },
    { name: '춘천', nx: 73, ny: 134 },
    { name: '강릉', nx: 92, ny: 131 },
    { name: '청주', nx: 69, ny: 107 },
    { name: '전주', nx: 63, ny: 89 },
    { name: '포항', nx: 102, ny: 94 },
    { name: '창원', nx: 90, ny: 77 },
  ]

  // 가장 가까운 도시 찾기
  let closest = locations[0]
  let minDist = Math.sqrt(Math.pow(nx - closest.nx, 2) + Math.pow(ny - closest.ny, 2))

  for (const loc of locations) {
    const dist = Math.sqrt(Math.pow(nx - loc.nx, 2) + Math.pow(ny - loc.ny, 2))
    if (dist < minDist) {
      minDist = dist
      closest = loc
    }
  }

  // 거리가 너무 멀면 '현재 위치' 반환
  if (minDist > 20) {
    return '현재 위치'
  }

  return closest.name
}

// 캐시 (10분)
let cachedWeather: { data: WeatherResponse; nx: number; ny: number; timestamp: number } | null = null
const CACHE_DURATION = 10 * 60 * 1000 // 10분

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const lat = parseFloat(searchParams.get('lat') || '37.5665')
    const lon = parseFloat(searchParams.get('lon') || '126.9780')

    // 격자 좌표 변환
    const { nx, ny } = convertToGrid(lat, lon)

    // 캐시 확인 (같은 격자 좌표이고 10분 이내면 캐시 반환)
    const now = Date.now()
    if (cachedWeather &&
        cachedWeather.nx === nx &&
        cachedWeather.ny === ny &&
        (now - cachedWeather.timestamp) < CACHE_DURATION) {
      return NextResponse.json({ weather: cachedWeather.data, cached: true })
    }

    const serviceKey = process.env.KMA_API_KEY

    // API 키가 없으면 폴백 데이터 반환
    if (!serviceKey) {
      console.log('[Weather API] KMA_API_KEY not configured, returning fallback data')
      const fallbackData: WeatherResponse = {
        location: getLocationName(nx, ny),
        temp: 10,
        feels_like: 8,
        humidity: 60,
        description: '맑음',
        main: 'Clear',
        icon: '01d',
        wind_speed: 2.0,
        sky: '1',
        precipitation: '0'
      }
      return NextResponse.json({ weather: fallbackData, cached: false, fallback: true })
    }

    const { baseDate, baseTime } = getBaseDateTime()

    // 초단기실황 API 호출
    const apiUrl = new URL('http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst')
    apiUrl.searchParams.set('serviceKey', serviceKey)
    apiUrl.searchParams.set('numOfRows', '10')
    apiUrl.searchParams.set('pageNo', '1')
    apiUrl.searchParams.set('dataType', 'JSON')
    apiUrl.searchParams.set('base_date', baseDate)
    apiUrl.searchParams.set('base_time', baseTime)
    apiUrl.searchParams.set('nx', String(nx))
    apiUrl.searchParams.set('ny', String(ny))

    console.log(`[Weather API] Fetching from KMA: baseDate=${baseDate}, baseTime=${baseTime}, nx=${nx}, ny=${ny}`)

    const response = await fetch(apiUrl.toString(), {
      headers: {
        'Accept': 'application/json',
      },
      next: { revalidate: 600 } // 10분 캐시
    })

    if (!response.ok) {
      console.error('[Weather API] KMA API response not OK:', response.status)
      throw new Error('KMA API request failed')
    }

    const data = await response.json()

    // 응답 검증
    if (!data.response?.body?.items?.item) {
      console.error('[Weather API] Invalid response structure:', JSON.stringify(data).substring(0, 500))
      throw new Error('Invalid KMA API response')
    }

    const items = data.response.body.items.item

    // 데이터 파싱
    let temp = 10
    let humidity = 60
    let windSpeed = 2.0
    let sky = '1'
    let pty = '0' // 강수형태

    for (const item of items) {
      switch (item.category) {
        case 'T1H': // 기온
          temp = parseFloat(item.obsrValue)
          break
        case 'REH': // 습도
          humidity = parseInt(item.obsrValue)
          break
        case 'WSD': // 풍속
          windSpeed = parseFloat(item.obsrValue)
          break
        case 'PTY': // 강수형태
          pty = item.obsrValue
          break
      }
    }

    // 초단기예보에서 하늘상태 가져오기 (실황에는 없음)
    try {
      const fcstUrl = new URL('http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtFcst')
      fcstUrl.searchParams.set('serviceKey', serviceKey)
      fcstUrl.searchParams.set('numOfRows', '60')
      fcstUrl.searchParams.set('pageNo', '1')
      fcstUrl.searchParams.set('dataType', 'JSON')
      fcstUrl.searchParams.set('base_date', baseDate)
      fcstUrl.searchParams.set('base_time', baseTime)
      fcstUrl.searchParams.set('nx', String(nx))
      fcstUrl.searchParams.set('ny', String(ny))

      const fcstResponse = await fetch(fcstUrl.toString())
      if (fcstResponse.ok) {
        const fcstData = await fcstResponse.json()
        if (fcstData.response?.body?.items?.item) {
          const fcstItems = fcstData.response.body.items.item
          for (const item of fcstItems) {
            if (item.category === 'SKY') {
              sky = item.fcstValue
              break
            }
          }
        }
      }
    } catch (fcstError) {
      console.warn('[Weather API] Failed to fetch forecast for sky condition:', fcstError)
    }

    const { description, main } = getSkyDescription(sky, pty)

    // 체감온도 계산 (간단한 공식)
    // 체감온도 = 13.12 + 0.6215*T - 11.37*V^0.16 + 0.3965*T*V^0.16 (T: 기온, V: 풍속)
    let feelsLike = temp
    if (windSpeed > 0 && temp <= 10) {
      feelsLike = 13.12 + 0.6215 * temp - 11.37 * Math.pow(windSpeed * 3.6, 0.16) + 0.3965 * temp * Math.pow(windSpeed * 3.6, 0.16)
      feelsLike = Math.round(feelsLike)
    }

    const weatherData: WeatherResponse = {
      location: getLocationName(nx, ny),
      temp: Math.round(temp),
      feels_like: feelsLike,
      humidity,
      description,
      main,
      icon: main === 'Clear' ? '01d' : main === 'Rain' ? '09d' : main === 'Snow' ? '13d' : '03d',
      wind_speed: Math.round(windSpeed * 10) / 10,
      sky,
      precipitation: pty
    }

    // 캐시 저장
    cachedWeather = {
      data: weatherData,
      nx,
      ny,
      timestamp: now
    }

    console.log('[Weather API] Weather data:', weatherData)

    return NextResponse.json({ weather: weatherData, cached: false })
  } catch (error) {
    console.error('[Weather API] Error:', error)

    // 에러 시 폴백 데이터 반환
    const fallbackData: WeatherResponse = {
      location: '서울',
      temp: 10,
      feels_like: 8,
      humidity: 60,
      description: '맑음',
      main: 'Clear',
      icon: '01d',
      wind_speed: 2.0,
      sky: '1',
      precipitation: '0'
    }

    return NextResponse.json({
      weather: fallbackData,
      cached: false,
      fallback: true,
      error: 'Failed to fetch weather data'
    })
  }
}
