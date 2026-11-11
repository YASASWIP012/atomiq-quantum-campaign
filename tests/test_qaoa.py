import itertools
from math import comb

import numpy as np
from qiskit.quantum_info import Statevector

from atomiq.qaoa import (bits_of_index, bitstring_to_bits, dicke_state, phase_separator, qaoa_circuit,
                         qubo_to_ising)
from qiskit import QuantumCircuit


def test_dicke_state_is_uniform_over_weight_k():
    for n, k in [(4, 2), (6, 3), (10, 6)]:
        sv = Statevector(dicke_state(n, k)).data
        w = bits_of_index(np.arange(2**n), n).sum(1)
        assert np.allclose(np.abs(sv[w != k]), 0, atol=1e-9)
        assert np.allclose(np.abs(sv[w == k]) ** 2, 1 / comb(n, k), atol=1e-9)


def test_xy_mixer_conserves_hamming_weight():
    rng = np.random.default_rng(3)
    h, J = rng.normal(size=6), {(0, 1): 0.7, (2, 5): -0.4, (1, 3): 0.2}
    qc = qaoa_circuit(6, 3, 0, h, J, p=2, mixer="xy")
    qc = qc.assign_parameters(rng.uniform(0, 3, qc.num_parameters))
    sv = Statevector(qc).data
    w = bits_of_index(np.arange(64), 6).sum(1)
    assert np.isclose((np.abs(sv[w == 3]) ** 2).sum(), 1.0)


def test_phase_separator_matches_qubo_diagonal():
    rng = np.random.default_rng(4)
    n = 4
    Q = rng.normal(size=(n, n))
    c = rng.normal(size=n)
    h, J, off = qubo_to_ising(Q, c, 1.3)
    b = bits_of_index(np.arange(2**n), n)
    f = np.einsum("ki,ij,kj->k", b, Q, b) + b @ c + 1.3
    z = 1 - 2 * b
    ising = off + z @ h + sum(Jij * z[:, i] * z[:, j] for (i, j), Jij in J.items())
    assert np.allclose(f, ising)
    gamma = 0.37
    qc = QuantumCircuit(n)
    qc.h(range(n))
    phase_separator(qc, h, J, gamma)
    sv = Statevector(qc).data
    expected = np.exp(-1j * gamma * (ising - off)) / np.sqrt(2**n)
    ratio = sv / expected
    assert np.allclose(ratio, ratio[0])


def test_bit_ordering_round_trip():
    # qubit 0 = first candidate. Count key "0000000011" means qubits 0 and 1 are 1.
    bits = bitstring_to_bits("0000000011")
    assert bits.tolist() == [1, 1, 0, 0, 0, 0, 0, 0, 0, 0]
    assert bits_of_index(np.array([3]), 10)[0].tolist() == bits.tolist()
