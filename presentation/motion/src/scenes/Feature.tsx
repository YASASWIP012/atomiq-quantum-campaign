// A feature, shown working. Caption (eyebrow · two-line headline · one sentence) on one side,
// the product on the other doing trigger → reaction → payoff. The camera leans in on the thing
// that changes (≤1.5×, ~1 s, eased) and pulls back; callouts point at the exact element.
import React from 'react';
import {AbsoluteFill} from 'remotion';
import {useScene} from '../lib/scene';
import {useLayout} from '../lib/layout';
import {EASE, keys, sp, tween, drift, ms, clamp01} from '../lib/motion';
import {Backdrop} from '../components/Stage';
import {Lines, Words, Rich} from '../components/Type';
import {Phone, Laptop, Browser, phoneGeom, laptopGeom, browserGeom, Geom, Sheen} from '../components/Device';
import {Callout} from '../components/UI';
import {SCREENS} from '../screens';

type At = string | number;
export type CamKey = {at: At; zoom?: number; x?: number; y?: number; ms?: number};
export type CalloutSpec = {at: At; until?: At; x: number; y: number; label: string; side?: 'left' | 'right' | 'top' | 'bottom'; len?: number};

export const Feature: React.FC<{
  num?: string;
  of?: number;
  eyebrow?: string;
  headline: [string, string] | string[];
  sentence?: string;
  screen: string;
  screenProps?: Record<string, unknown>;
  device?: 'phone' | 'laptop' | 'browser' | 'none';
  side?: 'left' | 'right';
  url?: string;
  camera?: CamKey[];
  callouts?: CalloutSpec[];
  tilt?: [number, number];
  deviceSize?: number;
  sheenAt?: At;
}> = ({num, of, eyebrow, headline, sentence, screen, screenProps = {}, device = 'phone', side = 'right', url, camera = [], callouts = [], tilt = [0, 0], deviceSize, sheenAt}) => {
  const sc = useScene();
  const {f, ev, b, fps, brand, fg, muted, bg, tone, scene} = sc;
  const L = useLayout();
  const at = (a: At) => (typeof a === 'string' ? ev(a) : b(a));
  const dark = tone === 'dark';
  const Screen = SCREENS[screen];
  if (!Screen) throw new Error(`Screen "${screen}" is not registered in src/screens/index.ts`);

  // ---------- layout ----------
  const isDesk = device === 'laptop' || device === 'browser';
  const capW = L.tall ? L.w - L.safe.left - L.safe.right : isDesk ? 560 : 660;
  const g: Geom =
    device === 'phone' || device === 'none'
      ? phoneGeom(deviceSize ?? (L.tall ? 1040 : L.square ? 760 : 860))
      : device === 'laptop'
        ? laptopGeom(deviceSize ?? (L.tall ? 940 : L.square ? 760 : 1060))
        : browserGeom(deviceSize ?? (L.tall ? 960 : L.square ? 780 : 1080));
  const colLeft = side === 'right' ? L.safe.left + capW + 60 : L.safe.left;
  const colRight = side === 'right' ? L.w - L.safe.right * (isDesk ? 0.55 : 1) : L.w - L.safe.right - capW - 60;
  const cx = L.tall ? L.w / 2 : (colLeft + colRight) / 2 + (isDesk ? (side === 'right' ? 40 : -40) : 0);
  const cy = L.tall ? L.h - L.safe.bottom - g.H / 2 + 230 : L.h / 2 + (device === 'laptop' ? 20 : 0);
  const devX = cx - g.W / 2;
  const devY = cy - g.H / 2;
  const toFrame = (sx: number, sy: number) => [devX + g.screenX + sx * g.scale, devY + g.screenY + sy * g.scale] as const;

  // ---------- device entrance + idle life ----------
  const enterAt = -Math.round(scene.inLen * 0.4);
  const e = sp(f, enterAt, fps, 0.82, 1.5);
  const rise = (1 - e) * 90;
  const enterScale = 0.94 + 0.06 * e;
  const ry = tilt[1] + drift(f, `ry-${scene.id}`, 2.2, 360) + (1 - e) * (side === 'right' ? -10 : 10);
  const rx = tilt[0] + (1 - e) * 8;
  const floatY = drift(f, `fy-${scene.id}`, 7, 280);
  const sheen = sheenAt !== undefined ? tween(f, at(sheenAt), at(sheenAt) + ms(fps, 900), -1, 1, EASE.move) : tween(f, enterAt, enterAt + ms(fps, 1300), -1, 1, EASE.move);

  // ---------- camera (focus in screen coords) ----------
  const [restX, restY] = [cx, cy];
  const zk: Array<[number, number, typeof EASE.camera]> = [[-9999, 1, EASE.camera]];
  const xk: Array<[number, number, typeof EASE.camera]> = [[-9999, restX, EASE.camera]];
  const yk: Array<[number, number, typeof EASE.camera]> = [[-9999, restY, EASE.camera]];
  for (const k of camera) {
    const t0 = at(k.at);
    const t1 = t0 + ms(fps, k.ms ?? 1000);
    const [fx, fy] = k.x !== undefined && k.y !== undefined ? toFrame(k.x, k.y) : [restX, restY];
    zk.push([t0, zk[zk.length - 1][1], EASE.camera], [t1, k.zoom ?? 1, EASE.camera]);
    xk.push([t0, xk[xk.length - 1][1], EASE.camera], [t1, fx, EASE.camera]);
    yk.push([t0, yk[yk.length - 1][1], EASE.camera], [t1, fy, EASE.camera]);
  }
  const z = keys(f, zk);
  const Fx = keys(f, xk);
  const Fy = keys(f, yk);
  const cam = (px: number, py: number) => [restX + (px - Fx) * z, restY + (py - Fy) * z] as const;

  // ---------- caption ----------
  const capAt = ev('caption', 0);
  const capLeft = L.tall ? L.safe.left : side === 'right' ? L.safe.left : L.w - L.safe.right - capW;
  const headSize = L.tall ? 92 : L.square ? 78 : 88;
  const total = of ?? 0;

  const screenEl = (
    <Screen f={f} ev={ev} b={b} fps={fps} dark={dark} {...screenProps} />
  );

  const deviceEl =
    device === 'phone' || device === 'none' ? (
      <Phone height={deviceSize ?? (L.tall ? 1040 : L.square ? 760 : 860)} sheen={sheen} shadowK={dark ? 0.6 : 1}>
        {screenEl}
      </Phone>
    ) : device === 'laptop' ? (
      <Laptop width={g.W} sheen={sheen}>
        {screenEl}
      </Laptop>
    ) : (
      <Browser width={g.W} url={url} dark={dark}>
        {screenEl}
      </Browser>
    );

  return (
    <AbsoluteFill>
      <Backdrop color={bg} glow={brand.accent} glowAt={[cx / L.w, cy / L.h]} glowOpacity={dark ? 0.32 : 0.16} glowSize={dark ? 0.42 : 0.5} vignette={dark ? 0.35 : 0.05} />

      {/* device layer (camera applies here) */}
      <AbsoluteFill style={{transformOrigin: '0 0', transform: `translate(${restX}px, ${restY}px) scale(${z}) translate(${-Fx}px, ${-Fy}px)`}}>
        <div
          style={{
            position: 'absolute',
            left: devX,
            top: devY,
            width: g.W,
            height: g.H,
            perspective: 2600,
            transform: `translateY(${rise + floatY}px) scale(${enterScale})`,
          }}
        >
          <div style={{transform: `rotateX(${rx}deg) rotateY(${ry}deg)`, transformStyle: 'preserve-3d'}}>{deviceEl}</div>
        </div>
      </AbsoluteFill>

      {/* callouts: positioned through the camera, drawn at constant size */}
      <AbsoluteFill>
        {callouts.map((c, i) => {
          const [wx, wy] = toFrame(c.x, c.y);
          const [px, py] = cam(wx, wy + rise + floatY);
          return (
            <Callout
              key={i}
              f={f}
              at={at(c.at)}
              until={c.until !== undefined ? at(c.until) : undefined}
              x={px}
              y={py}
              label={c.label}
              side={c.side}
              len={c.len}
              color={brand.accent}
              ink={dark ? brand.darkInk : brand.ink}
              bg={dark ? '#1d1d22' : '#ffffff'}
              scale={L.tall ? 1.15 : 1}
              font={brand.fontText}
            />
          );
        })}
      </AbsoluteFill>

      {/* caption */}
      <div
        style={{
          position: 'absolute',
          left: capLeft,
          width: capW,
          top: L.tall ? L.safe.top - 40 : 0,
          bottom: L.tall ? undefined : 0,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          color: fg,
        }}
      >
        <div style={{display: 'flex', alignItems: 'center', gap: 16, marginBottom: 30, fontFamily: brand.fontMono, fontSize: L.tall ? 28 : 24, letterSpacing: '0.14em', textTransform: 'uppercase'}}>
          <Lines
            f={f}
            start={capAt}
            durMs={600}
            effect="rise"
            lines={[
              <span key="e">
                <span style={{color: brand.accent}}>{num}</span>
                {eyebrow ? <span style={{color: muted}}>{num ? '  ' : ''}{eyebrow}</span> : null}
              </span>,
            ]}
          />
          {total > 0 ? (
            <div style={{display: 'flex', gap: 6, marginLeft: 8}}>
              {Array.from({length: total}, (_, i) => {
                const filled = num !== undefined && i < parseInt(num, 10);
                const grow = clamp01(tween(f, capAt + i * 2, capAt + i * 2 + ms(fps, 300), 0, 1, EASE.premium));
                return <div key={i} style={{width: 22 * grow, height: 4, borderRadius: 4, background: filled ? brand.accent : dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.12)'}} />;
              })}
            </div>
          ) : null}
        </div>
        <Lines
          f={f}
          start={capAt + ms(fps, 70)}
          gap={90}
          effect="tilt"
          lines={headline.map((h, i) => (
            <Rich key={i} text={h} />
          ))}
          style={{fontFamily: brand.fontDisplay, fontSize: headSize, lineHeight: 1.02, letterSpacing: `${brand.tracking ?? -0.042}em`}}
          lineStyle={(i) => (i === 0 && headline.length > 1 ? {fontWeight: 380, color: muted} : {fontWeight: brand.weight ?? 760, color: fg})}
        />
        {sentence ? (
          <div style={{marginTop: 34, fontSize: L.tall ? 34 : 30, lineHeight: 1.38, color: muted, maxWidth: L.tall ? capW : capW - 40, fontWeight: 450, letterSpacing: '-0.01em'}}>
            <Words f={f} text={sentence} start={ev('sentence', 0.5)} gap={22} durMs={600} rich={false} />
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

export {Sheen};
