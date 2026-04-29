/**
 * 공지사항 본문에서 날짜/기간을 추출하는 순수 유틸.
 * - start_date/end_date가 비어 있는 공지에 한해 호출.
 * - 본문의 "첫 매치"만 반환 (다중 날짜 언급 시 가장 앞 매치를 일정 시작으로 간주).
 * - 연도 생략 시 currentYear 기본; 추출 결과가 currentDate 기준 6개월 이전이면 다음 해로 보정.
 */

export interface ParsedRange {
  startDate: string
  endDate: string
}

const RE_FULL_DATE = /(\d{4})[-./년]\s?(\d{1,2})[-./월]\s?(\d{1,2})\s?일?/
const RE_SHORT_DATE = /(\d{1,2})\s?월\s?(\d{1,2})\s?일/
const RE_RANGE_SEPARATOR = /^\s*[~\-–]\s*/

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

function buildIso(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  const d = new Date(`${year}-${pad2(month)}-${pad2(day)}T00:00:00`)
  if (
    d.getFullYear() !== year ||
    d.getMonth() !== month - 1 ||
    d.getDate() !== day
  ) {
    return null
  }
  return `${year}-${pad2(month)}-${pad2(day)}`
}

interface RawDate {
  year?: number
  month: number
  day: number
}

interface MatchResult {
  raw: RawDate
  matchStartAbs: number
  matchEndAbs: number
}

function matchSingleAt(text: string, fromIndex: number): MatchResult | null {
  const slice = text.slice(fromIndex)
  const fullMatch = slice.match(RE_FULL_DATE)
  const shortMatch = slice.match(RE_SHORT_DATE)

  const candidates: Array<{ idx: number; len: number; raw: RawDate }> = []
  if (fullMatch && fullMatch.index !== undefined) {
    candidates.push({
      idx: fullMatch.index,
      len: fullMatch[0].length,
      raw: {
        year: parseInt(fullMatch[1], 10),
        month: parseInt(fullMatch[2], 10),
        day: parseInt(fullMatch[3], 10),
      },
    })
  }
  if (shortMatch && shortMatch.index !== undefined) {
    candidates.push({
      idx: shortMatch.index,
      len: shortMatch[0].length,
      raw: {
        month: parseInt(shortMatch[1], 10),
        day: parseInt(shortMatch[2], 10),
      },
    })
  }
  if (candidates.length === 0) return null
  candidates.sort((a, b) => a.idx - b.idx)
  const chosen = candidates[0]
  return {
    raw: chosen.raw,
    matchStartAbs: fromIndex + chosen.idx,
    matchEndAbs: fromIndex + chosen.idx + chosen.len,
  }
}

function resolveYear(raw: RawDate, today: Date): number {
  if (raw.year !== undefined) return raw.year
  const currentYear = today.getFullYear()
  const candidate = buildIso(currentYear, raw.month, raw.day)
  if (!candidate) return currentYear
  const candidateDate = new Date(`${candidate}T00:00:00`)
  const sixMonthsAgo = new Date(today)
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  if (candidateDate < sixMonthsAgo) return currentYear + 1
  return currentYear
}

/**
 * content에서 첫 매치를 추출한다.
 * 기간 표현(`A ~ B`)이면 startDate, endDate 모두 반환.
 * 단일이면 startDate === endDate.
 * 추출 실패 시 null.
 */
export function extractDateRangeFromContent(content: string, today: Date = new Date()): ParsedRange | null {
  if (!content) return null
  const text = content.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ')

  const first = matchSingleAt(text, 0)
  if (!first) return null

  const startYear = resolveYear(first.raw, today)
  const startIso = buildIso(startYear, first.raw.month, first.raw.day)
  if (!startIso) return null

  const remainder = text.slice(first.matchEndAbs)
  const sepMatch = remainder.match(RE_RANGE_SEPARATOR)
  if (sepMatch) {
    const afterSep = first.matchEndAbs + sepMatch[0].length
    const second = matchSingleAt(text, afterSep)
    if (second && second.matchStartAbs === afterSep) {
      const endYear = second.raw.year ?? startYear
      const endIso = buildIso(endYear, second.raw.month, second.raw.day)
      if (endIso && endIso >= startIso) {
        return { startDate: startIso, endDate: endIso }
      }
    }
  }

  return { startDate: startIso, endDate: startIso }
}
