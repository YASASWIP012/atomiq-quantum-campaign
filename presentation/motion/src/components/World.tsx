// A 3D world of floating UI panels and one continuous camera flying through it — the long-form
// grammar (one take, push in on the detail, pull back to the whole, pan to the next idea).
// Coordinates: world px, origin at frame centre, +z toward the viewer. Camera shots are keyed on
// the beat grid and eased; depth of field blurs panels away from the focus plane.
import React from 'react';
import {AbsoluteFill, useVideoConfig} from 'remotion';
import {EASE, Ease, keys, ms, sp, tween, drift, clamp01} from '../lib/motion';
import {useBrand, withAlpha} from '../lib/scene';
import {Phone, Laptop, Browser} from './Device';
import {SCREENS} from '../screens';

export type At = string | number;

export type PanelSpec = {
  id: string;
  screen?: string;
  props?: Record<string, unknown>;
  x?: number;
  y?: number;
  z?: number;
  w: number;
  h: number;
  /** logical size the screen draws at (defaults to w×h) */
  lw?: number;
  lh?: number;
  rx?: number;
  ry?: number;
  rz?: number;
  from?: At;
  to?: At;
  enter?: 'rise' | 'pop' | 'fade' | 'drop' | 'grow' | 'none';
  exit?: 'fade' | 'fall' | 'pop' | 'none';
  chrome?: 'card' | 'glass' | 'none' | 'browser' | 'phone' | 'laptop';
  glow?: boolean;
  radius?: number;
  dof?: boolean;
  float?: number;
  url?: string;
};

export type ShotSpec = {
  at: At;
  /** panel id to frame (sets x/y/z from the panel unless given) */
  focus?: string;
  x?: number;
  y?: number;
  z?: number;
  zoom?: number;
  rx?: number;
  ry?: number;
  rz?: number;
  ms?: number;
  ease?: 'camera' | 'move' | 'enter' | 'premium' | 'sine' | 'exit' | 'linear';
};

type Cam = {x: number; y: number; z: number; zoom: number; rx: number; ry: number; rz: number};
const CHANNELS: Array<keyof Cam> = ['x', 'y', 'z', 'zoom', 'rx', 'ry', 'rz'];

/** Evaluate the camera at frame f from a list of shots (each eases from the previous state). */
export function evalCamera(f: number, shots: ShotSpec[], panels: PanelSpec[], at: (a: At) => number, fps: number): Cam {
  const start: Cam = {x: 0, y: 0, z: 0, zoom: 1, rx: 0, ry: 0, rz: 0};
  const tracks: Record<keyof Cam, Array<[number, number, Ease?]>> = {x: [], y: [], z: [], zoom: [], rx: [], ry: [], rz: []};
  let state = {...start};
  let lastEnd = -1e6;
  const ordered = [...shots].sort((a, c) => at(a.at) - at(c.at));
  ordered.forEach((s, i) => {
    const p = s.focus ? panels.find((q) => q.id === s.focus) : undefined;
    if (s.focus && !p) throw new Error(`Shot focus "${s.focus}" is not a panel id`);
    const target: Cam = {
      x: s.x ?? p?.x ?? state.x,
      y: s.y ?? p?.y ?? state.y,
      z: s.z ?? p?.z ?? state.z,
      zoom: s.zoom ?? state.zoom,
      rx: s.rx ?? state.rx,
      ry: s.ry ?? state.ry,
      rz: s.rz ?? state.rz,
    };
    // a move can't start before the previous one has finished (keeps keys monotonic)
    const t0 = Math.max(at(s.at), lastEnd);
    if (i === 0 && t0 <= 0 && s.ms === undefined) {
      for (const c of CHANNELS) tracks[c].push([-1e6, target[c]]);
      state = target;
      lastEnd = t0;
      return;
    }
    const d = Math.max(1, ms(fps, s.ms ?? 1000));
    const e = EASE[s.ease ?? 'camera'];
    for (const c of CHANNELS) {
      if (tracks[c].length === 0) tracks[c].push([-1e6, state[c]]);
      tracks[c].push([t0, state[c]], [t0 + d, target[c], e]);
    }
    state = target;
    lastEnd = t0 + d;
  });
  if (shots.length === 0) return start;
  const out = {...start};
  for (const c of CHANNELS) out[c] = keys(f, tracks[c]);
  return out;
}

export const World: React.FC<{
  f: number;
  panels: PanelSpec[];
  shots: ShotSpec[];
  at: (a: At) => number;
  ev: (n: string, fb?: number) => number;
  b: (n: number) => number;
  look: 'soft' | 'neon' | 'flat';
  dark: boolean;
  perspective?: number;
  dofK?: number;
  alive?: number;
  seed?: string;
}> = ({f, panels, shots, at, ev, b, look, dark, perspective = 1800, dofK = 0.022, alive = 1, seed = 'w'}) => {
  const {fps} = useVideoConfig();
  const cam = evalCamera(f, shots, panels, at, fps);
  // the camera never parks: tiny handheld-ish drift
  const jx = drift(f, `${seed}-cx`, 7 * alive, 260);
  const jy = drift(f, `${seed}-cy`, 5 * alive, 300);
  const jr = drift(f, `${seed}-cr`, 0.5 * alive, 340);
  const d = perspective * (1 - 1 / Math.max(0.2, cam.zoom));
  const worldT = `translateZ(${d}px) rotateX(${cam.rx}deg) rotateY(${cam.ry + jr}deg) rotateZ(${cam.rz}deg) translate3d(${-(cam.x + jx)}px, ${-(cam.y + jy)}px, ${-cam.z}px)`;
  return (
    <AbsoluteFill style={{perspective, overflow: 'hidden'}}>
      <div style={{position: 'absolute', left: '50%', top: '50%', width: 0, height: 0, transformStyle: 'preserve-3d', transform: worldT}}>
        {panels.map((p) => (
          <PanelView key={p.id} p={p} f={f} at={at} ev={ev} b={b} look={look} dark={dark} blur={p.dof === false ? 0 : Math.min(18, Math.abs((p.z ?? 0) - cam.z) * dofK)} depth={(p.z ?? 0) - cam.z + d} perspective={perspective} />
        ))}
      </div>
    </AbsoluteFill>
  );
};

/** Screen-space panels (not affected by the camera): stickers, pop-ups over captions. */
export const Overlay: React.FC<{f: number; panels: PanelSpec[]; at: (a: At) => number; ev: (n: string, fb?: number) => number; b: (n: number) => number; look: 'soft' | 'neon' | 'flat'; dark: boolean}> = ({f, panels, at, ev, b, look, dark}) => (
  <AbsoluteFill>
    <div style={{position: 'absolute', left: '50%', top: '50%', width: 0, height: 0}}>
      {panels.map((p) => (
        <PanelView key={p.id} p={p} f={f} at={at} ev={ev} b={b} look={look} dark={dark} blur={0} depth={0} perspective={2000} />
      ))}
    </div>
  </AbsoluteFill>
);

const PanelView: React.FC<{p: PanelSpec; f: number; at: (a: At) => number; ev: (n: string, fb?: number) => number; b: (n: number) => number; look: string; dark: boolean; blur: number; depth: number; perspective: number}> = ({
  p,
  f,
  at,
  ev,
  b,
  look,
  dark,
  blur,
  depth,
  perspective,
}) => {
  const {fps} = useVideoConfig();
  const brand = useBrand();
  const s0 = p.from !== undefined ? at(p.from) : -1e6;
  const s1 = p.to !== undefined ? at(p.to) : 1e6;
  const enterDur = ms(fps, p.enter === 'pop' ? 500 : 750);
  const exitDur = ms(fps, 380);
  if (f < s0 - 1 || f > s1 + exitDur) return null;
  if (depth >= perspective - 40) return null; // behind the camera

  // entrance
  let ty = 0;
  let sc = 1;
  let op = 1;
  let eb = 0;
  let gx = 1;
  const e = p.enter ?? 'rise';
  if (s0 > -1e5 && e !== 'none') {
    const t = tween(f, s0, s0 + enterDur, 0, 1, EASE.premium);
    if (e === 'rise') [ty, op] = [(1 - t) * 140, clamp01(t * 1.6)];
    if (e === 'drop') [ty, op] = [-(1 - t) * 140, clamp01(t * 1.6)];
    if (e === 'fade') [op, eb] = [t, (1 - t) * 16];
    if (e === 'grow') [gx, op] = [0.08 + 0.92 * t, clamp01(t * 3)];
    if (e === 'pop') {
      const k = sp(f, s0, fps, 0.62, 2.4);
      sc = 0.72 + 0.28 * k;
      op = clamp01(tween(f, s0, s0 + ms(fps, 200), 0, 1));
    }
  }
  if (s1 < 1e5 && f > s1) {
    const q = tween(f, s1, s1 + exitDur, 0, 1, EASE.exit);
    const x = p.exit ?? 'fade';
    if (x === 'fade') [op, eb] = [op * (1 - q), eb + q * 14];
    if (x === 'fall') [op, ty] = [op * (1 - q), ty + q * 120];
    if (x === 'pop') [op, sc] = [op * (1 - q), sc * (1 - 0.15 * q)];
  }
  const fl = p.float ?? 6;
  const fy = drift(f, `pf-${p.id}`, fl, 280);
  const totalBlur = blur + eb;

  const chrome = p.chrome ?? 'card';
  const neon = look === 'neon';
  const Screen = p.screen ? SCREENS[p.screen] : null;
  if (p.screen && !Screen) throw new Error(`Panel ${p.id}: screen "${p.screen}" is not registered`);
  const lw = p.lw ?? p.w;
  const lh = p.lh ?? p.h;
  const content = Screen ? <Screen f={f} ev={ev} b={b} fps={fps} dark={dark || neon} {...(p.props ?? {})} /> : null;

  let body: React.ReactNode;
  if (chrome === 'phone') body = <Phone height={p.h}>{content}</Phone>;
  else if (chrome === 'laptop') body = <Laptop width={p.w}>{content}</Laptop>;
  else if (chrome === 'browser') body = <Browser width={p.w} url={p.url} dark={dark || neon}>{content}</Browser>;
  else {
    const r = p.radius ?? (chrome === 'none' ? 0 : 28);
    const bg = chrome === 'none' ? 'transparent' : chrome === 'glass' ? (neon ? 'rgba(18,20,20,0.72)' : 'rgba(255,255,255,0.72)') : (brand.panel ?? (neon || dark ? '#0E0F10' : '#FFFFFF'));
    const shadow =
      chrome === 'none'
        ? undefined
        : neon || dark
          ? [`0 0 0 1px ${brand.panelBorder ?? 'rgba(255,255,255,0.08)'}`, '0 30px 90px rgba(0,0,0,0.65)', p.glow ? `0 0 0 1.5px ${withAlpha(brand.accent, 0.75)}, 0 0 70px ${withAlpha(brand.accent, 0.35)}` : ''].filter(Boolean).join(', ')
          : [`0 0 0 1px ${brand.panelBorder ?? 'rgba(20,20,30,0.05)'}`, '0 2px 6px rgba(30,20,40,0.05)', '0 24px 60px rgba(40,30,60,0.10)', '0 70px 140px rgba(40,30,60,0.10)', p.glow ? `0 0 0 2px ${withAlpha(brand.accent, 0.6)}` : ''].filter(Boolean).join(', ');
    body = (
      <div style={{width: p.w, height: p.h, borderRadius: r, background: bg, boxShadow: shadow, overflow: 'hidden', position: 'relative', backdropFilter: chrome === 'glass' ? 'blur(18px)' : undefined}}>
        {content ? (
          <div style={{width: lw, height: lh, transform: `scale(${p.w / lw}, ${p.h / lh})`, transformOrigin: '0 0'}}>{content}</div>
        ) : null}
      </div>
    );
  }
  const bw = chrome === 'phone' ? p.h * 0.4847 : p.w;
  const bh = chrome === 'phone' || chrome === 'laptop' || chrome === 'browser' ? undefined : p.h;
  return (
    <div
      style={{
        position: 'absolute',
        left: (p.x ?? 0) - bw / 2,
        top: (p.y ?? 0) - (bh ?? p.h) / 2,
        width: bw,
        transform: `translate3d(0, ${ty + fy}px, ${p.z ?? 0}px) rotateX(${p.rx ?? 0}deg) rotateY(${p.ry ?? 0}deg) rotateZ(${p.rz ?? 0}deg) scale(${sc * gx}, ${sc})`,
        opacity: op,
        filter: totalBlur > 0.4 ? `blur(${totalBlur.toFixed(1)}px)` : undefined,
        transformStyle: 'flat',
      }}
    >
      {body}
    </div>
  );
};
