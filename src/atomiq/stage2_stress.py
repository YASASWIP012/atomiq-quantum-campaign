"""Stage 2 stress test: the same 10 candidates with budget/capacity tightened until they bind.

On the real limits (25, 22) both inequalities are provably redundant, so the submitted QAOA
has no penalty terms. This script exercises the full formulation (bounded slack registers,
equality penalties with real ZZ couplings, Dicke + XY mixer) where the constraints matter,
and compares it with the standard penalty QUBO + X mixer. Everything is checked against
brute force. Results: results/stage2_stress.json, figures/stage2_stress.png.

Run: python -m atomiq.stage2_stress
"""
from __future__ import annotations

import time

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from scipy.optimize import minimize

from .common import FIGURES, K_SELECT, N_CANDIDATES, RESULTS, SEEDS, dump_json
from .qaoa import bits_of_index, qaoa_circuit, qubo_to_ising
from .qaoa_fast import FastQAOA
from .stage2 import brute_force, build_qubo, diag_cost, interp, load_candidates, presolve, transpile_stats

SCENARIOS = [
    {"name": "A: capacity <= 12", "budget": 25, "capacity": 12},
    {"name": "B: budget <= 15", "budget": 15, "capacity": 22},
    {"name": "C: budget <= 15, capacity <= 11", "budget": 15, "capacity": 11},
]
SHOTS = 4096


def optimise(sim: FastQAOA, p: int, init=None, restarts: int = 3):
    rng = np.random.default_rng(SEEDS["qaoa_init"] + 100 + p)
    starts = ([init] if init is not None else []) + [rng.uniform(0, np.pi, 2 * p) for _ in range(restarts)]
    best = None
    for s in starts:
        r = minimize(sim.energy, s, method="COBYLA", options={"maxiter": 300 * p, "rhobeg": 0.3})
        if best is None or r.fun < best.fun:
            best = r
    return best


def evaluate(probs, c, bf, n, budget, capacity, seed):
    b = bits_of_index(np.arange(2**n), n)[:, :N_CANDIDATES]
    v = b @ c.expected_net_value.values
    feas = (b.sum(1) == K_SELECT) & (b @ c.contact_cost.values <= budget) & (b @ c.capacity_units.values <= capacity)
    opt = (b == bf["x"]).all(1)
    counts = np.random.default_rng(seed).multinomial(SHOTS, probs / probs.sum())
    hit = np.nonzero(counts)[0]
    feas_hit = hit[feas[hit]]
    best_sampled = float(v[feas_hit].max()) if len(feas_hit) else None
    return {
        "p_feasible": float(probs[feas].sum()), "p_optimal": float(probs[opt].sum()),
        "p_weight6": float(probs[b.sum(1) == K_SELECT].sum()),
        "best_sampled_feasible_objective": best_sampled,
        "gap_best_sampled": None if best_sampled is None else (bf["objective"] - best_sampled) / abs(bf["objective"]),
        "found_optimum_in_shots": bool(best_sampled is not None and abs(best_sampled - bf["objective"]) < 1e-9),
    }


def run_scenario(c, sc):
    B, H = sc["budget"], sc["capacity"]
    pre = presolve(c, B, H)
    bf = brute_force(c, B, H)
    out = {**sc, "presolve": pre, "n_feasible": bf["n_feasible"], "optimal_ids": c.customer_id[bf["x"] == 1].tolist(),
           "optimal_objective": bf["objective"], "second_best_objective": bf["second_best_objective"],
           "uniform_feasible_p_optimal": 1 / bf["n_feasible"], "runs": []}
    for ansatz, mixer, card, depths in (("Dicke + XY (constraint-native)", "xy", False, (1, 2, 3)),
                                        ("penalty QUBO + X mixer", "x", True, (1, 2))):
        q = build_qubo(c, pre, cardinality_penalty=card)
        n = q["n_dec"] + q["n_slack"]
        f = diag_cost(q)
        sim = FastQAOA(f, q["n_dec"], K_SELECT, q["n_slack"], mixer=mixer)
        init = None
        h, J, _ = qubo_to_ising(q["Q"], q["lin"], q["const"])
        for p in depths:
            r = optimise(sim, p, init)
            init = interp(r.x, p)
            ev = evaluate(sim.probs(r.x), c, bf, n, B, H, SEEDS["qaoa_sampler"] + p)
            out["runs"].append({"ansatz": ansatz, "p": p, "qubits": n, "slack_qubits": q["n_slack"],
                                "zz_terms": len(J), "lambda": q["lam"], "params": r.x.tolist(), **ev})
            print(f"  {sc['name']:<34} {ansatz:<32} p={p} n={n} P(feas)={ev['p_feasible']:.3f} "
                  f"P(opt)={ev['p_optimal']:.4f} found={ev['found_optimum_in_shots']}", flush=True)
    # penalty-weight sensitivity for the constraint-native ansatz at p=2
    sens = []
    for mult in (0.25, 0.5, 1.0, 2.0, 4.0):
        q = build_qubo(c, pre, cardinality_penalty=False, lam_mult=mult)
        n = q["n_dec"] + q["n_slack"]
        sim = FastQAOA(diag_cost(q), q["n_dec"], K_SELECT, q["n_slack"], mixer="xy")
        r = optimise(sim, 2)
        sens.append({"lambda_mult": mult, "lambda": q["lam"],
                     **evaluate(sim.probs(r.x), c, bf, n, B, H, SEEDS["qaoa_sampler"])})
    out["lambda_sensitivity_p2"] = sens
    # hardware cost of the constraint-native p=1 circuit for this scenario
    q = build_qubo(c, pre, cardinality_penalty=False)
    h, J, _ = qubo_to_ising(q["Q"], q["lin"], q["const"])
    qc = qaoa_circuit(q["n_dec"], K_SELECT, q["n_slack"], h, J, p=1, mixer="xy")
    first = next(r for r in out["runs"] if r["p"] == 1 and r["ansatz"].startswith("Dicke"))
    qc = qc.assign_parameters(dict(zip(qc.parameters, first["params"])))
    qc.measure_all()
    from qiskit_ibm_runtime.fake_provider import FakeKingston

    _, stats = transpile_stats(qc, FakeKingston(), SEEDS["transpiler"])
    out["transpile_p1_fakekingston"] = {k: stats[k] for k in ("logical_qubits", "transpiled_depth",
                                                               "transpiled_2q_gates", "swap_count")}
    return out


def main():
    t0 = time.time()
    c = load_candidates()
    res = [run_scenario(c, sc) for sc in SCENARIOS]
    dump_json({"scenarios": res, "shots": SHOTS, "note": "Stress test only; the submitted selection uses the real limits (25, 22).",
               "runtime_s": round(time.time() - t0, 1)}, RESULTS / "stage2_stress.json")
    fig, axes = plt.subplots(1, len(res), figsize=(11, 3.3), sharey=False)
    for ax, sc in zip(axes, res):
        for ans, mk in (("Dicke + XY (constraint-native)", "o-"), ("penalty QUBO + X mixer", "s-")):
            rr = [r for r in sc["runs"] if r["ansatz"] == ans]
            ax.plot([r["p"] for r in rr], [r["p_optimal"] for r in rr], mk, label=ans)
        ax.axhline(sc["uniform_feasible_p_optimal"], ls="--", c="grey", label="uniform over feasible")
        ax.set_title(f"{sc['name']}\n{sc['n_feasible']} feasible of 210", fontsize=9)
        ax.set_xlabel("p")
        ax.set_yscale("log")
    axes[0].set_ylabel("P(brute-force optimum)")
    axes[0].legend(fontsize=7)
    fig.tight_layout()
    fig.savefig(FIGURES / "stage2_stress.png", dpi=160)
    print(f"({time.time() - t0:.0f}s)")


if __name__ == "__main__":
    main()
