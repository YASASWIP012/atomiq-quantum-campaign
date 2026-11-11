// Narrative captions for long-form films — the story told in short on-screen lines, no voiceover.
//   soft look: one calm line, regular weight, words blur in (Fastlane-style).
//   neon look: one or two punchy lines, bold, accent words lit, words rise (Trendtrack-style).
// Captions live in screen space (the camera never moves them) and must hold ≥ 0.3 s/word + 0.5 s.
import React from 'react';
import {useVideoConfig} from 'remotion';
import {EASE, ms, tween, clamp01, STAGGER} from '../lib/motion';
import {useBrand, withAlpha} from '../lib/scene';
import {emphStyle, emphTokens} from './Type';

function tokens(text: string) {
  // lines split on '\n'; *emphasis* may span words and sit before punctuation
  return text.split('\n').map((line) => emphTokens(line));
}

/**
 * Words that arrive one after another. effect 'blur' = opacity + blur + small rise (soft look);
 * 'rise' = masked rise (neon look). exitAt: all words leave together (blur up / slide up).
 */
export const BlurWords: React.FC<{f: number; text: string; at: number; exitAt?: number; effect?: 'blur' | 'rise'; gapMs?: number; style?: React.CSSProperties; emphColor?: string; align?: 'left' | 'center' | 'right'}> = ({
  f,
  text,
  at,
  exitAt,
  effect = 'blur',
  gapMs = STAGGER.word,
  style,
  emphColor,
  align = 'center',
}) => {
  const {fps} = useVideoConfig();
  const brand = useBrand();
  const gap = ms(fps, gapMs);
  const dur = ms(fps, effect === 'blur' ? 620 : 700);
  const exitDur = ms(fps, 320);
  const lines = tokens(text);
  let k = 0;
  return (
    <div style={{textAlign: align, ...style}}>
      {lines.map((line, li) => (
        <div key={li} style={{whiteSpace: 'nowrap'}}>
          {line.map((t, i) => {
            const s = at + gap * k++;
            const p = tween(f, s, s + dur, 0, 1, effect === 'blur' ? EASE.premium : EASE.enter);
            const q = exitAt === undefined ? 0 : tween(f, exitAt, exitAt + exitDur, 0, 1, EASE.exit);
            const em = t.emph ? emphStyle(brand, emphColor) : {};
            const space = i < line.length - 1 ? ' ' : '';
            if (effect === 'blur') {
              const blur = (1 - p) * 14 + q * 12;
              return (
                <span key={i} style={{display: 'inline-block', opacity: clamp01(p * 1.4) * (1 - q), filter: blur > 0.1 ? `blur(${blur}px)` : undefined, transform: `translateY(${(1 - p) * 12 - q * 14}px)`}}>
                  <span style={em}>{t.w}</span>
                  {t.tail}
                  {space}
                </span>
              );
            }
            return (
              <span key={i} style={{display: 'inline-block', overflow: 'hidden', verticalAlign: 'top', padding: '0.06em 0.1em 0.16em 0', margin: '-0.06em -0.1em -0.16em 0'}}>
                <span style={{display: 'inline-block', transform: `translateY(${(1 - p) * 110 - q * 110}%)`}}>
                  <span style={em}>{t.w}</span>
                  {t.tail}
                  {space}
                </span>
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
};

/**
 * Status line: a fixed prefix and a phrase that is replaced on beats — "Gloss is… finding the frame".
 * Each phrase blurs in word by word; the previous one blurs out first. Phrase i shows from at[i].
 */
export const BlurSwap: React.FC<{f: number; phrases: string[]; at: number[]; exitAt?: number; style?: React.CSSProperties; effect?: 'blur' | 'rise'}> = ({f, phrases, at, exitAt, style, effect = 'blur'}) => {
  const {fps} = useVideoConfig();
  let cur = -1;
  for (let i = 0; i < at.length; i++) if (f >= at[i] - ms(fps, 260)) cur = i;
  if (cur < 0) return null;
  const next = at[cur + 1];
  return (
    <span style={{display: 'inline-block', position: 'relative', ...style}}>
      <BlurWords f={f} text={phrases[cur]} at={at[cur]} exitAt={next !== undefined ? next - ms(fps, 260) : exitAt} effect={effect} gapMs={55} align="left" />
    </span>
  );
};

export type CaptionSpec = {
  at: number;
  until?: number;
  text: string;
  /** optional status-line phrases after the text, each arriving at swapAt[i] */
  swap?: string[];
  swapAt?: number[];
  pos?: 'center' | 'top' | 'bottom' | 'left' | 'right' | 'upper' | 'lower' | [number, number];
  size?: number;
  weight?: number;
  effect?: 'blur' | 'rise';
  align?: 'left' | 'center' | 'right';
  icon?: React.ReactNode;
};

/** A caption positioned in screen space with look-appropriate type. */
export const Caption: React.FC<{f: number; c: CaptionSpec; look: 'soft' | 'neon' | 'flat'; dark: boolean; W: number; H: number; tall: boolean}> = ({f, c, look, dark, W, H, tall}) => {
  const brand = useBrand();
  const {fps} = useVideoConfig();
  if (f < c.at - 2) return null;
  if (c.until !== undefined && f > c.until + ms(fps, 400)) return null;
  const neon = look === 'neon';
  const size = c.size ?? (neon ? (tall ? 80 : 72) : tall ? 56 : 46);
  const weight = c.weight ?? (neon ? (brand.weight ?? 720) : 460);
  const effect = c.effect ?? (neon ? 'rise' : 'blur');
  const align = c.align ?? (c.pos === 'left' ? 'left' : c.pos === 'right' ? 'right' : 'center');
  const pos = c.pos ?? 'center';
  const xy: [number, number] = Array.isArray(pos)
    ? [pos[0], pos[1]]
    : pos === 'top'
      ? [0.5, tall ? 0.16 : 0.14]
      : pos === 'upper'
        ? [0.5, 0.3]
        : pos === 'lower'
          ? [0.5, 0.7]
          : pos === 'bottom'
            ? [0.5, tall ? 0.78 : 0.86]
            : pos === 'left'
              ? [0.08, 0.5]
              : pos === 'right'
                ? [0.92, 0.5]
                : [0.5, 0.5];
  // 9:16: the world sits in a band across the middle, so pull captions toward it instead of
  // pinning them to the far top/bottom of a tall frame
  if (tall) xy[1] = 0.5 + (xy[1] - 0.5) * 0.58;
  const tx = align === 'left' ? '0%' : align === 'right' ? '-100%' : '-50%';
  const exitAt = c.until;
  return (
    <div
      style={{
        position: 'absolute',
        left: xy[0] * W,
        top: xy[1] * H,
        transform: `translate(${tx}, -50%)`,
        fontFamily: neon ? brand.fontDisplay : brand.fontText,
        fontSize: size,
        fontWeight: weight,
        letterSpacing: neon ? `${brand.tracking ?? -0.045}em` : '-0.02em',
        lineHeight: 1.06,
        color: dark || neon ? brand.darkInk : brand.ink,
        // halo in the stage colour keeps captions legible over busy UI without a box
        textShadow: dark || neon ? '0 0 18px rgba(0,0,0,0.9), 0 0 42px rgba(0,0,0,0.65)' : `0 0 16px ${withAlpha(brand.bg, 0.95)}, 0 0 40px ${withAlpha(brand.bg, 0.85)}`,
        display: 'flex',
        alignItems: 'center',
        gap: size * 0.35,
        whiteSpace: 'nowrap',
      }}
    >
      {c.icon ? <span style={{display: 'inline-flex', opacity: clamp01(tween(f, c.at, c.at + ms(fps, 300), 0, 1))}}>{c.icon}</span> : null}
      <BlurWords f={f} text={c.text} at={c.at} exitAt={exitAt} effect={effect} align={align} />
      {c.swap && c.swapAt ? <BlurSwap f={f} phrases={c.swap} at={c.swapAt} exitAt={exitAt} effect={effect} /> : null}
    </div>
  );
};
