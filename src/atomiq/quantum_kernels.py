"""Fast exact statevectors for the ZZ feature map, plus fidelity and projected kernels.

The ZZ feature map (Havlicek et al. 2019, as in qiskit.circuit.library.zz_feature_map) is
H^n followed by a diagonal phase, repeated `reps` times. Because each layer is a Hadamard wall
followed by a diagonal, it can be simulated exactly by vectorised numpy over all samples at
once. tests/test_kernels.py checks the result against qiskit.quantum_info.Statevector.
"""
from __future__ import annotations

import numpy as np
from qiskit.circuit.library import zz_feature_map


def _bits(n: int) -> np.ndarray:
    idx = np.arange(2**n)
    return ((idx[:, None] >> np.arange(n)[None, :]) & 1).astype(float)  # little-endian, column i = qubit i


def _linear_pairs(n: int) -> list[tuple[int, int]]:
    return [(i, i + 1) for i in range(n - 1)]


def zz_phases(x: np.ndarray, pairs: list[tuple[int, int]]) -> np.ndarray:
    """Diagonal phase angle for every basis state, for each sample. Shape (N, 2^n)."""
    n = x.shape[1]
    b = _bits(n)
    phase = 2.0 * x @ b.T  # P(2 x_i) on each qubit
    for i, j in pairs:
        parity = (b[:, i] != b[:, j]).astype(float)
        phase += 2.0 * np.outer((np.pi - x[:, i]) * (np.pi - x[:, j]), parity)
    return phase


def zz_statevectors(x: np.ndarray, reps: int = 2, entanglement: str = "linear") -> np.ndarray:
    n = x.shape[1]
    if entanglement != "linear":
        raise ValueError("only linear entanglement is implemented")
    h1 = np.array([[1, 1], [1, -1]]) / np.sqrt(2)
    hn = h1
    for _ in range(n - 1):
        hn = np.kron(hn, h1)
    diag = np.exp(1j * zz_phases(x, _linear_pairs(n)))
    psi = np.zeros((x.shape[0], 2**n), dtype=complex)
    psi[:, 0] = 1.0
    for _ in range(reps):
        psi = psi @ hn.T
        psi = psi * diag
    return psi


def reference_circuit(n: int, reps: int = 2):
    """The Qiskit circuit these statevectors reproduce (used in tests and the README)."""
    return zz_feature_map(n, reps=reps, entanglement="linear")


def fidelity_kernel(sa: np.ndarray, sb: np.ndarray) -> np.ndarray:
    return np.abs(sa.conj() @ sb.T) ** 2


def pauli_features(psi: np.ndarray) -> np.ndarray:
    """Single-qubit <X>, <Y>, <Z> for every qubit: the projected (1-RDM) representation."""
    dim = psi.shape[1]
    n = int(np.log2(dim))
    idx = np.arange(dim)
    feats = []
    for q in range(n):
        m = 1 << q
        flip = idx ^ m
        bit = (idx >> q) & 1
        prob = np.abs(psi) ** 2
        z = prob @ (1 - 2 * bit)
        x = np.real(np.sum(psi.conj() * psi[:, flip], axis=1))
        y = np.real(np.sum(psi.conj() * (1j * (2 * bit - 1))[None, :] * psi[:, flip], axis=1))
        feats += [x, y, z]
    return np.stack(feats, axis=1)


def projected_kernel(fa: np.ndarray, fb: np.ndarray, gamma: float) -> np.ndarray:
    d2 = (fa**2).sum(1)[:, None] + (fb**2).sum(1)[None, :] - 2 * fa @ fb.T
    return np.exp(-gamma * np.maximum(d2, 0.0))
