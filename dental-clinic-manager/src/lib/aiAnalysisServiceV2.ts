import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { GoogleGenAI, Type } from '@google/genai';
import type { Schema } from '@google/genai';
import type {
  AIAnalysisRequest,
  AIAnalysisResponse,
  FileAttachment,
} from '@/types/aiAnalysis';
import { buildFileContext } from '@/lib/fileParsingUtils';

// 데이터베이스 스키마 정의 (AI가 이해할 수 있는 형태) - 실제 DB 마이그레이션과 일치
const DATABASE_SCHEMA = {
  tables: {
    daily_reports: {
      description: '일일 보고서 - 매일의 리콜, 상담, 리뷰 현황을 기록',
      columns: {
        id: 'SERIAL (PK)',
        clinic_id: 'UUID (클리닉 ID)',
        date: 'DATE (보고서 날짜)',
        recall_count: 'INTEGER (리콜 환자 수)',
        recall_booking_count: 'INTEGER (리콜 예약 완료 수)',
        consult_proceed: 'INTEGER (상담 진행 수)',
        consult_hold: 'INTEGER (상담 보류 수)',
        naver_review_count: 'INTEGER (네이버 리뷰 수)',
        created_by: 'UUID (작성자 ID)',
        updated_by: 'UUID (수정자 ID)',
        created_at: 'TIMESTAMP',
        updated_at: 'TIMESTAMP',
      },
      dateColumn: 'date',
    },
    consult_logs: {
      description: '상담 기록 - 개별 환자 상담 내역',
      columns: {
        id: 'SERIAL (PK)',
        clinic_id: 'UUID (클리닉 ID)',
        date: 'DATE (상담 날짜)',
        patient_name: 'VARCHAR(100) (환자 이름)',
        consult_content: 'TEXT (상담 내용)',
        consult_status: 'VARCHAR(1) (상담 상태: O=진행, X=보류)',
        hold_reason: 'TEXT (보류 사유)',
        created_at: 'TIMESTAMP',
      },
      dateColumn: 'date',
    },
    gift_logs: {
      description: '선물 증정 기록 - 환자에게 제공한 선물 내역',
      columns: {
        id: 'SERIAL (PK)',
        clinic_id: 'UUID (클리닉 ID)',
        date: 'DATE (증정 날짜)',
        patient_name: 'VARCHAR(100) (환자 이름)',
        gift_type: 'VARCHAR(100) (선물 종류)',
        quantity: 'INTEGER (수량, 기본값 1)',
        naver_review: 'VARCHAR(1) (네이버 리뷰 작성 여부: O/X)',
        notes: 'TEXT (비고)',
        created_at: 'TIMESTAMP',
      },
      dateColumn: 'date',
    },
    happy_call_logs: {
      description: '해피콜 기록 - 치료 후 환자 만족도 확인 전화',
      columns: {
        id: 'BIGINT (PK)',
        clinic_id: 'UUID (클리닉 ID)',
        date: 'TEXT (전화 날짜, YYYY-MM-DD 형식 문자열)',
        patient_name: 'TEXT (환자 이름)',
        treatment: 'TEXT (치료 내용)',
        notes: 'TEXT (통화 내용/메모)',
      },
      dateColumn: 'date',
    },
    cash_register_logs: {
      description: '현금 출납 기록 - 일일 현금 잔액 관리 (화폐별 개수 포함)',
      columns: {
        id: 'SERIAL (PK)',
        clinic_id: 'UUID (클리닉 ID)',
        date: 'DATE (기록 날짜)',
        previous_balance: 'BIGINT (전일 이월액)',
        current_balance: 'BIGINT (금일 잔액)',
        balance_difference: 'BIGINT (차액)',
        notes: 'TEXT (비고)',
        prev_bill_50000: 'INTEGER (전일 5만원권 개수)',
        prev_bill_10000: 'INTEGER (전일 1만원권 개수)',
        curr_bill_50000: 'INTEGER (금일 5만원권 개수)',
        curr_bill_10000: 'INTEGER (금일 1만원권 개수)',
        created_at: 'TIMESTAMP',
        updated_at: 'TIMESTAMP',
      },
      dateColumn: 'date',
    },
    attendance_records: {
      description: '출퇴근 기록 - 직원 근태 관리 (지각, 조퇴, 초과근무 포함)',
      columns: {
        id: 'UUID (PK)',
        user_id: 'UUID (직원 ID, users 테이블 참조)',
        clinic_id: 'UUID (클리닉 ID)',
        work_date: 'DATE (근무 날짜)',
        check_in_time: 'TIMESTAMP (출근 시간)',
        check_out_time: 'TIMESTAMP (퇴근 시간)',
        scheduled_start: 'TIME (예정 출근 시간)',
        scheduled_end: 'TIME (예정 퇴근 시간)',
        late_minutes: 'INTEGER (지각 시간, 분 단위, 기본값 0)',
        early_leave_minutes: 'INTEGER (조퇴 시간, 분 단위, 기본값 0)',
        overtime_minutes: 'INTEGER (초과근무 시간, 분 단위, 기본값 0)',
        total_work_minutes: 'INTEGER (총 근무 시간, 분 단위)',
        status: "VARCHAR(20) (근태 상태: present=정상출근, late=지각, early_leave=조퇴, absent=결근, leave=연차, holiday=공휴일)",
        notes: 'TEXT (특이사항)',
        is_manually_edited: 'BOOLEAN (수동 수정 여부)',
        created_at: 'TIMESTAMP',
        updated_at: 'TIMESTAMP',
      },
      dateColumn: 'work_date',
      joins: ['users(id, name, role, position)'],
    },
    leave_requests: {
      description: '연차/휴가 신청 기록',
      columns: {
        id: 'UUID (PK)',
        user_id: 'UUID (신청 직원 ID)',
        clinic_id: 'UUID (클리닉 ID)',
        leave_type_id: 'UUID (휴가 유형 ID, leave_types 테이블 참조)',
        start_date: 'DATE (시작일)',
        end_date: 'DATE (종료일)',
        half_day_type: 'VARCHAR(10) (반차 유형: AM, PM, NULL)',
        total_days: 'DECIMAL(3,1) (신청 일수)',
        reason: 'TEXT (사유)',
        status: "VARCHAR(20) (승인 상태: pending, approved, rejected, cancelled, withdrawn)",
        submitted_at: 'TIMESTAMP (제출 시간)',
        created_at: 'TIMESTAMP',
      },
      dateColumn: 'start_date',
      joins: ['users(id, name, role)'],
    },
    users: {
      description: '직원 정보',
      columns: {
        id: 'UUID (PK)',
        clinic_id: 'UUID (클리닉 ID)',
        name: 'VARCHAR(100) (이름)',
        email: 'VARCHAR(255) (이메일)',
        role: "VARCHAR(50) (역할: master_admin=최고관리자, owner=대표원장, vice_director=부원장, manager=실장, team_leader=팀장, staff=일반직원)",
        phone: 'VARCHAR(20) (연락처)',
        status: "VARCHAR(20) (상태: pending=대기, active=활성, suspended=정지, rejected=거부, resigned=퇴사)",
        hire_date: 'DATE (입사일)',
        created_at: 'TIMESTAMP',
        updated_at: 'TIMESTAMP',
      },
      dateColumn: null,
    },
    gift_inventory: {
      description: '선물 재고 현황',
      columns: {
        id: 'SERIAL (PK)',
        clinic_id: 'UUID (클리닉 ID)',
        name: 'VARCHAR(100) (선물 이름)',
        stock: 'INTEGER (현재 재고 수량, 기본값 0)',
        category_id: 'INTEGER (카테고리 ID)',
        created_at: 'TIMESTAMP',
        updated_at: 'TIMESTAMP',
      },
      dateColumn: null,
    },
    inventory_logs: {
      description: '재고 입출고 기록',
      columns: {
        id: 'SERIAL (PK)',
        clinic_id: 'UUID (클리닉 ID)',
        name: 'VARCHAR(100) (품목명)',
        reason: 'TEXT (입출고 사유)',
        change: 'INTEGER (변동 수량, 양수=입고, 음수=출고)',
        old_stock: 'INTEGER (이전 재고)',
        new_stock: 'INTEGER (변경 후 재고)',
        performed_by: 'UUID (처리자 ID)',
        timestamp: 'TIMESTAMP (기록 시간)',
        created_at: 'TIMESTAMP',
      },
      dateColumn: 'timestamp',
    },
    recall_campaigns: {
      description: '리콜 캠페인 - 리콜 환자 관리 캠페인',
      columns: {
        id: 'UUID (PK)',
        clinic_id: 'UUID (클리닉 ID)',
        name: 'VARCHAR(200) (캠페인 이름)',
        description: 'TEXT (캠페인 설명)',
        original_filename: 'VARCHAR(255) (업로드 파일명)',
        total_patients: 'INTEGER (총 환자 수)',
        sms_sent_count: 'INTEGER (문자 발송 수)',
        call_attempted_count: 'INTEGER (전화 시도 수)',
        appointment_count: 'INTEGER (예약 완료 수)',
        status: "VARCHAR(20) (상태: active, completed, cancelled)",
        created_by: 'UUID (생성자 ID)',
        created_at: 'TIMESTAMP',
        updated_at: 'TIMESTAMP',
      },
      dateColumn: 'created_at',
    },
    recall_patients: {
      description: '리콜 환자 목록 - 개별 환자 리콜 현황',
      columns: {
        id: 'UUID (PK)',
        clinic_id: 'UUID (클리닉 ID)',
        campaign_id: 'UUID (캠페인 ID)',
        patient_name: 'VARCHAR(100) (환자 이름)',
        phone_number: 'VARCHAR(20) (연락처)',
        chart_number: 'VARCHAR(50) (차트 번호)',
        birth_date: 'DATE (생년월일)',
        last_visit_date: 'DATE (마지막 방문일)',
        treatment_type: 'VARCHAR(100) (치료 유형)',
        notes: 'TEXT (메모)',
        status: "patient_recall_status (상태: pending, contacted, booked, completed, cancelled 등)",
        appointment_date: 'DATE (예약 날짜)',
        appointment_time: 'TIME (예약 시간)',
        last_contact_date: 'TIMESTAMP (마지막 연락일)',
        contact_count: 'INTEGER (연락 시도 횟수)',
        created_at: 'TIMESTAMP',
        updated_at: 'TIMESTAMP',
      },
      dateColumn: 'appointment_date',
    },
    recall_contact_logs: {
      description: '리콜 연락 기록 - 환자 연락 시도 이력',
      columns: {
        id: 'UUID (PK)',
        clinic_id: 'UUID (클리닉 ID)',
        patient_id: 'UUID (환자 ID)',
        campaign_id: 'UUID (캠페인 ID)',
        contact_type: "contact_type (연락 유형: phone, sms)",
        contact_date: 'TIMESTAMP (연락 시간)',
        sms_content: 'TEXT (문자 내용)',
        call_duration: 'INTEGER (통화 시간, 초)',
        call_result: 'VARCHAR(50) (통화 결과)',
        result_status: 'patient_recall_status (결과 상태)',
        result_notes: 'TEXT (결과 메모)',
        contacted_by: 'UUID (연락자 ID)',
        contacted_by_name: 'VARCHAR(100) (연락자 이름)',
        created_at: 'TIMESTAMP',
      },
      dateColumn: 'contact_date',
    },
    announcements: {
      description: '공지사항 게시판',
      columns: {
        id: 'UUID (PK)',
        clinic_id: 'UUID (클리닉 ID)',
        author_id: 'UUID (작성자 ID)',
        title: 'TEXT (제목)',
        content: 'TEXT (내용)',
        category: "TEXT (카테고리: schedule, holiday, policy, welfare, general)",
        is_pinned: 'BOOLEAN (상단 고정 여부)',
        is_important: 'BOOLEAN (중요 공지 여부)',
        start_date: 'DATE (게시 시작일)',
        end_date: 'DATE (게시 종료일)',
        view_count: 'INTEGER (조회수)',
        created_at: 'TIMESTAMP (작성일)',
        updated_at: 'TIMESTAMP',
      },
      dateColumn: 'created_at',
    },
    tasks: {
      description: '업무 할당 게시판',
      columns: {
        id: 'UUID (PK)',
        clinic_id: 'UUID (클리닉 ID)',
        title: 'TEXT (업무 제목)',
        description: 'TEXT (업무 설명)',
        status: "TEXT (상태: pending, in_progress, completed, on_hold, cancelled)",
        priority: "TEXT (우선순위: low, medium, high, urgent)",
        assignee_id: 'UUID (담당자 ID)',
        assigner_id: 'UUID (할당자 ID)',
        due_date: 'DATE (마감일)',
        progress: 'INTEGER (진행률 0-100)',
        completed_at: 'TIMESTAMP (완료 시간)',
        created_at: 'TIMESTAMP',
        updated_at: 'TIMESTAMP',
      },
      dateColumn: 'due_date',
    },
    protocols: {
      description: '진료 프로토콜',
      columns: {
        id: 'UUID (PK)',
        clinic_id: 'UUID (클리닉 ID)',
        title: 'VARCHAR(500) (프로토콜 제목)',
        category_id: 'UUID (카테고리 ID, protocol_categories 참조)',
        status: "VARCHAR(20) (상태: draft, active, archived)",
        tags: 'TEXT[] (태그 배열)',
        created_by: 'UUID (작성자 ID)',
        created_at: 'TIMESTAMP',
        updated_at: 'TIMESTAMP',
      },
      dateColumn: 'created_at',
    },
    employment_contracts: {
      description: '근로계약서',
      columns: {
        id: 'UUID (PK)',
        clinic_id: 'UUID (클리닉 ID)',
        template_id: 'UUID (템플릿 ID)',
        employee_user_id: 'UUID (직원 ID)',
        employer_user_id: 'UUID (고용주 ID)',
        contract_data: 'JSONB (계약 데이터 - 시작일, 종료일, 급여 등 포함)',
        status: "VARCHAR(20) (상태: draft, pending_employee_signature, pending_employer_signature, completed, cancelled)",
        version: 'INTEGER (버전)',
        notes: 'TEXT (메모)',
        created_by: 'UUID (작성자 ID)',
        created_at: 'TIMESTAMP',
        updated_at: 'TIMESTAMP',
        completed_at: 'TIMESTAMP (완료일)',
      },
      dateColumn: 'created_at',
      joins: ['users!employee_user_id(id, name)'],
    },
    employee_leave_balances: {
      description: '직원 연차 잔액',
      columns: {
        id: 'UUID (PK)',
        clinic_id: 'UUID (클리닉 ID)',
        user_id: 'UUID (직원 ID)',
        year: 'INTEGER (연도, 2000-2100)',
        total_days: 'DECIMAL(4,1) (총 연차 일수)',
        used_days: 'DECIMAL(4,1) (사용 연차 일수)',
        pending_days: 'DECIMAL(4,1) (대기 연차 일수)',
        remaining_days: 'DECIMAL(4,1) (잔여 연차 일수)',
        carryover_days: 'DECIMAL(4,1) (이월 연차)',
        years_of_service: 'DECIMAL(4,1) (근속 연수)',
        hire_date: 'DATE (입사일)',
        last_calculated_at: 'TIMESTAMP (마지막 계산 시간)',
        created_at: 'TIMESTAMP',
        updated_at: 'TIMESTAMP',
      },
      dateColumn: null,
      joins: ['users(id, name)'],
    },
    special_notes_history: {
      description: '특이사항 히스토리 - 일일 보고서 특이사항 변경 이력',
      columns: {
        id: 'UUID (PK)',
        clinic_id: 'UUID (클리닉 ID)',
        report_date: 'DATE (보고서 날짜, 특이사항이 속한 날짜)',
        content: 'TEXT (특이사항 내용)',
        author_id: 'UUID (작성자 ID)',
        author_name: 'VARCHAR(100) (작성자 이름)',
        is_past_date_edit: 'BOOLEAN (과거 날짜 수정 여부)',
        edited_at: 'TIMESTAMP (실제 수정/작성 시점)',
        created_at: 'TIMESTAMP (생성 시간)',
      },
      dateColumn: 'report_date',
    },
  },
};

// Gemini Function Declarations
const getSchemaParams: Schema = {
  type: Type.OBJECT,
  properties: {
    table_name: {
      type: Type.STRING,
      description: '특정 테이블의 스키마만 조회하려면 테이블 이름을 입력하세요. 비워두면 전체 스키마를 반환합니다.',
    },
  },
};

const queryTableParams: Schema = {
  type: Type.OBJECT,
  properties: {
    table_name: {
      type: Type.STRING,
      description: '조회할 테이블 이름',
    },
    select_columns: {
      type: Type.STRING,
      description: '조회할 컬럼들 (쉼표로 구분). 예: "id, name, date". 조인이 필요하면 "*, users(name, role)" 형태로 작성. 비워두면 모든 컬럼 조회.',
    },
    filters: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          column: { type: Type.STRING, description: '필터링할 컬럼명' },
          operator: {
            type: Type.STRING,
            description: '비교 연산자: eq(같음), neq(다름), gt(초과), gte(이상), lt(미만), lte(이하), like(포함), ilike(대소문자 무시 포함)',
          },
          value: { type: Type.STRING, description: '비교할 값' },
        },
        required: ['column', 'operator', 'value'],
      },
      description: '필터 조건 배열',
    },
    date_range: {
      type: Type.OBJECT,
      properties: {
        start_date: { type: Type.STRING, description: '시작 날짜 (YYYY-MM-DD 형식)' },
        end_date: { type: Type.STRING, description: '종료 날짜 (YYYY-MM-DD 형식)' },
      },
      description: '날짜 범위 필터 (테이블의 날짜 컬럼에 자동 적용)',
    },
    order_by: {
      type: Type.OBJECT,
      properties: {
        column: { type: Type.STRING, description: '정렬할 컬럼명' },
        ascending: { type: Type.BOOLEAN, description: '오름차순 여부 (기본: true)' },
      },
      description: '정렬 조건',
    },
    limit: {
      type: Type.NUMBER,
      description: '조회할 최대 행 수 (기본: 100)',
    },
  },
  required: ['table_name'],
};

const aggregateDataParams: Schema = {
  type: Type.OBJECT,
  properties: {
    table_name: {
      type: Type.STRING,
      description: '집계할 테이블 이름',
    },
    aggregations: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          column: { type: Type.STRING, description: '집계할 컬럼명' },
          function: {
            type: Type.STRING,
            description: '집계 함수: sum, avg, count, min, max',
          },
          alias: { type: Type.STRING, description: '결과 별칭 (선택)' },
        },
        required: ['column', 'function'],
      },
      description: '집계 함수 배열',
    },
    group_by: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: '그룹화할 컬럼 배열',
    },
    filters: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          column: { type: Type.STRING },
          operator: { type: Type.STRING },
          value: { type: Type.STRING },
        },
      },
      description: '필터 조건',
    },
    date_range: {
      type: Type.OBJECT,
      properties: {
        start_date: { type: Type.STRING },
        end_date: { type: Type.STRING },
      },
      description: '날짜 범위 필터',
    },
  },
  required: ['table_name', 'aggregations'],
};

const geminiTools = [
  {
    functionDeclarations: [
      {
        name: 'get_database_schema',
        description: '데이터베이스의 전체 스키마 정보를 조회합니다. 어떤 테이블이 있고 각 테이블에 어떤 컬럼이 있는지 확인할 수 있습니다.',
        parameters: getSchemaParams,
      },
      {
        name: 'query_table',
        description: '특정 테이블에서 데이터를 조회합니다. 필터 조건과 정렬을 지정할 수 있습니다.',
        parameters: queryTableParams,
      },
      {
        name: 'aggregate_data',
        description: '테이블 데이터를 집계합니다 (합계, 평균, 개수 등).',
        parameters: aggregateDataParams,
      },
    ],
  },
];

// 스키마 조회 함수
function getDatabaseSchema(tableName?: string): string {
  if (tableName && DATABASE_SCHEMA.tables[tableName as keyof typeof DATABASE_SCHEMA.tables]) {
    const table = DATABASE_SCHEMA.tables[tableName as keyof typeof DATABASE_SCHEMA.tables];
    return JSON.stringify({ [tableName]: table }, null, 2);
  }

  // 전체 스키마 요약
  const summary = Object.entries(DATABASE_SCHEMA.tables).map(([name, info]) => ({
    table: name,
    description: info.description,
    columns: Object.keys(info.columns),
    dateColumn: info.dateColumn,
  }));

  return JSON.stringify(summary, null, 2);
}

// 테이블 쿼리 함수
async function queryTable(
  supabase: SupabaseClient,
  clinicId: string,
  params: {
    table_name: string;
    select_columns?: string;
    filters?: Array<{ column: string; operator: string; value: string }>;
    date_range?: { start_date: string; end_date: string };
    order_by?: { column: string; ascending?: boolean };
    limit?: number;
  }
): Promise<string> {
  const { table_name, select_columns, filters, date_range, order_by, limit = 100 } = params;

  const tableSchema = DATABASE_SCHEMA.tables[table_name as keyof typeof DATABASE_SCHEMA.tables];
  if (!tableSchema) {
    return JSON.stringify({ error: `테이블 "${table_name}"을(를) 찾을 수 없습니다.` });
  }

  try {
    let query = supabase
      .from(table_name)
      .select(select_columns || '*')
      .eq('clinic_id', clinicId);

    // 날짜 범위 필터 적용
    if (date_range && tableSchema.dateColumn) {
      const dateCol = tableSchema.dateColumn;
      if (date_range.start_date) {
        if (dateCol === 'timestamp' || dateCol === 'created_at') {
          query = query.gte(dateCol, `${date_range.start_date}T00:00:00`);
        } else {
          query = query.gte(dateCol, date_range.start_date);
        }
      }
      if (date_range.end_date) {
        if (dateCol === 'timestamp' || dateCol === 'created_at') {
          query = query.lte(dateCol, `${date_range.end_date}T23:59:59`);
        } else {
          query = query.lte(dateCol, date_range.end_date);
        }
      }
    }

    // 추가 필터 적용
    if (filters) {
      for (const filter of filters) {
        const { column, operator, value } = filter;
        switch (operator) {
          case 'eq':
            query = query.eq(column, value);
            break;
          case 'neq':
            query = query.neq(column, value);
            break;
          case 'gt':
            query = query.gt(column, value);
            break;
          case 'gte':
            query = query.gte(column, value);
            break;
          case 'lt':
            query = query.lt(column, value);
            break;
          case 'lte':
            query = query.lte(column, value);
            break;
          case 'like':
            query = query.like(column, `%${value}%`);
            break;
          case 'ilike':
            query = query.ilike(column, `%${value}%`);
            break;
        }
      }
    }

    // 정렬 적용
    if (order_by) {
      query = query.order(order_by.column, { ascending: order_by.ascending ?? true });
    } else if (tableSchema.dateColumn) {
      query = query.order(tableSchema.dateColumn, { ascending: false });
    }

    // 제한 적용
    query = query.limit(limit);

    const { data, error } = await query;

    if (error) {
      return JSON.stringify({ error: error.message, hint: error.hint });
    }

    return JSON.stringify({
      table: table_name,
      count: data?.length || 0,
      data: data,
    }, null, 2);
  } catch (error) {
    return JSON.stringify({ error: String(error) });
  }
}

// 집계 함수 (RPC 사용 또는 클라이언트 측 집계)
async function aggregateData(
  supabase: SupabaseClient,
  clinicId: string,
  params: {
    table_name: string;
    aggregations: Array<{ column: string; function: string; alias?: string }>;
    group_by?: string[];
    filters?: Array<{ column: string; operator: string; value: string }>;
    date_range?: { start_date: string; end_date: string };
  }
): Promise<string> {
  const { table_name, aggregations, group_by, filters, date_range } = params;

  const tableSchema = DATABASE_SCHEMA.tables[table_name as keyof typeof DATABASE_SCHEMA.tables];
  if (!tableSchema) {
    return JSON.stringify({ error: `테이블 "${table_name}"을(를) 찾을 수 없습니다.` });
  }

  try {
    // 먼저 데이터를 조회한 후 클라이언트에서 집계
    let query = supabase
      .from(table_name)
      .select('*')
      .eq('clinic_id', clinicId);

    // 날짜 범위 필터
    if (date_range && tableSchema.dateColumn) {
      const dateCol = tableSchema.dateColumn;
      if (date_range.start_date) {
        query = query.gte(dateCol, date_range.start_date);
      }
      if (date_range.end_date) {
        query = query.lte(dateCol, date_range.end_date);
      }
    }

    // 필터 적용
    if (filters) {
      for (const filter of filters) {
        switch (filter.operator) {
          case 'eq':
            query = query.eq(filter.column, filter.value);
            break;
          case 'neq':
            query = query.neq(filter.column, filter.value);
            break;
          case 'gt':
            query = query.gt(filter.column, filter.value);
            break;
          case 'gte':
            query = query.gte(filter.column, filter.value);
            break;
          case 'lt':
            query = query.lt(filter.column, filter.value);
            break;
          case 'lte':
            query = query.lte(filter.column, filter.value);
            break;
        }
      }
    }

    const { data, error } = await query;

    if (error) {
      return JSON.stringify({ error: error.message });
    }

    if (!data || data.length === 0) {
      return JSON.stringify({
        table: table_name,
        count: 0,
        message: '조건에 맞는 데이터가 없습니다.',
        aggregations: aggregations.map(a => ({
          ...a,
          result: a.function === 'count' ? 0 : null,
        })),
      });
    }

    // 클라이언트 측 집계
    const results: Record<string, unknown>[] = [];

    if (group_by && group_by.length > 0) {
      // 그룹별 집계
      const groups = new Map<string, typeof data>();

      for (const row of data) {
        const key = group_by.map(col => row[col]).join('|');
        if (!groups.has(key)) {
          groups.set(key, []);
        }
        groups.get(key)!.push(row);
      }

      for (const [key, groupData] of groups) {
        const result: Record<string, unknown> = {};

        // 그룹 키 값 추가
        const keyValues = key.split('|');
        group_by.forEach((col, i) => {
          result[col] = keyValues[i];
        });

        // 집계 계산
        for (const agg of aggregations) {
          const values = groupData.map(r => Number(r[agg.column]) || 0);
          const alias = agg.alias || `${agg.function}_${agg.column}`;

          switch (agg.function) {
            case 'sum':
              result[alias] = values.reduce((a, b) => a + b, 0);
              break;
            case 'avg':
              result[alias] = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
              break;
            case 'count':
              result[alias] = groupData.length;
              break;
            case 'min':
              result[alias] = Math.min(...values);
              break;
            case 'max':
              result[alias] = Math.max(...values);
              break;
          }
        }

        results.push(result);
      }
    } else {
      // 전체 집계
      const result: Record<string, unknown> = {};

      for (const agg of aggregations) {
        const values = data.map(r => Number(r[agg.column]) || 0);
        const alias = agg.alias || `${agg.function}_${agg.column}`;

        switch (agg.function) {
          case 'sum':
            result[alias] = values.reduce((a, b) => a + b, 0);
            break;
          case 'avg':
            result[alias] = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
            break;
          case 'count':
            result[alias] = data.length;
            break;
          case 'min':
            result[alias] = Math.min(...values);
            break;
          case 'max':
            result[alias] = Math.max(...values);
            break;
        }
      }

      results.push(result);
    }

    return JSON.stringify({
      table: table_name,
      total_rows: data.length,
      aggregations: results,
    }, null, 2);
  } catch (error) {
    return JSON.stringify({ error: String(error) });
  }
}

// 시스템 프롬프트 생성
function generateSystemPrompt(): string {
  const tableList = Object.entries(DATABASE_SCHEMA.tables)
    .map(([name, info]) => `- ${name}: ${info.description}`)
    .join('\n');

  return `당신은 치과 병원 데이터 분석 전문가 AI입니다. 사용자의 질문을 분석하고, 필요한 데이터를 데이터베이스에서 조회하여 정확한 답변을 제공합니다.

## 역할
- 치과 병원의 운영 데이터를 분석하여 의미 있는 인사이트 도출
- 사용자 질문을 이해하고 적절한 테이블에서 데이터 조회
- 조회된 데이터를 기반으로 정확한 분석 결과 제공

## 사용 가능한 테이블
${tableList}

## 테이블 관계 (중요!)
- attendance_records.user_id → users.id (출퇴근 기록의 직원 정보)
- leave_requests.user_id → users.id (휴가 신청의 직원 정보)
- employee_leave_balances.user_id → users.id (연차 잔액의 직원 정보)
- employment_contracts.employee_user_id → users.id (근로계약서의 직원 정보)

## 분석 절차
1. 사용자 질문 분석 - 무엇을 알고 싶어하는지 파악
2. 필요한 테이블과 컬럼 결정
3. **특정 직원(원장, 실장 등)의 데이터가 필요하면 반드시 users 테이블에서 해당 직원의 id를 먼저 조회**
4. 조회한 user_id를 사용하여 다른 테이블(attendance_records 등) 조회
5. 조회 결과를 분석하여 명확한 답변 제공

## 중요 사항 (반드시 준수!)
- 항상 실제 데이터를 조회하여 답변하세요. 추측하지 마세요.
- **user_id를 추측하지 마세요! "1"이나 임의의 값을 사용하지 말고, 반드시 users 테이블에서 먼저 조회하세요.**
- 날짜 관련 질문은 date_range 파라미터를 활용하세요.
- "원장"은 users 테이블에서 role='owner'인 사용자입니다. 먼저 users 테이블 조회 필요!
- "실장"은 users 테이블에서 role='manager'인 사용자입니다. 먼저 users 테이블 조회 필요!
- "부원장"은 users 테이블에서 role='vice_director'인 사용자입니다.
- 지각 데이터는 attendance_records 테이블의 late_minutes 컬럼을 확인하세요.
- 데이터가 없으면 "해당 기간에 데이터가 없습니다"라고 명확히 알려주세요.

## 직원별 데이터 조회 예시
원장의 출퇴근 기록을 조회하려면:
1. 먼저 users 테이블에서 role='owner'인 사용자 조회: query_table(users, filters: [{column: "role", operator: "eq", value: "owner"}])
2. 조회된 user의 id (예: "abc-123-...")를 사용하여 attendance_records 조회: query_table(attendance_records, filters: [{column: "user_id", operator: "eq", value: "abc-123-..."}])

## 응답 형식
- 한국어로 응답합니다.
- 수치 데이터는 명확하게 표시합니다.
- 분석 결과와 함께 의미있는 인사이트를 제공합니다.

## 첨부 파일 분석 기능
사용자가 Excel, CSV, PDF, TXT 파일을 첨부하면 해당 파일의 내용이 [ATTACHED_FILE: 파일명] 형식으로 제공됩니다.
- 테이블 데이터 (Excel, CSV): 컬럼명, 샘플 데이터(최대 10행), 전체 행 수가 제공됩니다.
- 텍스트 데이터 (PDF, TXT): 텍스트 내용 미리보기(최대 5,000자)가 제공됩니다.

### 첨부 파일 분석 시 주의사항
- 첨부 파일 데이터와 Supabase의 기존 데이터를 함께 분석할 수 있습니다.
- 예: "첨부한 환자 목록과 DB의 리콜 환자를 비교해줘" - 첨부 파일의 환자명/연락처와 recall_patients 테이블을 비교
- 파일 데이터가 제공된 경우, 해당 데이터를 기반으로 요약, 통계 분석, 인사이트 도출을 수행할 수 있습니다.
- 파일에 민감한 정보가 있을 수 있으므로 개인정보 보호에 주의하세요.`;
}

// 도구 호출 처리
async function processToolCall(
  supabase: SupabaseClient,
  clinicId: string,
  name: string,
  args: Record<string, unknown>
): Promise<string> {
  console.log(`[AI Analysis] Tool call: ${name}`, args);

  switch (name) {
    case 'get_database_schema':
      return getDatabaseSchema(args.table_name as string | undefined);

    case 'query_table':
      return await queryTable(supabase, clinicId, args as Parameters<typeof queryTable>[2]);

    case 'aggregate_data':
      return await aggregateData(supabase, clinicId, args as Parameters<typeof aggregateData>[2]);

    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}

// 메인 분석 함수 (V2 - Agentic with Gemini)
export async function performAnalysisV2(
  request: AIAnalysisRequest,
  supabaseUrl: string,
  supabaseKey: string,
  geminiApiKey: string,
  clinicId: string
): Promise<AIAnalysisResponse> {
  const supabase = createClient(supabaseUrl, supabaseKey);
  const genAI = new GoogleGenAI({ apiKey: geminiApiKey });

  const systemPrompt = generateSystemPrompt();

  // 대화 내역 구성
  const contents: Array<{ role: 'user' | 'model'; parts: Array<{ text: string }> }> = [];

  // 이전 대화 내역 추가
  if (request.conversationHistory && request.conversationHistory.length > 0) {
    for (const msg of request.conversationHistory) {
      if (msg.role === 'user') {
        contents.push({ role: 'user', parts: [{ text: msg.content }] });
      } else if (msg.role === 'assistant') {
        contents.push({ role: 'model', parts: [{ text: msg.content }] });
      }
    }
  }

  // 현재 사용자 메시지 추가
  let userMessage = request.message;
  if (request.dateRange) {
    userMessage += `\n\n(참고: 분석 기간 ${request.dateRange.startDate} ~ ${request.dateRange.endDate})`;
  }

  // 첨부 파일 컨텍스트 추가
  if (request.attachedFiles && request.attachedFiles.length > 0) {
    const fileContext = buildFileContext(request.attachedFiles);
    userMessage += `\n\n=== 첨부 파일 데이터 ===${fileContext}`;
  }

  contents.push({ role: 'user', parts: [{ text: userMessage }] });

  console.log(`[AI Analysis V2 Gemini] Starting analysis for clinic: ${clinicId}`);
  console.log(`[AI Analysis V2 Gemini] User message: ${request.message}`);

  try {
    // 최대 10번의 도구 호출 반복 (Gemini는 더 많은 반복이 필요할 수 있음)
    const maxIterations = 10;
    let iteration = 0;

    while (iteration < maxIterations) {
      iteration++;
      console.log(`[AI Analysis V2 Gemini] Iteration ${iteration}`);

      const response = await genAI.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: contents,
        config: {
          systemInstruction: systemPrompt,
          tools: geminiTools,
          temperature: 1.0, // Gemini 권장 온도
        },
      });

      const candidate = response.candidates?.[0];
      if (!candidate || !candidate.content) {
        console.log('[AI Analysis V2 Gemini] No candidate content');
        return {
          message: '분석을 완료할 수 없습니다.',
        };
      }

      const parts = candidate.content.parts || [];

      // Function call 확인
      const functionCalls = parts.filter(part => part.functionCall);

      if (functionCalls.length === 0) {
        // 텍스트 응답 반환
        const textParts = parts.filter(part => part.text);
        const finalText = textParts.map(p => p.text).join('\n');
        console.log('[AI Analysis V2 Gemini] Final response (no more function calls)');
        return {
          message: finalText || '분석을 완료할 수 없습니다.',
        };
      }

      // 모델 응답을 대화에 추가 (Gemini 3 Thought Signatures 보존을 위해 전체 content 추가)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      contents.push(candidate.content as any);

      // Function calls 처리 (Thought Signature 포함)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const functionResponseParts: any[] = [];

      for (const part of functionCalls) {
        if (part.functionCall) {
          const { name, args } = part.functionCall;
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const thoughtSignature = (part.functionCall as any).thoughtSignature;

          const result = await processToolCall(
            supabase,
            clinicId,
            name || '',
            (args || {}) as Record<string, unknown>
          );
          console.log(`[AI Analysis V2 Gemini] Tool result for ${name}:`, result.substring(0, 500));

          // Thought Signature를 포함한 function response 구성
          functionResponseParts.push({
            functionResponse: {
              name: name || '',
              response: JSON.parse(result),
              ...(thoughtSignature && { thoughtSignature }),
            },
          });
        }
      }

      // Function 응답을 대화에 추가
      contents.push({
        role: 'user',
        parts: functionResponseParts,
      });
    }

    // 최대 반복 도달 시 마지막 응답 반환
    const finalResponse = await genAI.models.generateContent({
      model: 'gemini-3-flash-preview',
      contents: contents,
      config: {
        systemInstruction: systemPrompt,
        temperature: 1.0,
      },
    });

    const finalText = finalResponse.candidates?.[0]?.content?.parts
      ?.filter(part => part.text)
      .map(p => p.text)
      .join('\n');

    return {
      message: finalText || '분석을 완료할 수 없습니다.',
    };

  } catch (error) {
    console.error('[AI Analysis V2 Gemini] Error:', error);
    return {
      message: '',
      error: error instanceof Error ? error.message : 'AI 분석 중 오류가 발생했습니다.',
    };
  }
}

// 날짜 범위 파싱 함수 (기존 코드 재사용)
export function parseDateRange(message: string): { startDate: string; endDate: string } | null {
  const patterns = [
    /(\d{2})년\s*(\d{1,2})월\s*(\d{1,2})일\s*부터\s*(\d{2})년\s*(\d{1,2})월\s*(\d{1,2})일/,
    /(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일\s*부터\s*(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일/,
    /(\d{4})-(\d{2})-(\d{2})\s*[~부터]\s*(\d{4})-(\d{2})-(\d{2})/,
    /최근\s*(\d+)\s*개월/,
    /지난\s*(\d+)\s*주/,
    /(\d{2,4})년\s*(\d{1,2})월/,
    /올해/,
    /이번\s*달/,
  ];

  const today = new Date();

  for (let i = 0; i < patterns.length; i++) {
    const match = message.match(patterns[i]);
    if (match) {
      if (i === 0) {
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
        return {
          startDate: `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`,
          endDate: `${match[4]}-${match[5].padStart(2, '0')}-${match[6].padStart(2, '0')}`,
        };
      } else if (i === 2) {
        return {
          startDate: `${match[1]}-${match[2]}-${match[3]}`,
          endDate: `${match[4]}-${match[5]}-${match[6]}`,
        };
      } else if (i === 3) {
        const months = parseInt(match[1]);
        const startDate = new Date(today);
        startDate.setMonth(startDate.getMonth() - months);
        return {
          startDate: startDate.toISOString().split('T')[0],
          endDate: today.toISOString().split('T')[0],
        };
      } else if (i === 4) {
        const weeks = parseInt(match[1]);
        const startDate = new Date(today);
        startDate.setDate(startDate.getDate() - weeks * 7);
        return {
          startDate: startDate.toISOString().split('T')[0],
          endDate: today.toISOString().split('T')[0],
        };
      } else if (i === 5) {
        // "26년 1월" 또는 "2026년 1월" 형식
        let year = parseInt(match[1]);
        if (year < 100) year = 2000 + year;
        const month = parseInt(match[2]);
        const startDate = new Date(year, month - 1, 1);
        const endDate = new Date(year, month, 0); // 해당 월의 마지막 날
        return {
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0],
        };
      } else if (i === 6) {
        return {
          startDate: `${today.getFullYear()}-01-01`,
          endDate: today.toISOString().split('T')[0],
        };
      } else if (i === 7) {
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
