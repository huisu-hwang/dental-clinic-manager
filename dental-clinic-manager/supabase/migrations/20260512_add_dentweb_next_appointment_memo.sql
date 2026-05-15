-- 덴트웹 다음 예약의 메모/내용 컬럼 추가 (TB_예약목록.sz예약내용 매핑).
-- 리콜 환자 목록에서 다음 예약일과 함께 진료 내용을 즉시 확인하기 위함.
ALTER TABLE dentweb_patients
  ADD COLUMN IF NOT EXISTS next_appointment_memo TEXT;
