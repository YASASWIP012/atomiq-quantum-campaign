"""Build presentation/deck.pdf (16:9) directly from the result files, so the slides never drift
from the numbers in the repo. Run after `make all`:  python scripts/make_deck.py"""
from __future__ import annotations

import json
import textwrap
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.image as mpimg
import matplotlib.pyplot as plt
import pandas as pd
from matplotlib.backends.backend_pdf import PdfPages

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "presentation" / "deck.pdf"
INK, MUTED, ACCENT = "#1b1f24", "#5b6470", "#3b5bdb"


def load():
    s1 = json.loads((ROOT / "results" / "stage1_summary.json").read_text())
    cv = pd.read_csv(ROOT / "results" / "stage1_cv_summary.csv", header=[0, 1], index_col=0)
    s2 = json.loads((ROOT / "stage2_selection.json").read_text())
    s3 = json.loads((ROOT / "stage3_simulation.json").read_text())
    return s1, cv, s2, s3


def slide(pdf, title, body=None, image=None, foot=None, image_box=(0.5, 0.08, 0.47, 0.74)):
    fig = plt.figure(figsize=(13.33, 7.5))
    fig.patch.set_facecolor("white")
    fig.text(0.05, 0.9, title, fontsize=26, weight="bold", color=INK, va="top")
    if body:
        y = 0.78
        width = 52 if image else 110
        for para in body:
            lines = textwrap.wrap(para, width) or [""]
            for i, line in enumerate(lines):
                fig.text(0.05, y, ("• " if i == 0 else "  ") + line, fontsize=15, color=INK, va="top")
                y -= 0.052
            y -= 0.02
    if image:
        ax = fig.add_axes(image_box)
        ax.imshow(mpimg.imread(ROOT / image))
        ax.axis("off")
    if foot:
        fig.text(0.05, 0.04, foot, fontsize=10, color=MUTED)
    pdf.savefig(fig)
    plt.close(fig)


def main():
    s1, cv, s2, s3 = load()
    OUT.parent.mkdir(exist_ok=True)
    m = lambda model, metric: cv.loc[model, (metric, "mean")]
    hw = s3.get("hardware")
    hw_row = next((r for r in s3["results"] if r["method"] == "ibm_hardware_unmitigated"), None)
    with PdfPages(OUT) as pdf:
        slide(pdf, "Six customers, one campaign: a hybrid quantum-classical pipeline", [
            f"Answer: contact {', '.join(s2['selected_ids'])}.",
            f"P(at least 3 of 6 subscribe) = {s3['quantum_estimate_p_ge3']:.4f} from the quantum circuit "
            f"(exact {s3['exact_p_ge3']:.4f}, Stage-1 bootstrap 95% band "
            f"{s3['error_budget']['bootstrap_p_ge3_ci95'][0]:.3f} to {s3['error_budget']['bootstrap_p_ge3_ci95'][1]:.3f}).",
            f"Stage 2 optimality gap {s2['optimality_gap']:.1%}; selection checked against all {s2['n_cardinality_subsets']} subsets.",
            "Every number on these slides is read from the result files in the repository.",
        ], foot="The Atomiq Hackathon, Qiskit Fall Fest 2026 at IEM")
        slide(pdf, "Pipeline: what is quantum and what is classical", [
            "Stage 1 (hybrid): ZZ feature-map kernels (fidelity and projected) on 6 qubits, blended with logistic regression. "
            "Classical: preprocessing, PCA, SVM training, Platt calibration, the blend weight.",
            "Stage 2 (quantum optimiser, classically verified): QAOA with a Dicke-state start and an XY ring mixer, so "
            "'exactly 6' holds by construction. Classical: COBYLA, presolve, brute-force check.",
            "Stage 3 (quantum sampler, classically verified): one RY-rotated qubit per customer; count outcomes with "
            ">= 3 ones. Classical: exact Poisson-binomial and Monte Carlo references.",
            "Stage 1 probabilities flow unchanged into Stages 2 and 3; scripts/check_submission.py verifies this.",
        ])
        slide(pdf, "Stage 1: an honest quantum classifier", [
            f"Nested CV (10 x 5 folds, train only). ROC-AUC: LR {m('LR','roc_auc'):.3f}, quantum fidelity kernel "
            f"{m('QK','roc_auc'):.3f}, projected kernel {m('PQK','roc_auc'):.3f}, hybrid {m('Hybrid','roc_auc'):.3f}.",
            f"Brier: LR {m('LR','brier'):.4f}, hybrid {m('Hybrid','brier'):.4f}, constant prior {m('prior','brier'):.4f}.",
            f"Pre-registered rule shipped: {s1['shipped_model']} (blend weight on the quantum model "
            f"w = {s1['final_hyperparameters'].get('w', 0):.1f}). The quantum kernels alone do not beat LR here.",
            "Why plain fidelity kernels fail: kernel values concentrate as bandwidth grows (right). We tune bandwidth inside CV.",
        ], image="figures/stage1_kernel_concentration.png")
        f = s2["formulation"]
        slide(pdf, "Stage 2: constraint-native QAOA", [
            "max sum_i (p_i D_i - c_i) x_i subject to sum x_i = 6, cost <= 25, capacity <= 22.",
            f"Cardinality: Dicke(10,6) start + XY ring mixer, no penalty. Budget: {f['budget']}. Capacity: {f['capacity']}.",
            f"Feasible subsets: {s2['n_feasible_subsets']} of {s2['n_cardinality_subsets']}. "
            f"Uniform guess finds the optimum with p = {s2['random_feasible_baseline_p_optimal']:.4f}.",
            f"QAOA p={s2['qaoa']['best_p']}: P(optimum) = {s2['depth_sweep'][s2['qaoa']['best_p']]['p_optimal']:.3f}, "
            f"P(feasible) = {s2['depth_sweep'][s2['qaoa']['best_p']]['p_feasible']:.3f}.",
        ], image="figures/stage2_qaoa_depth.png")
        nz = s2["noisy_simulation"]
        k1 = sorted(nz, key=int)[0]
        t = nz[k1]["transpile"]
        hw2 = s2.get("ibm_hardware")
        slide(pdf, "Noise, transpilation and hardware", [
            f"Stage 2 p={k1} on {t['backend']}: depth {t['transpiled_depth']}, {t['transpiled_2q_gates']} two-qubit gates, "
            f"{t['swap_count']} SWAPs. Noisy P(feasible) {nz[k1]['raw']['p_feasible']:.3f}; "
            f"after weight-6 post-selection {nz[k1]['postselected_weight6']['p_feasible_given_weight6']:.3f}.",
            f"Stage 3 transpiles to depth {s3['transpilation']['transpiled_depth']} with no two-qubit gates, so readout "
            "error dominates; per-qubit readout inversion removes most of the bias.",
            (f"Real QPU: {hw['backend']}, job {hw['job_id']}, P(>=3) = {hw_row['p_ge3']:.4f}." if hw and hw_row else
             "Real-QPU run: scripts/run_hardware.py (one job, about 16k shots) is ready but was not run for this submission."),
            (f"Stage 2 on {hw2['backend']}: raw P(feasible) {hw2['raw']['p_feasible']:.3f}." if hw2 else ""),
        ], image="figures/stage3_estimates.png")
        eb = s3["error_budget"]
        slide(pdf, "Error propagation across stages", [
            f"Stage-1 model uncertainty dominates: bootstrap SD of P(>=3) = {eb['stage1_model_uncertainty_sd_bootstrap']:.4f} "
            f"(delta method {eb['stage1_model_uncertainty_sd_delta_method']:.4f}), against shot noise "
            f"{eb['shot_noise_sd_ideal_200k']:.4f} at 200k shots.",
            f"Selection stability: the same 6 customers are chosen in {eb['selection_stability']['p_same_selection']:.0%} "
            f"of Stage-1 bootstrap refits; on average {eb['selection_stability']['mean_overlap_with_our_6']:.1f} of 6 overlap.",
            "So the limit on the answer is 35 positive training examples, not the quantum hardware.",
        ], image="figures/stage3_error_budget.png")
        slide(pdf, "Business reading", [
            f"Expected net value of the chosen six: {s2['objective_value']:.2f} (deposit units), using "
            f"{s2['total_budget_used']}/{s2['budget_limit']} budget and {s2['total_capacity_used']}/{s2['capacity_limit']} capacity.",
            f"Hitting 3 conversions from 6 calls is unlikely (about {s3['exact_p_ge3']:.0%}). Plan for 1 to 2 conversions, "
            "or widen the call list if 3 is a hard target.",
            "The model is weakly informative with 35 positives; collect outcome data from this campaign before "
            "trusting finer rankings.",
            "Quantum methods here are correct and verifiable, and they match classical answers; we claim no speed-up.",
        ])
    print("wrote", OUT)


if __name__ == "__main__":
    main()
