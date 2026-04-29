import os
import sys
from pathlib import Path

# src 디렉터리를 PYTHONPATH에 추가
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "src"))

# 테스트용 환경변수
os.environ.setdefault("RL_API_KEY", "test-api-key")
os.environ.setdefault("MODEL_DIR", str(Path("/tmp/rl-inference-test/models")))
