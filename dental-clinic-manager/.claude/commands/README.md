# Claude Code Custom Commands (Subagents)

치과 클리닉 관리 시스템 개발을 위한 전문 subagent들입니다.

## 사용 방법

각 명령어는 `/` 로 시작하여 호출할 수 있습니다:

```
/db-schema
/security-check
/ui-enhance
/deploy-fix
/feature-dev
/bug-fix
```

## 명령어 목록

### 1. `/db-schema` - Database Schema Manager
**역할**: 데이터베이스 스키마 설계 및 관리

**사용 시점**:
- 새로운 테이블 추가
- 컬럼 추가/수정
- RLS 정책 작성
- 인덱스 최적화

**주요 기능**:
- Supabase 스키마 설계
- Migration SQL 작성
- RLS 정책 관리
- 성능 최적화

---

### 2. `/security-check` - Security & Encryption Specialist
**역할**: 보안 취약점 검사 및 암호화

**사용 시점**:
- 민감정보 처리 (주민번호, 개인정보)
- 보안 취약점 검사
- 인증/인가 검증
- 환경변수 보안 확인

**주요 기능**:
- OWASP Top 10 체크
- 암호화 구현
- RLS 정책 검증
- API 보안 검증

---

### 3. `/ui-enhance` - UI/UX Enhancement Specialist
**역할**: 사용자 인터페이스 개선

**사용 시점**:
- shadcn/ui 컴포넌트 적용
- UI 개선 요청
- 반응형 디자인
- 접근성 향상

**주요 기능**:
- shadcn/ui 점진적 적용
- Tailwind CSS 스타일링
- 반응형 디자인
- 접근성(a11y) 개선

---

### 4. `/deploy-fix` - Deployment & Build Specialist
**역할**: 배포 및 빌드 문제 해결

**사용 시점**:
- Vercel 빌드 실패
- 환경변수 문제
- 성능 최적화
- 배포 후 문제 발생

**주요 기능**:
- 빌드 에러 해결
- 환경변수 관리
- Case sensitivity 문제 해결
- Next.js 15 특이사항 대응

---

### 5. `/feature-dev` - Feature Development Specialist
**역할**: 새로운 기능 개발

**사용 시점**:
- 신규 기능 추가
- 기존 기능 확장
- API 추가
- 데이터베이스 스키마 확장

**주요 기능**:
- Sequential Thinking 기반 설계
- TDD 개발
- 기존 기능 보호
- 전체 개발 프로세스 가이드

---

### 6. `/bug-fix` - Bug Fix Specialist
**역할**: 버그 수정 및 디버깅

**사용 시점**:
- 버그 발생
- 오류 재현
- 긴급 핫픽스
- 회귀 테스트

**주요 기능**:
- 버그 재현 및 분석
- 최소 침습적 수정
- Chrome DevTools 활용
- 회귀 방지

---

## 사용 예시

### 새 기능 개발
```
사용자: "직원 평가 기능을 추가하고 싶어요"

1. /compact (컨텍스트 정리)
2. /feature-dev (기능 개발 모드 활성화)
3. Sequential Thinking 자동 시작
4. 단계별 구현
```

### 버그 수정
```
사용자: "로그인 시 무한 로딩이 발생해요"

1. /compact
2. /bug-fix (버그 수정 모드 활성화)
3. Chrome DevTools로 재현
4. 원인 분석 및 수정
```

### UI 개선
```
사용자: "계약서 목록을 shadcn/ui Table로 바꿔주세요"

1. /compact
2. /ui-enhance (UI 개선 모드 활성화)
3. 점진적 적용
4. 기능 테스트
```

### 빌드 에러
```
사용자: "Vercel 빌드가 실패했어요"

1. /deploy-fix (배포 문제 해결 모드 활성화)
2. 빌드 로그 분석
3. 에러 해결
4. 재배포
```

## 개발 방법론

모든 subagent는 `.claude/CLAUDE.md`의 방법론을 따릅니다:

1. **/compact** - 세션 초기화
2. **Sequential Thinking** - 문제 분석
3. **계획 수립** - TodoWrite
4. **TDD** - 테스트 주도 개발
5. **Git Commit & Push** - 자동 백업

## 주의사항

### 기존 기능 보호 원칙
- 최소 침습 원칙
- 영향 범위 분석
- 하위 호환성 유지
- 회귀 테스트

### 금지 사항
- Sequential Thinking 없이 복잡한 기능 구현
- 테스트 없이 배포
- GitHub 푸시 생략
- 기존 기능에 영향주는 무분별한 수정

## 기술 스택

- **Frontend**: Next.js 15.5.3, React 19, TypeScript
- **UI**: Tailwind CSS, shadcn/ui
- **Backend**: Next.js API Routes
- **Database**: Supabase (PostgreSQL)
- **Deployment**: Vercel
- **Tools**: Chrome DevTools MCP, Sequential Thinking MCP

## 파일 구조

```
.claude/
├── CLAUDE.md              # 개발 방법론
├── settings.local.json    # 로컬 설정
└── commands/              # Custom Commands (Subagents)
    ├── README.md         # 이 파일
    ├── db-schema.md      # 데이터베이스 관리
    ├── security-check.md # 보안 검사
    ├── ui-enhance.md     # UI 개선
    ├── deploy-fix.md     # 배포 문제 해결
    ├── feature-dev.md    # 기능 개발
    └── bug-fix.md        # 버그 수정
```

## 업데이트 이력

### 2025-11-06
- 초기 subagent 생성
- 6개 전문 명령어 추가
- 프로젝트 맞춤형 가이드 작성

---

**모든 개발 작업은 이 subagent들을 활용하여 체계적으로 진행합니다.**
