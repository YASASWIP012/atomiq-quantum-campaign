#!/usr/bin/env python3
"""
Tempo + first downbeat of a music file, so a licensed track can drive the film's beat grid.

  python3 scripts/beats.py track.mp3            → prints BPM and offset; writes nothing
  python3 scripts/beats.py track.mp3 --trim out.wav   → also writes a copy starting on the first downbeat

Then set film meta.bpm to the printed BPM (round to 0.5) and render with --music out.wav.
Verify by ear-free means: stills.mjs --every 4 frames should show cuts landing on kicks in the
waveform (or check the drum hits line up with the beat ticks in a draft render).
"""
import argparse, subprocess, sys
import numpy as np
from scipy.signal import stft

def load(path, sr=22050):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '1', '-ar', str(sr), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, np.float32), sr

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('path')
    ap.add_argument('--min', type=float, default=80)
    ap.add_argument('--max', type=float, default=170)
    ap.add_argument('--trim')
    a = ap.parse_args()
    x, sr = load(a.path)
    hop = 256
    _, _, Z = stft(x, sr, nperseg=1024, noverlap=1024 - hop)
    M = np.log1p(np.abs(Z) * 100)
    flux = np.maximum(0, np.diff(M, axis=1)).sum(0)
    flux = (flux - flux.mean()) / (flux.std() + 1e-9)
    fo = sr / hop
    ac = np.correlate(flux, flux, 'full')[len(flux) - 1:]
    lags = np.arange(len(ac)) / fo
    bpms = 60 / np.maximum(lags, 1e-9)
    m = (bpms >= a.min) & (bpms <= a.max)
    # refine around the best lag with parabolic interpolation
    idx = np.where(m)[0][np.argmax(ac[m])]
    if 0 < idx < len(ac) - 1:
        y0, y1, y2 = ac[idx - 1], ac[idx], ac[idx + 1]
        d = 0.5 * (y0 - y2) / (y0 - 2 * y1 + y2 + 1e-12)
    else:
        d = 0
    bpm = 60 / ((idx + d) / fo)
    # phase: which offset within one beat has the strongest onsets
    period = fo * 60 / bpm
    best, best_off = -1, 0.0
    for k in range(int(period)):
        pos = np.arange(k, len(flux), period).astype(int)
        s = flux[pos].sum()
        if s > best:
            best, best_off = s, k / fo
    # downbeat: strongest of the 4 beat phases (bar-level)
    bar_best, bar_off = -1, best_off
    for j in range(4):
        off = best_off + j * 60 / bpm
        pos = (np.arange(off * fo, len(flux), period * 4)).astype(int)
        s = flux[pos].sum()
        if s > bar_best:
            bar_best, bar_off = s, off
    print(f'tempo ≈ {bpm:.2f} BPM (use {round(bpm * 2) / 2})  ·  first beat at {best_off:.3f}s  ·  likely downbeat at {bar_off:.3f}s')
    if a.trim:
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', f'{bar_off:.4f}', '-i', a.path, '-ar', '48000', '-ac', '2', a.trim], check=True)
        print(f'wrote {a.trim} starting on the downbeat')

if __name__ == '__main__':
    main()
