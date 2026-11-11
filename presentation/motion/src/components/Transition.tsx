// Scene handoffs. A transition is declared ONCE, on the incoming scene (film.json "in"), and this
// wrapper animates both sides: the incoming scene during its last `inLen` frames before the cut,
// and the outgoing scene during the same window. Every transition COMPLETES on the cut, so the
// hit lands on the beat. Default to a cut; a transition should be a decision.
import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {EASE, clamp01} from '../lib/motion';
import {SceneInfo, useBrand} from '../lib/scene';

type Dir = 'left' | 'right' | 'up' | 'down';

const MotionBlur: React.FC<{id: string; sx: number; sy: number; children: React.ReactNode; style?: React.CSSProperties}> = ({id, sx, sy, children, style}) => {
  const on = sx > 0.4 || sy > 0.4;
  return (
    <AbsoluteFill style={{...style, filter: on ? `url(#${id})` : undefined}}>
      {on ? (
        <svg style={{position: 'absolute', width: 0, height: 0}}>
          <filter id={id} x="-20%" y="-20%" width="140%" height="140%" colorInterpolationFilters="sRGB">
            <feGaussianBlur stdDeviation={`${sx.toFixed(2)} ${sy.toFixed(2)}`} />
          </filter>
        </svg>
      ) : null}
      {children}
    </AbsoluteFill>
  );
};

export const TransitionFrame: React.FC<{scene: SceneInfo; children: React.ReactNode}> = ({scene, children}) => {
  const frame = useCurrentFrame();
  const {width: W, height: H} = useVideoConfig();
  const brand = useBrand();
  const f = frame - scene.inLen;

  // ---------- incoming ----------
  if (scene.inLen > 0 && f < 0) {
    const p = clamp01((f + scene.inLen) / scene.inLen);
    const t = scene.in as {type: string; dir?: Dir; origin?: [number, number]; color?: string};
    const [ox, oy] = [(t.origin?.[0] ?? 0.5) * W, (t.origin?.[1] ?? 0.5) * H];
    const R = Math.max(Math.hypot(ox, oy), Math.hypot(W - ox, oy), Math.hypot(ox, H - oy), Math.hypot(W - ox, H - oy)) + 2;
    const color = t.color ?? brand.accent;
    switch (t.type) {
      case 'iris': {
        const r = R * EASE.move(p);
        return <AbsoluteFill style={{clipPath: `circle(${r.toFixed(1)}px at ${ox}px ${oy}px)`}}>{children}</AbsoluteFill>;
      }
      case 'flood': {
        const r1 = R * EASE.move(clamp01(p * 1.3));
        const r2 = R * EASE.move(clamp01((p - 0.26) / 0.74));
        return (
          <AbsoluteFill>
            <AbsoluteFill style={{background: color, clipPath: `circle(${r1.toFixed(1)}px at ${ox}px ${oy}px)`}} />
            <AbsoluteFill style={{clipPath: `circle(${r2.toFixed(1)}px at ${ox}px ${oy}px)`}}>{children}</AbsoluteFill>
          </AbsoluteFill>
        );
      }
      case 'wipe': {
        const dir = t.dir ?? 'right';
        const e1 = EASE.move(clamp01(p * 1.25));
        const e2 = EASE.move(clamp01((p - 0.2) / 0.8));
        const inset = (e: number) =>
          dir === 'right' ? `inset(0 ${(1 - e) * 100}% 0 0)` : dir === 'left' ? `inset(0 0 0 ${(1 - e) * 100}%)` : dir === 'up' ? `inset(${(1 - e) * 100}% 0 0 0)` : `inset(0 0 ${(1 - e) * 100}% 0)`;
        return (
          <AbsoluteFill>
            <AbsoluteFill style={{background: color, clipPath: inset(e1)}} />
            <AbsoluteFill style={{clipPath: inset(e2)}}>{children}</AbsoluteFill>
          </AbsoluteFill>
        );
      }
      case 'whip': {
        const {x, y} = slide(t.dir ?? 'left', EASE.move(p), W, H, 1);
        const blur = Math.sin(Math.PI * p) * 46;
        const horiz = (t.dir ?? 'left') === 'left' || t.dir === 'right';
        return (
          <MotionBlur id={`whip-in-${scene.id}`} sx={horiz ? blur : 0} sy={horiz ? 0 : blur} style={{transform: `translate(${x}px, ${y}px)`}}>
            {children}
          </MotionBlur>
        );
      }
      case 'push': {
        const e = EASE.move(p);
        const {x, y} = slide(t.dir ?? 'left', e, W, H, 0.92);
        const sc = 0.9 + 0.1 * e;
        const rad = 56 * (1 - e);
        return (
          <AbsoluteFill style={{transform: `translate(${x}px, ${y}px) scale(${sc})`, borderRadius: rad, overflow: 'hidden', boxShadow: `0 30px 90px rgba(0,0,0,${0.28 * (1 - e)})`}}>
            {children}
          </AbsoluteFill>
        );
      }
      case 'zoom': {
        const e = EASE.enter(p);
        return (
          <AbsoluteFill style={{transform: `scale(${0.8 + 0.2 * e})`, opacity: clamp01(p * 2.2), filter: p < 0.98 ? `blur(${(1 - e) * 16}px)` : undefined}}>
            {children}
          </AbsoluteFill>
        );
      }
      case 'split': {
        const e = EASE.move(p);
        return <AbsoluteFill style={{clipPath: `inset(${(1 - e) * 50}% 0 ${(1 - e) * 50}% 0)`}}>{children}</AbsoluteFill>;
      }
      case 'blur': {
        return <AbsoluteFill style={{opacity: EASE.sine(p), filter: p < 0.98 ? `blur(${(1 - p) * 20}px)` : undefined}}>{children}</AbsoluteFill>;
      }
      case 'flash': {
        // colour bloom swallows the frame, the new scene is underneath when it clears
        const a = p < 0.6 ? EASE.exit(p / 0.6) : 1 - EASE.premium((p - 0.6) / 0.4);
        return (
          <AbsoluteFill>
            <AbsoluteFill style={{opacity: p >= 0.6 ? 1 : 0}}>{children}</AbsoluteFill>
            <AbsoluteFill style={{background: `radial-gradient(ellipse 75% 75% at 50% 50%, ${color} 0%, ${color} 40%, rgba(0,0,0,0) 100%)`, opacity: a, transform: `scale(${0.6 + 0.6 * EASE.enter(p)})`}} />
          </AbsoluteFill>
        );
      }
      default:
        return <AbsoluteFill>{children}</AbsoluteFill>;
    }
  }

  // ---------- outgoing ----------
  if (scene.outLen > 0 && f >= scene.dur - scene.outLen) {
    const q = clamp01((f - (scene.dur - scene.outLen)) / scene.outLen);
    const t = scene.out as {type: string; dir?: Dir};
    switch (t.type) {
      case 'iris':
      case 'flood':
        return <AbsoluteFill style={{transform: `scale(${1 + 0.05 * EASE.move(q)})`}}>{children}</AbsoluteFill>;
      case 'wipe': {
        // the outgoing scene drifts a little with the wipe, so the frame feels pushed, not erased
        const {x, y} = slide(t.dir ?? 'right', EASE.move(q), W, H, 0.08, true);
        return <AbsoluteFill style={{transform: `translate(${x}px, ${y}px)`}}>{children}</AbsoluteFill>;
      }
      case 'whip': {
        const {x, y} = slide(t.dir ?? 'left', EASE.move(q), W, H, 1, true);
        const blur = Math.sin(Math.PI * q) * 46;
        const horiz = (t.dir ?? 'left') === 'left' || t.dir === 'right';
        return (
          <MotionBlur id={`whip-out-${scene.id}`} sx={horiz ? blur : 0} sy={horiz ? 0 : blur} style={{transform: `translate(${x}px, ${y}px)`}}>
            {children}
          </MotionBlur>
        );
      }
      case 'push': {
        const e = EASE.move(q);
        const {x, y} = slide(t.dir ?? 'left', e, W, H, 0.28, true);
        return (
          <AbsoluteFill style={{transform: `translate(${x}px, ${y}px) scale(${1 - 0.06 * e})`}}>
            {children}
            <AbsoluteFill style={{background: `rgba(0,0,0,${0.22 * e})`}} />
          </AbsoluteFill>
        );
      }
      case 'zoom': {
        const e = EASE.exit(q);
        return <AbsoluteFill style={{transform: `scale(${1 + 0.5 * e})`, opacity: 1 - clamp01((q - 0.45) / 0.55), filter: q > 0.02 ? `blur(${e * 14}px)` : undefined}}>{children}</AbsoluteFill>;
      }
      case 'split': {
        const e = EASE.move(q);
        return (
          <AbsoluteFill>
            <AbsoluteFill style={{clipPath: 'inset(0 0 50% 0)', transform: `translateY(${(-e * H) / 2}px)`}}>{children}</AbsoluteFill>
            <AbsoluteFill style={{clipPath: 'inset(50% 0 0 0)', transform: `translateY(${(e * H) / 2}px)`}}>{children}</AbsoluteFill>
          </AbsoluteFill>
        );
      }
      default:
        return <AbsoluteFill>{children}</AbsoluteFill>;
    }
  }

  return <AbsoluteFill>{children}</AbsoluteFill>;
};

/** Offset for content travelling in `dir`. e: 0→1. amount: fraction of the frame. out=true → leaving. */
function slide(dir: Dir, e: number, W: number, H: number, amount: number, out = false) {
  const s = out ? -e : 1 - e;
  switch (dir) {
    case 'left':
      return {x: s * W * amount, y: 0};
    case 'right':
      return {x: -s * W * amount, y: 0};
    case 'up':
      return {x: 0, y: s * H * amount};
    case 'down':
      return {x: 0, y: -s * H * amount};
  }
}
