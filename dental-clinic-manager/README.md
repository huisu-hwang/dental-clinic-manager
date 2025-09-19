# 하얀치과 실시간 업무 대시보드

하얀치과 데스크 업무를 관리하는 Next.js 기반 실시간 대시보드입니다.

## 기능

- 📊 **일일 보고서 입력**: 환자 상담, 리콜, 선물/리뷰 관리
- 📈 **통계 기능**: 주간/월간/연간 통계 및 분석
- 📝 **상세 기록**: 모든 업무 기록의 조회 및 관리
- 🎁 **선물 재고 관리**: 치과 선물 아이템의 입출고 관리
- 🔄 **실시간 동기화**: Supabase를 통한 실시간 데이터 동기화

## 기술 스택

- **Frontend**: Next.js 15, React 18, TypeScript
- **Styling**: Tailwind CSS
- **Backend**: Supabase (PostgreSQL)
- **Icons**: Lucide React

## 설치 및 설정

### 1. 프로젝트 클론 및 의존성 설치

```bash
git clone <repository-url>
cd dental-clinic-manager
npm install
```

### 2. Supabase 설정

1. [Supabase](https://supabase.com)에서 새 프로젝트 생성
2. SQL Editor에서 `supabase-schema.sql` 파일의 내용을 실행하여 테이블 생성
3. 프로젝트 설정에서 URL과 anon public key 확인

### 3. 환경 변수 설정

`.env.local` 파일을 생성하고 다음 내용을 추가:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 4. 개발 서버 실행

```bash
npm run dev
```

http://localhost:3000에서 애플리케이션에 접근할 수 있습니다.

## 데이터베이스 스키마

### 테이블 구조

- `daily_reports`: 일일 보고서 종합 데이터
- `consult_logs`: 환자 상담 상세 기록
- `gift_logs`: 선물 증정 및 리뷰 상세 기록
- `gift_inventory`: 선물 재고 관리
- `inventory_logs`: 재고 입출고 기록

### 초기 데이터베이스 설정

1. Supabase 대시보드의 SQL Editor로 이동
2. `supabase-schema.sql` 파일의 내용을 복사하여 실행
3. 모든 테이블과 정책이 성공적으로 생성되었는지 확인

## 사용 방법

### 일일 보고서 입력
1. "일일 보고서 입력" 탭에서 당일 업무 내용 입력
2. 환자 상담 결과, 리콜 현황, 선물 증정 및 리뷰 관리
3. "오늘의 보고서 저장하기" 클릭

### 통계 확인
- 주간/월간/연간 통계를 기간별로 확인
- 상담 진행률, 리콜 예약률, 선물 증정 현황 등

### 재고 관리
- "설정" 탭에서 선물 종류 추가/삭제
- 재고 수량 관리 및 입출고 기록 확인

## 주요 특징

- **실시간 동기화**: 여러 사용자가 동시에 접속해도 실시간으로 데이터 동기화
- **모바일 반응형**: 데스크톱과 모바일 모두에서 사용 가능
- **데이터 무결성**: PostgreSQL과 Supabase RLS로 안전한 데이터 관리
- **타입 안전성**: TypeScript로 개발하여 런타임 오류 최소화

## 배포

### Vercel 배포

```bash
npm run build
npx vercel --prod
```

### 환경 변수 설정
Vercel 대시보드에서 다음 환경 변수 설정:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

## 문제 해결

### 연결 오류
- Supabase URL과 anon key가 올바른지 확인
- 네트워크 연결 상태 확인
- 브라우저 콘솔에서 오류 메시지 확인

### 데이터베이스 오류
- `supabase-schema.sql` 스크립트가 정상 실행되었는지 확인
- RLS 정책이 올바르게 설정되었는지 확인

## 라이센스

MIT License