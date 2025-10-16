# 덴탈매니저 (Dental Clinic Manager) - PRD

## 1. 프로젝트 개요

### 1.1 제품 이름
**덴탈매니저** (Dental Clinic Manager)

### 1.2 제품 설명
치과 업무를 체계적으로 관리하는 멀티 테넌트 SaaS 플랫폼입니다. 일일 보고서 작성, 환자 상담 관리, 재고 관리, 통계 분석 등 치과 데스크 업무를 효율적으로 처리할 수 있습니다.

### 1.3 비전
모든 치과가 디지털 전환을 통해 업무 효율성을 극대화하고, 환자 관리를 체계화할 수 있도록 지원합니다.

### 1.4 목표
- 치과 데스크 업무의 디지털화
- 실시간 데이터 기반 의사결정 지원
- 멀티 테넌트 구조를 통한 여러 치과 동시 운영
- 역할 기반 권한 관리로 보안성 확보

---

## 2. 기술 스택

### 2.1 Frontend
- **Framework**: Next.js 15.5.3 (App Router)
- **UI Library**: React 19.1.0
- **Language**: TypeScript 5
- **Styling**: Tailwind CSS 4
- **Icons**: Lucide React, Heroicons

### 2.2 Backend
- **Database**: Supabase (PostgreSQL)
- **Authentication**: Supabase Auth
- **Real-time**: Supabase Realtime

### 2.3 Deployment
- **Platform**: Vercel (권장)
- **Database**: Supabase Cloud

---

## 3. 사용자 역할 및 권한

### 3.1 역할 정의

#### 3.1.1 Master Admin (master)
- **설명**: 시스템 전체를 관리하는 최고 관리자
- **권한**:
  - 모든 병원 조회/관리
  - 모든 사용자 조회/관리
  - 병원 승인/거절/중지
  - 사용자 가입 승인/거절
  - 시스템 통계 조회
  - 전체 시스템 모니터링

#### 3.1.2 Owner (대표원장)
- **설명**: 병원의 소유자 및 최고 책임자
- **권한**:
  - 병원 설정 관리
  - 직원 관리 (승인/거절/권한 수정)
  - 모든 업무 기능 접근
  - 모든 통계 조회
  - 재고 관리
  - 데이터 삭제 권한

#### 3.1.3 Vice Director (부원장)
- **설명**: 대표원장을 보좌하는 관리자
- **권한**:
  - 일일 보고서 CRUD
  - 모든 통계 조회
  - 재고 관리
  - 직원 목록 조회
  - 상세 기록 조회

#### 3.1.4 Manager (실장)
- **설명**: 치과 업무를 총괄하는 관리자
- **권한**:
  - 일일 보고서 CRUD
  - 모든 통계 조회
  - 재고 관리
  - 상세 기록 조회

#### 3.1.5 Team Leader (팀장)
- **설명**: 팀 단위 업무를 관리하는 중간 관리자
- **권한**:
  - 일일 보고서 생성/수정 (삭제 불가)
  - 주간/월간 통계 조회
  - 재고 조회
  - 상세 기록 조회

#### 3.1.6 Staff (일반 직원)
- **설명**: 일반 데스크 직원
- **권한**:
  - 일일 보고서 생성/조회
  - 주간 통계 조회
  - 재고 조회

### 3.2 권한 매트릭스

| 기능 | Master | Owner | Vice Director | Manager | Team Leader | Staff |
|------|--------|-------|---------------|---------|-------------|-------|
| 병원 관리 | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 전체 사용자 관리 | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| 직원 관리 | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| 병원 설정 | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ |
| 보고서 생성 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 보고서 수정 | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| 보고서 삭제 | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| 주간 통계 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 월간 통계 | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| 연간 통계 | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| 재고 조회 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| 재고 관리 | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| 상세 기록 조회 | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |

---

## 4. 주요 기능

### 4.1 인증 및 사용자 관리

#### 4.1.1 회원가입
- **목적**: 새로운 사용자 등록
- **플로우**:
  1. 사용자가 이메일, 비밀번호, 이름, 전화번호 입력
  2. 병원 선택 (기존 병원 또는 새 병원 생성)
  3. 역할 선택
  4. Supabase Auth에 계정 생성
  5. 승인 대기 상태로 저장
- **제약 조건**:
  - 이메일 중복 불가
  - 비밀번호 최소 6자 이상
  - 새 병원 생성 시 자동으로 Owner 역할 부여

#### 4.1.2 로그인
- **목적**: 기존 사용자 인증
- **플로우**:
  1. 이메일, 비밀번호 입력
  2. Supabase Auth 인증
  3. 사용자 프로필 조회 (public.users)
  4. 승인 상태 확인
  5. 승인된 경우 대시보드로 이동
- **특별 처리**:
  - Master 계정 (sani81@gmail.com)은 별도 처리
  - 승인 대기 중인 사용자는 pending-approval 페이지로 이동

#### 4.1.3 비밀번호 재설정
- **목적**: 비밀번호를 잊은 사용자 지원
- **플로우**:
  1. 이메일 입력
  2. Supabase Auth를 통한 재설정 이메일 발송
  3. 이메일 링크 클릭
  4. 새 비밀번호 설정
  5. update-password 페이지에서 비밀번호 변경

#### 4.1.4 프로필 관리
- **목적**: 사용자 정보 수정
- **기능**:
  - 이름, 전화번호 수정
  - 비밀번호 변경
  - 권한 조회 (Owner만 직원 권한 수정 가능)

### 4.2 일일 보고서 관리

#### 4.2.1 일일 보고서 작성
- **목적**: 하루 업무 내용 기록
- **구성 요소**:
  1. **환자 상담 기록 (consult_logs)**
     - 환자명
     - 상담 내용
     - 상담 결과 (진행/보류)
     - 비고

  2. **선물 증정 기록 (gift_logs)**
     - 환자명
     - 선물 종류
     - 수량
     - 네이버 리뷰 여부
     - 메모

  3. **해피콜 기록 (happy_call_logs)**
     - 환자명
     - 치료 내역
     - 메모

  4. **리콜 현황**
     - 리콜 연락 수
     - 리콜 예약 수

  5. **특이사항**
     - 자유 텍스트 입력

- **저장 로직**:
  - 일일 보고서 요약 데이터 저장 (daily_reports)
  - 각 상담/선물/해피콜 기록을 개별 테이블에 저장
  - 재고 자동 차감 (선물 증정 시)

#### 4.2.2 일일 보고서 조회
- **목적**: 과거 보고서 확인
- **기능**:
  - 날짜별 보고서 조회
  - 상세 기록 확인
  - 통계 재계산
  - 보고서 삭제 (권한 있는 사용자만)

### 4.3 통계 및 분석

#### 4.3.1 주간 통계
- **기간**: 주 단위 (ISO Week)
- **지표**:
  - 총 상담 수
  - 상담 진행 수
  - 상담 보류 수
  - 상담 진행률
  - 리콜 연락 수
  - 리콜 예약 수
  - 리콜 성공률
  - 네이버 리뷰 수
  - 선물 증정 수 (종류별)

#### 4.3.2 월간 통계
- **기간**: 월 단위 (YYYY-MM)
- **지표**: 주간 통계와 동일

#### 4.3.3 연간 통계
- **기간**: 연도 단위 (YYYY)
- **지표**: 주간 통계와 동일
- **추가 기능**: 월별 추세 분석

### 4.4 재고 관리

#### 4.4.1 선물 재고 관리
- **목적**: 치과 선물 아이템 재고 추적
- **기능**:
  - 선물 아이템 추가
  - 재고 수량 조회
  - 재고 입고/출고
  - 재고 변동 이력 조회
  - 선물 아이템 삭제

#### 4.4.2 재고 자동 차감
- **트리거**: 일일 보고서에서 선물 증정 기록 시
- **로직**:
  - 선물 종류와 수량 확인
  - gift_inventory에서 해당 아이템 재고 차감
  - inventory_logs에 출고 기록 저장

### 4.5 직원 관리

#### 4.5.1 직원 승인
- **대상**: Owner, Master Admin
- **플로우**:
  1. 신규 가입 사용자는 'pending' 상태
  2. Owner가 승인 대기 목록 확인
  3. 승인 시 status를 'active'로 변경
  4. 거절 시 status를 'rejected'로 변경

#### 4.5.2 권한 관리
- **대상**: Owner만 가능
- **기능**:
  - 직원별 세부 권한 설정
  - 기본 역할 권한 외 추가 권한 부여
  - 권한 변경 이력 추적

#### 4.5.3 직원 목록 조회
- **대상**: staff_view 권한 보유자
- **정보**:
  - 이름, 이메일, 역할
  - 가입일, 승인 상태
  - 마지막 로그인 시각

### 4.6 병원 설정

#### 4.6.1 병원 정보 관리
- **대상**: Owner만 가능
- **편집 가능 항목**:
  - 병원명
  - 대표자명
  - 주소
  - 전화번호
  - 이메일
  - 사업자번호
  - 병원 소개
  - 로고 이미지
  - 공개 여부
  - 가입 요청 허용 여부

### 4.7 마스터 관리 기능

#### 4.7.1 병원 관리
- **대상**: Master Admin만
- **기능**:
  - 전체 병원 목록 조회
  - 병원 상세 정보 조회
  - 병원 상태 변경 (활성/중지)
  - 병원 삭제
  - 병원별 회원 목록 조회

#### 4.7.2 사용자 관리
- **대상**: Master Admin만
- **기능**:
  - 전체 사용자 목록 조회
  - 승인 대기 사용자 목록
  - 사용자 승인/거절
  - 사용자 삭제

#### 4.7.3 시스템 통계
- **대상**: Master Admin만
- **지표**:
  - 전체 병원 수
  - 전체 사용자 수
  - 전체 환자 수
  - 전체 예약 수

---

## 5. 데이터베이스 스키마

### 5.1 Core Tables

#### 5.1.1 clinics (병원)
```sql
id                      UUID PRIMARY KEY
name                    VARCHAR(255)      -- 병원명
owner_name              VARCHAR(255)      -- 대표자명
address                 TEXT              -- 주소
phone                   VARCHAR(50)       -- 전화번호
email                   VARCHAR(255)      -- 이메일
business_number         VARCHAR(50)       -- 사업자번호
description             TEXT              -- 병원 소개
logo_url                TEXT              -- 로고 URL
subscription_tier       VARCHAR(50)       -- 구독 등급
subscription_expires_at TIMESTAMP         -- 구독 만료일
max_users               INTEGER           -- 최대 사용자 수
is_public               BOOLEAN           -- 공개 여부
allow_join_requests     BOOLEAN           -- 가입 요청 허용
status                  VARCHAR(50)       -- 상태 (active/suspended/cancelled)
created_at              TIMESTAMP
updated_at              TIMESTAMP
```

#### 5.1.2 users (사용자)
```sql
id              UUID PRIMARY KEY
clinic_id       UUID REFERENCES clinics(id)
email           VARCHAR(255) UNIQUE
password_hash   VARCHAR(255)
name            VARCHAR(255)
phone           VARCHAR(50)
role            VARCHAR(50)       -- master/owner/vice_director/manager/team_leader/staff
status          VARCHAR(50)       -- pending/active/rejected
permissions     TEXT[]            -- 커스텀 권한 배열
last_login_at   TIMESTAMP
approved_by     UUID REFERENCES users(id)
approved_at     TIMESTAMP
created_at      TIMESTAMP
updated_at      TIMESTAMP
```

### 5.2 Operational Tables

#### 5.2.1 daily_reports (일일 보고서)
```sql
id                      INTEGER PRIMARY KEY
clinic_id               UUID REFERENCES clinics(id)
date                    DATE
recall_count            INTEGER
recall_booking_count    INTEGER
consult_proceed         INTEGER
consult_hold            INTEGER
naver_review_count      INTEGER
special_notes           TEXT
created_at              TIMESTAMP
```

#### 5.2.2 consult_logs (상담 기록)
```sql
id              INTEGER PRIMARY KEY
clinic_id       UUID REFERENCES clinics(id)
date            DATE
patient_name    VARCHAR(255)
consult_content TEXT
consult_status  VARCHAR(1)    -- 'O' (진행) or 'X' (보류)
remarks         TEXT
created_at      TIMESTAMP
```

#### 5.2.3 gift_logs (선물 증정 기록)
```sql
id              INTEGER PRIMARY KEY
clinic_id       UUID REFERENCES clinics(id)
date            DATE
patient_name    VARCHAR(255)
gift_type       VARCHAR(255)
quantity        INTEGER
naver_review    VARCHAR(1)    -- 'O' or 'X'
notes           TEXT
created_at      TIMESTAMP
```

#### 5.2.4 happy_call_logs (해피콜 기록)
```sql
id              INTEGER PRIMARY KEY
clinic_id       UUID REFERENCES clinics(id)
date            DATE
patient_name    VARCHAR(255)
treatment       TEXT
notes           TEXT
created_at      TIMESTAMP
```

#### 5.2.5 gift_inventory (선물 재고)
```sql
id          INTEGER PRIMARY KEY
clinic_id   UUID REFERENCES clinics(id)
name        VARCHAR(255)
stock       INTEGER
created_at  TIMESTAMP
updated_at  TIMESTAMP
```

#### 5.2.6 inventory_logs (재고 변동 이력)
```sql
id          INTEGER PRIMARY KEY
clinic_id   UUID REFERENCES clinics(id)
name        VARCHAR(255)
reason      VARCHAR(255)
change      INTEGER           -- 변동량 (+/-  )
old_stock   INTEGER
new_stock   INTEGER
timestamp   TIMESTAMP
```

### 5.3 System Tables

#### 5.3.1 role_permissions (역할 권한)
```sql
id          UUID PRIMARY KEY
role        VARCHAR(50)
resource    VARCHAR(100)
can_create  BOOLEAN
can_read    BOOLEAN
can_update  BOOLEAN
can_delete  BOOLEAN
created_at  TIMESTAMP
```

#### 5.3.2 audit_logs (감사 로그)
```sql
id            UUID PRIMARY KEY
user_id       UUID REFERENCES users(id)
clinic_id     UUID REFERENCES clinics(id)
action        VARCHAR(100)
resource      VARCHAR(100)
resource_id   UUID
details       JSONB
ip_address    VARCHAR(45)
user_agent    TEXT
created_at    TIMESTAMP
```

---

## 6. 페이지 및 라우팅

### 6.1 Public Pages

#### 6.1.1 `/` (랜딩)
- **설명**: 앱 소개 및 로그인/회원가입 진입점
- **컴포넌트**: LandingPage, LoginForm, SignupForm
- **권한**: 모두 접근 가능

#### 6.1.2 `/pending-approval` (승인 대기)
- **설명**: 가입 후 승인 대기 중인 사용자 안내
- **권한**: 로그인한 사용자 중 status='pending'

#### 6.1.3 `/update-password` (비밀번호 변경)
- **설명**: 비밀번호 재설정 링크로 접근
- **권한**: 재설정 토큰 보유자

### 6.2 Protected Pages

#### 6.2.1 `/dashboard` (대시보드)
- **설명**: 주요 업무 화면
- **탭**:
  - 일일 보고서 입력
  - 주간 통계
  - 월간 통계
  - 연간 통계
  - 상세 기록
  - 재고 관리
  - 사용 안내
- **권한**: status='active' 사용자만

#### 6.2.2 `/management` (관리)
- **설명**: 직원 및 병원 관리
- **탭**:
  - 직원 관리 (staff_manage 권한)
  - 병원 설정 (clinic_settings 권한)
  - 통계 분석 (예정)
  - 시스템 설정 (예정)
- **권한**: staff_manage 또는 clinic_settings 권한 보유자

#### 6.2.3 `/master` (마스터 관리)
- **설명**: 전체 시스템 관리
- **탭**:
  - 승인 대기
  - 개요
  - 병원 관리
  - 사용자 관리
  - 통계
- **권한**: role='master'만

#### 6.2.4 `/admin` (관리자) [개발 중]
- **설명**: master_admin 전용 고급 관리 기능
- **권한**: role='master_admin'만

---

## 7. 주요 사용자 플로우

### 7.1 신규 치과 등록 플로우
```
1. 랜딩 페이지 접속
2. "회원가입" 클릭
3. 이메일, 비밀번호, 이름, 전화번호 입력
4. "새 병원 만들기" 선택
5. 병원 정보 입력 (병원명, 주소, 전화번호 등)
6. 역할 자동 설정 (Owner)
7. 가입 완료
8. 승인 대기 페이지로 이동 (자동 승인 또는 Master 승인 필요)
9. 승인 후 대시보드 접속 가능
```

### 7.2 기존 치과 직원 가입 플로우
```
1. 랜딩 페이지 접속
2. "회원가입" 클릭
3. 이메일, 비밀번호, 이름, 전화번호 입력
4. "기존 병원 선택" 선택
5. 병원 목록에서 소속 병원 선택
6. 역할 선택 (vice_director/manager/team_leader/staff)
7. 가입 완료
8. 승인 대기 페이지로 이동
9. Owner의 승인 대기
10. 승인 후 대시보드 접속 가능
```

### 7.3 일일 업무 플로우
```
1. 로그인
2. 대시보드 접속
3. "일일 보고서 입력" 탭 선택
4. 오늘 날짜 자동 설정
5. 환자 상담 내역 입력
   - 환자명, 상담 내용, 진행/보류, 비고
6. 선물 증정 내역 입력
   - 환자명, 선물 종류, 수량, 리뷰 여부
7. 해피콜 내역 입력
   - 환자명, 치료 내역, 메모
8. 리콜 현황 입력
   - 리콜 연락 수, 예약 수
9. 특이사항 입력
10. "저장하기" 클릭
11. 성공 메시지 확인
12. 통계 탭에서 결과 확인
```

### 7.4 직원 관리 플로우 (Owner)
```
1. 관리 페이지 접속 (/management)
2. "직원 관리" 탭 선택
3. 승인 대기 목록 확인
4. 신규 가입 직원 정보 검토
5. 승인 또는 거절 선택
6. (승인 시) 기본 권한 확인
7. (필요 시) 세부 권한 커스터마이징
8. 저장
9. 직원에게 알림 (이메일 또는 시스템 내)
```

---

## 8. API 구조

### 8.1 Authentication APIs
- `signInWithPassword(email, password)`: 로그인
- `signUp(email, password, metadata)`: 회원가입
- `signOut()`: 로그아웃
- `resetPasswordForEmail(email)`: 비밀번호 재설정 요청
- `updateUser(updates)`: 사용자 정보 업데이트

### 8.2 Data Service APIs

#### 8.2.1 User & Clinic
- `getUserProfile()`: 현재 사용자 프로필 조회
- `getUserProfileById(userId)`: 특정 사용자 프로필 조회
- `updateUserProfile(userId, updates)`: 사용자 프로필 업데이트
- `getAllClinics()`: 전체 병원 목록 (Master)
- `getClinicById(clinicId)`: 병원 정보 조회
- `updateClinic(clinicId, updates)`: 병원 정보 업데이트
- `deleteClinic(clinicId)`: 병원 삭제 (Master)

#### 8.2.2 Daily Reports
- `saveReport(data)`: 일일 보고서 저장
- `getDailyReports(clinicId)`: 일일 보고서 목록
- `deleteReportByDate(date, clinicId)`: 특정 날짜 보고서 삭제
- `recalculateDailyReportStats(date, clinicId)`: 통계 재계산

#### 8.2.3 Logs
- `getConsultLogs(clinicId)`: 상담 기록 조회
- `getGiftLogs(clinicId)`: 선물 기록 조회
- `getHappyCallLogs(clinicId)`: 해피콜 기록 조회
- `getInventoryLogs(clinicId)`: 재고 변동 이력

#### 8.2.4 Inventory
- `getGiftInventory(clinicId)`: 재고 목록
- `addGiftItem(name, stock, clinicId)`: 선물 아이템 추가
- `updateStock(itemId, quantity, reason)`: 재고 수정
- `deleteGiftItem(itemId)`: 선물 아이템 삭제

#### 8.2.5 Staff Management
- `getPendingUsers(clinicId)`: 승인 대기 사용자
- `approveUser(userId, clinicId)`: 사용자 승인
- `rejectUser(userId, clinicId, reason)`: 사용자 거절
- `updateUserPermissions(userId, permissions)`: 권한 수정
- `getAllUsers()`: 전체 사용자 (Master)
- `getUsersByClinic(clinicId)`: 병원별 사용자

#### 8.2.6 System
- `getSystemStatistics()`: 시스템 통계 (Master)
- `updateClinicStatus(clinicId, status)`: 병원 상태 변경 (Master)
- `deleteUser(userId)`: 사용자 삭제 (Master)

---

## 9. 보안 및 규정 준수

### 9.1 데이터 보안
- **암호화**:
  - 비밀번호는 Supabase Auth를 통해 bcrypt 해시 저장
  - HTTPS 통신 강제
- **인증**:
  - JWT 기반 세션 관리
  - 세션 만료 시간 설정
- **권한 검증**:
  - 모든 API 호출 시 권한 확인
  - Row Level Security (RLS) 정책 적용

### 9.2 개인정보 보호
- **수집 정보**: 이름, 이메일, 전화번호, IP 주소
- **보관 기간**: 회원 탈퇴 시까지
- **제3자 제공**: 없음 (Supabase 호스팅 제외)
- **환자 정보**:
  - 환자명만 저장 (의료 정보 미저장)
  - 필요 시 익명화 처리

### 9.3 감사 로그
- **대상 작업**:
  - 로그인/로그아웃
  - 데이터 생성/수정/삭제
  - 권한 변경
  - 병원 상태 변경
- **로그 내용**:
  - 사용자 ID
  - 병원 ID
  - 작업 유형
  - 대상 리소스
  - IP 주소
  - User Agent
  - 타임스탬프

---

## 10. 성능 요구사항

### 10.1 응답 시간
- **페이지 로딩**: 2초 이내
- **API 응답**: 500ms 이내
- **데이터 조회**: 1초 이내
- **대시보드 렌더링**: 3초 이내

### 10.2 동시 사용자
- **목표**: 병원당 10명 동시 접속
- **전체 시스템**: 100개 병원, 1000명 동시 사용자 지원

### 10.3 데이터 용량
- **일일 보고서**: 병원당 1일 1건
- **상세 기록**: 병원당 하루 평균 50건
- **1년 데이터 용량**: 병원당 약 20MB

---

## 11. UI/UX 가이드라인

### 11.1 디자인 원칙
- **심플함**: 필수 기능에 집중, 복잡성 제거
- **직관성**: 의료 종사자가 쉽게 사용 가능
- **일관성**: 모든 페이지에서 통일된 UI/UX
- **접근성**: 모바일 반응형 디자인

### 11.2 컬러 팔레트
- **Primary**: Blue (#3B82F6)
- **Secondary**: Slate (#64748B)
- **Success**: Green (#10B981)
- **Warning**: Yellow (#F59E0B)
- **Error**: Red (#EF4444)
- **Background**: Slate-50 (#F8FAFC)

### 11.3 타이포그래피
- **Font**: System Font Stack (sans-serif)
- **Heading**: Bold, 24-32px
- **Body**: Regular, 14-16px
- **Small**: 12-14px

### 11.4 컴포넌트
- **버튼**: 둥근 모서리, hover 효과
- **입력 필드**: 경계선, focus 상태 명확
- **카드**: 그림자 효과, 둥근 모서리
- **테이블**: 줄무늬, hover 효과
- **모달**: 중앙 정렬, 배경 dimming

---

## 12. 향후 개발 계획

### 12.1 Phase 1 (현재)
- ✅ 기본 인증 시스템
- ✅ 일일 보고서 작성/조회
- ✅ 통계 기능 (주간/월간/연간)
- ✅ 재고 관리
- ✅ 직원 관리
- ✅ 권한 시스템
- ✅ 마스터 관리 기능

### 12.2 Phase 2 (다음 분기)
- [ ] 예약 관리 시스템
- [ ] 환자 데이터베이스
- [ ] 치료 기록 관리
- [ ] 청구 및 결제 관리
- [ ] 알림 시스템 (이메일/SMS)
- [ ] 모바일 앱 (React Native)

### 12.3 Phase 3 (향후 6개월)
- [ ] AI 기반 예약 최적화
- [ ] 환자 만족도 분석
- [ ] 매출 예측 및 분석
- [ ] 다국어 지원
- [ ] 외부 시스템 연동 (차트 시스템 등)
- [ ] 화상 상담 기능

### 12.4 Phase 4 (장기)
- [ ] 병원 간 네트워크 기능
- [ ] 진료 의뢰 시스템
- [ ] 공급 업체 통합
- [ ] 빅데이터 분석
- [ ] 마케팅 자동화

---

## 13. 성공 지표 (KPI)

### 13.1 비즈니스 지표
- **등록 병원 수**: 월 10개 이상
- **활성 사용자 수**: 병원당 평균 5명
- **일일 보고서 작성률**: 90% 이상
- **사용자 유지율**: 80% 이상 (3개월 기준)
- **고객 만족도**: 4.5/5.0 이상

### 13.2 기술 지표
- **서버 가동률**: 99.9%
- **평균 응답 시간**: 500ms 이하
- **에러율**: 0.1% 이하
- **페이지 로드 시간**: 2초 이하

### 13.3 사용성 지표
- **일일 활성 사용자**: 전체 사용자의 60%
- **세션 시간**: 평균 15분
- **기능 사용률**: 모든 주요 기능 50% 이상

---

## 14. 지원 및 문서화

### 14.1 사용자 문서
- **사용 안내**: 앱 내 Guide 탭
- **FAQ**: 자주 묻는 질문
- **비디오 튜토리얼**: 주요 기능별 (예정)

### 14.2 개발자 문서
- **API 문서**: 각 함수 JSDoc 주석
- **컴포넌트 문서**: PropTypes 및 설명
- **데이터베이스 스키마**: ERD 다이어그램 (예정)
- **배포 가이드**: Vercel 배포 절차

### 14.3 고객 지원
- **이메일 지원**: support@dentalmanager.com (예정)
- **채팅 지원**: 앱 내 라이브 챗 (예정)
- **전화 지원**: 영업시간 내 (예정)

---

## 15. 라이센스 및 저작권

### 15.1 소프트웨어 라이센스
- **라이센스**: MIT License (또는 상업용 라이센스)
- **저작권**: © 2024 덴탈매니저. All rights reserved.

### 15.2 오픈소스 라이센스
- Next.js: MIT License
- React: MIT License
- Supabase: Apache 2.0 License
- Tailwind CSS: MIT License
- Heroicons: MIT License
- Lucide React: ISC License

---

## 16. 연락처 및 팀

### 16.1 프로젝트 정보
- **프로젝트명**: 덴탈매니저 (Dental Clinic Manager)
- **버전**: 0.1.0
- **개발 기간**: 2024.09 - 현재
- **저장소**: [GitHub Repository URL]

### 16.2 팀 구성
- **개발**: [개발자 이름]
- **디자인**: [디자이너 이름]
- **기획**: [기획자 이름]
- **PM**: [프로젝트 매니저]

---

## 변경 이력

### v0.1.0 (2024-10-16)
- 초기 PRD 문서 작성
- 프로젝트 분석 완료
- 주요 기능 및 데이터베이스 스키마 정의
