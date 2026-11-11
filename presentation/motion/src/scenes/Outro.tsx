// Long-form ending: mark + name, one line whose last word rolls through options and lands
// ("in 2024 / in 2023 / … → anytime"), then the URL button gets clicked. Works in every look.
import React from 'react';
import {AbsoluteFill, useVideoConfig} from 'remotion';
import {useScene} from '../lib/scene';
import {useLayout} from '../lib/layout';
import {EASE, keys, ms, sp, tween, clamp01, drift} from '../lib/motion';
import {LookBackground} from '../components/Look';
import {Chars, Rich, emphStyle} from '../components/Type';
import {BlurWords} from '../components/Caption';
import {Roll} from '../components/Extras';
import {Cursor} from '../components/UI';
import {withAlpha} from '../lib/scene';

export const Outro: React.FC<{name: string; markSvg?: string; line: string; roll?: string[]; url: string; cta?: string; look?: 'soft' | 'neon' | 'flat'}> = ({name, markSvg, line, roll = [], url, cta, look}) => {
  const {f, ev, brand, tone, dur} = useScene();
  const {fps} = useVideoConfig();
  const L = useLayout();
  const lk = look ?? brand.look ?? 'soft';
  const dark = tone === 'dark' || lk === 'neon';
  const ink = dark ? brand.darkInk : brand.ink;
  const nameSize = L.tall ? 104 : 96;
  const lineSize = L.tall ? 50 : 52;
  const markAt = ev('mark', 0);
  const lineAt = ev('line', 1);
  const rollAt = ev('roll', 2);
  const urlAt = ev('url', 3.5);
  const clickAt = ev('click', 4.5);
  const pop = sp(f, markAt, fps, 0.6, 2.2);
  const pill = clamp01(tween(f, urlAt, urlAt + ms(fps, 450), 0, 1, EASE.premium));
  const press = keys(f, [[clickAt - 3, 1], [clickAt, 0.93, EASE.premium], [clickAt + 9, 1, EASE.premium]]);
  const lit = tween(f, clickAt, clickAt + ms(fps, 500), 0, 1, EASE.enter);
  const push = tween(f, 0, dur, 1, 1.03, EASE.camera);
  const pillY = L.h * 0.5 + (L.tall ? 170 : 150);
  // aim the click at the arrow on the right end of the pill, not at the URL text
  const pillW = (cta ? (cta.length + 3) * 15.5 : 0) + url.length * 16.5 + 120;
  const clickX = L.w / 2 + pillW / 2 - 34;
  return (
    <AbsoluteFill>
      <LookBackground look={lk} brand={brand} pulse={lit * 0.8} dark={tone === 'dark'} />
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', transform: `scale(${push}) translateY(${drift(f, 'outro', 4, 300) - 40}px)`, color: ink}}>
        <div style={{display: 'flex', alignItems: 'center', gap: nameSize * 0.22}}>
          {markSvg ? <div style={{width: nameSize * 0.9, height: nameSize * 0.9, transform: `scale(${Math.max(0, pop)}) rotate(${(1 - pop) * -12}deg)`}} dangerouslySetInnerHTML={{__html: markSvg.replace(/width="[^"]*"/, `width="${nameSize * 0.9}"`).replace(/height="[^"]*"/, `height="${nameSize * 0.9}"`)}} /> : null}
          <Chars f={f} text={name} start={markAt + 4} gap={30} style={{fontFamily: brand.fontDisplay, fontWeight: brand.weight ?? 760, fontSize: nameSize, letterSpacing: `${brand.tracking ?? -0.045}em`}} />
        </div>
        <div style={{marginTop: 30, fontSize: lineSize, fontWeight: 500, letterSpacing: '-0.02em', display: 'flex', alignItems: 'flex-end', gap: '0.28em', whiteSpace: 'nowrap'}}>
          <BlurWords f={f} text={line} at={lineAt} effect={lk === 'neon' ? 'rise' : 'blur'} />
          {roll.length ? (
            <span style={{opacity: clamp01(tween(f, rollAt - 4, rollAt + 4, 0, 1))}}>
              <Roll f={f} at={rollAt} words={roll.map((w, i) => <span key={i} style={i === roll.length - 1 ? emphStyle(brand) : {color: withAlpha(ink, 0.55)}}><Rich text={w} /></span>)} durMs={1300} />
            </span>
          ) : null}
        </div>
      </AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          left: L.w / 2,
          top: pillY,
          transform: `translate(-50%, ${(1 - pill) * 18}px) scale(${press})`,
          opacity: pill,
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          padding: '16px 30px',
          borderRadius: 999,
          fontSize: 30,
          fontWeight: 650,
          letterSpacing: '-0.01em',
          background: lk === 'neon' ? brand.accent : brand.ink,
          color: lk === 'neon' ? brand.accentInk : brand.bg,
          boxShadow: `0 0 ${40 + 60 * lit}px ${withAlpha(brand.accent, 0.25 + 0.4 * lit)}`,
          whiteSpace: 'nowrap',
        }}
      >
        {cta ? <span>{cta}</span> : null}
        <span style={{opacity: cta ? 0.75 : 1, fontWeight: cta ? 500 : 650}}>{url}</span>
        <span style={{fontSize: 26}}>→</span>
      </div>
      <Cursor
        f={f}
        path={[
          [urlAt, clickX + 220, pillY + 190],
          [clickAt - 2, clickX, pillY + 18],
          [clickAt + ms(fps, 800), clickX + 30, pillY + 50],
        ]}
        clicks={[clickAt]}
        color={lk === 'neon' ? '#ffffff' : brand.ink}
        showFrom={urlAt + ms(fps, 150)}
        size={34}
      />
    </AbsoluteFill>
  );
};

export {Rich};
