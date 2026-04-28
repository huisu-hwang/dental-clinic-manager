'use client';

import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import {
  Loader2,
  Calendar,
  TrendingUp,
  AlertTriangle,
  BarChart3,
  Search,
  HelpCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Legend,
} from 'recharts';
import {
  welchTTest,
  splitByEvent,
  type EventImpactResult,
} from '@/lib/statistics/eventImpact';
import { cn } from '@/lib/utils';

interface EventCandidate {
  // source-prefixed unique id (예: "ann:<uuid>" 또는 "note:<uuid>")
  id: string;
  source: 'announcement' | 'special_note';
  title: string;
  date: string; // YYYY-MM-DD
}

interface DailyDataPoint {
  date: string;
  value: number;
}

type Metric = 'sales' | 'new_patients';

interface Props {
  clinicId: string;
}

// 일일 보고서 특이사항에서 환자 관련 항목을 배제하기 위한 키워드
// 개별 환자 이슈(컴플레인, 노쇼 등)는 마케팅/병원 차원 이벤트가 아니므로 분석 대상에서 제외
const PATIENT_RELATED_KEYWORDS = [
  '환자',
  '컴플레인',
  '클레임',
  '노쇼',
  '예약취소',
  '예약 취소',
  '내원',
  '진료중',
  '대기',
  '컴플',
  'cx',
  'c/x',
];

const isPatientRelated = (text: string): boolean => {
  const lower = text.toLowerCase();
  return PATIENT_RELATED_KEYWORDS.some((kw) => lower.includes(kw.toLowerCase()));
};

export default function EventImpactAnalysis({ clinicId }: Props) {
  const [events, setEvents] = useState<EventCandidate[]>([]);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showGuide, setShowGuide] = useState(false);
  const [metric, setMetric] = useState<Metric>('sales');
  const [windowDays, setWindowDays] = useState(14);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EventImpactResult | null>(null);
  const [chartData, setChartData] = useState<DailyDataPoint[]>([]);
  const [eventDate, setEventDate] = useState<string>('');

  // 공지사항 + 일일 보고서 특이사항을 이벤트 후보로 통합 로드
  useEffect(() => {
    const loadEventCandidates = async () => {
      try {
        setLoadingEvents(true);
        const supabase = createClient();
        if (!supabase) return;

        const [announcementsRes, notesRes] = await Promise.all([
          supabase
            .from('announcements')
            .select('id, title, start_date')
            .eq('clinic_id', clinicId)
            .not('start_date', 'is', null)
            .order('start_date', { ascending: false })
            .limit(200),
          supabase
            .from('special_notes_history')
            .select('id, report_date, content')
            .eq('clinic_id', clinicId)
            .not('report_date', 'is', null)
            .not('content', 'is', null)
            .order('report_date', { ascending: false })
            .limit(1000),
        ]);

        if (announcementsRes.error) {
          setError(`공지 목록 조회 실패: ${announcementsRes.error.message}`);
          return;
        }
        if (notesRes.error) {
          setError(`특이사항 조회 실패: ${notesRes.error.message}`);
          return;
        }

        const annRows = (announcementsRes.data || []) as Array<{
          id: string;
          title: string;
          start_date: string | null;
        }>;
        const announcements: EventCandidate[] = annRows
          .filter((a) => a.start_date)
          .map((a) => ({
            id: `ann:${a.id}`,
            source: 'announcement' as const,
            title: a.title,
            date: (a.start_date as string).slice(0, 10),
          }));

        const noteRows = (notesRes.data || []) as Array<{
          id: string;
          content: string | null;
          report_date: string | null;
        }>;
        // 환자 관련 키워드 필터는 드롭다운 표시 시에만 적용 (검색 시에는 모든 특이사항 검색 가능)
        const notes: EventCandidate[] = noteRows
          .filter((n) => n.content && n.content.trim().length > 0 && n.report_date)
          .map((n) => ({
            id: `note:${n.id}`,
            source: 'special_note' as const,
            title: (n.content as string).trim().replace(/\s+/g, ' ').slice(0, 60),
            date: (n.report_date as string).slice(0, 10),
          }));

        // 날짜 내림차순으로 합치기
        const merged = [...announcements, ...notes].sort((a, b) =>
          a.date < b.date ? 1 : -1
        );

        // (date, title) 기준 중복 제거 - 같은 내용이 여러 보고서에 기록된 경우 1개만 노출
        const seen = new Set<string>();
        const deduped: EventCandidate[] = [];
        for (const ev of merged) {
          const key = `${ev.date}::${ev.title}`;
          if (seen.has(key)) continue;
          seen.add(key);
          deduped.push(ev);
        }

        setEvents(deduped);
      } catch (err) {
        setError(String(err));
      } finally {
        setLoadingEvents(false);
      }
    };
    loadEventCandidates();
  }, [clinicId]);

  // 검색어 적용 - 제목 또는 날짜 부분 일치 (검색 시에는 환자 관련 항목 포함 모든 특이사항 대상)
  const filteredEvents = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return events;
    return events.filter(
      (e) => e.title.toLowerCase().includes(q) || e.date.includes(q)
    );
  }, [events, searchQuery]);

  // 드롭다운 표시용 - 환자 관련 항목은 일일 보고서 특이사항에서 제외
  const dropdownEvents = useMemo(
    () =>
      events.filter((e) =>
        e.source === 'special_note' ? !isPatientRelated(e.title) : true
      ),
    [events]
  );

  const selectedEvent = events.find((e) => e.id === selectedEventId) || null;

  const handleAnalyze = async () => {
    if (!selectedEventId) {
      setError('이벤트를 선택하세요');
      return;
    }

    const event = events.find((e) => e.id === selectedEventId);
    if (!event || !event.date) {
      setError('이벤트의 날짜가 없습니다');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setChartData([]);

    try {
      // 분석 기간 = 이벤트 날짜 ± windowDays
      const eventTs = new Date(event.date).getTime();
      const startDate = new Date(eventTs - windowDays * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);
      const endDate = new Date(eventTs + windowDays * 24 * 60 * 60 * 1000)
        .toISOString()
        .slice(0, 10);

      // API 호출 (쿠키 기반 인증 - same-origin이므로 자동 전송)
      const apiPath =
        metric === 'sales'
          ? '/api/event-impact/sales'
          : '/api/event-impact/new-patients';

      const response = await fetch(
        `${apiPath}?start_date=${startDate}&end_date=${endDate}`,
        { credentials: 'include' }
      );
      const json = await response.json();

      if (!json.success) {
        setError(json.error || '데이터 조회 실패');
        return;
      }

      // 데이터 정규화
      const rawData: Array<{ date: string; value: number }> = json.data.map(
        (d: { date: string; amount?: number; count?: number }) => ({
          date: d.date,
          value: metric === 'sales' ? d.amount || 0 : d.count || 0,
        })
      );

      // 통계 계산
      const { before, after } = splitByEvent(rawData, event.date, windowDays);
      const stats = welchTTest(before, after);

      setEventDate(event.date);
      setChartData(rawData);
      setResult(stats);
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  };

  const formatNumber = (n: number): string => {
    if (metric === 'sales') {
      return new Intl.NumberFormat('ko-KR').format(Math.round(n)) + '원';
    }
    return n.toFixed(1) + '명';
  };

  return (
    <div className="h-full overflow-y-auto p-6 bg-at-bg-base">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* 헤더 */}
        <div className="bg-white rounded-xl border border-at-border p-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-at-accent-light text-at-accent">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-at-text">
                이벤트 효과 분석
              </h2>
              <p className="text-sm text-at-text-weak">
                특정 이벤트(공지)가 매출/신환에 통계적으로 유의미한 영향을 미쳤는지 검증합니다.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowGuide((v) => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border border-at-border text-at-text-weak hover:bg-at-bg-base transition-colors shrink-0"
            >
              <HelpCircle className="w-3.5 h-3.5" />
              통계 해석 가이드
              {showGuide ? (
                <ChevronUp className="w-3.5 h-3.5" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* 통계 해석 가이드 (펼침/접힘) */}
        {showGuide && <StatisticalGuide />}

        {/* 입력 패널 */}
        <div className="bg-white rounded-xl border border-at-border p-6 space-y-4">
          {/* 이벤트 선택 */}
          <div>
            <label className="block text-sm font-medium text-at-text mb-2">
              <Calendar className="inline w-4 h-4 mr-1" />
              이벤트 선택
            </label>

            {/* 검색 입력 */}
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-at-text-weak" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="제목 또는 날짜(YYYY-MM-DD)로 검색..."
                disabled={loadingEvents || loading}
                className="w-full pl-9 pr-3 py-2 border border-at-border rounded-lg text-sm focus:outline-none focus:border-at-accent"
              />
            </div>

            {/* 검색 결과 리스트 (검색어 입력 시) */}
            {searchQuery.trim() ? (
              <div className="border border-at-border rounded-lg max-h-60 overflow-y-auto">
                {filteredEvents.length === 0 ? (
                  <div className="p-3 text-sm text-at-text-weak text-center">
                    검색 결과가 없습니다.
                  </div>
                ) : (
                  filteredEvents.map((e) => (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => setSelectedEventId(e.id)}
                      className={cn(
                        'w-full text-left px-3 py-2 text-sm border-b border-at-border last:border-b-0 hover:bg-at-bg-base transition-colors',
                        selectedEventId === e.id && 'bg-at-accent-light text-at-accent'
                      )}
                    >
                      <span className="text-xs text-at-text-weak mr-2">
                        {e.source === 'announcement' ? '📢' : '📝'} [{e.date}]
                      </span>
                      {e.title}
                    </button>
                  ))
                )}
              </div>
            ) : (
              /* 드롭다운 (검색어 없을 때) - 환자 관련 항목 제외 */
              <select
                value={selectedEventId}
                onChange={(ev) => setSelectedEventId(ev.target.value)}
                disabled={loadingEvents || loading}
                className="w-full px-3 py-2 border border-at-border rounded-lg text-sm focus:outline-none focus:border-at-accent"
              >
                <option value="">-- 이벤트 선택 --</option>
                {dropdownEvents.filter((e) => e.source === 'announcement').length > 0 && (
                  <optgroup label="📢 공지사항">
                    {dropdownEvents
                      .filter((e) => e.source === 'announcement')
                      .map((e) => (
                        <option key={e.id} value={e.id}>
                          [{e.date}] {e.title}
                        </option>
                      ))}
                  </optgroup>
                )}
                {dropdownEvents.filter((e) => e.source === 'special_note').length > 0 && (
                  <optgroup label="📝 일일 보고서 특이사항">
                    {dropdownEvents
                      .filter((e) => e.source === 'special_note')
                      .map((e) => (
                        <option key={e.id} value={e.id}>
                          [{e.date}] {e.title}
                        </option>
                      ))}
                  </optgroup>
                )}
              </select>
            )}

            {/* 선택된 이벤트 표시 */}
            {selectedEvent && (
              <div className="mt-2 px-3 py-2 bg-at-accent-light/50 border border-at-accent rounded-lg text-sm">
                <span className="font-medium text-at-accent">선택됨: </span>
                <span className="text-at-text">
                  [{selectedEvent.date}] {selectedEvent.title}
                </span>
              </div>
            )}

            {!loadingEvents && events.length === 0 && (
              <p className="text-xs text-at-text-weak mt-1">
                이벤트로 사용할 수 있는 공지사항이나 일일 보고서 특이사항이 없습니다.
              </p>
            )}
          </div>

          {/* 메트릭 선택 */}
          <div>
            <label className="block text-sm font-medium text-at-text mb-2">
              분석 지표
            </label>
            <div className="flex gap-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={metric === 'sales'}
                  onChange={() => setMetric('sales')}
                  disabled={loading}
                />
                <span className="text-sm">매출 (DentWeb 일별 진료비)</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  checked={metric === 'new_patients'}
                  onChange={() => setMetric('new_patients')}
                  disabled={loading}
                />
                <span className="text-sm">신환 수</span>
              </label>
            </div>
          </div>

          {/* 윈도우 */}
          <div>
            <label className="block text-sm font-medium text-at-text mb-2">
              비교 기간 (이벤트 전/후 각 N일)
            </label>
            <input
              type="number"
              min={3}
              max={90}
              value={windowDays}
              onChange={(e) =>
                setWindowDays(
                  Math.max(3, Math.min(90, Number(e.target.value) || 14))
                )
              }
              disabled={loading}
              className="w-32 px-3 py-2 border border-at-border rounded-lg text-sm focus:outline-none focus:border-at-accent"
            />
            <span className="text-xs text-at-text-weak ml-2">일 (3~90)</span>
            {windowDays < 7 && (
              <p className="text-xs text-yellow-600 mt-1">
                ⚠️ 7일 미만은 신뢰도가 낮습니다.
              </p>
            )}
          </div>

          {/* 분석 버튼 */}
          <Button
            onClick={handleAnalyze}
            disabled={loading || !selectedEventId}
            className="w-full"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" /> 분석 중...
              </>
            ) : (
              <>
                <TrendingUp className="w-4 h-4 mr-2" /> 분석 실행
              </>
            )}
          </Button>
        </div>

        {/* 에러 */}
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* 결과 */}
        {result && (
          <>
            {/* 요약 카드 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <SummaryCard
                label="이벤트 전 평균"
                value={formatNumber(result.meanBefore)}
                sublabel={`${result.beforeCount}일 데이터`}
              />
              <SummaryCard
                label="이벤트 후 평균"
                value={formatNumber(result.meanAfter)}
                sublabel={`${result.afterCount}일 데이터`}
              />
              <SummaryCard
                label="변화율"
                value={`${result.changeRate >= 0 ? '+' : ''}${result.changeRate.toFixed(1)}%`}
                sublabel={`p-value: ${result.pValue.toFixed(4)}`}
                highlight={result.isSignificant}
              />
            </div>

            {/* 결론 */}
            <div
              className={cn(
                'rounded-xl p-4 border',
                result.isSignificant
                  ? 'bg-green-50 border-green-200 text-green-800'
                  : 'bg-gray-50 border-at-border text-at-text'
              )}
            >
              <div className="font-medium mb-1 flex items-center gap-2">
                {result.isSignificant
                  ? '✓ 통계적으로 유의한 변화'
                  : '— 유의한 변화 없음'}
                <button
                  type="button"
                  onClick={() => setShowGuide(true)}
                  className="text-xs font-normal underline opacity-70 hover:opacity-100"
                >
                  해석 방법
                </button>
              </div>
              <div className="text-sm">{result.conclusion}</div>
              <div className="text-xs mt-2 opacity-80">
                {result.isSignificant
                  ? `p-value(${result.pValue.toFixed(4)}) < 0.05 → 우연히 발생할 확률이 5% 미만이라는 의미입니다.`
                  : `p-value(${result.pValue.toFixed(4)}) ≥ 0.05 → 변화가 있어도 우연일 가능성을 배제하기 어렵습니다.`}
              </div>
              {result.reliability !== 'high' && (
                <div className="flex items-center gap-2 mt-2 text-xs text-yellow-700">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  신뢰도:{' '}
                  {result.reliability === 'low'
                    ? '낮음 (각 기간 7일 미만)'
                    : '중간 (각 기간 7~13일)'}{' '}
                  - 비교 기간을 14일 이상으로 늘리면 신뢰도가 높아집니다.
                </div>
              )}
            </div>

            {/* 차트 */}
            {chartData.length > 0 && (
              <div className="bg-white rounded-xl border border-at-border p-6">
                <h3 className="text-sm font-medium text-at-text mb-4">
                  시계열 추이
                </h3>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart
                    data={chartData}
                    margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip
                      formatter={(value) => formatNumber(Number(value))}
                      labelFormatter={(label) => `날짜: ${label}`}
                    />
                    <Legend />
                    {eventDate && (
                      <ReferenceLine
                        x={eventDate}
                        stroke="#ef4444"
                        strokeDasharray="3 3"
                        label={{
                          value: '이벤트 시작',
                          position: 'top',
                          fontSize: 11,
                        }}
                      />
                    )}
                    <Line
                      type="monotone"
                      dataKey="value"
                      name={metric === 'sales' ? '일별 매출' : '일별 신환 수'}
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={{ r: 3 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* 면책 */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-xs text-yellow-800">
              <div className="font-medium mb-1">⚠️ 해석 주의사항</div>
              <ul className="list-disc list-inside space-y-1">
                <li>
                  통계적 유의성은 인과관계를 보장하지 않습니다 (계절성, 다른 이벤트, 마케팅 등 외부 요인 가능).
                </li>
                <li>비교 기간이 짧을수록 신뢰도가 낮습니다.</li>
                <li>매출 데이터는 DentWeb DB에서 실시간 조회된 값입니다.</li>
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function StatisticalGuide() {
  return (
    <div className="bg-blue-50/50 border border-blue-200 rounded-xl p-6 space-y-5 text-sm">
      <div>
        <h3 className="font-semibold text-blue-900 mb-2 flex items-center gap-2">
          <HelpCircle className="w-4 h-4" />
          어떻게 통계적 유의성을 판단하나요?
        </h3>
        <p className="text-at-text leading-relaxed">
          이벤트 전 N일과 후 N일의 일별 데이터를 모은 뒤,
          두 평균 차이가 단순히 우연(랜덤 변동)인지 진짜 차이인지를{' '}
          <strong>Welch&apos;s t-test</strong>(분산이 다른 두 집단 비교에 적합)로 검증합니다.
          결과로 나오는 <strong>p-value</strong>는 &ldquo;실제 차이가 없는데도 이만큼의 차이가 우연히 발생했을 확률&rdquo;을 의미합니다.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <GuideCard
          title="p-value < 0.05"
          tone="success"
          body={
            <>
              <strong>통계적으로 유의함</strong> 으로 판정합니다.
              우연일 확률이 5% 미만이라는 의미이며, 이벤트가 실제로 영향을 미쳤다고 보기에 합당한 근거가 됩니다.
            </>
          }
        />
        <GuideCard
          title="p-value ≥ 0.05"
          tone="neutral"
          body={
            <>
              <strong>유의한 변화 없음</strong> 으로 판정합니다.
              변화가 있더라도 우연히 발생했을 가능성을 배제하기 어렵습니다.
              데이터가 너무 적거나 변동성이 크면 실제 효과가 있어도 잡히지 않을 수 있습니다.
            </>
          }
        />
      </div>

      <div>
        <h4 className="font-semibold text-blue-900 mb-2">데이터 신뢰도 등급</h4>
        <div className="space-y-1.5 text-at-text">
          <div className="flex items-start gap-2">
            <span className="px-2 py-0.5 text-xs font-medium rounded bg-green-100 text-green-800 shrink-0">높음</span>
            <span>각 기간 14일 이상 - 일별 변동이 평균에 잘 흡수되어 결과의 안정성이 높습니다.</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="px-2 py-0.5 text-xs font-medium rounded bg-yellow-100 text-yellow-800 shrink-0">중간</span>
            <span>각 기간 7~13일 - 결과는 참고 가능하지만, 가능하면 윈도우를 14일 이상으로 늘려 재확인하세요.</span>
          </div>
          <div className="flex items-start gap-2">
            <span className="px-2 py-0.5 text-xs font-medium rounded bg-red-100 text-red-800 shrink-0">낮음</span>
            <span>각 기간 7일 미만 - 표본이 너무 적어 우연한 변동에 휘둘립니다. 결론을 내리지 마세요.</span>
          </div>
        </div>
      </div>

      <div>
        <h4 className="font-semibold text-blue-900 mb-2">사용자가 결과를 볼 때 주의할 점</h4>
        <ul className="list-disc list-inside space-y-1.5 text-at-text">
          <li>
            <strong>변화율(%)이 커도 p-value가 크면</strong> 우연일 수 있습니다. 두 값을 함께 봐야 합니다.
          </li>
          <li>
            <strong>유의함 ≠ 인과관계.</strong> 같은 시기 마케팅, 계절성, 휴일, 날씨 등 다른 요인의 영향일 수 있습니다.
          </li>
          <li>
            <strong>비교 기간을 넓힐수록</strong> 안정적이지만, 너무 길면 다른 이벤트가 섞여 들어갈 수 있습니다. 14~30일이 일반적으로 적절합니다.
          </li>
          <li>
            특정 요일 효과(예: 주말 매출 패턴)가 강하면 결과가 왜곡될 수 있습니다.
            가능하면 <strong>이벤트 전·후가 같은 요일 구성</strong>이 되도록 짝수 주(7·14·21·28일) 윈도우를 사용하세요.
          </li>
          <li>
            매출이 0인 날(휴진)도 평균에 포함됩니다. 휴진일이 많으면 결과 해석에 주의가 필요합니다.
          </li>
        </ul>
      </div>

      <div className="bg-white border border-blue-200 rounded-lg p-3 text-xs text-at-text-weak">
        <strong>요약:</strong> p-value &lt; 0.05이면서 신뢰도가 &ldquo;높음&rdquo;인 결과를 우선 신뢰하고,
        그 외 외부 요인(마케팅 비용, 계절성, 휴진일 등)을 같이 검토한 뒤 의사결정에 활용하세요.
      </div>
    </div>
  );
}

function GuideCard({
  title,
  body,
  tone,
}: {
  title: string;
  body: React.ReactNode;
  tone: 'success' | 'neutral';
}) {
  return (
    <div
      className={cn(
        'rounded-lg p-3 border text-sm',
        tone === 'success'
          ? 'bg-green-50 border-green-200'
          : 'bg-gray-50 border-at-border'
      )}
    >
      <div
        className={cn(
          'font-semibold mb-1',
          tone === 'success' ? 'text-green-800' : 'text-at-text'
        )}
      >
        {title}
      </div>
      <div className="text-at-text leading-relaxed">{body}</div>
    </div>
  );
}

function SummaryCard({
  label,
  value,
  sublabel,
  highlight,
}: {
  label: string;
  value: string;
  sublabel?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={cn(
        'bg-white rounded-xl border p-4',
        highlight ? 'border-green-300 bg-green-50' : 'border-at-border'
      )}
    >
      <div className="text-xs text-at-text-weak mb-1">{label}</div>
      <div className="text-2xl font-semibold text-at-text">{value}</div>
      {sublabel && (
        <div className="text-xs text-at-text-weak mt-1">{sublabel}</div>
      )}
    </div>
  );
}
