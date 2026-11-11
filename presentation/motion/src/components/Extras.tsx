// Showpiece primitives for long-form films.
import React from 'react';
import {useVideoConfig, random} from 'remotion';
import {EASE, keys, ms, sp, tween, clamp01, drift} from '../lib/motion';
import {withAlpha} from '../lib/scene';

/** Text typed into a field with a blinking caret. cps = characters per second. */
export const TypeText: React.FC<{f: number; text: string; at: number; cps?: number; caret?: boolean; caretColor?: string; placeholder?: string; placeholderColor?: string; style?: React.CSSProperties}> = ({
  f,
  text,
  at,
  cps = 14,
  caret = true,
  caretColor = 'currentColor',
  placeholder,
  placeholderColor = 'rgba(0,0,0,0.35)',
  style,
}) => {
  const {fps} = useVideoConfig();
  const n = f < at ? 0 : Math.min(text.length, Math.floor(((f - at) / fps) * cps) + 1);
  const typing = f >= at && n < text.length;
  const blinkOn = typing || Math.floor(f / Math.round(fps * 0.5)) % 2 === 0;
  return (
    <span style={{whiteSpace: 'pre', ...style}}>
      {n === 0 && placeholder ? <span style={{color: placeholderColor}}>{placeholder}</span> : text.slice(0, n)}
      {caret && f >= at - fps ? <span style={{display: 'inline-block', width: '0.06em', height: '1.1em', marginLeft: '0.04em', verticalAlign: '-0.18em', background: caretColor, opacity: blinkOn ? 1 : 0}} /> : null}
    </span>
  );
};

/** Toggle switch that flips on at `at`. */
export const Toggle: React.FC<{f: number; at: number; size?: number; on?: string; off?: string}> = ({f, at, size = 44, on = '#2fbf71', off = 'rgba(0,0,0,0.12)'}) => {
  const {fps} = useVideoConfig();
  const t = tween(f, at, at + ms(fps, 260), 0, 1, EASE.premium);
  return (
    <div style={{width: size * 1.7, height: size, borderRadius: size, background: t > 0.5 ? on : off, position: 'relative', boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.12)'}}>
      <div style={{position: 'absolute', top: size * 0.08, left: size * 0.08 + t * size * 0.7, width: size * 0.84, height: size * 0.84, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.25)'}} />
    </div>
  );
};

/** Contribution-style grid that fills column by column from f0 to f1 (escalation: one → many). */
export const FillGrid: React.FC<{f: number; f0: number; f1: number; cols: number; rows: number; cell: number; gap?: number; color: string; empty?: string; seed?: string; radius?: number}> = ({
  f,
  f0,
  f1,
  cols,
  rows,
  cell,
  gap = 4,
  color,
  empty = 'rgba(0,0,0,0.06)',
  seed = 'g',
  radius = 3,
}) => {
  const p = tween(f, f0, f1, 0, 1, EASE.camera);
  const total = cols * rows;
  return (
    <div style={{display: 'grid', gridTemplateColumns: `repeat(${cols}, ${cell}px)`, gridAutoFlow: 'column', gridTemplateRows: `repeat(${rows}, ${cell}px)`, gap}}>
      {Array.from({length: total}, (_, i) => {
        const on = i / total < p;
        const pop = on ? clamp01((p - i / total) * total * 0.25) : 0;
        const a = 0.35 + random(`${seed}${i}`) * 0.65;
        return <div key={i} style={{width: cell, height: cell, borderRadius: radius, background: on ? withAlpha(color, a) : empty, transform: `scale(${0.7 + 0.3 * pop})`}} />;
      })}
    </div>
  );
};

/** Slot roll: a column of words spins up and lands on the last one ("in 2024 / in 2023 / … → anytime"). */
export const Roll: React.FC<{f: number; words: React.ReactNode[]; at: number; durMs?: number; lineHeight?: number; style?: React.CSSProperties}> = ({f, words, at, durMs = 1100, lineHeight = 1.1, style}) => {
  const {fps} = useVideoConfig();
  const n = words.length;
  const p = tween(f, at, at + ms(fps, durMs), 0, 1, EASE.enter);
  const idx = p * (n - 1);
  const vel = Math.abs(tween(f, at, at + ms(fps, durMs), 0, 1, EASE.enter) - tween(f - 1, at, at + ms(fps, durMs), 0, 1, EASE.enter)) * (n - 1);
  return (
    <span style={{display: 'inline-block', position: 'relative', height: `${lineHeight}em`, overflow: 'hidden', verticalAlign: 'bottom', WebkitMaskImage: 'linear-gradient(transparent, #000 25%, #000 75%, transparent)', ...style}}>
      <span style={{visibility: 'hidden', whiteSpace: 'pre'}}>{words[Math.round(idx)]}</span>
      <span style={{position: 'absolute', left: 0, top: 0, transform: `translateY(${-idx * lineHeight}em)`, filter: vel > 0.02 ? `blur(${Math.min(6, vel * 40)}px)` : undefined}}>
        {words.map((w, i) => (
          <span key={i} style={{display: 'block', height: `${lineHeight}em`, whiteSpace: 'pre', opacity: 1 - Math.min(0.75, Math.abs(i - idx) * 0.55)}}>
            {w}
          </span>
        ))}
      </span>
    </span>
  );
};

/** One flip-clock digit. Flips when `value` changes at frame `changedAt`. */
const FlipDigit: React.FC<{f: number; value: string; prev: string; changedAt: number; size: number; color: string; tile: string}> = ({f, value, prev, changedAt, size, color, tile}) => {
  const {fps} = useVideoConfig();
  const p = tween(f, changedAt, changedAt + ms(fps, 260), 0, 1, EASE.move);
  const w = size * 0.72;
  const h = size;
  const half = (v: string, top: boolean, extra: React.CSSProperties = {}) => (
    <div style={{position: 'absolute', left: 0, width: w, height: h / 2, top: top ? 0 : h / 2, overflow: 'hidden', background: tile, borderRadius: top ? `${size * 0.1}px ${size * 0.1}px 0 0` : `0 0 ${size * 0.1}px ${size * 0.1}px`, ...extra}}>
      <div style={{position: 'absolute', left: 0, width: w, height: h, top: top ? 0 : -h / 2, display: 'grid', placeItems: 'center', fontSize: size * 0.62, fontWeight: 600, color, fontVariantNumeric: 'tabular-nums'}}>{v}</div>
    </div>
  );
  return (
    <div style={{position: 'relative', width: w, height: h, perspective: size * 4}}>
      {half(value, true)}
      {half(p < 0.5 ? prev : value, false)}
      {p < 1 ? (p < 0.5 ? half(prev, true, {transformOrigin: '50% 100%', transform: `rotateX(${-p * 180}deg)`}) : half(value, false, {transformOrigin: '50% 0%', transform: `rotateX(${(1 - p) * 180}deg)`})) : null}
      <div style={{position: 'absolute', left: 0, right: 0, top: h / 2 - 0.5, height: 1, background: 'rgba(0,0,0,0.6)'}} />
    </div>
  );
};

/** Countdown flip clock: DAYS HOURS MIN SEC ticking down one second per `tick` frames. */
export const FlipClock: React.FC<{f: number; start: number; startSeconds: number; tick?: number; size?: number; color?: string; tile?: string; labels?: boolean; labelColor?: string}> = ({
  f,
  start,
  startSeconds,
  tick,
  size = 64,
  color = '#e9e9ea',
  tile = '#151617',
  labels = true,
  labelColor = 'rgba(255,255,255,0.4)',
}) => {
  const {fps} = useVideoConfig();
  const step = tick ?? fps;
  const n = Math.max(0, Math.floor((f - start) / step));
  const fmt = (s: number) => {
    const d = Math.floor(s / 86400), hh = Math.floor((s % 86400) / 3600), mm = Math.floor((s % 3600) / 60), ss = s % 60;
    return [String(d).padStart(3, '0'), String(hh).padStart(2, '0'), String(mm).padStart(2, '0'), String(ss).padStart(2, '0')];
  };
  const cur = fmt(Math.max(0, startSeconds - n));
  const prv = fmt(Math.max(0, startSeconds - Math.max(0, n - 1)));
  const changedAt = start + n * step;
  const names = ['DAYS', 'HOURS', 'MIN', 'SEC'];
  return (
    <div style={{display: 'flex', alignItems: 'flex-start', gap: size * 0.28, fontFamily: 'Inter'}}>
      {cur.map((g, gi) => (
        <React.Fragment key={gi}>
          {gi > 0 ? <div style={{color, opacity: 0.5, fontSize: size * 0.5, lineHeight: `${size}px`}}>:</div> : null}
          <div style={{display: 'flex', flexDirection: 'column', alignItems: 'center', gap: size * 0.16}}>
            <div style={{display: 'flex', gap: size * 0.08}}>
              {[...g].map((ch, ci) => (
                <FlipDigit key={ci} f={f} value={ch} prev={prv[gi][ci]} changedAt={prv[gi][ci] !== ch ? changedAt : -1e6} size={size} color={color} tile={tile} />
              ))}
            </div>
            {labels ? <div style={{fontSize: size * 0.17, letterSpacing: '0.12em', color: labelColor}}>{names[gi]}</div> : null}
          </div>
        </React.Fragment>
      ))}
    </div>
  );
};

/** Big extruded 3D type (layered shadows + gradient face). The "Q4?" moment. */
export const Extrude: React.FC<{f: number; at: number; text: string; size: number; face?: string; side?: string; depth?: number; tilt?: [number, number]; font?: string; weight?: number}> = ({
  f,
  at,
  text,
  size,
  face = 'linear-gradient(180deg, #f4fff0 0%, #b9ff4a 45%, #59c400 100%)',
  side = '#2c6b00',
  depth = 22,
  tilt = [14, -18],
  font = 'Inter',
  weight = 800,
}) => {
  const {fps} = useVideoConfig();
  const k = sp(f, at, fps, 0.6, 1.8);
  const ry = tilt[1] * (1 - k) + drift(f, 'ex', 4, 200);
  const rx = tilt[0] * (1 - k) * 0.6 + 6;
  const shadows = Array.from({length: depth}, (_, i) => `${(i + 1) * 0.6}px ${(i + 1) * 1}px 0 ${side}`).join(', ');
  return (
    <div style={{perspective: size * 6, display: 'inline-block'}}>
      <div style={{transform: `rotateX(${rx}deg) rotateY(${ry}deg) scale(${0.6 + 0.4 * k})`, opacity: clamp01(k * 2), position: 'relative', fontFamily: font, fontWeight: weight, fontSize: size, letterSpacing: '-0.05em', lineHeight: 1}}>
        <span style={{position: 'absolute', left: 0, top: 0, color: side, textShadow: `${shadows}, 0 ${depth * 2}px ${depth * 3}px rgba(0,0,0,0.6)`}}>{text}</span>
        <span style={{position: 'relative', backgroundImage: face, WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent'}}>{text}</span>
      </div>
    </div>
  );
};

/** Bright colour flash bloom (use sparingly — never more than ~3 flashes per second, WCAG). */
export const Bloom: React.FC<{f: number; at: number; color: string; durMs?: number; peak?: number}> = ({f, at, color, durMs = 520, peak = 0.95}) => {
  const {fps} = useVideoConfig();
  const n = ms(fps, durMs);
  if (f < at - n / 2 || f > at + n) return null;
  const a = keys(f, [[at - n / 2, 0], [at, peak, EASE.exit], [at + n, 0, EASE.enter]]);
  return <div style={{position: 'absolute', inset: 0, background: `radial-gradient(ellipse 70% 70% at 50% 50%, ${withAlpha(color, a)} 0%, ${withAlpha(color, a * 0.7)} 45%, ${withAlpha(color, a * 0.25)} 100%)`, pointerEvents: 'none'}} />;
};
