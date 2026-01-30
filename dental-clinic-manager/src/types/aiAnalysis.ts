// ========================================
// AI Data Analysis Chat Types
// ========================================

export interface AIMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  isLoading?: boolean;
  error?: string;
}

export interface AIConversation {
  id: string;
  clinic_id: string;
  user_id: string;
  title: string;
  messages: AIMessage[];
  created_at: string;
  updated_at: string;
}

export interface AIAnalysisRequest {
  message: string;
  conversationHistory?: AIMessage[];
  dateRange?: {
    startDate: string;
    endDate: string;
  };
}

export interface AIAnalysisResponse {
  message: string;
  data?: AnalysisData;
  error?: string;
}

export interface AnalysisData {
  summary?: DataSummary;
  charts?: ChartData[];
  insights?: string[];
  recommendations?: string[];
}

export interface DataSummary {
  totalRevenue?: number;
  totalConsults?: number;
  totalGifts?: number;
  totalRecalls?: number;
  totalReviews?: number;
  periodStart?: string;
  periodEnd?: string;
  metrics?: Record<string, number | string>;
}

export interface ChartData {
  type: 'line' | 'bar' | 'pie' | 'area';
  title: string;
  data: Record<string, unknown>[];
  xKey?: string;
  yKey?: string;
}

// 데이터베이스 스키마 정보 (AI 컨텍스트용)
export interface DatabaseSchema {
  tables: TableSchema[];
}

export interface TableSchema {
  name: string;
  description: string;
  columns: ColumnSchema[];
}

export interface ColumnSchema {
  name: string;
  type: string;
  description: string;
}

// AI 분석을 위한 수집된 데이터
export interface CollectedData {
  dailyReports?: DailyReportData[];
  consultLogs?: ConsultLogData[];
  giftLogs?: GiftLogData[];
  happyCallLogs?: HappyCallLogData[];
  cashRegisters?: CashRegisterData[];
  attendanceRecords?: AttendanceData[];
  leaveRequests?: LeaveRequestData[];
}

export interface DailyReportData {
  date: string;
  recall_count: number;
  recall_booking_count: number;
  consult_proceed: number;
  consult_hold: number;
  naver_review_count: number;
  special_notes?: string;
}

export interface ConsultLogData {
  date: string;
  patient_name: string;
  consult_content: string;
  consult_status: string;
  remarks?: string;
}

export interface GiftLogData {
  date: string;
  patient_name: string;
  gift_type: string;
  quantity: number;
  naver_review: string;
  notes?: string;
}

export interface HappyCallLogData {
  date: string;
  patient_name: string;
  treatment: string;
  notes?: string;
}

export interface CashRegisterData {
  date: string;
  previous_balance: number;
  current_balance: number;
  balance_difference: number;
  notes?: string;
}

export interface AttendanceData {
  date: string;
  user_name: string;
  check_in_time?: string;
  check_out_time?: string;
}

export interface LeaveRequestData {
  user_name: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  status: string;
}
