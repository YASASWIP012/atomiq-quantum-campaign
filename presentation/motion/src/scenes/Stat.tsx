// One number that matters. Counts fast then settles (ease-out), lands on the beat with a punch
// and an accent rule that draws under it. Use only true numbers.
import React from 'react';
import {AbsoluteFill} from 'remotion';
import {useScene} from '../lib/scene';
import {useLayout} from '../lib/layout';
import {EASE, tween, punch, drift, ms} from '../lib/motion';
import {Backdrop} from '../components/Stage';
import {Counter, Words} from '../components/Type';

export const Stat: React.FC<{value: number; from?: number; prefix?: string; suffix?: string; label: string; sub?: string; decimals?: number}> = ({value, from = 0, prefix = '', suffix = '', label, sub, decimals = 0}) => {
  const {f, ev, fps, brand, fg, bg, muted, dur, tone} = useScene();
  const L = useLayout();
  const land = ev('land');
  const size = L.tall ? 300 : 360;
  const s = punch(f, land, fps, 1.05, 280) * tween(f, 0, dur, 1, 1.035, EASE.camera);
  return (
    <AbsoluteFill>
      <Backdrop color={bg} glow={brand.accent} glowAt={[0.5, 0.46]} glowOpacity={tone === 'dark' ? 0.3 : 0.14} glowSize={0.4} />
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', transform: `scale(${s}) translateY(${drift(f, 'stat', 5, 300)}px)`}}>
        <div style={{position: 'relative', fontFamily: brand.fontDisplay, fontWeight: brand.weight ?? 780, fontSize: size, letterSpacing: '-0.06em', lineHeight: 0.9, color: fg}}>
          <Counter f={f} from={from} to={value} f0={ev('count')} f1={land} decimals={decimals} prefix={prefix} suffix={suffix} />
          <div style={{position: 'absolute', left: '4%', right: '4%', bottom: -size * 0.12, height: Math.max(4, size * 0.022), borderRadius: 99, background: brand.accent, transformOrigin: '0 50%', transform: `scaleX(${tween(f, land, land + ms(fps, 520), 0, 1, EASE.move)})`}} />
        </div>
        <div style={{marginTop: size * 0.26, fontSize: L.tall ? 52 : 56, fontWeight: 650, letterSpacing: '-0.025em', color: fg, textAlign: 'center', padding: `0 ${L.safe.left}px`}}>
          <Words f={f} text={label} start={ev('label')} gap={70} />
        </div>
        {sub ? (
          <div style={{marginTop: 18, fontSize: L.tall ? 34 : 32, fontWeight: 450, color: muted, textAlign: 'center', padding: `0 ${L.safe.left}px`}}>
            <Words f={f} text={sub} start={ev('label') + ms(fps, 250)} gap={30} rich={false} />
          </div>
        ) : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
