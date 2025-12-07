// ========================================
// 업체 연락처 관리 Types
// ========================================

export interface VendorCategory {
  id: string;
  clinic_id: string;
  name: string;
  description?: string;
  color: string;
  display_order: number;
  created_at: string;
  updated_at: string;
}

export interface VendorContact {
  id: string;
  clinic_id: string;
  category_id?: string;
  category?: VendorCategory;
  company_name: string;
  contact_person?: string;
  phone: string;
  phone2?: string;
  email?: string;
  address?: string;
  notes?: string;
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
}

export interface VendorContactFormData {
  company_name: string;
  category_id?: string;
  contact_person?: string;
  phone: string;
  phone2?: string;
  email?: string;
  address?: string;
  notes?: string;
  is_favorite?: boolean;
}

export interface VendorCategoryFormData {
  name: string;
  description?: string;
  color: string;
}

// 엑셀/CSV 일괄 업로드용 타입
export interface VendorContactImportData {
  company_name: string;
  category_name?: string;
  contact_person?: string;
  phone: string;
  phone2?: string;
  email?: string;
  address?: string;
  notes?: string;
}
