// Kinetic typography. Text is the loudest motion-design signal in a launch film — these are the
// primitives every scene uses. All take the scene-local frame `f` and start frames, so timing stays
// on the beat grid (pass ev('name') or b(n)).
import React from 'react';
import {useVideoConfig} from 'remotion';
import {EASE, DUR, STAGGER, ms, tween, clamp01} from '../lib/motion';
import {useBrand, Brand} from '../lib/scene';

/** `*word*` in copy → emphasis (accent colour or serif italic, per brand.emphasis). */
export const Rich: React.FC<{text: string; brand?: Brand; emphasisColor?: string}> = ({text, emphasisColor}) => {
  const brand = useBrand();
  const parts = text.split(/(\*[^*]+\*)/g).filter(Boolean);
  return (
    <>
      {parts.map((p, i) =>
        p.startsWith('*') && p.endsWith('*') ? (
          <span key={i} style={emphStyle(brand, emphasisColor)}>
            {p.slice(1, -1)}
          </span>
        ) : (
          <React.Fragment key={i}>{p}</React.Fragment>
        ),
      )}
    </>
  );
};

export function emphStyle(brand: Brand, color?: string): React.CSSProperties {
  return brand.emphasis === 'serif'
    ? {fontFamily: brand.fontSerif, fontStyle: 'italic', fontWeight: 400, letterSpacing: '-0.01em', paddingRight: '0.06em', color}
    : {color: color ?? brand.accent};
}


/** Split copy into words with emphasis flags. `*word*`, `*two words*.` and `*word.*` all work. */
export function emphTokens(text: string): Array<{w: string; emph: boolean; tail: string}> {
  const out: Array<{w: string; emph: boolean; tail: string}> = [];
  let inE = false;
  for (const raw of text.split(/\s+/).filter(Boolean)) {
    const m = raw.match(/^(\*?)(.*?)(\*?)([.,!?;:…'"’”)\]]*)$/) as RegExpMatchArray;
    const open = m[1] === '*';
    const close = m[3] === '*';
    const emph = inE || open;
    if (open && !close) inE = true;
    if (close) inE = false;
    out.push({w: m[2], emph, tail: m[4]});
  }
  return out;
}

const maskStyle: React.CSSProperties = {
  display: 'block',
  overflow: 'hidden',
  // room for descenders and italic overhang without letting neighbours bleed in
  padding: '0.06em 0.12em 0.16em 0',
  margin: '-0.06em -0.12em -0.16em 0',
};

type Effect = 'rise' | 'tilt' | 'blur' | 'drop';

function lineTransform(p: number, q: number, effect: Effect) {
  // p: entrance progress 0→1, q: exit progress 0→1
  const y = (1 - p) * (effect === 'drop' ? -112 : 112) - q * 112;
  const rot = effect === 'tilt' ? (1 - p) * 5 : 0;
  return `translate3d(0, ${y}%, 0) rotate(${rot}deg)`;
}

/**
 * Masked line reveal — the workhorse. Each line rises out of its own mask.
 * start: frame of line 0 (lines stagger by `gap` ms unless `starts` gives each line a frame).
 * preset: first line already on screen at start (use for frame 0 of the film — it's the thumbnail).
 */
export const Lines: React.FC<{
  f: number;
  lines: React.ReactNode[];
  start?: number;
  starts?: number[];
  gap?: number;
  durMs?: number;
  effect?: Effect;
  exitAt?: number;
  preset?: boolean;
  style?: React.CSSProperties;
  lineStyle?: (i: number) => React.CSSProperties;
}> = ({f, lines, start = 0, starts, gap = STAGGER.line, durMs = DUR.hero, effect = 'tilt', exitAt, preset, style, lineStyle}) => {
  const {fps} = useVideoConfig();
  const d = ms(fps, durMs);
  return (
    <div style={style}>
      {lines.map((line, i) => {
        const s = starts?.[i] ?? start + ms(fps, gap) * i;
        const p = preset && i === 0 ? 1 : tween(f, s, s + d, 0, 1, EASE.enter);
        const q = exitAt === undefined ? 0 : tween(f, exitAt + ms(fps, 50) * i, exitAt + ms(fps, 50) * i + ms(fps, DUR.exit + 80), 0, 1, EASE.exit);
        const blur = effect === 'blur' ? (1 - p) * 14 : 0;
        return (
          <span key={i} style={{...maskStyle, ...(lineStyle?.(i) ?? {})}}>
            <span
              style={{
                display: 'block',
                transform: lineTransform(p, q, effect),
                transformOrigin: '0% 100%',
                filter: blur > 0.05 ? `blur(${blur}px)` : undefined,
                willChange: 'transform',
              }}
            >
              {line}
            </span>
          </span>
        );
      })}
    </div>
  );
};

/** Word-by-word masked reveal (statements, sentences). Inline — wraps naturally. */
export const Words: React.FC<{f: number; text: string; start?: number; gap?: number; durMs?: number; effect?: Effect; style?: React.CSSProperties; rich?: boolean; emphAt?: number}> = ({
  f,
  text,
  start = 0,
  gap = STAGGER.word,
  durMs = DUR.hero,
  effect = 'rise',
  style,
  rich = true,
  emphAt,
}) => {
  const {fps} = useVideoConfig();
  const brand = useBrand();
  const d = ms(fps, durMs);
  const toks = rich ? emphTokens(text) : text.split(/\s+/).filter(Boolean).map((w) => ({w, emph: false, tail: ''}));
  return (
    <span style={style}>
      {toks.map((t, w) => {
        const s = start + ms(fps, gap) * w;
        const p = tween(f, s, s + d, 0, 1, EASE.enter);
        const blur = effect === 'blur' ? (1 - p) * 12 : 0;
        return (
          <React.Fragment key={w}>
            <span style={{display: 'inline-block', overflow: 'hidden', verticalAlign: 'top', padding: '0.06em 0.1em 0.16em 0', margin: '-0.06em -0.1em -0.16em 0'}}>
              <span style={{display: 'inline-block', transform: lineTransform(p, 0, effect), transformOrigin: '0% 100%', filter: blur > 0.05 ? `blur(${blur}px)` : undefined, position: 'relative'}}>
                <span style={{position: 'relative', ...(t.emph ? emphStyle(brand) : {})}}>
                  {t.w}
                  {t.emph && emphAt !== undefined ? <Underline f={f} at={emphAt} color={brand.accent} /> : null}
                </span>
                {t.tail}
              </span>
            </span>
            {w < toks.length - 1 ? ' ' : null}
          </React.Fragment>
        );
      })}
    </span>
  );
};

/** Per-letter reveal for wordmarks and short hero words. */
export const Chars: React.FC<{f: number; text: string; start?: number; gap?: number; durMs?: number; mode?: 'rise' | 'blur' | 'scale' | 'track'; style?: React.CSSProperties}> = ({
  f,
  text,
  start = 0,
  gap = STAGGER.letter,
  durMs = DUR.hero,
  mode = 'rise',
  style,
}) => {
  const {fps} = useVideoConfig();
  const d = ms(fps, durMs);
  const chars = [...text];
  const trackP = tween(f, start, start + d + ms(fps, gap) * chars.length, 0, 1, EASE.enter);
  return (
    <span style={{display: 'inline-block', whiteSpace: 'pre', letterSpacing: mode === 'track' ? `${(1 - trackP) * 0.35}em` : undefined, ...style}}>
      {chars.map((c, i) => {
        const s = start + ms(fps, gap) * i;
        const p = tween(f, s, s + d, 0, 1, EASE.enter);
        const tf =
          mode === 'scale'
            ? `scale(${0.4 + 0.6 * p})`
            : mode === 'rise'
              ? `translate3d(0, ${(1 - p) * 110}%, 0)`
              : `translate3d(0, ${(1 - p) * 30}%, 0)`;
        const op = mode === 'rise' ? 1 : clamp01(p * 1.6);
        const blur = mode === 'blur' || mode === 'track' ? (1 - p) * 16 : 0;
        const inner = (
          <span style={{display: 'inline-block', transform: tf, opacity: op, filter: blur > 0.05 ? `blur(${blur}px)` : undefined}}>{c}</span>
        );
        return mode === 'rise' ? (
          <span key={i} style={{display: 'inline-block', overflow: 'hidden', verticalAlign: 'top', padding: '0.05em 0 0.15em', margin: '-0.05em 0 -0.15em'}}>
            {inner}
          </span>
        ) : (
          <React.Fragment key={i}>{inner}</React.Fragment>
        );
      })}
    </span>
  );
};

/**
 * Slot-swap: one word replaced by the next in place, on given frames.
 * Put it at the END of a left-aligned line so width changes never shove other words.
 */
export const Swap: React.FC<{f: number; words: React.ReactNode[]; at: number[]; durMs?: number; style?: React.CSSProperties}> = ({f, words, at, durMs = 520, style}) => {
  const {fps} = useVideoConfig();
  const d = ms(fps, durMs);
  let cur = 0;
  for (let i = 0; i < at.length; i++) if (f >= at[i]) cur = i;
  return (
    <span style={{display: 'inline-block', position: 'relative', overflow: 'hidden', verticalAlign: 'top', padding: '0.06em 0.12em 0.16em 0', margin: '-0.06em -0.12em -0.16em 0', ...style}}>
      <span style={{visibility: 'hidden', display: 'inline-block'}}>{words[cur]}</span>
      {words.map((w, i) => {
        const pin = i === 0 && at[0] <= 0 ? 1 : tween(f, at[i], at[i] + d, 0, 1, EASE.enter);
        const pout = i + 1 < at.length ? tween(f, at[i + 1], at[i + 1] + Math.round(d * 0.7), 0, 1, EASE.exit) : 0;
        if (pin <= 0 || pout >= 1) return null;
        return (
          <span key={i} style={{position: 'absolute', left: 0, top: '0.06em', whiteSpace: 'pre', transform: `translate3d(0, ${(1 - pin) * 105 - pout * 105}%, 0)`}}>
            {w}
          </span>
        );
      })}
    </span>
  );
};

/** Number roll with tabular figures. Counts a→b between f0 and f1 (ease-out: fast, then settles). */
export const Counter: React.FC<{f: number; from: number; to: number; f0: number; f1: number; decimals?: number; prefix?: string; suffix?: string; style?: React.CSSProperties}> = ({
  f,
  from,
  to,
  f0,
  f1,
  decimals = 0,
  prefix = '',
  suffix = '',
  style,
}) => {
  const v = tween(f, f0, f1, from, to, EASE.enter);
  const txt = v.toLocaleString('en-US', {minimumFractionDigits: decimals, maximumFractionDigits: decimals});
  return (
    <span style={{fontVariantNumeric: 'tabular-nums', ...style}}>
      {prefix}
      {txt}
      {suffix}
    </span>
  );
};

/** Marker highlight sweeping left→right behind text. */
export const Marker: React.FC<{f: number; at: number; color: string; durMs?: number; children: React.ReactNode; style?: React.CSSProperties}> = ({f, at, color, durMs = 420, children, style}) => {
  const {fps} = useVideoConfig();
  const p = tween(f, at, at + ms(fps, durMs), 0, 1, EASE.move);
  return (
    <span
      style={{
        backgroundImage: `linear-gradient(${color}, ${color})`,
        backgroundRepeat: 'no-repeat',
        backgroundSize: `${p * 100}% 0.9em`,
        backgroundPosition: '0 70%',
        padding: '0 0.08em',
        margin: '0 -0.08em',
        ...style,
      }}
    >
      {children}
    </span>
  );
};

/** Underline that draws under a word. */
export const Underline: React.FC<{f: number; at: number; color: string; thickness?: number; durMs?: number}> = ({f, at, color, thickness = 0.07, durMs = 500}) => {
  const {fps} = useVideoConfig();
  const p = tween(f, at, at + ms(fps, durMs), 0, 1, EASE.move);
  return <span style={{position: 'absolute', left: 0, bottom: '-0.04em', height: `${thickness}em`, width: `${p * 100}%`, background: color, borderRadius: 99}} />;
};
