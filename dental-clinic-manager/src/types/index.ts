export interface DailyReport {
  id?: number;
  date: string;
  recall_count: number;
  recall_booking_count: number;
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
  naver_review: 'O' | 'X';
  notes: string;
  clinic_id?: string | null;
}

export interface GiftInventory {
  id: number;
  name: string;
  stock: number;
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