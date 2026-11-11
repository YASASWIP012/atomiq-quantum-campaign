// One sentence, said big. Words rise on a stagger; on `emph` the *emphasised* words get an
// underline that draws and the block takes a small punch on the beat.
import React from 'react';
import {AbsoluteFill} from 'remotion';
import {useScene} from '../lib/scene';
import {useLayout} from '../lib/layout';
import {EASE, tween, punch, drift} from '../lib/motion';
import {Backdrop} from '../components/Stage';
import {Words} from '../components/Type';

export const Statement: React.FC<{text: string; align?: 'left' | 'center'; size?: number; kicker?: string}> = ({text, align = 'center', size, kicker}) => {
  const {f, ev, dur, fps, brand, fg, bg, muted, tone} = useScene();
  const L = useLayout();
  const fontSize = size ?? (L.tall ? 112 : 132);
  const s = punch(f, ev('emph'), fps, 1.035, 260) * tween(f, 0, dur, 1, 1.03, EASE.camera);
  return (
    <AbsoluteFill>
      <Backdrop color={bg} glow={tone === 'dark' ? brand.accent : undefined} glowOpacity={0.22} glowAt={[0.5, 0.55]} />
      <AbsoluteFill
        style={{
          justifyContent: 'center',
          alignItems: align === 'center' ? 'center' : 'flex-start',
          padding: `0 ${L.safe.left}px`,
          transform: `translate(${drift(f, 'st-x', 5, 320)}px, ${drift(f, 'st-y', 4, 280)}px) scale(${s})`,
        }}
      >
        {kicker ? (
          <div style={{fontFamily: brand.fontMono, fontSize: 24, letterSpacing: '0.12em', textTransform: 'uppercase', color: muted, marginBottom: 34, opacity: tween(f, 0, 12, 0, 1)}}>{kicker}</div>
        ) : null}
        <div
          style={{
            fontFamily: brand.fontDisplay,
            fontWeight: brand.weight ?? 760,
            fontSize,
            lineHeight: 1.04,
            letterSpacing: `${brand.tracking ?? -0.045}em`,
            color: fg,
            textAlign: align,
            maxWidth: L.tall ? L.w - L.safe.left * 2 : 1500,
          }}
        >
          <Words f={f} text={text} start={ev('text')} emphAt={ev('emph')} />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
