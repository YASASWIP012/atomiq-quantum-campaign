// Interaction primitives for rebuilt product UI: the "trigger" half of trigger → reaction → payoff.
// All positions are in the coordinate space of whatever they're placed in (usually a device screen
// at logical size), all timing in scene frames.
import React from 'react';
import {useVideoConfig} from 'remotion';
import {EASE, keys, ms, sp, tween, clamp01} from '../lib/motion';
import {withAlpha} from '../lib/scene';

/** Desktop pointer. path: waypoints [frame, x, y]; clicks: frames. Moves ease-in-out, arrives ~2 frames before a click. */
export const Cursor: React.FC<{f: number; path: Array<[number, number, number]>; clicks?: number[]; size?: number; color?: string; showFrom?: number}> = ({
  f,
  path,
  clicks = [],
  size = 26,
  color = '#111114',
  showFrom,
}) => {
  const {fps} = useVideoConfig();
  const x = keys(f, path.map(([fr, px]) => [fr, px, EASE.move] as [number, number, typeof EASE.move]));
  const y = keys(f, path.map(([fr, , py]) => [fr, py, EASE.move] as [number, number, typeof EASE.move]));
  const appear = showFrom === undefined ? 1 : tween(f, showFrom, showFrom + ms(fps, 200), 0, 1, EASE.premium);
  let press = 1;
  let ripple: React.ReactNode = null;
  for (const c of clicks) {
    if (f >= c - 4 && f <= c + ms(fps, 450)) {
      press = Math.min(press, keys(f, [[c - 4, 1], [c, 0.84, EASE.premium], [c + 8, 1, EASE.premium]]));
      const p = tween(f, c, c + ms(fps, 450), 0, 1, EASE.enter);
      ripple = (
        <div style={{position: 'absolute', left: -size * 1.1 * p, top: -size * 1.1 * p, width: size * 2.2 * p, height: size * 2.2 * p, borderRadius: '50%', border: `${size * 0.08}px solid ${withAlpha(color, 0.35 * (1 - p))}`, background: withAlpha(color, 0.08 * (1 - p))}} />
      );
    }
  }
  return (
    <div style={{position: 'absolute', left: x, top: y, width: 0, height: 0, opacity: appear, zIndex: 50}}>
      {ripple}
      <svg width={size} height={size * 1.3} viewBox="0 0 20 26" style={{position: 'absolute', left: -size * 0.12, top: -size * 0.08, transform: `scale(${press})`, transformOrigin: '10% 8%', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.25))'}}>
        <path d="M1.5 1.5 L1.5 20.5 L6.5 15.8 L10 24 L13.4 22.6 L9.9 14.5 L16.6 14.5 Z" fill={color} stroke="#fff" strokeWidth={1.6} strokeLinejoin="round" />
      </svg>
    </div>
  );
};

/** Touch: a soft finger dot that presses and leaves a ring. */
export const Tap: React.FC<{f: number; at: number; x: number; y: number; size?: number; color?: string}> = ({f, at, x, y, size = 64, color = '#111114'}) => {
  const {fps} = useVideoConfig();
  const lead = ms(fps, 220);
  if (f < at - lead || f > at + ms(fps, 600)) return null;
  const inP = tween(f, at - lead, at, 0, 1, EASE.premium);
  const press = keys(f, [[at - lead, 1.2], [at, 0.9, EASE.premium], [at + 6, 1, EASE.premium]]);
  const out = tween(f, at + ms(fps, 200), at + ms(fps, 600), 0, 1, EASE.exit);
  const ring = tween(f, at, at + ms(fps, 500), 0, 1, EASE.enter);
  return (
    <div style={{position: 'absolute', left: x, top: y, width: 0, height: 0, zIndex: 50}}>
      <div style={{position: 'absolute', left: (-size * (1 + ring * 0.9)) / 2, top: (-size * (1 + ring * 0.9)) / 2, width: size * (1 + ring * 0.9), height: size * (1 + ring * 0.9), borderRadius: '50%', border: `2px solid ${withAlpha(color, 0.3 * (1 - ring))}`}} />
      <div style={{position: 'absolute', left: -size / 2, top: -size / 2, width: size, height: size, borderRadius: '50%', background: withAlpha(color, 0.18), boxShadow: `0 0 0 2px ${withAlpha('#ffffff', 0.7)}`, transform: `scale(${press})`, opacity: inP * (1 - out)}} />
    </div>
  );
};

/**
 * Point at the exact thing: dot ON the element, hairline out, short label.
 * Hold it ≥ 1 s and keep the camera still while it's up.
 */
export const Callout: React.FC<{
  f: number;
  at: number;
  until?: number;
  x: number;
  y: number;
  label: string;
  side?: 'left' | 'right' | 'top' | 'bottom';
  len?: number;
  color?: string;
  ink?: string;
  bg?: string;
  scale?: number;
  font?: string;
}> = ({f, at, until, x, y, label, side = 'right', len = 90, color = '#2457e6', ink = '#111114', bg = '#ffffff', scale = 1, font = 'Inter'}) => {
  const {fps} = useVideoConfig();
  if (f < at) return null;
  const dot = clamp01(sp(f, at, fps, 0.55, 3)) + (sp(f, at, fps, 0.55, 3) - 1) * 0.6;
  const line = tween(f, at + 3, at + 3 + ms(fps, 260), 0, 1, EASE.premium);
  const lab = tween(f, at + 8, at + 8 + ms(fps, 360), 0, 1, EASE.premium);
  const out = until === undefined ? 0 : tween(f, until, until + ms(fps, 220), 0, 1, EASE.exit);
  const horiz = side === 'left' || side === 'right';
  const dir = side === 'right' || side === 'bottom' ? 1 : -1;
  const L = len * scale;
  const d = 12 * scale;
  return (
    <div style={{position: 'absolute', left: x, top: y, width: 0, height: 0, zIndex: 60, opacity: 1 - out}}>
      <div style={{position: 'absolute', left: (-d * Math.max(0, dot)) / 2, top: (-d * Math.max(0, dot)) / 2, width: d * Math.max(0, dot), height: d * Math.max(0, dot), borderRadius: '50%', background: color, boxShadow: `0 0 0 ${3 * scale}px ${withAlpha('#ffffff', 0.95)}, 0 ${2 * scale}px ${8 * scale}px rgba(0,0,0,0.25)`}} />
      <div
        style={{
          position: 'absolute',
          background: color,
          ...(horiz
            ? {top: -scale, height: 2 * scale, width: L * line, left: dir > 0 ? d * 0.7 : -d * 0.7 - L * line}
            : {left: -scale, width: 2 * scale, height: L * line, top: dir > 0 ? d * 0.7 : -d * 0.7 - L * line}),
        }}
      />
      <div
        style={{
          position: 'absolute',
          whiteSpace: 'nowrap',
          fontFamily: font,
          fontWeight: 600,
          fontSize: 22 * scale,
          letterSpacing: '-0.01em',
          color: ink,
          background: bg,
          padding: `${8 * scale}px ${14 * scale}px`,
          borderRadius: 999,
          boxShadow: `0 ${4 * scale}px ${16 * scale}px rgba(0,0,0,0.12), 0 0 0 ${scale}px rgba(0,0,0,0.05)`,
          opacity: lab,
          ...(horiz
            ? {top: -19 * scale, [dir > 0 ? 'left' : 'right']: d * 0.7 + L + 6 * scale, transform: `translateX(${(1 - lab) * -10 * dir * scale}px)`}
            : {left: 0, [dir > 0 ? 'top' : 'bottom']: d * 0.7 + L + 6 * scale, transform: `translate(-50%, ${(1 - lab) * -10 * dir * scale}px)`}),
        }}
      >
        {label}
      </div>
    </div>
  );
};

/** Checkmark that draws itself (payoff). */
export const Check: React.FC<{f: number; at: number; size?: number; color?: string; bg?: string}> = ({f, at, size = 44, color = '#ffffff', bg = '#1fa463'}) => {
  const {fps} = useVideoConfig();
  const s = sp(f, at, fps, 0.6, 2.6);
  const d = tween(f, at + 4, at + 4 + ms(fps, 320), 0, 1, EASE.premium);
  return (
    <div style={{width: size, height: size, borderRadius: '50%', background: bg, transform: `scale(${Math.max(0, s)})`, display: 'grid', placeItems: 'center'}}>
      <svg width={size * 0.56} height={size * 0.56} viewBox="0 0 24 24">
        <path d="M4 12.5 L9.5 18 L20 6.5" fill="none" stroke={color} strokeWidth={3.2} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - d} />
      </svg>
    </div>
  );
};

/** Progress bar fill (linear is allowed for progress). */
export const Progress: React.FC<{f: number; f0: number; f1: number; width: number; height?: number; color: string; track?: string}> = ({f, f0, f1, width, height = 8, color, track = 'rgba(0,0,0,0.08)'}) => {
  const p = tween(f, f0, f1, 0, 1, EASE.camera);
  return (
    <div style={{width, height, borderRadius: height, background: track, overflow: 'hidden'}}>
      <div style={{width: width * p, height, borderRadius: height, background: color}} />
    </div>
  );
};

/** Pop-in wrapper: spring scale + clamped opacity. For UI elements appearing as a reaction. */
export const PopIn: React.FC<{f: number; at: number; from?: number; zeta?: number; hz?: number; y?: number; children: React.ReactNode; style?: React.CSSProperties; origin?: string}> = ({
  f,
  at,
  from = 0.86,
  zeta = 0.62,
  hz = 2.6,
  y = 14,
  children,
  style,
  origin = '50% 50%',
}) => {
  const {fps} = useVideoConfig();
  const s = sp(f, at, fps, zeta, hz);
  const o = clamp01(tween(f, at, at + ms(fps, 180), 0, 1, EASE.premium));
  return <div style={{transform: `translateY(${(1 - s) * y}px) scale(${from + (1 - from) * s})`, opacity: o, transformOrigin: origin, ...style}}>{children}</div>;
};
