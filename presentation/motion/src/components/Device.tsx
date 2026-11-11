// Device frames drawn in CSS (no bitmaps, so they stay sharp at any zoom). Screens are authored at
// logical sizes — phone 393×852, laptop/browser 1440×900 — and scaled to fit, so UI can be rebuilt
// in code with real proportions and every element can animate on its own.
import React from 'react';
import {Img, staticFile} from 'remotion';

export const PHONE = {w: 393, h: 852};
export const DESK = {w: 1440, h: 900};

/** Geometry of each frame, so scenes can map screen coordinates → canvas (camera focus, callouts). */
export type Geom = {W: number; H: number; screenX: number; screenY: number; scale: number; lw: number; lh: number};

export function phoneGeom(height: number): Geom {
  const W = height * 0.4847;
  const b = W * 0.042;
  const s = (W - 2 * b) / PHONE.w;
  return {W, H: PHONE.h * s + 2 * b, screenX: b, screenY: b, scale: s, lw: PHONE.w, lh: PHONE.h};
}

export function laptopGeom(width: number): Geom {
  const side = width * 0.018;
  const top = width * 0.022;
  const bottom = width * 0.026;
  const s = (width - 2 * side) / DESK.w;
  const lidH = DESK.h * s + top + bottom;
  return {W: width, H: lidH + width * 0.032, screenX: side, screenY: top, scale: s, lw: DESK.w, lh: DESK.h};
}

export function browserGeom(width: number): Geom {
  const s = width / DESK.w;
  return {W: width, H: DESK.h * s, screenX: 0, screenY: 46 * s, scale: s, lw: DESK.w, lh: DESK.h - 46};
}

const shadow = (k = 1) =>
  [
    `0 ${1 * k}px ${2 * k}px rgba(16,16,20,0.08)`,
    `0 ${8 * k}px ${18 * k}px rgba(16,16,20,0.08)`,
    `0 ${28 * k}px ${60 * k}px rgba(16,16,20,0.12)`,
    `0 ${60 * k}px ${120 * k}px rgba(16,16,20,0.10)`,
  ].join(', ');

/** Glass sheen band. pos: -1 → 1 sweeps it across. */
export const Sheen: React.FC<{pos: number; strength?: number; angle?: number}> = ({pos, strength = 0.14, angle = 115}) => {
  if (pos <= -1 || pos >= 1) return null;
  const c = 50 + pos * 70;
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        background: `linear-gradient(${angle}deg, rgba(255,255,255,0) ${c - 14}%, rgba(255,255,255,${strength}) ${c}%, rgba(255,255,255,0) ${c + 14}%)`,
        mixBlendMode: 'screen',
      }}
    />
  );
};

/** Screen content: an image/video path in /public, or children authored at logical size. */
const ScreenContent: React.FC<{lw: number; lh: number; scale: number; src?: string; children?: React.ReactNode; bg?: string}> = ({lw, lh, scale, src, children, bg = '#fff'}) => (
  <div style={{position: 'absolute', left: 0, top: 0, width: lw, height: lh, transform: `scale(${scale})`, transformOrigin: '0 0', background: bg, overflow: 'hidden'}}>
    {src ? <Img src={staticFile(src)} style={{width: '100%', height: '100%', objectFit: 'cover', display: 'block'}} /> : children}
  </div>
);

export const Phone: React.FC<{
  height: number;
  src?: string;
  children?: React.ReactNode;
  tone?: 'graphite' | 'silver' | 'white';
  sheen?: number;
  shadowK?: number;
  island?: boolean;
  screenBg?: string;
  style?: React.CSSProperties;
}> = ({height, src, children, tone = 'graphite', sheen = -2, shadowK = 1, island = true, screenBg, style}) => {
  const W = height * 0.4847;
  const b = W * 0.042; // bezel
  const innerW = W - 2 * b;
  const s = innerW / PHONE.w;
  const innerH = PHONE.h * s;
  const H = innerH + 2 * b;
  const R = W * 0.175;
  const rim =
    tone === 'silver'
      ? 'linear-gradient(135deg, #f2f2f4, #bfc1c6 40%, #e9e9ec 60%, #a9abb0)'
      : tone === 'white'
        ? 'linear-gradient(135deg, #ffffff, #e4e4e7 50%, #f5f5f6)'
        : 'linear-gradient(135deg, #5a5a60, #26262a 35%, #47474d 60%, #1b1b1e)';
  const btn = (side: 'l' | 'r', top: number, h: number) => (
    <div style={{position: 'absolute', [side === 'l' ? 'left' : 'right']: -W * 0.011, top: H * top, width: W * 0.016, height: H * h, borderRadius: W * 0.01, background: rim}} />
  );
  return (
    <div style={{position: 'relative', width: W, height: H, ...style}}>
      {btn('l', 0.17, 0.035)}
      {btn('l', 0.24, 0.065)}
      {btn('l', 0.32, 0.065)}
      {btn('r', 0.26, 0.1)}
      <div style={{position: 'absolute', inset: 0, borderRadius: R, background: rim, boxShadow: shadow(shadowK * (height / 900))}}>
        <div style={{position: 'absolute', inset: W * 0.007, borderRadius: R - W * 0.007, background: '#050506'}} />
        <div style={{position: 'absolute', left: b, top: b, width: innerW, height: innerH, borderRadius: R - b, overflow: 'hidden', background: screenBg ?? '#fff'}}>
          <ScreenContent lw={PHONE.w} lh={PHONE.h} scale={s} src={src} bg={screenBg}>
            {children}
          </ScreenContent>
          {island ? (
            <div style={{position: 'absolute', left: innerW / 2 - 63 * s, top: 11 * s, width: 126 * s, height: 37 * s, borderRadius: 20 * s, background: '#000'}} />
          ) : null}
          <Sheen pos={sheen} />
        </div>
      </div>
    </div>
  );
};

export const Laptop: React.FC<{width: number; src?: string; children?: React.ReactNode; sheen?: number; shadowK?: number; screenBg?: string; style?: React.CSSProperties}> = ({
  width,
  src,
  children,
  sheen = -2,
  shadowK = 1,
  screenBg,
  style,
}) => {
  const W = width;
  const side = W * 0.018;
  const top = W * 0.022;
  const bottom = W * 0.026;
  const innerW = W - 2 * side;
  const s = innerW / DESK.w;
  const innerH = DESK.h * s;
  const lidH = innerH + top + bottom;
  const baseW = W * 1.14;
  const baseH = W * 0.032;
  return (
    <div style={{position: 'relative', width: W, height: lidH + baseH, ...style}}>
      <div style={{position: 'absolute', left: 0, top: 0, width: W, height: lidH, borderRadius: `${W * 0.024}px ${W * 0.024}px ${W * 0.006}px ${W * 0.006}px`, background: '#0b0b0d', boxShadow: `inset 0 0 0 ${Math.max(1, W * 0.0012)}px #3b3b40, ${shadow(shadowK * (W / 1400))}`}}>
        <div style={{position: 'absolute', left: W / 2 - W * 0.004, top: top * 0.36, width: W * 0.008, height: W * 0.008, borderRadius: '50%', background: '#1c1d22'}} />
        <div style={{position: 'absolute', left: side, top, width: innerW, height: innerH, overflow: 'hidden', borderRadius: W * 0.004, background: screenBg ?? '#fff'}}>
          <ScreenContent lw={DESK.w} lh={DESK.h} scale={s} src={src} bg={screenBg}>
            {children}
          </ScreenContent>
          <Sheen pos={sheen} strength={0.1} />
        </div>
      </div>
      <div
        style={{
          position: 'absolute',
          left: (W - baseW) / 2,
          top: lidH - 1,
          width: baseW,
          height: baseH,
          borderRadius: `${baseH * 0.15}px ${baseH * 0.15}px ${baseH * 0.9}px ${baseH * 0.9}px / ${baseH * 0.15}px ${baseH * 0.15}px ${baseH * 0.75}px ${baseH * 0.75}px`,
          background: 'linear-gradient(180deg, #e7e8eb 0%, #c9cbcf 45%, #9fa1a6 100%)',
          boxShadow: `0 ${baseH * 0.6}px ${baseH * 1.2}px rgba(16,16,20,0.18)`,
        }}
      >
        <div style={{position: 'absolute', left: baseW / 2 - W * 0.085, top: 0, width: W * 0.17, height: baseH * 0.32, borderRadius: `0 0 ${baseH * 0.3}px ${baseH * 0.3}px`, background: 'linear-gradient(180deg, #a9abb0, #c4c6ca)'}} />
      </div>
    </div>
  );
};

export const Browser: React.FC<{width: number; url?: string; src?: string; children?: React.ReactNode; dark?: boolean; shadowK?: number; style?: React.CSSProperties}> = ({
  width,
  url = '',
  src,
  children,
  dark = false,
  shadowK = 1,
  style,
}) => {
  const s = width / DESK.w;
  const bar = 46 * s;
  const contentH = (DESK.h - 46) * s;
  return (
    <div style={{position: 'relative', width, height: bar + contentH, borderRadius: 14 * s, overflow: 'hidden', background: dark ? '#1b1b1f' : '#fff', boxShadow: `inset 0 0 0 ${Math.max(1, s)}px rgba(0,0,0,0.08), ${shadow(shadowK * (width / 1400))}`, ...style}}>
      <div style={{height: bar, display: 'flex', alignItems: 'center', padding: `0 ${16 * s}px`, gap: 8 * s, background: dark ? '#232328' : '#f4f4f5', borderBottom: `${Math.max(1, s)}px solid ${dark ? '#2e2e34' : '#e7e7ea'}`}}>
        {['#ff5f57', '#febc2e', '#28c840'].map((c) => (
          <div key={c} style={{width: 12 * s, height: 12 * s, borderRadius: '50%', background: c}} />
        ))}
        <div style={{flex: 1, display: 'flex', justifyContent: 'center'}}>
          <div style={{minWidth: 360 * s, padding: `${5 * s}px ${14 * s}px`, borderRadius: 8 * s, background: dark ? '#2c2c31' : '#fff', color: dark ? '#a1a1aa' : '#71717a', fontSize: 13 * s, fontFamily: 'Inter', textAlign: 'center', boxShadow: dark ? undefined : `0 0 0 ${Math.max(1, s)}px #e7e7ea`}}>{url}</div>
        </div>
        <div style={{width: 60 * s}} />
      </div>
      <div style={{position: 'relative', width, height: contentH, overflow: 'hidden'}}>
        <ScreenContent lw={DESK.w} lh={DESK.h - 46} scale={s} src={src}>
          {children}
        </ScreenContent>
      </div>
    </div>
  );
};

/** 3D tilt wrapper. Keep it subtle in feature scenes (≤ 12°); go big only in hero/dark moments. */
export const Tilt: React.FC<{rx?: number; ry?: number; rz?: number; z?: number; perspective?: number; children: React.ReactNode; style?: React.CSSProperties}> = ({
  rx = 0,
  ry = 0,
  rz = 0,
  z = 0,
  perspective = 2400,
  children,
  style,
}) => (
  <div style={{perspective, ...style}}>
    <div style={{transform: `translateZ(${z}px) rotateX(${rx}deg) rotateY(${ry}deg) rotateZ(${rz}deg)`, transformStyle: 'preserve-3d'}}>{children}</div>
  </div>
);
