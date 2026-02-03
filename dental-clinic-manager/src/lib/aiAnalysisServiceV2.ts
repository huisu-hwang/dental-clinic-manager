import { createClient, SupabaseClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import type {
  AIMessage,
  AIAnalysisRequest,
  AIAnalysisResponse,
} from '@/types/aiAnalysis';

// 데이터베이스 스키마 정의 (AI가 이해할 수 있는 형태)
const DATABASE_SCHEMA = {
  tables: {
    daily_reports: {
      description: '일일 보고서 - 매일의 리콜, 상담, 리뷰 현황을 기록',
      columns: {
        id: 'UUID (PK)',
        clinic_id: 'UUID (클리닉 ID)',
        date: 'DATE (보고서 날짜)',
        recall_count: 'INTEGER (리콜 환자 수)',
        recall_booking_count: 'INTEGER (리콜 예약 완료 수)',
        consult_proceed: 'INTEGER (상담 진행 수)',
        consult_hold: 'INTEGER (상담 보류 수)',
        naver_review_count: 'INTEGER (네이버 리뷰 수)',
        special_notes: 'TEXT (특이사항)',
        created_at: 'TIMESTAMP',
        updated_at: 'TIMESTAMP',
      },
      dateColumn: 'date',
    },
    consult_logs: {
      description: '상담 기록 - 개별 환자 상담 내역',
      columns: {
        id: 'UUID (PK)',
        clinic_id: 'UUID (클리닉 ID)',
        date: 'DATE (상담 날짜)',
        patient_name: 'TEXT (환자 이름)',
        consult_content: 'TEXT (상담 내용)',
        consult_status: 'TEXT (상담 상태: O=진행, X=보류)',
        remarks: 'TEXT (비고)',
        created_at: 'TIMESTAMP',
      },
      dateColumn: 'date',
    },
    gift_logs: {
      description: '선물 증정 기록 - 환자에게 제공한 선물 내역',
      columns: {
        id: 'UUID (PK)',
        clinic_id: 'UUID (클리닉 ID)',
        date: 'DATE (증정 날짜)',
        patient_name: 'TEXT (환자 이름)',
        gift_type: 'TEXT (선물 종류)',
        quantity: 'INTEGER (수량)',
        naver_review: 'TEXT (네이버 리뷰 작성 여부: O/X)',
        notes: 'TEXT (비고)',
        created_at: 'TIMESTAMP',
      },
      dateColumn: 'date',
    },
    happy_call_logs: {
      description: '해피콜 기록 - 치료 후 환자 만족도 확인 전화',
      columns: {
        id: 'UUID (PK)',
        clinic_id: 'UUID (클리닉 ID)',
        date: 'DATE (전화 날짜)',
        patient_name: 'TEXT (환자 이름)',
        treatment: 'TEXT (치료 내용)',
        notes: 'TEXT (통화 내용/메모)',
        created_at: 'TIMESTAMP',
      },
      dateColumn: 'date',
    },
    cash_register_logs: {
      description: '현금 출납 기록 - 일일 현금 잔액 관리',
      columns: {
        id: 'UUID (PK)',
        clinic_id: 'UUID (클리닉 ID)',
        date: 'DATE (기록 날짜)',
        previous_balance: 'INTEGER (전일 이월액)',
        current_balance: 'INTEGER (금일 잔액)',
        balance_difference: 'INTEGER (차액)',
        notes: 'TEXT (비고)',
        created_at: 'TIMESTAMP',
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
        late_minutes: 'INTEGER (지각 시간, 분 단위)',
        early_leave_minutes: 'INTEGER (조퇴 시간, 분 단위)',
        overtime_minutes: 'INTEGER (초과근무 시간, 분 단위)',
        total_work_minutes: 'INTEGER (총 근무 시간, 분 단위)',
        status: "TEXT (근태 상태: present=정상출근, late=지각, early_leave=조퇴, absent=결근, leave=연차, holiday=공휴일)",
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
        leave_type: 'TEXT (휴가 유형: annual=연차, half_am=오전반차, half_pm=오후반차, sick=병가)',
        start_date: 'DATE (시작일)',
        end_date: 'DATE (종료일)',
        status: 'TEXT (승인 상태: pending, approved, rejected)',
        reason: 'TEXT (사유)',
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
        name: 'TEXT (이름)',
        email: 'TEXT (이메일)',
        role: 'TEXT (역할: owner=대표원장, manager=실장/관리자, staff=일반직원)',
        position: 'TEXT (직책)',
        status: 'TEXT (상태: active, inactive, resigned)',
        hire_date: 'DATE (입사일)',
        created_at: 'TIMESTAMP',
      },
      dateColumn: 'hire_date',
    },
    gift_inventory: {
      description: '선물 재고 현황',
      columns: {
        id: 'UUID (PK)',
        clinic_id: 'UUID (클리닉 ID)',
        name: 'TEXT (선물 이름)',
        stock: 'INTEGER (현재 재고 수량)',
        category_id: 'INTEGER (카테고리 ID)',
        created_at: 'TIMESTAMP',
      },
      dateColumn: null,
    },
    inventory_logs: {
      description: '재고 입출고 기록',
      columns: {
        id: 'UUID (PK)',
        clinic_id: 'UUID (클리닉 ID)',
        name: 'TEXT (품목명)',
        reason: 'TEXT (입출고 사유)',
        change: 'INTEGER (변동 수량, 양수=입고, 음수=출고)',
        old_stock: 'INTEGER (이전 재고)',
        new_stock: 'INTEGER (변경 후 재고)',
        timestamp: 'TIMESTAMP (기록 시간)',
      },
      dateColumn: 'timestamp',
    },
    recall_campaigns: {
      description: '리콜 캠페인 - 리콜 환자 관리 캠페인',
      columns: {
        id: 'UUID (PK)',
        clinic_id: 'UUID (클리닉 ID)',
        name: 'TEXT (캠페인 이름)',
        start_date: 'DATE (시작일)',
        end_date: 'DATE (종료일)',
        status: 'TEXT (상태: active, completed, cancelled)',
        total_patients: 'INTEGER (총 환자 수)',
        completed_patients: 'INTEGER (완료된 환자 수)',
        created_at: 'TIMESTAMP',
      },
      dateColumn: 'start_date',
    },
    recall_patients: {
      description: '리콜 환자 목록 - 개별 환자 리콜 현황',
      columns: {
        id: 'UUID (PK)',
        clinic_id: 'UUID (클리닉 ID)',
        campaign_id: 'UUID (캠페인 ID)',
        patient_name: 'TEXT (환자 이름)',
        phone: 'TEXT (연락처)',
        last_visit: 'DATE (마지막 방문일)',
        recall_date: 'DATE (리콜 예정일)',
        status: 'TEXT (리콜 상태: pending, contacted, booked, completed, cancelled)',
        contact_count: 'INTEGER (연락 시도 횟수)',
        booking_date: 'DATE (예약 완료일)',
        created_at: 'TIMESTAMP',
      },
      dateColumn: 'recall_date',
    },
    recall_contact_logs: {
      description: '리콜 연락 기록 - 환자 연락 시도 이력',
      columns: {
        id: 'UUID (PK)',
        clinic_id: 'UUID (클리닉 ID)',
        patient_id: 'UUID (환자 ID)',
        contact_type: 'TEXT (연락 유형: phone, sms)',
        result: 'TEXT (연락 결과: answered, no_answer, busy, booked)',
        notes: 'TEXT (메모)',
        created_at: 'TIMESTAMP (연락 시간)',
      },
      dateColumn: 'created_at',
    },
    announcements: {
      description: '공지사항 게시판',
      columns: {
        id: 'UUID (PK)',
        clinic_id: 'UUID (클리닉 ID)',
        user_id: 'UUID (작성자 ID)',
        title: 'TEXT (제목)',
        content: 'TEXT (내용)',
        is_pinned: 'BOOLEAN (상단 고정 여부)',
        created_at: 'TIMESTAMP (작성일)',
      },
      dateColumn: 'created_at',
      joins: ['users(id, name)'],
    },
    tasks: {
      description: '업무 할당 게시판',
      columns: {
        id: 'UUID (PK)',
        clinic_id: 'UUID (클리닉 ID)',
        title: 'TEXT (업무 제목)',
        description: 'TEXT (업무 설명)',
        status: 'TEXT (상태: pending, in_progress, completed)',
        priority: 'TEXT (우선순위: low, medium, high)',
        due_date: 'DATE (마감일)',
        assigned_to: 'UUID (담당자 ID)',
        created_at: 'TIMESTAMP',
      },
      dateColumn: 'due_date',
    },
    vendor_contacts: {
      description: '업체 연락처',
      columns: {
        id: 'UUID (PK)',
        clinic_id: 'UUID (클리닉 ID)',
        company_name: 'TEXT (업체명)',
        category: 'TEXT (카테고리)',
        contact_name: 'TEXT (담당자명)',
        phone: 'TEXT (연락처)',
        notes: 'TEXT (메모)',
        created_at: 'TIMESTAMP',
      },
      dateColumn: null,
    },
    protocols: {
      description: '진료 프로토콜',
      columns: {
        id: 'UUID (PK)',
        clinic_id: 'UUID (클리닉 ID)',
        title: 'TEXT (프로토콜 제목)',
        category: 'TEXT (카테고리)',
        content: 'TEXT (내용)',
        is_published: 'BOOLEAN (공개 여부)',
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
        user_id: 'UUID (직원 ID)',
        status: 'TEXT (계약 상태: draft, active, expired, terminated)',
        contract_start_date: 'DATE (계약 시작일)',
        contract_end_date: 'DATE (계약 종료일)',
        salary_type: 'TEXT (급여 유형: monthly, hourly)',
        created_at: 'TIMESTAMP',
      },
      dateColumn: 'contract_start_date',
    },
    employee_leave_balances: {
      description: '직원 연차 잔액',
      columns: {
        id: 'UUID (PK)',
        clinic_id: 'UUID (클리닉 ID)',
        user_id: 'UUID (직원 ID)',
        year: 'INTEGER (연도)',
        total_days: 'DECIMAL (총 연차 일수)',
        used_days: 'DECIMAL (사용 연차 일수)',
        remaining_days: 'DECIMAL (잔여 연차 일수)',
        created_at: 'TIMESTAMP',
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
        author_name: 'TEXT (작성자 이름)',
        is_past_date_edit: 'BOOLEAN (과거 날짜 수정 여부)',
        edited_at: 'TIMESTAMP (실제 수정/작성 시점)',
        created_at: 'TIMESTAMP (생성 시간)',
      },
      dateColumn: 'report_date',
      joins: [],
    },
  },
};

// OpenAI Function Definitions
const tools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: 'function',
    function: {
      name: 'get_database_schema',
      description: '데이터베이스의 전체 스키마 정보를 조회합니다. 어떤 테이블이 있고 각 테이블에 어떤 컬럼이 있는지 확인할 수 있습니다.',
      parameters: {
        type: 'object',
        properties: {
          table_name: {
            type: 'string',
            description: '특정 테이블의 스키마만 조회하려면 테이블 이름을 입력하세요. 비워두면 전체 스키마를 반환합니다.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'query_table',
      description: '특정 테이블에서 데이터를 조회합니다. 필터 조건과 정렬을 지정할 수 있습니다.',
      parameters: {
        type: 'object',
        properties: {
          table_name: {
            type: 'string',
            description: '조회할 테이블 이름',
          },
          select_columns: {
            type: 'string',
            description: '조회할 컬럼들 (쉼표로 구분). 예: "id, name, date". 조인이 필요하면 "*, users(name, role)" 형태로 작성. 비워두면 모든 컬럼 조회.',
          },
          filters: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                column: { type: 'string', description: '필터링할 컬럼명' },
                operator: {
                  type: 'string',
                  description: '비교 연산자: eq(같음), neq(다름), gt(초과), gte(이상), lt(미만), lte(이하), like(포함), ilike(대소문자 무시 포함)',
                },
                value: { type: 'string', description: '비교할 값' },
              },
              required: ['column', 'operator', 'value'],
            },
            description: '필터 조건 배열',
          },
          date_range: {
            type: 'object',
            properties: {
              start_date: { type: 'string', description: '시작 날짜 (YYYY-MM-DD 형식)' },
              end_date: { type: 'string', description: '종료 날짜 (YYYY-MM-DD 형식)' },
            },
            description: '날짜 범위 필터 (테이블의 날짜 컬럼에 자동 적용)',
          },
          order_by: {
            type: 'object',
            properties: {
              column: { type: 'string', description: '정렬할 컬럼명' },
              ascending: { type: 'boolean', description: '오름차순 여부 (기본: true)' },
            },
            description: '정렬 조건',
          },
          limit: {
            type: 'integer',
            description: '조회할 최대 행 수 (기본: 100)',
          },
        },
        required: ['table_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'aggregate_data',
      description: '테이블 데이터를 집계합니다 (합계, 평균, 개수 등).',
      parameters: {
        type: 'object',
        properties: {
          table_name: {
            type: 'string',
            description: '집계할 테이블 이름',
          },
          aggregations: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                column: { type: 'string', description: '집계할 컬럼명' },
                function: {
                  type: 'string',
                  description: '집계 함수: sum, avg, count, min, max',
                },
                alias: { type: 'string', description: '결과 별칭 (선택)' },
              },
              required: ['column', 'function'],
            },
            description: '집계 함수 배열',
          },
          group_by: {
            type: 'array',
            items: { type: 'string' },
            description: '그룹화할 컬럼 배열',
          },
          filters: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                column: { type: 'string' },
                operator: { type: 'string' },
                value: { type: 'string' },
              },
            },
            description: '필터 조건',
          },
          date_range: {
            type: 'object',
            properties: {
              start_date: { type: 'string' },
              end_date: { type: 'string' },
            },
            description: '날짜 범위 필터',
          },
        },
        required: ['table_name', 'aggregations'],
      },
    },
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

## 분석 절차
1. 사용자 질문 분석 - 무엇을 알고 싶어하는지 파악
2. 필요한 테이블과 컬럼 결정
3. get_database_schema 도구로 테이블 구조 확인 (필요시)
4. query_table 또는 aggregate_data 도구로 데이터 조회
5. 조회 결과를 분석하여 명확한 답변 제공

## 중요 사항
- 항상 실제 데이터를 조회하여 답변하세요. 추측하지 마세요.
- 날짜 관련 질문은 date_range 파라미터를 활용하세요.
- "원장"은 role='owner'인 사용자입니다.
- "실장"은 role='manager'인 사용자입니다.
- 지각 데이터는 attendance_records 테이블의 late_minutes 컬럼을 확인하세요.
- 데이터가 없으면 "해당 기간에 데이터가 없습니다"라고 명확히 알려주세요.

## 응답 형식
- 한국어로 응답합니다.
- 수치 데이터는 명확하게 표시합니다.
- 분석 결과와 함께 의미있는 인사이트를 제공합니다.`;
}

// 도구 호출 처리
async function processToolCall(
  supabase: SupabaseClient,
  clinicId: string,
  toolCall: { id: string; type: string; function: { name: string; arguments: string } }
): Promise<string> {
  const { name, arguments: args } = toolCall.function;
  const parsedArgs = JSON.parse(args);

  console.log(`[AI Analysis] Tool call: ${name}`, parsedArgs);

  switch (name) {
    case 'get_database_schema':
      return getDatabaseSchema(parsedArgs.table_name);

    case 'query_table':
      return await queryTable(supabase, clinicId, parsedArgs);

    case 'aggregate_data':
      return await aggregateData(supabase, clinicId, parsedArgs);

    default:
      return JSON.stringify({ error: `Unknown tool: ${name}` });
  }
}

// 메인 분석 함수 (V2 - Agentic)
export async function performAnalysisV2(
  request: AIAnalysisRequest,
  supabaseUrl: string,
  supabaseKey: string,
  openaiApiKey: string,
  clinicId: string
): Promise<AIAnalysisResponse> {
  const supabase = createClient(supabaseUrl, supabaseKey);
  const openai = new OpenAI({ apiKey: openaiApiKey });

  const systemPrompt = generateSystemPrompt();

  const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
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

  // 현재 사용자 메시지 추가
  let userMessage = request.message;
  if (request.dateRange) {
    userMessage += `\n\n(참고: 분석 기간 ${request.dateRange.startDate} ~ ${request.dateRange.endDate})`;
  }
  messages.push({ role: 'user', content: userMessage });

  console.log(`[AI Analysis V2] Starting analysis for clinic: ${clinicId}`);
  console.log(`[AI Analysis V2] User message: ${request.message}`);

  try {
    // 최대 5번의 도구 호출 반복
    const maxIterations = 5;
    let iteration = 0;

    while (iteration < maxIterations) {
      iteration++;
      console.log(`[AI Analysis V2] Iteration ${iteration}`);

      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
        messages,
        tools,
        tool_choice: 'auto',
        temperature: 0.3, // 더 결정적인 응답을 위해 낮춤
      });

      const assistantMessage = completion.choices[0].message;
      messages.push(assistantMessage);

      // 도구 호출이 없으면 최종 응답
      if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
        console.log('[AI Analysis V2] Final response (no more tool calls)');
        return {
          message: assistantMessage.content || '분석을 완료할 수 없습니다.',
        };
      }

      // 도구 호출 처리
      for (const toolCall of assistantMessage.tool_calls) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const tc = toolCall as any;
        const result = await processToolCall(supabase, clinicId, {
          id: tc.id,
          type: tc.type,
          function: tc.function,
        });
        console.log(`[AI Analysis V2] Tool result for ${tc.function?.name}:`, result.substring(0, 500));

        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: result,
        });
      }
    }

    // 최대 반복 도달 시 마지막 응답 반환
    const finalCompletion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages,
      temperature: 0.3,
    });

    return {
      message: finalCompletion.choices[0].message.content || '분석을 완료할 수 없습니다.',
    };

  } catch (error) {
    console.error('[AI Analysis V2] Error:', error);
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
