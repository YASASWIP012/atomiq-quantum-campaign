// Product reveal: mark pops on the beat (spring, small overshoot, a glint across it), wordmark
// letters rise, tagline follows. Keep it SHORT (1 bar) — the film ends on the product, not the logo.
import React from 'react';
import {AbsoluteFill} from 'remotion';
import {useScene} from '../lib/scene';
import {useLayout} from '../lib/layout';
import {EASE, sp, tween, drift, ms, clamp01} from '../lib/motion';
import {Backdrop} from '../components/Stage';
import {Chars, Words} from '../components/Type';
import {Sheen} from '../components/Device';

export const Reveal: React.FC<{name: string; tagline?: string; markSvg?: string; markSize?: number; lowercase?: boolean}> = ({name, tagline, markSvg, markSize}) => {
  const {f, ev, dur, fps, brand, fg, bg, muted} = useScene();
  const L = useLayout();
  const nameSize = L.tall ? 190 : 210;
  const m = markSize ?? nameSize * 0.9;
  const pop = sp(f, ev('mark'), fps, 0.55, 2.4);
  const rot = (1 - pop) * -14;
  const glint = tween(f, ev('name'), ev('name') + ms(fps, 700), -1, 1, EASE.move);
  const push = tween(f, 0, dur, 1, 1.04, EASE.camera);
  // mark slides left to make room for the name as the letters arrive
  const room = tween(f, ev('name') - 4, ev('name') + ms(fps, 600), 0, 1, EASE.move);
  return (
    <AbsoluteFill>
      <Backdrop color={bg} glow={brand.accent} glowAt={[0.5, 0.5]} glowOpacity={0.2} glowSize={0.42} />
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', transform: `scale(${push}) translateY(${drift(f, 'rv', 4, 300)}px)`}}>
        <div style={{display: 'flex', alignItems: 'center', gap: m * 0.22 * room}}>
          {markSvg ? (
            <div style={{position: 'relative', width: m, height: m, transform: `scale(${Math.max(0, pop)}) rotate(${rot}deg)`, borderRadius: m * 0.28, overflow: 'hidden'}}>
              <div style={{width: m, height: m}} dangerouslySetInnerHTML={{__html: markSvg.replace(/width="[^"]*"/, `width="${m}"`).replace(/height="[^"]*"/, `height="${m}"`)}} />
              <Sheen pos={glint} strength={0.5} />
            </div>
          ) : null}
          <div style={{width: room < 0.001 ? 0 : undefined, overflow: room < 1 ? 'hidden' : undefined, maxWidth: room < 1 ? `${room * 100}vw` : undefined}}>
            <Chars f={f} text={name} start={ev('name')} gap={34} style={{fontFamily: brand.fontDisplay, fontWeight: brand.weight ?? 780, fontSize: nameSize, letterSpacing: `${brand.tracking ?? -0.05}em`, color: fg, lineHeight: 1}} />
          </div>
        </div>
        {tagline ? (
          <div style={{marginTop: 34, fontSize: L.tall ? 44 : 48, fontWeight: 450, color: muted, letterSpacing: '-0.015em', opacity: clamp01(tween(f, ev('tagline'), ev('tagline') + 6, 0, 1))}}>
            <Words f={f} text={tagline} start={ev('tagline')} gap={60} />
          </div>
        ) : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
