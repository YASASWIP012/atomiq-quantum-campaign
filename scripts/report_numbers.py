"""Print every number the README quotes, read from the committed result files (for keeping prose in sync)."""
import collections
import itertools
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from atomiq.stage3 import p_at_least  # noqa: E402

s1 = json.loads((ROOT / "results/stage1_summary.json").read_text())
s2 = json.loads((ROOT / "stage2_selection.json").read_text())
s3 = json.loads((ROOT / "stage3_simulation.json").read_text())
st = json.loads((ROOT / "results/stage2_stress.json").read_text())
cv = pd.read_csv(ROOT / "results/stage1_cv_summary.csv", header=[0, 1], index_col=0)
c = pd.read_csv(ROOT / "stage2_selection.csv")
pred = pd.read_csv(ROOT / "stage1_predictions.csv")

print("== stage1")
print(cv.xs("mean", axis=1, level=1).drop(columns="fold").round(4).to_string())
d = s1["decision"]
for k in ("hybrid_minus_lr_log_loss", "hybrid_minus_lr_pr_auc"):
    print(k, {a: round(b, 4) for a, b in d[k].items()})
print("shipped", d["shipped_model"], s1["final_hyperparameters"])
ch = s1["cv_choices_per_fold"]
print("fold kernels", collections.Counter(tuple(x["hybrid_q_cfg"])[0] for x in ch))
print("fold w", sorted(collections.Counter(round(x["w"], 1) for x in ch).items()))
k = s1["kernel_concentration"]
v, b = np.array(k["offdiag_variance"]), np.array(k["bandwidth"])
print("concentration peak bw", round(b[v.argmax()], 3), "ratio to bw1", round(v.max() / np.interp(1, b, v)))
print("top25 range", round(pred.predicted_probability[:25].min(), 3), round(pred.predicted_probability[:25].max(), 3))
for n in (6, 10, 15, 17, 18, 19, 20, 24):
    print("P(>=3) calling top", n, round(p_at_least(pred.predicted_probability.values[:n]), 3))

print("== stage2")
print("selected", s2["selected_ids"], "bits", s2["selected_bitstring_qiskit_order"], "count", s2["best_sampled"]["count"])
print("objective", round(s2["objective_value"], 4), "budget", s2["total_budget_used"], "cap", s2["total_capacity_used"])
print("deposits", round(float((c.predicted_probability * c.expected_deposit_value)[c.selected == 1].sum()), 2))
print("negative-v candidates", int((c.expected_net_value < 0).sum()))
vals = sorted((c.expected_net_value.values[list(cb)].sum() for cb in itertools.combinations(range(10), 6)), reverse=True)
print("runner-up", round(vals[1], 4), "pct below", round(100 * (vals[0] - vals[1]) / vals[0], 2))
print("presolve", {a: b for a, b in s2["presolve"].items() if "any" in a})
print(c.round(3).to_string(index=False))
for x in s2["depth_sweep"]:
    print("sweep p", x["p"], round(x["p_feasible"], 3), round(x["p_optimal"], 4), round(x["approx_ratio"], 3))
for x in s2["penalty_baseline"]:
    print("penalty p", x["p"], round(x["p_feasible"], 3), round(x["p_optimal"], 4), round(x["approx_ratio"], 3))
print("best p", s2["qaoa"]["best_p"], "ratio vs uniform", round(s2["depth_sweep"][s2["qaoa"]["best_p"]]["p_optimal"] / s2["random_feasible_baseline_p_optimal"], 1))
for p, x in s2["noisy_simulation"].items():
    t = x["transpile"]
    print("noisy p", p, "depth", t["original_depth"], "->", t["transpiled_depth"], "1q", t["transpiled_1q_gates"], "2q", t["transpiled_2q_gates"],
          "swaps", t["swap_count"], "keep6", round(x["raw"]["p_hamming_weight_6"], 3), "popt raw", round(x["raw"]["p_optimal"], 4),
          "post", round(x["postselected_weight6"]["p_optimal_given_weight6"], 4), "finds", x["finds_optimum"])

print("== stage3")
print("ids", s3["selected_ids"], {a: round(b, 4) for a, b in s3["input_probabilities"].items()})
for r in s3["results"]:
    print(f"  {r['method']:<32} {r['p_ge3']:.6f}  err {r['abs_error_vs_exact']:.2g}  se {r.get('std_error')}")
print("dist", [round(x, 3) for x in s3["success_count_distribution_exact"]])
print("z of reported", round(abs(s3["quantum_estimate_p_ge3"] - s3["exact_p_ge3"]) / s3["quantum_estimate_std_error"], 2))
eb = s3["error_budget"]
print({a: (round(b, 5) if isinstance(b, float) else b) for a, b in eb.items() if a not in ("gradient_dP_dp", "selection_stability", "lr_only_counterfactual")})
print("grad", {a: round(b, 3) for a, b in eb["gradient_dP_dp"].items()})
print("ratio boot/shot", round(eb["stage1_model_uncertainty_sd_bootstrap"] / eb["shot_noise_sd_ideal_200k"]))
print("stability", eb["selection_stability"])
print("lr", eb["lr_only_counterfactual"])

print("== stress")
for sc in st["scenarios"]:
    print(sc["name"], "feasible", sc["n_feasible"], "uniform", round(sc["uniform_feasible_p_optimal"], 4), sc["transpile_p1_fakekingston"])
    for r in sc["runs"]:
        print("   ", r["ansatz"][:5], r["p"], r["qubits"], r["slack_qubits"], r["zz_terms"], round(r["p_feasible"], 3), round(r["p_optimal"], 4), r["found_optimum_in_shots"])
    print("    lambda p_feas", [round(x["p_feasible"], 2) for x in sc["lambda_sensitivity_p2"]])
