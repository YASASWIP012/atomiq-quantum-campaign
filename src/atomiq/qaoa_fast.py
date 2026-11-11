"""Exact vectorised simulation of the QAOA circuits in qaoa.py, for the optimiser loop.

Same maths as the Qiskit circuit (tests/test_qaoa_fast.py checks the statevectors agree):
- cost layer: psi <- exp(-i gamma f(x)) psi, with f the QUBO diagonal (equal to the RZ/RZZ
  phase separator up to a global phase);
- XY gate exp(-i beta (XX+YY)/2) on (a, b): rotates |01> <-> |10> by beta;
- RX(2 beta) on slack qubits: psi <- cos(beta) psi - i sin(beta) psi[flip].
"""
from __future__ import annotations

import numpy as np
from qiskit.quantum_info import Statevector

from .qaoa import dicke_state, ring_edges


class FastQAOA:
    def __init__(self, f: np.ndarray, n_dec: int, k: int, n_slack: int, mixer: str = "xy"):
        self.f, self.n_dec, self.n_slack, self.mixer = f, n_dec, n_slack, mixer
        n = n_dec + n_slack
        self.n = n
        idx = np.arange(2**n)
        if mixer == "xy":
            dec = Statevector(dicke_state(n_dec, k)).data
            slack = np.full(2**n_slack, 2 ** (-n_slack / 2)) if n_slack else np.array([1.0])
            self.psi0 = np.kron(slack, dec)  # little-endian: decision qubits are the low bits
            even, odd = ring_edges(n_dec)
            self.layers = []
            for layer in (even, odd):
                pairs = []
                for a, b in layer:
                    ma, mb = 1 << a, 1 << b
                    sel = idx[((idx & ma) == 0) & ((idx & mb) != 0)]  # |..0_a..1_b..>
                    pairs.append((sel, sel ^ ma ^ mb))
                self.layers.append(pairs)
            self.x_qubits = list(range(n_dec, n))
        else:
            self.psi0 = np.full(2**n, 2 ** (-n / 2), dtype=complex)
            self.layers = []
            self.x_qubits = list(range(n))
        self.flips = [idx ^ (1 << q) for q in self.x_qubits]

    def state(self, theta: np.ndarray) -> np.ndarray:
        p = len(theta) // 2
        beta, gamma = theta[:p], theta[p:]
        psi = self.psi0.astype(complex).copy()
        for layer in range(p):
            psi *= np.exp(-1j * gamma[layer] * self.f)
            c, s = np.cos(beta[layer]), np.sin(beta[layer])
            for pairs in self.layers:
                for a_idx, b_idx in pairs:
                    pa, pb = psi[a_idx].copy(), psi[b_idx].copy()
                    psi[a_idx] = c * pa - 1j * s * pb
                    psi[b_idx] = c * pb - 1j * s * pa
            for flip in self.flips:
                psi = c * psi - 1j * s * psi[flip]
        return psi

    def probs(self, theta) -> np.ndarray:
        return np.abs(self.state(theta)) ** 2

    def energy(self, theta) -> float:
        return float(self.probs(theta) @ self.f)
