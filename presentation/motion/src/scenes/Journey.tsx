// Long-form workhorse: one continuous take through a 3D world of product panels.
// Captions tell the story in screen space; the camera pushes in on what changes and pulls back
// to show scale. Everything is keyed to beats or named events (film.json "events").
import React from 'react';
import {AbsoluteFill} from 'remotion';
import {useScene} from '../lib/scene';
import {useLayout} from '../lib/layout';
import {EASE, keys, ms} from '../lib/motion';
import {LookBackground} from '../components/Look';
import {World, Overlay, PanelSpec, ShotSpec, At} from '../components/World';
import {Caption} from '../components/Caption';
import {Bloom} from '../components/Extras';
import {SCREENS} from '../screens';

type CaptionIn = {at: At; until?: At; text: string; swap?: string[]; swapAt?: At[]; pos?: 'center' | 'top' | 'bottom' | 'left' | 'right' | 'upper' | 'lower' | [number, number]; size?: number; weight?: number; effect?: 'blur' | 'rise'; align?: 'left' | 'center' | 'right'; icon?: string};

export const Journey: React.FC<{
  look?: 'soft' | 'neon' | 'flat';
  panels?: PanelSpec[];
  overlays?: PanelSpec[];
  shots?: ShotSpec[];
  captions?: CaptionIn[];
  pulses?: At[];
  blooms?: Array<{at: At; color?: string}>;
  perspective?: number;
  dofK?: number;
  /** panels laid out for 16:9; for 9:16 they're scaled by this factor around the centre (default 1) */
  tallScale?: number;
}> = ({look, panels = [], overlays = [], shots = [], captions = [], pulses = [], blooms = [], perspective, dofK, tallScale}) => {
  const {f, ev, b, fps, brand, tone, scene} = useScene();
  const L = useLayout();
  const at = (a: At) => (typeof a === 'string' ? ev(a) : b(a));
  const lk = look ?? brand.look ?? 'soft';
  const dark = tone === 'dark';

  // neon floor glow pulses on hits
  let pulse = 0;
  for (const p of pulses) {
    const t = at(p);
    if (f >= t) pulse = Math.max(pulse, keys(f, [[t, 1], [t + ms(fps, 900), 0, EASE.enter]]));
  }

  // 9:16: same world, scaled to fit the narrower frame
  const k = L.tall ? (tallScale ?? 0.62) : L.square ? 0.72 : 1;
  const scaleP = (p: PanelSpec): PanelSpec => (k === 1 ? p : {...p, x: (p.x ?? 0) * k, y: (p.y ?? 0) * k, z: (p.z ?? 0) * k, w: p.w * k, h: p.h * k, lw: p.lw ?? p.w, lh: p.lh ?? p.h});
  const scaleS = (s: ShotSpec): ShotSpec => (k === 1 ? s : {...s, x: s.x !== undefined ? s.x * k : undefined, y: s.y !== undefined ? s.y * k : undefined, z: s.z !== undefined ? s.z * k : undefined});
  const P = panels.map(scaleP);
  const S = shots.map(scaleS);

  const iconFor = (name?: string) => {
    if (!name) return undefined;
    const Icon = SCREENS[name];
    return Icon ? <Icon f={f} ev={ev} b={b} fps={fps} dark={dark || lk === 'neon'} /> : undefined;
  };

  return (
    <AbsoluteFill>
      <LookBackground look={lk} brand={brand} pulse={pulse} dark={dark} />
      <World f={f} panels={P} shots={S} at={at} ev={ev} b={b} look={lk} dark={dark} perspective={perspective} dofK={dofK} seed={scene.id} />
      <Overlay f={f} panels={overlays.map(scaleP)} at={at} ev={ev} b={b} look={lk} dark={dark} />
      <AbsoluteFill>
        {captions.map((c, i) => (
          <Caption
            key={i}
            f={f}
            look={lk}
            dark={dark}
            W={L.w}
            H={L.h}
            tall={L.tall}
            c={{...c, at: at(c.at), until: c.until !== undefined ? at(c.until) : undefined, swapAt: c.swapAt?.map(at), icon: iconFor(c.icon)}}
          />
        ))}
      </AbsoluteFill>
      {blooms.map((bl, i) => (
        <Bloom key={i} f={f} at={at(bl.at)} color={bl.color ?? brand.accent} />
      ))}
    </AbsoluteFill>
  );
};
