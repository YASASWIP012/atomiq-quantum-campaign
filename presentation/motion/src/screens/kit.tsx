// Built-in panels any film can place in a Journey world (chrome: "none" for floating type, "card"
// for UI). Product-agnostic; timing via `at` (beat number or event name) like everything else.
import React from 'react';
import {EASE, ms, sp, tween, clamp01, keys} from '../lib/motion';
import {useBrand, withAlpha} from '../lib/scene';
import {ScreenProps} from './types';
import {BlurWords} from '../components/Caption';
import {Counter} from '../components/Type';
import {Extrude, FlipClock, FillGrid, TypeText, Toggle} from '../components/Extras';
import {Cursor} from '../components/UI';

type At = string | number;
const useAt = (p: ScreenProps) => (a: At | undefined, fb = 0) => (a === undefined ? p.b(fb) : typeof a === 'string' ? p.ev(a) : p.b(a));

/** Big floating text in world space. */
export const KitText: React.FC<ScreenProps & {text: string; at?: At; until?: At; size?: number; weight?: number; align?: 'left' | 'center' | 'right'; effect?: 'blur' | 'rise'; color?: string; font?: 'display' | 'text' | 'serif'}> = (p) => {
  const brand = useBrand();
  const at = useAt(p);
  const dark = p.dark;
  return (
    <div style={{width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: p.align === 'left' ? 'flex-start' : p.align === 'right' ? 'flex-end' : 'center'}}>
      <BlurWords
        f={p.f}
        text={p.text}
        at={at(p.at)}
        exitAt={p.until !== undefined ? at(p.until) : undefined}
        effect={p.effect ?? (dark ? 'rise' : 'blur')}
        align={p.align ?? 'center'}
        style={{
          fontFamily: p.font === 'serif' ? brand.fontSerif : p.font === 'text' ? brand.fontText : brand.fontDisplay,
          fontSize: p.size ?? 120,
          fontWeight: p.weight ?? brand.weight ?? 760,
          letterSpacing: `${brand.tracking ?? -0.045}em`,
          lineHeight: 1.02,
          color: p.color ?? (dark ? brand.darkInk : brand.ink),
        }}
      />
    </div>
  );
};

/** Extruded 3D word ("Q4?"). */
export const KitExtrude: React.FC<ScreenProps & {text: string; at?: At; size?: number; face?: string; side?: string; depth?: number}> = (p) => {
  const brand = useBrand();
  const at = useAt(p);
  return (
    <div style={{width: '100%', height: '100%', display: 'grid', placeItems: 'center'}}>
      <Extrude f={p.f} at={at(p.at)} text={p.text} size={p.size ?? 300} face={p.face ?? `linear-gradient(180deg, #ffffff 0%, ${brand.accent} 55%, ${withAlpha(brand.accent, 0.8)} 100%)`} side={p.side ?? '#1a1a1a'} depth={p.depth ?? 22} font={brand.fontDisplay} />
    </div>
  );
};

/** Countdown flip clock. */
export const KitFlipClock: React.FC<ScreenProps & {seconds: number; at?: At; size?: number}> = (p) => {
  const at = useAt(p);
  return (
    <div style={{width: '100%', height: '100%', display: 'grid', placeItems: 'center'}}>
      <FlipClock f={p.f} start={at(p.at)} startSeconds={p.seconds} size={p.size ?? 72} color={p.dark ? '#ececee' : '#16161a'} tile={p.dark ? '#141516' : '#ffffff'} labelColor={p.dark ? 'rgba(255,255,255,0.4)' : 'rgba(0,0,0,0.4)'} />
    </div>
  );
};

/** Counter with label ("100x / your content output"). */
export const KitCounter: React.FC<ScreenProps & {from?: number; to: number; at?: At; beats?: number; prefix?: string; suffix?: string; label?: string; size?: number; decimals?: number}> = (p) => {
  const brand = useBrand();
  const at = useAt(p);
  const t0 = at(p.at);
  const t1 = t0 + Math.round((p.beats ?? 2) * (p.b(1) - p.b(0)));
  return (
    <div style={{width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: p.dark ? brand.darkInk : brand.ink}}>
      <div style={{fontFamily: brand.fontDisplay, fontSize: p.size ?? 220, fontWeight: 500, letterSpacing: '-0.05em', lineHeight: 1}}>
        <Counter f={p.f} from={p.from ?? 1} to={p.to} f0={t0} f1={t1} prefix={p.prefix} suffix={p.suffix} decimals={p.decimals} />
      </div>
      {p.label ? <div style={{fontSize: (p.size ?? 220) * 0.14, opacity: clamp01(tween(p.f, t1 - 6, t1 + 10, 0, 1)) * 0.7, marginTop: 6}}>{p.label}</div> : null}
    </div>
  );
};

/** Grid that fills (escalation). */
export const KitFillGrid: React.FC<ScreenProps & {cols?: number; rows?: number; cell?: number; gap?: number; from?: At; to?: At; color?: string; label?: string}> = (p) => {
  const brand = useBrand();
  const at = useAt(p);
  return (
    <div style={{width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 18}}>
      {p.label ? <div style={{fontSize: 30, color: p.dark ? brand.darkInk : brand.ink, opacity: 0.85}}>{p.label}</div> : null}
      <FillGrid f={p.f} f0={at(p.from)} f1={at(p.to, 2)} cols={p.cols ?? 40} rows={p.rows ?? 7} cell={p.cell ?? 18} gap={p.gap ?? 4} color={p.color ?? brand.accent} empty={p.dark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'} />
    </div>
  );
};

/** URL / prompt input that gets typed into and submitted ("Just enter your website"). Logical 900×200. */
export const KitTypeField: React.FC<ScreenProps & {placeholder?: string; text: string; at?: At; submitAt?: At; hint?: string; cps?: number}> = (p) => {
  const brand = useBrand();
  const at = useAt(p);
  const t = at(p.at);
  const sub = p.submitAt !== undefined ? at(p.submitAt) : t + Math.round((p.text.length / (p.cps ?? 14)) * p.fps) + p.fps;
  const press = keys(p.f, [[sub - 3, 1], [sub, 0.9, EASE.premium], [sub + 8, 1, EASE.premium]]);
  const ink = p.dark ? brand.darkInk : brand.ink;
  return (
    <div style={{position: 'relative', width: 900, height: 200, padding: '34px 36px', boxSizing: 'border-box', fontFamily: brand.fontText, color: ink}}>
      <div style={{fontSize: 40, fontWeight: 450, letterSpacing: '-0.02em'}}>
        <TypeText f={p.f} text={p.text} at={t} cps={p.cps ?? 14} placeholder={p.placeholder ?? 'Type here…'} placeholderColor={withAlpha(ink, 0.35)} caretColor={brand.accent} />
      </div>
      <div style={{position: 'absolute', left: 36, bottom: 32, fontSize: 22, opacity: 0.6, display: 'flex', alignItems: 'center', gap: 10}}>◎ {p.hint ?? 'We’ll learn everything'}</div>
      <div style={{position: 'absolute', right: 30, bottom: 24, width: 104, height: 58, borderRadius: 29, background: brand.accent, display: 'grid', placeItems: 'center', color: brand.accentInk, fontSize: 30, transform: `scale(${press})`, boxShadow: `0 8px 24px ${withAlpha(brand.accent, 0.35)}`}}>↑</div>
      <Cursor f={p.f} path={[[t + Math.round((p.text.length / (p.cps ?? 14)) * p.fps), 760, 300], [sub - 2, 830, 150], [sub + p.fps, 860, 260]]} clicks={[sub]} color={ink} showFrom={sub - p.fps} size={34} />
    </div>
  );
};

/** Row of chips, one lights up per `at` (filters, categories). Logical 1200×120. */
export const KitChips: React.FC<ScreenProps & {chips: string[]; at?: At[]; cursor?: boolean}> = (p) => {
  const brand = useBrand();
  const at = useAt(p);
  const times = (p.at ?? []).map((x) => at(x));
  let on = -1;
  times.forEach((t, i) => {
    if (p.f >= t) on = i;
  });
  const ink = p.dark ? brand.darkInk : brand.ink;
  const w = 1200 / p.chips.length;
  return (
    <div style={{position: 'relative', width: 1200, height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 18, fontFamily: brand.fontText}}>
      {p.chips.map((c, i) => {
        const lit = i === on;
        const k = lit ? clamp01(sp(p.f, times[i], p.fps, 0.6, 3)) : 0;
        return (
          <div
            key={i}
            style={{
              padding: '18px 28px',
              borderRadius: 18,
              fontSize: 32,
              fontWeight: 560,
              color: lit ? brand.accentInk : ink,
              background: lit ? brand.accent : p.dark ? 'rgba(255,255,255,0.04)' : '#fff',
              boxShadow: lit ? `0 0 0 2px ${brand.accent}, 0 0 ${30 * k}px ${withAlpha(brand.accent, 0.6)}` : `0 0 0 1.5px ${p.dark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.1)'}`,
              transform: `scale(${1 + 0.05 * k * (1 - clamp01((p.f - times[i]) / 20))})`,
              whiteSpace: 'nowrap',
            }}
          >
            {c}
          </div>
        );
      })}
      {p.cursor !== false && times.length ? (
        <Cursor
          f={p.f}
          path={times.map((t, i) => [t - 2, w * i + w / 2 + 10, 92] as [number, number, number])}
          clicks={times}
          color={p.dark ? '#fff' : brand.ink}
          size={40}
        />
      ) : null}
    </div>
  );
};

/** A labelled toggle row ("Generate ●"). Logical 420×90. */
export const KitToggle: React.FC<ScreenProps & {label: string; at?: At}> = (p) => {
  const brand = useBrand();
  const at = useAt(p);
  return (
    <div style={{width: 420, height: 90, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 28px', boxSizing: 'border-box', fontFamily: brand.fontText, fontSize: 30, color: p.dark ? brand.darkInk : brand.ink}}>
      {p.label}
      <Toggle f={p.f} at={at(p.at)} size={42} on={brand.accent} />
    </div>
  );
};

export const KIT = {KitText, KitExtrude, KitFlipClock, KitCounter, KitFillGrid, KitTypeField, KitChips, KitToggle};
void ms;
