import numpy as np
from qiskit.quantum_info import Statevector

from atomiq.qaoa import bits_of_index, qaoa_circuit, qubo_to_ising
from atomiq.qaoa_fast import FastQAOA


def _random_qubo(n, seed):
    rng = np.random.default_rng(seed)
    Q = rng.normal(size=(n, n))
    c = rng.normal(size=n)
    b = bits_of_index(np.arange(2**n), n)
    f = np.einsum("ki,ij,kj->k", b, Q, b) + b @ c
    return Q, c, f


def _same_up_to_phase(a, b):
    return abs(abs(np.vdot(a, b)) - 1) < 1e-9


def test_fast_xy_matches_qiskit_circuit_with_slack():
    n_dec, k, n_slack = 6, 3, 2
    Q, c, f = _random_qubo(n_dec + n_slack, 0)
    h, J, _ = qubo_to_ising(Q, c)
    theta = np.array([0.3, 1.1, 0.7, -0.4])  # beta1, beta2, gamma1, gamma2
    qc = qaoa_circuit(n_dec, k, n_slack, h, J, p=2, mixer="xy")
    ref = Statevector(qc.assign_parameters(dict(zip(qc.parameters, theta)))).data
    fast = FastQAOA(f, n_dec, k, n_slack, mixer="xy").state(theta)
    assert _same_up_to_phase(ref, fast)


def test_fast_x_mixer_matches_qiskit_circuit():
    Q, c, f = _random_qubo(5, 1)
    h, J, _ = qubo_to_ising(Q, c)
    theta = np.array([0.9, 0.2])
    qc = qaoa_circuit(5, 0, 0, h, J, p=1, mixer="x")
    ref = Statevector(qc.assign_parameters(dict(zip(qc.parameters, theta)))).data
    fast = FastQAOA(f, 5, 0, 0, mixer="x").state(theta)
    assert _same_up_to_phase(ref, fast)
