# RL 트레이딩 운영 가이드

## 프로세스 토폴로지

- `trading-worker` (Node.js, PM2) — 기존 자동매매 워커. RL 일봉 cron 추가됨.
- `rl-inference` (Python uvicorn, PM2) — `localhost:8001`. RL 모델 추론 서버.

두 프로세스 모두 동일 머신에서 동작 (현재 Mac mini M4).

## 기동

```bash
cd /Users/hhs/Project/dental-clinic-manager/trading-worker
pm2 start ecosystem.config.js
pm2 logs
```

`rl-inference`는 `cwd`에 따라 `/Users/hhs/Project/dental-clinic-manager/rl-inference-server`의 venv를 사용. venv 미생성 시:

```bash
cd /Users/hhs/Project/dental-clinic-manager/rl-inference-server
python3 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
```

## 환경변수

- `RL_API_KEY` — trading-worker와 rl-inference-server가 공유. 두 환경 모두에 설정해야 함.
- `RL_SERVER_URL` (옵션) — 기본 `http://127.0.0.1:8001`. trading-worker에서 사용.
- `MODEL_DIR` — rl-inference-server가 ckpt를 저장하는 디렉터리.

## 모델 등록 절차

1. 웹 UI에서 `/investment/rl-models`로 이동
2. "모델 추가" 클릭 → 사전학습 ckpt URL + sha256 입력 (HuggingFace/GitHub)
3. status가 `pending → downloading → ready`로 자동 전이됨
4. `failed` 상태가 되면 행을 클릭하여 `failure_reason` 확인
5. 잘못된 sha256은 `400 sha256 mismatch`로 빠르게 실패함

## 전략 등록 절차

1. `/investment/strategy/new`에서 "강화학습 (RL)" 토글 선택
2. 등록된 ready 상태의 모델 선택
3. paper credential을 강력히 권장
4. **automation_level은 1 (알림만)을 기본값으로 사용** — 검증 후에만 2로 전환

## kill switch

UI 우상단 "RL 자동매매 일시정지" 버튼.

또는 SQL:
```sql
UPDATE user_investment_settings
SET rl_paused_at = NOW(), rl_paused_reason = 'manual'
WHERE user_id = '<uuid>';
```

해제는 `rl_paused_at = NULL`로.

## 일일 재교형 강제 실행 (디버깅)

```bash
cd /Users/hhs/Project/dental-clinic-manager/trading-worker
node -e "
require('./dist/dailyRebalanceDeps').buildDailyRebalanceDeps()
  .then(d => require('./dist/dailyRebalanceJob').runDailyRebalance(d))
  .then(r => console.log(r))
  .catch(e => { console.error(e); process.exit(1) })
"
```

> 주의: cron은 KST 07:00 (월~금 ET 마감 다음날 새벽). DST 시기에는 시간대 검토 필요.

## 트러블슈팅

| 증상 | 원인 / 점검 |
|---|---|
| 추론 timeout (5s) | rl-inference 미기동 또는 ckpt 로드 실패. `pm2 logs rl-inference` |
| 모델 status가 failed | `failure_reason` 확인. 일반적 원인: sha256 mismatch / 네트워크 오류 / ckpt 형식 비호환 |
| 자동매매가 안 됨 | `rl_inference_logs.decision`을 확인 → `blocked_kill_switch`, `blocked_low_confidence`, `error` 중 하나일 가능성 |
| 잔여 음수 | rebalance가 잘못된 weight를 산출. `rl_inference_logs.output.weights` 확인 |
| 모든 자동매매 즉시 중단 | UI 또는 `/api/investment/emergency-stop` POST |

## 모니터링 쿼리

```sql
-- 오늘 추론 로그
SELECT strategy_id, decision, confidence, blocked_reason, error_message, latency_ms
FROM rl_inference_logs
WHERE trade_date = CURRENT_DATE
ORDER BY created_at DESC;

-- 모델별 최근 추론 카운트
SELECT rl_model_id, decision, COUNT(*) FROM rl_inference_logs
WHERE trade_date >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY rl_model_id, decision
ORDER BY rl_model_id;
```

## 백업 & 복구

- 모델 ckpt는 `MODEL_DIR/<sha256>/model.zip` 형태로 보관. 손실 시 `checkpoint_url`로 재다운로드 가능.
- DB 백업이 일차 진실원: `rl_models`, `investment_strategies`, `rl_inference_logs`.

## 참고

- 설계 spec: `docs/superpowers/specs/2026-04-29-rl-trading-design.md`
- 구현 plan: `docs/superpowers/plans/2026-04-29-rl-trading-phase1.md`
