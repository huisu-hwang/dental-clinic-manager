'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/Button';
import { Loader2, Calendar, TrendingUp, AlertTriangle, BarChart3 } from 'lucide-react';
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

interface Announcement {
  id: string;
  title: string;
  start_date: string | null;
  end_date: string | null;
  category: string;
}

interface DailyDataPoint {
  date: string;
  value: number;
}

type Metric = 'sales' | 'new_patients';

interface Props {
  clinicId: string;
}

export default function EventImpactAnalysis({ clinicId }: Props) {
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [loadingAnnouncements, setLoadingAnnouncements] = useState(true);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [metric, setMetric] = useState<Metric>('sales');
  const [windowDays, setWindowDays] = useState(14);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<EventImpactResult | null>(null);
  const [chartData, setChartData] = useState<DailyDataPoint[]>([]);
  const [eventDate, setEventDate] = useState<string>('');

  // 공지사항 목록 로드
  useEffect(() => {
    const loadAnnouncements = async () => {
      try {
        setLoadingAnnouncements(true);
        const supabase = createClient();
        if (!supabase) return;

        const { data, error: fetchError } = await supabase
          .from('announcements')
          .select('id, title, start_date, end_date, category')
          .eq('clinic_id', clinicId)
          .not('start_date', 'is', null)
          .order('start_date', { ascending: false })
          .limit(50);

        if (fetchError) {
          setError(`공지 목록 조회 실패: ${fetchError.message}`);
          return;
        }
        setAnnouncements(data || []);
      } catch (err) {
        setError(String(err));
      } finally {
        setLoadingAnnouncements(false);
      }
    };
    loadAnnouncements();
  }, [clinicId]);

  const handleAnalyze = async () => {
    if (!selectedEventId) {
      setError('이벤트를 선택하세요');
      return;
    }

    const event = announcements.find((a) => a.id === selectedEventId);
    if (!event || !event.start_date) {
      setError('이벤트의 시작일이 없습니다');
      return;
    }

    setLoading(true);
    setError(null);
    setResult(null);
    setChartData([]);

    try {
      // 분석 기간 = 이벤트 시작일 ± windowDays
      const eventTs = new Date(event.start_date).getTime();
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
      const { before, after } = splitByEvent(rawData, event.start_date, windowDays);
      const stats = welchTTest(before, after);

      setEventDate(event.start_date);
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
            <div>
              <h2 className="text-lg font-semibold text-at-text">
                이벤트 효과 분석
              </h2>
              <p className="text-sm text-at-text-weak">
                특정 이벤트(공지)가 매출/신환에 통계적으로 유의미한 영향을 미쳤는지 검증합니다.
              </p>
            </div>
          </div>
        </div>

        {/* 입력 패널 */}
        <div className="bg-white rounded-xl border border-at-border p-6 space-y-4">
          {/* 이벤트 선택 */}
          <div>
            <label className="block text-sm font-medium text-at-text mb-2">
              <Calendar className="inline w-4 h-4 mr-1" />
              이벤트 선택
            </label>
            <select
              value={selectedEventId}
              onChange={(e) => setSelectedEventId(e.target.value)}
              disabled={loadingAnnouncements || loading}
              className="w-full px-3 py-2 border border-at-border rounded-lg text-sm focus:outline-none focus:border-at-accent"
            >
              <option value="">-- 공지사항 선택 --</option>
              {announcements.map((a) => (
                <option key={a.id} value={a.id}>
                  [{a.start_date?.slice(0, 10)}] {a.title}
                </option>
              ))}
            </select>
            {!loadingAnnouncements && announcements.length === 0 && (
              <p className="text-xs text-at-text-weak mt-1">
                시작일이 설정된 공지사항이 없습니다. 병원 게시판에서 공지를 작성해주세요.
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
              <div className="font-medium mb-1">
                {result.isSignificant
                  ? '✓ 통계적으로 유의한 변화'
                  : '— 유의한 변화 없음'}
              </div>
              <div className="text-sm">{result.conclusion}</div>
              {result.reliability !== 'high' && (
                <div className="flex items-center gap-2 mt-2 text-xs text-yellow-700">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  신뢰도:{' '}
                  {result.reliability === 'low'
                    ? '낮음 (데이터 부족)'
                    : '중간'}{' '}
                  - 더 긴 윈도우 권장
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
