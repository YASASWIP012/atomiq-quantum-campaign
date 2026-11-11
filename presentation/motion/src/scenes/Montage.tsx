// Rapid-fire beat montage: one word (or short phrase) per half-beat, hard cuts on the grid, each
// one slamming in with a fast scale-down + blur clear. Index counter and a progress hairline make
// it read as designed, not random. Ends on a held `final` line.
import React from 'react';
import {AbsoluteFill} from 'remotion';
import {useScene} from '../lib/scene';
import {useLayout} from '../lib/layout';
import {EASE, tween, ms, drift, clamp01} from '../lib/motion';
import {Backdrop} from '../components/Stage';
import {Lines, Rich} from '../components/Type';

const SPOTS_WIDE: Array<[number, number, 'left' | 'center' | 'right']> = [
  [0.5, 0.5, 'center'],
  [0.08, 0.36, 'left'],
  [0.92, 0.62, 'right'],
  [0.5, 0.5, 'center'],
  [0.08, 0.64, 'left'],
  [0.92, 0.38, 'right'],
];

export const Montage: React.FC<{items: string[]; step?: number; final?: string | null; sub?: string; size?: number; serifEvery?: number}> = ({items, final, sub, size, serifEvery = 2}) => {
  const {f, ev, fps, brand, fg, bg, muted, dur} = useScene();
  const L = useLayout();
  const starts = items.map((_, k) => ev(`item${k}`));
  const finalAt = ev('final');
  let k = -1;
  for (let i = 0; i < starts.length; i++) if (f >= starts[i]) k = i;
  const inFinal = final ? f >= finalAt : false;
  const fontSize = size ?? (L.tall ? 150 : 190);

  let body: React.ReactNode = null;
  if (inFinal && final) {
    body = (
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', padding: `0 ${L.safe.left}px`, transform: `scale(${tween(f, finalAt, dur, 1, 1.04, EASE.camera)})`}}>
        <Lines
          f={f}
          start={finalAt}
          durMs={700}
          lines={[<Rich key="f" text={final} />, ...(sub ? [<span key="s" style={{fontSize: fontSize * 0.26, fontWeight: 450, color: muted, letterSpacing: '-0.01em'}}>{sub}</span>] : [])]}
          style={{fontFamily: brand.fontDisplay, fontWeight: brand.weight ?? 760, fontSize: fontSize * 0.62, letterSpacing: `${brand.tracking ?? -0.045}em`, color: fg, textAlign: 'center', lineHeight: 1.08}}
        />
      </AbsoluteFill>
    );
  } else if (k >= 0) {
    const s = starts[k];
    const p = tween(f, s, s + ms(fps, 240), 0, 1, EASE.enter);
    const [sx, sy, align] = L.tall ? ([0.5, [0.42, 0.52, 0.6][k % 3], 'center'] as const) : SPOTS_WIDE[k % SPOTS_WIDE.length];
    const serif = serifEvery > 0 && k % serifEvery === 1;
    body = (
      <div
        style={{
          position: 'absolute',
          left: sx * L.w,
          top: sy * L.h,
          transform: `translate(${align === 'left' ? 0 : align === 'right' ? -100 : -50}%, -50%) scale(${1.14 - 0.14 * p}) translate(${drift(f, `m${k}`, 4, 120)}px, 0)`,
          transformOrigin: align === 'left' ? '0% 50%' : align === 'right' ? '100% 50%' : '50% 50%',
          filter: p < 0.98 ? `blur(${(1 - p) * 10}px)` : undefined,
          whiteSpace: 'nowrap',
          fontFamily: serif ? brand.fontSerif : brand.fontDisplay,
          fontStyle: serif ? 'italic' : 'normal',
          fontWeight: serif ? 400 : brand.weight ?? 780,
          fontSize: serif ? fontSize * 1.12 : fontSize,
          letterSpacing: serif ? '-0.02em' : `${brand.tracking ?? -0.05}em`,
          color: serif ? brand.accent : fg,
          lineHeight: 1,
        }}
      >
        <Rich text={items[k]} />
      </div>
    );
  }

  const total = items.length;
  const prog = clamp01(k >= 0 ? (k + clamp01((f - starts[Math.max(0, k)]) / Math.max(1, (starts[k + 1] ?? finalAt) - starts[Math.max(0, k)]))) / total : 0);
  return (
    <AbsoluteFill>
      <Backdrop color={bg} />
      {body}
      {!inFinal ? (
        <>
          <div style={{position: 'absolute', left: L.safe.left, top: L.safe.top, fontFamily: brand.fontMono, fontSize: 24, letterSpacing: '0.12em', color: muted}}>
            {String(Math.max(1, k + 1)).padStart(2, '0')} / {String(total).padStart(2, '0')}
          </div>
          <div style={{position: 'absolute', left: L.safe.left, right: L.safe.right, bottom: L.safe.bottom, height: 3, background: 'rgba(127,127,127,0.18)', borderRadius: 3}}>
            <div style={{width: `${prog * 100}%`, height: 3, background: brand.accent, borderRadius: 3}} />
          </div>
        </>
      ) : null}
    </AbsoluteFill>
  );
};
