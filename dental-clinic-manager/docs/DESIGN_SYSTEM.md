# 클리닉 매니저 디자인 시스템

> **기준 페이지**: 일일 업무 보고서 (`DailyInputForm.tsx`)  
> **디자인 베이스**: Airtable Design System (AT Tokens)  
> **목적**: 모든 콘텐츠 페이지의 시각적 일관성 확보

---

## 목차

1. [디자인 철학](#1-디자인-철학)
2. [컬러 토큰](#2-컬러-토큰)
3. [타이포그래피](#3-타이포그래피)
4. [간격 & 레이아웃](#4-간격--레이아웃)
5. [컴포넌트 패턴](#5-컴포넌트-패턴)
6. [인터랙션 & 상태](#6-인터랙션--상태)
7. [반응형 설계](#7-반응형-설계)
8. [접근성 원칙](#8-접근성-원칙)
9. [UX 설계 원칙](#9-ux-설계-원칙)
10. [사용 금지 패턴](#10-사용-금지-패턴)

---

## 1. 디자인 철학

### 핵심 가치

| 가치 | 설명 |
|------|------|
| **명확성 (Clarity)** | 치과 데스크 직원이 빠르게 정보를 파악하고 업무를 처리할 수 있어야 한다 |
| **일관성 (Consistency)** | 어느 페이지를 봐도 같은 패턴, 같은 색상, 같은 간격을 경험한다 |
| **효율성 (Efficiency)** | 최소한의 클릭과 스크롤로 원하는 작업을 완료할 수 있어야 한다 |
| **신뢰성 (Trust)** | 상태 피드백(로딩·성공·오류)이 명확해서 사용자가 시스템을 신뢰한다 |

### 게슈탈트(Gestalt) 적용 원칙

- **근접성(Proximity)**: 연관된 정보는 시각적으로 가까이 배치, 섹션 간 `space-y-6`으로 구분
- **유사성(Similarity)**: 같은 종류의 요소(버튼, 인풋, 카드)는 항상 같은 모양
- **연속성(Continuity)**: 섹션 헤더 → 콘텐츠의 일관된 흐름 유지
- **폐쇄성(Closure)**: 카드와 섹션의 명확한 경계(`border-at-border`, `rounded-xl`)

---

## 2. 컬러 토큰

> 모든 색상은 `globals.css`의 CSS 변수에서 정의되며 Tailwind 유틸리티로 사용한다.  
> **하드코딩된 색상값(#hex, rgb()) 사용 금지** — 반드시 토큰을 사용할 것.

### 텍스트 색상

| 토큰 | 클래스 | HEX / 투명도 | 사용 용도 |
|------|--------|------------|---------|
| Primary | `text-at-text` | `#181d26` | 주요 제목, 중요 데이터, 레이블 |
| Secondary | `text-at-text-secondary` | `rgba(4,14,32,0.69)` | 일반 본문, 설명 텍스트 |
| Weak | `text-at-text-weak` | `rgba(4,14,32,0.5)` | 보조 정보, 플레이스홀더, 상태 표시 |

**사용 기준**: 중요도 순으로 text → text-secondary → text-weak 계층 구성

### 액센트 색상 (Primary Brand)

| 토큰 | 클래스 | 사용 용도 |
|------|--------|---------|
| Accent | `bg-at-accent` / `text-at-accent` | 주요 CTA 버튼, 강조 아이콘, 섹션 번호 |
| Accent Hover | `bg-at-accent-hover` | 버튼 호버 상태 |
| Accent Light | `bg-at-accent-light` | 아이콘 배지 배경, 태그 배경 |
| Accent Tag | `bg-at-tag` | 선택된 태그, 호버 시 accent-light 대체 |

### 서피스 색상 (배경)

| 토큰 | 클래스 | HEX | 사용 용도 |
|------|--------|-----|---------|
| Surface | `bg-at-surface` | `#ffffff` | 주요 콘텐츠 영역 배경 |
| Surface Alt | `bg-at-surface-alt` | `#f8fafc` | 카드 내부 구분, 테이블 헤더 |
| Surface Hover | `bg-at-surface-hover` | `#f0f4f8` | 행 호버, 버튼 호버 배경 |

### 보더 색상

| 토큰 | 클래스 | HEX | 사용 용도 |
|------|--------|-----|---------|
| Border | `border-at-border` | `#e0e2e6` | 인풋 테두리, 섹션 구분선, 카드 경계 |

### 시맨틱 색상 (상태 표현)

| 상태 | 텍스트 클래스 | 배경 클래스 | 실제 색상 | 사용 용도 |
|------|------------|----------|---------|---------|
| 성공 | `text-at-success` | `bg-at-success-bg` | `#1b7a3d` / `#e6f4ea` | 저장 완료, 정상 상태, 활성 배지 |
| 경고 | `text-at-warning` | `bg-at-warning-bg` | `#c4720a` / `#fef7e0` | 주의 필요, 업데이트 알림 |
| 오류 | `text-at-error` | `bg-at-error-bg` | `#c5221f` / `#fce8e6` | 오류, 삭제, 위험 작업 |
| 보라 | `text-at-purple` | — | `#6b3fa0` | 특수 구분, 마스터 권한 |

### 색상 사용 원칙 (색채 심리학 적용)

```
파란색(at-accent)  → 신뢰, 행동 유도 → 주요 버튼, 링크
초록색(at-success) → 안전, 완료     → 저장 성공, 정상 상태
노란색(at-warning) → 주의, 변화     → 알림, 업데이트 필요
빨간색(at-error)   → 위험, 오류     → 삭제 확인, 에러 메시지
흰색(at-surface)   → 깔끔, 집중     → 주요 콘텐츠 배경
회색(at-surface-alt)→ 중립, 구분   → 보조 영역, 비활성 상태
```

---

## 3. 타이포그래피

### 타입 스케일

| 역할 | 클래스 | 사용 위치 |
|------|--------|---------|
| 페이지 제목 | `text-lg font-bold text-at-text` | 페이지 헤더 H2 — 서브탭 없는 페이지에만 사용 |
| 섹션 제목 | `text-sm sm:text-base font-semibold text-at-text` | SectionHeader H3 |
| 레이블 | `text-sm font-medium text-at-text` | 폼 레이블, 카드 헤딩 |
| 본문 | `text-sm text-at-text` | 일반 데이터, 리스트 항목 |
| 보조 텍스트 | `text-xs text-at-text-secondary` | 설명, 힌트 |
| 약한 텍스트 | `text-xs text-at-text-weak` | 플레이스홀더 대체, 메타 정보 |
| 강조 숫자/배지 | `text-2xl font-bold text-at-text` | 요약 카드 수치 |

### 타이포그래피 원칙

1. **대비(Contrast)**: 제목과 본문 사이 font-weight 최소 2단계 차이 유지
2. **일관성**: 동일 계층의 요소는 동일 타입 스케일
3. **한국어 최적화**: `letter-spacing: 0.08px` (body 기본값 적용됨)
4. **모바일 확대 방지**: 폼 요소 `font-size: 16px` (globals.css에 적용됨)

---

## 4. 간격 & 레이아웃

### 페이지 구조 (필수 준수)

페이지 유형에 따라 두 가지 패턴을 사용한다.

#### 패턴 A — 일반 콘텐츠 페이지 (서브탭 없음)

```tsx
// ✅ 서브탭이 없는 단일 콘텐츠 페이지
<div className="p-4 sm:p-6 space-y-6 bg-white min-h-screen">
  {/* 콘텐츠 섹션들 */}
</div>
```

| 속성 | 값 | 이유 |
|------|-----|------|
| `p-4 sm:p-6` | 모바일 16px, 데스크탑 24px | 충분한 여백으로 콘텐츠 집중도 향상 |
| `space-y-6` | 섹션 간 24px 간격 | 게슈탈트 근접성: 섹션 분리 명확화 |
| `bg-white` | 흰 배경 | 서피스 계층 구분 (sidebar는 at-surface) |
| `min-h-screen` | 최소 전체 높이 | 짧은 콘텐츠에서 배경 끊김 방지 |

#### 패턴 B — 서브탭 네비게이션 페이지 (필수 준수)

서브탭이 있는 페이지는 **페이지 제목 헤더를 표시하지 않는다.**
탭 자체가 현재 섹션을 명확히 나타내므로 제목 헤더는 중복이며 불필요한 공간을 차지한다.

```tsx
// ✅ 서브탭 페이지의 표준 구조
<div className="bg-white min-h-screen">
  {/* 서브탭 네비게이션 — sticky 고정 */}
  <div className="sticky top-14 z-10 bg-white border-b border-at-border px-4 sm:px-6 pt-4 pb-3 flex flex-wrap gap-2">
    {tabs.map((tab) => (
      <button
        key={tab.id}
        onClick={() => setActiveTab(tab.id)}
        className={`py-2 px-4 inline-flex items-center rounded-lg font-medium text-sm transition-all ${
          activeTab === tab.id
            ? 'bg-at-accent-light text-at-accent'
            : 'text-at-text-weak hover:text-at-text-secondary hover:bg-at-surface-alt'
        }`}
      >
        <tab.icon className="w-4 h-4 mr-2" />
        {tab.label}
      </button>
    ))}
  </div>

  {/* 탭 콘텐츠 */}
  <div className="p-4 sm:p-6">
    {/* 활성 탭 콘텐츠 */}
  </div>
</div>
```

| 속성 | 값 | 이유 |
|------|-----|------|
| `sticky top-14` | 헤더(56px) 바로 아래 고정 | 스크롤해도 탭 항상 접근 가능 |
| `z-10` | 콘텐츠 위에 렌더링 | 스크롤 중 콘텐츠가 탭을 덮지 않도록 |
| `bg-white` | 흰 배경 | sticky 시 콘텐츠가 비치지 않도록 차단 |
| `border-b border-at-border` | 하단 구분선 | 탭 영역과 콘텐츠 시각적 분리 |
| `px-4 sm:px-6 pt-4 pb-3` | 콘텐츠와 동일한 좌우 패딩, 상하 여백 | 탭이 콘텐츠와 정렬되어 보임 |
| 탭 콘텐츠 `p-4 sm:p-6` | 패턴 A와 동일한 패딩 | 전체 페이지 여백 일관성 유지 |

**적용 페이지**: 출근 관리, 게시판, 마케팅, 통계 등 서브탭이 2개 이상인 모든 페이지.

#### ❌ 금지 패턴: 서브탭 페이지에 페이지 제목 헤더 사용

```tsx
// ❌ 서브탭이 있는 페이지에 페이지 제목 헤더 추가 — 금지
<div className="p-4 sm:p-6 space-y-6 bg-white min-h-screen">
  {/* ❌ 서브탭 페이지에서 이 헤더는 중복이며 제거해야 함 */}
  <div className="flex items-center gap-3 pb-4 border-b border-at-border">
    <div className="w-8 h-8 bg-at-accent-light rounded-lg ...">
      <Icon className="w-4 h-4 text-at-accent" />
    </div>
    <h2 className="text-lg font-bold text-at-text">페이지 제목</h2>
  </div>

  {/* 서브탭 네비게이션 */}
  <div className="flex flex-wrap gap-2 pb-4 border-b border-at-border">
    ...
  </div>
</div>
```

**이유**: 서브탭 자체가 현재 컨텍스트를 나타내므로 제목이 중복된다. 스크롤 없이 더 많은 콘텐츠를 보여주고 페이지 구조를 단순화한다.

### 간격 스케일

```
4px  → gap-1,  p-1,  m-1   (아이콘 내부 여백)
8px  → gap-2,  p-2,  m-2   (인라인 요소 간격)
12px → gap-3,  p-3,  m-3   (카드 내부 패딩)
16px → gap-4,  p-4,  m-4   (섹션 내부 / 모바일 페이지 패딩)
20px → gap-5                (중간 섹션 간격)
24px → gap-6,  p-6,  m-6   (섹션 간 / 데스크탑 페이지 패딩)
```

### 그리드 패턴

```tsx
// 2컬럼 반응형 (폼 필드)
<div className="grid grid-cols-1 md:grid-cols-2 gap-4">

// 3컬럼 균등 (요약 카드)
<div className="grid grid-cols-3 gap-3">

// 4컬럼 균등 (통계)
<div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
```

---

## 5. 컴포넌트 패턴

### 5.1 페이지 헤더

**서브탭이 없는 단일 콘텐츠 페이지**의 최상단에 위치. 페이지 제목 + 우측 액션 버튼 구성.  
> ⚠️ **서브탭이 있는 페이지에는 사용하지 않는다.** → 4장 패턴 B 참조

```tsx
<div className="flex items-center justify-between pb-4 border-b border-at-border">
  <div className="flex items-center gap-3">
    {/* 아이콘 배지 */}
    <div className="w-8 h-8 bg-at-accent-light rounded-lg flex items-center justify-center">
      <IconComponent className="w-4 h-4 text-at-accent" />
    </div>
    {/* 페이지 제목 */}
    <h2 className="text-lg font-bold text-at-text">페이지 제목</h2>
  </div>
  {/* 우측 액션 (선택사항) */}
  <div className="flex items-center gap-2">
    {/* 상태 배지 또는 버튼 */}
  </div>
</div>
```

### 5.2 섹션 헤더 (SectionHeader)

페이지 내 각 섹션을 구분하는 컴포넌트. 번호 + 아이콘 + 제목 패턴.

```tsx
// 단순 섹션 헤더 (우측 버튼 없음)
<div className="flex items-center space-x-2 sm:space-x-3 pb-2 sm:pb-3 mb-3 sm:mb-4 border-b border-at-border">
  <div className="flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-at-accent-light text-at-accent">
    <IconComponent className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
  </div>
  <h3 className="text-sm sm:text-base font-semibold text-at-text">
    <span className="text-at-accent mr-1">1.</span>
    섹션 제목
  </h3>
</div>

// 우측 버튼 포함 섹션 헤더
<div className="flex items-center justify-between pb-2 sm:pb-3 mb-3 sm:mb-4 border-b border-at-border">
  <div className="flex items-center space-x-2 sm:space-x-3">
    <div className="flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-at-accent-light text-at-accent">
      <IconComponent className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
    </div>
    <h3 className="text-sm sm:text-base font-semibold text-at-text">
      <span className="text-at-accent mr-1">2.</span>
      섹션 제목
    </h3>
  </div>
  <GhostButton />  {/* 우측 보조 액션 */}
</div>
```

### 5.3 버튼

#### Primary Button (주요 액션 — 저장, 제출)

```tsx
<button
  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 sm:py-2 
             bg-at-accent hover:bg-at-accent-hover text-white text-sm font-medium 
             rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
>
  <SaveIcon className="w-4 h-4" />
  저장
</button>
```

#### Secondary Button (보조 액션 — 취소, 뒤로)

```tsx
<button
  className="inline-flex items-center justify-center gap-2 px-4 py-2.5 sm:py-2
             border border-at-border bg-white hover:bg-at-surface-alt text-sm 
             font-medium text-at-text rounded-xl transition-colors 
             disabled:opacity-50 disabled:cursor-not-allowed"
>
  취소
</button>
```

#### Ghost Button (텍스트 강조 — 링크형, 섹션 내 액션)

```tsx
<button
  className="inline-flex items-center gap-1 sm:gap-1.5 px-2 sm:px-3 py-1 sm:py-1.5 
             text-xs sm:text-sm font-medium text-at-accent bg-at-accent-light 
             hover:bg-at-tag border border-at-border rounded-xl transition-colors 
             group disabled:opacity-50 disabled:cursor-not-allowed"
>
  <span>액션 텍스트</span>
  <Icon className="w-3 h-3 sm:w-3.5 sm:h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
</button>
```

#### Danger Button (삭제, 위험 작업)

```tsx
<button
  className="inline-flex items-center justify-center gap-2 px-4 py-2 
             bg-at-error hover:bg-red-700 text-white text-sm font-medium 
             rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
>
  삭제
</button>
```

#### 버튼 설계 원칙

- **터치 타겟 최소 44px**: 모바일에서 `py-2.5`(10px × 2) + 텍스트로 44px 확보
- **아이콘 + 텍스트**: 아이콘 단독 버튼은 `title` 속성 필수
- **상태 피드백**: `disabled:opacity-50 disabled:cursor-not-allowed` 항상 포함
- **전환 효과**: `transition-colors` 항상 포함 (200ms 기본값)

### 5.4 폼 요소

#### 텍스트 인풋 / 날짜 인풋

```tsx
<div>
  <label className="block text-sm font-medium text-at-text mb-1.5">
    레이블 <span className="text-at-error">*</span>  {/* 필수 필드 표시 */}
  </label>
  <input
    type="text"
    placeholder="입력하세요"
    className="w-full px-3 py-2 border border-at-border rounded-xl 
               focus:ring-2 focus:ring-at-accent focus:border-at-accent 
               transition-colors disabled:opacity-50 disabled:cursor-not-allowed
               disabled:bg-at-surface-alt"
  />
</div>
```

#### Select

```tsx
<select
  className="w-full px-3 py-2 border border-at-border rounded-xl 
             focus:ring-2 focus:ring-at-accent focus:border-at-accent 
             transition-colors bg-white"
>
  <option value="">선택하세요</option>
</select>
```

#### Textarea

```tsx
<textarea
  rows={4}
  placeholder="내용을 입력하세요"
  className="w-full px-3 py-2 border border-at-border rounded-xl 
             focus:ring-2 focus:ring-at-accent focus:border-at-accent 
             transition-colors resize-none"
/>
```

#### 폼 설계 원칙

- **레이블 선행**: 인풋 위에 레이블 배치 (오른쪽 배치 금지)
- **레이블 간격**: `mb-1.5` (6px) — 레이블과 인풋의 연관성 명확화
- **포커스 링**: `focus:ring-2 focus:ring-at-accent` 항상 포함 (접근성)
- **둥근 모서리**: `rounded-xl` 통일 — 날카로운 사각형 금지

### 5.5 상태 배지 (Badge)

```tsx
// 성공 배지
<span className="inline-flex items-center px-2 sm:px-3 py-0.5 
                 bg-at-success-bg text-at-success text-xs font-medium rounded-full">
  완료
</span>

// 경고 배지
<span className="inline-flex items-center px-2 sm:px-3 py-0.5 
                 bg-at-warning-bg text-at-warning text-xs font-medium rounded-full">
  주의
</span>

// 중립 배지 (상태)
<span className="inline-flex items-center px-2 sm:px-3 py-1 
                 bg-at-surface-alt text-at-text-weak text-xs rounded-full">
  로딩 중...
</span>

// 기존 데이터 배지
<span className="px-2 sm:px-3 py-1 bg-at-success-bg rounded-full text-at-success text-xs">
  기존 데이터
</span>
```

### 5.6 알림 배너 (Notification Banner)

페이지 내 시스템 알림. 상단 또는 섹션 위에 배치.

```tsx
// 경고 배너 (외부 변경 감지 등)
<div className="bg-at-warning-bg border border-amber-200 px-4 sm:px-6 py-3 rounded-xl">
  <div className="flex items-center justify-between">
    <div className="flex items-center space-x-2">
      <AlertIcon className="w-4 h-4 text-at-warning" />
      <span className="text-sm text-amber-800">알림 메시지</span>
    </div>
    <button className="inline-flex items-center px-3 py-1.5 text-sm font-medium 
                       text-amber-700 bg-amber-100 hover:bg-amber-200 rounded-md transition-colors">
      액션
    </button>
  </div>
</div>

// 정보 배너
<div className="p-3 bg-at-accent-light border border-blue-200 rounded-xl">
  <div className="text-xs font-medium text-at-accent mb-1">제목</div>
  <div className="text-sm text-blue-800">내용</div>
</div>
```

### 5.7 카드 (Summary Card)

요약 수치 표시용.

```tsx
// 요약 수치 카드
<div className="bg-at-surface-alt rounded-xl p-3 text-center">
  <div className="text-2xl font-bold text-at-text">42</div>
  <div className="text-xs text-at-text-secondary mt-0.5">총 환자 수</div>
</div>

// 아이콘 포함 정보 카드
<div className="bg-at-surface-alt rounded-xl p-4 flex items-center gap-3">
  <div className="w-9 h-9 bg-at-accent-light rounded-lg flex items-center justify-center flex-shrink-0">
    <Icon className="w-5 h-5 text-at-accent" />
  </div>
  <div>
    <div className="text-xs text-at-text-weak">레이블</div>
    <div className="text-sm font-semibold text-at-text">값</div>
  </div>
</div>
```

### 5.8 테이블

```tsx
<div className="overflow-x-auto rounded-xl border border-at-border">
  <table className="w-full">
    <thead className="bg-at-surface-alt">
      <tr>
        <th className="px-3 py-2 text-left text-xs font-medium text-at-text-weak uppercase tracking-wider">
          헤더
        </th>
      </tr>
    </thead>
    <tbody className="divide-y divide-at-border bg-white">
      <tr className="hover:bg-at-surface-alt transition-colors">
        <td className="px-3 py-2.5 text-sm text-at-text">데이터</td>
      </tr>
    </tbody>
  </table>
</div>
```

### 5.9 아이콘 배지 (Icon Badge)

```tsx
// 페이지 헤더용 (큰 사이즈)
<div className="w-8 h-8 bg-at-accent-light rounded-lg flex items-center justify-center">
  <Icon className="w-4 h-4 text-at-accent" />
</div>

// 섹션 헤더용 (반응형)
<div className="flex items-center justify-center w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-at-accent-light text-at-accent">
  <Icon className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
</div>
```

---

## 6. 인터랙션 & 상태

### 상태별 UI 처리

| 상태 | 처리 방법 |
|------|---------|
| **로딩** | `animate-spin` 스피너 또는 `bg-at-surface-alt rounded-full text-at-text-weak` 인라인 배지 |
| **비활성(Disabled)** | `disabled:opacity-50 disabled:cursor-not-allowed` + 기능 잠금 |
| **성공** | `bg-at-success-bg text-at-success` 배지 또는 토스트 |
| **오류** | `bg-at-error-bg text-at-error` 배지 + 토스트 |
| **빈 상태(Empty)** | 아이콘 + 안내 문구 + CTA 버튼 조합 |
| **읽기 전용** | 인풋 `disabled` + 시각적 잠금 표시 |

### 호버 & 포커스 효과

```tsx
// 행 호버
"hover:bg-at-surface-alt transition-colors"

// 버튼 호버 + 아이콘 모션
"hover:bg-at-accent-hover transition-colors"
"group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform"

// 포커스 링 (접근성 필수)
"focus:ring-2 focus:ring-at-accent focus:border-at-accent"
```

### 애니메이션 원칙

- **목적 있는 모션만**: 의미 없는 장식적 애니메이션 금지
- **빠르게**: `transition-colors`(200ms), `transition-transform`(200ms) 기본
- **페이드 인**: 탭 전환 시 `animation: fadeIn 0.15s ease-in-out`
- **로딩 스피너**: `animate-spin rounded-full border-b-2 border-at-accent`

---

## 7. 반응형 설계

### 브레이크포인트

| 접두사 | 기준 | 용도 |
|--------|------|------|
| (없음) | 0px~ | 모바일 기본 |
| `sm:` | 640px~ | 태블릿 이상 |
| `md:` | 768px~ | 데스크탑 레이아웃 전환 |
| `lg:` | 1024px~ | 사이드바 고정 표시 |

### 모바일 우선 패턴

```tsx
// 패딩: 모바일 작게 → 데스크탑 크게
"p-4 sm:p-6"
"px-2 sm:px-3"
"py-1 sm:py-1.5"

// 텍스트: 모바일 작게 → 데스크탑 크게
"text-xs sm:text-sm"
"text-sm sm:text-base"

// 아이콘: 모바일 작게 → 데스크탑 크게
"w-3 h-3 sm:w-3.5 sm:h-3.5"
"w-3.5 h-3.5 sm:w-4 sm:h-4"

// 간격: 모바일 작게 → 데스크탑 크게
"gap-1 sm:gap-1.5"
"space-x-2 sm:space-x-3"
"mb-3 sm:mb-4"

// 텍스트 표시/숨김
"hidden sm:inline"   // 모바일 숨김
"sm:hidden"          // 데스크탑 숨김
```

### 반응형 레이아웃 패턴

```tsx
// 폼 그리드: 모바일 1열 → 데스크탑 2열
<div className="grid grid-cols-1 md:grid-cols-2 gap-4">

// 버튼 그룹: 모바일 세로 → 데스크탑 가로
<div className="flex flex-col sm:flex-row gap-2">

// 테이블: 스크롤 처리
<div className="overflow-x-auto">
  <table className="min-w-full">
```

---

## 8. 접근성 원칙

### WCAG 2.1 AA 준수 체크리스트

#### 색상 대비
- 주요 텍스트(`text-at-text` #181d26 on white): **대비율 17:1** ✅
- 보조 텍스트(`text-at-text-secondary`): **대비율 4.8:1** ✅
- 약한 텍스트(`text-at-text-weak`): **대비율 3.8:1** (대형 텍스트 기준 통과) ⚠️ 소형 본문에는 text-secondary 사용

#### 키보드 내비게이션
```tsx
// 포커스 링 필수 — 절대 outline-none만 사용 금지
className="focus:ring-2 focus:ring-at-accent focus:border-at-accent"

// 탭 순서 논리적 배치 (tabIndex 남용 금지)
// 버튼에 명확한 role/aria 속성
<button aria-label="항목 삭제" title="삭제">
```

#### 스크린 리더 지원
```tsx
// 아이콘 전용 버튼
<button aria-label="저장" title="저장">
  <SaveIcon aria-hidden="true" />
</button>

// 로딩 상태
<span aria-live="polite" aria-busy={isLoading}>
  {isLoading ? "로딩 중..." : ""}
</span>

// 폼 연결
<label htmlFor="report-date">보고 일자</label>
<input id="report-date" ... />
```

#### 터치 타겟
- 모든 인터랙티브 요소 최소 **44×44px** (WCAG 2.5.5)
- 버튼 `py-2.5` (10px×2) + 텍스트 높이로 달성

---

## 9. UX 설계 원칙

### 9.1 인지 부하 최소화 (Cognitive Load Reduction)

> 사용자가 UI를 보는 순간 "생각"해야 하는 양을 줄인다.

**적용 방법:**
- **점진적 공개 (Progressive Disclosure)**: 주요 정보 먼저, 세부 정보는 접기/펼치기
- **기본값 스마트 설정**: 날짜 입력란 기본값 = 오늘 날짜
- **명확한 레이블**: 아이콘만 있는 버튼에 `title` 속성 필수
- **오류 예방 > 오류 수정**: 잘못된 입력 전 사전 안내

### 9.2 피드백 즉시성 (Immediate Feedback)

> 사용자가 취한 모든 행동에 즉각적인 시각 응답을 제공한다.

| 액션 | 피드백 |
|------|--------|
| 버튼 클릭 | 즉시 disabled 처리 + 로딩 스피너 |
| 저장 성공 | 성공 토스트 + 배지 상태 변경 |
| 저장 실패 | 오류 토스트 + 인풋 포커스 복원 |
| 폼 유효성 오류 | 오류 인풋 하이라이트 + 메시지 |
| 호버 | 배경색 전환 200ms |
| 포커스 | 파란 링 즉시 표시 |

### 9.3 예측 가능한 패턴 (Predictability)

> 사용자가 다음 동작을 예측할 수 있어야 한다.

- 같은 종류의 버튼 → 항상 같은 위치 (저장은 오른쪽, 취소는 왼쪽)
- 같은 종류의 아이콘 → 항상 같은 의미 (삭제=Trash, 수정=Pencil, 저장=Save)
- 섹션 구조 → 항상 [번호 + 아이콘 + 제목] + [콘텐츠] 형태

### 9.4 오류 복구 용이성 (Error Recovery)

> 실수했을 때 쉽게 되돌릴 수 있어야 한다.

```tsx
// 삭제 확인 다이얼로그 필수
const confirmed = await appConfirm('정말 삭제하시겠습니까?')
if (!confirmed) return

// 되돌리기 가능한 작업은 Undo 제공
// 되돌릴 수 없는 작업은 경고 메시지 강화
```

### 9.5 정보 계층 구조 (Information Hierarchy)

> F패턴/Z패턴으로 시선이 이동함을 고려한 정보 배치.

```
┌─────────────────────────────────────────┐
│ [아이콘] 페이지 제목          [상태 배지] │ ← 시선 최초 도달
├─────────────────────────────────────────┤
│ [1.아이콘] 섹션 제목                     │ ← 섹션 스캔
│  주요 콘텐츠 (폼/테이블)                 │ ← 상세 읽기
├─────────────────────────────────────────┤
│ [2.아이콘] 섹션 제목                     │
│  ...                                    │
├─────────────────────────────────────────┤
│              [취소] [저장]               │ ← CTA 마지막
└─────────────────────────────────────────┘
```

### 9.6 일관성 원칙 (Consistency)

> "이건 어떻게 하지?"라는 질문이 생기지 않도록.

| 패턴 | 일관성 규칙 |
|------|-----------|
| 날짜 형식 | `YYYY-MM-DD` 인풋, 표시는 `YYYY년 MM월 DD일` |
| 숫자 단위 | 금액은 콤마(1,000), 분은 'n분', 개수는 'n개' |
| 확인 메시지 | `appAlert()` / `appConfirm()` 전용 컴포넌트 사용 |
| 오류 표시 | 인라인 `text-at-error text-xs` + 토스트 동시 |

---

## 10. 사용 금지 패턴

### 절대 금지

```tsx
// ❌ 하드코딩된 색상값
className="text-[#1b61c9]"
className="bg-blue-600"
style={{ color: '#181d26' }}

// ❌ px 단위 직접 사용 (Tailwind 아닌 경우)
style={{ padding: '16px' }}

// ❌ 임의 둥근 모서리 (rounded-xl 외)
className="rounded-full"  // 배지/아바타 제외
className="rounded"       // 너무 작음
className="rounded-2xl"   // 너무 큼

// ❌ 아이콘 단독 버튼 (접근성 위반)
<button><TrashIcon /></button>

// ❌ outline-none만 사용 (포커스 링 제거)
className="focus:outline-none"

// ❌ 색상으로만 상태 구분 (색맹 고려)
// → 색상 + 아이콘 + 텍스트 조합 필수
```

### 지양 패턴

```tsx
// ⚠️ 과도한 그림자 (shadow-lg 이상)
// → shadow-at-card 또는 shadow-at-soft만 허용

// ⚠️ 과도한 모션 (transition-all, 300ms 초과)
// → transition-colors, transition-transform 만 사용

// ⚠️ 너무 작은 텍스트 (text-[10px] 등)
// → text-xs(12px) 미만 금지

// ⚠️ 불필요한 border-radius 중복
// → 부모 rounded-xl이면 자식 rounded 불필요

// ⚠️ 모바일에서 가로 스크롤 유발
// → 테이블은 overflow-x-auto 래퍼 필수
```

---

## 부록: 빠른 참조 카드

### 새 페이지 체크리스트

**공통**
- [ ] 서브탭 유무에 따라 패턴 A / B 선택 (4장 참조)
- [ ] 인풋: `border-at-border rounded-xl focus:ring-2 focus:ring-at-accent`
- [ ] Primary 버튼: `bg-at-accent hover:bg-at-accent-hover`
- [ ] 로딩 상태 처리
- [ ] 빈 상태(Empty State) 처리
- [ ] 모바일 반응형 확인 (`sm:` 접두사)
- [ ] 아이콘 버튼 `aria-label` / `title` 포함
- [ ] 삭제/위험 작업 확인 다이얼로그

**패턴 A (서브탭 없음)**
- [ ] 최외곽 래퍼: `p-4 sm:p-6 space-y-6 bg-white min-h-screen`
- [ ] 페이지 헤더: 아이콘 배지 + 제목 + 구분선
- [ ] 섹션 헤더: 번호 + 아이콘 + 제목

**패턴 B (서브탭 있음)**
- [ ] 최외곽 래퍼: `bg-white min-h-screen` (패딩 없음)
- [ ] 서브탭: `sticky top-14 z-10 bg-white border-b border-at-border px-4 sm:px-6 pt-4 pb-3`
- [ ] 탭 버튼: 활성 `bg-at-accent-light text-at-accent`, 비활성 `text-at-text-weak hover:bg-at-surface-alt`
- [ ] 탭 콘텐츠 래퍼: `p-4 sm:p-6`
- [ ] ❌ 페이지 제목 헤더 없음

### 자주 쓰는 스니펫

```tsx
// 스피너
<div className="animate-spin rounded-full h-8 w-8 border-b-2 border-at-accent" />

// 빈 상태
<div className="text-center py-12 text-at-text-weak">
  <Icon className="w-12 h-12 mx-auto mb-3 opacity-40" />
  <p className="text-sm">데이터가 없습니다.</p>
</div>

// 구분선
<div className="border-t border-at-border my-4" />

// 페이드 인 래퍼
<div className="animate-fade-in">...</div>
```

---

---

## 11. UX 감사 — 일일 보고서 개선점

> 일일 보고서(`DailyInputForm.tsx`)를 기준 페이지로 삼되,  
> 아래 문제점은 **이 페이지를 포함한 모든 페이지에서 반복하지 말아야 할 패턴**으로 등록한다.

---

### 11.1 아이콘 중복 사용 금지 ❌

**문제**: 섹션 3(환자 리콜 결과)과 섹션 5(해피콜 결과)가 동일하게 `Phone` 아이콘을 사용한다.  
같은 페이지 내에서 아이콘이 겹치면 사용자는 두 섹션을 시각적으로 구분하지 못한다.

```
게슈탈트 유사성 원칙: 같아 보이는 것은 같은 것으로 인식된다.
→ 다른 섹션엔 반드시 다른 아이콘을 배정할 것
```

| 섹션 | ❌ 현재 | ✅ 권장 |
|------|--------|--------|
| 환자 리콜 결과 | `Phone` | `PhoneCall` (발신 강조) |
| 해피콜 결과 | `Phone` | `HeartHandshake` 또는 `MessageCircle` |

**규칙**: 한 페이지 안에서 동일 아이콘을 두 섹션에 사용 금지.

---

### 11.2 Sticky 저장 버튼 바 (긴 폼 필수) ✅

**문제**: 8개 섹션으로 구성된 긴 폼에서 저장 버튼이 맨 하단에만 존재한다.  
스크롤을 끝까지 내려야만 저장할 수 있어 **작업 효율이 저하**된다.  
특히 모바일에서는 스크롤 거리가 더 길어 심각한 UX 문제다.

**Fitts의 법칙**: 자주 사용하는 버튼은 항상 접근하기 쉬운 위치에 있어야 한다.

```tsx
// ✅ 권장: 하단 sticky 버튼 바
<div className="sticky bottom-0 z-10 px-4 sm:px-6 py-3 sm:py-4 
                bg-white/95 backdrop-blur-sm border-t border-at-border 
                flex flex-col sm:flex-row justify-end gap-2 sm:gap-3
                shadow-[0_-2px_8px_rgba(0,0,0,0.06)]">
  <button ...>초기화</button>
  <button ...>저장하기</button>
</div>

// ❌ 현재: 일반 div (스크롤 따라 사라짐)
<div className="px-3 sm:px-6 py-3 sm:py-4 bg-at-surface-alt border-t border-at-border ...">
```

**적용 기준**: 섹션이 3개 이상이거나 예상 스크롤 높이가 화면의 1.5배 이상인 폼.

---

### 11.3 파괴적 액션 확인 다이얼로그 필수 ✅

**문제**: "초기화" 버튼 클릭 시 확인 다이얼로그 없이 즉시 모든 입력값을 초기화한다.  
실수로 클릭하면 복구 불가능한 데이터 손실이 발생한다.

**Jakob Nielsen — 오류 예방 원칙**: 되돌릴 수 없는 행동 전에는 반드시 확인을 요구하라.

```tsx
// ✅ 권장
const resetForm = async () => {
  const confirmed = await appConfirm(
    '입력된 모든 내용이 초기화됩니다. 계속하시겠습니까?'
  )
  if (!confirmed) return
  // 초기화 로직...
}

// ❌ 현재: 즉시 실행
const resetForm = () => {
  const today = getTodayString()
  setReportDate(today)
  handleDateChange(today)
}
```

**규칙**: 삭제·초기화·되돌릴 수 없는 모든 액션에 `appConfirm()` 필수 적용.

---

### 11.4 빈 상태(Empty State) 텍스트 색상 ✅

**문제**: 빈 상태 메시지에 `text-at-text`(주요 색상)를 사용한다.  
빈 상태는 보조 정보이므로 주요 텍스트와 동일한 강도로 표시하면 시각적 계층이 무너진다.

```tsx
// ❌ 현재
<div className="text-center py-4 text-sm text-at-text">
  이 날짜에 처리된 리콜 기록이 없습니다.
</div>

// ✅ 권장: 아이콘 + 약한 텍스트로 비어 있음을 명확히 표현
<div className="text-center py-8 space-y-2">
  <div className="text-at-text-weak opacity-40">
    <PhoneOff className="w-8 h-8 mx-auto" />
  </div>
  <p className="text-sm text-at-text-secondary">이 날짜에 처리된 리콜 기록이 없습니다.</p>
</div>
```

**규칙**: 빈 상태 텍스트는 `text-at-text-secondary` 또는 `text-at-text-weak` 사용.  
아이콘이 있으면 `opacity-40`으로 비활성 느낌 강화.

---

### 11.5 테이블 헤더 색상 계층 ✅

**문제**: 인라인 테이블 `<th>`에 `text-at-text`(주요 색상)를 사용한다.  
헤더가 데이터와 동일한 색상이면 시각적 계층이 사라져 데이터를 스캔하기 어렵다.

```tsx
// ❌ 현재
<th className="px-3 py-2 text-left text-xs font-medium text-at-text">환자명</th>

// ✅ 권장
<th className="px-3 py-2 text-left text-xs font-medium text-at-text-weak uppercase tracking-wider">
  환자명
</th>
```

**규칙**: 테이블 `<th>`는 반드시 `text-at-text-weak` + `uppercase tracking-wider` 적용.  
데이터(`<td>`)는 `text-at-text` 또는 `text-at-text-secondary` 사용.

---

### 11.6 `rounded-xl` 통일 (rounded-md 금지) ✅

**문제**: 외부 변경 알림 배너 안의 버튼이 `rounded-md`를 사용한다.  
이 프로젝트의 모든 인터랙티브 요소는 `rounded-xl`로 통일되어야 한다.

```tsx
// ❌ 현재
className="... rounded-md transition-colors"

// ✅ 권장
className="... rounded-xl transition-colors"
```

**규칙**: `rounded-sm`, `rounded`, `rounded-md`, `rounded-lg`는 사용 금지.  
예외: 외부 라이브러리 컴포넌트(shadcn 등)의 내부 구현체.

---

### 11.7 토글 버튼 호버 피드백 ✅

**문제**: 리콜 상세 기록 토글 버튼이 `hover:bg-at-surface-alt`인데 기본 배경도 `bg-at-surface-alt`다.  
호버해도 색상 변화가 없어 사용자가 버튼임을 인식하기 어렵다.  
**어포던스(Affordance) 원칙**: 클릭 가능한 요소는 클릭 가능해 보여야 한다.

```tsx
// ❌ 현재: 기본값과 호버값이 동일
className="... bg-at-surface-alt hover:bg-at-surface-alt ..."

// ✅ 권장: 명확한 호버 피드백
className="... bg-at-surface-alt hover:bg-at-surface-hover border border-at-border ..."
```

**규칙**: 버튼의 기본 배경색과 `hover:` 배경색은 반드시 달라야 한다.

---

### 11.8 폼 레이블 누락 금지 (접근성) ✅

**문제**: 특이사항 `<textarea>`에 `id="special-notes"`가 있지만 대응하는 `<label>`이 없다.  
스크린 리더 사용자가 이 필드가 무엇을 입력하는 곳인지 알 수 없다.

```tsx
// ❌ 현재
<textarea id="special-notes" ... />

// ✅ 권장
<div>
  <label htmlFor="special-notes" className="block text-sm font-medium text-at-text mb-1.5">
    기타 특이사항
  </label>
  <textarea id="special-notes" ... />
</div>
```

**규칙**: 모든 폼 요소(`input`, `select`, `textarea`)는 `<label htmlFor>` 연결 필수.  
placeholder는 레이블의 대체재가 아니다.

---

### 11.9 readOnly vs disabled 시각적 구분 ✅

**문제**: `readOnly={isReadOnly}`를 textarea에 적용하지만 시각적 변화가 없다.  
사용자가 수정을 시도했다가 아무 반응이 없으면 혼란스럽다.  
`readOnly`와 `disabled`는 시각적으로 동일하게 처리해야 한다.

```tsx
// ❌ 현재: readOnly만 적용, 시각적 피드백 없음
<textarea readOnly={isReadOnly} className="w-full px-3 py-2 ..." />

// ✅ 권장: 읽기 전용 상태를 시각적으로 명확히 구분
<textarea
  readOnly={isReadOnly}
  className={`w-full px-3 py-2 border border-at-border rounded-xl 
    focus:ring-2 focus:ring-at-accent focus:border-at-accent transition-colors
    ${isReadOnly ? 'bg-at-surface-alt text-at-text-secondary cursor-not-allowed' : 'bg-white'}`}
/>

// + 읽기 전용 상태 안내 배지 (선택)
{isReadOnly && (
  <span className="text-xs text-at-text-weak mt-1 block">읽기 전용 — 수정하려면 편집 권한이 필요합니다.</span>
)}
```

**규칙**: `readOnly` 상태는 `bg-at-surface-alt cursor-not-allowed` 스타일 적용으로 시각화.

---

### 11.10 단일 필드 섹션의 레이아웃 낭비 ✅

**문제**: "기본 정보" 섹션이 `grid-cols-1 md:grid-cols-2`를 사용하지만 실제 필드는 날짜 1개뿐이다.  
데스크탑에서 오른쪽 절반이 완전히 비어 시각적 불균형이 발생한다.

```tsx
// ❌ 현재: 필드 1개에 2컬럼 그리드 → 오른쪽 열 낭비
<div className="grid grid-cols-1 md:grid-cols-2 gap-4">
  <div>
    <label>보고 일자</label>
    <input type="date" ... />
  </div>
  {/* 오른쪽 열 비어있음 */}
</div>

// ✅ 권장 옵션 A: 단일 필드는 max-w 제한
<div className="max-w-xs">
  <label>보고 일자</label>
  <input type="date" ... />
</div>

// ✅ 권장 옵션 B: 관련 요약 정보를 오른쪽에 배치해 공간 활용
<div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-end">
  <div>
    <label>보고 일자</label>
    <input type="date" ... />
  </div>
  <div className="bg-at-surface-alt rounded-xl p-3 text-sm text-at-text-secondary">
    {/* 해당 날짜의 기존 보고서 요약 등 */}
  </div>
</div>
```

**규칙**: 그리드를 사용할 때는 모든 열에 의미 있는 콘텐츠가 있어야 한다.  
단일 필드는 `max-w-xs` 또는 `max-w-sm`으로 너비를 제한할 것.

---

### 감사 결과 요약

| # | 문제 | 심각도 | 영향 범위 |
|---|------|--------|---------|
| 1 | 동일 아이콘 중복 사용 | 🟡 보통 | 시각적 구분 불가 |
| 2 | 저장 버튼 비sticky | 🔴 높음 | 모바일 사용 효율 저하 |
| 3 | 초기화 확인 없음 | 🔴 높음 | 데이터 손실 위험 |
| 4 | 빈 상태 텍스트 색상 | 🟡 보통 | 시각적 계층 혼란 |
| 5 | 테이블 헤더 색상 | 🟡 보통 | 데이터 스캔 어려움 |
| 6 | rounded-md 혼재 | 🟢 낮음 | 일관성 저하 |
| 7 | 토글 호버 피드백 없음 | 🟡 보통 | 클릭 가능 여부 불명확 |
| 8 | 폼 레이블 누락 | 🔴 높음 | 접근성 WCAG 위반 |
| 9 | readOnly 시각적 미구분 | 🟡 보통 | 사용자 혼란 |
| 10 | 단일 필드 2컬럼 낭비 | 🟢 낮음 | 공간 불균형 |

---

*최종 업데이트: 2026-04-13 | 기준: DailyInputForm.tsx + Airtable Design System*
