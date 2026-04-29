from __future__ import annotations
from abc import ABC, abstractmethod
import numpy as np


class AdapterBase(ABC):
    """RL inference adapter common interface.

    Each adapter provides raw observation → (action, logits/q_values) and
    a confidence calculation in [0, 1].
    """

    @classmethod
    @abstractmethod
    def load(cls, checkpoint_path: str, algorithm: str) -> "AdapterBase":
        ...

    @abstractmethod
    def predict_with_logits(self, obs: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
        """Return (action, logits_or_qvalues). logits used for confidence."""

    @abstractmethod
    def compute_confidence(self, logits_or_q: np.ndarray) -> float:
        """Adapter-specific confidence in [0, 1]. Do NOT return constant 1.0."""
