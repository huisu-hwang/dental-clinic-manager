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

## Training

자체 학습으로 Dow 30 PPO ckpt를 생성하려면:

```bash
cd rl-inference-server
source .venv/bin/activate
pip install yfinance  # 학습용 의존성
python -m scripts.train_ppo_dow30 --steps 50000 --output ./trained/ppo_dow30.zip
```

학습 완료 시 sha256 + 등록 메타데이터가 stdout에 출력된다.
50k steps은 Mac mini M4 CPU에서 약 1~2시간 소요.
