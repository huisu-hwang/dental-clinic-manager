# rl-inference-server

RL 모델 추론 서버. 별도 Python 프로세스로 동작 (PM2 관리).

## 빠른 시작

```bash
python3.11 -m venv .venv
source .venv/bin/activate
pip install -e ".[dev]"
cp .env.example .env
# .env에 RL_API_KEY를 충분히 길게 설정

uvicorn src.main:app --host 127.0.0.1 --port 8001 --reload
```

## 테스트

```bash
pytest -v
```
