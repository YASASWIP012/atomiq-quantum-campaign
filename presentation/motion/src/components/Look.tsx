// Stage looks. A look is the lighting and air around the product — it should be calm so the
// product can be loud.
//   soft  — off-white with slow, blurred colour blobs (Fastlane-style). Calm, premium, light.
//   neon  — near-black with a neon floor glow from below (Trendtrack-style). Cinematic, high-energy.
//   flat  — a single colour (use for the 30 s format or brand-colour moments).
import React from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {noise2D} from '@remotion/noise';
import {withAlpha, Brand} from '../lib/scene';

export type LookName = 'soft' | 'neon' | 'flat';

/** Drifting blurred colour fields on off-white. Radial gradients only (cheap to render). */
export const Aurora: React.FC<{base: string; colors: string[]; strength?: number; speed?: number}> = ({base, colors, strength = 0.5, speed = 1}) => {
  const f = useCurrentFrame();
  const {width: W, height: H} = useVideoConfig();
  const blobs = [
    [0.12, 0.2, 0.55],
    [0.88, 0.16, 0.5],
    [0.2, 0.92, 0.6],
    [0.82, 0.86, 0.55],
    [0.5, 0.5, 0.42],
  ];
  return (
    <AbsoluteFill style={{background: base, overflow: 'hidden'}}>
      {blobs.map(([bx, by, br], i) => {
        const t = (f * speed) / 900;
        const x = (bx + noise2D(`ax${i}`, t, 0) * 0.08) * W;
        const y = (by + noise2D(`ay${i}`, t, 1) * 0.08) * H;
        const r = br * Math.max(W, H) * (1 + noise2D(`ar${i}`, t, 2) * 0.08);
        const c = colors[i % colors.length];
        const a = strength * (i === 4 ? 0.5 : 1);
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: x - r,
              top: y - r,
              width: r * 2,
              height: r * 2,
              borderRadius: '50%',
              background: `radial-gradient(closest-side, ${withAlpha(c, a)}, ${withAlpha(c, a * 0.45)} 45%, ${withAlpha(c, 0)} 100%)`,
            }}
          />
        );
      })}
    </AbsoluteFill>
  );
};

/** Neon floor glow: light rising from below the frame, deep black above. `pulse` 0–1 brightens it (use on hits). */
export const FloorGlow: React.FC<{base?: string; color: string; intensity?: number; pulse?: number; height?: number}> = ({base = '#050606', color, intensity = 1, pulse = 0, height = 0.42}) => {
  const k = Math.min(1.6, intensity * (1 + pulse * 0.6));
  return (
    <AbsoluteFill style={{background: base, overflow: 'hidden'}}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse 70% ${height * 100}% at 50% 104%, ${withAlpha(color, 0.85 * k)} 0%, ${withAlpha(color, 0.38 * k)} 32%, ${withAlpha(color, 0.1 * k)} 62%, ${withAlpha(color, 0)} 100%)`,
        }}
      />
      <AbsoluteFill style={{background: `radial-gradient(ellipse 45% 8% at 50% 100%, ${withAlpha('#ffffff', 0.35 * k)} 0%, ${withAlpha('#ffffff', 0)} 100%)`}} />
      <AbsoluteFill style={{background: 'radial-gradient(ellipse 80% 70% at 50% 40%, rgba(0,0,0,0) 40%, rgba(0,0,0,0.55) 100%)'}} />
    </AbsoluteFill>
  );
};

/** Background for a look, driven by brand tokens. */
export const LookBackground: React.FC<{look: LookName; brand: Brand; pulse?: number; dark?: boolean}> = ({look, brand, pulse = 0, dark}) => {
  if (look === 'neon') return <FloorGlow base={brand.dark} color={brand.accent} pulse={pulse} />;
  if (look === 'soft' && !dark) return <Aurora base={brand.bg} colors={brand.aurora ?? [brand.accent, brand.accent]} strength={brand.auroraStrength ?? 0.32} />;
  return <AbsoluteFill style={{background: dark ? brand.dark : brand.bg}} />;
};
