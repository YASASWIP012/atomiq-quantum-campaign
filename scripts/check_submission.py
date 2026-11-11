"""Validate the submission: root files present, schemas right, IDs traceable, constraints met,
Stage 3 consistent with Stage 1 probabilities. Exits non-zero on any failure."""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from atomiq.common import BUDGET, CAPACITY, load_stage1, load_stage2_data  # noqa: E402
from atomiq.stage3 import p_at_least  # noqa: E402

fails = []


def check(cond, msg):
    print(("PASS " if cond else "FAIL ") + msg)
    if not cond:
        fails.append(msg)


for f in ["stage1_predictions.csv", "stage2_selection.csv", "stage2_selection.json", "stage3_simulation.csv",
          "stage3_simulation.json", "README.md", "LICENSE", "requirements.txt", "PREREGISTRATION.md"]:
    check((ROOT / f).exists(), f"{f} at repo root")

_, test = load_stage1()
s1 = pd.read_csv(ROOT / "stage1_predictions.csv", dtype={"customer_id": str})
check(list(s1.columns) == ["customer_id", "predicted_probability", "rank", "is_top_10"], "stage1 columns")
check(set(s1.customer_id) == set(test.customer_id) and len(s1) == 100, "stage1 has exactly the 100 test customers")
check(s1.predicted_probability.between(0, 1).all(), "stage1 probabilities in [0,1]")
srt = s1.sort_values(["predicted_probability", "customer_id"], ascending=[False, True], kind="mergesort")
check((srt["rank"].values == np.arange(1, 101)).all(), "stage1 rank follows probability with customer_id tie-break")
check(s1.is_top_10.sum() == 10 and set(s1[s1.is_top_10 == 1]["rank"]) == set(range(1, 11)), "stage1 top-10 flag")

s2 = json.loads((ROOT / "stage2_selection.json").read_text())
top10 = s1[s1.is_top_10 == 1].sort_values("rank").customer_id.tolist()
check(s2["candidate_ids_top10"] == top10, "stage2 candidates == stage1 top 10 (same order)")
sel = s2["selected_ids"]
check(len(sel) == 6 and len(set(sel)) == 6 and set(sel) <= set(top10), "stage2 selects 6 unique IDs from the top 10")
d = load_stage2_data().set_index("customer_id")
check(int(d.loc[sel, "contact_cost"].sum()) <= BUDGET, f"budget {int(d.loc[sel, 'contact_cost'].sum())} <= {BUDGET}")
check(int(d.loc[sel, "capacity_units"].sum()) <= CAPACITY, f"capacity {int(d.loc[sel, 'capacity_units'].sum())} <= {CAPACITY}")
p = s1.set_index("customer_id").predicted_probability
obj = float((p[sel] * d.loc[sel, "expected_deposit_value"] - d.loc[sel, "contact_cost"]).sum())
check(abs(obj - s2["objective_value"]) < 1e-9, "stage2 objective recomputes from stage1 probabilities")
check(s2["optimality_gap"] >= -1e-12, f"optimality gap = {s2['optimality_gap']:.3g}")
bits = s2["selected_bitstring_qiskit_order"][::-1]  # Qiskit little-endian: rightmost char is qubit 0
decoded = [s2["qubit_to_customer"][str(q)] for q, ch in enumerate(bits) if ch == "1"]
check(sorted(decoded) == sorted(sel), "stage2 bitstring decodes to the selected IDs")

s3 = json.loads((ROOT / "stage3_simulation.json").read_text())
check(set(s3["selected_ids"]) == set(sel), "stage3 uses the stage2 selection")
pin = np.array([s3["input_probabilities"][c] for c in s3["selected_ids"]])
check(np.allclose(pin, p[s3["selected_ids"]].values), "stage3 input probabilities == stage1 probabilities")
check(abs(p_at_least(pin) - s3["exact_p_ge3"]) < 1e-12, "stage3 exact value recomputes")
check(abs(s3["quantum_estimate_p_ge3"] - s3["exact_p_ge3"]) < 4 * s3["quantum_estimate_std_error"] + 1e-9,
      "stage3 quantum estimate within 4 SE of exact")
s3c = pd.read_csv(ROOT / "stage3_simulation.csv")
check({"method", "p_ge3", "exact_p_ge3", "abs_error_vs_exact", "qubit_order"} <= set(s3c.columns), "stage3 csv columns")

print("\nAll checks passed." if not fails else f"\n{len(fails)} check(s) failed.")
sys.exit(1 if fails else 0)
