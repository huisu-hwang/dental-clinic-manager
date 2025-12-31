export interface DailyReport {
  id?: number;
  date: string;
  recall_count: number;
  recall_booking_count: number;
  recall_booking_names?: string;
  consult_proceed: number;
  consult_hold: number;
  naver_review_count: number;
  special_notes?: string;
  clinic_id?: string | null;
}

export interface ConsultLog {
  id?: number;
  date: string;
  patient_name: string;
  consult_content: string;
  consult_status: 'O' | 'X';
  remarks: string;
  clinic_id?: string | null;
}

export interface GiftLog {
  id?: number;
  date: string;
  patient_name: string;
  gift_type: string;
  quantity: number;
  naver_review: 'O' | 'X';
  notes: string;
  clinic_id?: string | null;
}

export interface GiftCategory {
  id: number;
  clinic_id: string;
  name: string;
  description?: string;
  color: string;
  display_order: number;
  created_at?: string;
  updated_at?: string;
}

export interface GiftInventory {
  id: number;
  name: string;
  stock: number;
  category_id?: number | null;
  clinic_id?: string | null;
}

export interface InventoryLog {
  id?: number;
  timestamp: string;
  name: string;
  reason: string;
  change: number;
  old_stock: number;
  new_stock: number;
  clinic_id?: string | null;
}

export interface HappyCallLog {
  id?: number;
  date: string;
  patient_name: string;
  treatment: string;
  notes: string;
  clinic_id?: string | null;
}

export interface SpecialNotesHistory {
  id: string;
  clinic_id: string;
  report_date: string;
  content: string;
  author_id?: string | null;
  author_name: string;
  is_past_date_edit: boolean;
  edited_at: string;
  created_at: string;
}

export interface Stats {
  naver_review_count: number;
  consult_proceed: number;
  consult_hold: number;
  recall_count: number;
  recall_booking_count: number;
  totalConsults: number;
  totalGifts: number;
  totalRevenue: number;
  consultsByManager: Record<string, number>;
  giftsByManager: Record<string, number>;
  revenueByManager: Record<string, number>;
  consultProceedRate: number;
  recallSuccessRate: number;
  giftCounts: Record<string, number>;
  // 카테고리별 선물 통계: { categoryName: { giftName: count } }
  giftCountsByCategory: Record<string, { gifts: Record<string, number>; total: number; color: string }>;
  // 구환 선물 통계 (리뷰 비율 계산용)
  returningPatientGiftCount: number;
  // 리뷰 대비 구환 선물 비율 (리뷰 / 구환선물 * 100)
  reviewToReturningGiftRate: number;
}

export interface ConsultRowData {
  patient_name: string;
  consult_content: string;
  consult_status: 'O' | 'X';
  remarks: string;
}

export interface GiftRowData {
  patient_name: string;
  gift_type: string;
  quantity: number;
  naver_review: 'O' | 'X';
  notes: string;
}

export interface HappyCallRowData {
  patient_name: string;
  treatment: string;
  notes: string;
}

// ========================================
// Cash Register (현금 출납) Types
// ========================================

// 화폐 단위 정의 (5만원권부터 100원까지)
export interface CurrencyDenomination {
  denomination: number;  // 화폐 단위 (50000, 10000, 5000, 1000, 500, 100)
  count: number;         // 개수
  amount: number;        // 해당 화폐의 총액 (denomination * count)
}

export interface CashRegisterLog {
  id?: number;
  date: string;
  clinic_id?: string | null;

  // 전일 이월액 - 화폐별 개수
  prev_bill_50000: number;    // 전일 5만원권
  prev_bill_10000: number;    // 전일 1만원권
  prev_bill_5000: number;     // 전일 5천원권
  prev_bill_1000: number;     // 전일 1천원권
  prev_coin_500: number;      // 전일 500원 동전
  prev_coin_100: number;      // 전일 100원 동전
  previous_balance: number;   // 전일 이월액 총액 (자동 계산)

  // 금일 잔액 - 화폐별 개수
  curr_bill_50000: number;    // 금일 5만원권
  curr_bill_10000: number;    // 금일 1만원권
  curr_bill_5000: number;     // 금일 5천원권
  curr_bill_1000: number;     // 금일 1천원권
  curr_coin_500: number;      // 금일 500원 동전
  curr_coin_100: number;      // 금일 100원 동전
  current_balance: number;    // 금일 잔액 총액 (자동 계산)

  // 차액
  balance_difference: number; // 차액 (current_balance - previous_balance)

  // 비고
  notes?: string;

  created_at?: string;
  updated_at?: string;
}

export interface CashRegisterRowData {
  // 전일 이월액 - 화폐별 개수
  prev_bill_50000: number;
  prev_bill_10000: number;
  prev_bill_5000: number;
  prev_bill_1000: number;
  prev_coin_500: number;
  prev_coin_100: number;

  // 금일 잔액 - 화폐별 개수
  curr_bill_50000: number;
  curr_bill_10000: number;
  curr_bill_5000: number;
  curr_bill_1000: number;
  curr_coin_500: number;
  curr_coin_100: number;

  // 비고
  notes: string;
}

// ========================================
// Protocol Management Types
// ========================================

export interface ProtocolCategory {
  id: string;
  clinic_id: string;
  name: string;
  description?: string;
  color: string;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface Protocol {
  id: string;
  clinic_id: string;
  title: string;
  category_id?: string;
  category?: ProtocolCategory;
  status: 'draft' | 'active' | 'archived';
  current_version_id?: string;
  currentVersion?: ProtocolVersion;
  tags: string[];
  created_by: string;
  created_by_user?: {
    id: string;
    name: string;
    email: string;
  };
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

export interface ProtocolVersion {
  id: string;
  protocol_id: string;
  version_number: string;
  content: string;
  change_summary?: string;
  change_type: 'major' | 'minor';
  created_by: string;
  created_by_user?: {
    id: string;
    name: string;
    email: string;
  };
  created_at: string;
  steps?: ProtocolStep[];
}

export interface ProtocolFormData {
  title: string;
  category_id?: string;
  clinic_id?: string;
  content: string;
  status: 'draft' | 'active' | 'archived';
  tags: string[];
  change_summary?: string;
  change_type?: 'major' | 'minor';
  steps?: ProtocolStep[];
}

export interface ProtocolStep {
  id?: string;
  step_order: number;
  title: string;
  content: string;
  reference_materials?: string[];
  is_optional?: boolean;
}

export interface ProtocolMedia {
  id: string;
  protocol_id: string;
  step_id?: string;
  file_type: 'image' | 'video' | 'document' | 'link';
  file_name: string;
  file_url: string;
  file_size?: number;
  mime_type?: string;
  uploaded_by?: string;
  created_at: string;
}

export interface TagSuggestion {
  id: string;
  tag_name: string;
  usage_count: number;
  category_id?: string;
}

export interface ProtocolListItem {
  id: string;
  title: string;
  category?: {
    id: string;
    name: string;
    color: string;
  };
  status: 'draft' | 'active' | 'archived';
  currentVersion: {
    version_number: string;
    updated_at: string;
    updated_by: {
      id: string;
      name: string;
    };
  };
  tags: string[];
}

// ========================================
// Clinic Hours Types
// ========================================

export * from './clinic'

// ========================================
// Vendor Contact Types
// ========================================

export * from './vendor'

// ========================================
// Phone Dial Types
// ========================================

export * from './phone'