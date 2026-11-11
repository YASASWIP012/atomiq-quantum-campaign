import itertools

import numpy as np
import pandas as pd
import pytest

from atomiq.common import rank_with_tiebreak
from atomiq.qaoa import bits_of_index
from atomiq.stage2 import _slack_weights, brute_force, build_qubo, diag_cost, presolve
from atomiq.stage3 import gradient, p_at_least, poisson_binomial, tensored_mitigate


def toy_candidates(seed=0):
    rng = np.random.default_rng(seed)
    c = pd.DataFrame({
        "customer_id": [f"T{i:02d}" for i in range(10)],
        "predicted_probability": rng.uniform(0.05, 0.4, 10),
        "expected_deposit_value": rng.integers(12, 31, 10),
        "contact_cost": rng.integers(1, 5, 10),
        "capacity_units": rng.integers(1, 5, 10),
    })
    c["expected_net_value"] = c.predicted_probability * c.expected_deposit_value - c.contact_cost
    return c


def test_tie_break_lower_customer_id_first():
    df = rank_with_tiebreak(pd.Series(["C0009", "C0002", "C0005"]), np.array([0.3, 0.3, 0.5]))
    assert df.customer_id.tolist() == ["C0005", "C0002", "C0009"]


@pytest.mark.parametrize("rng", [0, 1, 2, 3, 5, 9, 12, 15])
def test_slack_encoding_spans_exactly_zero_to_range(rng):
    w = _slack_weights(rng)
    assert (w > 0).all()
    values = {int(np.dot(bits, w)) for bits in itertools.product([0, 1], repeat=len(w))} if len(w) else {0}
    assert values == set(range(rng + 1))


def test_presolve_redundancy_is_sound():
    c = toy_candidates(1)
    for B, H in [(25, 22), (14, 13), (18, 30)]:
        pre = presolve(c, B, H)
        for combo in itertools.combinations(range(10), 6):
            idx = list(combo)
            if pre["budget_redundant"]:
                assert c.contact_cost.values[idx].sum() <= B
            if pre["capacity_redundant"]:
                assert c.capacity_units.values[idx].sum() <= H


@pytest.mark.parametrize("slackB,slackH", [(99, 99), (3, 2), (1, 4), (4, 3)])
def test_qubo_ground_state_is_brute_force_optimum(slackB, slackH):
    c = toy_candidates(2)
    base = presolve(c, 99, 99)
    B, H = base["min_budget_any_6"] + slackB, base["min_capacity_any_6"] + slackH
    bf = brute_force(c, B, H)
    q = build_qubo(c, presolve(c, B, H), cardinality_penalty=True)
    n = q["n_dec"] + q["n_slack"]
    f = diag_cost(q)
    best = bits_of_index(np.array([np.argmin(f)]), n)[0][:10]
    assert np.array_equal(best, bf["x"])


def test_poisson_binomial_matches_enumeration():
    p = np.array([0.2, 0.15, 0.31, 0.05, 0.4, 0.17])
    enum = 0.0
    for bits in itertools.product([0, 1], repeat=6):
        b = np.array(bits)
        if b.sum() >= 3:
            enum += np.prod(np.where(b == 1, p, 1 - p))
    assert abs(p_at_least(p) - enum) < 1e-14
    assert abs(poisson_binomial(p).sum() - 1) < 1e-14


def test_gradient_matches_finite_difference():
    p = np.array([0.2, 0.15, 0.31, 0.05, 0.4, 0.17])
    g = gradient(p)
    eps = 1e-6
    for i in range(6):
        d = np.zeros(6)
        d[i] = eps
        assert abs((p_at_least(p + d) - p_at_least(p - d)) / (2 * eps) - g[i]) < 1e-8


def test_tensored_readout_inversion_recovers_true_distribution():
    rng = np.random.default_rng(3)
    n = 3
    true = rng.dirichlet(np.ones(2**n))
    mats = [np.array([[0.97, 0.05], [0.03, 0.95]]), np.array([[0.99, 0.02], [0.01, 0.98]]),
            np.array([[0.95, 0.04], [0.05, 0.96]])]
    full = mats[2]
    for m in (mats[1], mats[0]):
        full = np.kron(full, m)  # index = q2 q1 q0 (big-endian kron order matches integer bit order)
    observed = full @ true
    counts = {format(i, f"0{n}b"): observed[i] * 1e6 for i in range(2**n)}
    rec = tensored_mitigate(counts, mats)
    assert np.allclose(rec, true, atol=1e-9)


def test_pca_sign_convention_is_pinned():
    # The ZZ feature map is not sign-symmetric, so PCA signs must not depend on the LAPACK build.
    from atomiq.common import load_stage1
    from atomiq.stage1 import QFeatures

    train, _ = load_stage1()
    comps = QFeatures.fit(train.drop(columns="y")).pca.components_
    assert all(r[np.abs(r).argmax()] > 0 for r in comps)
