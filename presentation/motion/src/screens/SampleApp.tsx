// Placeholder product screens so a fresh project renders out of the box.
// Replace with the real product's UI, rebuilt in code (see references/product-ui.md).
import React from 'react';
import {EASE, ms, tween, clamp01} from '../lib/motion';
import {Tap, PopIn, Check} from '../components/UI';
import {Counter} from '../components/Type';
import {ScreenProps} from './types';

const ACCENT = '#3b5bff';

/** Phone screen (393×852): tap a button (trigger) → rows arrive (reaction) → total + check (payoff). */
export const SampleApp: React.FC<ScreenProps> = ({f, ev, fps}) => {
  const trig = ev('trigger', 1);
  const react = ev('react', 2);
  const pay = ev('payoff', 3);
  const rows = [
    ['Design review', '45 min'],
    ['Write launch post', '30 min'],
    ['Record demo', '1 h'],
  ];
  return (
    <div style={{width: 393, height: 852, background: '#F6F7FB', fontFamily: 'Inter', color: '#111', position: 'relative'}}>
      <div style={{padding: '70px 24px 0'}}>
        <div style={{fontSize: 15, color: '#777'}}>Today</div>
        <div style={{fontSize: 34, fontWeight: 760, letterSpacing: '-0.035em', marginTop: 4}}>Plan my day</div>
        <div style={{marginTop: 26, display: 'flex', flexDirection: 'column', gap: 10}}>
          {rows.map(([a, bb], i) => (
            <PopIn key={i} f={f} at={react + i * ms(fps, 120)}>
              <div style={{display: 'flex', justifyContent: 'space-between', background: '#fff', borderRadius: 16, padding: '16px 18px', fontSize: 17, fontWeight: 600, boxShadow: '0 1px 2px rgba(0,0,0,0.05), 0 6px 18px rgba(0,0,0,0.05)'}}>
                <span>{a}</span>
                <span style={{color: '#888', fontWeight: 500}}>{bb}</span>
              </div>
            </PopIn>
          ))}
        </div>
        <div style={{marginTop: 26, display: 'flex', alignItems: 'center', gap: 12, opacity: clamp01(tween(f, pay, pay + ms(fps, 250), 0, 1))}}>
          <Check f={f} at={pay} size={34} bg={ACCENT} />
          <div style={{fontSize: 20, fontWeight: 700}}>
            <Counter f={f} from={0} to={2.25} f0={pay} f1={pay + ms(fps, 600)} decimals={2} suffix=" h planned" />
          </div>
        </div>
      </div>
      <div style={{position: 'absolute', left: 24, right: 24, bottom: 40, height: 62, borderRadius: 31, background: ACCENT, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 18, fontWeight: 700, transform: `scale(${f >= trig && f < trig + 8 ? 0.96 : 1})`}}>
        Plan it for me
      </div>
      <Tap f={f} at={trig} x={196} y={781} />
      <div style={{position: 'absolute', inset: 0, background: '#fff', opacity: 1 - tween(f, -30, 0, 0, 1, EASE.premium), pointerEvents: 'none'}} />
    </div>
  );
};

/** Card for walls / journeys (logical 800×600). */
export const SampleCard: React.FC<ScreenProps> = ({index = 0, dark}) => {
  const hues = dark ? ['#12161c', '#161319', '#11171a', '#18141a', '#13141b'] : ['#e8edff', '#fff1e6', '#eafaf1', '#fdeaf3', '#f1ecff'];
  return (
    <div style={{width: 800, height: 600, background: hues[(index as number) % hues.length], fontFamily: 'Inter', padding: 48, boxSizing: 'border-box'}}>
      <div style={{fontSize: 22, color: dark ? '#8a8f96' : '#666'}}>Card {(index as number) + 1}</div>
      <div style={{marginTop: 18, height: 26, width: '60%', borderRadius: 13, background: dark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.12)'}} />
      <div style={{marginTop: 14, height: 26, width: '42%', borderRadius: 13, background: dark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}} />
      <div style={{marginTop: 40, height: 300, borderRadius: 24, background: dark ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.7)', display: 'flex', alignItems: 'flex-end', gap: 14, padding: 24, boxSizing: 'border-box'}}>
        {[40, 70, 55, 90, 75, 110, 95].map((h, i) => <div key={i} style={{flex: 1, height: h * 2, borderRadius: 8, background: dark ? (i > 4 ? '#39E6FF' : 'rgba(255,255,255,0.12)') : (i > 4 ? '#3b5bff' : 'rgba(0,0,0,0.08)')}} />)}
      </div>
    </div>
  );
};
