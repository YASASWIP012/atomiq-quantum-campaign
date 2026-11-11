// The calm frame around a loud product: quiet background, one soft glow, film grain, vignette.
import React, {createContext, useContext} from 'react';
import {AbsoluteFill, useCurrentFrame, useVideoConfig} from 'remotion';
import {withAlpha} from '../lib/scene';

/** Full-bleed scene background. Every scene draws one (transitions reveal whole scenes). */
export const Backdrop: React.FC<{
  color: string;
  glow?: string; // soft light behind the hero (hex)
  glowAt?: [number, number]; // 0–1 frame coords
  glowSize?: number; // fraction of the long side
  glowOpacity?: number;
  vignette?: number; // 0–1
  children?: React.ReactNode;
}> = ({color, glow, glowAt = [0.62, 0.5], glowSize = 0.55, glowOpacity = 0.35, vignette = 0.06, children}) => {
  const {width, height} = useVideoConfig();
  const r = Math.max(width, height) * glowSize;
  return (
    <AbsoluteFill style={{background: color, overflow: 'hidden'}}>
      {glow ? (
        <div
          style={{
            position: 'absolute',
            left: glowAt[0] * width - r,
            top: glowAt[1] * height - r,
            width: r * 2,
            height: r * 2,
            borderRadius: '50%',
            background: `radial-gradient(closest-side, ${withAlpha(glow, glowOpacity)}, ${withAlpha(glow, glowOpacity * 0.35)} 45%, ${withAlpha(glow, 0)} 100%)`,
          }}
        />
      ) : null}
      {children}
      {vignette > 0 ? (
        <AbsoluteFill style={{background: `radial-gradient(ellipse at 50% 50%, rgba(0,0,0,0) 55%, rgba(0,0,0,${vignette}) 100%)`, pointerEvents: 'none'}} />
      ) : null}
    </AbsoluteFill>
  );
};

/** Animated film grain (seeded by frame — deterministic). Sits on top of the whole film. */
export const Grain: React.FC<{opacity?: number; scale?: number}> = ({opacity = 0.05, scale = 0.9}) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{pointerEvents: 'none', mixBlendMode: 'overlay', opacity}}>
      <svg width="100%" height="100%">
        <filter id="film-grain" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency={scale} numOctaves={2} seed={frame % 97} stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#film-grain)" />
      </svg>
    </AbsoluteFill>
  );
};

// ---------- 2.5D camera ----------
type Cam = {x: number; y: number; zoom: number; rot: number};
const CamCtx = createContext<Cam>({x: 0, y: 0, zoom: 1, rot: 0});

/**
 * Camera over a world laid out in frame pixels. x/y = world point the camera centres on, as an
 * offset from frame centre. Layers inside move by `depth` (1 = foreground, 0.5 mid, 0.2 background).
 * Rules: one camera move per beat; ≤1.5× on UI (text goes soft past that); ~1 s per move; never
 * move the camera while a callout is on screen.
 */
export const Camera: React.FC<{x?: number; y?: number; zoom?: number; rot?: number; children: React.ReactNode}> = ({x = 0, y = 0, zoom = 1, rot = 0, children}) => (
  <CamCtx.Provider value={{x, y, zoom, rot}}>
    <AbsoluteFill>{children}</AbsoluteFill>
  </CamCtx.Provider>
);

export const Layer: React.FC<{depth?: number; children: React.ReactNode; style?: React.CSSProperties}> = ({depth = 1, children, style}) => {
  const c = useContext(CamCtx);
  const {width, height} = useVideoConfig();
  const z = 1 + (c.zoom - 1) * depth;
  const x = c.x * depth;
  const y = c.y * depth;
  return (
    <AbsoluteFill
      style={{
        transformOrigin: '0 0',
        transform: `translate(${width / 2}px, ${height / 2}px) rotate(${c.rot * depth}deg) scale(${z}) translate(${-width / 2 - x}px, ${-height / 2 - y}px)`,
        ...style,
      }}
    >
      {children}
    </AbsoluteFill>
  );
};

export const useCamera = () => useContext(CamCtx);
