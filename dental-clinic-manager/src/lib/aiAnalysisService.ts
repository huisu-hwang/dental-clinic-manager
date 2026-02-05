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
    {
      name: 'recall_campaigns',
      description: '리콜 캠페인 - 리콜 환자 관리 캠페인',
      columns: [
        { name: 'name', type: 'text', description: '캠페인 이름' },
        { name: 'start_date', type: 'date', description: '시작일' },
        { name: 'end_date', type: 'date', description: '종료일' },
        { name: 'status', type: 'text', description: '상태' },
        { name: 'total_patients', type: 'integer', description: '총 환자 수' },
      ],
    },
    {
      name: 'recall_patients',
      description: '리콜 환자 목록 - 개별 환자 리콜 현황',
      columns: [
        { name: 'patient_name', type: 'text', description: '환자 이름' },
        { name: 'phone', type: 'text', description: '연락처' },
        { name: 'last_visit', type: 'date', description: '마지막 방문일' },
        { name: 'recall_date', type: 'date', description: '리콜 예정일' },
        { name: 'status', type: 'text', description: '리콜 상태' },
        { name: 'contact_count', type: 'integer', description: '연락 시도 횟수' },
      ],
    },
    {
      name: 'recall_contact_logs',
      description: '리콜 연락 기록 - 환자 연락 시도 이력',
      columns: [
        { name: 'contact_type', type: 'text', description: '연락 유형 (전화/문자)' },
        { name: 'result', type: 'text', description: '연락 결과' },
        { name: 'notes', type: 'text', description: '메모' },
        { name: 'created_at', type: 'timestamp', description: '연락 시간' },
      ],
    },
    {
      name: 'special_notes_history',
      description: '특이사항 히스토리 - 일일 보고서 특이사항 변경 이력',
      columns: [
        { name: 'date', type: 'date', description: '날짜' },
        { name: 'content', type: 'text', description: '특이사항 내용' },
        { name: 'created_at', type: 'timestamp', description: '작성 시간' },
      ],
    },
    {
      name: 'users',
      description: '직원 정보',
      columns: [
        { name: 'name', type: 'text', description: '이름' },
        { name: 'role', type: 'text', description: '역할 (owner/manager/staff)' },
        { name: 'position', type: 'text', description: '직책' },
        { name: 'status', type: 'text', description: '상태 (active/inactive)' },
        { name: 'hire_date', type: 'date', description: '입사일' },
      ],
    },
    {
      name: 'announcements',
      description: '공지사항 게시판',
      columns: [
        { name: 'title', type: 'text', description: '제목' },
        { name: 'content', type: 'text', description: '내용' },
        { name: 'is_pinned', type: 'boolean', description: '상단 고정 여부' },
        { name: 'created_at', type: 'timestamp', description: '작성일' },
      ],
    },
    {
      name: 'tasks',
      description: '업무 할당 게시판',
      columns: [
        { name: 'title', type: 'text', description: '업무 제목' },
        { name: 'description', type: 'text', description: '업무 설명' },
        { name: 'status', type: 'text', description: '상태' },
        { name: 'priority', type: 'text', description: '우선순위' },
        { name: 'due_date', type: 'date', description: '마감일' },
      ],
    },
    {
      name: 'vendor_contacts',
      description: '업체 연락처',
      columns: [
        { name: 'company_name', type: 'text', description: '업체명' },
        { name: 'category', type: 'text', description: '카테고리' },
        { name: 'contact_name', type: 'text', description: '담당자명' },
        { name: 'phone', type: 'text', description: '연락처' },
      ],
    },
    {
      name: 'protocols',
      description: '진료 프로토콜',
      columns: [
        { name: 'title', type: 'text', description: '프로토콜 제목' },
        { name: 'category', type: 'text', description: '카테고리' },
        { name: 'content', type: 'text', description: '내용' },
        { name: 'is_published', type: 'boolean', description: '공개 여부' },
      ],
    },
    {
      name: 'employment_contracts',
      description: '근로계약서',
      columns: [
        { name: 'status', type: 'text', description: '계약 상태' },
        { name: 'contract_start_date', type: 'date', description: '계약 시작일' },
        { name: 'contract_end_date', type: 'date', description: '계약 종료일' },
        { name: 'salary_type', type: 'text', description: '급여 유형' },
      ],
    },
    {
      name: 'employee_leave_balances',
      description: '직원 연차 잔액',
      columns: [
        { name: 'total_days', type: 'decimal', description: '총 연차 일수' },
        { name: 'used_days', type: 'decimal', description: '사용 연차 일수' },
        { name: 'remaining_days', type: 'decimal', description: '잔여 연차 일수' },
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

// Supabase에서 데이터 수집 (모든 테이블)
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

  console.log(`[AI Analysis] Collecting data for clinic: ${clinicId}, range: ${startDate} ~ ${endDate}`);

  try {
    // 병렬로 모든 데이터 수집
    const [
      dailyReportsResult,
      consultLogsResult,
      giftLogsResult,
      happyCallLogsResult,
      cashRegistersResult,
      attendanceRecordsResult,
      leaveRequestsResult,
      giftInventoryResult,
      inventoryLogsResult,
      recallCampaignsResult,
      recallPatientsResult,
      recallContactLogsResult,
      specialNotesResult,
      usersResult,
      announcementsResult,
      tasksResult,
      vendorContactsResult,
      protocolsResult,
      contractsResult,
      leaveBalancesResult,
    ] = await Promise.all([
      // 일일 보고서
      supabase
        .from('daily_reports')
        .select('date, recall_count, recall_booking_count, consult_proceed, consult_hold, naver_review_count, special_notes')
        .eq('clinic_id', clinicId)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true }),

      // 상담 기록
      supabase
        .from('consult_logs')
        .select('date, patient_name, consult_content, consult_status, remarks')
        .eq('clinic_id', clinicId)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true }),

      // 선물 기록
      supabase
        .from('gift_logs')
        .select('date, patient_name, gift_type, quantity, naver_review, notes')
        .eq('clinic_id', clinicId)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true }),

      // 해피콜 기록
      supabase
        .from('happy_call_logs')
        .select('date, patient_name, treatment, notes')
        .eq('clinic_id', clinicId)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true }),

      // 현금 출납 기록
      supabase
        .from('cash_register_logs')
        .select('date, previous_balance, current_balance, balance_difference, notes')
        .eq('clinic_id', clinicId)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true }),

      // 출퇴근 기록
      supabase
        .from('attendance_records')
        .select('work_date, check_in_time, check_out_time, scheduled_start, scheduled_end, late_minutes, early_leave_minutes, overtime_minutes, total_work_minutes, status, users!inner(name)')
        .eq('clinic_id', clinicId)
        .gte('work_date', startDate)
        .lte('work_date', endDate)
        .order('work_date', { ascending: true }),

      // 연차 신청 기록
      supabase
        .from('leave_requests')
        .select('leave_type, start_date, end_date, status, reason, users!inner(name)')
        .eq('clinic_id', clinicId)
        .or(`start_date.gte.${startDate},end_date.lte.${endDate}`)
        .order('start_date', { ascending: true }),

      // 선물 재고 현황
      supabase
        .from('gift_inventory')
        .select('name, stock, category_id')
        .eq('clinic_id', clinicId),

      // 재고 입출고 기록
      supabase
        .from('inventory_logs')
        .select('timestamp, name, reason, change, old_stock, new_stock')
        .eq('clinic_id', clinicId)
        .gte('timestamp', `${startDate}T00:00:00`)
        .lte('timestamp', `${endDate}T23:59:59`)
        .order('timestamp', { ascending: true }),

      // 리콜 캠페인
      supabase
        .from('recall_campaigns')
        .select('name, start_date, end_date, status, total_patients, completed_patients')
        .eq('clinic_id', clinicId)
        .order('created_at', { ascending: false })
        .limit(50),

      // 리콜 환자
      supabase
        .from('recall_patients')
        .select('patient_name, phone, last_visit, recall_date, status, contact_count, booking_date')
        .eq('clinic_id', clinicId)
        .gte('recall_date', startDate)
        .lte('recall_date', endDate)
        .order('recall_date', { ascending: true }),

      // 리콜 연락 기록
      supabase
        .from('recall_contact_logs')
        .select('contact_type, result, notes, created_at')
        .eq('clinic_id', clinicId)
        .gte('created_at', `${startDate}T00:00:00`)
        .lte('created_at', `${endDate}T23:59:59`)
        .order('created_at', { ascending: true }),

      // 특이사항 히스토리
      supabase
        .from('special_notes_history')
        .select('date, content, created_at, users!inner(name)')
        .eq('clinic_id', clinicId)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('created_at', { ascending: true }),

      // 직원 정보
      supabase
        .from('users')
        .select('name, role, position, status, hire_date')
        .eq('clinic_id', clinicId)
        .eq('status', 'active'),

      // 공지사항
      supabase
        .from('announcements')
        .select('title, content, is_pinned, created_at, users!inner(name)')
        .eq('clinic_id', clinicId)
        .gte('created_at', `${startDate}T00:00:00`)
        .lte('created_at', `${endDate}T23:59:59`)
        .order('created_at', { ascending: false }),

      // 업무 할당
      supabase
        .from('tasks')
        .select('title, description, status, priority, due_date, created_at')
        .eq('clinic_id', clinicId)
        .order('created_at', { ascending: false })
        .limit(100),

      // 업체 연락처
      supabase
        .from('vendor_contacts')
        .select('company_name, category, contact_name, phone, notes')
        .eq('clinic_id', clinicId),

      // 프로토콜
      supabase
        .from('protocols')
        .select('title, category, is_published, created_at, updated_at')
        .eq('clinic_id', clinicId),

      // 근로계약서
      supabase
        .from('employment_contracts')
        .select('status, contract_start_date, contract_end_date, salary_type, created_at')
        .eq('clinic_id', clinicId)
        .order('created_at', { ascending: false }),

      // 연차 잔액
      supabase
        .from('employee_leave_balances')
        .select('total_days, used_days, remaining_days, year, users!inner(name)')
        .eq('clinic_id', clinicId),
    ]);

    // 데이터 할당
    if (dailyReportsResult.data) data.dailyReports = dailyReportsResult.data;
    if (consultLogsResult.data) data.consultLogs = consultLogsResult.data;
    if (giftLogsResult.data) data.giftLogs = giftLogsResult.data;
    if (happyCallLogsResult.data) data.happyCallLogs = happyCallLogsResult.data;
    if (cashRegistersResult.data) data.cashRegisters = cashRegistersResult.data;

    // 출퇴근 기록 변환
    if (attendanceRecordsResult.data) {
      data.attendanceRecords = attendanceRecordsResult.data.map((record) => {
        const users = record.users as unknown as { name: string } | { name: string }[] | null;
        const userName = Array.isArray(users) ? users[0]?.name : users?.name;
        return {
          date: record.work_date,
          user_name: userName || 'Unknown',
          check_in_time: record.check_in_time,
          check_out_time: record.check_out_time,
          scheduled_start: record.scheduled_start,
          scheduled_end: record.scheduled_end,
          late_minutes: record.late_minutes || 0,
          early_leave_minutes: record.early_leave_minutes || 0,
          overtime_minutes: record.overtime_minutes || 0,
          total_work_minutes: record.total_work_minutes,
          status: record.status,
        };
      });
    }

    // 연차 신청 변환
    if (leaveRequestsResult.data) {
      data.leaveRequests = leaveRequestsResult.data.map((request) => {
        const users = request.users as unknown as { name: string } | { name: string }[] | null;
        const userName = Array.isArray(users) ? users[0]?.name : users?.name;
        return {
          user_name: userName || 'Unknown',
          leave_type: request.leave_type,
          start_date: request.start_date,
          end_date: request.end_date,
          status: request.status,
          reason: request.reason,
        };
      });
    }

    // 추가 데이터 할당
    if (giftInventoryResult.data) data.giftInventory = giftInventoryResult.data;
    if (inventoryLogsResult.data) data.inventoryLogs = inventoryLogsResult.data;
    if (recallCampaignsResult.data) data.recallCampaigns = recallCampaignsResult.data;
    if (recallPatientsResult.data) data.recallPatients = recallPatientsResult.data;
    if (recallContactLogsResult.data) data.recallContactLogs = recallContactLogsResult.data;

    // 특이사항 히스토리 변환
    if (specialNotesResult.data) {
      data.specialNotesHistory = specialNotesResult.data.map((note) => {
        const users = note.users as unknown as { name: string } | { name: string }[] | null;
        const userName = Array.isArray(users) ? users[0]?.name : users?.name;
        return {
          date: note.date,
          content: note.content,
          created_at: note.created_at,
          author: userName || 'Unknown',
        };
      });
    }

    if (usersResult.data) data.users = usersResult.data;

    // 공지사항 변환
    if (announcementsResult.data) {
      data.announcements = announcementsResult.data.map((ann) => {
        const users = ann.users as unknown as { name: string } | { name: string }[] | null;
        const userName = Array.isArray(users) ? users[0]?.name : users?.name;
        return {
          title: ann.title,
          content: ann.content,
          is_pinned: ann.is_pinned,
          created_at: ann.created_at,
          author: userName || 'Unknown',
        };
      });
    }

    if (tasksResult.data) data.tasks = tasksResult.data;
    if (vendorContactsResult.data) data.vendorContacts = vendorContactsResult.data;
    if (protocolsResult.data) data.protocols = protocolsResult.data;
    if (contractsResult.data) data.contracts = contractsResult.data;

    // 연차 잔액 변환
    if (leaveBalancesResult.data) {
      data.leaveBalances = leaveBalancesResult.data.map((balance) => {
        const users = balance.users as unknown as { name: string } | { name: string }[] | null;
        const userName = Array.isArray(users) ? users[0]?.name : users?.name;
        return {
          user_name: userName || 'Unknown',
          total_days: balance.total_days,
          used_days: balance.used_days,
          remaining_days: balance.remaining_days,
          year: balance.year,
        };
      });
    }

    // 수집된 데이터 요약 로깅
    const collectedSummary = {
      dailyReports: data.dailyReports?.length || 0,
      consultLogs: data.consultLogs?.length || 0,
      giftLogs: data.giftLogs?.length || 0,
      happyCallLogs: data.happyCallLogs?.length || 0,
      cashRegisters: data.cashRegisters?.length || 0,
      attendanceRecords: data.attendanceRecords?.length || 0,
      leaveRequests: data.leaveRequests?.length || 0,
      giftInventory: data.giftInventory?.length || 0,
      inventoryLogs: data.inventoryLogs?.length || 0,
      recallCampaigns: data.recallCampaigns?.length || 0,
      recallPatients: data.recallPatients?.length || 0,
      recallContactLogs: data.recallContactLogs?.length || 0,
      specialNotesHistory: data.specialNotesHistory?.length || 0,
      users: data.users?.length || 0,
      announcements: data.announcements?.length || 0,
      tasks: data.tasks?.length || 0,
      vendorContacts: data.vendorContacts?.length || 0,
      protocols: data.protocols?.length || 0,
      contracts: data.contracts?.length || 0,
      leaveBalances: data.leaveBalances?.length || 0,
    };
    console.log('[AI Analysis] Data collected:', JSON.stringify(collectedSummary));

  } catch (error) {
    console.error('[AI Analysis] Error collecting data:', error);
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
    const totalLateMinutes = data.attendanceRecords.reduce((sum, r) => sum + (r.late_minutes || 0), 0);
    const totalEarlyLeaveMinutes = data.attendanceRecords.reduce((sum, r) => sum + (r.early_leave_minutes || 0), 0);
    const totalOvertimeMinutes = data.attendanceRecords.reduce((sum, r) => sum + (r.overtime_minutes || 0), 0);
    const totalWorkMinutes = data.attendanceRecords.reduce((sum, r) => sum + (r.total_work_minutes || 0), 0);
    const lateCount = data.attendanceRecords.filter((r) => r.late_minutes > 0).length;
    const earlyLeaveCount = data.attendanceRecords.filter((r) => r.early_leave_minutes > 0).length;
    const overtimeCount = data.attendanceRecords.filter((r) => r.overtime_minutes > 0).length;
    const statusCount = data.attendanceRecords.reduce(
      (acc, r) => {
        const key = r.status || 'unknown';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );

    summaryParts.push(`## 출퇴근 기록 요약 (${data.attendanceRecords.length}건)
- 근태 상태별 분포: ${JSON.stringify(statusCount)}
- 지각 횟수: ${lateCount}회 (총 ${totalLateMinutes}분, 약 ${(totalLateMinutes / 60).toFixed(1)}시간)
- 조퇴 횟수: ${earlyLeaveCount}회 (총 ${totalEarlyLeaveMinutes}분, 약 ${(totalEarlyLeaveMinutes / 60).toFixed(1)}시간)
- 초과근무 횟수: ${overtimeCount}회 (총 ${totalOvertimeMinutes}분, 약 ${(totalOvertimeMinutes / 60).toFixed(1)}시간)
- 총 근무시간: ${totalWorkMinutes}분 (약 ${(totalWorkMinutes / 60).toFixed(1)}시간)

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

  // 선물 재고 현황
  if (data.giftInventory && data.giftInventory.length > 0) {
    const totalStock = data.giftInventory.reduce((sum, g) => sum + (g.stock || 0), 0);
    const lowStockItems = data.giftInventory.filter((g) => g.stock <= 5);
    summaryParts.push(`## 선물 재고 현황 (${data.giftInventory.length}종)
- 총 재고 수량: ${totalStock}개
- 재고 부족 품목 (5개 이하): ${lowStockItems.length}종

### 재고 상세 데이터:
${JSON.stringify(data.giftInventory, null, 2)}`);
  }

  // 재고 입출고 기록
  if (data.inventoryLogs && data.inventoryLogs.length > 0) {
    const inflows = data.inventoryLogs.filter((l) => l.change > 0);
    const outflows = data.inventoryLogs.filter((l) => l.change < 0);
    summaryParts.push(`## 재고 입출고 기록 (${data.inventoryLogs.length}건)
- 입고 기록: ${inflows.length}건
- 출고 기록: ${outflows.length}건

### 입출고 상세 데이터:
${JSON.stringify(data.inventoryLogs, null, 2)}`);
  }

  // 리콜 캠페인
  if (data.recallCampaigns && data.recallCampaigns.length > 0) {
    const activeCampaigns = data.recallCampaigns.filter((c) => c.status === 'active');
    const totalPatients = data.recallCampaigns.reduce((sum, c) => sum + (c.total_patients || 0), 0);
    const completedPatients = data.recallCampaigns.reduce((sum, c) => sum + (c.completed_patients || 0), 0);
    summaryParts.push(`## 리콜 캠페인 요약 (${data.recallCampaigns.length}개)
- 진행 중 캠페인: ${activeCampaigns.length}개
- 총 대상 환자: ${totalPatients}명
- 완료된 환자: ${completedPatients}명 (완료율: ${totalPatients > 0 ? ((completedPatients / totalPatients) * 100).toFixed(1) : 0}%)

### 캠페인 상세 데이터:
${JSON.stringify(data.recallCampaigns, null, 2)}`);
  }

  // 리콜 환자
  if (data.recallPatients && data.recallPatients.length > 0) {
    const statusCount = data.recallPatients.reduce(
      (acc, p) => {
        acc[p.status] = (acc[p.status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
    const bookedCount = data.recallPatients.filter((p) => p.booking_date).length;
    summaryParts.push(`## 리콜 환자 현황 (${data.recallPatients.length}명)
- 상태별 분포: ${JSON.stringify(statusCount)}
- 예약 완료: ${bookedCount}명 (예약률: ${((bookedCount / data.recallPatients.length) * 100).toFixed(1)}%)

### 리콜 환자 상세 데이터:
${JSON.stringify(data.recallPatients, null, 2)}`);
  }

  // 리콜 연락 기록
  if (data.recallContactLogs && data.recallContactLogs.length > 0) {
    const resultCount = data.recallContactLogs.reduce(
      (acc, l) => {
        acc[l.result] = (acc[l.result] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
    summaryParts.push(`## 리콜 연락 기록 (${data.recallContactLogs.length}건)
- 연락 결과별 분포: ${JSON.stringify(resultCount)}

### 연락 상세 데이터:
${JSON.stringify(data.recallContactLogs, null, 2)}`);
  }

  // 특이사항 히스토리
  if (data.specialNotesHistory && data.specialNotesHistory.length > 0) {
    summaryParts.push(`## 특이사항 히스토리 (${data.specialNotesHistory.length}건)

### 특이사항 상세 데이터:
${JSON.stringify(data.specialNotesHistory, null, 2)}`);
  }

  // 직원 정보
  if (data.users && data.users.length > 0) {
    const roleCount = data.users.reduce(
      (acc, u) => {
        acc[u.role] = (acc[u.role] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
    summaryParts.push(`## 직원 현황 (${data.users.length}명)
- 역할별 분포: ${JSON.stringify(roleCount)}

### 직원 상세 데이터:
${JSON.stringify(data.users, null, 2)}`);
  }

  // 공지사항
  if (data.announcements && data.announcements.length > 0) {
    const pinnedCount = data.announcements.filter((a) => a.is_pinned).length;
    summaryParts.push(`## 공지사항 (${data.announcements.length}건)
- 상단 고정 공지: ${pinnedCount}건

### 공지사항 상세 데이터:
${JSON.stringify(data.announcements, null, 2)}`);
  }

  // 업무 할당
  if (data.tasks && data.tasks.length > 0) {
    const statusCount = data.tasks.reduce(
      (acc, t) => {
        const key = t.status || 'unknown';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
    const priorityCount = data.tasks.reduce(
      (acc, t) => {
        const key = t.priority || 'none';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
    summaryParts.push(`## 업무 할당 현황 (${data.tasks.length}건)
- 상태별 분포: ${JSON.stringify(statusCount)}
- 우선순위별 분포: ${JSON.stringify(priorityCount)}

### 업무 상세 데이터:
${JSON.stringify(data.tasks, null, 2)}`);
  }

  // 업체 연락처
  if (data.vendorContacts && data.vendorContacts.length > 0) {
    const categoryCount = data.vendorContacts.reduce(
      (acc, v) => {
        const key = v.category || 'uncategorized';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
    summaryParts.push(`## 업체 연락처 (${data.vendorContacts.length}개)
- 카테고리별 분포: ${JSON.stringify(categoryCount)}

### 업체 상세 데이터:
${JSON.stringify(data.vendorContacts, null, 2)}`);
  }

  // 프로토콜
  if (data.protocols && data.protocols.length > 0) {
    const publishedCount = data.protocols.filter((p) => p.is_published).length;
    const categoryCount = data.protocols.reduce(
      (acc, p) => {
        const key = p.category || 'uncategorized';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
    summaryParts.push(`## 진료 프로토콜 (${data.protocols.length}개)
- 공개된 프로토콜: ${publishedCount}개
- 카테고리별 분포: ${JSON.stringify(categoryCount)}

### 프로토콜 상세 데이터:
${JSON.stringify(data.protocols, null, 2)}`);
  }

  // 근로계약서
  if (data.contracts && data.contracts.length > 0) {
    const statusCount = data.contracts.reduce(
      (acc, c) => {
        acc[c.status] = (acc[c.status] || 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
    summaryParts.push(`## 근로계약서 현황 (${data.contracts.length}건)
- 상태별 분포: ${JSON.stringify(statusCount)}

### 계약 상세 데이터:
${JSON.stringify(data.contracts, null, 2)}`);
  }

  // 연차 잔액
  if (data.leaveBalances && data.leaveBalances.length > 0) {
    const totalRemaining = data.leaveBalances.reduce((sum, b) => sum + (b.remaining_days || 0), 0);
    const avgRemaining = totalRemaining / data.leaveBalances.length;
    summaryParts.push(`## 직원 연차 잔액 현황 (${data.leaveBalances.length}명)
- 총 잔여 연차: ${totalRemaining.toFixed(1)}일
- 평균 잔여 연차: ${avgRemaining.toFixed(1)}일

### 연차 잔액 상세 데이터:
${JSON.stringify(data.leaveBalances, null, 2)}`);
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
