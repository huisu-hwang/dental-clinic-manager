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
        with torch.no_grad():
            obs_tensor = torch.as_tensor(obs, dtype=torch.float32).unsqueeze(0)
            policy = getattr(self._model, "policy", None)
            if policy is None:
                return np.asarray(action), np.array([1.0])
            try:
                dist = policy.get_distribution(obs_tensor)
                logits = self._extract_distribution(dist)
            except Exception:
                logits = np.array([1.0])
        return np.asarray(action), logits

    def _extract_distribution(self, dist) -> np.ndarray:
        # discrete (Categorical)
        inner = getattr(dist, "distribution", None)
        if inner is not None and hasattr(inner, "logits"):
            return inner.logits.detach().cpu().numpy().squeeze()
        # continuous (Normal): mean + std
        if inner is not None and hasattr(inner, "mean") and hasattr(inner, "stddev"):
            mean = inner.mean.detach().cpu().numpy().squeeze()
            std = inner.stddev.detach().cpu().numpy().squeeze()
            return np.concatenate([np.atleast_1d(mean), np.atleast_1d(std)])
        return np.array([1.0])

    def compute_confidence(self, logits_or_q: np.ndarray) -> float:
        """
        - discrete: softmax(logits).max()
        - continuous (mean,std concatenated): 1 - mean(std) / std_max
        """
        arr = np.asarray(logits_or_q, dtype=np.float32).ravel()
        if arr.size == 0:
            return 0.0
        # continuous heuristic: even-sized array → assume (mean, std) halves
        if arr.size >= 2 and arr.size % 2 == 0:
            half = arr.size // 2
            mean = arr[:half]
            std = arr[half:]
            std_max = max(float(std.max()), 1e-6)
            conf = 1.0 - float(std.mean()) / std_max
            return float(np.clip(conf, 0.0, 1.0))
        # discrete: softmax max
        e = np.exp(arr - arr.max())
        probs = e / e.sum()
        return float(np.clip(probs.max(), 0.0, 1.0))
