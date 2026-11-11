"""Stage 3: P(at least 3 of the 6 selected customers subscribe), from a 6-qubit product state.

Run: python -m atomiq.stage3   (needs stage1_predictions.csv and stage2_selection.json)
Optional: results/hardware_stage3.json from scripts/run_hardware.py (real IBM QPU counts).
Writes stage3_simulation.csv/.json (repo root), figures/stage3_*.png
"""
from __future__ import annotations

import json
import time

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from qiskit import QuantumCircuit, transpile
from qiskit.quantum_info import Statevector
from qiskit_aer import AerSimulator
from qiskit_ibm_runtime.fake_provider import FakeKingston

from .common import FIGURES, RESULTS, ROOT, SEEDS, SUCCESS_THRESHOLD, dump_json, load_stage1
from .qaoa import bitstring_to_bits

SHOTS_IDEAL = 200_000
SHOTS_NOISY = 20_000
MC_DRAWS = 1_000_000


def poisson_binomial(p: np.ndarray) -> np.ndarray:
    """Exact distribution of the number of successes for independent Bernoulli(p_i)."""
    dist = np.array([1.0])
    for pi in p:
        dist = np.convolve(dist, [1 - pi, pi])
    return dist


def p_at_least(p: np.ndarray, k: int = SUCCESS_THRESHOLD) -> float:
    return float(poisson_binomial(p)[k:].sum())


def gradient(p: np.ndarray, k: int = SUCCESS_THRESHOLD) -> np.ndarray:
    """dP(S>=k)/dp_i = P(S_{-i} = k-1)."""
    return np.array([poisson_binomial(np.delete(p, i))[k - 1] for i in range(len(p))])


def encoding_circuit(p: np.ndarray, measure: bool = True) -> QuantumCircuit:
    qc = QuantumCircuit(len(p), name="campaign")
    for q, pi in enumerate(p):
        qc.ry(2 * np.arcsin(np.sqrt(pi)), q)  # P(|1>) = sin^2(theta/2) = p_i
    if measure:
        qc.measure_all()
    return qc


def p_from_counts(counts: dict, k: int = SUCCESS_THRESHOLD) -> float:
    tot = sum(counts.values())
    return sum(c for key, c in counts.items() if bitstring_to_bits(key.replace(" ", "")).sum() >= k) / tot


def readout_calibration(sim, layout, shots, seed):
    """Per-qubit assignment matrices from |0...0> and |1...1> preparations on the same physical qubits."""
    n = len(layout)
    mats = []
    circs = []
    for flip in (0, 1):
        qc = QuantumCircuit(n)
        if flip:
            qc.x(range(n))
        qc.measure_all()
        circs.append(transpile(qc, sim, initial_layout=layout, optimization_level=0, seed_transpiler=SEEDS["transpiler"]))
    res = [sim.run(c, shots=shots, seed_simulator=seed + i).result().get_counts() for i, c in enumerate(circs)]
    for q in range(n):
        p1_given0 = sum(v for kk, v in res[0].items() if bitstring_to_bits(kk)[q] == 1) / shots
        p0_given1 = sum(v for kk, v in res[1].items() if bitstring_to_bits(kk)[q] == 0) / shots
        mats.append(np.array([[1 - p1_given0, p0_given1], [p1_given0, 1 - p0_given1]]))
    return mats


def tensored_mitigate(counts: dict, mats: list[np.ndarray]) -> np.ndarray:
    """Invert the tensor product of per-qubit assignment matrices; returns quasi-probabilities."""
    n = len(mats)
    vec = np.zeros(2**n)
    tot = sum(counts.values())
    for key, c in counts.items():
        vec[int(key.replace(" ", ""), 2)] += c / tot
    t = vec.reshape([2] * n)  # axis 0 = most significant = qubit n-1
    for q in range(n):
        inv = np.linalg.inv(mats[q])
        axis = n - 1 - q
        t = np.moveaxis(np.tensordot(inv, t, axes=([1], [axis])), 0, axis)
    return t.reshape(-1)


def p_from_quasi(quasi: np.ndarray, n: int, k: int = SUCCESS_THRESHOLD) -> float:
    w = np.array([bin(i).count("1") for i in range(2**n)])
    return float(quasi[w >= k].sum())


def transpile_report(qc, backend):
    t = transpile(qc, backend, optimization_level=3, seed_transpiler=SEEDS["transpiler"])
    ops = t.count_ops()
    two = sum(v for g, v in ops.items() if g in ("cz", "cx", "ecr"))
    one = sum(v for g, v in ops.items() if g not in ("cz", "cx", "ecr", "measure", "barrier", "delay"))
    layout = t.layout.final_index_layout()
    return t, {"backend": backend.name, "logical_qubits": qc.num_qubits, "physical_qubits": layout,
               "original_depth": qc.depth(), "transpiled_depth": t.depth(), "transpiled_1q_gates": int(one),
               "transpiled_2q_gates": int(two), "swap_count": 0, "basis_ops": {k: int(v) for k, v in ops.items()},
               "optimization_level": 3, "seed_transpiler": SEEDS["transpiler"]}


def selection_stability(boot: np.ndarray, test_ids: list, chosen: set) -> dict:
    """Re-run ranking + brute-force selection on every bootstrap replicate of Stage 1."""
    import itertools

    from .common import BUDGET, CAPACITY, load_stage2_data

    d = load_stage2_data().set_index("customer_id")
    same_top10, same_sel, n_overlap = 0, 0, []
    s1 = pd.read_csv(ROOT / "stage1_predictions.csv", dtype={"customer_id": str})
    top10 = set(s1[s1.is_top_10 == 1].customer_id)
    ids = np.array(test_ids)
    for b in boot:
        order = sorted(range(len(ids)), key=lambda i: (-b[i], ids[i]))[:10]
        t10 = ids[order]
        same_top10 += set(t10) == top10
        cost, cap, dep = (d.loc[t10, c].values for c in ("contact_cost", "capacity_units", "expected_deposit_value"))
        v = b[order] * dep - cost
        best, bx = -np.inf, None
        for combo in itertools.combinations(range(10), 6):
            x = np.zeros(10, int)
            x[list(combo)] = 1
            if cost @ x <= BUDGET and cap @ x <= CAPACITY and v @ x > best:
                best, bx = v @ x, x
        sel = set(t10[bx == 1])
        same_sel += sel == chosen
        n_overlap.append(len(sel & chosen))
    n = len(boot)
    return {"p_same_top10": same_top10 / n, "p_same_selection": same_sel / n,
            "mean_overlap_with_our_6": float(np.mean(n_overlap)),
            "overlap_histogram": {int(k): int(v) for k, v in zip(*np.unique(n_overlap, return_counts=True))}}


def main():
    t0 = time.time()
    s1 = pd.read_csv(ROOT / "stage1_predictions.csv", dtype={"customer_id": str})
    s2 = json.loads((ROOT / "stage2_selection.json").read_text())
    sel = s1[s1.customer_id.isin(s2["selected_ids"])].sort_values("rank").reset_index(drop=True)
    assert len(sel) == 6
    ids, p = sel.customer_id.tolist(), sel.predicted_probability.values
    n = len(p)
    exact = p_at_least(p)
    dist = poisson_binomial(p)
    qc = encoding_circuit(p)
    sv_p = Statevector(encoding_circuit(p, measure=False)).probabilities()
    sv_est = float(sum(sv_p[i] for i in range(2**n) if bin(i).count("1") >= SUCCESS_THRESHOLD))
    ideal = AerSimulator(seed_simulator=SEEDS["aer_stage3"])
    c_ideal = ideal.run(transpile(qc, ideal, seed_transpiler=SEEDS["transpiler"]), shots=SHOTS_IDEAL).result().get_counts()
    p_ideal = p_from_counts(c_ideal)
    se_ideal = np.sqrt(p_ideal * (1 - p_ideal) / SHOTS_IDEAL)
    rng = np.random.default_rng(SEEDS["monte_carlo"])
    draws = (rng.random((MC_DRAWS, n)) < p).sum(1)
    p_mc = float((draws >= SUCCESS_THRESHOLD).mean())
    se_mc = np.sqrt(p_mc * (1 - p_mc) / MC_DRAWS)
    # noisy simulation of the transpiled circuit
    backend = FakeKingston()
    tqc, tstats = transpile_report(qc, backend)
    noisy = AerSimulator.from_backend(backend, seed_simulator=SEEDS["aer_noisy"])
    c_noisy = noisy.run(tqc, shots=SHOTS_NOISY).result().get_counts()
    p_noisy = p_from_counts(c_noisy)
    mats = readout_calibration(noisy, tstats["physical_qubits"], SHOTS_NOISY, SEEDS["aer_noisy"] + 100)
    p_noisy_mit = p_from_quasi(tensored_mitigate(c_noisy, mats), n)
    m3_result = None
    try:
        import mthree

        mit = mthree.M3Mitigation(noisy)
        mit.cals_from_system(tstats["physical_qubits"], shots=SHOTS_NOISY)
        quasi = mit.apply_correction(c_noisy, tstats["physical_qubits"])
        m3_result = float(sum(v for k, v in quasi.items() if k.count("1") >= SUCCESS_THRESHOLD))
    except Exception as e:  # M3 is a cross-check; the tensored inversion above is the primary mitigation
        m3_result = f"unavailable: {type(e).__name__}: {e}"[:200]
    rows = [
        {"method": "exact_poisson_binomial", "backend": "classical", "shots": 0, "p_ge3": exact},
        {"method": "statevector_ideal", "backend": "qiskit.quantum_info.Statevector", "shots": 0, "p_ge3": sv_est},
        {"method": "aer_ideal_finite_shots", "backend": "AerSimulator (noiseless)", "shots": SHOTS_IDEAL,
         "p_ge3": p_ideal, "std_error": se_ideal, "seed": SEEDS["aer_stage3"]},
        {"method": "monte_carlo_classical", "backend": "numpy", "shots": MC_DRAWS, "p_ge3": p_mc, "std_error": se_mc,
         "seed": SEEDS["monte_carlo"]},
        {"method": "aer_noisy_unmitigated", "backend": "AerSimulator.from_backend(FakeKingston)", "shots": SHOTS_NOISY,
         "p_ge3": p_noisy, "std_error": np.sqrt(p_noisy * (1 - p_noisy) / SHOTS_NOISY), "seed": SEEDS["aer_noisy"]},
        {"method": "aer_noisy_readout_mitigated", "backend": "FakeKingston + tensored readout inversion",
         "shots": SHOTS_NOISY, "p_ge3": p_noisy_mit, "seed": SEEDS["aer_noisy"]},
    ]
    if isinstance(m3_result, float):
        rows.append({"method": "aer_noisy_m3_mitigated", "backend": "FakeKingston + mthree", "shots": SHOTS_NOISY,
                     "p_ge3": m3_result, "seed": SEEDS["aer_noisy"]})
    hw_path = RESULTS / "hardware_stage3.json"
    hw = json.loads(hw_path.read_text()) if hw_path.exists() else None
    if hw:
        p_hw = p_from_counts(hw["counts"])
        rows.append({"method": "ibm_hardware_unmitigated", "backend": hw["backend"], "shots": hw["shots"], "p_ge3": p_hw,
                     "std_error": np.sqrt(p_hw * (1 - p_hw) / hw["shots"]), "job_id": hw["job_id"]})
        if "readout_cal" in hw:
            hw_mats = [np.array(m) for m in hw["readout_cal"]]
            rows.append({"method": "ibm_hardware_readout_mitigated", "backend": hw["backend"], "shots": hw["shots"],
                         "p_ge3": p_from_quasi(tensored_mitigate(hw["counts"], hw_mats), n), "job_id": hw["job_id"]})
    for r in rows:
        r["abs_error_vs_exact"] = abs(r["p_ge3"] - exact)
    # error propagation from Stage 1
    boot = np.load(RESULTS / "stage1_bootstrap_test_probs.npy")
    _, test = load_stage1()
    col = [test.customer_id.tolist().index(c) for c in ids]
    pb = boot[:, col]
    boot_p3 = np.array([p_at_least(b) for b in pb])
    g = gradient(p)
    cov = np.cov(pb.T)
    sd_delta = float(np.sqrt(g @ cov @ g))
    stab = selection_stability(boot, test.customer_id.tolist(), set(ids))
    budget = {
        "stage1_model_uncertainty_sd_bootstrap": float(boot_p3.std(ddof=1)),
        "stage1_model_uncertainty_sd_delta_method": sd_delta,
        "shot_noise_sd_ideal_200k": float(se_ideal),
        "shot_noise_sd_at_20k": float(np.sqrt(exact * (1 - exact) / SHOTS_NOISY)),
        "hardware_noise_bias_fakekingston": p_noisy - exact,
        "residual_after_readout_mitigation": p_noisy_mit - exact,
        "bootstrap_p_ge3_ci95": [float(np.quantile(boot_p3, 0.025)), float(np.quantile(boot_p3, 0.975))],
        "gradient_dP_dp": dict(zip(ids, g.tolist())),
        "selection_stability": stab,
    }
    # outputs
    common = {"selected_ids": "|".join(ids), "qubit_order": "|".join(f"q{q}={c}" for q, c in enumerate(ids)),
              "input_probabilities": "|".join(f"{x:.6f}" for x in p),
              "ry_angles": "|".join(f"{2*np.arcsin(np.sqrt(x)):.6f}" for x in p), "exact_p_ge3": exact,
              "monte_carlo_p_ge3": p_mc}
    out = pd.DataFrame([{**common, **r} for r in rows])
    out.to_csv(ROOT / "stage3_simulation.csv", index=False)
    summary = {
        "selected_ids": ids,
        "customer_to_qubit": {c: q for q, c in enumerate(ids)},
        "bit_ordering": "Qiskit little-endian: qubit q is the rightmost-but-q character of a count key",
        "input_probabilities": dict(zip(ids, p.tolist())),
        "circuit": {"gates": "RY(theta_q) on each qubit, theta_q = 2*arcsin(sqrt(p_q)); no entanglers (independence)",
                    "theta": dict(zip(ids, (2 * np.arcsin(np.sqrt(p))).tolist())), "success": "popcount >= 3",
                    "qasm_free_description": str(qc.draw(output="text"))},
        "quantum_estimate_p_ge3": p_ideal, "quantum_estimate_std_error": se_ideal,
        "quantum_estimate_method": f"AerSimulator noiseless, {SHOTS_IDEAL} shots, seed {SEEDS['aer_stage3']}",
        "exact_p_ge3": exact, "monte_carlo_p_ge3": p_mc, "monte_carlo_std_error": se_mc,
        "success_count_distribution_exact": dist.tolist(),
        "absolute_error_quantum_vs_exact": abs(p_ideal - exact),
        "results": rows,
        "measurement_counts_ideal": c_ideal,
        "measurement_counts_noisy": c_noisy,
        "m3": m3_result,
        "readout_assignment_matrices_fake": [m.tolist() for m in mats],
        "transpilation": tstats,
        "hardware": hw and {k: v for k, v in hw.items() if k != "counts"},
        "error_budget": budget,
        "note": "Stage 3 is classically trivial (an exact 7-term convolution). The circuit is a faithful, "
                "verifiable sampler of the stated model; no speed-up is claimed.",
        "runtime_s": round(time.time() - t0, 1),
    }
    dump_json(summary, ROOT / "stage3_simulation.json")
    # figures
    fig, ax = plt.subplots(figsize=(6.4, 3.4))
    labels = [r["method"].replace("_", "\n", 1) for r in rows]
    vals = [r["p_ge3"] for r in rows]
    errs = [1.96 * r.get("std_error", 0) for r in rows]
    ax.barh(range(len(rows)), vals, xerr=errs, color=["#888"] + ["#4c72b0"] * (len(rows) - 1))
    ax.axvline(exact, c="k", ls="--", lw=1, label=f"exact = {exact:.4f}")
    ax.axvspan(*budget["bootstrap_p_ge3_ci95"], color="orange", alpha=0.15, label="Stage-1 bootstrap 95% band")
    ax.set_yticks(range(len(rows)), labels, fontsize=7)
    ax.set_xlabel("P(at least 3 of 6 subscribe)")
    ax.legend(fontsize=7, loc="lower right")
    fig.tight_layout()
    fig.savefig(FIGURES / "stage3_estimates.png", dpi=160)
    fig, ax = plt.subplots(figsize=(6.4, 3.2))
    names = ["Stage-1 model\n(bootstrap SD)", "Stage-1 model\n(delta method)", "shot noise\n(20k shots)",
             "noise bias\n(FakeKingston)", "after readout\nmitigation"]
    vals = [budget["stage1_model_uncertainty_sd_bootstrap"], sd_delta, budget["shot_noise_sd_at_20k"],
            abs(budget["hardware_noise_bias_fakekingston"]), abs(budget["residual_after_readout_mitigation"])]
    ax.bar(names, vals, color=["#dd8452", "#dd8452", "#4c72b0", "#c44e52", "#55a868"])
    ax.set_ylabel("|error| in P(>=3)")
    ax.set_title("Where the uncertainty in P(>=3) comes from")
    ax.tick_params(axis="x", labelsize=7)
    fig.tight_layout()
    fig.savefig(FIGURES / "stage3_error_budget.png", dpi=160)
    print(pd.DataFrame(rows)[["method", "p_ge3", "abs_error_vs_exact"]].to_string(index=False))
    print("budget", {k: v for k, v in budget.items() if k not in ("gradient_dP_dp",)})
    print(f"({time.time() - t0:.0f}s)")


if __name__ == "__main__":
    main()
