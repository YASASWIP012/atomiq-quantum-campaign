"""Stage 2: choose exactly 6 of the top 10 under budget and capacity with constraint-native QAOA.

Run: python -m atomiq.stage2   (needs stage1_predictions.csv)
Writes stage2_selection.csv/.json (repo root), results/stage2_*.json, figures/stage2_*.png
"""
from __future__ import annotations

import itertools
import time
from math import ceil, comb, log2

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from qiskit import transpile
from qiskit.quantum_info import Statevector
from qiskit.transpiler import StagedPassManager
from qiskit.transpiler.preset_passmanagers import generate_preset_pass_manager
from qiskit_aer import AerSimulator
from qiskit_ibm_runtime.fake_provider import FakeKingston
from scipy.optimize import minimize

from .common import (BUDGET, CAPACITY, FIGURES, K_SELECT, N_CANDIDATES, RESULTS, ROOT, SEEDS, dump_json,
                     load_stage2_data)
from .qaoa import bits_of_index, bitstring_to_bits, qaoa_circuit, qubo_to_ising

SHOTS = 4096
P_MAX = 3


def load_candidates() -> pd.DataFrame:
    s1 = pd.read_csv(ROOT / "stage1_predictions.csv", dtype={"customer_id": str})
    top = s1[s1.is_top_10 == 1].sort_values("rank").reset_index(drop=True)
    assert len(top) == N_CANDIDATES
    d = load_stage2_data()
    cand = top.merge(d, on="customer_id", how="left", validate="one_to_one")
    assert cand[["contact_cost", "expected_deposit_value", "capacity_units"]].notna().all().all()
    cand["expected_net_value"] = cand.predicted_probability * cand.expected_deposit_value - cand.contact_cost
    cand["qubit"] = np.arange(N_CANDIDATES)  # qubit i <-> i-th ranked candidate
    return cand


def brute_force(c: pd.DataFrame, budget: int = BUDGET, capacity: int = CAPACITY) -> dict:
    v, cost, cap = c.expected_net_value.values, c.contact_cost.values, c.capacity_units.values
    rows = []
    for combo in itertools.combinations(range(N_CANDIDATES), K_SELECT):
        x = np.zeros(N_CANDIDATES, int)
        x[list(combo)] = 1
        rows.append((x, v @ x, cost @ x, cap @ x, cost @ x <= budget and cap @ x <= capacity))
    feas = [r for r in rows if r[4]]
    best = max(feas, key=lambda r: r[1])
    ranked = sorted(feas, key=lambda r: -r[1])
    return {
        "x": best[0], "objective": best[1], "budget_used": best[2], "capacity_used": best[3],
        "n_cardinality_states": len(rows), "n_feasible": len(feas),
        "second_best_objective": ranked[1][1] if len(ranked) > 1 else None,
        "objectives_feasible": np.array([r[1] for r in feas]),
    }


def presolve(c: pd.DataFrame, budget: int = BUDGET, capacity: int = CAPACITY) -> dict:
    """An inequality can never bind if even the 6 largest coefficients fit under the limit."""
    cost, cap = np.sort(c.contact_cost.values), np.sort(c.capacity_units.values)
    return {
        "budget_limit": int(budget), "capacity_limit": int(capacity),
        "max_budget_any_6": int(cost[-K_SELECT:].sum()), "min_budget_any_6": int(cost[:K_SELECT].sum()),
        "budget_redundant": bool(cost[-K_SELECT:].sum() <= budget),
        "max_capacity_any_6": int(cap[-K_SELECT:].sum()), "min_capacity_any_6": int(cap[:K_SELECT].sum()),
        "capacity_redundant": bool(cap[-K_SELECT:].sum() <= capacity),
    }


def _slack_weights(rng: int) -> np.ndarray:
    """Bounded binary encoding spanning exactly 0..rng (no zero-weight qubit; rng=0 -> no slack)."""
    if rng <= 0:
        return np.array([], dtype=int)
    n = int(np.floor(np.log2(rng))) + 1
    w = 2 ** np.arange(n)
    w[-1] = rng - w[:-1].sum()
    return w


def build_qubo(c: pd.DataFrame, pre: dict, cardinality_penalty: bool, lam_mult: float = 1.0):
    """Minimise f = -sum v_i x_i / scale
         + lam * (cost.x + s_B - B)^2      if the budget can bind
         + lam * (cap.x  + s_H - H)^2      if the capacity can bind
         [+ lam * (sum x - K)^2]           only for the penalty baseline (cardinality_penalty=True).
    Slack registers are bounded binary encodings of 0..(limit - min over 6-subsets)."""
    v = c.expected_net_value.values
    scale = np.abs(v).max()
    vn = v / scale
    lam = lam_mult * (1.0 + np.abs(vn).sum())  # lam_mult=1: any violation costs more than the objective range
    n_dec = N_CANDIDATES
    regs = []  # (name, coeffs on decision qubits, limit, slack weights)
    if not pre["budget_redundant"]:
        regs.append(("budget", c.contact_cost.values.astype(float), pre["budget_limit"],
                     _slack_weights(pre["budget_limit"] - pre["min_budget_any_6"])))
    if not pre["capacity_redundant"]:
        regs.append(("capacity", c.capacity_units.values.astype(float), pre["capacity_limit"],
                     _slack_weights(pre["capacity_limit"] - pre["min_capacity_any_6"])))
    n_slack = sum(len(r[3]) for r in regs)
    n = n_dec + n_slack
    Q, lin, const = np.zeros((n, n)), np.zeros(n), 0.0
    lin[:n_dec] -= vn
    off = n_dec
    slack_layout = {}
    for name, coef, limit, w in regs:
        a = np.zeros(n)
        a[:n_dec] = coef
        a[off:off + len(w)] = w
        slack_layout[name] = {"qubits": list(range(off, off + len(w))), "weights": w.tolist(), "limit": limit}
        off += len(w)
        Q += lam * np.outer(a, a)
        lin += -2 * lam * limit * a
        const += lam * limit**2
    if cardinality_penalty:
        e = np.zeros(n)
        e[:n_dec] = 1
        Q += lam * np.outer(e, e)
        lin += -2 * lam * K_SELECT * e
        const += lam * K_SELECT**2
    return {"Q": Q, "lin": lin, "const": const, "lam": lam, "lam_mult": lam_mult, "scale": scale,
            "n_dec": n_dec, "n_slack": n_slack, "slack": slack_layout,
            "slack_weights": [w for r in regs for w in r[3].tolist()]}


def diag_cost(qubo) -> np.ndarray:
    n = len(qubo["lin"])
    b = bits_of_index(np.arange(2**n), n)
    return np.einsum("ki,ij,kj->k", b, qubo["Q"], b) + b @ qubo["lin"] + qubo["const"]


def decision_view(c: pd.DataFrame, n: int, budget: int = BUDGET, capacity: int = CAPACITY):
    b = bits_of_index(np.arange(2**n), n)[:, :N_CANDIDATES]
    v = b @ c.expected_net_value.values
    feas = (b.sum(1) == K_SELECT) & (b @ c.contact_cost.values <= budget) & (b @ c.capacity_units.values <= capacity)
    return b, v, feas


def run_qaoa(c, qubo, p, mixer, init=None, restarts=4):
    h, J, off = qubo_to_ising(qubo["Q"], qubo["lin"], qubo["const"])
    n = qubo["n_dec"] + qubo["n_slack"]
    qc = qaoa_circuit(qubo["n_dec"], K_SELECT, qubo["n_slack"], h, J, p, mixer=mixer)
    f = diag_cost(qubo)
    params = list(qc.parameters)  # sorted: beta[...] then gamma[...]

    def energy(theta):
        sv = Statevector(qc.assign_parameters(dict(zip(params, theta))))
        return float(np.abs(sv.data) ** 2 @ f)

    rng = np.random.default_rng(SEEDS["qaoa_init"] + p)
    starts = [] if init is None else [init]
    starts += [rng.uniform(0, np.pi, 2 * p) for _ in range(restarts)]
    best = None
    for s in starts:
        r = minimize(energy, s, method="COBYLA", options={"maxiter": 250 * p, "rhobeg": 0.3})
        if best is None or r.fun < best.fun:
            best = r
    bound = qc.assign_parameters(dict(zip(params, best.x)))
    probs = np.abs(Statevector(bound).data) ** 2
    return qc, params, best, probs


def interp(theta, p):
    """INTERP initialisation (Zhou et al. 2020) from depth p to p+1. theta = [beta..., gamma...]."""
    beta, gamma = theta[:p], theta[p:]

    def up(v):
        v = np.concatenate([[0.0], v, [0.0]])
        return np.array([(i / p) * v[i] + ((p - i) / p) * v[i + 1] for i in range(p + 1)])

    return np.concatenate([up(beta), up(gamma)])


def score(probs, c, bf, n, budget: int = BUDGET, capacity: int = CAPACITY):
    b, v, feas = decision_view(c, n, budget, capacity)
    opt_mask = (b == bf["x"]).all(1)
    w6 = b.sum(1) == K_SELECT
    return {
        "p_feasible": float(probs[feas].sum()),
        "p_hamming_weight_6": float(probs[w6].sum()),
        "p_optimal": float(probs[opt_mask].sum()),
        "expected_objective_feasible_only": float((probs[feas] @ v[feas]) / max(probs[feas].sum(), 1e-12)),
        "approx_ratio": float((probs[feas] @ v[feas]) / max(probs[feas].sum(), 1e-12) / bf["objective"]),
    }


def sample_and_select(probs, c, bf, n, shots, seed):
    rng = np.random.default_rng(seed)
    counts_idx = rng.multinomial(shots, probs / probs.sum())
    nz = np.nonzero(counts_idx)[0]
    counts = {format(i, f"0{n}b"): int(counts_idx[i]) for i in nz}
    return counts, select_from_counts(counts, c)


def select_from_counts(counts: dict, c: pd.DataFrame, budget: int = BUDGET, capacity: int = CAPACITY):
    """Highest-objective feasible bitstring among the measured samples (not the most frequent one)."""
    v, cost, cap = c.expected_net_value.values, c.contact_cost.values, c.capacity_units.values
    best = None
    for key, cnt in counts.items():
        x = bitstring_to_bits(key)[:N_CANDIDATES]
        if x.sum() == K_SELECT and cost @ x <= budget and cap @ x <= capacity:
            if best is None or v @ x > best[1] + 1e-12:
                best = (key, float(v @ x), cnt)
    return best


def transpile_stats(qc, backend, seed):
    pm = generate_preset_pass_manager(optimization_level=3, backend=backend, seed_transpiler=seed)
    routed = StagedPassManager(stages=["init", "layout", "routing"], init=pm.init, layout=pm.layout,
                               routing=pm.routing).run(qc)
    tqc = pm.run(qc)
    ops = tqc.count_ops()
    two_q = sum(cnt for g, cnt in ops.items() if g in ("cz", "cx", "ecr", "rzz"))
    one_q = sum(cnt for g, cnt in ops.items() if g not in ("cz", "cx", "ecr", "rzz", "measure", "barrier", "delay"))
    layout = tqc.layout.final_index_layout() if tqc.layout else None
    return tqc, {
        "logical_qubits": qc.num_qubits, "physical_qubits_used": len(set(layout)) if layout else None,
        "physical_layout": layout, "original_depth": qc.decompose(reps=3).depth(),
        "original_2q_gates": sum(cnt for g, cnt in qc.decompose(reps=3).count_ops().items() if g in ("cx", "rzz", "cz")),
        "transpiled_depth": tqc.depth(), "transpiled_1q_gates": int(one_q), "transpiled_2q_gates": int(two_q),
        "swap_count": int(routed.count_ops().get("swap", 0)), "basis_ops": {k: int(v) for k, v in ops.items()},
        "optimization_level": 3, "seed_transpiler": seed, "backend": backend.name,
    }


def main():
    t0 = time.time()
    c = load_candidates()
    pre = presolve(c)
    bf = brute_force(c)
    print("presolve", pre, "| feasible", bf["n_feasible"], "/", bf["n_cardinality_states"], "| opt", round(bf["objective"], 4))
    qubo = build_qubo(c, pre, cardinality_penalty=False)
    n = qubo["n_dec"] + qubo["n_slack"]
    # depth sweep for the constraint-native ansatz (p=0 is the Dicke state alone)
    sweep = []
    from .qaoa import dicke_state
    from qiskit import QuantumCircuit

    p0 = QuantumCircuit(n)
    p0.compose(dicke_state(qubo["n_dec"], K_SELECT), range(qubo["n_dec"]), inplace=True)
    if qubo["n_slack"]:
        p0.h(range(qubo["n_dec"], n))
    probs0 = np.abs(Statevector(p0).data) ** 2
    sweep.append({"p": 0, "ansatz": "Dicke only (uniform over 210)", **score(probs0, c, bf, n)})
    results, init = {}, None
    for p in range(1, P_MAX + 1):
        qc, params, opt, probs = run_qaoa(c, qubo, p, "xy", init=init)
        init = interp(opt.x, p)
        results[p] = (qc, params, opt, probs)
        sweep.append({"p": p, "ansatz": "Dicke + XY ring", "energy": opt.fun, "params": opt.x.tolist(),
                      "n_evals": int(opt.nfev), **score(probs, c, bf, n)})
        print("xy p", p, {k: round(v, 4) for k, v in sweep[-1].items() if isinstance(v, float)}, flush=True)
    # standard penalty QAOA baseline (|+> start, X mixer, cardinality as a penalty)
    qubo_pen = build_qubo(c, pre, cardinality_penalty=True)
    baseline, init_b = [], None
    for p in (1, 2):
        _, _, opt_b, probs_b = run_qaoa(c, qubo_pen, p, "x", init=init_b)
        init_b = interp(opt_b.x, p)  # same INTERP warm start as the constraint-native ansatz
        baseline.append({"p": p, "ansatz": "penalty QUBO + X mixer", "params": opt_b.x.tolist(), **score(probs_b, c, bf, n)})
        print("pen p", p, {k: round(v, 4) for k, v in baseline[-1].items() if isinstance(v, float)}, flush=True)
    # pick depth with highest probability of the optimum
    best_p = max(range(1, P_MAX + 1), key=lambda p: sweep[p]["p_optimal"])
    qc, params, opt, probs = results[best_p]
    counts, sel = sample_and_select(probs, c, bf, n, SHOTS, SEEDS["qaoa_sampler"])
    if sel is None:
        raise RuntimeError("no feasible bitstring sampled; pre-registered fallback would be brute force")
    x_sel = bitstring_to_bits(sel[0])[:N_CANDIDATES]
    # noisy simulation and transpilation for p=1 (hardware-sized) and best_p
    backend = FakeKingston()
    noisy = {}
    for p in sorted({1, best_p}):
        qcp, prm, optp, _ = results[p]
        bound = qcp.assign_parameters(dict(zip(prm, optp.x)))
        bound.measure_all()
        tqc, stats = transpile_stats(bound, backend, SEEDS["transpiler"])
        sim = AerSimulator.from_backend(backend, seed_simulator=SEEDS["aer_noisy"])
        nc = sim.run(tqc, shots=SHOTS).result().get_counts()
        raw = {"p_feasible": 0, "p_hamming_weight_6": 0, "p_optimal": 0}
        for key, cnt in nc.items():
            x = bitstring_to_bits(key)[:N_CANDIDATES]
            w6 = x.sum() == K_SELECT
            feas = w6 and c.contact_cost.values @ x <= BUDGET and c.capacity_units.values @ x <= CAPACITY
            raw["p_hamming_weight_6"] += cnt / SHOTS
            raw["p_feasible"] += feas * cnt / SHOTS
            raw["p_optimal"] += (feas and (x == bf["x"]).all()) * cnt / SHOTS
            raw["p_hamming_weight_6"] -= (not w6) * cnt / SHOTS
        ps = {"p_feasible_given_weight6": raw["p_feasible"] / max(raw["p_hamming_weight_6"], 1e-12),
              "p_optimal_given_weight6": raw["p_optimal"] / max(raw["p_hamming_weight_6"], 1e-12)}
        best_noisy = select_from_counts(nc, c)
        noisy[p] = {"transpile": stats, "raw": raw, "postselected_weight6": ps,
                    "best_feasible_sampled_objective": best_noisy[1] if best_noisy else None,
                    "finds_optimum": bool(best_noisy and abs(best_noisy[1] - bf["objective"]) < 1e-9),
                    "noise_model": "AerSimulator.from_backend(FakeKingston)", "shots": SHOTS,
                    "seed_simulator": SEEDS["aer_noisy"]}
        print("noisy p", p, raw, ps, stats["transpiled_depth"], stats["transpiled_2q_gates"], stats["swap_count"], flush=True)
    hardware = None
    hw_path = RESULTS / "hardware_stage2.json"
    if hw_path.exists():
        import json

        hw = json.loads(hw_path.read_text())
        tot = sum(hw["counts"].values())
        w6 = feas_n = opt_n = 0
        for key, cnt in hw["counts"].items():
            x = bitstring_to_bits(key)[:N_CANDIDATES]
            if x.sum() == K_SELECT:
                w6 += cnt
                if c.contact_cost.values @ x <= BUDGET and c.capacity_units.values @ x <= CAPACITY:
                    feas_n += cnt
                    opt_n += cnt * bool((x == bf["x"]).all())
        best_hw = select_from_counts(hw["counts"], c)
        hardware = {k: hw[k] for k in ("backend", "job_id", "shots", "timestamp", "transpiled_depth", "two_qubit_gates",
                                       "physical_qubits", "options")}
        hardware.update({"p": 1, "raw": {"p_hamming_weight_6": w6 / tot, "p_feasible": feas_n / tot,
                                         "p_optimal": opt_n / tot},
                         "postselected_weight6": {"p_feasible_given_weight6": feas_n / max(w6, 1),
                                                  "p_optimal_given_weight6": opt_n / max(w6, 1)},
                         "best_feasible_sampled_objective": best_hw[1] if best_hw else None,
                         "finds_optimum": bool(best_hw and abs(best_hw[1] - bf["objective"]) < 1e-9)})
        print("hardware", hardware["raw"], hardware["postselected_weight6"], flush=True)
    uniform_feasible = 1 / bf["n_feasible"]
    gap = (bf["objective"] - sel[1]) / abs(bf["objective"])
    sel_ids = c.customer_id[x_sel == 1].tolist()
    out_csv = c[["qubit", "customer_id", "rank", "predicted_probability", "expected_deposit_value", "contact_cost",
                 "capacity_units", "expected_net_value"]].copy()
    out_csv["selected"] = x_sel
    out_csv["brute_force_selected"] = bf["x"]
    out_csv.to_csv(ROOT / "stage2_selection.csv", index=False)
    ising = qubo_to_ising(qubo["Q"], qubo["lin"], qubo["const"])
    summary = {
        "candidate_ids_top10": c.customer_id.tolist(),
        "qubit_to_customer": dict(zip(c.qubit.tolist(), c.customer_id.tolist())),
        "selected_ids": sel_ids,
        "selected_bitstring_qiskit_order": sel[0],
        "selected_bitstring_note": "Qiskit little-endian ordering: the rightmost character is qubit 0 = the rank-1 candidate",
        "total_budget_used": int(c.contact_cost.values @ x_sel), "budget_limit": BUDGET,
        "total_capacity_used": int(c.capacity_units.values @ x_sel), "capacity_limit": CAPACITY,
        "objective_value": sel[1],
        "brute_force_optimal_ids": c.customer_id[bf["x"] == 1].tolist(),
        "brute_force_optimal_objective": bf["objective"],
        "optimality_gap": gap,
        "feasible": True, "solver": f"constraint-native QAOA p={best_p} (Dicke + XY ring), statevector, {SHOTS} shots",
        "presolve": pre,
        "formulation": {
            "objective": "maximise sum_i (p_i * deposit_i - cost_i) x_i  ==  minimise -sum_i v_i x_i / max|v|",
            "cardinality": "enforced exactly by Dicke(10,6) initial state + Hamming-weight-preserving XY ring mixer (no penalty, no slack)",
            "budget": "redundant: the 6 most expensive candidates cost <= 25 (presolve proof)",
            "capacity": "redundant (presolve)" if pre["capacity_redundant"] else
                        f"equality penalty lam*(cap.x + slack - {CAPACITY})^2 with {qubo['n_slack']} bounded slack bits {qubo['slack_weights']}",
            "penalty_weight_lambda": qubo["lam"], "objective_scale": qubo["scale"],
            "lambda_rule": "lam = 1 + sum_i |v_i|/max|v|: any violation costs more than the whole objective range",
            "ising_h": ising[0].tolist(), "ising_J": {f"{i},{j}": v for (i, j), v in ising[1].items()},
            "ising_offset": ising[2],
        },
        "qaoa": {"best_p": best_p, "optimised_params_beta_then_gamma": opt.x.tolist(),
                 "optimizer": "COBYLA, 4 random restarts + INTERP warm start", "seed": SEEDS["qaoa_init"]},
        "depth_sweep": sweep, "penalty_baseline": baseline,
        "random_feasible_baseline_p_optimal": uniform_feasible,
        "dicke_only_baseline_p_optimal": sweep[0]["p_optimal"],
        "measured_counts_top20": dict(sorted(counts.items(), key=lambda kv: -kv[1])[:20]),
        "best_sampled": {"bitstring": sel[0], "count": sel[2]},
        "noisy_simulation": noisy,
        "ibm_hardware": hardware,
        "n_feasible_subsets": bf["n_feasible"], "n_cardinality_subsets": bf["n_cardinality_states"],
        "runtime_s": round(time.time() - t0, 1),
    }
    dump_json(summary, ROOT / "stage2_selection.json")
    # figure: P(opt) and P(feasible) by depth vs baselines
    fig, ax = plt.subplots(1, 2, figsize=(8.6, 3.3))
    ps_ = [s["p"] for s in sweep]
    ax[0].plot(ps_, [s["p_optimal"] for s in sweep], "o-", label="Dicke + XY QAOA")
    ax[0].axhline(uniform_feasible, ls="--", c="grey", label="uniform over feasible")
    ax[0].plot([b["p"] for b in baseline], [b["p_optimal"] for b in baseline], "s-", label="penalty QUBO + X mixer")
    ax[0].set_xlabel("QAOA depth p"); ax[0].set_ylabel("P(brute-force optimum)"); ax[0].legend(fontsize=7)
    ax[1].plot(ps_, [s["p_feasible"] for s in sweep], "o-", label="Dicke + XY QAOA")
    ax[1].plot([b["p"] for b in baseline], [b["p_feasible"] for b in baseline], "s-", label="penalty QUBO + X mixer")
    ax[1].set_xlabel("QAOA depth p"); ax[1].set_ylabel("P(feasible)"); ax[1].set_ylim(0, 1.05); ax[1].legend(fontsize=7)
    fig.suptitle("Stage 2: ideal statevector QAOA")
    fig.tight_layout()
    fig.savefig(FIGURES / "stage2_qaoa_depth.png", dpi=160)
    print("selected", sel_ids, "obj", round(sel[1], 4), "gap", gap, f"({time.time() - t0:.0f}s)")


if __name__ == "__main__":
    main()
