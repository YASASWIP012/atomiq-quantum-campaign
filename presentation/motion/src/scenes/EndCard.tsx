// End on the product, not a logo: devices together, one line of text, then name + where to get it.
// Only claim what's true today ("Free to start", not "Download now" if it isn't out).
import React from 'react';
import {AbsoluteFill} from 'remotion';
import {useScene} from '../lib/scene';
import {useLayout} from '../lib/layout';
import {EASE, sp, tween, drift, ms, clamp01} from '../lib/motion';
import {Backdrop} from '../components/Stage';
import {Lines, Rich, Chars} from '../components/Type';
import {Phone, Laptop} from '../components/Device';
import {SCREENS} from '../screens';

export const EndCard: React.FC<{
  line: string;
  product: string;
  url?: string;
  cta?: string;
  markSvg?: string;
  phoneScreen?: string;
  laptopScreen?: string;
  screenProps?: Record<string, unknown>;
}> = ({line, product, url, cta, markSvg, phoneScreen, laptopScreen, screenProps = {}}) => {
  const {f, ev, b, fps, brand, fg, bg, muted, dur, tone, scene} = useScene();
  const L = useLayout();
  const dark = tone === 'dark';
  const P = phoneScreen ? SCREENS[phoneScreen] : null;
  const D = laptopScreen ? SCREENS[laptopScreen] : null;
  const hasDevices = !!(P || D);
  const push = tween(f, -scene.inLen, dur, 1, 1.04, EASE.camera);
  const e = sp(f, -Math.round(scene.inLen * 0.3), fps, 0.85, 1.3);
  const e2 = sp(f, -Math.round(scene.inLen * 0.3) + ms(fps, 120), fps, 0.8, 1.4);

  const lineSize = L.tall ? 100 : 104;
  const lapW = L.tall ? 880 : 900;
  const phoneH = L.tall ? 620 : 540;
  const devCY = L.tall ? 1020 : 640;

  const prodAt = ev('product');
  const urlAt = ev('url');
  const pill = clamp01(tween(f, urlAt, urlAt + ms(fps, 450), 0, 1, EASE.premium));

  return (
    <AbsoluteFill>
      <Backdrop color={bg} glow={brand.accent} glowAt={[0.5, hasDevices ? 0.62 : 0.5]} glowOpacity={dark ? 0.3 : 0.14} glowSize={0.5} />
      <AbsoluteFill style={{transform: `scale(${push})`}}>
        {/* line */}
        <div style={{position: 'absolute', left: L.safe.left, right: L.safe.right, top: hasDevices ? (L.tall ? 250 : 120) : 0, bottom: hasDevices ? undefined : L.h * 0.12, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center'}}>
          <Lines
            f={f}
            start={ev('line')}
            lines={[<Rich key="l" text={line} />]}
            style={{fontFamily: brand.fontDisplay, fontWeight: brand.weight ?? 760, fontSize: lineSize, letterSpacing: `${brand.tracking ?? -0.045}em`, color: fg, textAlign: 'center', lineHeight: 1.04}}
          />
        </div>

        {/* devices */}
        {D ? (
          <div style={{position: 'absolute', left: L.w / 2 - lapW / 2 - (P ? (L.tall ? 60 : 110) : 0), top: devCY - lapW * 0.33 + (1 - e) * 140 + drift(f, 'endL', 5, 320), transform: `scale(${0.95 + 0.05 * e})`}}>
            <Laptop width={lapW} sheen={tween(f, 0, ms(fps, 1500), -1, 1, EASE.move)}>
              <D f={f} ev={ev} b={b} fps={fps} dark={dark} {...screenProps} />
            </Laptop>
          </div>
        ) : null}
        {P ? (
          <div style={{position: 'absolute', left: L.w / 2 + (D ? lapW / 2 - (L.tall ? 230 : 150) : -phoneH * 0.24), top: devCY - phoneH * 0.36 + (1 - e2) * 180 + drift(f, 'endP', 6, 280), transform: `rotate(${(1 - e2) * 6}deg)`}}>
            <Phone height={phoneH} sheen={tween(f, ms(fps, 200), ms(fps, 1600), -1, 1, EASE.move)}>
              <P f={f} ev={ev} b={b} fps={fps} dark={dark} {...screenProps} />
            </Phone>
          </div>
        ) : null}

        {/* product + url */}
        <div style={{position: 'absolute', left: 0, right: 0, bottom: hasDevices ? (L.tall ? L.safe.bottom - 40 : 70) : L.h * 0.3, display: 'flex', flexDirection: L.tall ? 'column' : 'row', justifyContent: 'center', alignItems: 'center', gap: L.tall ? 26 : 34}}>
          <div style={{display: 'flex', alignItems: 'center', gap: 16}}>
            {markSvg ? (
              <div style={{width: 56, height: 56, transform: `scale(${Math.max(0, sp(f, prodAt, fps, 0.6, 2.4))})`}} dangerouslySetInnerHTML={{__html: markSvg.replace(/width="[^"]*"/, 'width="56"').replace(/height="[^"]*"/, 'height="56"')}} />
            ) : null}
            <Chars f={f} text={product} start={prodAt + 3} gap={26} style={{fontFamily: brand.fontDisplay, fontWeight: brand.weight ?? 780, fontSize: 56, letterSpacing: '-0.04em', color: fg}} />
          </div>
          {url || cta ? (
            <div style={{opacity: pill, transform: `translateY(${(1 - pill) * 14}px)`, display: 'flex', alignItems: 'center', gap: 14, padding: '14px 26px', borderRadius: 999, background: dark ? 'rgba(255,255,255,0.08)' : fg, color: dark ? brand.darkInk : brand.bg, fontSize: 30, fontWeight: 600, letterSpacing: '-0.01em'}}>
              <span style={{width: 10, height: 10, borderRadius: 10, background: brand.accent}} />
              {cta ? <span>{cta}</span> : null}
              {cta && url ? <span style={{opacity: 0.5}}>·</span> : null}
              {url ? <span style={{fontWeight: 500, opacity: 0.9}}>{url}</span> : null}
            </div>
          ) : null}
        </div>
      </AbsoluteFill>
      <div style={{position: 'absolute', inset: 0, pointerEvents: 'none', color: muted}} />
    </AbsoluteFill>
  );
};
