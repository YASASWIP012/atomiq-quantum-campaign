# Pre-registered analysis plan

This file was committed before any model was fitted. The commit timestamp is the record.

## Stage 1 model choice

- Evaluation uses 10 × repeated stratified 5-fold cross-validation on the 300 training customers only (seed 2026). Hyperparameters are tuned in an inner 3-fold loop inside every outer training fold.
- All preprocessing is fitted inside each training fold: one-hot encoding, scaling and the PCA projection used by the quantum feature maps. The same applies to Platt calibration.
- The test set is predicted exactly once, by the shipped model, after this rule has been applied.
- The candidates are:
  - a constant prior;
  - logistic regression (LR);
  - histogram gradient boosting;
  - a bandwidth-tuned quantum fidelity kernel SVC (QK);
  - a projected quantum kernel SVC (PQK);
  - a hybrid, which is a convex blend `w * p_quantum + (1 - w) * p_LR` with `w` tuned in the inner loop by log loss.
- Rule: ship the hybrid if both of these hold, computed paired across the 50 outer folds:
  - the mean log loss of hybrid minus LR is ≤ 0, or its 95% CI contains 0;
  - the mean PR-AUC difference has a 95% CI upper bound ≥ 0.
  
  Otherwise ship LR, and report the quantum models as a negative result.
- Every candidate is reported, including the ones that lose.

## Stage 2

- The final selection is the highest-objective feasible bitstring among the QAOA samples. It is checked against brute force over all C(10,6) = 210 subsets.
- If no sampled bitstring is feasible, we report that, and the selection falls back to the brute-force optimum, labelled as classical.

## Stage 3

- The reported quantum estimate is the finite-shot ideal simulation (200,000 shots, seed 7). The exact Poisson-binomial value, Monte Carlo, the noisy simulation and the mitigated results are reported next to it, not instead of it.
