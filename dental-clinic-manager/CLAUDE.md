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

### 4. Chrome DevTools MCP 필수 사용 (모든 오류 수정 시)
- **모든 버그/오류 수정 시 Chrome DevTools MCP로 오류 재현 및 검증 필수**
- 수정 전: 콘솔 로그(`list_console_messages`), 네트워크 요청(`list_network_requests`)으로 오류 재현
- 수정 후: 동일 시나리오로 검증하여 오류 해결 확인
- 추측으로 수정 금지 → 반드시 실제 오류 로그 기반으로 원인 파악

---

## 개발 프로세스

### 필수: 구현-테스트-수정-푸시 사이클 (절대 생략 금지)
**모든 코드 변경 후 반드시 아래 사이클을 정상 작동이 확인될 때까지 반복한 뒤에만 GitHub에 푸시한다.**

```
구현 → 빌드 테스트 → 기능 테스트 → 문제 발견 시 수정 → 다시 테스트 → ... → 정상 작동 확인 → 푸시
```

1. **코드 구현**
2. **빌드 테스트**: `npm run build` 실행 → 컴파일/타입 에러 확인
   - 에러 발생 시 → 수정 → 다시 빌드 (성공할 때까지 반복)
3. **기능 테스트**: dev 서버(`npm run dev`) 실행 후 브라우저에서 실제 동작 확인
   - UI가 의도대로 렌더링되는지 확인
   - 클릭/입력 등 사용자 인터랙션이 정상 동작하는지 확인
   - 데이터 저장/조회가 올바른지 확인
   - 에러 콘솔에 오류가 없는지 확인
   - 문제 발견 시 → 수정 → 2번부터 다시 반복
4. **정상 작동 확인 완료** → Git commit & push to GitHub
5. **푸시 실패 시**: 원인 파악 → 해결(pull --rebase 등) → 다시 push (성공할 때까지 반복, 사용자에게 되묻지 않고 자동 처리)

> **주의**: 빌드만 통과하는 것은 충분하지 않다. 반드시 실제 기능이 정상 작동하는지까지 확인해야 한다.
> **주의**: git push가 실패하면 반드시 원인을 파악하고 해결한 후 재시도하여 푸시를 완료해야 한다. 실패한 채로 두지 않는다.

### 일반 기능 개발
1. 계획 수립
2. 코드 구현
3. **구현-테스트-수정-푸시 사이클 실행 (정상 작동까지 반복)**
4. 정상 작동 확인 후 Git commit & push to GitHub

### 버그 수정
1. **Chrome DevTools MCP로 오류 재현** (콘솔 에러, 네트워크 요청 확인)
2. 5 Whys로 근본 원인 분석
3. 코드 수정
4. **Chrome DevTools MCP로 수정 검증** (동일 시나리오 재실행)
5. **구현-테스트-수정-푸시 사이클 실행 (정상 작동까지 반복)**
6. 정상 작동 확인 후 Git commit & push to GitHub

---

## SQL 마이그레이션 규칙

- **Supabase MCP를 통해 직접 실행**: `mcp__supabase__apply_migration` (DDL) 또는 `mcp__supabase__execute_sql` (DML)을 사용하여 마이그레이션을 직접 적용할 것
- **프로젝트 ID**: `beahjntkmkfhpcbhfnrr` (Dental Clinic Manager)
- SQL 마이그레이션 파일도 `supabase/migrations/` 디렉토리에 함께 생성하여 버전 관리
- 전체 SQL 내용을 코드 블록으로 출력하여 사용자가 확인 가능하도록 할 것

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

**마지막 업데이트: 2026-02-08**
