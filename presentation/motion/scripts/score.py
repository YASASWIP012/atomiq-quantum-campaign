#!/usr/bin/env python3
"""
Score a film from its timeline: a music bed on the beat grid + sound effects on cue frames.
Everything is synthesized here (no samples, no downloads), so it's reproducible and licence-free.

  python3 scripts/score.py --film <id>                 # bed + sfx → build/<id>.wav (−14 LUFS, −1 dBTP)
  python3 scripts/score.py --film <id> --music song.wav [--music-gain -3]   # your track + our sfx
  python3 scripts/score.py --film <id> --no-bed        # sfx only (to lay under your own edit)

Reads build/<id>.timeline.json (run `node scripts/timeline.mjs --film <id>` first; render.mjs does).

Rules it follows (from the lab notes this skill is built on):
- every hit peaks ONE FRAME AFTER its picture (light before sound feels right; the reverse feels broken)
- hits sit 3–6 dB over the bed; energy lives in the phone band (150 Hz – 6 kHz), little sub
- bed density follows the scene's "music": silent | sparse | build | full | break | out
- master: −14 LUFS integrated, −1 dBTP, no DC, short fades at the ends
"""
import argparse, json, os, subprocess, sys, tempfile, re
import numpy as np
from scipy.signal import butter, sosfilt, fftconvolve

SR = 48000
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))
rng = np.random.default_rng(7)

# ---------------------------------------------------------------- dsp helpers
def lp(x, fc, order=2):
    return sosfilt(butter(order, min(fc, SR * 0.45), 'low', fs=SR, output='sos'), x)
def hp(x, fc, order=2):
    return sosfilt(butter(order, fc, 'high', fs=SR, output='sos'), x)
def bp(x, lo, hi, order=2):
    return sosfilt(butter(order, [lo, min(hi, SR * 0.45)], 'band', fs=SR, output='sos'), x)
def env_exp(n, decay_s, attack_s=0.001):
    t = np.arange(n) / SR
    a = np.minimum(1, t / max(attack_s, 1e-5))
    return a * np.exp(-t / max(decay_s, 1e-4))
def noise(n):
    return rng.standard_normal(n)
def midi_hz(m):
    return 440.0 * 2 ** ((m - 69) / 12)
def saw(freq, n, phase=0.0):
    dt = freq / SR
    t = (phase + np.arange(n) * dt) % 1.0
    y = 2 * t - 1
    m = t < dt
    x = t[m] / dt
    y[m] -= x + x - x * x - 1
    m = t > 1 - dt
    x = (t[m] - 1) / dt
    y[m] -= x * x + x + x + 1
    return y
def sine(freq, n, phase=0.0):
    return np.sin(2 * np.pi * (phase + np.cumsum(np.full(n, freq) if np.isscalar(freq) else freq) / SR))
def tri(freq, n):
    t = (np.arange(n) * freq / SR) % 1.0
    return 4 * np.abs(t - 0.5) - 1
def db(g):
    return 10 ** (g / 20)
def panlaw(pan):
    """constant-power pan, 0 = left, 0.5 = centre (unity), 1 = right"""
    a = pan * np.pi / 2
    return np.sqrt(2) * np.cos(a) * 0.7071, np.sqrt(2) * np.sin(a) * 0.7071
def limit(L, R, ceiling=0.5, look_ms=5, release_ms=80):
    """lookahead peak limiter (keeps transients clean so loudnorm can hit −1 dBTP)"""
    la = int(look_ms / 1000 * SR)
    pk = np.maximum(np.abs(L), np.abs(R))
    # max over the lookahead window
    from scipy.ndimage import maximum_filter1d
    m = maximum_filter1d(pk, size=2 * la + 1)
    g = np.minimum(1.0, ceiling / np.maximum(m, 1e-9))
    # smooth: instant attack, exponential release
    a = np.exp(-1 / (release_ms / 1000 * SR))
    from scipy.signal import lfilter
    g_rel = 1 - lfilter([1 - a], [1, -a], 1 - g)
    g = np.minimum(g, g_rel)
    return L * g, R * g
def band_share(L, R, lo=150, hi=6000):
    x = (L + R) / 2
    X = np.abs(np.fft.rfft(x)) ** 2
    fr = np.fft.rfftfreq(len(x), 1 / SR)
    return X[(fr >= lo) & (fr <= hi)].sum() / max(X.sum(), 1e-12), X[fr < 60].sum() / max(X.sum(), 1e-12)
def sweep_bp(x, f0, f1, q=1.4, chunk=256):
    """time-varying band-pass (approximate, chunked) for whooshes"""
    out = np.zeros_like(x)
    n = len(x)
    for s in range(0, n, chunk):
        k = s / max(1, n - 1)
        fc = f0 * (f1 / f0) ** k
        lo, hi = fc / (1 + 1 / q), min(fc * (1 + 1 / q), SR * 0.45)
        out[s:s + chunk] = bp(x[s:s + chunk], max(30, lo), hi)
    return lp(out, 9000)

# ---------------------------------------------------------------- chords
NOTE = {'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10, 'B': 11}
def chord_notes(name):
    m = re.match(r'^([A-G][#b]?)(.*)$', name)
    root = NOTE[m.group(1)]
    q = m.group(2)
    if q.startswith('maj7'): iv = [0, 4, 7, 11]
    elif q.startswith('m7'): iv = [0, 3, 7, 10]
    elif q.startswith('m'): iv = [0, 3, 7, 14]
    elif q.startswith('7'): iv = [0, 4, 7, 10]
    elif q.startswith('sus2'): iv = [0, 2, 7, 12]
    elif q.startswith('sus4'): iv = [0, 5, 7, 12]
    elif q.startswith('add9'): iv = [0, 4, 7, 14]
    else: iv = [0, 4, 7, 12]
    return root, iv

# ---------------------------------------------------------------- instruments (mono buffers)
def kick(style):
    n = int(0.32 * SR)
    t = np.arange(n) / SR
    f = 58 + 130 * np.exp(-t / 0.03)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * env_exp(n, 0.09, 0.0006)
    knock = np.sin(2 * np.pi * 190 * t) * env_exp(n, 0.014, 0.0004) * (0.8 if style == 'neon' else 0.55)
    click = hp(noise(n), 2500) * env_exp(n, 0.0025, 0.0002) * (0.35 if style == 'neon' else 0.18)
    return (body + knock + click) * (1.0 if style == 'neon' else 0.7)
def clap():
    n = int(0.25 * SR)
    x = bp(noise(n), 900, 4200)
    e = np.zeros(n)
    for off in (0, 0.011, 0.022):
        i = int(off * SR)
        e[i:] += env_exp(n - i, 0.008 if off < 0.02 else 0.09)
    return x * e * 0.55
def hat(open_=False, soft=False):
    n = int((0.14 if open_ else 0.04) * SR)
    x = hp(noise(n), 7000 if not soft else 5000) * env_exp(n, 0.06 if open_ else 0.012, 0.0005)
    return x * (0.22 if soft else 0.3)
def shaker():
    n = int(0.07 * SR)
    return bp(noise(n), 4000, 11000) * env_exp(n, 0.02, 0.006) * 0.2
def bass_note(m, dur):
    n = int(dur * SR)
    f = midi_hz(m)
    x = 0.65 * saw(f, n) + 0.5 * np.sin(2 * np.pi * f * np.arange(n) / SR)
    x = lp(x, 900) * env_exp(n, dur * 0.55, 0.004)
    return np.tanh(x * 1.6) * 0.42
def pad_chord(notes, dur, bright=1800):
    n = int(dur * SR)
    L = np.zeros(n)
    R = np.zeros(n)
    for m in notes:
        f = midi_hz(m)
        for d, pan in ((-7, 0.2), (0, 0.5), (7, 0.8)):
            v = saw(f * 2 ** (d / 1200), n, rng.random())
            L += v * (1 - pan)
            R += v * pan
    a = int(0.35 * SR)
    r = int(0.6 * SR)
    e = np.ones(n)
    e[:a] = np.linspace(0, 1, a) ** 2
    e[-r:] *= np.linspace(1, 0, r) ** 1.5
    return lp(L, bright) * e * 0.075, lp(R, bright) * e * 0.075
def pluck(m, dur=0.22):
    n = int(dur * SR)
    f = midi_hz(m)
    x = 0.6 * tri(f, n) + 0.4 * saw(f, n)
    return lp(x, 3600) * env_exp(n, 0.09, 0.002) * 0.16

# ---------------------------------------------------------------- sound effects
# each returns (buffer, peak_index) so the peak can be placed exactly on frame + 1
def fx(name, pitch=0, dur=None, lead=None):
    ps = 2 ** (pitch / 12)
    if name == 'tick':
        n = int(0.05 * SR)
        x = np.sin(2 * np.pi * 2400 * ps * np.arange(n) / SR) * env_exp(n, 0.012, 0.0004) + hp(noise(n), 4000) * env_exp(n, 0.003, 0.0002) * 0.4
        return x * 0.5, 0
    if name == 'click':
        n = int(0.06 * SR)
        x = bp(noise(n), 1800, 6500) * env_exp(n, 0.006, 0.0002) + np.sin(2 * np.pi * 1300 * np.arange(n) / SR) * env_exp(n, 0.01, 0.0003) * 0.4
        return x * 0.9, 0
    if name == 'tap':
        n = int(0.09 * SR)
        x = np.sin(2 * np.pi * 520 * ps * np.arange(n) / SR) * env_exp(n, 0.03, 0.001) + bp(noise(n), 800, 3000) * env_exp(n, 0.004) * 0.3
        return x * 0.7, int(0.001 * SR)
    if name == 'pop':
        n = int(0.14 * SR)
        f = (380 + 620 * (1 - np.exp(-np.arange(n) / SR / 0.012))) * ps
        x = np.sin(2 * np.pi * np.cumsum(f) / SR) * env_exp(n, 0.045, 0.002)
        return x * 0.6, int(0.002 * SR)
    if name == 'thock':
        n = int(0.16 * SR)
        t = np.arange(n) / SR
        f = 210 * ps
        x = (np.sin(2 * np.pi * f * t) + 0.5 * np.sin(2 * np.pi * 2.76 * f * t)) * env_exp(n, 0.05, 0.0008) + bp(noise(n), 1500, 5000) * env_exp(n, 0.004) * 0.3
        return x * 0.6, int(0.0008 * SR)
    if name == 'chime':
        n = int(1.6 * SR)
        t = np.arange(n) / SR
        f = 1046.5 * ps
        x = sum(a * np.sin(2 * np.pi * f * r * t) * np.exp(-t / d) for r, a, d in ((1, 1, 0.9), (2.01, 0.45, 0.5), (3.02, 0.22, 0.3), (4.2, 0.12, 0.2)))
        x *= np.minimum(1, t / 0.002)
        return x * 0.22, int(0.002 * SR)
    if name in ('swish', 'whoosh', 'whip'):
        L = {'swish': 0.26, 'whoosh': 0.6, 'whip': 0.16}[name]
        if lead:
            L = min(1.2, max(L, lead))
        tail = {'swish': 0.12, 'whoosh': 0.25, 'whip': 0.08}[name]
        n_pre = int(L * SR)
        n_post = int(tail * SR)
        x = noise(n_pre + n_post)
        x = sweep_bp(x, 500 if name != 'whip' else 900, 5200 if name != 'whoosh' else 3800)
        e = np.concatenate([np.linspace(0, 1, n_pre) ** 2.4, np.exp(-np.arange(n_post) / SR / (tail / 3))])
        g = {'swish': 0.55, 'whoosh': 0.6, 'whip': 0.7}[name]
        return x * e * g, n_pre
    if name == 'hit':
        n = int(0.9 * SR)
        t = np.arange(n) / SR
        f = 70 + 90 * np.exp(-t / 0.03)
        low = np.sin(2 * np.pi * np.cumsum(f) / SR) * env_exp(n, 0.18, 0.0008)
        body = np.sin(2 * np.pi * 160 * t) * env_exp(n, 0.04, 0.0006) * 0.5
        air = lp(hp(noise(n), 300), 6000) * env_exp(n, 0.35, 0.001) * 0.18
        return (low + body + air) * 0.85, int(0.0008 * SR)
    if name == 'riser':
        L = dur or 1.0
        n = int(L * SR)
        t = np.arange(n) / SR
        x = sweep_bp(noise(n), 300, 7000) * (t / L) ** 2.2 * 0.5
        f = 220 * 2 ** (2.5 * t / L)
        x += np.sin(2 * np.pi * np.cumsum(f) / SR) * (t / L) ** 3 * 0.12
        return x, n - 1
    if name == 'count':
        L = dur or 0.75
        n = int((L + 0.05) * SR)
        x = np.zeros(n)
        tt = 0.0
        k = 0
        while tt < L:
            i = int(tt * SR)
            b, _ = fx('tick', pitch=pitch + k * 0.5)
            x[i:i + len(b)] += b[: n - i] * 0.55
            tt += 0.03 + 0.07 * (tt / L) ** 2  # fast, then settles
            k += 1
        return x, 0
    if name == 'shimmer':
        n = int(0.9 * SR)
        x = np.zeros(n)
        for k in range(9):
            i = int(k * 0.06 * SR)
            f = 2600 * 2 ** (rng.integers(0, 12) / 12) * ps
            m = n - i
            x[i:] += np.sin(2 * np.pi * f * np.arange(m) / SR) * env_exp(m, 0.12, 0.001) * (0.16 - k * 0.01)
        return x, 0
    if name == 'type':
        L = dur or 0.8
        n = int((L + 0.05) * SR)
        x = np.zeros(n)
        tt = 0.0
        while tt < L:
            i = int(tt * SR)
            b, _ = fx('click')
            x[i:i + len(b)] += b[: n - i] * (0.3 + 0.2 * rng.random())
            tt += 0.06 + 0.05 * rng.random()
        return x, 0
    if name == 'drop':
        n = int(0.8 * SR)
        t = np.arange(n) / SR
        f = 140 * np.exp(-t / 0.35) + 45
        return np.sin(2 * np.pi * np.cumsum(f) / SR) * env_exp(n, 0.4, 0.002) * 0.7, 0
    raise ValueError(f'unknown sfx "{name}"')

SFX_NAMES = ['tick', 'click', 'tap', 'pop', 'thock', 'chime', 'swish', 'whoosh', 'whip', 'hit', 'riser', 'count', 'shimmer', 'type', 'drop']

# ---------------------------------------------------------------- arrangement
def build_bed(tl, total, style):
    meta = tl['meta']
    bpm = meta['bpm']
    bpb = meta.get('beatsPerBar', 4)
    beat_s = 60 / bpm
    chords = meta.get('chords') or ['Dmaj7', 'Bm7', 'Gmaj7', 'A']
    L = np.zeros(total)
    R = np.zeros(total)
    D = np.zeros(total)  # drums bus (mono)

    def put(buf, t, ch=('L', 'R'), g=1.0, pan=0.5):
        i = int(round(t * SR))
        if i >= total or i + len(buf) <= 0:
            return
        j0 = max(0, -i)
        seg = buf[j0: max(0, min(len(buf), total - i))] * g
        i = max(i, 0)
        if ch == 'D':
            D[i:i + len(seg)] += seg
        else:
            gl, gr = panlaw(pan)
            L[i:i + len(seg)] += seg * gl
            R[i:i + len(seg)] += seg * gr

    K = kick(style)
    C = clap()
    HC = hat(False, style == 'soft')
    HO = hat(True, style == 'soft')
    SH = shaker()
    scenes = tl['scenes']
    total_beats = int(np.ceil(total / SR / beat_s))
    # section per beat
    sec = ['silent'] * (total_beats + 8)
    for s in scenes:
        for bt in range(int(s['startBeat']), int(s['startBeat'] + s['beats'])):
            if bt < len(sec):
                sec[bt] = s.get('music', 'full')
    last_scene_end = max(s['startBeat'] + s['beats'] for s in scenes)
    for bt in range(int(last_scene_end), len(sec)):
        sec[bt] = 'tail'

    for bar in range(0, total_beats, bpb):
        root, iv = chord_notes(chords[(bar // bpb) % len(chords)])
        bar_t = bar * beat_s
        mode = sec[bar]
        if mode in ('silent', 'tail'):
            continue
        # pad on every audible section
        pn = [48 + root + i for i in iv]  # octave 3-4
        pl, pr = pad_chord(pn, bpb * beat_s + 0.6, bright=1500 if mode in ('sparse', 'out') else 2200)
        gpad = {'sparse': 0.9, 'build': 0.9, 'full': 0.75, 'break': 1.0, 'out': 1.0}.get(mode, 0.8)
        i0 = int(bar_t * SR)
        n = min(len(pl), total - i0)
        if n > 0:
            L[i0:i0 + n] += pl[:n] * gpad
            R[i0:i0 + n] += pr[:n] * gpad
        for b in range(bpb):
            bt = bar + b
            if bt >= len(sec):
                break
            m = sec[bt]
            t = bt * beat_s
            if m == 'full':
                put(K, t, 'D', 1.0)
                if style == 'neon':
                    if b % 2 == 1:
                        put(C, t, 'D', 0.8)
                    put(HO, t + beat_s / 2, 'D', 0.7)
                    for s16 in range(4):
                        put(HC, t + s16 * beat_s / 4, 'D', 0.45 if s16 % 2 else 0.25)
                else:
                    put(SH, t + beat_s / 2, 'D', 0.9)
                    put(SH, t + beat_s * 0.75, 'D', 0.4)
                    if b % 2 == 1:
                        put(C, t, 'D', 0.35)
                # bass on 8ths
                for e8 in range(2):
                    bb = bass_note(36 + root + (12 if (e8 == 1 and style == 'neon') else 0), beat_s / 2 * 0.95)
                    put(bb, t + e8 * beat_s / 2, ('L', 'R'), 0.9 if e8 == 0 else 0.6)
                # pluck arpeggio (16ths) for movement
                arp = [72 + root + iv[(b * 4 + k) % len(iv)] for k in range(4)]
                for k, mm in enumerate(arp):
                    pk = pluck(mm)
                    put(pk, t + k * beat_s / 4, ('L', 'R'), 0.7 if style == 'soft' else 0.55, pan=0.3 + 0.4 * (k % 2))
            elif m == 'build':
                if b in (0, 2):
                    put(K, t, 'D', 0.75)
                put(HC, t + beat_s / 2, 'D', 0.6)
                arp = [72 + root + iv[(k) % len(iv)] for k in range(2)]
                for k, mm in enumerate(arp):
                    put(pluck(mm), t + k * beat_s / 2, ('L', 'R'), 0.55, pan=0.35 + 0.3 * k)
            elif m == 'break':
                if b == 0:
                    put(K, t, 'D', 0.6)
                arp = [72 + root + iv[(b * 4 + k) % len(iv)] for k in range(4)]
                for k, mm in enumerate(arp):
                    put(pluck(mm + 12 if k == 3 else mm), t + k * beat_s / 4, ('L', 'R'), 0.6, pan=0.3 + 0.4 * (k % 2))
            elif m == 'sparse':
                if b == 0:
                    put(bass_note(36 + root, beat_s * 1.8), t, ('L', 'R'), 0.7)
            elif m == 'out':
                if bt == int(scenes[-1]['startBeat']):
                    put(K, t, 'D', 0.9)
                if b == 0:
                    put(bass_note(36 + root, beat_s * 3), t, ('L', 'R'), 0.6)
    # automatic risers into a 'full' section that follows a calmer one
    prev = None
    for s in scenes:
        m = s.get('music', 'full')
        if m == 'full' and prev in ('sparse', 'build', 'break'):
            rl = bpb * beat_s * 0.5
            buf, pk = fx('riser', dur=rl)
            t = s['startBeat'] * beat_s - (pk / SR)
            i = int(round(t * SR))
            if i >= 0:
                n = min(len(buf), total - i)
                L[i:i + n] += buf[:n] * 0.35
                R[i:i + n] += buf[:n] * 0.35
        prev = m
    # glue: light compression on drums, then sum
    D = np.tanh(D * 1.2) / 1.2
    gd = 0.85 if style == 'neon' else 0.6
    L += D * gd
    R += D * gd
    return L, R

def place_sfx(tl, total, L, R, offset_frames=1):
    fps = tl['meta']['fps']
    placed = []
    for c in tl['cues']:
        name = c['sfx']
        if name not in SFX_NAMES:
            print(f'  ! unknown sfx "{name}" at frame {c["frame"]} — skipped')
            continue
        dur = c.get('durFrames', 0) / fps if c.get('durFrames') else None
        lead = c.get('leadFrames', 0) / fps if c.get('leadFrames') else None
        buf, pk = fx(name, pitch=c.get('pitch', 0), dur=dur, lead=lead)
        g = db(c.get('gain', 0)) * 0.9
        t_peak = (c['frame'] + offset_frames) / fps
        i = int(round(t_peak * SR)) - pk
        pan = c.get('pan', 0.5)
        if i < 0:
            buf = buf[-i:]
            i = 0
        n = min(len(buf), total - i)
        if n <= 0:
            continue
        gl, gr = panlaw(pan)
        L[i:i + n] += buf[:n] * g * gl
        R[i:i + n] += buf[:n] * g * gr
        placed.append((c['frame'], name))
    return placed

def loudnorm(inp, out, target=-14.0, tp=-2.2):  # AAC encoding lifts true peak ~1 dB; leave room
    a = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', inp, '-af', f'loudnorm=I={target}:TP={tp}:LRA=11:print_format=json', '-f', 'null', '-'], capture_output=True, text=True).stderr
    j = json.loads(a[a.rindex('{'):a.rindex('}') + 1])
    flt = (f"loudnorm=I={target}:TP={tp}:LRA=11:measured_I={j['input_i']}:measured_TP={j['input_tp']}:measured_LRA={j['input_lra']}:"
           f"measured_thresh={j['input_thresh']}:offset={j['target_offset']}:linear=true")
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', inp, '-af', flt + ',aresample=48000', '-c:a', 'pcm_s16le', out], check=True)
    m = subprocess.run(['ffmpeg', '-hide_banner', '-nostats', '-i', out, '-af', 'ebur128=peak=true', '-f', 'null', '-'], capture_output=True, text=True).stderr
    I = re.findall(r'I:\s+(-?[\d.]+) LUFS', m)
    P = re.findall(r'Peak:\s+(-?[\d.]+) dBFS', m)
    return (I[-1] if I else '?'), (P[-1] if P else '?')

def load_audio(path, total):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-i', path, '-ac', '2', '-ar', str(SR), '-f', 'f32le', '-'], capture_output=True, check=True).stdout
    x = np.frombuffer(raw, np.float32).reshape(-1, 2).astype(np.float64)
    out = np.zeros((total, 2))
    n = min(total, len(x))
    out[:n] = x[:n]
    f = int(1.5 * SR)
    out[max(0, total - f):] *= np.linspace(1, 0, min(f, total))[:, None]
    return out[:, 0], out[:, 1]

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--film', required=True)
    ap.add_argument('--music', help='use this track instead of the generated bed (match the film BPM!)')
    ap.add_argument('--music-gain', type=float, default=-4.0)
    ap.add_argument('--no-bed', action='store_true')
    ap.add_argument('--style', choices=['soft', 'neon'], help='bed style (default: from brand.look)')
    ap.add_argument('--out')
    a = ap.parse_args()
    tl_path = os.path.join(ROOT, 'build', f'{a.film}.timeline.json')
    if not os.path.exists(tl_path):
        subprocess.run(['node', os.path.join(ROOT, 'scripts/timeline.mjs'), '--film', a.film, '--quiet'], check=True)
    tl = json.load(open(tl_path))
    meta = tl['meta']
    secs = meta['durationInFrames'] / meta['fps']
    total = int(round(secs * SR))
    style = a.style or ('neon' if (tl.get('brand') or {}).get('look') == 'neon' else 'soft')
    if a.music:
        L, R = load_audio(a.music, total)
        L *= db(a.music_gain)
        R *= db(a.music_gain)
    elif a.no_bed:
        L, R = np.zeros(total), np.zeros(total)
    else:
        L, R = build_bed(tl, total, style)
        L *= db(-6)
        R *= db(-6)
    S_L, S_R = np.zeros(total), np.zeros(total)
    placed = place_sfx(tl, total, S_L, S_R)
    # a touch of room on the sfx bus
    ir_n = int(0.7 * SR)
    ir = noise(ir_n) * np.exp(-np.arange(ir_n) / SR / 0.18) * 0.02
    S_L = S_L + fftconvolve(S_L, ir)[:total]
    S_R = S_R + fftconvolve(S_R, ir[::-1] if False else ir)[:total]
    mixL = hp(L + S_L * db(1.5), 40)
    mixR = hp(R + S_R * db(1.5), 40)
    mixL -= mixL.mean()
    mixR -= mixR.mean()
    pk = max(np.abs(mixL).max(), np.abs(mixR).max(), 1e-9)
    mixL, mixR = mixL / pk, mixR / pk
    # bring the body up, catch the peaks (≈ 6 dB of limiting at most on the loudest hits)
    rms = np.sqrt(np.mean(((mixL + mixR) / 2) ** 2))
    mixL, mixR = limit(mixL, mixR, ceiling=min(1.0, rms * 6.5))
    pk = max(np.abs(mixL).max(), np.abs(mixR).max(), 1e-9)
    mixL, mixR = mixL / pk * 0.6, mixR / pk * 0.6
    phone, sub = band_share(mixL, mixR)
    f = int(0.004 * SR)
    for ch in (mixL, mixR):
        ch[:f] *= np.linspace(0, 1, f)
        ch[-f:] *= np.linspace(1, 0, f)
    out = a.out or os.path.join(ROOT, 'build', f'{a.film}.wav')
    with tempfile.TemporaryDirectory() as td:
        raw = os.path.join(td, 'raw.wav')
        pcm = (np.stack([mixL, mixR], 1) * 32767).astype('<i2').tobytes()
        subprocess.run(['ffmpeg', '-v', 'error', '-y', '-f', 's16le', '-ar', str(SR), '-ac', '2', '-i', '-', raw], input=pcm, check=True)
        I, P = loudnorm(raw, out)
    print(f'score → {os.path.relpath(out, ROOT)}  ({secs:.2f}s, {len(placed)} sfx, bed: {"track" if a.music else "none" if a.no_bed else style}, {I} LUFS, true peak {P} dBFS, {phone * 100:.0f}% energy in the 150 Hz–6 kHz phone band, {sub * 100:.0f}% below 60 Hz)')

if __name__ == '__main__':
    main()
