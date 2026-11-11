"""Stage 1: classical baselines, quantum kernels, a hybrid blend, and the pre-registered choice.

Run: python -m atomiq.stage1
Writes stage1_predictions.csv (repo root), results/stage1_*.{csv,json}, figures/stage1_*.png
"""
from __future__ import annotations

import time
from dataclasses import dataclass

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
import pandas as pd
from scipy import stats
from sklearn.compose import ColumnTransformer
from sklearn.decomposition import PCA
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import average_precision_score, brier_score_loss, log_loss, roc_auc_score
from sklearn.model_selection import RepeatedStratifiedKFold, StratifiedKFold
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import FunctionTransformer, OneHotEncoder, StandardScaler
from sklearn.svm import SVC

from .common import FIGURES, RESULTS, ROOT, SEEDS, dump_json, load_stage1, rank_with_tiebreak
from .quantum_kernels import fidelity_kernel, pauli_features, projected_kernel, zz_statevectors

NUM = ["age", "balance", "day", "campaign", "pdays", "previous"]
# Compact categorical set chosen by train-only repeated CV (ablation with all 9 categoricals:
# results/stage1_cv_summary_ablation_allcats.csv). job/marital/education/default added noise.
CAT = ["month", "poutcome", "contact", "housing", "loan"]
N_QUBITS = 6
LR_C = [0.03, 0.1, 0.3, 1.0, 3.0]
SVC_C = [0.1, 1.0, 10.0]
QK_BW = [0.05, 0.1, 0.2, 0.4, 0.8, 1.6]
PQK_BW = [0.1, 0.3, 1.0]
PQK_GAMMA = [0.1, 1.0]
EPS = 1e-6
# Tuning scores are rounded before comparison so that exact ties (common: several C values give
# identical rankings) break the same way on every platform, always to the first grid entry.
# Without this, last-bit BLAS differences between macOS and Linux picked different models.
TIE_DECIMALS = 6


def _num_transform(df: pd.DataFrame) -> np.ndarray:
    out = df[NUM].astype(float).copy()
    out["balance"] = np.sign(out["balance"]) * np.log1p(np.abs(out["balance"]))
    out["campaign"] = np.log1p(out["campaign"])
    out["contacted_before"] = (df["pdays"] >= 0).astype(float)
    out["pdays"] = np.log1p(out["pdays"].clip(lower=0))
    out["previous"] = np.log1p(out["previous"])
    return out.values


def make_preprocessor() -> ColumnTransformer:
    return ColumnTransformer(
        [
            ("num", Pipeline([("f", FunctionTransformer(_num_transform)), ("s", StandardScaler())]), NUM),
            ("cat", OneHotEncoder(handle_unknown="ignore", sparse_output=False), CAT),
        ]
    )


# ---------------------------------------------------------------- quantum feature pipeline
@dataclass
class QFeatures:
    """Train-fold-fitted map: preprocess -> PCA(6) -> standardise -> angles."""

    pre: ColumnTransformer
    pca: PCA
    scale: StandardScaler

    @classmethod
    def fit(cls, df: pd.DataFrame) -> "QFeatures":
        pre = make_preprocessor().fit(df)
        z = pre.transform(df)
        pca = PCA(n_components=N_QUBITS, random_state=SEEDS["model"]).fit(z)
        # PCA components are defined only up to sign, and LAPACK builds disagree (macOS vs Linux
        # flipped component 6). The ZZ feature map is not sign-symmetric, so pin the convention:
        # the largest-magnitude loading of every component is positive.
        flip = np.sign(pca.components_[np.arange(N_QUBITS), np.abs(pca.components_).argmax(1)])
        pca.components_ *= flip[:, None]
        scale = StandardScaler().fit(pca.transform(z))
        return cls(pre, pca, scale)

    def angles(self, df: pd.DataFrame) -> np.ndarray:
        return self.scale.transform(self.pca.transform(self.pre.transform(df)))


def states(angles: np.ndarray, bw: float) -> np.ndarray:
    return zz_statevectors(bw * angles, reps=2)


def kernel_matrix(cfg: tuple, sa: np.ndarray, sb: np.ndarray, fa=None, fb=None) -> np.ndarray:
    kind = cfg[0]
    if kind == "QK":
        return fidelity_kernel(sa, sb)
    return projected_kernel(fa, fb, gamma=cfg[2])


def svc_platt(ktr: np.ndarray, ytr: np.ndarray, kte: np.ndarray, C: float) -> np.ndarray:
    """SVC on a precomputed kernel; Platt scaling fitted on out-of-fold decision values."""
    oof = np.zeros(len(ytr))
    skf = StratifiedKFold(3, shuffle=True, random_state=SEEDS["cv_inner"])
    for a, b in skf.split(ktr, ytr):
        m = SVC(kernel="precomputed", C=C, class_weight="balanced").fit(ktr[np.ix_(a, a)], ytr[a])
        oof[b] = m.decision_function(ktr[np.ix_(b, a)])
    # Regularised Platt (C=1): an unregularised fit (C=1e4, first run) became overconfident on
    # inner folds with ~4 positives and blew up log loss. Decision rule unchanged.
    platt = LogisticRegression(C=1.0).fit(oof[:, None], ytr)
    m = SVC(kernel="precomputed", C=C, class_weight="balanced").fit(ktr, ytr)
    return platt.predict_proba(m.decision_function(kte)[:, None])[:, 1]


def quantum_grid(family: str) -> list[tuple]:
    if family == "QK":
        return [("QK", bw, None, C) for bw in QK_BW for C in SVC_C]
    return [("PQK", bw, g, C) for bw in PQK_BW for g in PQK_GAMMA for C in SVC_C[:2]]


class QuantumModel:
    """Tunes (feature-map bandwidth, kernel, C) by inner-CV PR-AUC, then SVC + Platt."""

    def __init__(self, families=("QK", "PQK")):
        self.families = families
        self.cfg = None

    def _cache(self, ang):
        bws = sorted({c[1] for f in self.families for c in quantum_grid(f)})
        sv = {bw: states(ang, bw) for bw in bws}
        pf = {bw: pauli_features(sv[bw]) for bw in bws}
        return sv, pf

    def _k(self, cfg, sv_a, pf_a, sv_b, pf_b):
        bw = cfg[1]
        return kernel_matrix(cfg, sv_a[bw], sv_b[bw], pf_a[bw], pf_b[bw])

    def tune(self, df: pd.DataFrame, y: np.ndarray) -> tuple:
        skf = StratifiedKFold(3, shuffle=True, random_state=SEEDS["cv_inner"])
        folds = []
        for a, b in skf.split(df, y):
            qf = QFeatures.fit(df.iloc[a])
            folds.append((a, b, self._cache(qf.angles(df.iloc[a])), self._cache(qf.angles(df.iloc[b]))))
        best, best_score = None, -np.inf
        for fam in self.families:
            for cfg in quantum_grid(fam):
                scores = []
                for a, b, (sva, pfa), (svb, pfb) in folds:
                    ktr = self._k(cfg, sva, pfa, sva, pfa)
                    kte = self._k(cfg, svb, pfb, sva, pfa)
                    m = SVC(kernel="precomputed", C=cfg[3], class_weight="balanced").fit(ktr, y[a])
                    scores.append(average_precision_score(y[b], m.decision_function(kte)))
                score = round(float(np.mean(scores)), TIE_DECIMALS)
                if score > best_score:
                    best, best_score = cfg, score
        self.cfg = best
        return best

    def fit_predict(self, dtr: pd.DataFrame, ytr: np.ndarray, dte: pd.DataFrame, cfg=None) -> np.ndarray:
        cfg = cfg or self.cfg
        qf = QFeatures.fit(dtr)
        a_tr, a_te = qf.angles(dtr), qf.angles(dte)
        s_tr, s_te = states(a_tr, cfg[1]), states(a_te, cfg[1])
        f_tr, f_te = pauli_features(s_tr), pauli_features(s_te)
        ktr = kernel_matrix(cfg, s_tr, s_tr, f_tr, f_tr)
        kte = kernel_matrix(cfg, s_te, s_tr, f_te, f_tr)
        return np.clip(svc_platt(ktr, ytr, kte, cfg[3]), EPS, 1 - EPS)


# ---------------------------------------------------------------- classical models
def lr_fit_predict(dtr, ytr, dte, C=None):
    if C is None:
        skf = StratifiedKFold(3, shuffle=True, random_state=SEEDS["cv_inner"])
        best, best_ll = None, np.inf
        for c in LR_C:
            ll = []
            for a, b in skf.split(dtr, ytr):
                m = Pipeline([("p", make_preprocessor()), ("m", LogisticRegression(C=c, max_iter=2000))])
                m.fit(dtr.iloc[a], ytr[a])
                ll.append(log_loss(ytr[b], m.predict_proba(dtr.iloc[b])[:, 1], labels=[0, 1]))
            score = round(float(np.mean(ll)), TIE_DECIMALS)
            if score < best_ll:
                best, best_ll = c, score
        C = best
    m = Pipeline([("p", make_preprocessor()), ("m", LogisticRegression(C=C, max_iter=2000))]).fit(dtr, ytr)
    return np.clip(m.predict_proba(dte)[:, 1], EPS, 1 - EPS), C


def gbm_fit_predict(dtr, ytr, dte):
    m = Pipeline(
        [
            ("p", make_preprocessor()),
            ("m", HistGradientBoostingClassifier(max_depth=3, learning_rate=0.05, max_iter=150,
                                                 l2_regularization=1.0, random_state=SEEDS["model"])),
        ]
    ).fit(dtr, ytr)
    return np.clip(m.predict_proba(dte)[:, 1], EPS, 1 - EPS)


def tune_blend(dtr, ytr, qcfg, lr_C) -> float:
    """Blend weight w for w*p_q + (1-w)*p_LR, chosen by inner out-of-fold log loss."""
    skf = StratifiedKFold(3, shuffle=True, random_state=SEEDS["cv_inner"] + 1)
    pq, pl = np.zeros(len(ytr)), np.zeros(len(ytr))
    qm = QuantumModel()
    for a, b in skf.split(dtr, ytr):
        pq[b] = qm.fit_predict(dtr.iloc[a], ytr[a], dtr.iloc[b], cfg=qcfg)
        pl[b], _ = lr_fit_predict(dtr.iloc[a], ytr[a], dtr.iloc[b], C=lr_C)
    ws = np.linspace(0, 1, 11)
    lls = [round(log_loss(ytr, w * pq + (1 - w) * pl, labels=[0, 1]), TIE_DECIMALS) for w in ws]
    return float(ws[int(np.argmin(lls))])


# ---------------------------------------------------------------- metrics
def at_k(y, p, k):
    order = np.argsort(-p, kind="mergesort")[:k]
    tp = y[order].sum()
    return tp / k, tp / max(y.sum(), 1)


def metrics(y, p, k):
    prec, rec = at_k(y, p, k)
    return {
        "roc_auc": roc_auc_score(y, p),
        "pr_auc": average_precision_score(y, p),
        "brier": brier_score_loss(y, p),
        "log_loss": log_loss(y, p, labels=[0, 1]),
        "precision_at_k": prec,
        "recall_at_k": rec,
    }


# ---------------------------------------------------------------- nested CV
def nested_cv(train: pd.DataFrame) -> tuple[pd.DataFrame, list]:
    y = train["y"].values
    X = train.drop(columns=["y"])
    rskf = RepeatedStratifiedKFold(n_splits=5, n_repeats=10, random_state=SEEDS["cv_outer"])
    rows, choices = [], []
    for f, (tr, te) in enumerate(rskf.split(X, y)):
        dtr, dte, ytr, yte = X.iloc[tr], X.iloc[te], y[tr], y[te]
        k = max(1, round(0.1 * len(te)))
        preds = {"prior": np.full(len(te), ytr.mean())}
        preds["LR"], lr_C = lr_fit_predict(dtr, ytr, dte)
        preds["GBM"] = gbm_fit_predict(dtr, ytr, dte)
        qk = QuantumModel(("QK",))
        qk.tune(dtr, ytr)
        preds["QK"] = qk.fit_predict(dtr, ytr, dte)
        pqk = QuantumModel(("PQK",))
        pqk.tune(dtr, ytr)
        preds["PQK"] = pqk.fit_predict(dtr, ytr, dte)
        both = QuantumModel()
        qcfg = both.tune(dtr, ytr)
        pq = preds["QK"] if qcfg[0] == "QK" and qcfg == qk.cfg else (
            preds["PQK"] if qcfg == pqk.cfg else both.fit_predict(dtr, ytr, dte))
        w = tune_blend(dtr, ytr, qcfg, lr_C)
        preds["Hybrid"] = w * pq + (1 - w) * preds["LR"]
        for name, p in preds.items():
            rows.append({"fold": f, "model": name, **metrics(yte, p, k)})
        choices.append({"fold": f, "lr_C": lr_C, "qk_cfg": qk.cfg, "pqk_cfg": pqk.cfg, "hybrid_q_cfg": qcfg, "w": w})
        print(f"fold {f:2d}  w={w:.1f}  q={qcfg}  LR auc={rows[-5]['roc_auc']:.3f}  Hyb auc={rows[-1]['roc_auc']:.3f}", flush=True)
    return pd.DataFrame(rows), choices


def paired_ci(cv: pd.DataFrame, a: str, b: str, metric: str) -> dict:
    da = cv[cv.model == a].set_index("fold")[metric]
    db = cv[cv.model == b].set_index("fold")[metric]
    d = (da - db).values
    # 50 folds from 10 repeats are correlated; use the corrected resampled t-test (Nadeau & Bengio 2003).
    n, n_test_over_train = len(d), 1 / 4
    se = np.sqrt((1 / n + n_test_over_train) * d.var(ddof=1))
    t = stats.t.ppf(0.975, n - 1)
    return {"mean_diff": d.mean(), "ci_low": d.mean() - t * se, "ci_high": d.mean() + t * se}


def decide(cv: pd.DataFrame) -> dict:
    ll = paired_ci(cv, "Hybrid", "LR", "log_loss")
    pr = paired_ci(cv, "Hybrid", "LR", "pr_auc")
    ll_ok = ll["mean_diff"] <= 0 or (ll["ci_low"] <= 0 <= ll["ci_high"])
    pr_ok = pr["ci_high"] >= 0
    return {"hybrid_minus_lr_log_loss": ll, "hybrid_minus_lr_pr_auc": pr,
            "log_loss_condition": bool(ll_ok), "pr_auc_condition": bool(pr_ok),
            "shipped_model": "Hybrid" if (ll_ok and pr_ok) else "LR"}


# ---------------------------------------------------------------- final fit, bootstrap, figures
def final_fit(train, test, shipped: str, n_boot: int = 200):
    y = train["y"].values
    X = train.drop(columns=["y"])
    p_lr, lr_C = lr_fit_predict(X, y, test)
    info = {"lr_C": lr_C}
    if shipped == "Hybrid":
        qm = QuantumModel()
        qcfg = qm.tune(X, y)
        w = tune_blend(X, y, qcfg, lr_C)
        p_q = qm.fit_predict(X, y, test)
        p = w * p_q + (1 - w) * p_lr
        info.update({"quantum_cfg": qcfg, "w": w})
    else:
        p, qcfg, w = p_lr, None, 0.0
    rng = np.random.default_rng(SEEDS["bootstrap"])
    boot = np.zeros((n_boot, len(test)))
    for i in range(n_boot):
        idx = rng.choice(len(X), len(X), replace=True)
        while y[idx].sum() < 6:
            idx = rng.choice(len(X), len(X), replace=True)
        bl, _ = lr_fit_predict(X.iloc[idx], y[idx], test, C=lr_C)
        if shipped == "Hybrid":
            bq = QuantumModel().fit_predict(X.iloc[idx], y[idx], test, cfg=qcfg)
            boot[i] = w * bq + (1 - w) * bl
        else:
            boot[i] = bl
    info["p_lr_only"] = p_lr
    return p, boot, info


def concentration_plot(train):
    X = train.drop(columns=["y"])
    qf = QFeatures.fit(X)
    ang = qf.angles(X)
    bws = np.geomspace(0.02, 3.2, 15)
    var = []
    for bw in bws:
        k = fidelity_kernel(states(ang, bw), states(ang, bw))
        var.append(k[np.triu_indices_from(k, 1)].var())
    fig, ax = plt.subplots(figsize=(5.2, 3.4))
    ax.loglog(bws, var, "o-")
    ax.axvspan(min(QK_BW), max(QK_BW), alpha=0.12, label="tuned range")
    ax.axvline(1.0, ls="--", c="grey", lw=1, label="default scaling (bw=1)")
    ax.set_xlabel("feature-map bandwidth")
    ax.set_ylabel("variance of off-diagonal kernel")
    ax.set_title("Fidelity-kernel concentration, 6-qubit ZZ map")
    ax.legend(fontsize=8)
    fig.tight_layout()
    fig.savefig(FIGURES / "stage1_kernel_concentration.png", dpi=160)
    return {"bandwidth": bws.tolist(), "offdiag_variance": var}


def summary_table(cv):
    g = cv.groupby("model").agg(["mean", "std"])
    order = ["prior", "LR", "GBM", "QK", "PQK", "Hybrid"]
    return g.loc[[m for m in order if m in g.index]]


def reliability_plot(cv_oof: pd.DataFrame):
    fig, ax = plt.subplots(figsize=(4.4, 4))
    for name, d in cv_oof.groupby("model"):
        bins = np.quantile(d.p, np.linspace(0, 1, 6))
        bins[-1] += 1e-9
        idx = np.digitize(d.p, bins[1:-1])
        xs = [d.p[idx == i].mean() for i in range(5)]
        ys = [d.y[idx == i].mean() for i in range(5)]
        ax.plot(xs, ys, "o-", label=name)
    ax.plot([0, 0.6], [0, 0.6], "k--", lw=1)
    ax.set_xlabel("predicted probability")
    ax.set_ylabel("observed rate")
    ax.set_title("Reliability (out-of-fold, repeat 1)")
    ax.legend(fontsize=8)
    fig.tight_layout()
    fig.savefig(FIGURES / "stage1_reliability.png", dpi=160)


def oof_repeat1(train, choices):
    """Out-of-fold predictions from the first CV repeat (5 folds), for the reliability plot."""
    y = train["y"].values
    X = train.drop(columns=["y"])
    rskf = RepeatedStratifiedKFold(n_splits=5, n_repeats=10, random_state=SEEDS["cv_outer"])
    out = []
    for f, (tr, te) in enumerate(rskf.split(X, y)):
        if f >= 5:
            break
        c = choices[f]
        pl, _ = lr_fit_predict(X.iloc[tr], y[tr], X.iloc[te], C=c["lr_C"])
        pq = QuantumModel().fit_predict(X.iloc[tr], y[tr], X.iloc[te], cfg=tuple(c["hybrid_q_cfg"]))
        for name, p in {"LR": pl, "Hybrid": c["w"] * pq + (1 - c["w"]) * pl}.items():
            out.append(pd.DataFrame({"model": name, "p": p, "y": y[te]}))
    return pd.concat(out, ignore_index=True)


def main():
    t0 = time.time()
    RESULTS.mkdir(exist_ok=True)
    FIGURES.mkdir(exist_ok=True)
    train, test = load_stage1()
    conc = concentration_plot(train)
    cv, choices = nested_cv(train)
    cv.to_csv(RESULTS / "stage1_cv_folds.csv", index=False)
    table = summary_table(cv)
    table.round(4).to_csv(RESULTS / "stage1_cv_summary.csv")
    print(table.round(3).to_string())
    decision = decide(cv)
    print(decision)
    reliability_plot(oof_repeat1(train, choices))
    p, boot, info = final_fit(train, test, decision["shipped_model"])
    ranked = rank_with_tiebreak(test["customer_id"], p)
    ranked.to_csv(ROOT / "stage1_predictions.csv", index=False)
    # Counterfactual for the report: what plain LR (the strongest single model) would have shipped.
    rank_with_tiebreak(test["customer_id"], info.pop("p_lr_only")).to_csv(RESULTS / "stage1_predictions_LR_only.csv", index=False)
    np.save(RESULTS / "stage1_bootstrap_test_probs.npy", boot)
    pd.DataFrame(boot, columns=test["customer_id"].values).to_csv(RESULTS / "stage1_bootstrap_test_probs.csv", index=False)
    top10 = ranked[ranked.is_top_10 == 1].customer_id.tolist()
    col = {c: i for i, c in enumerate(test["customer_id"])}
    stay = np.mean([set(np.array(test.customer_id)[np.argsort(-b, kind="mergesort")[:10]]) == set(top10) for b in boot])
    member = {c: float(np.mean([col[c] in np.argsort(-b, kind="mergesort")[:10] for b in boot])) for c in top10}
    dump_json(
        {
            "shipped_model": decision["shipped_model"],
            "decision": decision,
            "final_hyperparameters": info,
            "cv_choices_per_fold": choices,
            "kernel_concentration": conc,
            "top10_ids": top10,
            "bootstrap": {"n": len(boot), "seed": SEEDS["bootstrap"],
                          "p_same_top10_set": float(stay), "top10_membership_rate": member},
            "n_train": len(train), "n_test": len(test), "positives_train": int(train.y.sum()),
            "runtime_s": round(time.time() - t0, 1),
        },
        RESULTS / "stage1_summary.json",
    )
    print("top10:", top10, f"({time.time() - t0:.0f}s)")


if __name__ == "__main__":
    main()
