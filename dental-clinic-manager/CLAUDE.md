# CLAUDE.md - 하얀치과 업무 대시보드

## 프로젝트 개요

하얀치과 데스크 업무를 관리하는 Next.js 기반 실시간 대시보드입니다.

## 기술 스택

- **Frontend**: Next.js 15, React 19, TypeScript
- **Styling**: Tailwind CSS 4
- **Backend**: Supabase (PostgreSQL)
- **UI Components**: shadcn/ui (Radix), Lucide React, Headless UI
- **Rich Text Editor**: TipTap
- **Utilities**: html-to-image, jsPDF, xlsx

## 빠른 명령어

```bash
# 개발 서버 실행
npm run dev

# 프로덕션 빌드
npm run build

# 린트 검사
npm run lint
```

## 프로젝트 구조

```
src/
├── app/              # Next.js App Router 페이지
│   ├── api/          # API 라우트
│   ├── admin/        # 관리자 페이지
│   ├── master/       # 마스터 관리 페이지
│   ├── bulletin/     # 게시판
│   ├── guide/        # 가이드 페이지
│   └── auth/         # 인증 관련
├── components/       # React 컴포넌트
├── contexts/         # React Context
├── hooks/            # 커스텀 훅
├── lib/              # 라이브러리 (Supabase 클라이언트 등)
├── types/            # TypeScript 타입 정의
└── utils/            # 유틸리티 함수

supabase/             # Supabase 마이그레이션 및 설정
scripts/              # 유틸리티 스크립트
```

## 환경 변수

```env
NEXT_PUBLIC_SUPABASE_URL=<supabase_url>
NEXT_PUBLIC_SUPABASE_ANON_KEY=<supabase_anon_key>
DATABASE_URL=postgresql://...pooler.supabase.com:6543/postgres  # Transaction Mode 필수
```

---

## 핵심 개발 원칙

### 1. 기존 기능 보호 (최우선)
- 정상 작동하는 기존 기능 최소한으로만 변경
- 코드 수정 전 반드시 의존성 파악
- 기존 API/데이터 구조 유지 (하위 호환성)
- 공통 함수 동작 변경 금지
- 타입 인터페이스 필드 제거 금지

### 2. 근본 원인 해결
- 5 Whys 기법으로 근본 원인 파악 후 해결
- 임시 방편 금지 → Technical Debt 방지

### 3. 코드 리뷰 필수
- 모든 커밋 전에 자신이 작성한 코드를 리뷰
- 체크리스트: 보안, 성능, 가독성, 테스트, 호환성

---

## 개발 프로세스

### 일반 기능 개발
1. TodoWrite로 계획 수립
2. 테스트 주도 개발 (TDD)
3. 코드 리뷰 (Self-Review)
4. Git commit & push

### 버그 수정
1. 오류 재현 및 로그 확인
2. 5 Whys로 근본 원인 분석
3. 코드 수정
4. 수정 검증
5. 코드 리뷰 (Self-Review)
6. Git commit & push

---

## SQL 마이그레이션 규칙

SQL 마이그레이션 파일 생성 시 **반드시 전체 내용을 코드 블록으로 출력**하여 사용자가 Supabase SQL Editor에서 복사-붙여넣기 가능하도록 할 것.

---

## Git 커밋 규칙

```bash
git commit -m "$(cat <<'EOF'
[type]: [제목]

[상세 설명]
- 변경사항 1
- 변경사항 2
EOF
)"
```

**커밋 타입:**
- `feat`: 새 기능
- `fix`: 버그 수정
- `refactor`: 리팩토링
- `test`: 테스트
- `docs`: 문서
- `perf`: 성능 개선
- `security`: 보안 강화

---

## 코드 리뷰 체크리스트

### 보안 (Security)
- [ ] 환경 변수 노출 없음
- [ ] SQL Injection 방어
- [ ] XSS 방어
- [ ] 민감 정보 로깅 없음

### 성능 (Performance)
- [ ] 불필요한 리렌더링 없음
- [ ] N+1 쿼리 없음
- [ ] 메모리 누수 없음

### 가독성 (Readability)
- [ ] 명확한 변수/함수명
- [ ] 일관된 코드 스타일

### 기존 기능 (Compatibility)
- [ ] 하위 호환성 유지
- [ ] 기존 API 영향 없음
- [ ] 타입 안정성

---

## shadcn/ui 사용 원칙

- 새 기능 개발 시 우선 적용
- 버그 수정 시 해당 컴포넌트만 교체
- 전체 UI 리팩토링 금지 (점진적 적용)

**우선순위:**
1. Button, Input, Select, Dialog (높음)
2. Table, Card, Form (중간)
3. Toast (낮음)

---

## 금지 사항

1. 임시 방편으로 문제 해결 (근본 원인 해결 필수)
2. 테스트 없이 구현
3. 리뷰 없이 커밋
4. WORK_LOG.md 업데이트 생략
5. Git 푸시 생략

---

## 주요 파일 참고

- `middleware.ts` - 인증 미들웨어
- `src/lib/` - Supabase 클라이언트 설정
- `supabase-schema.sql` - 데이터베이스 스키마
- `.claude/WORK_LOG.md` - 작업 로그
- `.claude/commands/` - Claude 커스텀 명령어

---

**마지막 업데이트: 2026-01-13**
