# 대한민국 법적 필수 정보 푸터 설계

**날짜:** 2026-04-19  
**상태:** 승인됨

---

## 개요

대한민국 전자상거래법, 정보통신망법, 개인정보보호법에서 요구하는 사업자 정보 및 법적 링크를 서비스 모든 페이지 하단에 표시하는 푸터 컴포넌트 추가.

---

## 법적 근거

| 법률 | 요구사항 |
|------|----------|
| 전자상거래법 제10조 | 상호, 대표자, 주소, 전화, 사업자등록번호, 통신판매업 신고번호 표시 |
| 정보통신망법 제27조의2 | 개인정보처리방침 상시 접근 가능 (모든 화면) |
| 개인정보보호법 | 개인정보 처리방침 공개 |

---

## 사업자 정보

| 항목 | 내용 |
|------|------|
| 회사명 | 하이클리닉 대부 주식회사 |
| 대표이사 | 황희수 |
| 주소 | 경기도 용인시 기흥구 동백중앙로 191 802호 |
| 대표 전화 | 1544-7579 |
| 이메일 | hiclinic.inc@gmail.com |
| 사업자등록번호 | 716-81-02761 |
| 통신판매업 신고번호 | 추후 입력 예정 (placeholder) |

---

## 디자인

### 레이아웃 (데스크탑)

```
─────────────────────────────────────────────────────────
© 2026 하이클리닉 대부 주식회사  대표이사 황희수  사업자등록번호 716-81-02761
경기도 용인시 기흥구 동백중앙로 191 802호  Tel. 1544-7579  hiclinic.inc@gmail.com
                    이용약관   개인정보처리방침
─────────────────────────────────────────────────────────
```

- 모바일: 항목 줄 바꿈 처리
- 색상: `text-at-text-secondary` (눈에 띄지 않는 서브 텍스트)
- 구분자: `|` 또는 `·`

### 이용약관 / 개인정보처리방침 클릭 동작

- 페이지 이동 없이 **모달**로 내용 표시
- 기존 `src/constants/termsContent.ts`의 `TERMS_OF_SERVICE`, `PRIVACY_COLLECTION` 콘텐츠 재사용

---

## 컴포넌트 구조

### 생성 파일

**`src/components/Layout/Footer.tsx`**
- 회사 정보 텍스트 표시
- 이용약관/개인정보처리방침 버튼 (모달 트리거)
- 저작권 표시
- 반응형 (모바일 줄 바꿈)

**`src/components/Layout/FooterTermsModal.tsx`**
- `type: 'terms' | 'privacy'` prop으로 어떤 약관을 보여줄지 결정
- `termsContent.ts`에서 콘텐츠 가져옴
- 스크롤 가능한 본문 + 닫기 버튼

### 수정 파일

**`src/app/dashboard/layout.tsx`**
- `<main>` 태그 내부, `{children}` 아래에 `<Footer />` 추가
- 사이드바 padding이 자동 적용됨

**`src/app/investment/layout.tsx`**
- 동일하게 `<Footer />` 추가

**`src/app/layout.tsx`** (루트 레이아웃)
- `{children}` 아래에 `<Footer />` 추가 → 랜딩, 인증, 기타 공개 페이지에 적용

> **중복 방지:** dashboard/investment 레이아웃은 루트 레이아웃 안에 중첩되므로,
> 루트 레이아웃 푸터는 dashboard/investment 레이아웃이 없는 페이지에만 보임.
> dashboard/investment는 자체 레이아웃에서 직접 Footer를 렌더링.

---

## 데이터 흐름

```
termsContent.ts
  └─ TERMS_OF_SERVICE.content ──→ FooterTermsModal (type='terms')
  └─ PRIVACY_COLLECTION.content ─→ FooterTermsModal (type='privacy')

Footer.tsx
  └─ 모달 상태 관리 (useState)
  └─ FooterTermsModal 렌더링
```

---

## 접근성 요구사항

- 모달: `Esc` 키로 닫기, `role="dialog"`, `aria-modal="true"`
- 이용약관 모달 `aria-label="서비스 이용약관"`, 개인정보처리방침 모달 `aria-label="개인정보처리방침"`
- 모달 닫힐 때 포커스를 모달을 열었던 트리거 버튼으로 복귀
- 모달 열릴 때 배경 스크롤 잠금, 닫힐 때 복원

## 사업자 상수 파일

- 위치: `src/constants/company.ts`
- 모든 사업자 정보를 상수로 관리 (Footer 외 다른 곳에서도 재사용 가능)
- `BUSINESS_REG_MAIL_ORDER` 가 빈 문자열이면 해당 항목 **완전히 숨김** (공백 없음)

## Footer 렌더링 위치 명세

| 파일 | Footer 포함 여부 | 비고 |
|------|-----------------|------|
| `src/app/layout.tsx` | ❌ 추가 안 함 | 중복 방지 |
| `src/app/dashboard/layout.tsx` | ✅ `<main>` 하단 | 사이드바 padding 자동 적용 |
| `src/app/investment/layout.tsx` | ✅ 콘텐츠 하단 | |
| `src/app/page.tsx` (랜딩) | ✅ 페이지 하단 | |
| `src/app/pending-approval/page.tsx` | ✅ | 공개 페이지 |
| `src/app/resigned/page.tsx` | ✅ | 공개 페이지 |
| 인증 관련 페이지 (AuthApp 등) | ✅ | 공개 페이지 |

## 미결 사항

- 통신판매업 신고번호: 추후 입력 → 상수 `BUSINESS_REG_MAIL_ORDER` 를 빈 문자열로 초기화, 입력 시 채우면 자동 노출
- 환불/취소 정책: 전자상거래법 제17조 대상이나 이번 범위에서 제외, 별도 태스크로 처리
