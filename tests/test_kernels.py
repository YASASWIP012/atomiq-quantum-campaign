import numpy as np
from qiskit.quantum_info import SparsePauliOp, Statevector

from atomiq.quantum_kernels import pauli_features, reference_circuit, zz_statevectors


def test_statevectors_match_qiskit_zz_feature_map():
    rng = np.random.default_rng(0)
    x = rng.normal(size=(5, 4))
    ours = zz_statevectors(x, reps=2)
    qc = reference_circuit(4, reps=2)
    for row, psi in zip(x, ours):
        ref = Statevector(qc.assign_parameters(row)).data
        assert abs(abs(np.vdot(ref, psi)) - 1) < 1e-10  # equal up to global phase


def test_pauli_features_match_qiskit_expectations():
    rng = np.random.default_rng(1)
    psi = zz_statevectors(rng.normal(size=(2, 3)), reps=2)
    f = pauli_features(psi)
    for k, vec in enumerate(psi):
        sv = Statevector(vec)
        for q in range(3):
            for j, p in enumerate("XYZ"):
                label = ["I"] * 3
                label[2 - q] = p  # Qiskit labels are big-endian strings
                ev = sv.expectation_value(SparsePauliOp("".join(label))).real
                assert abs(ev - f[k, 3 * q + j]) < 1e-10
