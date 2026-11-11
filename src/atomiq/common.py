"""Shared paths, seeds and data loading for the three-stage pipeline."""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
DATA = ROOT / "data" / "raw" / "bank_campaign_participant_release.xlsx"
RESULTS = ROOT / "results"
FIGURES = ROOT / "figures"

SEEDS = {
    "cv_outer": 2026,          # repeated stratified K-fold, outer loop
    "cv_inner": 11,            # inner tuning folds
    "model": 0,                # LR / GBM / SVC internals
    "bootstrap": 123,          # Stage 1 bootstrap for uncertainty propagation
    "qaoa_init": 31,           # QAOA random restarts
    "qaoa_sampler": 5,         # sampling the final QAOA state
    "transpiler": 42,          # seed_transpiler for every transpile call
    "aer_stage3": 7,           # ideal finite-shot Stage 3
    "aer_noisy": 8,            # noisy Stage 3 / Stage 2 simulation
    "monte_carlo": 99,         # classical Monte Carlo benchmark
}

N_CANDIDATES = 10
K_SELECT = 6
BUDGET = 25
CAPACITY = 22
SUCCESS_THRESHOLD = 3


def load_sheets() -> dict[str, pd.DataFrame]:
    if not DATA.exists():
        raise FileNotFoundError(
            f"Dataset not found at {DATA}. Download bank_campaign_participant_release.xlsx "
            "from the organisers' Drive folder (see README) into data/raw/."
        )
    sheets = pd.read_excel(DATA, sheet_name=None)
    for name in ("Stage1_Train", "Stage1_Test", "Stage2_Data", "Stage2_Constraints"):
        if name not in sheets:
            raise ValueError(f"Sheet {name} missing from {DATA}")
    return sheets


def load_stage1() -> tuple[pd.DataFrame, pd.DataFrame]:
    s = load_sheets()
    train, test = s["Stage1_Train"].copy(), s["Stage1_Test"].copy()
    for df in (train, test):
        df["customer_id"] = df["customer_id"].astype(str)
    train["y"] = (train["y"].astype(str).str.strip().str.lower() == "yes").astype(int)
    assert train["customer_id"].is_unique and test["customer_id"].is_unique
    assert not set(train.customer_id) & set(test.customer_id), "train/test overlap"
    return train, test


def load_stage2_data() -> pd.DataFrame:
    d = load_sheets()["Stage2_Data"].copy()
    d["customer_id"] = d["customer_id"].astype(str)
    return d


def rank_with_tiebreak(ids: pd.Series, probs: np.ndarray) -> pd.DataFrame:
    """Rank highest probability first; ties broken by customer_id ascending."""
    df = pd.DataFrame({"customer_id": ids.astype(str).values, "predicted_probability": probs})
    df = df.sort_values(["predicted_probability", "customer_id"], ascending=[False, True], kind="mergesort")
    df["rank"] = np.arange(1, len(df) + 1)
    df["is_top_10"] = (df["rank"] <= N_CANDIDATES).astype(int)
    return df.reset_index(drop=True)


def dump_json(obj, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)

    def default(o):
        if isinstance(o, (np.integer,)):
            return int(o)
        if isinstance(o, (np.floating,)):
            return float(o)
        if isinstance(o, np.ndarray):
            return o.tolist()
        raise TypeError(type(o))

    path.write_text(json.dumps(obj, indent=2, default=default))
