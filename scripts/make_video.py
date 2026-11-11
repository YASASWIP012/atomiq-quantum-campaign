"""Build the 1-2 minute walkthrough video: ElevenLabs narration over the deck and live visuals.

Needs ELEVENLABS_API_KEY in .env or the environment (never printed). Optional ELEVENLABS_VOICE_ID.
Extra dev dependencies: pip install -r requirements-video.txt ; system: ffmpeg, pdftoppm.
Run after `make all` and `python scripts/make_deck.py`:   python scripts/make_video.py
Output: presentation/walkthrough.mp4
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import urllib.request
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "src"))
OUT = ROOT / "presentation"
WORK = OUT / "video_build"
W, H = 1920, 1080


def env(name: str) -> str | None:
    if os.environ.get(name):
        return os.environ[name]
    f = ROOT / ".env"
    if f.exists():
        for line in f.read_text().splitlines():
            if line.strip().startswith(name + "="):
                return line.split("=", 1)[1].strip().strip('"').strip("'")
    return None


def tts(text: str, path: Path) -> None:
    key = env("ELEVENLABS_API_KEY")
    if not key:
        # Fallback: the built-in macOS voice, so the video can always be rebuilt offline.
        aiff = path.with_suffix(".aiff")
        subprocess.run(["say", "-v", env("MAC_VOICE") or "Daniel", "-r", "175", "-o", str(aiff), text], check=True)
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(aiff), "-b:a", "160k", str(path)], check=True)
        aiff.unlink()
        return
    voice = env("ELEVENLABS_VOICE_ID") or "JBFqnCBsd6RMkjVDRZzb"  # premade "George"
    req = urllib.request.Request(
        f"https://api.elevenlabs.io/v1/text-to-speech/{voice}?output_format=mp3_44100_128",
        data=json.dumps({"text": text, "model_id": "eleven_multilingual_v2",
                         "voice_settings": {"stability": 0.55, "similarity_boost": 0.75}}).encode(),
        headers={"xi-api-key": key, "Content-Type": "application/json", "Accept": "audio/mpeg"},
    )
    with urllib.request.urlopen(req, timeout=120) as r:
        path.write_bytes(r.read())


def circuit_image(path: Path) -> None:
    from atomiq.qaoa import qaoa_circuit, qubo_to_ising
    from atomiq.stage2 import build_qubo, load_candidates, presolve
    from atomiq.stage3 import encoding_circuit

    c = load_candidates()
    q = build_qubo(c, presolve(c), cardinality_penalty=False)
    h, J, _ = qubo_to_ising(q["Q"], q["lin"], q["const"])
    s2 = json.loads((ROOT / "stage2_selection.json").read_text())
    from qiskit import QuantumCircuit

    from atomiq.qaoa import dicke_state, phase_separator, xy_ring_mixer

    beta, gamma = s2["depth_sweep"][1]["params"]
    qc = QuantumCircuit(10)
    qc.append(dicke_state(10, 6).to_gate(label="Dicke(10,6)"), range(10))
    qc.barrier()
    phase_separator(qc, h, J, gamma)
    qc.barrier()
    xy_ring_mixer(qc, list(range(10)), beta)
    qc.measure_all()
    fig = plt.figure(figsize=(19.2, 10.8))
    fig.text(0.04, 0.93, "Stage 2 circuit, p = 1: Dicke start, cost phase, XY ring mixer", fontsize=28, weight="bold")
    ax = fig.add_axes([0.03, 0.30, 0.94, 0.60])
    qc.draw("mpl", ax=ax, fold=-1, scale=0.8)
    s3 = json.loads((ROOT / "stage3_simulation.json").read_text())
    p = np.array(list(s3["input_probabilities"].values()))
    ax2 = fig.add_axes([0.03, 0.02, 0.45, 0.25])
    encoding_circuit(p).draw("mpl", ax=ax2, scale=0.7)
    fig.text(0.52, 0.17, "Stage 3: one RY(2·arcsin√p) per selected customer;\nsuccess = at least 3 qubits read 1",
             fontsize=22)
    fig.savefig(path, dpi=100)
    plt.close(fig)


def convergence_image(path: Path) -> None:
    from scipy.optimize import minimize

    from atomiq.common import K_SELECT, SEEDS
    from atomiq.qaoa_fast import FastQAOA
    from atomiq.stage2 import build_qubo, diag_cost, load_candidates, presolve

    c = load_candidates()
    q = build_qubo(c, presolve(c), cardinality_penalty=False)
    sim = FastQAOA(diag_cost(q), 10, K_SELECT, 0)
    s2 = json.loads((ROOT / "stage2_selection.json").read_text())
    fig, ax = plt.subplots(1, 2, figsize=(19.2, 10.8))
    from atomiq.stage2 import interp

    x0 = np.random.default_rng(SEEDS["qaoa_init"]).uniform(0, np.pi, 2)
    for p in (1, 2, 3):
        trace = []
        r = minimize(lambda t: trace.append(sim.energy(t)) or trace[-1], x0,
                     method="COBYLA", options={"maxiter": 250 * p, "rhobeg": 0.3})
        ax[0].plot(np.minimum.accumulate(trace), lw=3, label=f"p = {p}")
        x0 = interp(r.x, p)
    ax[0].set_xlabel("COBYLA evaluations", fontsize=20)
    ax[0].set_ylabel("expected cost <f>", fontsize=20)
    ax[0].set_title("COBYLA runs, each depth warm-started from the last", fontsize=22)
    ax[0].legend(fontsize=18)
    best = s2["qaoa"]["best_p"]
    probs = sim.probs(np.array(s2["depth_sweep"][best]["params"]))
    order = np.argsort(-probs)[:12]
    labels = [format(i, "010b") for i in order]
    opt_key = s2["selected_bitstring_qiskit_order"]
    ax[1].barh(range(12)[::-1], probs[order], color=["#c44e52" if l == opt_key else "#4c72b0" for l in labels])
    ax[1].set_yticks(range(12)[::-1], labels, fontsize=14, family="monospace")
    ax[1].axvline(1 / 210, ls="--", c="grey", label="uniform guess 1/210")
    ax[1].set_title(f"Top outcomes at p = {best} (red = optimum)", fontsize=22)
    ax[1].set_xlabel("probability", fontsize=20)
    ax[1].legend(fontsize=16)
    for a in ax:
        a.tick_params(labelsize=16)
    fig.tight_layout()
    fig.savefig(path, dpi=100)
    plt.close(fig)


def script() -> list[tuple[str, str]]:
    s2 = json.loads((ROOT / "stage2_selection.json").read_text())
    s3 = json.loads((ROOT / "stage3_simulation.json").read_text())
    st = json.loads((ROOT / "results" / "stage2_stress.json").read_text())
    ids = ", ".join(i.replace("C0", "C zero ") for i in s2["selected_ids"])
    best = s2["qaoa"]["best_p"]
    popt = s2["depth_sweep"][best]["p_optimal"]
    ratio = popt / s2["random_feasible_baseline_p_optimal"]
    eb = s3["error_budget"]
    hw = s3.get("hardware")
    hw_row = next((r for r in s3["results"] if r["method"] == "ibm_hardware_readout_mitigated"), None) or \
        next((r for r in s3["results"] if r["method"] == "ibm_hardware_unmitigated"), None)
    hw_line = (f" On the real IBM Kingston processor, the mitigated estimate was {hw_row['p_ge3']:.3f}, "
               f"against an exact {s3['exact_p_ge3']:.3f}." if hw and hw_row else "")
    a_runs = [r for r in st["scenarios"][0]["runs"] if r["p"] == 2]
    feas_gain = a_runs[0]["p_feasible"] / max(a_runs[1]["p_feasible"], 1e-9)
    return [
        ("slide1", f"A bank wants to call six customers for a term-deposit campaign. Our pipeline predicts who will "
                   f"subscribe, picks the six, and estimates the chance that at least three say yes. Our answer is the six "
                   f"customers on screen, with a {s3['quantum_estimate_p_ge3']*100:.1f} percent chance of three or more."),
        ("slide2", "Stage one is a hybrid classifier, stage two a QAOA optimiser, stage three a six-qubit sampler. "
                   "Every quantum result is checked against an exact classical answer."),
        ("slide3", "In stage one, default-scaled quantum kernels concentrate, so we tune their bandwidth. Even so, "
                   "with thirty-five positive examples they do not beat logistic regression, and we say so. "
                   "A rule we fixed in advance ships a blend that is statistically level with it."),
        ("circuit", "In stage two, the circuit starts in a Dicke state: every way to choose six of ten customers at "
                    "once. An XY mixer keeps it there, so every shot obeys the exactly-six rule."),
        ("convergence", f"COBYLA tunes the angles. At depth {best}, the optimum shows up in {popt*100:.0f} percent of "
                        f"shots, {ratio:.0f} times more often than guessing, with zero gap to brute force. When we "
                        f"tighten capacity until it binds, this circuit keeps {feas_gain:.1f} times more shots "
                        f"feasible than the usual penalty method."),
        ("slide5", "Under an IBM Kingston noise model the circuit still finds the optimum. Stage three has no "
                   "two-qubit gates, so readout error dominates, and readout mitigation removes it." + hw_line),
        ("slide6", f"The biggest uncertainty is not quantum noise. Resampling the training data moves the answer by "
                   f"about {eb['stage1_model_uncertainty_sd_bootstrap']*100:.0f} percentage points, roughly "
                   f"{eb['stage1_model_uncertainty_sd_bootstrap']/eb['shot_noise_sd_ideal_200k']:.0f} times the shot "
                   f"noise. That is the honest limit of thirty-five positives. Everything reruns from a clean clone "
                   f"with one command."),
    ]


def main():
    WORK.mkdir(parents=True, exist_ok=True)
    subprocess.run(["pdftoppm", "-png", "-r", "144", "-scale-to-x", str(W), "-scale-to-y", str(H),
                    str(OUT / "deck.pdf"), str(WORK / "slide")], check=True)
    pages = sorted(WORK.glob("slide-*.png"))
    visuals = {f"slide{i + 1}": p for i, p in enumerate(pages)}
    circuit_image(WORK / "circuit.png")
    convergence_image(WORK / "convergence.png")
    visuals["circuit"], visuals["convergence"] = WORK / "circuit.png", WORK / "convergence.png"
    clips = []
    segs = script()
    (WORK / "narration.txt").write_text("\n\n".join(t for _, t in segs))
    for i, (vis, text) in enumerate(segs):
        audio = WORK / f"seg{i}.mp3"
        if not audio.exists():
            tts(text, audio)
        clip = WORK / f"seg{i}.mp4"
        subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-loop", "1", "-i", str(visuals[vis]), "-i", str(audio),
                        "-af", "apad=pad_dur=0.6", "-vf", f"scale={W}:{H}:force_original_aspect_ratio=decrease,"
                        f"pad={W}:{H}:(ow-iw)/2:(oh-ih)/2:white,format=yuv420p",
                        "-c:v", "libx264", "-tune", "stillimage", "-c:a", "aac", "-b:a", "160k", "-shortest",
                        "-r", "30", str(clip)], check=True)
        clips.append(clip)
    lst = WORK / "clips.txt"
    lst.write_text("".join(f"file '{c.name}'\n" for c in clips))
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-f", "concat", "-safe", "0", "-i", str(lst), "-c", "copy",
                    str(OUT / "walkthrough.mp4")], check=True)
    dur = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0",
                          str(OUT / "walkthrough.mp4")], capture_output=True, text=True).stdout.strip()
    print(f"wrote presentation/walkthrough.mp4 ({float(dur):.0f} s)")


if __name__ == "__main__":
    main()
