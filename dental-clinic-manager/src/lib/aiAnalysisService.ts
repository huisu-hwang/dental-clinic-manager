import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import type {
  AIMessage,
  AIAnalysisRequest,
  AIAnalysisResponse,
  CollectedData,
  DatabaseSchema,
} from '@/types/aiAnalysis';

// 데이터베이스 스키마 정보 (AI 컨텍스트용)
const DATABASE_SCHEMA: DatabaseSchema = {
  tables: [
    {
      name: 'daily_reports',
      description: '일일 보고서 - 매일의 리콜, 상담, 리뷰 현황을 기록',
      columns: [
        { name: 'date', type: 'date', description: '보고서 날짜' },
        { name: 'recall_count', type: 'integer', description: '리콜 환자 수' },
        { name: 'recall_booking_count', type: 'integer', description: '리콜 예약 완료 수' },
        { name: 'consult_proceed', type: 'integer', description: '상담 진행 수' },
        { name: 'consult_hold', type: 'integer', description: '상담 보류 수' },
        { name: 'naver_review_count', type: 'integer', description: '네이버 리뷰 수' },
        { name: 'special_notes', type: 'text', description: '특이사항' },
      ],
    },
    {
      name: 'consult_logs',
      description: '상담 기록 - 개별 환자 상담 내역',
      columns: [
        { name: 'date', type: 'date', description: '상담 날짜' },
        { name: 'patient_name', type: 'text', description: '환자 이름' },
        { name: 'consult_content', type: 'text', description: '상담 내용' },
        { name: 'consult_status', type: 'text', description: '상담 상태 (O: 진행, X: 보류)' },
        { name: 'remarks', type: 'text', description: '비고' },
      ],
    },
    {
      name: 'gift_logs',
      description: '선물 증정 기록 - 환자에게 제공한 선물 내역',
      columns: [
        { name: 'date', type: 'date', description: '증정 날짜' },
        { name: 'patient_name', type: 'text', description: '환자 이름' },
        { name: 'gift_type', type: 'text', description: '선물 종류' },
        { name: 'quantity', type: 'integer', description: '수량' },
        { name: 'naver_review', type: 'text', description: '네이버 리뷰 작성 여부 (O/X)' },
        { name: 'notes', type: 'text', description: '비고' },
      ],
    },
    {
      name: 'happy_call_logs',
      description: '해피콜 기록 - 치료 후 환자 만족도 확인 전화',
      columns: [
        { name: 'date', type: 'date', description: '전화 날짜' },
        { name: 'patient_name', type: 'text', description: '환자 이름' },
        { name: 'treatment', type: 'text', description: '치료 내용' },
        { name: 'notes', type: 'text', description: '통화 내용/메모' },
      ],
    },
    {
      name: 'cash_register_logs',
      description: '현금 출납 기록 - 일일 현금 잔액 관리',
      columns: [
        { name: 'date', type: 'date', description: '기록 날짜' },
        { name: 'previous_balance', type: 'integer', description: '전일 이월액' },
        { name: 'current_balance', type: 'integer', description: '금일 잔액' },
        { name: 'balance_difference', type: 'integer', description: '차액' },
        { name: 'notes', type: 'text', description: '비고' },
      ],
    },
    {
      name: 'attendance_records',
      description: '출퇴근 기록 - 직원 근태 관리',
      columns: [
        { name: 'date', type: 'date', description: '근무 날짜' },
        { name: 'user_id', type: 'uuid', description: '직원 ID' },
        { name: 'check_in_time', type: 'timestamp', description: '출근 시간' },
        { name: 'check_out_time', type: 'timestamp', description: '퇴근 시간' },
      ],
    },
    {
      name: 'leave_requests',
      description: '연차/휴가 신청 기록',
      columns: [
        { name: 'user_id', type: 'uuid', description: '신청 직원 ID' },
        { name: 'leave_type', type: 'text', description: '휴가 유형' },
        { name: 'start_date', type: 'date', description: '시작일' },
        { name: 'end_date', type: 'date', description: '종료일' },
        { name: 'status', type: 'text', description: '승인 상태' },
      ],
    },
    {
      name: 'gift_inventory',
      description: '선물 재고 현황',
      columns: [
        { name: 'name', type: 'text', description: '선물 이름' },
        { name: 'stock', type: 'integer', description: '현재 재고 수량' },
        { name: 'category_id', type: 'integer', description: '카테고리 ID' },
      ],
    },
    {
      name: 'inventory_logs',
      description: '재고 입출고 기록',
      columns: [
        { name: 'timestamp', type: 'timestamp', description: '기록 시간' },
        { name: 'name', type: 'text', description: '품목명' },
        { name: 'reason', type: 'text', description: '입출고 사유' },
        { name: 'change', type: 'integer', description: '변동 수량' },
        { name: 'old_stock', type: 'integer', description: '이전 재고' },
        { name: 'new_stock', type: 'integer', description: '변경 후 재고' },
      ],
    },
  ],
};

// 시스템 프롬프트 생성
function generateSystemPrompt(): string {
  const schemaDescription = DATABASE_SCHEMA.tables
    .map((table) => {
      const columnsDesc = table.columns
        .map((col) => `    - ${col.name} (${col.type}): ${col.description}`)
        .join('\n');
      return `  📊 ${table.name}: ${table.description}\n${columnsDesc}`;
    })
    .join('\n\n');

  return `당신은 치과 병원 데이터 분석 전문가 AI입니다. 사용자가 질문하면 제공된 데이터를 기반으로 분석하고 인사이트를 제공합니다.

## 역할
- 치과 병원의 운영 데이터를 분석하여 의미 있는 인사이트 도출
- 매출, 환자 관리, 직원 근태 등 다양한 지표 분석
- 트렌드 파악 및 개선 방안 제안
- 데이터 기반의 객관적인 분석 제공

## 데이터베이스 스키마 정보
${schemaDescription}

## 분석 원칙
1. **정확성**: 제공된 데이터만을 기반으로 분석합니다.
2. **명확성**: 분석 결과를 이해하기 쉽게 설명합니다.
3. **실용성**: 실제 운영에 도움이 되는 인사이트를 제공합니다.
4. **객관성**: 데이터가 보여주는 사실을 있는 그대로 전달합니다.

## 응답 형식
- 한국어로 응답합니다.
- 수치 데이터는 명확하게 표시합니다.
- 필요시 표, 리스트 등을 활용하여 가독성을 높입니다.
- 분석 결과와 함께 개선 제안이나 주의점도 함께 제시합니다.

## 분석 가능한 영역
- 리콜 환자 관리 효율성 (리콜 수 대비 예약 전환율)
- 상담 성과 분석 (상담 진행률, 보류 사유 패턴)
- 네이버 리뷰 트렌드 및 선물 증정과의 상관관계
- 현금 흐름 분석
- 직원 근태 패턴 분석
- 연차/휴가 사용 현황
- 재고 관리 효율성

데이터가 없거나 부족한 경우 솔직하게 알려주고, 분석 가능한 범위 내에서 최선의 인사이트를 제공하세요.`;
}

// 날짜 범위 파싱 함수
export function parseDateRange(message: string): { startDate: string; endDate: string } | null {
  // 다양한 날짜 형식 지원
  const patterns = [
    // "24년 8월 25일 부터 25년 10월 30일까지" 형식
    /(\d{2})년\s*(\d{1,2})월\s*(\d{1,2})일\s*부터\s*(\d{2})년\s*(\d{1,2})월\s*(\d{1,2})일/,
    // "2024년 8월 25일 부터 2025년 10월 30일까지" 형식
    /(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일\s*부터\s*(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/,
    // "2024-08-25 ~ 2025-10-30" 형식
    /(\d{4})-(\d{2})-(\d{2})\s*[~부터]\s*(\d{4})-(\d{2})-(\d{2})/,
    // "최근 N개월" 형식
    /최근\s*(\d+)\s*개월/,
    // "지난 N주" 형식
    /지난\s*(\d+)\s*주/,
    // "올해" 형식
    /올해/,
    // "이번 달" 형식
    /이번\s*달/,
  ];

  for (let i = 0; i < patterns.length; i++) {
    const match = message.match(patterns[i]);
    if (match) {
      const today = new Date();

      if (i === 0) {
        // "24년 8월 25일" 형식
        const startYear = 2000 + parseInt(match[1]);
        const startMonth = match[2].padStart(2, '0');
        const startDay = match[3].padStart(2, '0');
        const endYear = 2000 + parseInt(match[4]);
        const endMonth = match[5].padStart(2, '0');
        const endDay = match[6].padStart(2, '0');
        return {
          startDate: `${startYear}-${startMonth}-${startDay}`,
          endDate: `${endYear}-${endMonth}-${endDay}`,
        };
      } else if (i === 1) {
        // "2024년 8월 25일" 형식
        return {
          startDate: `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`,
          endDate: `${match[4]}-${match[5].padStart(2, '0')}-${match[6].padStart(2, '0')}`,
        };
      } else if (i === 2) {
        // ISO 형식
        return {
          startDate: `${match[1]}-${match[2]}-${match[3]}`,
          endDate: `${match[4]}-${match[5]}-${match[6]}`,
        };
      } else if (i === 3) {
        // 최근 N개월
        const months = parseInt(match[1]);
        const startDate = new Date(today);
        startDate.setMonth(startDate.getMonth() - months);
        return {
          startDate: startDate.toISOString().split('T')[0],
          endDate: today.toISOString().split('T')[0],
        };
      } else if (i === 4) {
        // 지난 N주
        const weeks = parseInt(match[1]);
        const startDate = new Date(today);
        startDate.setDate(startDate.getDate() - weeks * 7);
        return {
          startDate: startDate.toISOString().split('T')[0],
          endDate: today.toISOString().split('T')[0],
        };
      } else if (i === 5) {
        // 올해
        return {
          startDate: `${today.getFullYear()}-01-01`,
          endDate: today.toISOString().split('T')[0],
        };
      } else if (i === 6) {
        // 이번 달
        const firstDay = new Date(today.getFullYear(), today.getMonth(), 1);
        return {
          startDate: firstDay.toISOString().split('T')[0],
          endDate: today.toISOString().split('T')[0],
        };
      }
    }
  }

  return null;
}

// Supabase에서 데이터 수집
export async function collectDataForAnalysis(
  supabaseUrl: string,
  supabaseKey: string,
  clinicId: string,
  dateRange?: { startDate: string; endDate: string }
): Promise<CollectedData> {
  const supabase = createClient(supabaseUrl, supabaseKey);
  const data: CollectedData = {};

  // 날짜 필터 설정 (기본: 최근 3개월)
  const endDate = dateRange?.endDate || new Date().toISOString().split('T')[0];
  const startDate =
    dateRange?.startDate ||
    new Date(new Date().setMonth(new Date().getMonth() - 3)).toISOString().split('T')[0];

  try {
    // 일일 보고서
    const { data: dailyReports } = await supabase
      .from('daily_reports')
      .select('date, recall_count, recall_booking_count, consult_proceed, consult_hold, naver_review_count, special_notes')
      .eq('clinic_id', clinicId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true });

    if (dailyReports) {
      data.dailyReports = dailyReports;
    }

    // 상담 기록
    const { data: consultLogs } = await supabase
      .from('consult_logs')
      .select('date, patient_name, consult_content, consult_status, remarks')
      .eq('clinic_id', clinicId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true });

    if (consultLogs) {
      data.consultLogs = consultLogs;
    }

    // 선물 기록
    const { data: giftLogs } = await supabase
      .from('gift_logs')
      .select('date, patient_name, gift_type, quantity, naver_review, notes')
      .eq('clinic_id', clinicId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true });

    if (giftLogs) {
      data.giftLogs = giftLogs;
    }

    // 해피콜 기록
    const { data: happyCallLogs } = await supabase
      .from('happy_call_logs')
      .select('date, patient_name, treatment, notes')
      .eq('clinic_id', clinicId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true });

    if (happyCallLogs) {
      data.happyCallLogs = happyCallLogs;
    }

    // 현금 출납 기록
    const { data: cashRegisters } = await supabase
      .from('cash_register_logs')
      .select('date, previous_balance, current_balance, balance_difference, notes')
      .eq('clinic_id', clinicId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true });

    if (cashRegisters) {
      data.cashRegisters = cashRegisters;
    }

    // 출퇴근 기록 (직원 이름 포함)
    const { data: attendanceRecords } = await supabase
      .from('attendance_records')
      .select(`
        date,
        check_in_time,
        check_out_time,
        users!inner(name)
      `)
      .eq('clinic_id', clinicId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('date', { ascending: true });

    if (attendanceRecords) {
      data.attendanceRecords = attendanceRecords.map((record) => {
        const users = record.users as unknown as { name: string } | { name: string }[] | null;
        const userName = Array.isArray(users) ? users[0]?.name : users?.name;
        return {
          date: record.date,
          user_name: userName || 'Unknown',
          check_in_time: record.check_in_time,
          check_out_time: record.check_out_time,
        };
      });
    }

    // 연차 신청 기록
    const { data: leaveRequests } = await supabase
      .from('leave_requests')
      .select(`
        leave_type,
        start_date,
        end_date,
        status,
        users!inner(name)
      `)
      .eq('clinic_id', clinicId)
      .or(`start_date.gte.${startDate},end_date.lte.${endDate}`)
      .order('start_date', { ascending: true });

    if (leaveRequests) {
      data.leaveRequests = leaveRequests.map((request) => {
        const users = request.users as unknown as { name: string } | { name: string }[] | null;
        const userName = Array.isArray(users) ? users[0]?.name : users?.name;
        return {
          user_name: userName || 'Unknown',
          leave_type: request.leave_type,
          start_date: request.start_date,
          end_date: request.end_date,
          status: request.status,
        };
      });
    }
  } catch (error) {
    console.error('Error collecting data for analysis:', error);
  }

  return data;
}

// 데이터 요약 생성
function generateDataSummary(data: CollectedData, dateRange?: { startDate: string; endDate: string }): string {
  const summaryParts: string[] = [];

  if (dateRange) {
    summaryParts.push(`## 분석 기간: ${dateRange.startDate} ~ ${dateRange.endDate}\n`);
  }

  if (data.dailyReports && data.dailyReports.length > 0) {
    const totalRecalls = data.dailyReports.reduce((sum, r) => sum + (r.recall_count || 0), 0);
    const totalBookings = data.dailyReports.reduce((sum, r) => sum + (r.recall_booking_count || 0), 0);
    const totalProceed = data.dailyReports.reduce((sum, r) => sum + (r.consult_proceed || 0), 0);
    const totalHold = data.dailyReports.reduce((sum, r) => sum + (r.consult_hold || 0), 0);
    const totalReviews = data.dailyReports.reduce((sum, r) => sum + (r.naver_review_count || 0), 0);

    summaryParts.push(`## 일일 보고서 요약 (${data.dailyReports.length}일간)
- 총 리콜 환자 수: ${totalRecalls}명
- 리콜 예약 완료: ${totalBookings}명 (전환율: ${totalRecalls > 0 ? ((totalBookings / totalRecalls) * 100).toFixed(1) : 0}%)
- 상담 진행: ${totalProceed}건
- 상담 보류: ${totalHold}건 (보류율: ${totalProceed + totalHold > 0 ? ((totalHold / (totalProceed + totalHold)) * 100).toFixed(1) : 0}%)
- 네이버 리뷰: ${totalReviews}건

### 일별 상세 데이터:
${JSON.stringify(data.dailyReports, null, 2)}`);
  }

  if (data.consultLogs && data.consultLogs.length > 0) {
    const proceedCount = data.consultLogs.filter((l) => l.consult_status === 'O').length;
    summaryParts.push(`## 상담 기록 요약 (${data.consultLogs.length}건)
- 상담 진행(O): ${proceedCount}건
- 상담 보류(X): ${data.consultLogs.length - proceedCount}건

### 상담 상세 데이터:
${JSON.stringify(data.consultLogs, null, 2)}`);
  }

  if (data.giftLogs && data.giftLogs.length > 0) {
    const totalGifts = data.giftLogs.reduce((sum, g) => sum + (g.quantity || 1), 0);
    const withReview = data.giftLogs.filter((g) => g.naver_review === 'O').length;
    const giftTypes = data.giftLogs.reduce(
      (acc, g) => {
        acc[g.gift_type] = (acc[g.gift_type] || 0) + (g.quantity || 1);
        return acc;
      },
      {} as Record<string, number>
    );

    summaryParts.push(`## 선물 증정 기록 요약 (${data.giftLogs.length}건, 총 ${totalGifts}개)
- 리뷰 작성 환자: ${withReview}명 (비율: ${((withReview / data.giftLogs.length) * 100).toFixed(1)}%)
- 선물 종류별 수량: ${JSON.stringify(giftTypes)}

### 선물 상세 데이터:
${JSON.stringify(data.giftLogs, null, 2)}`);
  }

  if (data.happyCallLogs && data.happyCallLogs.length > 0) {
    summaryParts.push(`## 해피콜 기록 요약 (${data.happyCallLogs.length}건)

### 해피콜 상세 데이터:
${JSON.stringify(data.happyCallLogs, null, 2)}`);
  }

  if (data.cashRegisters && data.cashRegisters.length > 0) {
    const totalDifference = data.cashRegisters.reduce((sum, c) => sum + (c.balance_difference || 0), 0);
    const lastBalance = data.cashRegisters[data.cashRegisters.length - 1]?.current_balance || 0;

    summaryParts.push(`## 현금 출납 기록 요약 (${data.cashRegisters.length}일간)
- 기간 내 총 차액 변동: ${totalDifference.toLocaleString()}원
- 최종 잔액: ${lastBalance.toLocaleString()}원

### 현금 출납 상세 데이터:
${JSON.stringify(data.cashRegisters, null, 2)}`);
  }

  if (data.attendanceRecords && data.attendanceRecords.length > 0) {
    summaryParts.push(`## 출퇴근 기록 요약 (${data.attendanceRecords.length}건)

### 출퇴근 상세 데이터:
${JSON.stringify(data.attendanceRecords, null, 2)}`);
  }

  if (data.leaveRequests && data.leaveRequests.length > 0) {
    const approved = data.leaveRequests.filter((l) => l.status === 'approved').length;
    summaryParts.push(`## 연차/휴가 신청 요약 (${data.leaveRequests.length}건)
- 승인됨: ${approved}건
- 대기/거절: ${data.leaveRequests.length - approved}건

### 연차 상세 데이터:
${JSON.stringify(data.leaveRequests, null, 2)}`);
  }

  if (summaryParts.length === 0 || (dateRange && summaryParts.length === 1)) {
    return '해당 기간에 분석할 수 있는 데이터가 없습니다.';
  }

  return summaryParts.join('\n\n');
}

// OpenAI를 통한 분석 수행
export async function analyzeWithAI(
  request: AIAnalysisRequest,
  collectedData: CollectedData,
  openaiApiKey: string
): Promise<AIAnalysisResponse> {
  const openai = new OpenAI({
    apiKey: openaiApiKey,
  });

  const systemPrompt = generateSystemPrompt();
  const dataSummary = generateDataSummary(collectedData, request.dateRange);

  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
    { role: 'system', content: systemPrompt },
  ];

  // 이전 대화 내역 추가
  if (request.conversationHistory && request.conversationHistory.length > 0) {
    for (const msg of request.conversationHistory) {
      if (msg.role === 'user' || msg.role === 'assistant') {
        messages.push({
          role: msg.role,
          content: msg.content,
        });
      }
    }
  }

  // 현재 사용자 메시지와 데이터 추가
  const userMessage = `
## 사용자 질문
${request.message}

## 분석에 사용할 데이터
${dataSummary}

위 데이터를 기반으로 사용자의 질문에 답변해 주세요.
`;

  messages.push({ role: 'user', content: userMessage });

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      temperature: 0.7,
      max_tokens: 4000,
    });

    const responseContent = completion.choices[0]?.message?.content || '분석을 완료할 수 없습니다.';

    return {
      message: responseContent,
    };
  } catch (error) {
    console.error('OpenAI API Error:', error);
    return {
      message: '',
      error: error instanceof Error ? error.message : 'AI 분석 중 오류가 발생했습니다.',
    };
  }
}

// 메인 분석 함수
export async function performAnalysis(
  request: AIAnalysisRequest,
  supabaseUrl: string,
  supabaseKey: string,
  openaiApiKey: string,
  clinicId: string
): Promise<AIAnalysisResponse> {
  // 메시지에서 날짜 범위 파싱
  const parsedDateRange = parseDateRange(request.message);
  const dateRange = request.dateRange || parsedDateRange || undefined;

  // 데이터 수집
  const collectedData = await collectDataForAnalysis(supabaseUrl, supabaseKey, clinicId, dateRange);

  // AI 분석 수행
  const response = await analyzeWithAI(
    { ...request, dateRange },
    collectedData,
    openaiApiKey
  );

  return response;
}
