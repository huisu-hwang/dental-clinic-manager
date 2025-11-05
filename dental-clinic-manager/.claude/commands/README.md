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

## 명령어 목록 (총 10개)

### 📊 Core Development (핵심 개발)

#### 1. `/db-schema` - Database Schema Manager
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

### 🚀 Advanced Development (고급 개발)

#### 7. `/data-migration` - Data Migration Specialist
**역할**: 데이터 마이그레이션 및 백업/복구

**사용 시점**:
- 데이터베이스 스키마 변경 시 기존 데이터 이전
- 대량 데이터 변환
- 백업 및 복구
- 암호화 마이그레이션

**주요 기능**:
- 안전한 마이그레이션 전략
- 롤백 계획
- 데이터 무결성 검증
- 백업/복구 자동화

---

#### 8. `/performance` - Performance Optimization Specialist
**역할**: 성능 최적화 및 모니터링

**사용 시점**:
- 페이지 로딩 속도 개선
- 데이터베이스 쿼리 최적화
- 번들 크기 감소
- Core Web Vitals 개선

**주요 기능**:
- 프론트엔드 최적화 (코드 스플리팅, 이미지 최적화)
- 백엔드 최적화 (인덱스, 캐싱, N+1 쿼리 제거)
- 번들 분석 및 최적화
- 성능 모니터링

---

#### 9. `/api-design` - API Design Specialist
**역할**: RESTful API 설계 및 타입 안전성

**사용 시점**:
- 새 API 엔드포인트 추가
- API 응답 구조 표준화
- 에러 처리 개선
- TypeScript 타입 정의

**주요 기능**:
- RESTful API 설계
- Next.js 15 API Route 템플릿
- 입력값 검증 및 에러 처리
- 인증/인가 미들웨어

---

#### 10. `/code-review` - Code Review Specialist
**역할**: 코드 품질 검토 및 리팩토링

**사용 시점**:
- Pull Request 리뷰
- 코드 리팩토링
- 베스트 프랙티스 적용
- 잠재적 버그 발견

**주요 기능**:
- 코드 품질 체크리스트
- TypeScript 타입 안전성 검토
- React 패턴 검증
- 보안 취약점 발견

---

### 📚 Quality Assurance (품질 보증)

#### 11. `/test-automation` - Test Automation Specialist
**역할**: 테스트 자동화 및 커버리지 관리

**사용 시점**:
- 단위 테스트 작성
- 통합 테스트 작성
- E2E 테스트 자동화
- 테스트 커버리지 확인

**주요 기능**:
- Jest 단위 테스트
- Playwright E2E 테스트
- 테스트 커버리지 관리
- CI/CD 통합

---

#### 12. `/documentation` - Documentation Specialist
**역할**: 문서 작성 및 유지보수

**사용 시점**:
- API 문서 작성
- README 업데이트
- 사용자 가이드 작성
- 코드 주석 추가

**주요 기능**:
- JSDoc API 문서화
- README/CHANGELOG 관리
- 사용자 가이드 작성
- 아키텍처 문서

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

### 데이터 마이그레이션
```
사용자: "주민번호를 암호화해야 해요"

1. /compact
2. /data-migration (데이터 마이그레이션 모드 활성화)
3. 백업 생성
4. 마이그레이션 스크립트 작성
5. 테스트 환경 검증
6. 프로덕션 적용
```

### 성능 최적화
```
사용자: "페이지 로딩이 너무 느려요"

1. /compact
2. /performance (성능 최적화 모드 활성화)
3. Lighthouse 측정
4. 병목 지점 분석
5. 최적화 적용
6. 재측정 및 검증
```

### API 설계
```
사용자: "새로운 평가 API를 만들어줘"

1. /compact
2. /api-design (API 설계 모드 활성화)
3. RESTful 구조 설계
4. TypeScript 타입 정의
5. 검증 및 에러 처리
6. 문서화
```

### 코드 리뷰
```
사용자: "이 코드를 리뷰해줘"

1. /code-review (코드 리뷰 모드 활성화)
2. 코드 품질 체크
3. 리팩토링 제안
4. 보안 검토
5. 개선안 제시
```

### 테스트 작성
```
사용자: "이 함수에 대한 테스트를 작성해줘"

1. /compact
2. /test-automation (테스트 자동화 모드 활성화)
3. 테스트 시나리오 정의
4. 단위 테스트 작성
5. 엣지 케이스 테스트
6. 커버리지 확인
```

### 문서화
```
사용자: "API 문서를 작성해줘"

1. /documentation (문서화 모드 활성화)
2. JSDoc 주석 추가
3. API 엔드포인트 문서 작성
4. 사용 예시 추가
5. README 업데이트
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
    ├── README.md            # 📋 이 파일 (전체 가이드)
    │
    ├── db-schema.md         # 📊 데이터베이스 관리
    ├── security-check.md    # 🔒 보안 검사
    ├── ui-enhance.md        # 🎨 UI 개선
    ├── deploy-fix.md        # 🚀 배포 문제 해결
    ├── feature-dev.md       # ✨ 기능 개발
    ├── bug-fix.md           # 🐛 버그 수정
    │
    ├── data-migration.md    # 🔄 데이터 마이그레이션
    ├── performance.md       # ⚡ 성능 최적화
    ├── api-design.md        # 🔌 API 설계
    ├── code-review.md       # 👀 코드 리뷰
    ├── test-automation.md   # 🧪 테스트 자동화
    └── documentation.md     # 📚 문서화
```

## 명령어 카테고리

### 📊 Core Development (핵심 개발) - 6개
1. `/db-schema` - 데이터베이스
2. `/security-check` - 보안
3. `/ui-enhance` - UI/UX
4. `/deploy-fix` - 배포
5. `/feature-dev` - 기능 개발
6. `/bug-fix` - 버그 수정

### 🚀 Advanced Development (고급 개발) - 4개
7. `/data-migration` - 데이터 마이그레이션
8. `/performance` - 성능 최적화
9. `/api-design` - API 설계
10. `/code-review` - 코드 리뷰

### 📚 Quality Assurance (품질 보증) - 2개
11. `/test-automation` - 테스트 자동화
12. `/documentation` - 문서화

**총 12개 전문 subagent**

## 업데이트 이력

### 2025-11-06 (v2.0)
- 🚀 **6개 추가 subagent 생성** (총 12개)
  - Advanced Development: data-migration, performance, api-design, code-review
  - Quality Assurance: test-automation, documentation
- 📋 README 구조 개선 (카테고리 분류)
- 📁 파일 구조 시각화

### 2025-11-06 (v1.0)
- 초기 subagent 생성
- 6개 핵심 명령어 추가 (Core Development)
- 프로젝트 맞춤형 가이드 작성

---

**모든 개발 작업은 이 subagent들을 활용하여 체계적으로 진행합니다.**
