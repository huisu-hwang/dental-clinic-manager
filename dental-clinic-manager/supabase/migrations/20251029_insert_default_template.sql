-- Insert Default Employment Contract Template (Hayan Dental Standard)
-- This creates the default template that all clinics can use

-- Insert default template (clinic_id is NULL for system-wide templates)
INSERT INTO employment_contract_templates (
  id,
  clinic_id,
  name,
  description,
  content,
  is_default,
  version,
  created_by,
  created_at,
  updated_at
)
VALUES (
  'default-hayan-template-001',
  NULL, -- NULL clinic_id means system-wide template
  '하얀치과 표준 근로계약서',
  '하얀치과에서 사용하는 표준 근로계약서 템플릿입니다. 각 병원에서 필요에 따라 수정하여 사용할 수 있습니다.',
  jsonb_build_object(
    'fields', jsonb_build_array(
      jsonb_build_object('key', 'employee_name', 'label', '근로자 성명', 'type', 'text', 'required', true),
      jsonb_build_object('key', 'employee_resident_number', 'label', '주민등록번호', 'type', 'text', 'required', true),
      jsonb_build_object('key', 'employee_address', 'label', '주소', 'type', 'text', 'required', true),
      jsonb_build_object('key', 'employee_phone', 'label', '전화번호', 'type', 'text', 'required', true),
      jsonb_build_object('key', 'employer_name', 'label', '사용자(원장) 성명', 'type', 'text', 'required', true),
      jsonb_build_object('key', 'clinic_name', 'label', '병원명', 'type', 'text', 'required', true),
      jsonb_build_object('key', 'clinic_address', 'label', '병원 주소', 'type', 'text', 'required', true),
      jsonb_build_object('key', 'employment_period_start', 'label', '근로 시작일', 'type', 'date', 'required', true),
      jsonb_build_object('key', 'employment_period_end', 'label', '근로 종료일', 'type', 'date', 'required', false),
      jsonb_build_object('key', 'is_permanent', 'label', '무기한 계약', 'type', 'boolean', 'required', false),
      jsonb_build_object('key', 'work_start_time', 'label', '근무 시작 시간', 'type', 'time', 'required', true),
      jsonb_build_object('key', 'work_end_time', 'label', '근무 종료 시간', 'type', 'time', 'required', true),
      jsonb_build_object('key', 'work_days_per_week', 'label', '주당 근무일수', 'type', 'number', 'required', true),
      jsonb_build_object('key', 'annual_leave_days', 'label', '연차 휴가일수', 'type', 'number', 'required', true),
      jsonb_build_object('key', 'salary_base', 'label', '기본급(월)', 'type', 'number', 'required', true),
      jsonb_build_object('key', 'salary_payment_day', 'label', '급여 지급일', 'type', 'number', 'required', true),
      jsonb_build_object('key', 'allowance_meal', 'label', '식대', 'type', 'number', 'required', false),
      jsonb_build_object('key', 'allowance_transport', 'label', '교통비', 'type', 'number', 'required', false),
      jsonb_build_object('key', 'allowance_other', 'label', '기타 수당', 'type', 'number', 'required', false),
      jsonb_build_object('key', 'social_insurance', 'label', '국민연금', 'type', 'boolean', 'required', false),
      jsonb_build_object('key', 'health_insurance', 'label', '건강보험', 'type', 'boolean', 'required', false),
      jsonb_build_object('key', 'employment_insurance', 'label', '고용보험', 'type', 'boolean', 'required', false),
      jsonb_build_object('key', 'pension_insurance', 'label', '산재보험', 'type', 'boolean', 'required', false),
      jsonb_build_object('key', 'special_terms', 'label', '특약사항', 'type', 'textarea', 'required', false)
    ),
    'layout', jsonb_build_object(
      'title', '근로계약서',
      'sections', jsonb_build_array(
        jsonb_build_object('title', '제1조 (당사자)', 'fields', jsonb_build_array('employer_name', 'clinic_name', 'clinic_address', 'employee_name', 'employee_resident_number', 'employee_address', 'employee_phone')),
        jsonb_build_object('title', '제2조 (근로기간)', 'fields', jsonb_build_array('employment_period_start', 'employment_period_end', 'is_permanent')),
        jsonb_build_object('title', '제3조 (근무장소)', 'fields', jsonb_build_array('clinic_address')),
        jsonb_build_object('title', '제4조 (근로시간)', 'fields', jsonb_build_array('work_start_time', 'work_end_time', 'work_days_per_week', 'annual_leave_days')),
        jsonb_build_object('title', '제5조 (임금)', 'fields', jsonb_build_array('salary_base', 'salary_payment_day', 'allowance_meal', 'allowance_transport', 'allowance_other')),
        jsonb_build_object('title', '제6조 (사회보험)', 'fields', jsonb_build_array('social_insurance', 'health_insurance', 'employment_insurance', 'pension_insurance')),
        jsonb_build_object('title', '제7조 (특약사항)', 'fields', jsonb_build_array('special_terms'))
      )
    ),
    'signature_positions', jsonb_build_object(
      'employer', jsonb_build_object('label', '사용자 (갑)', 'position', 'bottom-left'),
      'employee', jsonb_build_object('label', '근로자 (을)', 'position', 'bottom-right')
    )
  ),
  true, -- is_default
  '1.0', -- version
  'system', -- created_by (system generated)
  NOW(),
  NOW()
)
ON CONFLICT (id) DO UPDATE SET
  content = EXCLUDED.content,
  updated_at = NOW();

-- Add comment
COMMENT ON TABLE employment_contract_templates IS 'Employment contract templates - default template (clinic_id = NULL) is available to all clinics';
