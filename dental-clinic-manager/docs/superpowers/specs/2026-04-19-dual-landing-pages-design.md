# Dual Landing Pages — Owner / Staff 분리 랜딩 디자인

**작성일**: 2026-04-19
**상태**: 설계 확정
**작업자**: huisu-hwang

## 1. 목표

치과 경영자(대표원장)와 실무자(실장·직원)의 관심사·언어가 다르므로, 단일 랜딩을 두 개의 타깃 랜딩으로 분리한다. 외부에서 무작위로 들어오는 방문자는 역할을 먼저 선택하도록 유도하고, 선택은 재방문 시 자동 복원한다.

**핵심 메시지**
- **대표원장(`/owner`)**: *"능력있는 실장을 엑셀 작업과 연차 계산에 낭비하지 마세요. 잡무는 서비스에 맡기고, 실장은 매출에만 집중하게 하세요."*
- **실장·직원(`/staff`)**: *"출퇴근, 직원 스케쥴에서 연차 관리까지 간단하게 끝내고 정시 퇴근하세요~"*

## 2. 라우팅 & 파일 구조

### 라우팅 (하이브리드)

| 경로 | 역할 | 동작 |
|---|---|---|
| `/` | 역할 선택 페이지 | localStorage에 `clinicmgr.visitor_role`이 있으면 `/owner` 또는 `/staff`로 `router.replace()` 자동 이동. 없으면 선택 카드 2개 표시 |
| `/owner` | 대표원장 랜딩 | 첫 방문 시 `visitor_role='owner'` 저장 |
| `/staff` | 실장·직원 랜딩 | 첫 방문 시 `visitor_role='staff'` 저장 |

- 로그인/회원가입은 기존 쿼리 파라미터 패턴 유지(`?show=login`, `?show=signup`) — 세 페이지 모두에서 동일 동작
- 인증된 사용자가 `/`, `/owner`, `/staff` 접근 시 기존처럼 `/dashboard`로 리디렉션 (변경 없음)
- localStorage 키: `clinicmgr.visitor_role` (값: `'owner' | 'staff'`)
- "선택 기억 해제" 버튼(선택 페이지 footer)으로 localStorage 항목 삭제 가능

### 파일 구조

```
src/app/
  page.tsx                              # RoleSelectorPage (기존 AuthApp 대체)
  owner/page.tsx                        # OwnerLandingPage + AuthFlow 래퍼
  staff/page.tsx                        # StaffLandingPage + AuthFlow 래퍼
src/components/Landing/
  RoleSelector.tsx                      # 선택 카드 UI
  OwnerLanding.tsx                      # 원장용 랜딩 컴포넌트
  StaffLanding.tsx                      # 실장용 랜딩 컴포넌트
  shared/
    LandingHeader.tsx                   # 공통 헤더 (variant: dark | light)
    AuthFlow.tsx                        # landing/login/signup/forgotPassword 상태 래퍼
    useVisitorRole.ts                   # localStorage 헬퍼 (get/set/clear)
    ScrollAnimation.tsx                 # 기존 훅 추출
    TypeWriter.tsx                      # 기존 컴포넌트 추출
    CountUp.tsx                         # 기존 컴포넌트 추출
```

**삭제**
- `src/app/AuthApp.tsx` → `AuthFlow.tsx`로 대체
- `src/components/Landing/LandingPage.tsx` → 사용처 제거 후 삭제

**변경 없음**
- `AuthContext`, `middleware.ts`, `LoginForm`, `SignupForm`, `ForgotPasswordForm`, `Footer`

## 3. 역할 선택 페이지(`/`)

**레이아웃**: 센터 카드 — 최대 넓이 `6xl`, 흰 배경

```
<LandingHeader variant="light" />          # 로고 + 로그인/시작하기
<main>
  <headline>
    먼저 알려주세요 — <span>누구신가요?</span>
    <subtitle>역할에 맞는 페이지로 안내해드립니다</subtitle>
  </headline>
  <cards 2열 그리드>
    <OwnerCard>
      👨‍⚕️ 대표원장
      "병원 경영 · 매출 중심 뷰"
      → /owner (인디고 액센트)
    </OwnerCard>
    <StaffCard>
      🧑‍💼 실장 · 직원
      "출퇴근 · 스케쥴 · 연차"
      → /staff (시안 액센트)
    </StaffCard>
  </cards>
  <foot>
    선택한 페이지는 다음 방문 시 자동으로 열립니다 ·
    <button>선택 기억 해제</button>
  </foot>
</main>
<Footer />
```

**상호작용**
- 카드 클릭 시 `localStorage.setItem('clinicmgr.visitor_role', ...)` 후 `router.push('/owner' | '/staff')`
- 호버 시 약간 상승 + 액센트 컬러 강화
- 마운트 시 `useEffect`로 localStorage 확인 → 있으면 `router.replace()` (히스토리 쌓지 않음)
- 인증 상태 확인 → 인증 시 `/dashboard`로 이동 (기존 AuthApp 로직 유지)

## 4. 대표원장 랜딩(`/owner`)

**톤**: 다크 정숙형, 경영자 언어, 신뢰·무게감
**전체 플로우**: Hero → Problem → Solution → Features → Premium → Trust → CTA → FAQ → Footer

### 4.1 Hero (슬레이트 950 다크 배경)

- 라벨: `FOR CLINIC OWNERS`
- 헤드라인 (3줄, 중간줄 블루→인디고 그라데이션):
  > "능력있는 실장을
  > **엑셀과 연차 계산에**
  > 낭비하지 마세요"
- 서브카피: *"잡무는 시스템에 맡기고, 실장은 매출에만 집중하게 하세요."*
- CTA: `무료로 시작하기` (그라데이션 solid) + `기능 살펴보기` (앵커 스크롤)
- 뱃지: "현직 원장 개발" · "실제 병원 운영 중"
- 스크롤 인디케이터

### 4.2 Problem (슬레이트 900)

- 타이틀: *"실장이 하루에 버리는 시간"*
- 리스트 (아이콘 + 설명):
  - 엑셀 연차 계산
  - 출퇴근 수기 집계
  - 스케쥴 수동 조율
  - 급여 명세서 취합
  - 환자 리콜 추적
  - 선물 재고 확인
  - 상담 기록 정리
- 임팩트: *"이 시간에 실장은 상담 한 건을 더 받을 수 있었습니다."*

### 4.3 Solution (화이트)

- 타이틀: *"잡무는 시스템에게, 실장은 매출에게"*
- Before/After 2카드:
  - **Before**: 반복 업무에 실장의 집중력 소진 (70% 낭비)
  - **After**: 상담·해피콜·매출 관리에 온전히 집중
- 마무리: *"실장의 에너지가 매출로 전환됩니다."*

### 4.4 Features (화이트, 기본 6개 카드)

실제 서비스 기능에 맞춰 조정:

1. 📊 **일일 업무 보고서** — 상담·선물·해피콜·리콜 자동 집계
2. ⏱ **출퇴근 · 근태** — QR 체크인, 팀 현황, 스케쥴
3. 📝 **근로계약서 관리** — 템플릿 기반 계약서 생성·보관 *(기존 "전자서명" 문구 삭제 — 실제 구현과 일치)*
4. 📅 **연차 자동 계산** — 정책·발생·잔여·승인 워크플로우
5. 💰 **급여 명세서** — 자동 생성·배포 *(기존 랜딩 누락분 추가)*
6. 👥 **직원 권한 · 프로토콜** — 역할별 접근 + 업무 표준 문서화

### 4.5 Premium (그라데이션 배경, Features 다음 신규 섹션)

- 헤더: `PREMIUM · 월 ₩499,000`
- 카피: *"경영자의 시간을 위해 준비된 한 단계 더"*
- 3카드:
  1. 🤖 **AI 데이터 분석** — 매출·상담 지표에서 인사이트 자동 추출
  2. 📈 **경영현황 대시보드** — 재무·매출·KPI 한 화면
  3. ✍ **마케팅 자동화** — 네이버 블로그 자동 기획·발행·KPI 추적

### 4.6 Trust (라이트 블루)

- 타이틀: *"현직 치과 원장이 직접 개발 · 본인 병원에서 매일 사용 중"*
- 3가지 증언:
  - 현장의 불편함을 직접 경험하고 해결한 솔루션
  - 본인 병원에서 매일 사용하며 지속 개선
  - 치과 업무 흐름을 정확히 이해한 맞춤형 설계
- 인용: *"직접 쓰면서 불편한 건 바로바로 고칩니다. 제가 매일 쓰니까요."*

### 4.7 CTA (블루→인디고→퍼플 그라데이션)

- 타이틀: *"실장의 시간을 매출로 전환할 때입니다"*
- 서브: 복잡한 설치 없이 웹 브라우저로 즉시 시작
- 버튼: `무료로 시작하기` + `로그인`

### 4.8 FAQ (5개)

1. 설치가 필요한가요?
2. 데이터는 안전한가요?
3. 직원 권한 설정이 가능한가요?
4. 기존 데이터 이전이 가능한가요?
5. **프리미엄 패키지는 무엇이 다른가요?** *(신규)*

## 5. 실장 · 직원 랜딩(`/staff`)

**톤**: 밝은 캐주얼, 파스텔, "~하세요~" 친근한 말투
**플로우**: Hero → 공감 → 해결 → Features → CTA → FAQ → Footer

### 5.1 Hero (파스텔 그라데이션: amber-50 → rose-100 → violet-100)

- 라벨: `FOR STAFF · 실장님, 팀원님`
- 헤드라인 (3줄, 중간줄 핑크→바이올렛 그라데이션):
  > "출퇴근부터 연차까지
  > **간단하게 끝내고**
  > 정시 퇴근하세요 ~"
- 서브카피: *"반복 업무는 앱이 대신합니다. 손 덜 쓰는 하루 루틴."*
- CTA: `지금 시작하기` + `기능 살펴보기`
- 플로팅 이모지 데코 (☕ ✨ 🎈)

### 5.2 공감 (파스텔 배경, 짧은 한 줄)

- *"혹시 오늘도… 퇴근하고 엑셀 켜셨나요?"*
- 서브: 연차 계산, 스케쥴 조율, 업무 집계… 이제 그만 하셔도 됩니다.

### 5.3 해결 (화이트)

- 타이틀: *"클릭 몇 번이면 끝."*
- 3스텝 플로우:
  1. QR로 출근
  2. 하루 업무를 앱에서 관리
  3. QR로 퇴근 · 정시 귀가

### 5.4 Features (실장/직원 관점 6개)

1. ⏱ **QR 출퇴근** — 스마트폰으로 1초 체크인
2. 📅 **스케쥴 · 연차** — 신청·승인까지 앱에서
3. 📊 **일일 업무 보고** — 상담·해피콜·리콜 탭 한 번
4. ✅ **업무 체크리스트** — 오늘 할 일·완료 현황
5. 🎁 **선물 재고** — 실시간 수량 확인
6. 💬 **팀 커뮤니티 · 텔레그램** — 공지·질문·빠른 소통

### 5.5 CTA (시안 → 티얼 그라데이션, 따뜻한 톤)

- 타이틀: *"오늘 퇴근은 정시에"*
- 버튼: `지금 바로 시작` + `로그인`

### 5.6 FAQ (4개)

1. 개인정보가 안전한가요?
2. 휴대폰으로도 잘 되나요?
3. 연차 잔여일은 어떻게 확인하나요?
4. 실수로 출근 체크 빼먹으면요?

## 6. 공통 디자인 토큰

| 용도 | `/owner` | `/staff` |
|---|---|---|
| 히어로 배경 | `slate-950` 다크 | 파스텔 그라데이션(amber-50 → rose-100 → violet-100) |
| 주 액센트 | 블루(#3b82f6) → 인디고(#6366f1) | 핑크(#ec4899) → 바이올렛(#8b5cf6) |
| CTA 버튼 | 그라데이션 솔리드 | 슬레이트-900 + 화이트 보조 |
| 헤더 variant | `dark` | `light` |
| 톤 | 신뢰·경영·무게감 | 가볍고 따뜻함·"~요~" 말투 |

**선택 페이지(`/`)**: 카드별로 위 액센트를 각각 사용해 두 경로를 시각적으로 예고

**타이포 (공통)**
- 헤드라인: `text-4xl sm:text-5xl md:text-6xl lg:text-7xl font-bold leading-[1.15] tracking-tight`
- 서브카피: `text-lg sm:text-xl leading-relaxed`
- 기존 Tailwind 토큰(`at-text`, `at-accent`, `at-border` 등) 유지

## 7. 공유 컴포넌트 계약

### `LandingHeader.tsx`
```ts
interface LandingHeaderProps {
  variant: 'dark' | 'light'
  onShowLogin: () => void
  onShowSignup: () => void
}
```

### `AuthFlow.tsx`
- 기존 `AuthApp.tsx`의 상태 관리 로직(`'landing' | 'login' | 'signup' | 'forgotPassword'`)을 재사용 래퍼로 분리
- `children`이 아닌 **렌더 프롭** 방식으로 랜딩 컴포넌트에 콜백 주입:
  ```tsx
  <AuthFlow>
    {({ onShowLogin, onShowSignup }) => (
      <OwnerLanding onShowLogin={onShowLogin} onShowSignup={onShowSignup} />
    )}
  </AuthFlow>
  ```
- `LoginForm`·`SignupForm`·`ForgotPasswordForm` 전환, `?show=login|signup` 쿼리 파라미터 지원
- 인증된 사용자 → `/dashboard` 리디렉션 (기존 AuthApp 로직 그대로 이식)

### `useVisitorRole.ts`
```ts
type VisitorRole = 'owner' | 'staff'
function useVisitorRole(): {
  role: VisitorRole | null
  setRole: (role: VisitorRole) => void
  clearRole: () => void
}
```
- localStorage 키: `clinicmgr.visitor_role`
- SSR 환경 대응 (hydration mismatch 방지 — 초기값 null 후 useEffect로 읽기)

## 8. 구현 순서

1. `shared/` 공용 유틸 추출 — `useVisitorRole`, `ScrollAnimation`, `TypeWriter`, `CountUp`
2. `AuthFlow.tsx` 작성 (기존 `AuthApp` 로직 이식)
3. `LandingHeader.tsx` 작성
4. `RoleSelector.tsx` + `app/page.tsx` 교체 (자동 리디렉션 포함)
5. `OwnerLanding.tsx` + `app/owner/page.tsx`
6. `StaffLanding.tsx` + `app/staff/page.tsx`
7. 기존 `AuthApp.tsx`, `LandingPage.tsx` 제거
8. `npm run build` — 빌드·타입 에러 확인 및 수정 반복
9. 브라우저 수동 확인:
   - `/` 자동 리디렉션 동작 (localStorage 있음/없음 두 케이스)
   - `/owner`, `/staff` 렌더링 확인
   - 로그인/회원가입 전환(`?show=login`, `?show=signup`)
   - 테스트 계정(`whitedc0902@gmail.com`)으로 로그인 → `/dashboard` 리디렉션
   - 선택 기억 해제 버튼
10. Git commit → `develop` 브랜치 push

## 9. 실제 서비스 대비 보완 사항 (요약)

기존 랜딩에서 수정·보완된 항목:

| 항목 | 변경 |
|---|---|
| 근로계약서 | "전자서명으로 간편하게" → "템플릿 기반 계약서 관리" (구현 상태와 일치) |
| 급여 명세서 | 기존 랜딩 누락 → Features에 추가 |
| 환자 리콜 관리 | 기존 랜딩 미표기 → Problem 리스트·일일보고 설명에 반영 |
| 업무 체크리스트 | 기존 랜딩 미표기 → `/staff` Features에 추가 |
| 선물 재고 관리 | 기존 랜딩 미표기 → Problem·`/staff` Features에 반영 |
| 팀 커뮤니티/텔레그램 | 기존 랜딩 미표기 → `/staff` Features에 추가 |
| 프리미엄 패키지(₩499,000) | 기존 랜딩 미표기 → `/owner` Premium 섹션 신규 |
| AI 분석 / 경영현황 / 마케팅 자동화 | 기존 랜딩 미표기 → `/owner` Premium 섹션 3카드 |

## 10. 범위 외 (YAGNI)

- 로그인/회원가입 UI 자체의 재설계 (기존 그대로 재사용)
- 회원가입 시 역할(owner/staff) prefill — 랜딩은 마케팅 분기일 뿐, 실제 가입 폼은 공통 유지
- `/dashboard` 이후 화면 변경
- `AuthContext`, `middleware.ts` 수정
- 다국어 대응
- 동료 후기 섹션 (실제 후기 확보 후 별도 작업)
