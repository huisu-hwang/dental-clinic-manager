export interface DailyReport {
  id?: number;
  date: string;
  recall_count: number;
  recall_booking_count: number;
  consult_proceed: number;
  consult_hold: number;
  naver_review_count: number;
  special_notes?: string;
}

export interface ConsultLog {
  id?: number;
  date: string;
  patient_name: string;
  consult_content: string;
  consult_status: 'O' | 'X';
  remarks: string;
}

export interface GiftLog {
  id?: number;
  date: string;
  patient_name: string;
  gift_type: string;
  naver_review: 'O' | 'X';
  notes: string;
}

export interface GiftInventory {
  id: number;
  name: string;
  stock: number;
}

export interface InventoryLog {
  id?: number;
  timestamp: string;
  name: string;
  reason: string;
  change: number;
  old_stock: number;
  new_stock: number;
}

export interface HappyCallLog {
  id?: number;
  date: string;
  patient_name: string;
  treatment: string;
  notes: string;
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