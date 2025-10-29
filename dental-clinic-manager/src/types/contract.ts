/**
 * Types for Employment Contract Management System
 */

// =====================================================================
// Contract Template Types
// =====================================================================

export type FieldType = 'text' | 'number' | 'date' | 'select' | 'textarea' | 'checkbox' | 'signature'

export type SignerType = 'employer' | 'employee'

export type ContractStatus =
  | 'draft'
  | 'pending_employee_signature'
  | 'pending_employer_signature'
  | 'completed'
  | 'cancelled'

export interface TemplateField {
  key: string
  label: string
  type: FieldType
  required: boolean
  defaultValue?: string
  placeholder?: string
  options?: string[] // For select fields
  autoFillSource?: 'employee_name' | 'employee_address' | 'employee_phone' | 'employee_resident_number' | 'clinic_name' | 'clinic_address' | 'employer_name'
  validationRules?: {
    min?: number
    max?: number
    pattern?: string
    message?: string
  }
  helpText?: string
}

export interface SignatureArea {
  id: string
  signerType: SignerType
  label: string
  position?: {
    x: number
    y: number
  }
}

export interface TemplateContent {
  html: string
  fields: TemplateField[]
  signatureAreas: SignatureArea[]
}

export interface ContractTemplate {
  id: string
  clinic_id: string | null // null for system default template
  name: string
  description?: string
  content: TemplateContent
  is_default: boolean
  version: string
  created_by?: string
  created_at: string
  updated_at: string
  deleted_at?: string | null
}

// =====================================================================
// Employment Contract Types
// =====================================================================

export interface ContractData {
  // Employee information (auto-filled from user profile)
  employee_name: string
  employee_address: string
  employee_phone: string
  employee_resident_number: string

  // Employer information (auto-filled)
  employer_name: string
  clinic_name: string
  clinic_address: string

  // Contract terms
  employment_period_start: string
  employment_period_end?: string
  is_permanent: boolean
  work_location: string
  job_description: string
  work_hours_start: string
  work_hours_end: string
  break_time: string
  workdays: string[] // ['월', '화', '수', '목', '금']
  holidays: string[]

  // Salary information
  salary_base: number
  salary_bonus?: number
  salary_allowances?: Record<string, number> // { '식대': 100000, '교통비': 50000 }
  salary_payment_day: number // 25 (25일)
  salary_total: number

  // Benefits
  annual_leave_days: number
  social_insurance: boolean
  health_insurance: boolean
  employment_insurance: boolean
  pension_insurance: boolean
  workers_compensation: boolean

  // Additional terms
  probation_period?: number // months
  probation_terms?: string
  confidentiality_agreement: boolean
  non_compete_agreement: boolean
  additional_terms?: string

  // Contract metadata
  contract_date: string
  contract_location: string

  // Custom fields (flexible)
  [key: string]: any
}

export interface EmploymentContract {
  id: string
  clinic_id: string
  template_id: string
  employee_user_id: string
  employer_user_id: string
  contract_data: ContractData
  status: ContractStatus
  created_by: string
  created_at: string
  updated_at: string
  completed_at?: string | null
  cancelled_at?: string | null
  cancelled_by?: string | null
  cancellation_reason?: string | null
  version: number
  notes?: string | null

  // Relations (populated when queried with joins)
  template?: ContractTemplate
  employee?: {
    id: string
    name: string
    email: string
    phone?: string
  }
  employer?: {
    id: string
    name: string
    email: string
  }
  signatures?: ContractSignature[]
}

// =====================================================================
// Signature Types
// =====================================================================

export interface ContractSignature {
  id: string
  contract_id: string
  signer_user_id: string
  signer_type: SignerType
  signature_data: string // Base64 encoded image
  signed_at: string
  ip_address?: string | null
  device_info?: string | null
  user_agent?: string | null
  is_verified: boolean

  // Relations
  signer?: {
    id: string
    name: string
    email: string
  }
}

// =====================================================================
// Field Definition Types
// =====================================================================

export interface ContractFieldDefinition {
  id: string
  template_id: string
  field_key: string
  field_label: string
  field_type: FieldType
  is_required: boolean
  default_value?: string | null
  placeholder?: string | null
  options?: string[] | null
  auto_fill_source?: string | null
  validation_rules?: Record<string, any> | null
  display_order: number
  help_text?: string | null
  created_at: string
}

// =====================================================================
// Change History Types
// =====================================================================

export type ChangeType = 'created' | 'updated' | 'signed' | 'completed' | 'cancelled'

export interface ContractChangeHistory {
  id: string
  contract_id: string
  changed_by: string
  change_type: ChangeType
  old_data?: Record<string, any> | null
  new_data?: Record<string, any> | null
  change_description?: string | null
  changed_at: string
  ip_address?: string | null
  user_agent?: string | null

  // Relations
  changed_by_user?: {
    id: string
    name: string
    email: string
  }
}

// =====================================================================
// Form Types (for UI components)
// =====================================================================

export interface ContractFormData {
  template_id: string
  employee_user_id: string
  contract_data: Partial<ContractData>
}

export interface ContractListFilters {
  status?: ContractStatus | ContractStatus[]
  employee_user_id?: string
  employer_user_id?: string
  date_from?: string
  date_to?: string
  search?: string
}

export interface ContractSigningData {
  contract_id: string
  signer_type: SignerType
  signature_data: string // Base64 image
  ip_address?: string
  device_info?: string
  user_agent?: string
}

// =====================================================================
// API Response Types
// =====================================================================

export interface CreateContractResponse {
  success: boolean
  contract?: EmploymentContract
  error?: string
}

export interface SignContractResponse {
  success: boolean
  signature?: ContractSignature
  contract_status?: ContractStatus
  error?: string
}

export interface GetContractsResponse {
  success: boolean
  contracts?: EmploymentContract[]
  total?: number
  error?: string
}

// =====================================================================
// Utility Types
// =====================================================================

export interface PersonalInfoValidation {
  isComplete: boolean
  missingFields: string[]
  missingFieldLabels: string[]
}

export interface ContractValidation {
  isValid: boolean
  errors: Record<string, string>
  warnings: Record<string, string>
}

// =====================================================================
// Default Template Data
// =====================================================================

export const DEFAULT_TEMPLATE_NAME = '하얀치과 표준 근로계약서'

export const DEFAULT_CONTRACT_FIELDS: TemplateField[] = [
  {
    key: 'employee_name',
    label: '근로자 성명',
    type: 'text',
    required: true,
    autoFillSource: 'employee_name'
  },
  {
    key: 'employee_resident_number',
    label: '주민등록번호',
    type: 'text',
    required: true,
    autoFillSource: 'employee_resident_number'
  },
  {
    key: 'employee_address',
    label: '주소',
    type: 'textarea',
    required: true,
    autoFillSource: 'employee_address'
  },
  {
    key: 'employee_phone',
    label: '전화번호',
    type: 'text',
    required: true,
    autoFillSource: 'employee_phone'
  },
  {
    key: 'employment_period_start',
    label: '계약 시작일',
    type: 'date',
    required: true
  },
  {
    key: 'employment_period_end',
    label: '계약 종료일',
    type: 'date',
    required: false,
    helpText: '기간 정함이 없는 경우 비워두세요'
  },
  {
    key: 'work_location',
    label: '근무 장소',
    type: 'text',
    required: true,
    autoFillSource: 'clinic_address'
  },
  {
    key: 'job_description',
    label: '업무 내용',
    type: 'textarea',
    required: true
  },
  {
    key: 'work_hours_start',
    label: '출근 시간',
    type: 'text',
    required: true,
    placeholder: '09:00'
  },
  {
    key: 'work_hours_end',
    label: '퇴근 시간',
    type: 'text',
    required: true,
    placeholder: '18:00'
  },
  {
    key: 'salary_base',
    label: '기본급 (월)',
    type: 'number',
    required: true,
    helpText: '원 단위로 입력'
  },
  {
    key: 'salary_payment_day',
    label: '급여 지급일',
    type: 'number',
    required: true,
    defaultValue: '25',
    helpText: '매월 며칠에 지급하는지 입력 (예: 25일)'
  },
  {
    key: 'annual_leave_days',
    label: '연차 유급휴가 일수',
    type: 'number',
    required: true,
    defaultValue: '15',
    helpText: '근로기준법에 따른 연차 일수'
  },
  {
    key: 'social_insurance',
    label: '4대 보험 적용',
    type: 'checkbox',
    required: false,
    defaultValue: 'true'
  }
]

export const DEFAULT_SIGNATURE_AREAS: SignatureArea[] = [
  {
    id: 'employer_signature',
    signerType: 'employer',
    label: '사용자 (원장) 서명'
  },
  {
    id: 'employee_signature',
    signerType: 'employee',
    label: '근로자 서명'
  }
]
