"""Build the static judges' page in docs/ from the committed result files (no server, no login).

Run after `make all`:   PYTHONPATH=src python scripts/build_site.py
Writes docs/data.js and copies figures to docs/figures/. GitHub Pages serves docs/.
"""
from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
DOCS = ROOT / "docs"


def main():
    from atomiq.common import K_SELECT
    from atomiq.qaoa_fast import FastQAOA
    from atomiq.stage2 import build_qubo, diag_cost, load_candidates, presolve

    s1 = json.loads((ROOT / "results" / "stage1_summary.json").read_text())
    s2 = json.loads((ROOT / "stage2_selection.json").read_text())
    s3 = json.loads((ROOT / "stage3_simulation.json").read_text())
    st = json.loads((ROOT / "results" / "stage2_stress.json").read_text())
    cv = pd.read_csv(ROOT / "results" / "stage1_cv_summary.csv", header=[0, 1], index_col=0)
    pred = pd.read_csv(ROOT / "stage1_predictions.csv", dtype={"customer_id": str})

    c = load_candidates()
    cands = [{"id": r.customer_id, "rank": int(r["rank"]), "p": float(r.predicted_probability),
              "deposit": int(r.expected_deposit_value), "cost": int(r.contact_cost), "cap": int(r.capacity_units),
              "v": float(r.expected_net_value), "qubit": int(r.qubit)} for _, r in c.iterrows()]

    # Exact output distribution of the shipped QAOA circuit (statevector), top 16 outcomes decoded to IDs
    q = build_qubo(c, presolve(c), cardinality_penalty=False)
    sim = FastQAOA(diag_cost(q), q["n_dec"], K_SELECT, q["n_slack"])
    best_p = s2["qaoa"]["best_p"]
    probs = sim.probs(np.array(s2["depth_sweep"][best_p]["params"]))
    order = np.argsort(-probs)[:16]
    outcomes = []
    for i in order:
        bits = [(int(i) >> k) & 1 for k in range(10)]
        ids = [cands[k]["id"] for k in range(10) if bits[k]]
        outcomes.append({"key": format(int(i), "010b"), "p": float(probs[i]), "ids": ids,
                         "objective": float(sum(cands[k]["v"] for k in range(10) if bits[k]))})

    models = ["prior", "LR", "GBM", "QK", "PQK", "Hybrid"]
    labels = {"prior": "Constant prior", "LR": "Logistic regression", "GBM": "Gradient boosting",
              "QK": "Quantum fidelity kernel", "PQK": "Projected quantum kernel", "Hybrid": "Hybrid (shipped)"}
    cv_rows = [{"model": labels[m], **{k: float(cv.loc[m, (k, "mean")]) for k in
               ("roc_auc", "pr_auc", "brier", "log_loss", "precision_at_k", "recall_at_k")}} for m in models]

    nz = s2["noisy_simulation"][str(best_p)]
    sha = subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True, cwd=ROOT).stdout.strip()
    data = {
        "commit": sha,
        "selected": s2["selected_ids"],
        "bitstring": s2["selected_bitstring_qiskit_order"], "best_count": s2["best_sampled"]["count"],
        "objective": s2["objective_value"], "optimum": s2["brute_force_optimal_objective"], "gap": s2["optimality_gap"],
        "budget": [s2["total_budget_used"], s2["budget_limit"]], "capacity": [s2["total_capacity_used"], s2["capacity_limit"]],
        "candidates": cands,
        "qaoa": {"p": best_p, "p_opt": s2["depth_sweep"][best_p]["p_optimal"],
                 "uniform": s2["random_feasible_baseline_p_optimal"], "outcomes": outcomes,
                 "sweep": [{"p": d["p"], "p_opt": d["p_optimal"], "p_feas": d["p_feasible"]} for d in s2["depth_sweep"]],
                 "penalty": [{"p": d["p"], "p_opt": d["p_optimal"], "p_feas": d["p_feasible"]} for d in s2["penalty_baseline"]],
                 "noisy": {"p_opt_raw": nz["raw"]["p_optimal"], "p_opt_post": nz["postselected_weight6"]["p_optimal_given_weight6"],
                           "keep_w6": nz["raw"]["p_hamming_weight_6"], "depth": nz["transpile"]["transpited_depth"]
                           if "transpited_depth" in nz["transpile"] else nz["transpile"]["transpiled_depth"],
                           "cz": nz["transpile"]["transpiled_2q_gates"], "swaps": nz["transpile"]["swap_count"]}},
        "stage3": {"ids": s3["selected_ids"], "p": [s3["input_probabilities"][i] for i in s3["selected_ids"]],
                   "quantum": s3["quantum_estimate_p_ge3"], "se": s3["quantum_estimate_std_error"],
                   "exact": s3["exact_p_ge3"], "mc": s3["monte_carlo_p_ge3"],
                   "rows": [{"method": r["method"], "backend": r["backend"], "shots": r["shots"], "p": r["p_ge3"],
                             "err": r["abs_error_vs_exact"]} for r in s3["results"]],
                   "budget": {k: s3["error_budget"][k] for k in ("stage1_model_uncertainty_sd_bootstrap",
                              "stage1_model_uncertainty_sd_delta_method", "shot_noise_sd_ideal_200k",
                              "hardware_noise_bias_fakekingston", "residual_after_readout_mitigation",
                              "bootstrap_p_ge3_ci95")},
                   "stability": s3["error_budget"]["selection_stability"],
                   "lr": s3["error_budget"]["lr_only_counterfactual"]},
        "stage1": {"cv": cv_rows, "shipped": s1["shipped_model"], "w": s1["final_hyperparameters"].get("w", 0),
                   "positives": s1["positives_train"], "n_train": s1["n_train"]},
        "stress": [{"name": sc["name"], "feasible": sc["n_feasible"],
                    "xy": [r for r in sc["runs"] if r["ansatz"].startswith("Dicke")],
                    "pen": [r for r in sc["runs"] if r["ansatz"].startswith("penalty")]} for sc in st["scenarios"]],
        "top20": pred.head(20)[["customer_id", "predicted_probability", "rank"]].to_dict("records"),
    }
    for sc in data["stress"]:
        for r in sc["xy"] + sc["pen"]:
            r.pop("params", None)
    DOCS.mkdir(exist_ok=True)
    (DOCS / "data.js").write_text("window.ATOMIQ = " + json.dumps(data, indent=1) + ";\n")
    figs = DOCS / "figures"
    figs.mkdir(exist_ok=True)
    for f in (ROOT / "figures").glob("*.png"):
        shutil.copy(f, figs / f.name)
    shutil.copy(ROOT / "presentation" / "deck.pdf", DOCS / "deck.pdf")
    (DOCS / ".nojekyll").write_text("")
    print("wrote docs/data.js and figures for commit", sha)


if __name__ == "__main__":
    main()
