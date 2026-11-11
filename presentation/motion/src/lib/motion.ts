// Motion tokens. Every animation in the film pulls its numbers from here — no inline magic numbers.
// Sources of the curves: easings.net cubic-béziers; springs expressed as damping ratio (zeta).
import {Easing, interpolate} from 'remotion';
import {noise2D} from '@remotion/noise';

export type Ease = (t: number) => number;

export const EASE = {
  /** ease-out-expo — text and logo reveals. The default entrance. */
  enter: Easing.bezier(0.16, 1, 0.3, 1),
  /** ease-out-quint — premium entrances for UI and devices. */
  premium: Easing.bezier(0.22, 1, 0.36, 1),
  /** ease-in-out-quart — moves across the frame, transitions, camera pushes. */
  move: Easing.bezier(0.76, 0, 0.24, 1),
  /** ease-in-out-cubic — softer camera moves on long holds. */
  camera: Easing.bezier(0.65, 0, 0.35, 1),
  /** ease-in-expo — exits. Make exits 40–50% shorter than entrances. */
  exit: Easing.bezier(0.7, 0, 0.84, 0),
  /** ease-out-back — overshoot pop. Sparingly; never on text. */
  pop: Easing.bezier(0.34, 1.56, 0.64, 1),
  /** ease-in-out-sine — breathing, ambient drift. */
  sine: Easing.bezier(0.37, 0, 0.63, 1),
  /** linear — only for rotation, progress bars and loop phase. */
  linear: (t: number) => t,
} satisfies Record<string, Ease>;

/** Durations in milliseconds. Convert with ms(fps, DUR.x). */
export const DUR = {feedback: 150, ui: 350, move: 450, hero: 750, camera: 1000, exit: 260} as const;
/** Stagger gaps in milliseconds. */
export const STAGGER = {letter: 28, word: 80, line: 110, item: 60} as const;

const CLAMP = {extrapolateLeft: 'clamp', extrapolateRight: 'clamp'} as const;

export const ms = (fps: number, millis: number) => Math.max(1, Math.round((millis / 1000) * fps));
export const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** a→b while frame goes f0→f1 (clamped both ends). */
export function tween(f: number, f0: number, f1: number, a = 0, b = 1, ease: Ease = EASE.enter): number {
  if (f1 <= f0) return f >= f1 ? b : a;
  return interpolate(f, [f0, f1], [a, b], {...CLAMP, easing: ease});
}

/** Piecewise keyframes: [[frame, value, easeIntoThisKey?], ...] in frame order. */
export function keys(f: number, ks: Array<[number, number, Ease?]>): number {
  if (ks.length === 0) return 0;
  if (f <= ks[0][0]) return ks[0][1];
  for (let i = 1; i < ks.length; i++) {
    const [f1, v1, e] = ks[i];
    const [f0, v0] = ks[i - 1];
    if (f <= f1) return tween(f, f0, f1, v0, v1, e ?? EASE.move);
  }
  return ks[ks.length - 1][1];
}

/**
 * Damped spring as a pure function of time (no simulation, so any frame renders alone).
 * Returns progress 0→1 (may overshoot when zeta < 1).
 * zeta: 1 = no bounce, 0.75–0.85 premium, 0.5–0.6 playful, < 0.3 cartoon. hz: speed.
 * Rule: position/scale may overshoot; opacity and colour never do (clamp them).
 */
export function springAt(t: number, zeta = 0.78, hz = 2.2): number {
  if (t <= 0) return 0;
  const w = 2 * Math.PI * hz;
  if (zeta >= 1) return 1 - Math.exp(-w * t) * (1 + w * t);
  const wd = w * Math.sqrt(1 - zeta * zeta);
  return 1 - Math.exp(-zeta * w * t) * (Math.cos(wd * t) + ((zeta * w) / wd) * Math.sin(wd * t));
}

/** Spring that starts at frame `start`. */
export const sp = (f: number, start: number, fps: number, zeta = 0.78, hz = 2.2) =>
  springAt((f - start) / fps, zeta, hz);

/** Translate any library's spring numbers to a damping ratio. */
export const dampingRatio = (stiffness: number, damping: number, mass = 1) => damping / (2 * Math.sqrt(stiffness * mass));

/** Seeded, smooth ambient drift in [-amp, amp]. Keeps holds alive. Deterministic. */
export const drift = (f: number, seed: string, amp: number, periodFrames = 240) =>
  noise2D(seed, f / periodFrames, 0.5) * amp;

/** Minimum frames a piece of text must hold still to be read: 0.3 s per word + 0.5 s. */
export const readFrames = (text: string, fps: number) =>
  Math.ceil((0.3 * text.trim().split(/\s+/).filter(Boolean).length + 0.5) * fps);

/** Scale punch: 1 → peak → 1 over n frames, peaking at frame `at`. "Make it pop." */
export function punch(f: number, at: number, fps: number, peak = 1.06, totalMs = 220): number {
  const n = ms(fps, totalMs);
  const a = at - Math.round(n * 0.35);
  if (f < a || f > a + n) return 1;
  return keys(f, [
    [a, 1],
    [at, peak, EASE.enter],
    [a + n, 1, EASE.sine],
  ]);
}

/** Linear-light-ish mix of two hex colours (for animated colour, never springy). */
export function mixColor(a: string, b: string, t: number): string {
  const pa = hex(a), pb = hex(b);
  const k = clamp01(t);
  const c = pa.map((v, i) => Math.round(Math.sqrt(mix(v * v, pb[i] * pb[i], k))));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}
function hex(h: string): number[] {
  const s = h.replace('#', '');
  const n = s.length === 3 ? s.split('').map((x) => x + x).join('') : s;
  return [0, 2, 4].map((i) => parseInt(n.slice(i, i + 2), 16));
}
