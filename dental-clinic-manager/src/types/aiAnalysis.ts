// ========================================
// AI Data Analysis Chat Types
// ========================================

// 파일 첨부 관련 타입
export interface FileAttachment {
  id: string;
  name: string;
  type: 'excel' | 'csv' | 'pdf' | 'text';
  size: number;
  parsedData: ParsedFileData;
}

export interface ParsedFileData {
  // 테이블 데이터 (Excel, CSV)
  tableData?: {
    headers: string[];
    rows: Record<string, unknown>[];
    totalRows: number;
    sampleRows: Record<string, unknown>[]; // 미리보기용 샘플 (최대 10행)
  };
  // 텍스트 데이터 (TXT, MD, PDF)
  textData?: {
    content: string;
    preview: string; // 미리보기 (최대 5,000자)
    totalLength: number;
    pageCount?: number; // PDF용
  };
  // 파일 요약 정보
  summary: string;
}

export interface AIMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  isLoading?: boolean;
  error?: string;
  attachments?: FileAttachment[];
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
  attachedFiles?: FileAttachment[];
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
  // 추가 데이터
  giftInventory?: GiftInventoryData[];
  inventoryLogs?: InventoryLogData[];
  recallCampaigns?: RecallCampaignData[];
  recallPatients?: RecallPatientData[];
  recallContactLogs?: RecallContactLogData[];
  specialNotesHistory?: SpecialNoteData[];
  users?: UserData[];
  announcements?: AnnouncementData[];
  tasks?: TaskData[];
  vendorContacts?: VendorContactData[];
  protocols?: ProtocolData[];
  contracts?: ContractData[];
  leaveBalances?: LeaveBalanceData[];
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
  scheduled_start?: string;
  scheduled_end?: string;
  late_minutes: number;
  early_leave_minutes: number;
  overtime_minutes: number;
  total_work_minutes?: number;
  status?: string;
}

export interface LeaveRequestData {
  user_name: string;
  leave_type: string;
  start_date: string;
  end_date: string;
  status: string;
  reason?: string;
}

// 추가 데이터 타입
export interface GiftInventoryData {
  name: string;
  stock: number;
  category_id?: number;
}

export interface InventoryLogData {
  timestamp: string;
  name: string;
  reason: string;
  change: number;
  old_stock: number;
  new_stock: number;
}

export interface RecallCampaignData {
  name: string;
  start_date: string;
  end_date: string;
  status: string;
  total_patients: number;
  completed_patients?: number;
}

export interface RecallPatientData {
  patient_name: string;
  phone?: string;
  last_visit?: string;
  recall_date: string;
  status: string;
  contact_count: number;
  booking_date?: string;
}

export interface RecallContactLogData {
  contact_type: string;
  result: string;
  notes?: string;
  created_at: string;
}

export interface SpecialNoteData {
  date: string;
  content: string;
  created_at: string;
  author: string;
}

export interface UserData {
  name: string;
  role: string;
  position?: string;
  status: string;
  hire_date?: string;
}

export interface AnnouncementData {
  title: string;
  content: string;
  is_pinned: boolean;
  created_at: string;
  author: string;
}

export interface TaskData {
  title: string;
  description?: string;
  status: string;
  priority?: string;
  due_date?: string;
  created_at: string;
}

export interface VendorContactData {
  company_name: string;
  category?: string;
  contact_name?: string;
  phone?: string;
  notes?: string;
}

export interface ProtocolData {
  title: string;
  category?: string;
  is_published: boolean;
  created_at: string;
  updated_at: string;
}

export interface ContractData {
  status: string;
  contract_start_date?: string;
  contract_end_date?: string;
  salary_type?: string;
  created_at: string;
}

export interface LeaveBalanceData {
  user_name: string;
  total_days: number;
  used_days: number;
  remaining_days: number;
  year: number;
}
