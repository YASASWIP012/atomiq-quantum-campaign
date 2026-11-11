// The "everything" shot: start tight on one card (it fills the frame), pull back on the camera
// curve while the wall tilts into 3D and its columns drift against each other. The title lands
// on a dimmed centre once the camera settles.
import React from 'react';
import {AbsoluteFill} from 'remotion';
import {useScene, withAlpha} from '../lib/scene';
import {useLayout} from '../lib/layout';
import {EASE, keys, tween, ms, clamp01} from '../lib/motion';
import {Backdrop} from '../components/Stage';
import {Lines, Rich} from '../components/Type';
import {SCREENS} from '../screens';

export const Wall: React.FC<{title: string; sub?: string; card: string; count?: number; cols?: number; cardSize?: [number, number]; cardWidth?: number; tiltTo?: [number, number]; cardProps?: Record<string, unknown>}> = ({
  title,
  sub,
  card,
  count = 15,
  cols = 5,
  cardSize = [800, 600],
  cardWidth,
  tiltTo = [24, -12],
  cardProps = {},
}) => {
  const {f, ev, b, fps, brand, fg, bg, muted, dur, tone} = useScene();
  const L = useLayout();
  const Card = SCREENS[card];
  if (!Card) throw new Error(`Card screen "${card}" not registered`);
  const cw = cardWidth ?? (L.tall ? 520 : 460);
  const ch = (cw * cardSize[1]) / cardSize[0];
  const gap = cw * 0.1;
  const rows = Math.ceil(count / cols);
  const gridW = cols * cw + (cols - 1) * gap;
  const gridH = rows * ch + (rows - 1) * gap;
  const centerIdx = Math.floor(rows / 2) * cols + Math.floor(cols / 2);

  const pull0 = ev('pull');
  const land = ev('land');
  const zStart = (L.w / cw) * 1.02;
  const z = keys(f, [
    [pull0 - 1, zStart],
    [land, 1, EASE.camera],
    [dur, 0.94, EASE.sine],
  ]);
  const tp = tween(f, pull0, land, 0, 1, EASE.camera);
  const rx = tiltTo[0] * tp;
  const rz = tiltTo[1] * tp;
  const titleAt = ev('title');
  const dim = tween(f, titleAt - ms(fps, 200), titleAt + ms(fps, 500), 0, 1, EASE.premium);

  return (
    <AbsoluteFill>
      <Backdrop color={bg} />
      <AbsoluteFill style={{perspective: 2200, overflow: 'hidden'}}>
        <AbsoluteFill style={{transform: `scale(${z}) rotateX(${rx}deg) rotateZ(${rz}deg)`, transformStyle: 'preserve-3d', transformOrigin: '50% 50%'}}>
          <div style={{position: 'absolute', left: L.w / 2 - gridW / 2, top: L.h / 2 - gridH / 2, width: gridW, height: gridH}}>
            {Array.from({length: count}, (_, i) => {
              const c = i % cols;
              const r = Math.floor(i / cols);
              const colDrift = (c % 2 ? 1 : -1) * tween(f, pull0, dur, 0, ch * 0.35, EASE.sine) * (c === Math.floor(cols / 2) ? 0 : 1);
              return (
                <div
                  key={i}
                  style={{
                    position: 'absolute',
                    left: c * (cw + gap),
                    top: r * (ch + gap) + colDrift,
                    width: cw,
                    height: ch,
                    borderRadius: cw * 0.035,
                    overflow: 'hidden',
                    boxShadow: `0 ${cw * 0.03}px ${cw * 0.08}px rgba(0,0,0,${tone === 'dark' ? 0.4 : 0.12})`,
                  }}
                >
                  <div style={{width: cardSize[0], height: cardSize[1], transform: `scale(${cw / cardSize[0]})`, transformOrigin: '0 0'}}>
                    <Card f={f} ev={ev} b={b} fps={fps} dark={tone === 'dark'} index={i} hero={i === centerIdx} {...cardProps} />
                  </div>
                </div>
              );
            })}
          </div>
        </AbsoluteFill>
      </AbsoluteFill>
      <AbsoluteFill style={{background: `radial-gradient(ellipse 55% 45% at 50% 50%, ${withAlpha(bg, 0.92 * dim)} 0%, ${withAlpha(bg, 0.7 * dim)} 55%, ${withAlpha(bg, 0)} 100%)`}} />
      <AbsoluteFill style={{justifyContent: 'center', alignItems: 'center', textAlign: 'center', padding: `0 ${L.safe.left}px`}}>
        <Lines
          f={f}
          start={titleAt}
          lines={[<Rich key="t" text={title} />]}
          style={{fontFamily: brand.fontDisplay, fontWeight: brand.weight ?? 780, fontSize: L.tall ? 120 : 132, letterSpacing: `${brand.tracking ?? -0.048}em`, color: fg, lineHeight: 1.02}}
        />
        {sub ? (
          <div style={{marginTop: 26, fontSize: L.tall ? 40 : 40, fontWeight: 500, color: muted, opacity: clamp01(tween(f, titleAt + ms(fps, 250), titleAt + ms(fps, 650), 0, 1, EASE.premium)), transform: `translateY(${(1 - clamp01(tween(f, titleAt + ms(fps, 250), titleAt + ms(fps, 650), 0, 1, EASE.premium))) * 16}px)`}}>
            {sub}
          </div>
        ) : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
