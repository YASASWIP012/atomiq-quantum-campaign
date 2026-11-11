// The hook. Frame 0 of the film is its thumbnail, so in the first scene line 0 is already set
// when the film starts. Lines stack one per beat and the block re-centres as it grows.
import React from 'react';
import {AbsoluteFill} from 'remotion';
import {useScene} from '../lib/scene';
import {useLayout} from '../lib/layout';
import {EASE, keys, tween, drift, ms} from '../lib/motion';
import {Backdrop} from '../components/Stage';
import {Lines, Rich, Swap} from '../components/Type';

export const Hook: React.FC<{lines: string[]; swap?: string[]; align?: 'left' | 'center'; size?: number | null; glow?: boolean}> = ({lines, swap = [], align = 'left', size, glow = true}) => {
  const {f, ev, dur, fps, brand, fg, bg, scene} = useScene();
  const L = useLayout();
  const fontSize = size ?? (L.tall ? 128 : L.square ? 120 : 156);
  const lh = 1.02;
  const starts = lines.map((_, i) => ev(`line${i}`));
  const preset = scene.index === 0;

  // block re-centres as lines arrive
  const shown = keys(
    f,
    starts.map((s, i) => [s, i + 1, EASE.move] as [number, number, typeof EASE.move]),
  );
  const blockShift = -((shown - lines.length) * fontSize * lh) / 2;

  // camera never parks: slow push + drift
  const push = tween(f, 0, dur, 1, 1.035, EASE.camera);
  const dx = drift(f, 'hook-x', 6, 300);
  const dy = drift(f, 'hook-y', 4, 340);

  const swapAt = [starts[starts.length - 1], ...swap.slice(1).map((_, k) => ev(`swap${k + 1}`))];
  const nodes = lines.map((ln, i) =>
    i === lines.length - 1 && swap.length ? (
      <span key={i} style={{whiteSpace: 'nowrap'}}>
        <Rich text={ln} />
        {ln.endsWith(' ') ? '' : ' '}
        <Swap f={f} words={swap.map((w, k) => <Rich key={k} text={w} />)} at={swapAt} />
      </span>
    ) : (
      <Rich key={i} text={ln} />
    ),
  );

  return (
    <AbsoluteFill>
      <Backdrop color={bg} glow={glow ? brand.accent : undefined} glowAt={[0.78, 0.35]} glowOpacity={0.18} glowSize={0.5} />
      <AbsoluteFill
        style={{
          justifyContent: 'center',
          alignItems: align === 'center' ? 'center' : 'flex-start',
          paddingLeft: L.safe.left,
          paddingRight: L.safe.right,
          transform: `translate(${dx}px, ${dy + blockShift}px) scale(${push})`,
          transformOrigin: align === 'center' ? '50% 50%' : `${L.safe.left}px 50%`,
        }}
      >
        <Lines
          f={f}
          lines={nodes}
          starts={starts}
          preset={preset}
          durMs={760}
          style={{
            fontFamily: brand.fontDisplay,
            fontWeight: brand.weight ?? 760,
            fontSize,
            lineHeight: lh,
            letterSpacing: `${brand.tracking ?? -0.045}em`,
            color: fg,
            textAlign: align,
          }}
        />
      </AbsoluteFill>
      {/* tiny frame counter-style detail: a hairline that draws under the block on the last line */}
      <AbsoluteFill style={{pointerEvents: 'none'}}>
        <div
          style={{
            position: 'absolute',
            left: L.safe.left,
            bottom: L.tall ? L.safe.bottom - 40 : L.safe.bottom,
            height: 3,
            width: tween(f, starts[starts.length - 1], starts[starts.length - 1] + ms(fps, 900), 0, L.tall ? 220 : 280, EASE.move),
            background: brand.accent,
            borderRadius: 3,
          }}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
