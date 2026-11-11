# Six customers, one campaign: a hybrid quantum-classical term-deposit pipeline

Our entry to The Atomiq Hackathon (Qiskit Fall Fest 2026 at IEM) builds the three-stage campaign pipeline in Qiskit. It predicts who will subscribe, picks six customers to call with a QAOA circuit that obeys the "exactly six" rule by construction, and estimates the chance that at least three of them subscribe. Every quantum result is checked against an exact classical answer.

## The answer

| | Value | Where it comes from |
|---|---|---|
| Customers to contact (Stage 2) | **C0031, C0256, C0028, C0338, C0079, C0088** | `stage2_selection.json` |
| P(at least 3 of 6 subscribe), quantum estimate (Stage 3) | **0.0616** ± 0.0005 (1 s.e., 200,000 shots) | `stage3_simulation.json` |
| Exact value from the same probabilities | 0.0618 | Poisson-binomial |
| Stage 2 optimality gap vs brute force | **0.0%** (6.671 vs 6.671) | all 210 subsets checked |
| Budget / capacity used | 14 of 25 / 15 of 22 | |
| Uncertainty carried in from Stage 1 | 95% bootstrap band 0.011 to 0.200 | 200 refits on resampled training data |

The last row matters most for the business reading. The probability that three of the six convert is low, and the estimate is only as good as a classifier trained on 35 positive examples. The quantum sampling error is about 90 times smaller than that model error.

## Links

| What | Where |
|---|---|
| Slide deck (PDF, built from the result files) | [`presentation/deck.pdf`](presentation/deck.pdf) |
| Video walkthrough (2 min) | VIDEO_LINK |
| Result files | [`stage1_predictions.csv`](stage1_predictions.csv), [`stage2_selection.csv`](stage2_selection.csv) / [`.json`](stage2_selection.json), [`stage3_simulation.csv`](stage3_simulation.csv) / [`.json`](stage3_simulation.json) |
| Pre-registered model-selection rule (committed before any fit) | [`PREREGISTRATION.md`](PREREGISTRATION.md) |
| Submission self-check (25 checks) | `make check` → [`scripts/check_submission.py`](scripts/check_submission.py) |

## Pipeline

```
Stage1_Train (300, 35 yes) ──► nested CV ──► hybrid model ──► p_i for 100 test customers ──► top 10
                                   (train only)   0.7·LR + 0.3·quantum kernel               │
                                                                                            ▼
          brute force (210 subsets) ◄── check ── Stage 2: Dicke(10,6) + XY-ring QAOA ──► 6 IDs
                                                                                            │
          exact Poisson-binomial, Monte Carlo ◄── check ── Stage 3: 6 RY qubits ──► P(≥3)  ▼
                                    Stage 1 bootstrap ──► uncertainty carried through Stages 2 and 3
```

Stage 1 probabilities flow unchanged into Stages 2 and 3. `scripts/check_submission.py` recomputes the Stage 2 objective and the Stage 3 exact value from `stage1_predictions.csv` and fails if anything drifts.

### What is quantum and what is classical

| Stage | Quantum part | Classical part | Verified against |
|---|---|---|---|
| 1 | ZZ feature-map states on 6 qubits, used as a fidelity kernel and a projected (single-qubit Pauli) kernel | preprocessing, PCA to 6 angles, SVM, Platt calibration, the blend weight, logistic regression | classical baselines in the same nested CV |
| 2 | Dicke-state preparation, cost-phase layers, XY ring mixer, sampling | COBYLA parameter search, presolve, decoding | brute force over all 210 subsets |
| 3 | 6-qubit RY product state, measurement | counting outcomes with ≥ 3 ones | exact Poisson-binomial and 10⁶-draw Monte Carlo |

We make no claim of quantum advantage. Each problem here is small enough to solve exactly on a laptop, and we do that in every stage so the quantum results can be checked.

## Stage 1: subscription prediction

**Data handling.** All preprocessing is fitted inside each training fold: a signed log transform for balance, logs of campaign, pdays and previous, a "contacted before" flag, standard scaling, and one-hot encoding of month, poutcome, contact, housing and loan. The test set is predicted once, at the end. The `duration` column is not in the release, which avoids the well-known leak in this dataset.

**Quantum models.** Each customer becomes 6 angles (PCA fitted on the training fold, then standardised) times a bandwidth factor, encoded with the linear-entanglement `zz_feature_map(6, reps=2)`.

- *Fidelity kernel (QK):* k(x, x') = |⟨φ(x)|φ(x')⟩|².
- *Projected kernel (PQK):* an RBF kernel on the 18 single-qubit expectations ⟨X⟩, ⟨Y⟩, ⟨Z⟩ of each state (Huang et al., 2021).
- Both feed a class-balanced SVM, then Platt scaling fitted on out-of-fold decision values.
- Statevectors are computed exactly with a vectorised simulator. `tests/test_kernels.py` checks it against `qiskit.quantum_info.Statevector` on Qiskit's own `zz_feature_map` circuit, to 1e-10.

**Why bandwidth matters.** At the default scaling, fidelity kernels between different customers bunch close to a constant ("exponential concentration"), and the SVM has little to learn from. We tune the bandwidth inside the inner CV loop (Shaydulin & Wild, *Importance of kernel bandwidth in quantum machine learning*, arXiv:2111.05451).

![kernel concentration](figures/stage1_kernel_concentration.png)

Off-diagonal kernel variance peaks near bandwidth 0.06. At bandwidth 1 it is about 70 times smaller.

**Model selection.** We ran 10 × repeated stratified 5-fold CV on the 300 training customers, with an inner 3-fold loop for every hyperparameter: LR strength, kernel bandwidth, kernel type, SVM C, and the blend weight w. The table gives the mean over 50 outer folds, with precision and recall at k = 10% of the fold.

| Model | ROC-AUC | PR-AUC | Brier | Log loss | Precision@k | Recall@k |
|---|---|---|---|---|---|---|
| Constant prior | 0.500 | 0.117 | 0.1031 | 0.360 | 0.177 | 0.151 |
| Logistic regression | **0.621** | **0.269** | **0.1016** | **0.357** | 0.207 | 0.177 |
| Gradient boosting | 0.542 | 0.258 | 0.1098 | 0.410 | **0.250** | **0.214** |
| Quantum fidelity kernel (QK) | 0.522 | 0.186 | 0.1045 | 0.367 | 0.113 | 0.097 |
| Projected quantum kernel (PQK) | 0.502 | 0.165 | 0.1057 | 0.373 | 0.090 | 0.077 |
| **Hybrid (shipped)** | 0.603 | 0.242 | 0.1029 | 0.361 | 0.177 | 0.151 |

The pre-registered rule ships the hybrid when its log loss is no worse than LR's (paired 95% CI contains 0) and its PR-AUC is not clearly worse (CI upper bound ≥ 0). We used corrected resampled t intervals (Nadeau & Bengio, 2003). The hybrid's log-loss difference from LR is +0.004 [−0.012, +0.020], and its PR-AUC difference is −0.027 [−0.116, +0.062]. Both conditions hold, so the shipped model is **0.7 · LR + 0.3 · PQK**, refitted on all 300 customers (bandwidth 0.1, γ = 1, C = 0.1).

What this shows, stated plainly: on 300 rows with 35 positives, the quantum kernels on their own rank customers barely better than chance, and the blend is statistically level with logistic regression, not better. Logistic regression is the strongest single model here. We report this as a negative result for the quantum classifier. The quantum component stays in the shipped model only because the rule we fixed in advance allows it, and it costs nothing measurable.

**Changes made after the first run, and why.** Every change used training data only, and each earlier table is kept in `results/`.

1. Dropping job, marital, education and default lifted LR's CV ROC-AUC from 0.605 to 0.621. The first-run table is `stage1_cv_summary_ablation_allcats.csv`.
2. The first run used unregularised Platt scaling (C = 1e4). On inner folds with about four positives it became overconfident, and the quantum models' log loss reached 0.55 ± 0.84. Regularising it (C = 1) brought that to 0.367 ± 0.024. That table is `stage1_cv_summary_ablation_unregularised_platt.csv`. The decision rule did not change.

![reliability](figures/stage1_reliability.png)

## Stage 2: choosing six customers

**Problem.** Maximise Σᵢ (pᵢ · depositᵢ − costᵢ) xᵢ over the top 10, subject to Σ xᵢ = 6, Σ costᵢ xᵢ ≤ 25 and Σ capacityᵢ xᵢ ≤ 22.

**Presolve: neither inequality can bind for our candidates.** The six most expensive candidates cost 21 in total, which is within the budget of 25. The six largest capacities add up to 17, which is within 22. So every subset of size six is feasible, and the budget and capacity constraints need no slack qubits and no penalty terms. The solver checks this in `presolve()`. If a different top 10 made either constraint binding, the code adds a bounded slack register and an equality penalty λ(capacity·x + s − 22)², where λ = 1 + Σ|vᵢ|/max|vᵢ| is larger than the whole objective range.

**Cardinality by construction.** We do not add a (Σx − 6)² penalty. The circuit starts in the Dicke state |D⁶₁₀⟩, an equal superposition of all 210 strings with six ones. It is prepared deterministically from CX, CRY and CCRY gates (Bärtschi & Eidenbenz 2019, arXiv:1904.07358), not with `initialize`, so it compiles for hardware. The mixer is exp(−iβ(XX + YY)/2) applied to the edges of a 10-qubit ring in two parity layers, and it preserves Hamming weight. Every sample therefore has exactly six ones. Tests check that the Dicke state is uniform over weight 6, that the mixer conserves weight, and that the RZ/RZZ phase separator matches the QUBO diagonal.

**Cost Hamiltonian.** With vᵢ = pᵢDᵢ − cᵢ scaled by max|v|, the cost is f(x) = −Σ vᵢxᵢ. Substituting xᵢ = (1 − zᵢ)/2 gives hᵢ = vᵢ/2 with no ZZ terms. The phase layer is then one RZ(2γhᵢ) per qubit. The Ising coefficients are in `stage2_selection.json` → `formulation`.

**Optimisation.** We used COBYLA with 4 random starts per depth and INTERP warm starts from depth p to p + 1 (Zhou et al., 2020). Seeds are in `src/atomiq/common.py`.

| Ansatz (ideal statevector) | p | P(feasible) | P(brute-force optimum) | Approx. ratio |
|---|---|---|---|---|
| Dicke state only (uniform guess) | 0 | 1.000 | 0.0048 (= 1/210) | 0.537 |
| Dicke + XY ring QAOA | 1 | 1.000 | 0.0127 | 0.746 |
| Dicke + XY ring QAOA | 2 | 1.000 | 0.0651 | 0.786 |
| **Dicke + XY ring QAOA** | **3** | **1.000** | **0.1573** | **0.817** |
| Penalty QUBO + X mixer (common baseline) | 1 | 0.397 | 0.0007 | 0.437 |
| Penalty QUBO + X mixer | 2 | 0.520 | 0.0150 | 0.683 |

![qaoa depth](figures/stage2_qaoa_depth.png)

At p = 3 the circuit returns the optimum 33 times more often than uniform guessing. The usual penalty formulation wastes about half its shots on invalid strings. We sampled 4,096 shots (seed 5), and the most frequent feasible string, `0111001101`, appeared 679 times. It decodes to the brute-force optimum.

**Decoding and bit order.** Qubit i is the i-th ranked candidate. Qiskit count keys are written with qubit 0 on the right, so `0111001101` reversed is 1,0,1,1,0,0,1,1,1,0. That gives qubits 0, 2, 3, 6, 7 and 8, which are C0031, C0256, C0028, C0338, C0079 and C0088. `tests/test_qaoa.py::test_bit_ordering_round_trip` pins this down.

**Close call.** The runner-up subset scores 6.588, which is 1.2% below the optimum. A model with slightly different probabilities can swap one customer, as the bootstrap below shows.

## Stage 3: chance of at least three conversions

**Circuit.** One qubit per selected customer, in rank order (q0 = C0031 … q5 = C0088), with RY(θᵢ) and θᵢ = 2 arcsin √pᵢ, so P(qubit i reads 1) = pᵢ. There are no entangling gates, because the task assumes customers respond independently. A shot counts as a success when at least three qubits read 1. The angles and counts are in `stage3_simulation.json`.

| Method | Backend | Shots | P(≥3) | \|error\| vs exact |
|---|---|---|---|---|
| Exact Poisson-binomial | classical | | 0.061786 | 0 |
| Statevector | `qiskit.quantum_info` | | 0.061786 | 1e-17 |
| **Finite shots, noiseless (reported)** | `AerSimulator`, seed 7 | 200,000 | **0.061635** | 0.00015 |
| Monte Carlo | numpy, seed 99 | 10⁶ draws | 0.061622 | 0.00016 |
| Noisy, unmitigated | `AerSimulator.from_backend(FakeKingston)` | 20,000 | 0.064500 | 0.00271 |
| Noisy, tensored readout inversion | same + per-qubit assignment matrices | 20,000 | 0.061970 | 0.00018 |
| Noisy, M3 | same + `mthree` 3.0 | 20,000 | 0.062151 | 0.00036 |

![stage 3 estimates](figures/stage3_estimates.png)

## Transpilation and noise

All transpilation used `optimization_level=3` with `seed_transpiler=42`, targeting `FakeKingston`, a snapshot of IBM's 156-qubit Heron r2 processor with a heavy-hex layout.

| Circuit | Logical qubits | Physical qubits | Depth before → after | 1Q gates | 2Q gates (CZ) | SWAPs |
|---|---|---|---|---|---|---|
| Stage 2, Dicke + XY QAOA, p = 1 | 10 | 10 | 395 → 1,268 | 2,082 | 580 | 107 |
| Stage 2, Dicke + XY QAOA, p = 3 | 10 | 10 | 437 → 1,344 | 2,435 | 663 | 119 |
| Stage 3, RY product state | 6 | 6 (10, 60, 23, 151, 21, 148) | 2 → 5 | 24 | 0 | 0 |

Most of the Stage 2 two-qubit gates come from the Dicke preparation, which uses 30 CCRY gates, and from routing a ring onto heavy-hex. Under the FakeKingston noise model at p = 3:

- 38.8% of shots keep Hamming weight 6. Noise leaks the rest out of the subspace.
- Post-selecting on weight 6, a symmetry the ideal circuit guarantees, the optimum appears in 10.2% of kept shots. That is 21 times the uniform rate. Without post-selection the rate is 4.0%, which is 8 times uniform.
- At p = 1 the noisy circuit is close to uniform: 0.79% after post-selection against 0.48% uniform. Depth helps in the ideal case and still helps under this noise model.
- In both noisy runs the best feasible sampled string is still the brute-force optimum.

The Stage 3 circuit has no two-qubit gates, so readout error dominates its noise. Correcting with per-qubit assignment matrices, measured on the same physical qubits, removes 93% of the bias.

**Real hardware.** [`scripts/run_hardware.py`](scripts/run_hardware.py) submits one job to `ibm_kingston` on the IBM Quantum Open Plan. The job holds the Stage 3 circuit, two readout-calibration circuits and the Stage 2 p = 1 circuit, run with dynamical decoupling and gate twirling at 4,000 shots each. It saves raw counts and the job ID to `results/`. `make stage2 stage3` then adds hardware rows to the result files. Not run for this submission: the run needs an IBM Quantum API key, which we did not have during the sprint. All noisy results above therefore come from the FakeKingston noise model.

## Error propagation across stages

We refitted the shipped Stage 1 model on 200 bootstrap resamples of the training set (seed 123) and pushed each replicate through the later stages.

| Source of error in P(≥3) | Size (SD or \|bias\|) |
|---|---|
| Stage 1 model uncertainty, bootstrap | **0.049** |
| Stage 1 model uncertainty, delta method (∂P/∂pᵢ = P(other five have exactly 2) ≈ 0.16 each) | 0.044 |
| Shot noise at 200,000 shots | 0.0005 |
| Shot noise at 20,000 shots | 0.0017 |
| Noise bias, FakeKingston, unmitigated | 0.0027 |
| Residual after readout mitigation | 0.0002 |

![error budget](figures/stage3_error_budget.png)

The delta-method estimate is about 10% below the bootstrap value, which is expected for a first-order approximation at bootstrap band width.

**Selection stability.** We repeated ranking and brute-force selection for each bootstrap replicate. The top 10 never came out exactly the same, and on average 2 of our 6 customers were chosen again (distribution of overlap: 0 in 46 replicates, 1 in 36, 2 in 38, 3 in 41, 4 in 31, 5 in 8). The predicted probabilities for the top 25 customers sit in a narrow band (0.13 to 0.20), so small model changes reorder them. This is the largest weakness in the pipeline. It comes from the data, not from the quantum steps.

## Business reading

- Calling C0031, C0256, C0028, C0338, C0079 and C0088 gives the highest expected net value under our model: 6.67 deposit units at a contact cost of 14 and capacity of 15.
- Three or more subscriptions from six calls has about a 6% chance; the most likely outcome is one subscription (40%). If the campaign target really is three subscribers, six calls are not enough. Going down our ranked list, the chance of three or more reaches 50% at about 17 calls (44% at 15, 55% at 18).
- The ranking is weak (CV ROC-AUC about 0.6). Treat this list as a reasonable first wave and record outcomes, so the next model has more than 35 positives to learn from.
- Neither budget nor capacity is the bottleneck for this candidate pool: 11 of 25 budget and 7 of 22 capacity units remain unused. The limit is the six-call cap.

## Limitations

- The quantum classifiers did not beat logistic regression on this data, and we do not claim they did.
- Stage 2 could be solved by sorting once we had shown the constraints were redundant. QAOA is the method the task asks for, and here we use it to show how a constraint-preserving ansatz behaves, ideal and noisy. It is not presented as a better solver.
- All Stage 3 estimates except the hardware run come from simulators. FakeKingston is a calibration snapshot, not the live device.
- The hidden test labels are unknown to us, so every Stage 1 metric above is cross-validated on the training set.
- Bootstrapping 300 rows understates uncertainty from data the sample doesn't cover.

## Reproduce

Requires Python 3.12 (3.11 works). On a laptop the full run takes about 6 minutes.

```bash
git clone REPO_URL && cd atomiq
make setup        # creates .venv and installs the pinned requirements.txt
make all          # stage1 → stage2 → stage3 → tests → submission check
python scripts/make_deck.py   # rebuilds presentation/deck.pdf from the result files
```

Without `make`:

```bash
python3.12 -m venv .venv && .venv/bin/pip install -r requirements.txt
PYTHONPATH=src .venv/bin/python -m atomiq.stage1
PYTHONPATH=src .venv/bin/python -m atomiq.stage2
PYTHONPATH=src .venv/bin/python -m atomiq.stage3
PYTHONPATH=src .venv/bin/python -m pytest -q
.venv/bin/python scripts/check_submission.py
```

The dataset `data/raw/bank_campaign_participant_release.xlsx` is the organisers' release, included unchanged so the run needs no download. Optional hardware run: `export IBM_QUANTUM_TOKEN=…` then `make hardware stage2 stage3 check`.

**Seeds.** Every seed is listed in `src/atomiq/common.py` → `SEEDS`:

| Seed | Value |
|---|---|
| CV outer | 2026 |
| CV inner | 11 |
| Model | 0 |
| Bootstrap | 123 |
| QAOA starts | 31 |
| QAOA sampling | 5 |
| Transpiler | 42 |
| Aer ideal | 7 |
| Aer noisy | 8 |
| Monte Carlo | 99 |

Stage 1 sampling and the split seed are 42 (organisers').

**Environment.** Python 3.12.16, qiskit 2.6.2, qiskit-aer 0.18.2, qiskit-ibm-runtime 0.52.0, qiskit-machine-learning 0.9.1, mthree 3.0.0, scikit-learn 1.9.1, numpy 2.5.4. Pinned in `requirements.txt`.

## Repository map

```
stage1_predictions.csv        100 test customers: customer_id, predicted_probability, rank, is_top_10
stage2_selection.csv/.json    10 candidates, 6 selected, QUBO/Ising, QAOA params, counts, brute force, gap, noise runs
stage3_simulation.csv/.json   qubit map, probabilities, angles, counts, all estimates, errors, error budget
PREREGISTRATION.md            Stage 1 decision rule, committed before fitting
src/atomiq/
  common.py                   paths, constants, seeds, data loading, ranking with tie-break
  quantum_kernels.py          exact ZZ feature-map states, fidelity and projected kernels
  stage1.py                   nested CV, models, decision rule, final fit, bootstrap, figures
  qaoa.py                     Dicke preparation, XY ring mixer, QUBO→Ising, QAOA circuit, bit-order helpers
  stage2.py                   presolve, brute force, QAOA depth sweep, penalty baseline, transpile + noisy runs
  stage3.py                   encoding circuit, exact/Monte Carlo/Aer/noisy/mitigated estimates, error budget
scripts/
  check_submission.py         25 consistency checks across the three stages
  run_hardware.py             optional real-QPU job (ibm_kingston)
  make_deck.py                builds presentation/deck.pdf from the result files
tests/                        statevector equivalence, Dicke state, mixer, phase separator, bit order
results/                      CV tables, ablations, bootstrap probabilities, hardware outputs
figures/                      all plots in this README
```

## References

- Havlíček et al., *Supervised learning with quantum-enhanced feature spaces*, Nature 567 (2019).
- Huang et al., *Power of data in quantum machine learning*, Nature Communications 12 (2021). Projected kernels.
- Shaydulin & Wild, *Importance of kernel bandwidth in quantum machine learning*, Phys. Rev. A 106 (2022), arXiv:2111.05451.
- Bärtschi & Eidenbenz, *Deterministic preparation of Dicke states*, FCT 2019, arXiv:1904.07358.
- Hadfield et al., *From the quantum approximate optimization algorithm to a quantum alternating operator ansatz*, Algorithms 12 (2019). XY mixers.
- Zhou et al., *Quantum approximate optimization algorithm: performance, mechanism, and implementation on near-term devices*, PRX 10 (2020). INTERP.
- Nadeau & Bengio, *Inference for the generalization error*, Machine Learning 52 (2003).
- Nation et al., *Scalable mitigation of measurement errors on quantum computers*, PRX Quantum 2 (2021). M3.

MIT licence. Dataset: organisers' release derived from the UCI Bank Marketing data (Moro et al., 2014).
