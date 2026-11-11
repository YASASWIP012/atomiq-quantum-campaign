"""Print numeric fingerprints of each Stage 1 step for outer fold 0 (cross-platform debugging)."""
import sys
from pathlib import Path

import numpy as np
from sklearn.model_selection import RepeatedStratifiedKFold, StratifiedKFold
from sklearn.svm import SVC
from sklearn.metrics import average_precision_score

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from atomiq import stage1 as s  # noqa: E402
from atomiq.common import SEEDS, load_stage1  # noqa: E402
import sklearn, scipy  # noqa: E402

print("versions", np.__version__, scipy.__version__, sklearn.__version__)
np.show_config() if "--blas" in sys.argv else None
tr, _ = load_stage1()
y = tr.y.values
X = tr.drop(columns="y")
a, b = next(iter(RepeatedStratifiedKFold(n_splits=5, n_repeats=10, random_state=SEEDS["cv_outer"]).split(X, y)))
dtr, ytr = X.iloc[a], y[a]
qf = s.QFeatures.fit(dtr)
z = qf.pre.transform(dtr)
print("pre", z.shape, round(float(z.sum()), 8), round(float(np.abs(z).sum()), 8))
print("pca_comp_first_row", np.round(qf.pca.components_[0][:6], 8))
print("pca_skew_signs", [int(np.sign(c)) for c in ((qf.pca.transform(z))**3).sum(0)])
print("pca_comp_abs", np.round(np.abs(qf.pca.components_).sum(1), 8))
ang = qf.angles(dtr)
print("angles_row0", np.round(ang[0], 8))
print("angles_colsum", np.round(ang.sum(0), 6))
st = s.states(ang, 0.4)
K = s.fidelity_kernel(st, st)
print("K(0.4) sum", round(float(K.sum()), 8), "K[0,1]", round(float(K[0, 1]), 10))
skf = StratifiedKFold(3, shuffle=True, random_state=SEEDS["cv_inner"])
for cfg in [("QK", 0.4, None, 0.1), ("QK", 0.4, None, 1.0), ("QK", 0.4, None, 10.0)]:
    sc = []
    for ia, ib in skf.split(dtr, ytr):
        q2 = s.QFeatures.fit(dtr.iloc[ia])
        sa, sb = s.states(q2.angles(dtr.iloc[ia]), cfg[1]), s.states(q2.angles(dtr.iloc[ib]), cfg[1])
        m = SVC(kernel="precomputed", C=cfg[3], class_weight="balanced").fit(s.fidelity_kernel(sa, sa), ytr[ia])
        sc.append(average_precision_score(ytr[ib], m.decision_function(s.fidelity_kernel(sb, sa))))
    print("inner", cfg, np.round(sc, 8))
