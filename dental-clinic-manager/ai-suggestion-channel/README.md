# ai-suggestion-channel

자유게시판 "제안" 카테고리의 마스터 승인 이벤트를 **실행 중인 Claude Code 세션**으로 푸시하는 MCP Channel 서버.

## 아키텍처

```
[웹앱: 마스터가 "AI 자동 구현 시작" 버튼 클릭]
    ↓ ai_suggestion_tasks INSERT (status='pending')
[Supabase Database Webhook]
    ↓ POST https://hkdk.events/{your-endpoint}
[Hookdeck CLI (상시 구동, localhost 터널)]
    ↓ POST http://127.0.0.1:8788/
[이 서버 (suggestion-channel.ts, Bun + MCP)]
    ↓ mcp.notification('notifications/claude/channel')
[Claude Code 세션 (맥미니, OAuth 로그인 상태)]
    ↓ <channel source="suggestion-inbox" task_id="..." post_id="..." title="...">내용</channel>
사용자가 "구현해줘" 지시 → Claude가 코드 수정·빌드·PR
```

## 선행 준비

1. **Bun** 설치: `brew install oven-sh/bun/bun` (≥ 1.3)
2. **Hookdeck CLI** 설치: `npm install -g hookdeck-cli` → `hookdeck login` (브라우저 필요)
3. **Claude Code** ≥ v2.1.80, `claude.ai` OAuth 로그인 상태

## 설치

```bash
cd ai-suggestion-channel
bun install
cp .env.example .env
# .env 편집: SUPABASE_SERVICE_ROLE_KEY, (선택) WEBHOOK_SECRET
```

## Claude Code에 등록

**프로젝트 루트의 `.mcp.json`** (또는 `~/.claude.json`)에 추가:

```json
{
  "mcpServers": {
    "suggestion-inbox": {
      "command": "bun",
      "args": ["run", "ai-suggestion-channel/src/suggestion-channel.ts"],
      "env": {
        "SUPABASE_URL": "https://beahjntkmkfhpcbhfnrr.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "...",
        "CHANNEL_PORT": "8788"
      }
    }
  }
}
```

## Claude Code 세션 기동 (research preview 중)

```bash
claude --dangerously-load-development-channels server:suggestion-inbox
```

세션이 열려 있는 동안만 이벤트 수신. 자리 비울 때는 tmux로 띄워두면 좋음.

## Hookdeck CLI 터널

```bash
hookdeck listen 8788 suggestion-inbox --path /
# 출력: https://hkdk.events/abcdef... 이 URL을 Supabase Database Webhook에 등록
```

**pm2로 상시 구동**:

```bash
pm2 start hookdeck --name hookdeck-suggestion -- listen 8788 suggestion-inbox --path /
pm2 save
```

## Supabase Database Webhook 설정

Supabase Dashboard → Database → Webhooks → `Create a new hook`:

- Name: `ai_suggestion_tasks_to_claude`
- Table: `ai_suggestion_tasks`
- Events: `INSERT`
- Type: HTTP Request
- Method: POST
- URL: Hookdeck 발급 URL
- HTTP Headers: `x-webhook-secret: <WEBHOOK_SECRET과 동일>`

## 트러블슈팅

- `claude` 세션에서 `/mcp` 입력 → `suggestion-inbox` 서버 상태 확인
- 이벤트가 안 도착하면 `curl -X POST http://127.0.0.1:8788 -d '{"type":"INSERT","table":"ai_suggestion_tasks","record":{"id":"test","post_id":"<실제_post_id>","status":"pending"}}'` 로 로컬 테스트
- 서버 로그는 `stderr`로 출력 (Bun 실행 시 보임)
- Hookdeck Event Gateway로 전환하면 delivery guarantee, retry, rate-limit 확보

## 보안

- `X-Webhook-Secret` 헤더 검증 (Supabase Database Webhook의 커스텀 헤더로 설정)
- `hostname: '127.0.0.1'` — 외부 IP에서 직접 접근 불가. Hookdeck 터널만 경유
- 이 서버는 **알림 전달만** 담당. 실제 코드 수정·커밋은 Claude Code 세션의 일반 도구가 수행하므로 화이트리스트 불필요

## 레퍼런스

- [Claude Code Channels Docs](https://code.claude.com/docs/en/channels)
- [Channels reference (custom server)](https://code.claude.com/docs/en/channels-reference)
- [Hookdeck CLI](https://hookdeck.com/docs/cli)
