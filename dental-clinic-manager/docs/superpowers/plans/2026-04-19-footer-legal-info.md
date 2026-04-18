# 법적 필수 정보 푸터 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 대한민국 전자상거래법·정보통신망법·개인정보보호법이 요구하는 사업자 정보를 전체 페이지 하단 푸터로 표시한다.

**Architecture:** 사업자 상수(`company.ts`) → 푸터 컴포넌트(`Footer.tsx`) + 약관 모달(`FooterTermsModal.tsx`). 기존 `termsContent.ts` 콘텐츠를 모달에서 재사용. 각 레이아웃에서 직접 `<Footer />`를 삽입하여 중복 렌더링 없이 전체 페이지에 노출.

**Tech Stack:** Next.js 15, React 19, TypeScript, Tailwind CSS 4

---

## 파일 구조

| 파일 | 작업 |
|------|------|
| `src/constants/company.ts` | 신규 생성 — 사업자 정보 상수 |
| `src/components/Layout/FooterTermsModal.tsx` | 신규 생성 — 약관 모달 |
| `src/components/Layout/Footer.tsx` | 신규 생성 — 푸터 본체 |
| `src/app/dashboard/layout.tsx` | 수정 — `<main>` 하단에 `<Footer />` 추가 |
| `src/app/investment/layout.tsx` | 수정 — `<main>` 하단에 `<Footer />` 추가 |
| `src/app/pending-approval/page.tsx` | 수정 — 페이지 최하단에 `<Footer />` 추가 |
| `src/app/resigned/page.tsx` | 수정 — 페이지 최하단에 `<Footer />` 추가 |
| `src/app/AuthApp.tsx` | 수정 — 인증 페이지(로그인/회원가입) 하단에 `<Footer />` 추가 |

---

## Task 1: 사업자 정보 상수 파일 생성

**Files:**
- Create: `src/constants/company.ts`

- [ ] **Step 1: 파일 생성**

```typescript
// src/constants/company.ts
export const COMPANY = {
  name: '하이클리닉 대부 주식회사',
  ceo: '황희수',
  address: '경기도 용인시 기흥구 동백중앙로 191 802호',
  tel: '1544-7579',
  email: 'hiclinic.inc@gmail.com',
  businessRegNumber: '716-81-02761',
  // 통신판매업 신고번호: 입력 시 자동 노출, 빈 문자열이면 숨김
  mailOrderRegNumber: '',
  copyrightYear: '2026',
} as const
```

- [ ] **Step 2: 빌드 확인**

```bash
npm run build 2>&1 | tail -5
```
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add src/constants/company.ts
git commit -m "feat(footer): 사업자 정보 상수 파일 추가"
```

---

## Task 2: 약관 모달 컴포넌트 생성

**Files:**
- Create: `src/components/Layout/FooterTermsModal.tsx`
- Reference: `src/constants/termsContent.ts` (TERMS_OF_SERVICE, PRIVACY_COLLECTION)

- [ ] **Step 1: 컴포넌트 생성**

```tsx
// src/components/Layout/FooterTermsModal.tsx
'use client'

import { useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { TERMS_OF_SERVICE, PRIVACY_COLLECTION } from '@/constants/termsContent'

interface FooterTermsModalProps {
  type: 'terms' | 'privacy'
  onClose: () => void
  triggerRef: React.RefObject<HTMLButtonElement | null>
}

export default function FooterTermsModal({ type, onClose, triggerRef }: FooterTermsModalProps) {
  const item = type === 'terms' ? TERMS_OF_SERVICE : PRIVACY_COLLECTION
  const modalRef = useRef<HTMLDivElement>(null)

  // Esc 키 닫기 + 포커스 트랩
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    // 모달 열릴 때 스크롤 잠금
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.body.style.overflow = ''
      // 모달 닫힐 때 트리거 버튼으로 포커스 복귀
      triggerRef.current?.focus()
    }
  }, [onClose, triggerRef])

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-label={item.title}
        className="relative bg-at-surface rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-at-border flex-shrink-0">
          <h2 className="text-lg font-semibold text-at-text">{item.title}</h2>
          <button
            onClick={onClose}
            aria-label="닫기"
            className="p-1.5 rounded-lg text-at-text-secondary hover:bg-at-surface-hover transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 본문 */}
        <div className="overflow-y-auto px-6 py-4 flex-1">
          <pre className="whitespace-pre-wrap text-sm text-at-text-secondary font-sans leading-relaxed">
            {item.content}
          </pre>
        </div>

        {/* 푸터 */}
        <div className="px-6 py-4 border-t border-at-border flex-shrink-0">
          <button
            onClick={onClose}
            className="w-full py-2 bg-at-accent text-white rounded-xl text-sm font-medium hover:bg-at-accent/90 transition-colors"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 빌드 확인**

```bash
npm run build 2>&1 | tail -5
```
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add src/components/Layout/FooterTermsModal.tsx
git commit -m "feat(footer): 약관/개인정보처리방침 모달 컴포넌트 추가"
```

---

## Task 3: 푸터 컴포넌트 생성

**Files:**
- Create: `src/components/Layout/Footer.tsx`
- Reference: `src/constants/company.ts`, `src/components/Layout/FooterTermsModal.tsx`

- [ ] **Step 1: 컴포넌트 생성**

```tsx
// src/components/Layout/Footer.tsx
'use client'

import { useState, useRef } from 'react'
import { COMPANY } from '@/constants/company'
import FooterTermsModal from './FooterTermsModal'

type ModalType = 'terms' | 'privacy' | null

export default function Footer() {
  const [modal, setModal] = useState<ModalType>(null)
  const termsButtonRef = useRef<HTMLButtonElement>(null)
  const privacyButtonRef = useRef<HTMLButtonElement>(null)

  const activeTriggerRef = modal === 'terms' ? termsButtonRef : privacyButtonRef

  return (
    <>
      <footer className="mt-auto border-t border-at-border bg-at-surface px-4 py-5 text-center text-xs text-at-text-secondary">
        <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 mb-1.5">
          <span>© {COMPANY.copyrightYear} {COMPANY.name}</span>
          <span className="hidden sm:inline text-at-border">|</span>
          <span>대표이사 {COMPANY.ceo}</span>
          <span className="hidden sm:inline text-at-border">|</span>
          <span>사업자등록번호 {COMPANY.businessRegNumber}</span>
          {COMPANY.mailOrderRegNumber && (
            <>
              <span className="hidden sm:inline text-at-border">|</span>
              <span>통신판매업 {COMPANY.mailOrderRegNumber}</span>
            </>
          )}
        </div>
        <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 mb-2">
          <span>{COMPANY.address}</span>
          <span className="hidden sm:inline text-at-border">|</span>
          <span>Tel. {COMPANY.tel}</span>
          <span className="hidden sm:inline text-at-border">|</span>
          <span>{COMPANY.email}</span>
        </div>
        <div className="flex justify-center gap-4">
          <button
            ref={termsButtonRef}
            onClick={() => setModal('terms')}
            className="underline underline-offset-2 hover:text-at-text transition-colors"
          >
            이용약관
          </button>
          <button
            ref={privacyButtonRef}
            onClick={() => setModal('privacy')}
            className="underline underline-offset-2 hover:text-at-text transition-colors font-semibold"
          >
            개인정보처리방침
          </button>
        </div>
      </footer>

      {modal && (
        <FooterTermsModal
          type={modal}
          onClose={() => setModal(null)}
          triggerRef={activeTriggerRef}
        />
      )}
    </>
  )
}
```

- [ ] **Step 2: 빌드 확인**

```bash
npm run build 2>&1 | tail -5
```
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add src/components/Layout/Footer.tsx
git commit -m "feat(footer): 법적 필수 정보 푸터 컴포넌트 추가"
```

---

## Task 4: 대시보드 레이아웃에 푸터 적용

**Files:**
- Modify: `src/app/dashboard/layout.tsx`

- [ ] **Step 1: Footer import 추가 및 `<main>` 내부 하단에 삽입**

`src/app/dashboard/layout.tsx` 파일에서:

1. import 추가 (기존 import 블록 하단):
```tsx
import Footer from '@/components/Layout/Footer'
```

2. `<main>` 태그 내부, `{children}` 바로 아래에 추가:
```tsx
<main className={`${isSidebarCollapsed ? 'lg:pl-[68px]' : 'lg:pl-48'} px-0 transition-[padding] duration-300`}>
  {children}
  <Footer />
</main>
```

- [ ] **Step 2: 빌드 확인**

```bash
npm run build 2>&1 | tail -5
```

- [ ] **Step 3: 커밋**

```bash
git add src/app/dashboard/layout.tsx
git commit -m "feat(footer): 대시보드 레이아웃에 푸터 적용"
```

---

## Task 5: 인베스트먼트 레이아웃에 푸터 적용

**Files:**
- Modify: `src/app/investment/layout.tsx`

- [ ] **Step 1: Footer import 추가 및 `<main>` 내부 하단에 삽입**

`src/app/investment/layout.tsx` 파일에서:

1. import 추가:
```tsx
import Footer from '@/components/Layout/Footer'
```

2. `<main>` 태그 내부, `{children}` 바로 아래에 추가:
```tsx
<main className="pt-14 lg:pl-56 transition-[padding] duration-300">
  <div className="p-4 sm:p-6">
    {children}
  </div>
  <Footer />
</main>
```

- [ ] **Step 2: 빌드 확인**

```bash
npm run build 2>&1 | tail -5
```

- [ ] **Step 3: 커밋**

```bash
git add src/app/investment/layout.tsx
git commit -m "feat(footer): 인베스트먼트 레이아웃에 푸터 적용"
```

---

## Task 6: 공개 페이지에 푸터 적용

**Files:**
- Modify: `src/app/AuthApp.tsx`
- Modify: `src/app/pending-approval/page.tsx`
- Modify: `src/app/resigned/page.tsx`

> **참고:** `src/app/layout.tsx`(루트 레이아웃)에는 Footer를 **추가하지 않는다.** Dashboard/Investment 레이아웃이 중첩되어 중복 렌더링이 발생한다.  
> `src/app/page.tsx`(랜딩)는 AuthApp만 렌더링하므로 AuthApp에 Footer를 추가하면 랜딩 페이지도 자동 커버된다.

- [ ] **Step 1: AuthApp.tsx — switch 패턴을 IIFE로 리팩토링 후 Footer 추가**

`src/app/AuthApp.tsx`의 하단 switch 문을 아래와 같이 교체한다 (import도 추가):

```tsx
import Footer from '@/components/Layout/Footer'
```

기존 switch 반환 부분을:
```tsx
  switch (appState) {
    case 'login':
      return ( <LoginForm ... /> )
    // ...
    default:
      return ( <LandingPage ... /> )
  }
```

아래로 교체:
```tsx
  const content = (() => {
    switch (appState) {
      case 'login':
        return (
          <LoginForm
            onBackToLanding={() => setAppState('landing')}
            onShowSignup={() => setAppState('signup')}
            onShowForgotPassword={() => setAppState('forgotPassword')}
            onLoginSuccess={() => {
              setTimeout(() => { window.location.reload() }, 150)
            }}
          />
        )
      case 'signup':
        return (
          <SignupForm
            onBackToLanding={() => setAppState('landing')}
            onShowLogin={() => setAppState('login')}
            onSignupSuccess={() => { setAppState('login') }}
          />
        )
      case 'forgotPassword':
        return (
          <ForgotPasswordForm onBackToLogin={() => setAppState('login')} />
        )
      default:
        return (
          <LandingPage
            onShowSignup={() => setAppState('signup')}
            onShowLogin={() => setAppState('login')}
          />
        )
    }
  })()

  return (
    <>
      {content}
      <Footer />
    </>
  )
```

- [ ] **Step 2: pending-approval/page.tsx 하단에 Footer 추가**

파일을 읽어 최상위 반환 JSX의 루트 엘리먼트 최하단(닫는 태그 직전)에 `<Footer />`를 추가한다. import 추가: `import Footer from '@/components/Layout/Footer'`

- [ ] **Step 3: resigned/page.tsx 하단에 Footer 추가**

동일하게 최상위 반환 JSX 최하단에 `<Footer />`를 추가한다.

- [ ] **Step 4: 빌드 확인**

```bash
npm run build 2>&1 | tail -10
```
Expected: 에러 없음

- [ ] **Step 5: 커밋**

```bash
git add src/app/AuthApp.tsx src/app/pending-approval/page.tsx src/app/resigned/page.tsx
git commit -m "feat(footer): 공개 페이지(인증/승인대기/퇴사) 하단에 푸터 적용"
```

---

## Task 7: 브라우저 통합 검증 및 최종 푸시

- [ ] **Step 1: dev 서버 실행**

```bash
npm run dev
```

- [ ] **Step 2: 테스트 계정으로 로그인 후 아래 시나리오 확인**

계정: `whitedc0902@gmail.com` / `ghkdgmltn81!`  
URL: `http://localhost:3000`

| 시나리오 | 확인 항목 |
|----------|-----------|
| 대시보드 페이지 스크롤 최하단 | 푸터 표시 |
| 로그인 전 랜딩/인증 페이지 | 푸터 표시 |
| 투자 페이지 | 푸터 표시 |
| `이용약관` 클릭 | 모달 오픈, Esc로 닫기 |
| `개인정보처리방침` 클릭 | 모달 오픈, 배경 클릭으로 닫기 |
| 모달 닫힌 후 | 클릭했던 버튼으로 포커스 복귀 |
| 모바일 뷰(375px) | 줄 바꿈 정상 표시 |
| 푸터 중복 없음 | 어느 페이지에도 푸터 1개만 표시 |

- [ ] **Step 3: 문제 발견 시 수정 후 재테스트**

- [ ] **Step 4: develop 브랜치에 푸시**

```bash
git push origin develop
```
