# 게시판 공유하기 통한 신규 유입 증대 플랜 (UX 최적화 버전)

이 문서는 대시보드의 게시판 글을 외부로 공유하여 신규 유저의 유입을 극대화하면서도, **사용자 경험(UX)을 해치지 않는 선순환 구조**를 만들기 위한 전략과 기술적 구현 계획입니다.

## User Review Required

> 사용자 피드백 반영 사항: 본문을 가리는 강제 가입 유도(Hard Gating) 대신, 글을 끝까지 읽게 하여 가치를 전달한 뒤 가입을 유도하는 **소프트 게이팅(Soft Gating)** 방식으로 전면 수정했습니다. 이 방향으로 진행해도 좋을지 검토 부탁드립니다.

## Proposed Strategies & Changes

사용자가 공유받은 링크를 클릭했을 때 글을 읽지 못하고 이탈(Bounce)하는 부작용을 막기 위해, 읽기 경험은 100% 개방하고 **특정 행동을 할 때만 가입을 요구**하는 전략을 사용합니다.

### 1. 매력적인 링크 미리보기 (Open Graph 및 동적 이미지)
- **Dynamic Metadata**: Next.js 15의 `generateMetadata`를 활용해 게시글 제목, 요약을 `og:title`, `og:description`으로 자동 세팅.
- **동적 OG 이미지 생성 (`@vercel/og`)**: `(게시글 제목) - 하얀치과 커뮤니티 꿀팁` 형태의 이미지를 동적으로 생성하여 초기 클릭률 상승.

### 2. 읽기 개방 및 행동 기반의 가입 유도 (Soft Gating)
공유 링크를 누른 비회원에게 글의 **가치를 먼저 온전히 제공**하여 신뢰를 확보합니다.
- **전체 글 읽기 허용 (Read-Only)**: 내용을 자르지 않고 끝까지 읽을 수 있게 오픈합니다.
- **액션 락 (Action Gating)**: 글을 읽은 유저가 **좋아요, 댓글 달기, 작성자 프로필 보기, 다른 글 보기** 등 상호작용을 시도할 때만 "로그인/가입 후 이용 가능한 기능입니다"라는 모달을 띄웁니다.
- **방해 없는 플로팅 배너**: 화면 하단에 스크롤을 따라다니는 작고 깔끔한 CTA 배너 삽입. *"하얀치과 대시보드에서 더 많은 팁을 나누고 소통하세요! [가입하기]"* (닫기 버튼 제공)
- **관련 게시물 티저**: 글 하단에 '인기 게시물'이나 '비슷한 글' 목록을 보여주고, 클릭 시 가입을 유도합니다.

### 3. 공유 컨트롤 컴포넌트 & 트래킹
- **Web Share API**: 모바일 디바이스에서 OS 자체의 공유 창(기본 메시지, 카카오톡, 링크 복사)을 쉽게 띄웁니다.
- **Toast UI 피드백**: URL 클립보드 복사 후 shadcn/ui Toast로 "링크가 복사되었습니다!" 피드백 제공.
- **UTM 파라미터 자동 삽입**: 공유하기 URL 복사 시 `?utm_source=share&utm_medium=bulletin`을 붙여 유입 성과를 측정합니다.

## Implementation Details

### `src/app/bulletin/[id]/page.tsx`
- 기존 게시글 상세 페이지 리팩토링: `generateMetadata`로 SEO 추가.
- 세션 객체를 확인해, 비로그인 상태면 댓글창과 좋아요 버튼을 `ReadOnly`로 렌더링하고, 클릭 시 가입 모달을 띄우는 로직 구현.

### `src/components/bulletin/ShareButton.tsx` [NEW]
- Web Share API 지원/미지원 환경을 체크하여 네이티브 공유 또는 클립보드 복사 로직을 제공하는 버튼.

### `src/components/bulletin/FloatingSignupBanner.tsx` [NEW]
- 비로그인 유저에게만 글 읽기 화면 하단에 부드럽게 나타나는 회원가입 유도 알림 띠. (닫기 기능 포함)

### `src/components/auth/SignupPromptModal.tsx` [NEW]
- 비로그인 유저가 좋아요나 댓글 등을 누를 때 팝업되는 공용 로그인/회원가입 유도 다이얼로그(shadcn/ui Dialog).

## Verification Plan
### Automated Tests
- 비로그인 상태 렌더링 시, 전체 본문 DOM 엘리먼트가 차단 없이 존재하는지 검증.
### Manual Verification
- 카카오톡 공유 디버거로 동적 Open Graph 메타 태그 동작 확인.
- 시크릿 모드에서 본문은 정상적으로 읽히는지, 좋아요 클릭 시 방어 모달이 잘 뜨는지 확인.
