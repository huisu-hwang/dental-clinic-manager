# 세무사무실 급여명세서 PDF 업로드 및 조회

## 개요
원장(owner)이 세무 사무실에서 받은 급여명세서 ZIP 파일을 업로드하면, 각 PDF를 직원별로 매칭하여 저장하고, 급여 명세서 조회 화면에서 토글 버튼으로 "자체 계산" / "세무사무실" 명세서를 전환하여 볼 수 있는 기능.

## 업로드 플로우
1. ZIP 업로드 → API Route에서 압축 해제 → PDF 목록 추출
2. 파일명에서 한글 이름 패턴 추출 → 직원 자동 매칭
3. 매칭 결과 UI 표시 (자동 매칭 + 미매칭 수동 선택)
4. 확인 버튼 → Supabase Storage에 각 PDF 저장 + DB 메타데이터 기록

## 조회 플로우
1. 급여 명세서 조회 → 년/월 선택 → 직원 선택
2. 토글: [자체 계산] / [세무사무실]
3. "세무사무실" 선택 시 해당 월 PDF를 iframe/embed로 표시
4. PDF 없으면 "해당 월 세무사무실 명세서가 없습니다" 안내

## DB 테이블: `payroll_tax_office_files`

| 컬럼 | 타입 | 설명 |
|---|---|---|
| id | uuid | PK, default gen_random_uuid() |
| clinic_id | uuid | FK → clinics |
| employee_user_id | uuid | FK → users |
| payment_year | int | 급여 년도 |
| payment_month | int | 급여 월 |
| file_name | text | 원본 파일명 |
| storage_path | text | Supabase Storage 경로 |
| uploaded_by | uuid | FK → users |
| created_at | timestamptz | default now() |

- UNIQUE(clinic_id, employee_user_id, payment_year, payment_month)

## Supabase Storage
- 버킷: `payroll-documents`
- 경로: `{clinic_id}/{year}/{month}/{employee_user_id}.pdf`
- RLS: clinic_id 기반 접근제어

## UI 변경
- **PayrollManagement**: "세무사무실 명세서 업로드" 버튼 추가 (owner 전용)
- **업로드 모달**: ZIP 업로드 → 파일-직원 매칭 UI → 년/월 선택 → 확인
- **PayrollForm 상단**: [자체 계산] / [세무사무실] 토글 버튼 추가
- **PDF 뷰어**: 토글이 "세무사무실"일 때 PDF를 embed로 표시

## 자동 매칭 로직
- 파일명에서 한글 이름 패턴 추출 (정규식: `/[가-힣]{2,4}/g`)
- 추출된 이름과 직원 목록의 `name` 필드 비교
- 공백 제거 후 exact match → 부분 match 순으로 시도
- 매칭 실패 시 "미매칭" 상태 → 드롭다운으로 수동 선택
