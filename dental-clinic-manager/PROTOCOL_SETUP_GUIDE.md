# 프로토콜 데이터 설정 가이드

## 문제 상황
- 프로토콜 관리 페이지에서 프로토콜과 카테고리가 보이지 않음
- 데이터베이스에 데이터가 없음

## 원인
- 마이그레이션 파일은 있지만, 기본 데이터가 생성되지 않음
- RLS (Row Level Security) 정책으로 인해 일반 스크립트로는 데이터 생성 불가

## 해결 방법

### 1. Supabase 대시보드 접속
1. https://supabase.com 에 로그인
2. 프로젝트 선택: **beahjntkmkfhpcbhfnrr**
3. 왼쪽 메뉴에서 **SQL Editor** 클릭

### 2. SQL 실행
scripts/create-protocol-data.sql 파일의 SQL을 복사하여 실행하거나, 
아래 명령을 SQL Editor에서 실행:

\`\`\`sql
-- 모든 클리닉에 기본 카테고리 생성
DO $$
DECLARE
  clinic_record RECORD;
BEGIN
  FOR clinic_record IN SELECT id FROM clinics LOOP
    PERFORM create_default_protocol_categories(clinic_record.id);
    RAISE NOTICE 'Created default categories for clinic: %', clinic_record.id;
  END LOOP;
END $$;
\`\`\`

### 3. 결과 확인
- 임플란트, 보철, 치주, 보존, 교정, 구강외과, 소아치과, 예방 카테고리 생성됨
- 앱을 새로고침하면 카테고리가 보임

## 참고
- scripts/create-protocol-data.sql: SQL 스크립트
- scripts/check-protocols.js: 데이터 확인용 Node.js 스크립트
