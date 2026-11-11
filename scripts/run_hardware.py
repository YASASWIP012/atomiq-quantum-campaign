"""Optional: run the Stage 3 circuit (and the Stage 2 p=1 QAOA circuit) on a real IBM QPU.

Needs an IBM Quantum Platform API key in the environment (never commit it):
    export IBM_QUANTUM_TOKEN=...        # optional: IBM_QUANTUM_INSTANCE=<CRN>
    python scripts/run_hardware.py      # default backend ibm_kingston (Heron r2, Open Plan)
Writes results/hardware_stage3.json and results/hardware_stage2.json. One job, ~4 circuits x 4000 shots.
Then rerun `make stage2 stage3` (or `make all`) to fold the hardware rows into the result files.
"""
from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

import numpy as np
from qiskit import QuantumCircuit
from qiskit.transpiler.preset_passmanagers import generate_preset_pass_manager

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
from atomiq.common import RESULTS, SEEDS  # noqa: E402
from atomiq.qaoa import bitstring_to_bits, qaoa_circuit, qubo_to_ising  # noqa: E402
from atomiq.stage2 import build_qubo, load_candidates, presolve  # noqa: E402
from atomiq.stage3 import encoding_circuit  # noqa: E402

SHOTS = 4000


def main():
    token = os.environ.get("IBM_QUANTUM_TOKEN")
    if not token:
        sys.exit("Set IBM_QUANTUM_TOKEN first (see docstring). Nothing was run.")
    from qiskit_ibm_runtime import QiskitRuntimeService
    from qiskit_ibm_runtime import SamplerV2 as Sampler

    kw = {"channel": "ibm_quantum_platform", "token": token}
    if os.environ.get("IBM_QUANTUM_INSTANCE"):
        kw["instance"] = os.environ["IBM_QUANTUM_INSTANCE"]
    service = QiskitRuntimeService(**kw)
    name = os.environ.get("IBM_BACKEND", "ibm_kingston")
    backend = service.backend(name)
    pm = generate_preset_pass_manager(optimization_level=3, backend=backend, seed_transpiler=SEEDS["transpiler"])

    s2 = json.loads((ROOT / "stage2_selection.json").read_text())
    s1 = {r.split(",")[0]: r.split(",") for r in (ROOT / "stage1_predictions.csv").read_text().splitlines()[1:]}
    ids = sorted(s2["selected_ids"], key=lambda c: int(s1[c][2]))
    p = np.array([float(s1[c][1]) for c in ids])
    st3 = pm.run(encoding_circuit(p))
    layout = st3.layout.final_index_layout()
    cals = []
    for flip in (0, 1):
        qc = QuantumCircuit(len(p))
        if flip:
            qc.x(range(len(p)))
        qc.measure_all()
        cals.append(generate_preset_pass_manager(optimization_level=0, backend=backend, initial_layout=layout,
                                                 seed_transpiler=SEEDS["transpiler"]).run(qc))
    c = load_candidates()
    qubo = build_qubo(c, presolve(c), cardinality_penalty=False)
    h, J, _ = qubo_to_ising(qubo["Q"], qubo["lin"], qubo["const"])
    sweep = {d["p"]: d for d in s2["depth_sweep"]}
    q1 = qaoa_circuit(qubo["n_dec"], 6, qubo["n_slack"], h, J, p=1, mixer="xy")
    q1 = q1.assign_parameters(dict(zip(list(q1.parameters), sweep[1]["params"])))
    q1.measure_all()
    st2 = pm.run(q1)

    sampler = Sampler(mode=backend)
    sampler.options.dynamical_decoupling.enable = True
    sampler.options.twirling.enable_gates = True
    sampler.options.twirling.enable_measure = False  # keep readout calibration comparable
    job = sampler.run([st3, cals[0], cals[1], st2], shots=SHOTS)
    print("submitted", job.job_id(), "on", backend.name, flush=True)
    res = job.result()
    counts = [r.data.meas.get_counts() for r in res]
    mats = []
    for q in range(len(p)):
        p10 = sum(v for k, v in counts[1].items() if bitstring_to_bits(k)[q] == 1) / SHOTS
        p01 = sum(v for k, v in counts[2].items() if bitstring_to_bits(k)[q] == 0) / SHOTS
        mats.append([[1 - p10, p01], [p10, 1 - p01]])
    stamp = time.strftime("%Y-%m-%dT%H:%M:%S%z")
    meta = {"backend": backend.name, "job_id": job.job_id(), "shots": SHOTS, "timestamp": stamp,
            "options": {"dynamical_decoupling": True, "gate_twirling": True},
            "seed_transpiler": SEEDS["transpiler"]}
    (RESULTS / "hardware_stage3.json").write_text(json.dumps(
        {**meta, "selected_ids": ids, "physical_qubits": layout, "transpiled_depth": st3.depth(),
         "counts": counts[0], "readout_cal": mats, "readout_cal_counts": counts[1:3]}, indent=2))
    (RESULTS / "hardware_stage2.json").write_text(json.dumps(
        {**meta, "p": 1, "physical_qubits": st2.layout.final_index_layout(), "transpiled_depth": st2.depth(),
         "two_qubit_gates": sum(v for g, v in st2.count_ops().items() if g in ("cz", "ecr", "cx")),
         "counts": counts[3]}, indent=2))
    print("saved results/hardware_stage3.json and results/hardware_stage2.json")


if __name__ == "__main__":
    main()
