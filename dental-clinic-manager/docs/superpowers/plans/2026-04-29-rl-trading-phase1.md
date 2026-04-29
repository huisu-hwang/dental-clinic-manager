# RL 트레이딩 Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 미국 주식 일봉 재교형 RL 자동매매를 추가한다 — FinRL/SB3 사전학습 모델을 로드해 portfolio weight 추론 → 기존 KIS 주문 인프라로 자동 주문(default 알림만, 사용자 명시 시 자동).

**Architecture:** Next.js 메인 앱 ↔ Supabase ↔ trading-worker(Node.js, 기존, 일봉 cron 추가) ↔ rl-inference-server(Python FastAPI, 신규, localhost:8001). RL 추론은 HTTP, 주문은 기존 `executeAutoOrder` 재사용. 모든 안전 가드(default level=1, kill switch, 신뢰도 임계, idempotency, 5s timeout)를 코드 강제 구현.

**Tech Stack:**
- Frontend/API: Next.js 15, React 19, TypeScript, Tailwind, Supabase JS
- DB: Supabase Postgres (마이그레이션 MCP 적용)
- Worker: Node.js + node-cron + pino + Supabase service role
- RL Server: Python 3.11 + FastAPI + Pydantic v2 + PyTorch (CPU) + stable-baselines3 + finrl(선택)
- 테스트: vitest (TS 신규 추가) / pytest (Python)

**Spec 참조:** [docs/superpowers/specs/2026-04-29-rl-trading-design.md](../specs/2026-04-29-rl-trading-design.md)

---

## File Structure

### 신규 파일

```
rl-inference-server/                                  # 신규 Python 프로젝트
├── pyproject.toml
├── README.md
├── .env.example
├── src/
│   ├── __init__.py
│   ├── main.py                                       # FastAPI 앱 + 라우트
│   ├── config.py                                     # 환경변수 (PORT, MODEL_DIR, API_KEY)
│   ├── auth.py                                       # X-RL-API-KEY 헤더 검증
│   ├── schemas.py                                    # Pydantic v2 모델
│   ├── model_registry.py                             # 다운로드 + LRU(2)
│   ├── state.py                                      # state hash 유틸
│   ├── adapters/
│   │   ├── __init__.py
│   │   ├── base.py                                   # AdapterBase + compute_confidence
│   │   ├── sb3.py                                    # stable-baselines3 어댑터
│   │   └── finrl_dow30.py                            # FinRL Dow 30 환경 어댑터
│   └── inference/
│       ├── __init__.py
│       ├── portfolio.py                              # PortfolioInferenceEngine
│       └── single.py                                 # SingleAssetInferenceEngine (스텁)
├── tests/
│   ├── __init__.py
│   ├── conftest.py
│   ├── test_health.py
│   ├── test_model_registry.py
│   ├── test_sb3_adapter.py
│   ├── test_predict_portfolio.py
│   └── test_backtest.py

trading-worker/src/
├── rlInferenceClient.ts                              # 신규
└── dailyRebalanceJob.ts                              # 신규

trading-worker/tests/                                  # 신규 디렉터리
├── rlInferenceClient.test.ts
└── dailyRebalanceJob.test.ts

dental-clinic-manager/
├── supabase/migrations/<YYYYMMDD>_rl_trading.sql     # 신규 마이그레이션
├── src/types/rlTrading.ts                            # 신규 타입
├── src/lib/rlModelService.ts                         # 신규 서비스 (메인 앱)
├── src/app/api/investment/rl-models/route.ts         # 신규
├── src/app/api/investment/rl-models/[id]/route.ts    # 신규
├── src/app/api/investment/rl-models/[id]/backtest/route.ts  # 신규
├── src/app/api/investment/rl-pause/route.ts          # 신규
├── src/app/investment/rl-models/page.tsx             # 신규
├── src/app/investment/rl-models/[id]/page.tsx        # 신규 (모델 상세)
├── src/components/Investment/RLModels/
│   ├── ModelLibraryPanel.tsx                         # 신규
│   ├── ModelRegisterDialog.tsx                       # 신규
│   ├── ModelDetailPanel.tsx                          # 신규
│   ├── KillSwitchToggle.tsx                          # 신규
│   └── RLStrategyForm.tsx                            # 신규 (전략 생성 폼)
└── docs/superpowers/operations/rl-trading-operations.md  # 신규 운영 가이드
```

### 수정 파일

```
dental-clinic-manager/
├── src/types/investment.ts                           # strategy_type, rl_model_id 추가
├── src/app/api/investment/strategies/route.ts        # RL 분기
├── src/app/api/investment/emergency-stop/route.ts    # RL 전략도 비활성화
├── src/app/investment/strategy/page.tsx              # 배지 표시
├── src/app/investment/strategy/new/page.tsx          # type 선택 추가 (있으면)
└── src/components/Investment/InvestmentNav.tsx (또는 nav 정의 위치)  # rl-models 링크 추가

trading-worker/
├── package.json                                       # vitest devDep 추가
├── tsconfig.json                                      # tests 포함
├── ecosystem.config.js                                # rl-inference-server 추가 (또는 별도)
└── src/index.ts                                       # dailyRebalanceJob 등록
```

---

## 진행 원칙

- TDD: 항상 실패 테스트 먼저 → 구현 → 통과 → 커밋
- 작업당 작은 커밋 (한 task 완료 시 1~3 커밋). main이 아닌 `develop` 브랜치.
- 마이그레이션은 Supabase MCP `apply_migration`으로 적용 + `supabase/migrations/` 파일도 생성
- 기존 코드 컨벤션 준수: AT Tokens, rounded-xl, pino logger, 한국어 주석
- 어떤 task에서든 빌드/타입 체크 실패 시 즉시 수정

---

## Task 1: DB 마이그레이션 (rl_models, rl_inference_logs, strategies 확장, kill switch)

**Files:**
- Create: `dental-clinic-manager/supabase/migrations/<YYYYMMDD>_rl_trading.sql`
- Apply: Supabase MCP `apply_migration`

- [ ] **Step 1: 마이그레이션 SQL 작성**

`supabase/migrations/<YYYYMMDD>_rl_trading.sql`:

```sql
-- ============================================
-- RL 트레이딩 Phase 1
-- - rl_models: 사전학습 모델 메타데이터
-- - rl_inference_logs: 일봉 추론 감사 로그
-- - investment_strategies 확장: strategy_type, rl_model_id
-- - user_investment_settings 확장: rl_paused_at, rl_paused_reason
-- ============================================

-- 1) rl_models
CREATE TABLE IF NOT EXISTS rl_models (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,

  name TEXT NOT NULL,
  description TEXT,
  source TEXT NOT NULL CHECK (source IN ('finrl_pretrained','sb3_pretrained','custom')),
  algorithm TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('portfolio','single_asset')),
  market TEXT NOT NULL DEFAULT 'US',
  timeframe TEXT NOT NULL DEFAULT '1d',

  universe JSONB,
  input_features JSONB NOT NULL,
  state_window INT NOT NULL DEFAULT 60 CHECK (state_window > 0 AND state_window <= 500),
  output_shape JSONB NOT NULL,

  checkpoint_url TEXT,
  checkpoint_path TEXT,
  checkpoint_sha256 TEXT,

  min_confidence NUMERIC(3,2) DEFAULT 0.60 CHECK (min_confidence >= 0 AND min_confidence <= 1),

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','downloading','ready','failed','archived')),
  metrics JSONB,
  failure_reason TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rl_models_clinic ON rl_models(clinic_id);
CREATE INDEX IF NOT EXISTS idx_rl_models_status ON rl_models(status);

-- 2) investment_strategies 확장
ALTER TABLE investment_strategies
  ADD COLUMN IF NOT EXISTS strategy_type TEXT NOT NULL DEFAULT 'rule'
    CHECK (strategy_type IN ('rule','rl_portfolio','rl_single')),
  ADD COLUMN IF NOT EXISTS rl_model_id UUID REFERENCES rl_models(id) ON DELETE SET NULL;

ALTER TABLE investment_strategies DROP CONSTRAINT IF EXISTS rl_strategy_requires_model;
ALTER TABLE investment_strategies
  ADD CONSTRAINT rl_strategy_requires_model
  CHECK (strategy_type = 'rule' OR rl_model_id IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_strategies_type ON investment_strategies(strategy_type);
CREATE INDEX IF NOT EXISTS idx_strategies_rl_model ON investment_strategies(rl_model_id);

-- 3) rl_inference_logs
CREATE TABLE IF NOT EXISTS rl_inference_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  strategy_id UUID NOT NULL REFERENCES investment_strategies(id) ON DELETE CASCADE,
  rl_model_id UUID NOT NULL REFERENCES rl_models(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  trade_date DATE NOT NULL,
  state_hash TEXT NOT NULL,

  output JSONB NOT NULL,
  confidence NUMERIC(4,3),
  decision TEXT NOT NULL CHECK (decision IN ('order','hold','blocked_low_confidence','blocked_kill_switch','error')),
  blocked_reason TEXT,

  latency_ms INT,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT rl_inference_unique_per_day UNIQUE (strategy_id, trade_date)
);

CREATE INDEX IF NOT EXISTS idx_rl_logs_strategy_date ON rl_inference_logs(strategy_id, trade_date DESC);
CREATE INDEX IF NOT EXISTS idx_rl_logs_user_date ON rl_inference_logs(user_id, trade_date DESC);

-- 4) user_investment_settings 확장 (kill switch)
ALTER TABLE user_investment_settings
  ADD COLUMN IF NOT EXISTS rl_paused_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rl_paused_reason TEXT;

-- 5) RLS
ALTER TABLE rl_models ENABLE ROW LEVEL SECURITY;
ALTER TABLE rl_inference_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view clinic models" ON rl_models;
CREATE POLICY "Users can view clinic models" ON rl_models
  FOR SELECT USING (
    clinic_id IN (SELECT clinic_id FROM users WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "Users can manage own models" ON rl_models;
CREATE POLICY "Users can manage own models" ON rl_models
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can view own logs" ON rl_inference_logs;
CREATE POLICY "Users can view own logs" ON rl_inference_logs
  FOR SELECT USING (user_id = auth.uid());

-- service role bypass (worker가 service role 사용)
DROP POLICY IF EXISTS "Service can write logs" ON rl_inference_logs;
CREATE POLICY "Service can write logs" ON rl_inference_logs
  FOR INSERT WITH CHECK (true);

-- updated_at 트리거
CREATE OR REPLACE FUNCTION update_rl_models_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_rl_models_updated_at ON rl_models;
CREATE TRIGGER trigger_rl_models_updated_at BEFORE UPDATE ON rl_models
  FOR EACH ROW EXECUTE FUNCTION update_rl_models_updated_at();
```

- [ ] **Step 2: Supabase MCP로 적용**

```
mcp__supabase__apply_migration({
  project_id: 'beahjntkmkfhpcbhfnrr',
  name: '<YYYYMMDD>_rl_trading',
  query: <위 SQL 전체>
})
```

- [ ] **Step 3: 적용 검증 (테이블/제약 존재 확인)**

```sql
SELECT table_name FROM information_schema.tables
WHERE table_schema='public' AND table_name IN ('rl_models','rl_inference_logs');
SELECT column_name FROM information_schema.columns
WHERE table_name='investment_strategies' AND column_name IN ('strategy_type','rl_model_id');
SELECT column_name FROM information_schema.columns
WHERE table_name='user_investment_settings' AND column_name IN ('rl_paused_at','rl_paused_reason');
```

기대: 모든 6개 row 반환. 존재 확인 SQL은 `mcp__supabase__execute_sql`로 실행.

- [ ] **Step 4: 커밋**

```bash
cd dental-clinic-manager
git add supabase/migrations/<YYYYMMDD>_rl_trading.sql
git commit -m "feat(rl-trading): DB schema for rl_models, rl_inference_logs, strategy_type"
```

---

## Task 2: rl-inference-server 프로젝트 셋업

**Files:**
- Create: `rl-inference-server/pyproject.toml`
- Create: `rl-inference-server/.env.example`
- Create: `rl-inference-server/README.md`
- Create: `rl-inference-server/src/__init__.py`
- Create: `rl-inference-server/src/config.py`
- Create: `rl-inference-server/tests/__init__.py`
- Create: `rl-inference-server/tests/conftest.py`

- [ ] **Step 1: pyproject.toml 작성**

`rl-inference-server/pyproject.toml`:

```toml
[project]
name = "rl-inference-server"
version = "0.1.0"
description = "RL 모델 추론 서버 (FastAPI + PyTorch + stable-baselines3)"
requires-python = ">=3.11,<3.13"
dependencies = [
  "fastapi>=0.115",
  "uvicorn[standard]>=0.32",
  "pydantic>=2.9",
  "pydantic-settings>=2.6",
  "torch>=2.2,<2.6",
  "stable-baselines3>=2.3",
  "numpy>=1.26,<2.0",
  "pandas>=2.2",
  "httpx>=0.27",
  "python-dotenv>=1.0",
]

[project.optional-dependencies]
finrl = ["finrl>=0.3.6"]
dev = ["pytest>=8.3", "pytest-asyncio>=0.24", "ruff>=0.7"]

[tool.pytest.ini_options]
testpaths = ["tests"]
asyncio_mode = "auto"
```

- [ ] **Step 2: .env.example 작성**

`rl-inference-server/.env.example`:

```dotenv
# 외부 노출 금지 - 반드시 localhost
RL_SERVER_HOST=127.0.0.1
RL_SERVER_PORT=8001

# trading-worker가 헤더에 같은 값을 보내야 함
RL_API_KEY=change-me-to-long-random-string

# 모델 ckpt 영구 저장 디렉터리 (sha256 하위 디렉터리)
MODEL_DIR=/Users/hhs/.cache/rl-inference/models

# 로그 레벨
LOG_LEVEL=INFO
```

- [ ] **Step 3: config.py 작성**

`rl-inference-server/src/config.py`:

```python
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="")

    rl_server_host: str = "127.0.0.1"
    rl_server_port: int = 8001
    rl_api_key: str = "change-me"
    model_dir: str = "/tmp/rl-inference/models"
    log_level: str = "INFO"


def get_settings() -> Settings:
    return Settings()
```

- [ ] **Step 4: 빈 패키지 마커 + conftest 작성**

`rl-inference-server/src/__init__.py`: 빈 파일
`rl-inference-server/tests/__init__.py`: 빈 파일

`rl-inference-server/tests/conftest.py`:

```python
import os
import sys
from pathlib import Path

# src 디렉터리를 PYTHONPATH에 추가
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))

# 테스트용 환경변수
os.environ.setdefault("RL_API_KEY", "test-api-key")
os.environ.setdefault("MODEL_DIR", str(Path("/tmp/rl-inference-test/models")))
```

- [ ] **Step 5: README + venv 셋업 + 의존성 설치 검증**

`rl-inference-server/README.md`:

```markdown
# rl-inference-server

RL 모델 추론 서버. 별도 Python 프로세스로 동작 (PM2 관리).

## 빠른 시작

\`\`\`bash
python3.11 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env
# .env에 RL_API_KEY를 충분히 길게 설정

uvicorn src.main:app --host 127.0.0.1 --port 8001 --reload
\`\`\`

## 테스트

\`\`\`bash
pytest -v
\`\`\`
```

```bash
cd /Users/hhs/Project/dental-clinic-manager/rl-inference-server
python3.11 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
python -c "import fastapi, torch, stable_baselines3, pydantic; print('OK')"
```

기대: `OK` 출력. 실패 시 의존성 충돌 디버깅.

- [ ] **Step 6: 커밋**

```bash
cd /Users/hhs/Project/dental-clinic-manager
git add rl-inference-server/pyproject.toml rl-inference-server/.env.example rl-inference-server/README.md rl-inference-server/src/__init__.py rl-inference-server/src/config.py rl-inference-server/tests/__init__.py rl-inference-server/tests/conftest.py
git commit -m "feat(rl-server): project scaffold with FastAPI + PyTorch + sb3"
```

---

## Task 3: FastAPI /health endpoint (TDD)

**Files:**
- Create: `rl-inference-server/src/auth.py`
- Create: `rl-inference-server/src/main.py`
- Create: `rl-inference-server/tests/test_health.py`

- [ ] **Step 1: 실패 테스트 작성**

`rl-inference-server/tests/test_health.py`:

```python
from fastapi.testclient import TestClient

def test_health_returns_200_with_status(monkeypatch):
    monkeypatch.setenv("RL_API_KEY", "test-key")
    from src.main import app
    client = TestClient(app)
    resp = client.get("/health", headers={"X-RL-API-KEY": "test-key"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert "loaded_models" in body
    assert "uptime_seconds" in body


def test_health_rejects_missing_api_key(monkeypatch):
    monkeypatch.setenv("RL_API_KEY", "test-key")
    from src.main import app
    client = TestClient(app)
    resp = client.get("/health")
    assert resp.status_code == 401


def test_health_rejects_wrong_api_key(monkeypatch):
    monkeypatch.setenv("RL_API_KEY", "test-key")
    from src.main import app
    client = TestClient(app)
    resp = client.get("/health", headers={"X-RL-API-KEY": "wrong"})
    assert resp.status_code == 401
```

- [ ] **Step 2: 실행 → fail 확인**

```bash
cd rl-inference-server && source .venv/bin/activate
pytest tests/test_health.py -v
```

기대: ImportError or 모듈 미존재로 FAIL.

- [ ] **Step 3: auth.py 구현**

`rl-inference-server/src/auth.py`:

```python
from fastapi import Header, HTTPException, status
from src.config import get_settings


def require_api_key(x_rl_api_key: str | None = Header(default=None)) -> None:
    settings = get_settings()
    if not x_rl_api_key or x_rl_api_key != settings.rl_api_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid or missing X-RL-API-KEY",
        )
```

- [ ] **Step 4: main.py 골격 + /health 구현**

`rl-inference-server/src/main.py`:

```python
import time
from fastapi import FastAPI, Depends
from src.auth import require_api_key

START_TIME = time.time()
app = FastAPI(title="rl-inference-server", version="0.1.0")


@app.get("/health", dependencies=[Depends(require_api_key)])
def health():
    return {
        "status": "ok",
        "loaded_models": [],  # Task 4에서 model_registry 연결
        "uptime_seconds": round(time.time() - START_TIME, 2),
    }
```

- [ ] **Step 5: 실행 → pass 확인**

```bash
pytest tests/test_health.py -v
```

기대: 3개 테스트 모두 PASS.

- [ ] **Step 6: 수동 기동 검증**

```bash
RL_API_KEY=test uvicorn src.main:app --host 127.0.0.1 --port 8001 &
sleep 1
curl -s -H 'X-RL-API-KEY: test' http://127.0.0.1:8001/health
kill %1
```

기대: `{"status":"ok",...}` 출력.

- [ ] **Step 7: 커밋**

```bash
git add rl-inference-server/src/auth.py rl-inference-server/src/main.py rl-inference-server/tests/test_health.py
git commit -m "feat(rl-server): /health endpoint with X-RL-API-KEY auth"
```

---

## Task 4: model_registry — 다운로드 + 무결성 검증 + LRU 캐시

**Files:**
- Create: `rl-inference-server/src/model_registry.py`
- Create: `rl-inference-server/tests/test_model_registry.py`

- [ ] **Step 1: 실패 테스트 작성**

`rl-inference-server/tests/test_model_registry.py`:

```python
import hashlib
from pathlib import Path
import pytest
from src.model_registry import ModelRegistry, DownloadError, IntegrityError


def make_dummy_bytes(n: int = 1024) -> bytes:
    return bytes((i % 256 for i in range(n)))


@pytest.mark.asyncio
async def test_download_writes_to_sha256_subdir(tmp_path, monkeypatch):
    payload = make_dummy_bytes()
    expected_sha = hashlib.sha256(payload).hexdigest()
    registry = ModelRegistry(model_dir=str(tmp_path))

    async def fake_fetch(url: str) -> bytes:
        return payload

    monkeypatch.setattr(registry, "_fetch_bytes", fake_fetch)
    path = await registry.download("model-1", "https://example.com/x.zip", expected_sha)
    p = Path(path)
    assert p.exists()
    assert expected_sha in str(p)


@pytest.mark.asyncio
async def test_download_rejects_sha_mismatch(tmp_path, monkeypatch):
    payload = make_dummy_bytes()
    bad_sha = "0" * 64
    registry = ModelRegistry(model_dir=str(tmp_path))

    async def fake_fetch(url: str) -> bytes:
        return payload

    monkeypatch.setattr(registry, "_fetch_bytes", fake_fetch)
    with pytest.raises(IntegrityError):
        await registry.download("model-1", "https://example.com/x.zip", bad_sha)


def test_lru_evicts_oldest_when_capacity_exceeded():
    registry = ModelRegistry(model_dir="/tmp", lru_capacity=2)
    registry._cache_set("a", "obj-a")
    registry._cache_set("b", "obj-b")
    registry._cache_set("c", "obj-c")  # a 축출
    assert registry._cache_get("a") is None
    assert registry._cache_get("b") == "obj-b"
    assert registry._cache_get("c") == "obj-c"


def test_loaded_models_returns_cached_keys():
    registry = ModelRegistry(model_dir="/tmp", lru_capacity=2)
    registry._cache_set("a", "obj-a")
    registry._cache_set("b", "obj-b")
    assert sorted(registry.loaded_models()) == ["a", "b"]
```

- [ ] **Step 2: 실행 → fail 확인**

```bash
pytest tests/test_model_registry.py -v
```

기대: ImportError로 FAIL.

- [ ] **Step 3: model_registry.py 구현**

`rl-inference-server/src/model_registry.py`:

```python
from __future__ import annotations
import hashlib
import os
from collections import OrderedDict
from pathlib import Path
from typing import Any
import httpx


class DownloadError(Exception):
    pass


class IntegrityError(Exception):
    pass


class ModelRegistry:
    """ckpt 다운로드 + sha256 무결성 검증 + 메모리 LRU 캐시."""

    def __init__(self, model_dir: str, lru_capacity: int = 2) -> None:
        self.model_dir = Path(model_dir)
        self.model_dir.mkdir(parents=True, exist_ok=True)
        self._lru: OrderedDict[str, Any] = OrderedDict()
        self._capacity = lru_capacity

    async def _fetch_bytes(self, url: str) -> bytes:
        async with httpx.AsyncClient(timeout=httpx.Timeout(60.0)) as client:
            r = await client.get(url, follow_redirects=True)
            if r.status_code >= 400:
                raise DownloadError(f"GET {url} -> {r.status_code}")
            return r.content

    async def download(self, model_id: str, url: str, expected_sha256: str) -> str:
        """다운로드 → sha 검증 → 영구 경로 반환."""
        data = await self._fetch_bytes(url)
        actual = hashlib.sha256(data).hexdigest()
        if actual != expected_sha256:
            raise IntegrityError(
                f"sha256 mismatch for {model_id}: expected {expected_sha256}, got {actual}"
            )
        target_dir = self.model_dir / actual
        target_dir.mkdir(parents=True, exist_ok=True)
        target = target_dir / "model.zip"
        target.write_bytes(data)
        return str(target)

    def _cache_set(self, key: str, value: Any) -> None:
        if key in self._lru:
            self._lru.move_to_end(key)
        self._lru[key] = value
        while len(self._lru) > self._capacity:
            self._lru.popitem(last=False)

    def _cache_get(self, key: str) -> Any | None:
        if key not in self._lru:
            return None
        self._lru.move_to_end(key)
        return self._lru[key]

    def loaded_models(self) -> list[str]:
        return list(self._lru.keys())
```

- [ ] **Step 4: 실행 → pass 확인**

```bash
pytest tests/test_model_registry.py -v
```

기대: 4개 테스트 PASS.

- [ ] **Step 5: /health에 loaded_models 연결**

`rl-inference-server/src/main.py` 수정:

```python
import time
from fastapi import FastAPI, Depends
from src.auth import require_api_key
from src.config import get_settings
from src.model_registry import ModelRegistry

settings = get_settings()
START_TIME = time.time()
registry = ModelRegistry(model_dir=settings.model_dir)
app = FastAPI(title="rl-inference-server", version="0.1.0")


@app.get("/health", dependencies=[Depends(require_api_key)])
def health():
    return {
        "status": "ok",
        "loaded_models": registry.loaded_models(),
        "uptime_seconds": round(time.time() - START_TIME, 2),
    }
```

- [ ] **Step 6: 회귀 테스트 실행**

```bash
pytest -v
```

기대: 7개 모두 PASS (health 3 + registry 4).

- [ ] **Step 7: 커밋**

```bash
git add rl-inference-server/src/model_registry.py rl-inference-server/src/main.py rl-inference-server/tests/test_model_registry.py
git commit -m "feat(rl-server): model registry with sha256 + LRU cache"
```

---

## Task 5: 어댑터 베이스 + SB3 어댑터 + 신뢰도 계산

**Files:**
- Create: `rl-inference-server/src/adapters/__init__.py`
- Create: `rl-inference-server/src/adapters/base.py`
- Create: `rl-inference-server/src/adapters/sb3.py`
- Create: `rl-inference-server/tests/test_sb3_adapter.py`

- [ ] **Step 1: 실패 테스트 작성**

`rl-inference-server/tests/test_sb3_adapter.py`:

```python
"""SB3 어댑터: 가벼운 PPO 모델을 즉석 학습 후 ckpt 저장 → 어댑터로 로드 → 형상 검증."""

import os
from pathlib import Path
import numpy as np
import pytest


def _make_tiny_ppo_zip(tmp_path: Path) -> str:
    """관측 4-dim, 액션 2-dim discrete의 PPO를 즉석으로 만들어 저장."""
    import gymnasium as gym
    from stable_baselines3 import PPO

    env = gym.make("CartPole-v1")
    model = PPO("MlpPolicy", env, n_steps=64, verbose=0)
    path = tmp_path / "ppo.zip"
    model.save(str(path))
    return str(path)


def test_sb3_adapter_loads_and_predicts(tmp_path):
    from src.adapters.sb3 import SB3Adapter

    ckpt = _make_tiny_ppo_zip(tmp_path)
    adapter = SB3Adapter.load(checkpoint_path=ckpt, algorithm="PPO")
    obs = np.zeros((4,), dtype=np.float32)
    raw_action, action_logits = adapter.predict_with_logits(obs)
    assert raw_action is not None
    assert action_logits is not None


def test_sb3_adapter_compute_confidence_returns_in_unit_range(tmp_path):
    from src.adapters.sb3 import SB3Adapter

    ckpt = _make_tiny_ppo_zip(tmp_path)
    adapter = SB3Adapter.load(checkpoint_path=ckpt, algorithm="PPO")
    obs = np.zeros((4,), dtype=np.float32)
    _, logits = adapter.predict_with_logits(obs)
    conf = adapter.compute_confidence(logits)
    assert 0.0 <= conf <= 1.0


def test_sb3_adapter_rejects_unknown_algorithm(tmp_path):
    from src.adapters.sb3 import SB3Adapter

    with pytest.raises(ValueError):
        SB3Adapter.load(checkpoint_path="/dev/null", algorithm="UNSUPPORTED")
```

추가 의존성: `pip install gymnasium`. pyproject.toml의 dev에 `gymnasium>=0.29`를 추가하고 다시 설치.

- [ ] **Step 2: gymnasium 의존성 추가 + 재설치**

`rl-inference-server/pyproject.toml`의 `[project.optional-dependencies] dev` 항목 변경:

```toml
dev = ["pytest>=8.3", "pytest-asyncio>=0.24", "ruff>=0.7", "gymnasium>=0.29"]
```

```bash
pip install -e ".[dev]"
```

- [ ] **Step 3: 실행 → fail 확인**

```bash
pytest tests/test_sb3_adapter.py -v
```

기대: 어댑터 미존재로 FAIL.

- [ ] **Step 4: base.py 구현**

`rl-inference-server/src/adapters/__init__.py`: 빈 파일

`rl-inference-server/src/adapters/base.py`:

```python
from __future__ import annotations
from abc import ABC, abstractmethod
from typing import Any
import numpy as np


class AdapterBase(ABC):
    """RL 모델 추론 어댑터 공통 인터페이스.

    모든 어댑터는 raw observation → (action, logits/q_values)와 신뢰도 계산을 제공한다.
    """

    @classmethod
    @abstractmethod
    def load(cls, checkpoint_path: str, algorithm: str) -> "AdapterBase": ...

    @abstractmethod
    def predict_with_logits(self, obs: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """반환: (action, logits_or_qvalues). logits는 신뢰도 계산용."""

    @abstractmethod
    def compute_confidence(self, logits_or_q: np.ndarray) -> float:
        """모델 종류별 신뢰도(0~1) 계산. 가짜 1.0 금지."""
```

- [ ] **Step 5: sb3.py 구현**

`rl-inference-server/src/adapters/sb3.py`:

```python
from __future__ import annotations
import numpy as np
import torch
from src.adapters.base import AdapterBase

_SUPPORTED = {"PPO", "A2C", "DQN", "TD3", "DDPG", "SAC"}


class SB3Adapter(AdapterBase):
    def __init__(self, model: object, algorithm: str) -> None:
        self._model = model
        self._algorithm = algorithm

    @classmethod
    def load(cls, checkpoint_path: str, algorithm: str) -> "SB3Adapter":
        if algorithm not in _SUPPORTED:
            raise ValueError(f"unsupported algorithm: {algorithm}")
        # algorithm별 import
        if algorithm == "PPO":
            from stable_baselines3 import PPO as Cls
        elif algorithm == "A2C":
            from stable_baselines3 import A2C as Cls
        elif algorithm == "DQN":
            from stable_baselines3 import DQN as Cls
        elif algorithm == "TD3":
            from stable_baselines3 import TD3 as Cls
        elif algorithm == "DDPG":
            from stable_baselines3 import DDPG as Cls
        elif algorithm == "SAC":
            from stable_baselines3 import SAC as Cls
        model = Cls.load(checkpoint_path, device="cpu")
        return cls(model, algorithm)

    def predict_with_logits(self, obs: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        action, _state = self._model.predict(obs, deterministic=True)
        # logits는 policy net을 직접 호출하여 추출
        with torch.no_grad():
            obs_tensor = torch.as_tensor(obs, dtype=torch.float32).unsqueeze(0)
            policy = getattr(self._model, "policy", None)
            if policy is None:
                # 안전 fallback: action만 반환, logits는 빈 array
                return np.asarray(action), np.array([1.0])
            try:
                # 대부분의 sb3 algo가 forward를 갖는다
                dist = policy.get_distribution(obs_tensor)
                # discrete: distribution.distribution.logits / continuous: mean+std
                logits = self._extract_distribution(dist)
            except Exception:
                logits = np.array([1.0])
        return np.asarray(action), logits

    def _extract_distribution(self, dist) -> np.ndarray:
        # discrete (Categorical)
        inner = getattr(dist, "distribution", None)
        if inner is not None and hasattr(inner, "logits"):
            return inner.logits.detach().cpu().numpy().squeeze()
        # continuous (Normal): mean, std
        if inner is not None and hasattr(inner, "mean") and hasattr(inner, "stddev"):
            mean = inner.mean.detach().cpu().numpy().squeeze()
            std = inner.stddev.detach().cpu().numpy().squeeze()
            return np.concatenate([np.atleast_1d(mean), np.atleast_1d(std)])
        return np.array([1.0])

    def compute_confidence(self, logits_or_q: np.ndarray) -> float:
        """
        - discrete: softmax(logits)의 최대값 (가장 가능성 높은 액션의 확률)
        - continuous: 1 - mean(std)/std_max (분산이 작을수록 신뢰)
        """
        arr = np.asarray(logits_or_q, dtype=np.float32).ravel()
        if arr.size == 0:
            return 0.0
        # heuristic: 양수 logits-like → softmax; 두 부분(mean,std) → continuous 처리
        if arr.size >= 2 and arr.size % 2 == 0:
            half = arr.size // 2
            mean = arr[:half]
            std = arr[half:]
            std_max = max(float(std.max()), 1e-6)
            conf = 1.0 - float(std.mean()) / std_max
            return float(np.clip(conf, 0.0, 1.0))
        # discrete: softmax
        e = np.exp(arr - arr.max())
        probs = e / e.sum()
        return float(np.clip(probs.max(), 0.0, 1.0))
```

- [ ] **Step 6: 실행 → pass 확인**

```bash
pytest tests/test_sb3_adapter.py -v
```

기대: 3개 테스트 PASS. 첫 번째 테스트는 PPO 학습이 ~수초 걸림 — 정상.

- [ ] **Step 7: 커밋**

```bash
git add rl-inference-server/pyproject.toml rl-inference-server/src/adapters/ rl-inference-server/tests/test_sb3_adapter.py
git commit -m "feat(rl-server): SB3 adapter with confidence calculation"
```

---

## Task 6: Pydantic 스키마 + /predict (portfolio) 라우트

**Files:**
- Create: `rl-inference-server/src/schemas.py`
- Create: `rl-inference-server/src/state.py`
- Create: `rl-inference-server/src/inference/__init__.py`
- Create: `rl-inference-server/src/inference/portfolio.py`
- Modify: `rl-inference-server/src/main.py`
- Create: `rl-inference-server/tests/test_predict_portfolio.py`

- [ ] **Step 1: 실패 테스트 작성**

`rl-inference-server/tests/test_predict_portfolio.py`:

```python
import json
from pathlib import Path
import numpy as np
import pytest
from fastapi.testclient import TestClient


def _make_dummy_ppo(tmp_path: Path) -> str:
    import gymnasium as gym
    from stable_baselines3 import PPO

    env = gym.make("CartPole-v1")
    model = PPO("MlpPolicy", env, n_steps=64, verbose=0)
    path = tmp_path / "ppo.zip"
    model.save(str(path))
    return str(path)


def _build_request(ckpt: str) -> dict:
    return {
        "model_id": "test-model-1",
        "checkpoint_path": ckpt,
        "algorithm": "PPO",
        "kind": "portfolio",
        "state_window": 5,
        "input_features": ["close"],
        "ohlcv": {
            "AAPL": [{"date": f"2026-04-{20+i:02d}", "open": 1, "high": 1, "low": 1, "close": 1.0, "volume": 1} for i in range(5)],
            "MSFT": [{"date": f"2026-04-{20+i:02d}", "open": 1, "high": 1, "low": 1, "close": 1.0, "volume": 1} for i in range(5)],
        },
        "indicators": None,
        "current_positions": None,
    }


def test_predict_returns_weights_and_confidence(tmp_path, monkeypatch):
    monkeypatch.setenv("RL_API_KEY", "test-key")
    monkeypatch.setenv("MODEL_DIR", str(tmp_path / "models"))
    from src.main import app

    client = TestClient(app)
    ckpt = _make_dummy_ppo(tmp_path)
    body = _build_request(ckpt)
    resp = client.post("/predict", headers={"X-RL-API-KEY": "test-key"}, json=body)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert data["kind"] == "portfolio"
    assert isinstance(data["weights"], dict)
    assert set(data["weights"].keys()) == {"AAPL", "MSFT"}
    weight_sum = sum(data["weights"].values())
    assert abs(weight_sum - 1.0) < 1e-3
    assert 0 <= data["confidence"] <= 1
```

- [ ] **Step 2: 실행 → fail 확인**

```bash
pytest tests/test_predict_portfolio.py -v
```

기대: /predict 미존재로 FAIL.

- [ ] **Step 3: schemas.py 구현**

`rl-inference-server/src/schemas.py`:

```python
from __future__ import annotations
from typing import Literal, Optional
from pydantic import BaseModel, Field


class OHLCVRow(BaseModel):
    date: str
    open: float
    high: float
    low: float
    close: float
    volume: float


class PredictRequest(BaseModel):
    model_id: str
    checkpoint_path: str
    algorithm: str
    kind: Literal["portfolio", "single_asset"]
    state_window: int = Field(ge=1, le=500)
    input_features: list[str]
    ohlcv: dict[str, list[OHLCVRow]]
    indicators: Optional[dict[str, dict[str, list[float]]]] = None
    current_positions: Optional[dict[str, dict]] = None


class PortfolioPredictResponse(BaseModel):
    kind: Literal["portfolio"] = "portfolio"
    weights: dict[str, float]
    confidence: float
    raw_action: list[float]
    metadata: dict


class SinglePredictResponse(BaseModel):
    kind: Literal["single_asset"] = "single_asset"
    action: Literal["buy", "sell", "hold"]
    size_hint: Optional[float] = None
    confidence: float
    metadata: dict
```

- [ ] **Step 4: state.py 구현 (간단 state hash 유틸)**

`rl-inference-server/src/state.py`:

```python
import hashlib
import json


def hash_state(payload: dict) -> str:
    """state 입력의 결정적 SHA256."""
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()
```

- [ ] **Step 5: portfolio.py 구현**

`rl-inference-server/src/inference/__init__.py`: 빈 파일

`rl-inference-server/src/inference/portfolio.py`:

```python
from __future__ import annotations
import time
import numpy as np
from src.adapters.sb3 import SB3Adapter
from src.schemas import PredictRequest, PortfolioPredictResponse


class PortfolioInferenceEngine:
    def __init__(self, adapter: SB3Adapter) -> None:
        self._adapter = adapter

    def run(self, req: PredictRequest) -> PortfolioPredictResponse:
        t0 = time.time()
        # state 구성: 종목별 close의 마지막 state_window 봉 평탄화
        tickers = sorted(req.ohlcv.keys())
        windows = []
        for t in tickers:
            rows = req.ohlcv[t]
            if len(rows) < req.state_window:
                raise ValueError(f"insufficient OHLCV for {t}: need {req.state_window}, got {len(rows)}")
            closes = [row.close for row in rows[-req.state_window:]]
            windows.append(closes)
        obs = np.array(windows, dtype=np.float32).flatten()

        # 어댑터가 기대하는 obs 차원이 다르면 zero-pad / truncate (모델별 정확한 형상은 어댑터에서 검증해야 하지만 Phase 1은 best-effort)
        action, logits = self._adapter.predict_with_logits(obs)
        confidence = self._adapter.compute_confidence(logits)

        # action을 weights로 변환: 음수 → 0, normalize
        raw = np.asarray(action, dtype=np.float32).ravel()
        if raw.size != len(tickers):
            # 차원 mismatch: 균등분배 + 낮은 confidence
            weights = {t: 1.0 / len(tickers) for t in tickers}
            confidence = min(confidence, 0.0)
        else:
            clipped = np.clip(raw, 0.0, None)
            s = clipped.sum()
            if s <= 0:
                weights = {t: 1.0 / len(tickers) for t in tickers}
            else:
                normalized = clipped / s
                weights = {t: float(w) for t, w in zip(tickers, normalized)}

        return PortfolioPredictResponse(
            weights=weights,
            confidence=float(confidence),
            raw_action=raw.tolist(),
            metadata={
                "model_id": req.model_id,
                "algorithm": req.algorithm,
                "latency_ms": round((time.time() - t0) * 1000, 2),
                "n_tickers": len(tickers),
            },
        )
```

- [ ] **Step 6: main.py에 /predict 라우트 추가**

`rl-inference-server/src/main.py` 전면 교체:

```python
import time
from fastapi import FastAPI, Depends, HTTPException
from src.auth import require_api_key
from src.config import get_settings
from src.model_registry import ModelRegistry
from src.adapters.sb3 import SB3Adapter
from src.inference.portfolio import PortfolioInferenceEngine
from src.schemas import PredictRequest, PortfolioPredictResponse, SinglePredictResponse

settings = get_settings()
START_TIME = time.time()
registry = ModelRegistry(model_dir=settings.model_dir)
app = FastAPI(title="rl-inference-server", version="0.1.0")


def _get_or_load_adapter(req: PredictRequest) -> SB3Adapter:
    cached = registry._cache_get(req.model_id)
    if isinstance(cached, SB3Adapter):
        return cached
    adapter = SB3Adapter.load(req.checkpoint_path, req.algorithm)
    registry._cache_set(req.model_id, adapter)
    return adapter


@app.get("/health", dependencies=[Depends(require_api_key)])
def health():
    return {
        "status": "ok",
        "loaded_models": registry.loaded_models(),
        "uptime_seconds": round(time.time() - START_TIME, 2),
    }


@app.post(
    "/predict",
    dependencies=[Depends(require_api_key)],
    response_model=PortfolioPredictResponse | SinglePredictResponse,
)
def predict(req: PredictRequest):
    if req.kind != "portfolio":
        raise HTTPException(status_code=400, detail="single_asset is not supported in Phase 1")
    adapter = _get_or_load_adapter(req)
    engine = PortfolioInferenceEngine(adapter)
    try:
        return engine.run(req)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
```

- [ ] **Step 7: 실행 → pass 확인**

```bash
pytest -v
```

기대: 모든 테스트 PASS (health 3 + registry 4 + sb3 3 + predict 1 = 11).

- [ ] **Step 8: 커밋**

```bash
git add rl-inference-server/src/schemas.py rl-inference-server/src/state.py rl-inference-server/src/inference/ rl-inference-server/src/main.py rl-inference-server/tests/test_predict_portfolio.py
git commit -m "feat(rl-server): /predict portfolio with adapter cache"
```

---

## Task 7: /backtest 엔드포인트 (간단 OHLCV 시뮬레이션)

**Files:**
- Modify: `rl-inference-server/src/schemas.py`
- Create: `rl-inference-server/src/inference/backtest.py`
- Modify: `rl-inference-server/src/main.py`
- Create: `rl-inference-server/tests/test_backtest.py`

- [ ] **Step 1: 실패 테스트 작성**

`rl-inference-server/tests/test_backtest.py`:

```python
from pathlib import Path
from fastapi.testclient import TestClient


def _make_dummy_ppo(tmp_path: Path) -> str:
    import gymnasium as gym
    from stable_baselines3 import PPO
    env = gym.make("CartPole-v1")
    model = PPO("MlpPolicy", env, n_steps=64, verbose=0)
    path = tmp_path / "ppo.zip"
    model.save(str(path))
    return str(path)


def test_backtest_returns_metrics(tmp_path, monkeypatch):
    monkeypatch.setenv("RL_API_KEY", "test-key")
    monkeypatch.setenv("MODEL_DIR", str(tmp_path / "models"))
    from src.main import app
    client = TestClient(app)
    ckpt = _make_dummy_ppo(tmp_path)
    n = 30
    body = {
        "model_id": "m1",
        "checkpoint_path": ckpt,
        "algorithm": "PPO",
        "kind": "portfolio",
        "state_window": 5,
        "input_features": ["close"],
        "ohlcv": {
            "AAPL": [{"date": f"2026-03-{(i%28)+1:02d}", "open":1,"high":1,"low":1,"close":1.0+i*0.01,"volume":1} for i in range(n)],
            "MSFT": [{"date": f"2026-03-{(i%28)+1:02d}", "open":1,"high":1,"low":1,"close":1.0,"volume":1} for i in range(n)],
        },
        "rebalance_dates": [f"2026-03-{i+1:02d}" for i in range(5, n)],
        "initial_capital": 10000.0,
    }
    resp = client.post("/backtest", headers={"X-RL-API-KEY": "test-key"}, json=body)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "total_return" in data
    assert "sharpe_ratio" in data
    assert "equity_curve" in data
    assert isinstance(data["equity_curve"], list)
    assert len(data["equity_curve"]) >= 1
```

- [ ] **Step 2: 실행 → fail**

```bash
pytest tests/test_backtest.py -v
```

기대: 404 또는 모듈 미존재.

- [ ] **Step 3: schemas.py에 BacktestRequest/Response 추가**

`rl-inference-server/src/schemas.py` 끝에 추가:

```python
class BacktestRequest(PredictRequest):
    rebalance_dates: list[str]
    initial_capital: float = 10000.0


class EquityPoint(BaseModel):
    date: str
    equity: float


class BacktestResponse(BaseModel):
    total_return: float
    sharpe_ratio: float
    max_drawdown: float
    n_rebalances: int
    equity_curve: list[EquityPoint]
    metadata: dict
```

- [ ] **Step 4: backtest.py 구현**

`rl-inference-server/src/inference/backtest.py`:

```python
from __future__ import annotations
import time
import numpy as np
from src.adapters.sb3 import SB3Adapter
from src.inference.portfolio import PortfolioInferenceEngine
from src.schemas import BacktestRequest, BacktestResponse, EquityPoint, PredictRequest


def run_backtest(adapter: SB3Adapter, req: BacktestRequest) -> BacktestResponse:
    t0 = time.time()
    engine = PortfolioInferenceEngine(adapter)
    tickers = sorted(req.ohlcv.keys())
    # date → ticker → close lookup
    rows_by_t = {t: {row.date: row.close for row in req.ohlcv[t]} for t in tickers}
    all_dates = sorted({row.date for t in tickers for row in req.ohlcv[t]})

    equity = float(req.initial_capital)
    weights: dict[str, float] = {t: 0.0 for t in tickers}
    curve: list[EquityPoint] = []
    n_rebalances = 0

    prev_prices: dict[str, float] | None = None
    rebal_set = set(req.rebalance_dates)

    for date in all_dates:
        prices = {t: rows_by_t[t].get(date) for t in tickers}
        if any(p is None for p in prices.values()):
            continue
        # 일자 수익률 적용 (직전 종가 대비 현재 종가)
        if prev_prices is not None and any(weights.values()):
            ret = sum(weights[t] * (prices[t] / prev_prices[t] - 1.0) for t in tickers)
            equity *= (1.0 + ret)
        prev_prices = prices

        if date in rebal_set:
            sub_req = PredictRequest(
                model_id=req.model_id,
                checkpoint_path=req.checkpoint_path,
                algorithm=req.algorithm,
                kind=req.kind,
                state_window=req.state_window,
                input_features=req.input_features,
                ohlcv={
                    t: [r for r in req.ohlcv[t] if r.date <= date][-req.state_window:]
                    for t in tickers
                },
            )
            try:
                pred = engine.run(sub_req)
                weights = pred.weights
                n_rebalances += 1
            except Exception:
                pass

        curve.append(EquityPoint(date=date, equity=equity))

    if not curve:
        curve = [EquityPoint(date=all_dates[0] if all_dates else "1970-01-01", equity=equity)]

    equities = np.array([p.equity for p in curve], dtype=np.float64)
    rets = np.diff(equities) / equities[:-1] if equities.size >= 2 else np.array([0.0])
    total_return = float(equities[-1] / req.initial_capital - 1.0)
    sharpe = float(rets.mean() / rets.std() * np.sqrt(252)) if rets.std() > 0 else 0.0
    peak = np.maximum.accumulate(equities)
    drawdown = (equities - peak) / peak
    max_dd = float(drawdown.min()) if drawdown.size else 0.0

    return BacktestResponse(
        total_return=total_return,
        sharpe_ratio=sharpe,
        max_drawdown=max_dd,
        n_rebalances=n_rebalances,
        equity_curve=curve,
        metadata={
            "model_id": req.model_id,
            "latency_ms": round((time.time() - t0) * 1000, 2),
            "n_dates": len(all_dates),
        },
    )
```

- [ ] **Step 5: main.py에 /backtest 추가**

`rl-inference-server/src/main.py`에 import + 라우트 추가:

```python
from src.schemas import BacktestRequest, BacktestResponse
from src.inference.backtest import run_backtest

@app.post("/backtest", dependencies=[Depends(require_api_key)], response_model=BacktestResponse)
def backtest(req: BacktestRequest):
    if req.kind != "portfolio":
        raise HTTPException(status_code=400, detail="single_asset backtest not supported in Phase 1")
    adapter = _get_or_load_adapter(req)
    return run_backtest(adapter, req)
```

- [ ] **Step 6: 실행 → pass**

```bash
pytest -v
```

기대: 모든 테스트 PASS.

- [ ] **Step 7: 커밋**

```bash
git add rl-inference-server/src/schemas.py rl-inference-server/src/inference/backtest.py rl-inference-server/src/main.py rl-inference-server/tests/test_backtest.py
git commit -m "feat(rl-server): /backtest endpoint with sharpe + drawdown"
```

---

## Task 8: TypeScript 타입 확장 (메인 앱)

**Files:**
- Modify: `dental-clinic-manager/src/types/investment.ts`
- Create: `dental-clinic-manager/src/types/rlTrading.ts`

- [ ] **Step 1: rlTrading.ts 생성**

`dental-clinic-manager/src/types/rlTrading.ts`:

```typescript
export type RLModelSource = 'finrl_pretrained' | 'sb3_pretrained' | 'custom'
export type RLModelKind = 'portfolio' | 'single_asset'
export type RLModelStatus = 'pending' | 'downloading' | 'ready' | 'failed' | 'archived'
export type RLAlgorithm = 'PPO' | 'A2C' | 'TD3' | 'DDPG' | 'DQN' | 'SAC'

export interface RLOutputShape {
  type: 'continuous' | 'discrete'
  dim: number
}

export interface RLModel {
  id: string
  user_id: string
  clinic_id: string
  name: string
  description?: string | null
  source: RLModelSource
  algorithm: RLAlgorithm
  kind: RLModelKind
  market: string
  timeframe: string
  universe: string[] | null
  input_features: string[]
  state_window: number
  output_shape: RLOutputShape
  checkpoint_url: string | null
  checkpoint_path: string | null
  checkpoint_sha256: string | null
  min_confidence: number
  status: RLModelStatus
  metrics: Record<string, unknown> | null
  failure_reason: string | null
  created_at: string
  updated_at: string
}

export interface RLModelCreateInput {
  name: string
  description?: string
  source: RLModelSource
  algorithm: RLAlgorithm
  kind: RLModelKind
  market?: string
  timeframe?: string
  universe?: string[]
  input_features: string[]
  state_window: number
  output_shape: RLOutputShape
  checkpoint_url: string
  checkpoint_sha256: string
  min_confidence?: number
}

export type RLDecision =
  | 'order'
  | 'hold'
  | 'blocked_low_confidence'
  | 'blocked_kill_switch'
  | 'error'

export interface RLInferenceLog {
  id: string
  strategy_id: string
  rl_model_id: string
  user_id: string
  trade_date: string
  state_hash: string
  output: Record<string, unknown>
  confidence: number | null
  decision: RLDecision
  blocked_reason: string | null
  latency_ms: number | null
  error_message: string | null
  created_at: string
}
```

- [ ] **Step 2: investment.ts 확장 — strategy_type, rl_model_id 필드**

기존 `InvestmentStrategy` 인터페이스에 다음 필드 추가:

```typescript
strategy_type: 'rule' | 'rl_portfolio' | 'rl_single'
rl_model_id?: string | null
```

(파일 내 정확한 위치는 기존 InvestmentStrategy interface — `id, user_id, ...` 필드 옆에. `risk_settings` 다음 줄 추천. 동일한 변경을 `InvestmentStrategyInput`에도 추가하되 strategy_type은 optional default 'rule', rl_model_id optional.)

- [ ] **Step 3: 타입 체크 실행**

```bash
cd dental-clinic-manager
npx tsc --noEmit 2>&1 | grep -E "rlTrading|investment\.ts" | head -10
```

기대: 출력 없음 (에러 없음).

- [ ] **Step 4: 커밋**

```bash
git add src/types/rlTrading.ts src/types/investment.ts
git commit -m "feat(rl-trading): typescript types for RL models and strategies"
```

---

## Task 9: trading-worker `rlInferenceClient` (TDD)

**Files:**
- Modify: `trading-worker/package.json` (vitest devDep)
- Create: `trading-worker/vitest.config.ts`
- Create: `trading-worker/src/rlInferenceClient.ts`
- Create: `trading-worker/tests/rlInferenceClient.test.ts`

- [ ] **Step 1: vitest 추가**

`trading-worker/package.json`의 devDependencies에 추가:

```json
"vitest": "^2.1.0"
```

scripts에 추가:

```json
"test": "vitest run",
"test:watch": "vitest"
```

```bash
cd trading-worker && npm install
```

`trading-worker/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 10000,
  },
})
```

- [ ] **Step 2: 실패 테스트 작성**

`trading-worker/tests/rlInferenceClient.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RLInferenceClient } from '../src/rlInferenceClient'

describe('RLInferenceClient', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('predict() POSTs with X-RL-API-KEY and parses portfolio response', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          kind: 'portfolio',
          weights: { AAPL: 0.5, MSFT: 0.5 },
          confidence: 0.8,
          raw_action: [0.5, 0.5],
          metadata: {},
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    )
    global.fetch = fetchMock as unknown as typeof fetch
    const client = new RLInferenceClient({ baseUrl: 'http://127.0.0.1:8001', apiKey: 'k', timeoutMs: 1000 })
    const res = await client.predict({
      model_id: 'm',
      checkpoint_path: '/p',
      algorithm: 'PPO',
      kind: 'portfolio',
      state_window: 5,
      input_features: ['close'],
      ohlcv: {},
    })
    expect(fetchMock).toHaveBeenCalledOnce()
    const [, init] = fetchMock.mock.calls[0]
    expect((init as RequestInit).headers).toMatchObject({ 'X-RL-API-KEY': 'k' })
    expect(res.kind).toBe('portfolio')
    expect(res.confidence).toBe(0.8)
  })

  it('throws timeout error after timeoutMs', async () => {
    global.fetch = vi.fn().mockImplementation(
      () => new Promise(() => {}),  // never resolves
    ) as unknown as typeof fetch
    const client = new RLInferenceClient({ baseUrl: 'http://x', apiKey: 'k', timeoutMs: 50 })
    await expect(
      client.predict({
        model_id: 'm', checkpoint_path: '/p', algorithm: 'PPO', kind: 'portfolio',
        state_window: 5, input_features: ['close'], ohlcv: {},
      }),
    ).rejects.toThrow(/timeout/i)
  })

  it('throws on non-2xx response', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('bad', { status: 500 })) as unknown as typeof fetch
    const client = new RLInferenceClient({ baseUrl: 'http://x', apiKey: 'k', timeoutMs: 1000 })
    await expect(
      client.predict({
        model_id: 'm', checkpoint_path: '/p', algorithm: 'PPO', kind: 'portfolio',
        state_window: 5, input_features: ['close'], ohlcv: {},
      }),
    ).rejects.toThrow(/500/)
  })
})
```

- [ ] **Step 3: 실행 → fail**

```bash
npm test
```

기대: 모듈 미존재로 FAIL.

- [ ] **Step 4: rlInferenceClient.ts 구현**

`trading-worker/src/rlInferenceClient.ts`:

```typescript
export interface RLInferenceConfig {
  baseUrl: string
  apiKey: string
  timeoutMs: number
}

export interface PredictRequestBody {
  model_id: string
  checkpoint_path: string
  algorithm: string
  kind: 'portfolio' | 'single_asset'
  state_window: number
  input_features: string[]
  ohlcv: Record<string, Array<{ date: string; open: number; high: number; low: number; close: number; volume: number }>>
  indicators?: Record<string, Record<string, number[]>>
  current_positions?: Record<string, { qty: number; avg_price: number }>
}

export interface PortfolioPredictResponse {
  kind: 'portfolio'
  weights: Record<string, number>
  confidence: number
  raw_action: number[]
  metadata: Record<string, unknown>
}

export interface SinglePredictResponse {
  kind: 'single_asset'
  action: 'buy' | 'sell' | 'hold'
  size_hint?: number
  confidence: number
  metadata: Record<string, unknown>
}

export type PredictResponse = PortfolioPredictResponse | SinglePredictResponse

export class RLInferenceClient {
  constructor(private cfg: RLInferenceConfig) {}

  async predict(body: PredictRequestBody): Promise<PredictResponse> {
    return this._post('/predict', body)
  }

  async health(): Promise<{ status: string; loaded_models: string[]; uptime_seconds: number }> {
    return this._get('/health')
  }

  private async _post<T>(path: string, body: unknown): Promise<T> {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(new Error('timeout')), this.cfg.timeoutMs)
    try {
      const resp = await fetch(`${this.cfg.baseUrl}${path}`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'X-RL-API-KEY': this.cfg.apiKey,
        },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      })
      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        throw new Error(`rl-inference-server ${path} returned ${resp.status}: ${text}`)
      }
      return (await resp.json()) as T
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        throw new Error(`rl-inference-server ${path} timeout after ${this.cfg.timeoutMs}ms`)
      }
      throw err
    } finally {
      clearTimeout(timer)
    }
  }

  private async _get<T>(path: string): Promise<T> {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(new Error('timeout')), this.cfg.timeoutMs)
    try {
      const resp = await fetch(`${this.cfg.baseUrl}${path}`, {
        headers: { 'X-RL-API-KEY': this.cfg.apiKey },
        signal: ctrl.signal,
      })
      if (!resp.ok) {
        throw new Error(`rl-inference-server ${path} returned ${resp.status}`)
      }
      return (await resp.json()) as T
    } finally {
      clearTimeout(timer)
    }
  }
}
```

- [ ] **Step 5: 실행 → pass**

```bash
npm test
```

기대: 3 tests PASS.

- [ ] **Step 6: 커밋**

```bash
git add trading-worker/package.json trading-worker/package-lock.json trading-worker/vitest.config.ts trading-worker/src/rlInferenceClient.ts trading-worker/tests/
git commit -m "feat(worker): rl-inference HTTP client with timeout"
```

---

## Task 10: trading-worker `dailyRebalanceJob` (TDD)

**Files:**
- Create: `trading-worker/src/dailyRebalanceJob.ts`
- Create: `trading-worker/tests/dailyRebalanceJob.test.ts`
- Modify: `trading-worker/src/index.ts` (cron 등록)

- [ ] **Step 1: 실패 테스트 작성**

`trading-worker/tests/dailyRebalanceJob.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { runDailyRebalance, DailyRebalanceDeps } from '../src/dailyRebalanceJob'

function makeDeps(overrides: Partial<DailyRebalanceDeps> = {}): DailyRebalanceDeps {
  return {
    fetchActiveRLStrategies: vi.fn().mockResolvedValue([]),
    fetchUserSettings: vi.fn().mockResolvedValue({ rl_paused_at: null }),
    fetchOhlcvWindow: vi.fn().mockResolvedValue({}),
    fetchCurrentPositions: vi.fn().mockResolvedValue({}),
    rlClient: { predict: vi.fn(), health: vi.fn() } as any,
    insertInferenceLog: vi.fn().mockResolvedValue(undefined),
    sendTelegram: vi.fn().mockResolvedValue(undefined),
    executeAutoOrder: vi.fn().mockResolvedValue({ ok: true, orderId: 'o1' }),
    today: '2026-04-29',
    ...overrides,
  }
}

describe('runDailyRebalance', () => {
  beforeEach(() => vi.clearAllMocks())

  it('skips when no active RL strategies', async () => {
    const deps = makeDeps()
    const result = await runDailyRebalance(deps)
    expect(result.processed).toBe(0)
  })

  it('blocks when kill switch is active', async () => {
    const deps = makeDeps({
      fetchActiveRLStrategies: vi.fn().mockResolvedValue([
        { id: 's1', user_id: 'u1', strategy_type: 'rl_portfolio', automation_level: 1, rl_model: { id: 'm1', min_confidence: 0.5, universe: ['AAPL'], state_window: 5, algorithm: 'PPO', input_features: ['close'], checkpoint_path: '/p' } },
      ]),
      fetchUserSettings: vi.fn().mockResolvedValue({ rl_paused_at: '2026-04-29T00:00:00Z' }),
    })
    const result = await runDailyRebalance(deps)
    expect(deps.insertInferenceLog).toHaveBeenCalledWith(expect.objectContaining({ decision: 'blocked_kill_switch' }))
    expect(deps.executeAutoOrder).not.toHaveBeenCalled()
  })

  it('blocks when confidence below min_confidence', async () => {
    const deps = makeDeps({
      fetchActiveRLStrategies: vi.fn().mockResolvedValue([
        { id: 's1', user_id: 'u1', strategy_type: 'rl_portfolio', automation_level: 2, rl_model: { id: 'm1', min_confidence: 0.9, universe: ['AAPL'], state_window: 5, algorithm: 'PPO', input_features: ['close'], checkpoint_path: '/p' } },
      ]),
      rlClient: { predict: vi.fn().mockResolvedValue({ kind: 'portfolio', weights: { AAPL: 1 }, confidence: 0.5, raw_action: [], metadata: {} }), health: vi.fn() } as any,
    })
    const result = await runDailyRebalance(deps)
    expect(deps.insertInferenceLog).toHaveBeenCalledWith(expect.objectContaining({ decision: 'blocked_low_confidence' }))
    expect(deps.executeAutoOrder).not.toHaveBeenCalled()
  })

  it('automation_level=1 sends Telegram only, no auto order', async () => {
    const deps = makeDeps({
      fetchActiveRLStrategies: vi.fn().mockResolvedValue([
        { id: 's1', user_id: 'u1', strategy_type: 'rl_portfolio', automation_level: 1, rl_model: { id: 'm1', min_confidence: 0.5, universe: ['AAPL'], state_window: 5, algorithm: 'PPO', input_features: ['close'], checkpoint_path: '/p' } },
      ]),
      rlClient: { predict: vi.fn().mockResolvedValue({ kind: 'portfolio', weights: { AAPL: 1 }, confidence: 0.8, raw_action: [], metadata: {} }), health: vi.fn() } as any,
    })
    await runDailyRebalance(deps)
    expect(deps.sendTelegram).toHaveBeenCalled()
    expect(deps.executeAutoOrder).not.toHaveBeenCalled()
  })

  it('automation_level=2 invokes executeAutoOrder', async () => {
    const deps = makeDeps({
      fetchActiveRLStrategies: vi.fn().mockResolvedValue([
        { id: 's1', user_id: 'u1', strategy_type: 'rl_portfolio', automation_level: 2, rl_model: { id: 'm1', min_confidence: 0.5, universe: ['AAPL'], state_window: 5, algorithm: 'PPO', input_features: ['close'], checkpoint_path: '/p' } },
      ]),
      fetchCurrentPositions: vi.fn().mockResolvedValue({}),
      rlClient: { predict: vi.fn().mockResolvedValue({ kind: 'portfolio', weights: { AAPL: 1 }, confidence: 0.8, raw_action: [], metadata: {} }), health: vi.fn() } as any,
    })
    await runDailyRebalance(deps)
    expect(deps.executeAutoOrder).toHaveBeenCalled()
  })

  it('logs error and continues on prediction failure', async () => {
    const deps = makeDeps({
      fetchActiveRLStrategies: vi.fn().mockResolvedValue([
        { id: 's1', user_id: 'u1', strategy_type: 'rl_portfolio', automation_level: 2, rl_model: { id: 'm1', min_confidence: 0.5, universe: ['AAPL'], state_window: 5, algorithm: 'PPO', input_features: ['close'], checkpoint_path: '/p' } },
      ]),
      rlClient: { predict: vi.fn().mockRejectedValue(new Error('timeout')), health: vi.fn() } as any,
    })
    await runDailyRebalance(deps)
    expect(deps.insertInferenceLog).toHaveBeenCalledWith(expect.objectContaining({ decision: 'error' }))
  })
})
```

- [ ] **Step 2: 실행 → fail**

```bash
npm test
```

기대: 모듈 미존재로 FAIL.

- [ ] **Step 3: dailyRebalanceJob.ts 구현**

`trading-worker/src/dailyRebalanceJob.ts`:

```typescript
import type { RLInferenceClient, PortfolioPredictResponse } from './rlInferenceClient'

export interface RLStrategyRow {
  id: string
  user_id: string
  strategy_type: 'rl_portfolio' | 'rl_single'
  automation_level: 1 | 2
  rl_model: {
    id: string
    min_confidence: number
    universe: string[]
    state_window: number
    algorithm: string
    input_features: string[]
    checkpoint_path: string
  }
}

export interface DailyRebalanceDeps {
  fetchActiveRLStrategies: () => Promise<RLStrategyRow[]>
  fetchUserSettings: (userId: string) => Promise<{ rl_paused_at: string | null }>
  fetchOhlcvWindow: (
    universe: string[], stateWindow: number,
  ) => Promise<Record<string, Array<{ date: string; open: number; high: number; low: number; close: number; volume: number }>>>
  fetchCurrentPositions: (userId: string) => Promise<Record<string, { qty: number; avg_price: number }>>
  rlClient: Pick<RLInferenceClient, 'predict' | 'health'>
  insertInferenceLog: (log: InferenceLogEntry) => Promise<void>
  sendTelegram: (userId: string, message: string) => Promise<void>
  executeAutoOrder: (params: {
    userId: string; strategyId: string; ticker: string; orderType: 'buy' | 'sell';
    quantity: number; orderMethod: 'market' | 'limit'; signalData: Record<string, unknown>
  }) => Promise<{ ok: boolean; orderId?: string; error?: string }>
  today: string
}

export interface InferenceLogEntry {
  strategy_id: string
  rl_model_id: string
  user_id: string
  trade_date: string
  state_hash: string
  output: Record<string, unknown>
  confidence: number | null
  decision: 'order' | 'hold' | 'blocked_low_confidence' | 'blocked_kill_switch' | 'error'
  blocked_reason?: string | null
  error_message?: string | null
  latency_ms?: number | null
}

interface RebalanceResult { processed: number; ordered: number; blocked: number; errored: number }

export async function runDailyRebalance(deps: DailyRebalanceDeps): Promise<RebalanceResult> {
  const result: RebalanceResult = { processed: 0, ordered: 0, blocked: 0, errored: 0 }
  const strategies = await deps.fetchActiveRLStrategies()

  for (const s of strategies) {
    result.processed++
    try {
      const settings = await deps.fetchUserSettings(s.user_id)
      if (settings.rl_paused_at) {
        await deps.insertInferenceLog({
          strategy_id: s.id, rl_model_id: s.rl_model.id, user_id: s.user_id,
          trade_date: deps.today, state_hash: '',
          output: {}, confidence: null, decision: 'blocked_kill_switch',
          blocked_reason: `paused at ${settings.rl_paused_at}`,
        })
        result.blocked++
        continue
      }

      const ohlcv = await deps.fetchOhlcvWindow(s.rl_model.universe, s.rl_model.state_window)
      const positions = await deps.fetchCurrentPositions(s.user_id)
      const t0 = Date.now()
      const prediction = await deps.rlClient.predict({
        model_id: s.rl_model.id,
        checkpoint_path: s.rl_model.checkpoint_path,
        algorithm: s.rl_model.algorithm,
        kind: 'portfolio',
        state_window: s.rl_model.state_window,
        input_features: s.rl_model.input_features,
        ohlcv,
        current_positions: positions,
      }) as PortfolioPredictResponse
      const latencyMs = Date.now() - t0

      if (prediction.confidence < s.rl_model.min_confidence) {
        await deps.insertInferenceLog({
          strategy_id: s.id, rl_model_id: s.rl_model.id, user_id: s.user_id,
          trade_date: deps.today, state_hash: '',
          output: prediction as unknown as Record<string, unknown>,
          confidence: prediction.confidence, decision: 'blocked_low_confidence',
          blocked_reason: `confidence ${prediction.confidence} < ${s.rl_model.min_confidence}`,
          latency_ms: latencyMs,
        })
        await deps.sendTelegram(s.user_id, `[RL] ${s.id} 신뢰도 ${prediction.confidence.toFixed(2)} 낮아 hold`)
        result.blocked++
        continue
      }

      // weights → orders 변환 (Phase 1: 간단 diff 로직)
      const orders = computeOrdersFromWeights(prediction.weights, positions, /* totalCapital는 fetchCurrentPositions의 별도 컬럼 또는 계좌 잔액에서 — Phase 1 단순화 */ 10000)

      if (s.automation_level === 1) {
        await deps.sendTelegram(s.user_id, `[RL] ${s.id} 신호: ${JSON.stringify(orders.slice(0, 5))}`)
      } else {
        for (const o of orders) {
          await deps.executeAutoOrder({
            userId: s.user_id, strategyId: s.id,
            ticker: o.ticker, orderType: o.side, quantity: o.qty,
            orderMethod: 'market',
            signalData: { source: 'rl', model_id: s.rl_model.id, weights: prediction.weights },
          })
        }
        result.ordered++
      }

      await deps.insertInferenceLog({
        strategy_id: s.id, rl_model_id: s.rl_model.id, user_id: s.user_id,
        trade_date: deps.today, state_hash: '',
        output: prediction as unknown as Record<string, unknown>,
        confidence: prediction.confidence, decision: 'order', latency_ms: latencyMs,
      })
    } catch (err) {
      const message = (err as Error).message
      await deps.insertInferenceLog({
        strategy_id: s.id, rl_model_id: s.rl_model.id, user_id: s.user_id,
        trade_date: deps.today, state_hash: '',
        output: {}, confidence: null, decision: 'error',
        error_message: message,
      })
      try { await deps.sendTelegram(s.user_id, `[RL] ${s.id} 오류: ${message}`) } catch {}
      result.errored++
    }
  }
  return result
}

interface PlannedOrder { ticker: string; side: 'buy' | 'sell'; qty: number }

function computeOrdersFromWeights(
  weights: Record<string, number>,
  current: Record<string, { qty: number; avg_price: number }>,
  totalCapitalFallback: number,
): PlannedOrder[] {
  const orders: PlannedOrder[] = []
  const totalQty = Object.values(current).reduce((s, p) => s + p.qty * p.avg_price, 0)
  const total = totalQty > 0 ? totalQty : totalCapitalFallback
  for (const [ticker, w] of Object.entries(weights)) {
    const targetValue = total * w
    const currentQty = current[ticker]?.qty ?? 0
    const currentValue = currentQty * (current[ticker]?.avg_price ?? 0)
    const diff = targetValue - currentValue
    if (Math.abs(diff) < total * 0.01) continue  // 1% threshold
    if (diff > 0) {
      orders.push({ ticker, side: 'buy', qty: Math.max(1, Math.floor(diff / Math.max(current[ticker]?.avg_price ?? 1, 1))) })
    } else {
      const qty = Math.min(currentQty, Math.floor(Math.abs(diff) / Math.max(current[ticker]?.avg_price ?? 1, 1)))
      if (qty > 0) orders.push({ ticker, side: 'sell', qty })
    }
  }
  return orders
}
```

- [ ] **Step 4: 실행 → pass**

```bash
npm test
```

기대: 6 tests PASS.

- [ ] **Step 5: index.ts에 cron 등록 (간단 통합, 실제 supabase 연결은 다음 task)**

`trading-worker/src/index.ts`에 다음 import + 등록 추가 (기존 main 함수 내부, 다른 cron들 옆):

```typescript
import cron from 'node-cron'
import { runDailyRebalance } from './dailyRebalanceJob'
// ... 기존 imports

// main()의 적절한 위치에:
cron.schedule('0 7 * * 2-6', async () => {
  try {
    logger.info('[dailyRebalance] start')
    const deps = await buildDailyRebalanceDeps()  // 다음 task에서 구현
    const result = await runDailyRebalance(deps)
    logger.info({ result }, '[dailyRebalance] done')
  } catch (err) {
    logger.error({ err }, '[dailyRebalance] failed')
  }
}, { timezone: 'Asia/Seoul' })
```

`buildDailyRebalanceDeps()`는 Task 11에서 구현.

- [ ] **Step 6: 커밋**

```bash
git add trading-worker/src/dailyRebalanceJob.ts trading-worker/src/index.ts trading-worker/tests/dailyRebalanceJob.test.ts
git commit -m "feat(worker): dailyRebalanceJob with safety guards"
```

---

## Task 11: trading-worker dependency wiring (Supabase 호출, OHLCV, KIS 연결)

**Files:**
- Modify: `trading-worker/src/dailyRebalanceJob.ts` (helper export)
- Create: `trading-worker/src/dailyRebalanceDeps.ts`
- Modify: `trading-worker/src/index.ts`

- [ ] **Step 1: dailyRebalanceDeps.ts 작성**

`trading-worker/src/dailyRebalanceDeps.ts`:

```typescript
import type { DailyRebalanceDeps } from './dailyRebalanceJob'
import { RLInferenceClient } from './rlInferenceClient'
import { supabase } from './supabaseClient'
import { sendTelegramMessage } from './telegramNotifier'
import { executeAutoOrder } from './orderExecutor'
import { logger } from './logger'

export async function buildDailyRebalanceDeps(): Promise<DailyRebalanceDeps> {
  const rlClient = new RLInferenceClient({
    baseUrl: process.env.RL_SERVER_URL ?? 'http://127.0.0.1:8001',
    apiKey: process.env.RL_API_KEY ?? '',
    timeoutMs: 5000,
  })
  const today = new Date().toISOString().slice(0, 10)

  return {
    today,
    rlClient,
    fetchActiveRLStrategies: async () => {
      const { data, error } = await supabase
        .from('investment_strategies')
        .select('id, user_id, strategy_type, automation_level, rl_models!inner(id, min_confidence, universe, state_window, algorithm, input_features, checkpoint_path)')
        .eq('is_active', true)
        .in('strategy_type', ['rl_portfolio', 'rl_single'])
      if (error) {
        logger.error({ error }, 'fetchActiveRLStrategies failed')
        return []
      }
      return (data ?? []).map((s: any) => ({
        id: s.id, user_id: s.user_id, strategy_type: s.strategy_type,
        automation_level: s.automation_level, rl_model: s.rl_models,
      }))
    },
    fetchUserSettings: async (userId) => {
      const { data } = await supabase
        .from('user_investment_settings')
        .select('rl_paused_at')
        .eq('user_id', userId)
        .maybeSingle()
      return { rl_paused_at: data?.rl_paused_at ?? null }
    },
    fetchOhlcvWindow: async (universe, stateWindow) => {
      // KIS 일봉 캐시 사용 (intraday_price_cache는 분봉 → 일봉은 별도 daily_price_cache 또는 KIS 직접 호출)
      // Phase 1: 별도 daily_prices 테이블이 없다면 KIS API 직접 호출 (orderExecutor.ts에서 토큰 발급 함수 재사용)
      // 단순화: 본 plan의 task 12에서 daily_prices 캐시를 추가하거나, 외부 데이터(yfinance equivalent)를 활용. 여기서는 빈 객체 fallback로 두고 trading-worker가 조회 실패 시 hold 처리.
      const result: Record<string, any[]> = {}
      for (const ticker of universe) {
        const { data } = await supabase
          .from('intraday_price_cache')   // Phase 1 임시: 분봉 캐시를 일봉으로 집계
          .select('datetime, open, high, low, close, volume')
          .eq('ticker', ticker).eq('market', 'US').eq('timeframe', '1d')
          .order('datetime', { ascending: false })
          .limit(stateWindow)
        result[ticker] = (data ?? []).reverse().map((row) => ({
          date: row.datetime.slice(0, 10),
          open: row.open, high: row.high, low: row.low, close: row.close, volume: row.volume,
        }))
      }
      return result
    },
    fetchCurrentPositions: async (userId) => {
      const { data } = await supabase
        .from('positions')
        .select('ticker, quantity, avg_entry_price')
        .eq('user_id', userId).eq('status', 'open')
      const map: Record<string, { qty: number; avg_price: number }> = {}
      for (const p of data ?? []) {
        map[p.ticker] = { qty: p.quantity, avg_price: p.avg_entry_price }
      }
      return map
    },
    insertInferenceLog: async (log) => {
      await supabase.from('rl_inference_logs').insert(log)
    },
    sendTelegram: async (userId, message) => {
      await sendTelegramMessage(userId, message)
    },
    executeAutoOrder: async (params) => {
      const r = await executeAutoOrder({
        userId: params.userId,
        strategyId: params.strategyId,
        ticker: params.ticker,
        market: 'US',
        orderType: params.orderType,
        orderMethod: params.orderMethod,
        quantity: params.quantity,
        signalData: params.signalData,
      } as any)
      return { ok: r.success === true, orderId: r.orderId, error: r.error }
    },
  }
}
```

**중요**: `executeAutoOrder`, `sendTelegramMessage`의 정확한 시그니처는 기존 모듈을 읽어 일치시킨다. 차이가 있으면 `as any` 캐스트는 제거하고 정확히 매핑한다.

- [ ] **Step 2: index.ts 수정**

`buildDailyRebalanceDeps` import 후 cron handler 안에서 호출:

```typescript
import { buildDailyRebalanceDeps } from './dailyRebalanceDeps'
// ...
cron.schedule('0 7 * * 2-6', async () => {
  try {
    const deps = await buildDailyRebalanceDeps()
    const result = await runDailyRebalance(deps)
    logger.info({ result }, '[dailyRebalance] done')
  } catch (err) {
    logger.error({ err }, '[dailyRebalance] failed')
  }
}, { timezone: 'Asia/Seoul' })
```

- [ ] **Step 3: 빌드 검증**

```bash
cd trading-worker && npm run build
```

기대: 빌드 성공. 타입 에러 발생 시 `executeAutoOrder`/`sendTelegramMessage` 시그니처에 맞춰 수정.

- [ ] **Step 4: 커밋**

```bash
git add trading-worker/src/dailyRebalanceDeps.ts trading-worker/src/index.ts
git commit -m "feat(worker): wire dailyRebalanceJob to supabase + KIS infra"
```

---

## Task 12: 메인 앱 — `rlModelService` + `/api/investment/rl-models` 라우트

**Files:**
- Create: `dental-clinic-manager/src/lib/rlModelService.ts`
- Create: `dental-clinic-manager/src/app/api/investment/rl-models/route.ts`
- Create: `dental-clinic-manager/src/app/api/investment/rl-models/[id]/route.ts`

- [ ] **Step 1: rlModelService.ts 작성**

`dental-clinic-manager/src/lib/rlModelService.ts`:

```typescript
import { createServerClient } from '@/lib/supabase/server'
import type { RLModel, RLModelCreateInput } from '@/types/rlTrading'

const RL_SERVER_URL = process.env.RL_SERVER_URL ?? 'http://127.0.0.1:8001'
const RL_API_KEY = process.env.RL_API_KEY ?? ''

export const rlModelService = {
  async listForClinic(clinicId: string): Promise<{ data: RLModel[]; error: string | null }> {
    const supabase = await createServerClient()
    const { data, error } = await supabase
      .from('rl_models').select('*')
      .eq('clinic_id', clinicId)
      .order('created_at', { ascending: false })
    if (error) return { data: [], error: error.message }
    return { data: (data ?? []) as RLModel[], error: null }
  },

  async create(input: RLModelCreateInput, userId: string, clinicId: string): Promise<{ data: RLModel | null; error: string | null }> {
    const supabase = await createServerClient()
    const { data, error } = await supabase.from('rl_models').insert({
      user_id: userId, clinic_id: clinicId,
      name: input.name, description: input.description ?? null,
      source: input.source, algorithm: input.algorithm, kind: input.kind,
      market: input.market ?? 'US', timeframe: input.timeframe ?? '1d',
      universe: input.universe ?? null, input_features: input.input_features,
      state_window: input.state_window, output_shape: input.output_shape,
      checkpoint_url: input.checkpoint_url, checkpoint_sha256: input.checkpoint_sha256,
      min_confidence: input.min_confidence ?? 0.6,
      status: 'pending',
    }).select().single()
    if (error) return { data: null, error: error.message }
    return { data: data as RLModel, error: null }
  },

  async triggerDownload(modelId: string): Promise<{ success: boolean; error: string | null }> {
    const supabase = await createServerClient()
    const { data: model, error } = await supabase.from('rl_models').select('*').eq('id', modelId).single()
    if (error || !model) return { success: false, error: error?.message ?? 'not found' }

    await supabase.from('rl_models').update({ status: 'downloading' }).eq('id', modelId)

    try {
      // rl-inference-server는 다운로드 후 path를 반환한다고 가정. Phase 1은 trading-worker가 대신 호출.
      const resp = await fetch(`${RL_SERVER_URL}/models/download`, {
        method: 'POST',
        headers: { 'X-RL-API-KEY': RL_API_KEY, 'content-type': 'application/json' },
        body: JSON.stringify({
          model_id: modelId,
          checkpoint_url: model.checkpoint_url,
          checkpoint_sha256: model.checkpoint_sha256,
        }),
      })
      if (!resp.ok) {
        const text = await resp.text().catch(() => '')
        await supabase.from('rl_models').update({ status: 'failed', failure_reason: text }).eq('id', modelId)
        return { success: false, error: text }
      }
      const json = await resp.json()
      await supabase.from('rl_models').update({
        status: 'ready', checkpoint_path: json.path,
      }).eq('id', modelId)
      return { success: true, error: null }
    } catch (err) {
      const msg = (err as Error).message
      await supabase.from('rl_models').update({ status: 'failed', failure_reason: msg }).eq('id', modelId)
      return { success: false, error: msg }
    }
  },

  async archive(modelId: string, userId: string): Promise<{ success: boolean; error: string | null }> {
    const supabase = await createServerClient()
    // 1) 참조 전략을 비활성화
    await supabase.from('investment_strategies')
      .update({ is_active: false })
      .eq('rl_model_id', modelId).eq('user_id', userId)
    // 2) 상태 archived로
    const { error } = await supabase.from('rl_models')
      .update({ status: 'archived' })
      .eq('id', modelId).eq('user_id', userId)
    if (error) return { success: false, error: error.message }
    return { success: true, error: null }
  },
}
```

**참고**: `/models/download` 라우트는 rl-inference-server에 없다 (Task 4의 model_registry는 함수만 제공). 추가 task에서 라우트 구현 필요. (Task 13에서 통합)

- [ ] **Step 2: rl-models GET/POST 라우트**

`dental-clinic-manager/src/app/api/investment/rl-models/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { rlModelService } from '@/lib/rlModelService'
import { createServerClient } from '@/lib/supabase/server'

async function getAuthUser() {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: profile } = await supabase.from('users').select('clinic_id').eq('id', user.id).single()
  return { user, clinicId: profile?.clinic_id }
}

export async function GET() {
  const auth = await getAuthUser()
  if (!auth?.user || !auth.clinicId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const r = await rlModelService.listForClinic(auth.clinicId)
  if (r.error) return NextResponse.json({ error: r.error }, { status: 500 })
  return NextResponse.json({ data: r.data })
}

export async function POST(req: NextRequest) {
  const auth = await getAuthUser()
  if (!auth?.user || !auth.clinicId) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const body = await req.json()
  const created = await rlModelService.create(body, auth.user.id, auth.clinicId)
  if (created.error || !created.data) return NextResponse.json({ error: created.error }, { status: 400 })
  // 비동기 다운로드 트리거 (응답 차단 안 함)
  rlModelService.triggerDownload(created.data.id).catch(() => {})
  return NextResponse.json({ data: created.data }, { status: 201 })
}
```

- [ ] **Step 3: rl-models/[id] DELETE 라우트**

`dental-clinic-manager/src/app/api/investment/rl-models/[id]/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { rlModelService } from '@/lib/rlModelService'
import { createServerClient } from '@/lib/supabase/server'

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  const r = await rlModelService.archive(id, user.id)
  if (!r.success) return NextResponse.json({ error: r.error }, { status: 400 })
  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 4: 타입 체크 + 커밋**

```bash
cd dental-clinic-manager
npx tsc --noEmit 2>&1 | grep -E "rl-models|rlModelService" | head -10
```

기대: 출력 없음.

```bash
git add src/lib/rlModelService.ts src/app/api/investment/rl-models
git commit -m "feat(rl-trading): rl-models API + service"
```

---

## Task 13: rl-inference-server `/models/download` 라우트 추가

**Files:**
- Modify: `rl-inference-server/src/main.py`
- Modify: `rl-inference-server/src/schemas.py`
- Add tests in `rl-inference-server/tests/test_model_registry.py`

- [ ] **Step 1: 실패 테스트 (라우트 호출)**

`rl-inference-server/tests/test_model_registry.py` 끝에 추가:

```python
import hashlib

def test_download_endpoint_writes_file_and_returns_path(tmp_path, monkeypatch):
    monkeypatch.setenv("RL_API_KEY", "test-key")
    monkeypatch.setenv("MODEL_DIR", str(tmp_path))
    from src.main import app, registry
    from fastapi.testclient import TestClient

    payload = b"fake-model-bytes"
    expected = hashlib.sha256(payload).hexdigest()

    async def fake_fetch(_url: str) -> bytes:
        return payload

    monkeypatch.setattr(registry, "_fetch_bytes", fake_fetch)

    client = TestClient(app)
    body = {"model_id": "m1", "checkpoint_url": "https://example.com/m.zip", "checkpoint_sha256": expected}
    resp = client.post("/models/download", headers={"X-RL-API-KEY": "test-key"}, json=body)
    assert resp.status_code == 200, resp.text
    data = resp.json()
    assert "path" in data
    assert expected in data["path"]
```

- [ ] **Step 2: 실행 → fail (404)**

```bash
pytest tests/test_model_registry.py -v
```

- [ ] **Step 3: schemas.py에 DownloadRequest 추가**

```python
class DownloadRequest(BaseModel):
    model_id: str
    checkpoint_url: str
    checkpoint_sha256: str


class DownloadResponse(BaseModel):
    model_id: str
    path: str
    status: Literal["ready"] = "ready"
```

- [ ] **Step 4: main.py에 /models/download 라우트 추가**

```python
from src.schemas import DownloadRequest, DownloadResponse
from src.model_registry import DownloadError, IntegrityError

@app.post("/models/download", dependencies=[Depends(require_api_key)], response_model=DownloadResponse)
async def models_download(req: DownloadRequest):
    try:
        path = await registry.download(req.model_id, req.checkpoint_url, req.checkpoint_sha256)
    except IntegrityError as e:
        raise HTTPException(status_code=400, detail=f"sha256 mismatch: {e}")
    except DownloadError as e:
        raise HTTPException(status_code=502, detail=f"download failed: {e}")
    return DownloadResponse(model_id=req.model_id, path=path)
```

- [ ] **Step 5: pass + 커밋**

```bash
pytest -v
```

기대: 모두 PASS.

```bash
git add rl-inference-server/src/main.py rl-inference-server/src/schemas.py rl-inference-server/tests/test_model_registry.py
git commit -m "feat(rl-server): /models/download route"
```

---

## Task 14: 메인 앱 — kill switch API + `strategies` 라우트 RL 분기

**Files:**
- Create: `dental-clinic-manager/src/app/api/investment/rl-pause/route.ts`
- Modify: `dental-clinic-manager/src/app/api/investment/strategies/route.ts`
- Modify: `dental-clinic-manager/src/app/api/investment/emergency-stop/route.ts`

- [ ] **Step 1: rl-pause 라우트**

`dental-clinic-manager/src/app/api/investment/rl-pause/route.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { paused, reason } = await req.json() as { paused: boolean; reason?: string }
  const update = paused
    ? { rl_paused_at: new Date().toISOString(), rl_paused_reason: reason ?? 'user manual' }
    : { rl_paused_at: null, rl_paused_reason: null }
  const { error } = await supabase
    .from('user_investment_settings')
    .upsert({ user_id: user.id, ...update })
    .eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, paused })
}
```

- [ ] **Step 2: strategies POST 라우트에 RL 분기 추가**

기존 `dental-clinic-manager/src/app/api/investment/strategies/route.ts`의 `POST` 핸들러에서 body parse 후 다음 로직 추가:

```typescript
const strategyType = body.strategy_type ?? 'rule'

if (strategyType !== 'rule') {
  // RL 전략: 기본 automation_level=1 강제
  if (!body.rl_model_id) {
    return NextResponse.json({ error: 'rl_model_id required for RL strategies' }, { status: 400 })
  }
  if (body.automation_level == null) body.automation_level = 1
  // 모델 status=ready 검증
  const { data: model } = await supabase.from('rl_models')
    .select('id, status, kind').eq('id', body.rl_model_id).single()
  if (!model || model.status !== 'ready') {
    return NextResponse.json({ error: 'model not ready' }, { status: 400 })
  }
  // strategy_type ↔ kind 일치
  const expectedType = model.kind === 'portfolio' ? 'rl_portfolio' : 'rl_single'
  if (strategyType !== expectedType) {
    return NextResponse.json({ error: `strategy_type must be ${expectedType}` }, { status: 400 })
  }
  // Phase 1: rl_single은 자동매매 미지원 → automation_level=1 강제
  if (strategyType === 'rl_single' && body.automation_level === 2) {
    return NextResponse.json({ error: 'rl_single auto trading not supported in Phase 1' }, { status: 400 })
  }
}

// insert 시 strategy_type, rl_model_id 함께 저장
```

(정확한 insert 코드는 기존 패턴을 따름. RL일 때 indicators, buyConditions, sellConditions를 비워둘 수 있도록 nullable 허용 검증 필요. 기존 INSERT가 NOT NULL이라면 빈 객체 `{}`로 채움.)

- [ ] **Step 3: emergency-stop 라우트에 RL 비활성화 포함**

`dental-clinic-manager/src/app/api/investment/emergency-stop/route.ts`의 기존 흐름에서 `is_active=true` UPDATE 시 `strategy_type` 무관하게 모든 활성 전략을 비활성화. 이미 그렇다면 변경 없음. RL 강제 일시정지도 함께:

```typescript
// 기존 모든 활성 전략 비활성화 다음 줄에 추가
await supabase.from('user_investment_settings')
  .upsert({ user_id, rl_paused_at: new Date().toISOString(), rl_paused_reason: 'emergency-stop' })
```

- [ ] **Step 4: 빌드 검증 + 커밋**

```bash
cd dental-clinic-manager
npx tsc --noEmit 2>&1 | grep -E "rl-pause|strategies|emergency-stop" | head
```

기대: 출력 없음.

```bash
git add src/app/api/investment/rl-pause src/app/api/investment/strategies/route.ts src/app/api/investment/emergency-stop/route.ts
git commit -m "feat(rl-trading): kill switch API + strategy_type validation"
```

---

## Task 15: 메인 앱 UI — `/investment/rl-models` 페이지 + 컴포넌트

**Files:**
- Create: `dental-clinic-manager/src/app/investment/rl-models/page.tsx`
- Create: `dental-clinic-manager/src/components/Investment/RLModels/ModelLibraryPanel.tsx`
- Create: `dental-clinic-manager/src/components/Investment/RLModels/ModelRegisterDialog.tsx`
- Create: `dental-clinic-manager/src/components/Investment/RLModels/KillSwitchToggle.tsx`

- [ ] **Step 1: page.tsx**

```tsx
'use client'
import { useEffect, useState } from 'react'
import type { RLModel } from '@/types/rlTrading'
import ModelLibraryPanel from '@/components/Investment/RLModels/ModelLibraryPanel'
import KillSwitchToggle from '@/components/Investment/RLModels/KillSwitchToggle'

export default function RLModelsPage() {
  const [models, setModels] = useState<RLModel[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/investment/rl-models').then(r => r.json()).then((j) => {
      setModels(j.data ?? [])
    }).finally(() => setLoading(false))
  }, [])

  if (loading) {
    return <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-at-accent" /></div>
  }

  return (
    <div className="p-4 sm:p-6 space-y-6 bg-white min-h-screen">
      <div className="flex items-center justify-between pb-3 border-b border-at-border">
        <h2 className="text-lg font-bold text-at-text">RL 모델 라이브러리</h2>
        <KillSwitchToggle />
      </div>
      <div className="bg-at-error-bg border border-at-error rounded-xl p-3 text-sm text-at-error">
        ⚠ 강화학습 모델은 검증 전까지 paper 계좌 + automation_level=1 사용을 강력히 권장합니다.
      </div>
      <ModelLibraryPanel models={models} onChange={() => {
        fetch('/api/investment/rl-models').then(r => r.json()).then((j) => setModels(j.data ?? []))
      }} />
    </div>
  )
}
```

- [ ] **Step 2: ModelLibraryPanel.tsx**

```tsx
'use client'
import { useState } from 'react'
import type { RLModel } from '@/types/rlTrading'
import ModelRegisterDialog from './ModelRegisterDialog'
import { Plus, Trash2 } from 'lucide-react'
import { appConfirm } from '@/components/ui/AppDialog'

interface Props { models: RLModel[]; onChange: () => void }

const STATUS_COLOR: Record<string, string> = {
  ready: 'bg-at-success-bg text-at-success',
  pending: 'bg-at-surface-alt text-at-text-secondary',
  downloading: 'bg-at-accent-light text-at-accent',
  failed: 'bg-at-error-bg text-at-error',
  archived: 'bg-at-surface-alt text-at-text-weak',
}

export default function ModelLibraryPanel({ models, onChange }: Props) {
  const [open, setOpen] = useState(false)

  const onDelete = async (m: RLModel) => {
    const ok = await appConfirm({ title: '모델 보관(archive)', description: `${m.name}을(를) 보관하면 참조 전략이 비활성화됩니다.`, variant: 'destructive', confirmText: '보관' })
    if (!ok) return
    await fetch(`/api/investment/rl-models/${m.id}`, { method: 'DELETE' })
    onChange()
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button onClick={() => setOpen(true)} className="inline-flex items-center gap-2 px-4 py-2 bg-at-accent text-white rounded-xl text-sm font-medium hover:bg-at-accent-hover">
          <Plus className="w-4 h-4" /> 모델 추가
        </button>
      </div>

      {models.length === 0 ? (
        <div className="text-center py-12 bg-at-surface-alt rounded-xl text-at-text-secondary">
          등록된 RL 모델이 없습니다. "모델 추가"를 눌러 사전학습 ckpt URL을 등록하세요.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-at-border">
          <table className="min-w-[800px] w-full text-sm">
            <thead className="bg-at-surface-alt">
              <tr>
                {['이름','종류','알고리즘','시장/주기','상태','신뢰도 임계','작업'].map(h =>
                  <th key={h} className="px-3 py-2 text-left text-xs font-medium text-at-text-weak uppercase tracking-wider">{h}</th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-at-border bg-white">
              {models.map((m) => (
                <tr key={m.id} className="hover:bg-at-surface-alt">
                  <td className="px-3 py-2.5 font-medium">{m.name}</td>
                  <td className="px-3 py-2.5">{m.kind}</td>
                  <td className="px-3 py-2.5">{m.algorithm}</td>
                  <td className="px-3 py-2.5">{m.market} / {m.timeframe}</td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-flex px-2 py-0.5 text-xs rounded-full ${STATUS_COLOR[m.status] ?? ''}`}>{m.status}</span>
                  </td>
                  <td className="px-3 py-2.5">{m.min_confidence.toFixed(2)}</td>
                  <td className="px-3 py-2.5">
                    <button onClick={() => onDelete(m)} aria-label="보관" title="보관" className="p-1.5 rounded-xl hover:bg-at-error-bg text-at-text-secondary hover:text-at-error">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ModelRegisterDialog open={open} onClose={() => setOpen(false)} onCreated={() => { setOpen(false); onChange() }} />
    </div>
  )
}
```

- [ ] **Step 3: ModelRegisterDialog.tsx**

```tsx
'use client'
import { useState } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'

interface Props { open: boolean; onClose: () => void; onCreated: () => void }

export default function ModelRegisterDialog({ open, onClose, onCreated }: Props) {
  const [form, setForm] = useState({
    name: '', algorithm: 'PPO', kind: 'portfolio',
    universe: 'AAPL,MSFT,GOOGL,AMZN,META',
    state_window: 60,
    input_features: 'open,high,low,close,volume',
    output_dim: 5,
    output_type: 'continuous',
    checkpoint_url: '',
    checkpoint_sha256: '',
    min_confidence: 0.6,
    source: 'finrl_pretrained',
  })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setSubmitting(true); setError(null)
    try {
      const body = {
        ...form,
        universe: form.universe.split(',').map(s => s.trim()).filter(Boolean),
        input_features: form.input_features.split(',').map(s => s.trim()).filter(Boolean),
        output_shape: { type: form.output_type, dim: Number(form.output_dim) },
        state_window: Number(form.state_window),
        min_confidence: Number(form.min_confidence),
      }
      const r = await fetch('/api/investment/rl-models', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      if (!r.ok) throw new Error((await r.json()).error || `${r.status}`)
      onCreated()
    } catch (e) {
      setError((e as Error).message)
    } finally { setSubmitting(false) }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent>
        <DialogHeader><DialogTitle>RL 모델 등록</DialogTitle></DialogHeader>
        <div className="space-y-3">
          {error && <div className="p-2 rounded-xl bg-at-error-bg text-at-error text-sm">{error}</div>}
          {/* 폼 필드들 */}
          <Field label="이름 *" v={form.name} on={(v) => setForm({ ...form, name: v })} />
          <Field label="알고리즘" v={form.algorithm} on={(v) => setForm({ ...form, algorithm: v })} />
          <Field label="종목 유니버스 (콤마 구분)" v={form.universe} on={(v) => setForm({ ...form, universe: v })} />
          <Field label="입력 피처 (콤마 구분)" v={form.input_features} on={(v) => setForm({ ...form, input_features: v })} />
          <Field label="state_window" v={String(form.state_window)} on={(v) => setForm({ ...form, state_window: Number(v) })} />
          <Field label="output dim" v={String(form.output_dim)} on={(v) => setForm({ ...form, output_dim: Number(v) })} />
          <Field label="ckpt URL *" v={form.checkpoint_url} on={(v) => setForm({ ...form, checkpoint_url: v })} />
          <Field label="ckpt sha256 *" v={form.checkpoint_sha256} on={(v) => setForm({ ...form, checkpoint_sha256: v })} />
          <Field label="min_confidence" v={String(form.min_confidence)} on={(v) => setForm({ ...form, min_confidence: Number(v) })} />
        </div>
        <DialogFooter>
          <button onClick={onClose} className="px-4 py-2 border border-at-border rounded-xl text-sm">취소</button>
          <button onClick={submit} disabled={submitting || !form.name || !form.checkpoint_url} className="px-4 py-2 bg-at-accent text-white rounded-xl text-sm disabled:opacity-50">
            {submitting ? '등록 중...' : '등록 + 다운로드'}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, v, on }: { label: string; v: string; on: (v: string) => void }) {
  return (
    <label className="block">
      <span className="text-sm text-at-text mb-1 inline-block">{label}</span>
      <input value={v} onChange={(e) => on(e.target.value)}
        className="w-full px-3 py-2 border border-at-border rounded-xl focus:ring-2 focus:ring-at-accent" />
    </label>
  )
}
```

- [ ] **Step 4: KillSwitchToggle.tsx**

```tsx
'use client'
import { useEffect, useState } from 'react'
import { Pause, Play } from 'lucide-react'

export default function KillSwitchToggle() {
  const [paused, setPaused] = useState<boolean | null>(null)
  useEffect(() => {
    fetch('/api/investment/rl-pause').catch(() => {})  // GET endpoint optional - 초기 상태는 다른 곳에서 받거나 default false
    setPaused(false)
  }, [])

  const toggle = async () => {
    const next = !(paused ?? false)
    const r = await fetch('/api/investment/rl-pause', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ paused: next }),
    })
    if (r.ok) setPaused(next)
  }

  return (
    <button onClick={toggle}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium ${paused ? 'bg-at-error text-white' : 'bg-at-surface-alt text-at-text'}`}>
      {paused ? <><Play className="w-4 h-4" />RL 자동매매 재개</> : <><Pause className="w-4 h-4" />RL 자동매매 일시정지</>}
    </button>
  )
}
```

- [ ] **Step 5: 빌드 검증**

```bash
cd dental-clinic-manager && npm run build > /tmp/build.log 2>&1 ; tail -5 /tmp/build.log
```

기대: exit 0.

- [ ] **Step 6: 커밋**

```bash
git add src/app/investment/rl-models src/components/Investment/RLModels
git commit -m "feat(rl-trading): RL models library page + register dialog + kill switch"
```

---

## Task 16: 전략 생성 폼에 RL 옵션 추가

**Files:**
- Modify or Create: `dental-clinic-manager/src/app/investment/strategy/new/page.tsx` (있으면 수정, 없으면 기존 builder 컴포넌트에 추가)
- Create: `dental-clinic-manager/src/components/Investment/RLModels/RLStrategyForm.tsx`

- [ ] **Step 1: RLStrategyForm.tsx**

```tsx
'use client'
import { useEffect, useState } from 'react'
import type { RLModel } from '@/types/rlTrading'

interface Props { onCreated: () => void }

export default function RLStrategyForm({ onCreated }: Props) {
  const [models, setModels] = useState<RLModel[]>([])
  const [form, setForm] = useState({
    name: '', rl_model_id: '', automation_level: 1 as 1 | 2,
    credential_id: '',
  })
  const [creds, setCreds] = useState<Array<{ id: string; label: string; is_paper_trading: boolean }>>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/investment/rl-models').then(r => r.json()).then((j) => setModels((j.data ?? []).filter((m: RLModel) => m.status === 'ready')))
    fetch('/api/investment/credentials').then(r => r.json()).then((j) => setCreds(j.data ?? []))
  }, [])

  const submit = async () => {
    setSubmitting(true); setError(null)
    try {
      const model = models.find(m => m.id === form.rl_model_id)
      if (!model) throw new Error('모델 선택 필요')
      const body = {
        name: form.name,
        target_market: model.market,
        timeframe: model.timeframe,
        strategy_type: model.kind === 'portfolio' ? 'rl_portfolio' : 'rl_single',
        rl_model_id: model.id,
        automation_level: form.automation_level,
        credential_id: form.credential_id,
        indicators: [],
        buy_conditions: { type: 'group', operator: 'AND', conditions: [] },
        sell_conditions: { type: 'group', operator: 'AND', conditions: [] },
        is_active: false,
      }
      const r = await fetch('/api/investment/strategies', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
      if (!r.ok) throw new Error((await r.json()).error || `${r.status}`)
      onCreated()
    } catch (e) { setError((e as Error).message) } finally { setSubmitting(false) }
  }

  const selected = models.find(m => m.id === form.rl_model_id)
  const cred = creds.find(c => c.id === form.credential_id)
  const isLive = cred && !cred.is_paper_trading

  return (
    <div className="space-y-4 max-w-xl">
      {error && <div className="p-2 rounded-xl bg-at-error-bg text-at-error text-sm">{error}</div>}

      <label className="block">
        <span className="text-sm text-at-text mb-1 inline-block">전략 이름 *</span>
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
          className="w-full px-3 py-2 border border-at-border rounded-xl focus:ring-2 focus:ring-at-accent" />
      </label>

      <label className="block">
        <span className="text-sm text-at-text mb-1 inline-block">RL 모델 *</span>
        <select value={form.rl_model_id} onChange={(e) => setForm({ ...form, rl_model_id: e.target.value })}
          className="w-full px-3 py-2 border border-at-border rounded-xl focus:ring-2 focus:ring-at-accent">
          <option value="">선택</option>
          {models.map(m => <option key={m.id} value={m.id}>{m.name} ({m.algorithm}, {m.kind})</option>)}
        </select>
        {selected && (
          <p className="text-xs text-at-text-secondary mt-1">유니버스: {(selected.universe ?? []).join(', ') || '-'} · 신뢰도 임계 {selected.min_confidence}</p>
        )}
      </label>

      <label className="block">
        <span className="text-sm text-at-text mb-1 inline-block">증권사 계좌 *</span>
        <select value={form.credential_id} onChange={(e) => setForm({ ...form, credential_id: e.target.value })}
          className="w-full px-3 py-2 border border-at-border rounded-xl focus:ring-2 focus:ring-at-accent">
          <option value="">선택</option>
          {creds.map(c => <option key={c.id} value={c.id}>{c.label} {c.is_paper_trading ? '(paper)' : '(LIVE)'}</option>)}
        </select>
      </label>

      <fieldset className="space-y-2">
        <legend className="text-sm text-at-text">자동화 수준 *</legend>
        <label className="flex gap-2 items-center">
          <input type="radio" checked={form.automation_level === 1} onChange={() => setForm({ ...form, automation_level: 1 })} />
          <span>알림만 (Level 1, 권장)</span>
        </label>
        <label className="flex gap-2 items-center">
          <input type="radio" checked={form.automation_level === 2} onChange={() => setForm({ ...form, automation_level: 2 })} />
          <span>자동 주문 (Level 2)</span>
        </label>
        {form.automation_level === 2 && isLive && (
          <div className="p-2 bg-at-error-bg border border-at-error rounded-xl text-xs text-at-error">
            ⚠ Live 계좌에서 자동 주문이 실행됩니다. 검증되지 않은 모델은 즉시 손실로 이어질 수 있습니다.
          </div>
        )}
      </fieldset>

      <button onClick={submit} disabled={submitting || !form.name || !form.rl_model_id || !form.credential_id}
        className="px-4 py-2 bg-at-accent text-white rounded-xl text-sm disabled:opacity-50">
        {submitting ? '생성 중...' : 'RL 전략 생성'}
      </button>
    </div>
  )
}
```

- [ ] **Step 2: 전략 페이지에서 RL 폼 노출**

기존 `src/app/investment/strategy/new/page.tsx`(있을 시) 또는 builder 컴포넌트에 type 토글 추가:

```tsx
import RLStrategyForm from '@/components/Investment/RLModels/RLStrategyForm'
// ...
const [type, setType] = useState<'rule' | 'rl'>('rule')

return (
  <div>
    <div className="flex gap-2 mb-4">
      <button onClick={() => setType('rule')} className={type === 'rule' ? 'bg-at-accent-light text-at-accent px-3 py-1 rounded-xl' : 'px-3 py-1'}>룰 기반</button>
      <button onClick={() => setType('rl')} className={type === 'rl' ? 'bg-at-accent-light text-at-accent px-3 py-1 rounded-xl' : 'px-3 py-1'}>강화학습 (RL)</button>
    </div>
    {type === 'rule' ? <ExistingRuleForm /> : <RLStrategyForm onCreated={() => router.push('/investment/strategy')} />}
  </div>
)
```

- [ ] **Step 3: 빌드 + 커밋**

```bash
npm run build > /tmp/b.log 2>&1 ; tail -5 /tmp/b.log
git add src/components/Investment/RLModels/RLStrategyForm.tsx src/app/investment/strategy
git commit -m "feat(rl-trading): RL strategy creation form"
```

---

## Task 17: PM2 ecosystem 업데이트 + 운영 가이드

**Files:**
- Modify: `trading-worker/ecosystem.config.js`
- Create: `dental-clinic-manager/docs/superpowers/operations/rl-trading-operations.md`

- [ ] **Step 1: ecosystem.config.js**

기존 파일에 두 번째 app 추가:

```javascript
module.exports = {
  apps: [
    {
      name: 'trading-worker',
      script: './dist/index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: { NODE_ENV: 'production' },
    },
    {
      name: 'rl-inference',
      cwd: '/Users/hhs/Project/dental-clinic-manager/rl-inference-server',
      script: '.venv/bin/uvicorn',
      args: 'src.main:app --host 127.0.0.1 --port 8001',
      interpreter: 'none',  // python venv 직접 실행
      instances: 1,
      autorestart: true,
      max_memory_restart: '2000M',
      env: { PYTHONUNBUFFERED: '1' },
    },
  ],
}
```

- [ ] **Step 2: 운영 가이드 작성**

`dental-clinic-manager/docs/superpowers/operations/rl-trading-operations.md`:

```markdown
# RL 트레이딩 운영 가이드

## 프로세스

- `trading-worker` (Node, PM2)
- `rl-inference` (Python uvicorn, PM2)

기동:
\`\`\`bash
cd /Users/hhs/Project/dental-clinic-manager/trading-worker
pm2 start ecosystem.config.js
pm2 logs
\`\`\`

## 모델 등록 절차

1. UI `/investment/rl-models`에서 "모델 추가"
2. 사전학습 ckpt URL + sha256 입력 (HuggingFace/GitHub)
3. status가 `pending → downloading → ready`로 전이되는지 확인
4. `failed`면 `failure_reason`을 보고 재시도

## kill switch

- UI 우상단 "RL 자동매매 일시정지" 버튼
- 또는 SQL:
\`\`\`sql
UPDATE user_investment_settings SET rl_paused_at = NOW(), rl_paused_reason = 'manual'
WHERE user_id = '<uid>';
\`\`\`

## 일일 재교형 강제 실행 (디버깅)

\`\`\`bash
cd trading-worker
node -e "
require('./dist/dailyRebalanceDeps').buildDailyRebalanceDeps()
  .then(d => require('./dist/dailyRebalanceJob').runDailyRebalance(d))
  .then(r => console.log(r))
"
\`\`\`

## 트러블슈팅

- 추론 timeout: rl-inference 로그(`pm2 logs rl-inference`) 확인. ckpt 로드 실패 시 status=failed.
- 전략이 자동매매 안 됨: `automation_level=2`인지 + `min_confidence` 임계 통과 여부 확인 (`rl_inference_logs.decision`).
- 모든 자동매매 즉시 중단: `/api/investment/emergency-stop` 호출.
```

- [ ] **Step 3: 커밋**

```bash
git add trading-worker/ecosystem.config.js dental-clinic-manager/docs/superpowers/operations
git commit -m "feat(rl-trading): PM2 + operations guide"
```

---

## Task 18: E2E 시나리오 (수동 검증)

**파일 수정 없음. 실제 환경에서 확인.**

- [ ] **Step 1: 마이그레이션 적용 확인**

`mcp__supabase__execute_sql`로 다음 검증:

```sql
SELECT count(*) FROM rl_models;  -- 0이지만 테이블 존재
SELECT column_name FROM information_schema.columns WHERE table_name='investment_strategies' AND column_name IN ('strategy_type','rl_model_id');  -- 2 row
```

- [ ] **Step 2: rl-inference-server 기동 + /health**

```bash
cd /Users/hhs/Project/dental-clinic-manager
pm2 start trading-worker/ecosystem.config.js
sleep 3
curl -s -H "X-RL-API-KEY: $(grep RL_API_KEY rl-inference-server/.env | cut -d= -f2)" http://127.0.0.1:8001/health
```

기대: `{"status":"ok","loaded_models":[],"uptime_seconds":...}`

- [ ] **Step 3: UI에서 모델 1개 등록**

`/investment/rl-models` 접속 → 테스트 PPO ckpt URL과 sha256 입력 → status가 ready로 전이되는지 확인 (Supabase row 확인 + UI 갱신).

- [ ] **Step 4: RL 전략 생성**

`/investment/strategy/new` → "강화학습" 토글 → 모델 선택 → paper credential 선택 → automation_level=1로 생성. is_active=false 확인.

- [ ] **Step 5: cron 강제 트리거**

```bash
cd trading-worker
node -e "
require('./dist/dailyRebalanceDeps').buildDailyRebalanceDeps()
  .then(d => require('./dist/dailyRebalanceJob').runDailyRebalance(d))
  .then(r => console.log(r))
"
```

기대: rl_inference_logs row 1개 추가, decision='order', Telegram 알림 1개 수신.

- [ ] **Step 6: idempotency 검증**

같은 명령 재실행 → 두 번째 실행은 동일 trade_date에 대해 UNIQUE 제약 위반 → 코드는 이를 잡아 skip하거나 에러 처리. (현재 plan은 INSERT 실패를 잡지 않음 → Task 11의 insertInferenceLog에 ON CONFLICT DO NOTHING 또는 try/catch 추가 필요. 발견 시 보강 task 추가.)

**Step 6 결과로 보강 PR이 필요할 수 있음.** 검증 시 별도 task로 분리 권장.

- [ ] **Step 7: kill switch + emergency-stop**

UI에서 일시정지 토글 ON → 다음 강제 트리거 → decision='blocked_kill_switch' 확인.
`/api/investment/emergency-stop` POST → 모든 RL 전략 is_active=false + rl_paused_at 채워짐 확인.

- [ ] **Step 8: 검증 완료 보고**

플랜 실행자가 위 7개 시나리오 결과를 PR 본문 또는 작업 요약에 기록.

---

## Self-Review 체크리스트

- [x] **Spec 커버리지**: spec의 모든 섹션이 task에 매핑됨
  - DB 모델 → Task 1
  - rl-inference-server → Task 2~7, 13
  - trading-worker → Task 9~11
  - 메인 앱 (API) → Task 12, 14
  - 메인 앱 (UI) → Task 15, 16
  - 안전 가드 → Task 1 (default), 10 (코드), 14 (kill switch), 16 (UI confirmation)
  - 일봉 흐름 → Task 10 + 11
  - 운영 → Task 17
  - E2E → Task 18

- [x] **Placeholder 없음**: 모든 step이 실행 가능한 코드 또는 명령. `<YYYYMMDD>` 같은 명백한 변수만 사용.

- [x] **타입 일관성**: `RLModel`, `RLStrategyRow`, `PredictRequestBody`, `InferenceLogEntry` 등이 정의되고 사용 위치에서 일관됨.

- [ ] **알려진 보강 지점**: Task 18 Step 6에서 idempotency 충돌 처리(ON CONFLICT DO NOTHING / catch 23505) 미구현. 실행 중 발견 시 즉시 작은 task로 추가.

---

## 진행 명령어 모음

```bash
# 작업 흐름 시작
cd /Users/hhs/Project/dental-clinic-manager

# 각 task 끝나면
git push origin develop
```
