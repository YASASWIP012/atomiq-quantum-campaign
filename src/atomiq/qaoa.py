"""Constraint-preserving QAOA building blocks.

- dicke_state(n, k): deterministic gate-level preparation of the Dicke state |D^n_k>
  (Baertschi & Eidenbenz, "Deterministic preparation of Dicke states", FCT 2019,
  arXiv:1904.07358). Uses CX, CRY and CCRY only, so it can be transpiled for hardware
  (unlike `initialize`).
- xy_ring_mixer: exp(-i beta (XX+YY)/2) on ring edges, applied in two parity layers.
  It conserves Hamming weight, so every state stays inside the exactly-K subspace.
- qubo_to_ising / phase_separator: exact diagonal cost unitary built from RZ and RZZ.
"""
from __future__ import annotations

import itertools

import numpy as np
from qiskit import QuantumCircuit
from qiskit.circuit import ParameterVector
from qiskit.circuit.library import RYGate, XXPlusYYGate


def _scs(qc: QuantumCircuit, qubits: list[int], n: int, k: int) -> None:
    """Split & Cyclic Shift unitary SCS_{n,k} on the first n entries of `qubits` (paper's 1..n)."""
    q = lambda i: qubits[i - 1]  # 1-indexed like the paper
    # two-qubit block on (n-1, n)
    qc.cx(q(n - 1), q(n))
    qc.cry(2 * np.arccos(np.sqrt(1 / n)), q(n), q(n - 1))
    qc.cx(q(n - 1), q(n))
    # three-qubit blocks on (n-l, n-l+1, n) for l = 2..k
    for l in range(2, k + 1):
        qc.cx(q(n - l), q(n))
        ccry = RYGate(2 * np.arccos(np.sqrt(l / n))).control(2, annotated=False)
        qc.append(ccry, [q(n), q(n - l + 1), q(n - l)])
        qc.cx(q(n - l), q(n))


def dicke_state(n: int, k: int) -> QuantumCircuit:
    """Prepare (1/sqrt(C(n,k))) * sum_{|x|=k} |x> on n qubits."""
    qc = QuantumCircuit(n, name=f"Dicke({n},{k})")
    order = list(range(n))  # paper qubit i -> circuit qubit i-1
    for i in range(n - k, n):
        qc.x(order[i])
    for m in range(n, k, -1):
        _scs(qc, order, m, k)
    for m in range(k, 1, -1):
        _scs(qc, order, m, m - 1)
    return qc


def ring_edges(n: int) -> tuple[list, list]:
    even = [(i, (i + 1) % n) for i in range(0, n, 2)]
    odd = [(i, (i + 1) % n) for i in range(1, n, 2)]
    if n % 2 == 1:  # odd ring: last edge (n-1,0) collides with (0,1); give it its own layer
        odd = [e for e in odd if e != (n - 1, 0)]
        return even, odd + [(n - 1, 0)]
    return even, odd


def xy_ring_mixer(qc: QuantumCircuit, qubits: list[int], beta) -> None:
    even, odd = ring_edges(len(qubits))
    for layer in (even, odd):
        for a, b in layer:
            qc.append(XXPlusYYGate(2 * beta), [qubits[a], qubits[b]])


def qubo_to_ising(Q: np.ndarray, c: np.ndarray, const: float = 0.0):
    """f(b) = b^T Q b + c^T b + const with b in {0,1}^n and Q upper-triangular-free symmetric
    handling. Returns (h, J, offset) with f = offset + sum h_i z_i + sum_{i<j} J_ij z_i z_j, b = (1-z)/2."""
    n = len(c)
    Qs = (Q + Q.T) / 2
    lin = c + np.diag(Qs)
    np.fill_diagonal(Qs, 0.0)
    offset = const + lin.sum() / 2 + Qs.sum() / 4
    h = -lin / 2 - Qs.sum(axis=1) / 2
    J = {}
    for i, j in itertools.combinations(range(n), 2):
        if abs(Qs[i, j]) > 1e-12:
            J[(i, j)] = Qs[i, j] / 2  # both (i,j) and (j,i) contribute Qs/4 each
    return h, J, offset


def phase_separator(qc: QuantumCircuit, h, J, gamma) -> None:
    """exp(-i gamma (sum h_i Z_i + sum J_ij Z_i Z_j)) up to global phase."""
    for i, hi in enumerate(h):
        if abs(hi) > 1e-12:
            qc.rz(2 * gamma * hi, i)
    for (i, j), Jij in J.items():
        qc.rzz(2 * gamma * Jij, i, j)


def qaoa_circuit(n_dec: int, k: int, n_slack: int, h, J, p: int, mixer: str = "xy") -> QuantumCircuit:
    """Parameterised QAOA ansatz. mixer='xy': Dicke start + XY ring on decision qubits.
    mixer='x': standard |+> start + RX mixer everywhere (penalty baseline)."""
    n = n_dec + n_slack
    g, b = ParameterVector("gamma", p), ParameterVector("beta", p)
    qc = QuantumCircuit(n)
    if mixer == "xy":
        qc.compose(dicke_state(n_dec, k), qubits=range(n_dec), inplace=True)
        if n_slack:
            qc.h(range(n_dec, n))
    else:
        qc.h(range(n))
    for layer in range(p):
        phase_separator(qc, h, J, g[layer])
        if mixer == "xy":
            xy_ring_mixer(qc, list(range(n_dec)), b[layer])
            for s in range(n_dec, n):
                qc.rx(2 * b[layer], s)
        else:
            for qb in range(n):
                qc.rx(2 * b[layer], qb)
    return qc


def bits_of_index(idx: np.ndarray, n: int) -> np.ndarray:
    """Qiskit little-endian: bit q of the basis index is qubit q."""
    return ((np.asarray(idx)[:, None] >> np.arange(n)[None, :]) & 1).astype(int)


def bitstring_to_bits(key: str) -> np.ndarray:
    """Qiskit count key (big-endian string) -> array indexed by qubit."""
    return np.array([int(ch) for ch in key[::-1]])
