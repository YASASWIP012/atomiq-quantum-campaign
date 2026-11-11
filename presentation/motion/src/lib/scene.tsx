import React, {createContext, useContext} from 'react';
import {useCurrentFrame, useVideoConfig} from 'remotion';
import {beatFrame} from '../timeline.js';

export type Brand = {
  bg: string; // calm stage colour (light scenes)
  surface: string; // cards / UI surfaces
  ink: string; // primary text on light
  muted: string; // secondary text on light
  line: string; // hairlines
  accent: string; // the ONE accent colour
  accentInk: string; // text on accent
  dark: string; // stage colour for the one dark scene
  darkInk: string; // text on dark
  fontDisplay: string;
  fontText: string;
  fontMono: string;
  fontSerif: string;
  /** how *emphasis* in copy renders: 'accent' colour or 'serif' italic */
  emphasis?: 'accent' | 'serif';
  radius?: number;
  /** headline letter-spacing in em (negative = tighter) */
  tracking?: number;
  /** headline weight */
  weight?: number;
  /** stage look for long-form scenes: 'soft' (light + colour blobs), 'neon' (black + floor glow), 'flat' */
  look?: 'soft' | 'neon' | 'flat';
  /** tints for the soft look's colour blobs */
  aurora?: string[];
  auroraStrength?: number;
  /** panel surface for long-form: card colour, border, shadow strength */
  panel?: string;
  panelBorder?: string;
};

export type Meta = {fps: number; bpm: number; beatsPerBar: number; framesPerBeat: number; durationInFrames: number; title?: string};

export type SceneInfo = {
  id: string;
  type: string;
  index: number;
  startBeat: number;
  beats: number;
  start: number;
  end: number;
  dur: number;
  in: {type: string; ms: number; [k: string]: unknown};
  out: {type: string; ms: number; [k: string]: unknown};
  inLen: number;
  outLen: number;
  tone: 'light' | 'dark' | 'accent';
  music: string;
  events: Record<string, number>;
  eventBeats: Record<string, number>;
  props: Record<string, unknown>;
};

type Ctx = {scene: SceneInfo; meta: Meta; brand: Brand};
const SceneCtx = createContext<Ctx | null>(null);
const BrandCtx = createContext<{brand: Brand; meta: Meta} | null>(null);

export const FilmProvider: React.FC<{brand: Brand; meta: Meta; children: React.ReactNode}> = ({brand, meta, children}) => (
  <BrandCtx.Provider value={{brand, meta}}>{children}</BrandCtx.Provider>
);

export const SceneProvider: React.FC<{scene: SceneInfo; children: React.ReactNode}> = ({scene, children}) => {
  const film = useContext(BrandCtx);
  if (!film) throw new Error('SceneProvider must be inside FilmProvider');
  return <SceneCtx.Provider value={{scene, meta: film.meta, brand: film.brand}}>{children}</SceneCtx.Provider>;
};

export function useBrand(): Brand {
  const c = useContext(BrandCtx);
  if (!c) throw new Error('useBrand outside FilmProvider');
  return c.brand;
}

export function useFilmMeta(): Meta {
  const c = useContext(BrandCtx);
  if (!c) throw new Error('useFilmMeta outside FilmProvider');
  return c.meta;
}

/**
 * Scene clock. `f` is 0 on the cut (the beat the scene lands on), negative while the
 * incoming transition is still revealing it, and runs to `dur` (the next cut).
 *   b(n)      → frame offset of beat n from the cut (drift-free)
 *   ev(name)  → frame offset of a named event from defaults.js / film.json
 *   tone      → 'light' | 'dark' | 'accent' (pick colours with fg/bg below)
 */
export function useScene() {
  const c = useContext(SceneCtx);
  if (!c) throw new Error('useScene outside a scene');
  const frame = useCurrentFrame();
  const {fps, width, height} = useVideoConfig();
  const {scene, meta, brand} = c;
  const f = frame - scene.inLen;
  const b = (n: number) => beatFrame(meta, scene.startBeat + n) - scene.start;
  const ev = (name: string, fallbackBeat?: number) => {
    if (name in scene.events) return scene.events[name];
    if (fallbackBeat !== undefined) return b(fallbackBeat);
    throw new Error(`Scene ${scene.id}: unknown event "${name}"`);
  };
  const dark = scene.tone === 'dark';
  const accentStage = scene.tone === 'accent';
  const fg = dark ? brand.darkInk : accentStage ? brand.accentInk : brand.ink;
  const bg = dark ? brand.dark : accentStage ? brand.accent : brand.bg;
  const muted = dark ? withAlpha(brand.darkInk, 0.6) : accentStage ? withAlpha(brand.accentInk, 0.7) : brand.muted;
  return {f, fps, width, height, dur: scene.dur, b, ev, scene, meta, brand, props: scene.props, tone: scene.tone, fg, bg, muted, fpb: meta.framesPerBeat};
}

export function withAlpha(hex: string, a: number): string {
  if (!hex.startsWith('#')) return hex;
  const s = hex.slice(1);
  const n = s.length === 3 ? s.split('').map((x) => x + x).join('') : s.slice(0, 6);
  const r = parseInt(n.slice(0, 2), 16), g = parseInt(n.slice(2, 4), 16), bl = parseInt(n.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${bl}, ${a})`;
}
