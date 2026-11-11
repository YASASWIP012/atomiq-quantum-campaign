import React from 'react';
import {
  AbsoluteFill, Audio, Easing, interpolate, OffthreadVideo, Sequence, spring, staticFile, useCurrentFrame, useVideoConfig,
} from 'remotion';
import {loadFont} from '@remotion/fonts';
import durations from '../public/vo/durations.json';

// Numbers below are copied from the committed result files (stage1_summary.json, stage1_cv_summary.csv,
// stage2_selection.json, stage3_simulation.json). Nothing is illustrative.
const FPS = 30;
const BLUE = '#0F62FE';
const INK = '#161616';
const INK3 = '#525252';
const BG = '#F4F4F4';
const SANS = '"IBM Plex Sans", sans-serif';
const MONO = '"IBM Plex Mono", monospace';

for (const w of [400, 500, 600, 700]) loadFont({family: 'IBM Plex Sans', url: staticFile(`fonts/ibm-plex-sans-latin-${w}-normal.woff2`), weight: String(w)});
for (const w of [400, 500]) loadFont({family: 'IBM Plex Mono', url: staticFile(`fonts/ibm-plex-mono-latin-${w}-normal.woff2`), weight: String(w)});

const TOP10 = ['C0031', 'C0081', 'C0079', 'C0183', 'C0087', 'C0318', 'C0265', 'C0397', 'C0359', 'C0374'];
const SIX = new Set(['C0031', 'C0081', 'C0079', 'C0087', 'C0397', 'C0374']);
const BW = [0.02, 0.02874, 0.0413, 0.05934, 0.08527, 0.12252, 0.17606, 0.25298, 0.36352, 0.52235, 0.75059, 1.07855, 1.5498, 2.22696, 3.2];
const VAR = [0.0084, 0.02397, 0.05028, 0.0696, 0.06478, 0.04555, 0.02838, 0.01655, 0.00853, 0.00451, 0.0025, 0.00139, 0.00102, 0.00082, 0.00075];
const CV = [
  ['Logistic regression', '0.651', '0.332', '0.096', true],
  ['Hybrid (shipped)', '0.649', '0.330', '0.098', false],
  ['Quantum kernel', '0.510', '0.227', '0.103', false],
  ['Projected kernel', '0.497', '0.184', '0.105', false],
  ['Gradient boosting', '0.542', '0.258', '0.110', false],
] as const;

const PAD = [0.35, 0.45, 0.5, 0.6, 0.5, 0.5, 0.5, 2.6];
export const SCENES = (durations as number[]).map((d, i) => Math.round((d + PAD[i]) * FPS));
export const TOTAL = SCENES.reduce((a, b) => a + b, 0);

const out = Easing.bezier(0.22, 1, 0.36, 1);
const ramp = (f: number, a: number, b: number, from = 0, to = 1, ease = out) =>
  interpolate(f, [a, b], [from, to], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: ease});
const sp = (f: number, fps: number, delay = 0, damping = 14) => spring({frame: f - delay, fps, config: {damping, stiffness: 140, mass: 0.8}});

const Eyebrow: React.FC<{children: React.ReactNode; color?: string}> = ({children, color = INK3}) => (
  <div style={{display: 'flex', alignItems: 'center', gap: 12, font: `600 22px ${SANS}`, letterSpacing: '0.12em', textTransform: 'uppercase', color}}>
    <span style={{width: 10, height: 10, borderRadius: 5, background: BLUE}} />{children}
  </div>
);

// ---------- Scene 0 + 1: hook ----------
const Hook: React.FC<{lit: boolean}> = ({lit}) => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const a = lit ? 1 : Math.max(0.7, sp(f, fps, 0, 12));
  const b = sp(f, fps, lit ? -100 : 34, 12);
  const pct = lit ? interpolate(f, [24, 96], [0, 19.69], {extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: out}) : 0;
  return (
    <AbsoluteFill style={{background: '#fff', alignItems: 'center', justifyContent: 'center', fontFamily: SANS}}>
      <div style={{display: 'flex', gap: 34, alignItems: 'baseline', marginTop: -20}}>
        <div style={{font: `700 150px ${SANS}`, letterSpacing: '-0.045em', color: INK, transform: `translateY(${(1 - a) * 60}px) scale(${0.9 + 0.1 * a})`, opacity: Math.min(1, a * 1.5)}}>6 calls.</div>
        <div style={{font: `700 150px ${SANS}`, letterSpacing: '-0.045em', color: BLUE, transform: `translateY(${(1 - b) * 60}px)`, opacity: Math.min(1, b * 1.5)}}>Which 6?</div>
      </div>
      <div style={{display: 'grid', gridTemplateColumns: 'repeat(5, 230px)', gap: 18, marginTop: 70}}>
        {TOP10.map((id, i) => {
          const s = sp(f, fps, lit ? -100 : 8 + i * 2.2, 13);
          const on = lit && SIX.has(id);
          const k = lit ? ramp(f, 4 + i * 2, 16 + i * 2) : 0;
          return (
            <div key={id} style={{
              height: 84, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
              font: `500 34px ${MONO}`, transform: `translateY(${(1 - s) * -120}px)`, opacity: Math.min(1, s * 1.4) * (lit && !on ? 1 - 0.65 * k : 1),
              background: on ? `rgba(15,98,254,${k})` : '#fff', color: on && k > 0.5 ? '#fff' : INK,
              boxShadow: on ? `0 0 0 2px ${BLUE}, 0 18px 40px -18px rgba(15,98,254,${0.7 * k})` : '0 0 0 1.5px #E0E0E0',
            }}>{id}</div>
          );
        })}
      </div>
      <div style={{height: 120, marginTop: 56, display: 'flex', alignItems: 'baseline', gap: 22, opacity: lit ? ramp(f, 18, 30) : 0}}>
        <span style={{font: `700 104px ${SANS}`, color: BLUE, letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums'}}>{pct.toFixed(1)}%</span>
        <span style={{font: `500 44px ${SANS}`, color: INK}}>chance of 3 or more sign-ups</span>
      </div>
    </AbsoluteFill>
  );
};

// ---------- Footage in a browser window ----------
const Footage: React.FC<{src: string; dur: number; caption: string; sub?: string; push?: [number, number, number, number]; children?: React.ReactNode}> = ({src, dur, caption, sub, push = [1, 1.07, 50, 45], children}) => {
  const f = useCurrentFrame();
  const {durationInFrames} = useVideoConfig();
  const z = interpolate(f, [0, durationInFrames], [push[0], push[1]], {easing: Easing.inOut(Easing.quad)});
  const enter = ramp(f, 0, 18);
  const cap = ramp(f, 10, 28);
  return (
    <AbsoluteFill style={{background: `radial-gradient(70% 60% at 85% 0%, #D0E2FF 0, transparent 60%), radial-gradient(60% 60% at 10% 100%, #E5F6FF 0, transparent 60%), ${BG}`, fontFamily: SANS}}>
      <div style={{position: 'absolute', left: 150, top: 70, width: 1620, height: 940, borderRadius: 18, overflow: 'hidden', background: '#fff',
        boxShadow: '0 0 0 1px rgba(0,0,0,.08), 0 50px 100px -40px rgba(0,0,0,.45)', transform: `translateY(${(1 - enter) * 40}px) scale(${0.97 + 0.03 * enter})`}}>
        <div style={{height: 40, background: 'linear-gradient(#FBFBFB,#F1F1F2)', display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px', borderBottom: '1px solid rgba(0,0,0,.08)'}}>
          {['#FF5F57', '#FEBC2E', '#28C840'].map((c) => <span key={c} style={{width: 12, height: 12, borderRadius: 6, background: c}} />)}
          <div style={{margin: '0 auto', padding: '4px 18px', borderRadius: 8, background: '#fff', boxShadow: '0 0 0 1px rgba(0,0,0,.08)', font: `400 15px ${MONO}`, color: INK3}}>yasaswip012.github.io/atomiq-quantum-campaign</div>
        </div>
        <div style={{width: 1620, height: 900, overflow: 'hidden'}}>
          <div style={{width: 1600, height: 900, transform: `scale(${(1620 / 1600) * z})`, transformOrigin: `${push[2]}% ${push[3]}%`}}>
            <OffthreadVideo src={staticFile(src)} muted playbackRate={dur / (durationInFrames / FPS)} style={{width: 1600, height: 900}} />
          </div>
        </div>
      </div>
      <div style={{position: 'absolute', left: 110, bottom: 46, padding: '18px 28px', borderRadius: 16, background: INK, color: '#fff',
        transform: `translateY(${(1 - cap) * 30}px)`, opacity: cap, boxShadow: '0 20px 50px -20px rgba(0,0,0,.6)'}}>
        <div style={{font: `600 34px ${SANS}`, letterSpacing: '-0.01em'}}>{caption}</div>
        {sub && <div style={{font: `400 24px ${SANS}`, color: '#C6C6C6', marginTop: 4}}>{sub}</div>}
      </div>
      {children}
    </AbsoluteFill>
  );
};

// ---------- Stage 1 motion ----------
const Stage1: React.FC = () => {
  const f = useCurrentFrame();
  const W = 760, H = 420;
  const lx = (b: number) => (Math.log10(b) - Math.log10(0.02)) / (Math.log10(3.2) - Math.log10(0.02)) * W;
  const ly = (v: number) => H - (v / 0.075) * H;
  const pts = BW.map((b, i) => `${i ? 'L' : 'M'}${lx(b).toFixed(1)},${ly(VAR[i]).toFixed(1)}`).join(' ');
  const draw = ramp(f, 12, 110, 0, 1, Easing.inOut(Easing.cubic));
  const tableIn = 300;
  return (
    <AbsoluteFill style={{background: '#fff', fontFamily: SANS, padding: '90px 120px'}}>
      <Eyebrow>Stage 1 · who subscribes</Eyebrow>
      <div style={{font: `700 64px ${SANS}`, letterSpacing: '-0.035em', color: INK, marginTop: 18, opacity: ramp(f, 0, 14)}}>
        Past successes say yes <span style={{color: BLUE}}>6 in 10</span>. They rank first.
      </div>
      <div style={{display: 'flex', gap: 90, marginTop: 70}}>
        <div style={{opacity: ramp(f, 6, 20)}}>
          <div style={{font: `500 26px ${SANS}`, color: INK, marginBottom: 18}}>Quantum kernel spread vs bandwidth</div>
          <svg width={W + 90} height={H + 70} style={{overflow: 'visible'}}>
            <g transform="translate(70,10)">
              <line x1={0} y1={H} x2={W} y2={H} stroke="#C6C6C6" strokeWidth={2} />
              <line x1={0} y1={0} x2={0} y2={H} stroke="#C6C6C6" strokeWidth={2} />
              <path d={pts} fill="none" stroke={BLUE} strokeWidth={6} strokeLinecap="round" strokeLinejoin="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - draw} />
              <g opacity={ramp(f, 100, 120)}>
                <circle cx={lx(1)} cy={ly(0.00145)} r={11} fill="#fff" stroke={INK} strokeWidth={4} />
                <text x={lx(1) - 10} y={ly(0.00145) - 30} font-family={SANS} fontSize={24} fill={INK}>default scale: flat</text>
              </g>
              <g opacity={ramp(f, 140, 160)}>
                <circle cx={lx(0.1)} cy={ly(0.0587)} r={11} fill={BLUE} />
                <text x={lx(0.1) + 24} y={ly(0.0587) - 18} font-family={SANS} fontSize={24} fontWeight={600} fill={BLUE}>tuned: 0.1</text>
              </g>
              <text x={W / 2} y={H + 50} textAnchor="middle" font-family={SANS} fontSize={22} fill={INK3}>bandwidth (log scale)</text>
            </g>
          </svg>
        </div>
        <div style={{flex: 1, opacity: ramp(f, tableIn, tableIn + 16), transform: `translateX(${(1 - ramp(f, tableIn, tableIn + 22)) * 50}px)`}}>
          <div style={{font: `500 26px ${SANS}`, color: INK, marginBottom: 18}}>Nested CV on train only (10 × 5 folds)</div>
          <div style={{display: 'grid', gridTemplateColumns: '1fr 120px 120px 120px', font: `400 26px ${SANS}`, color: INK}}>
            {['Model', 'ROC-AUC', 'PR-AUC', 'Brier'].map((h) => <div key={h} style={{padding: '12px 14px', color: INK3, fontWeight: 600, fontSize: 21, borderBottom: '2px solid #E0E0E0'}}>{h}</div>)}
            {CV.map(([m, a, p, b, hi], i) => {
              const r = ramp(f, tableIn + 8 + i * 5, tableIn + 22 + i * 5);
              const hl = hi ? ramp(f, tableIn + 60, tableIn + 76) : 0;
              return [m, a, p, b].map((c, j) => (
                <div key={`${i}-${j}`} style={{padding: '14px 14px', opacity: r, fontFamily: j ? MONO : SANS, borderBottom: '1px solid #E0E0E0',
                  background: `rgba(15,98,254,${0.1 * hl})`, fontWeight: hi && hl > 0.5 ? 600 : 400, color: hi && hl > 0.5 ? BLUE : INK}}>{c}</div>
              ));
            })}
          </div>
          <div style={{font: `400 24px ${SANS}`, color: INK3, marginTop: 22, opacity: ramp(f, tableIn + 90, tableIn + 106)}}>35 positives. The quantum kernel does not beat LR, and we report that.</div>
        </div>
      </div>
    </AbsoluteFill>
  );
};

// ---------- Stage 3 estimates overlay ----------
const ROWS = [
  ['Exact (Poisson-binomial)', '0.1969', 0], ['Aer, 200k shots', '0.1971', 0.0002],
  ['Heron noise model, raw', '0.1999', 0.0030], ['… readout-mitigated', '0.1972', 0.0003],
] as const;
const Estimates: React.FC = () => {
  const f = useCurrentFrame();
  const s = ramp(f, 150, 170);
  return (
    <div style={{position: 'absolute', right: 70, top: 140, width: 560, padding: '28px 30px', borderRadius: 18, background: '#fff',
      boxShadow: '0 0 0 1px rgba(0,0,0,.08), 0 40px 80px -30px rgba(0,0,0,.4)', opacity: s, transform: `translateX(${(1 - s) * 60}px)`, fontFamily: SANS}}>
      <div style={{font: `600 22px ${SANS}`, color: INK3, letterSpacing: '0.1em', textTransform: 'uppercase'}}>P(≥3 of 6) in Qiskit</div>
      {ROWS.map(([m, v, e], i) => {
        const r = ramp(f, 165 + i * 12, 180 + i * 12);
        const bad = i === 2;
        return (
          <div key={m} style={{display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '14px 0', borderBottom: i < 3 ? '1px solid #E0E0E0' : 'none', opacity: r}}>
            <span style={{font: `400 25px ${SANS}`, color: INK}}>{m}</span>
            <span style={{font: `500 30px ${MONO}`, color: bad ? '#DA1E28' : i === 3 ? BLUE : INK}}>{v}{i ? <span style={{fontSize: 20, color: INK3}}> ±{e.toFixed(4)}</span> : null}</span>
          </div>
        );
      })}
    </div>
  );
};

// ---------- Error budget ----------
const BUDGET = [
  ['Stage 1 model (bootstrap)', 0.0996], ['Heron noise bias', 0.0030], ['Shot noise, 200k', 0.00089], ['After mitigation', 0.00034],
] as const;
const Budget: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{background: '#fff', fontFamily: SANS, padding: '100px 140px'}}>
      <Eyebrow>Error budget on P(≥3)</Eyebrow>
      <div style={{font: `700 70px ${SANS}`, letterSpacing: '-0.035em', color: INK, marginTop: 18}}>
        The big error isn't quantum.<br /><span style={{color: BLUE}}>It's 35 positive examples.</span>
      </div>
      <div style={{marginTop: 70, display: 'flex', flexDirection: 'column', gap: 26}}>
        {BUDGET.map(([n, v], i) => {
          const g = ramp(f, 10 + i * 8, 50 + i * 8);
          return (
            <div key={n} style={{display: 'flex', alignItems: 'center', gap: 30}}>
              <div style={{width: 420, font: `400 30px ${SANS}`, color: INK}}>{n}</div>
              <div style={{width: 1000 * (v / 0.0996) * g + 6, height: 46, borderRadius: 8, background: i ? '#A6C8FF' : BLUE}} />
              <div style={{font: `500 28px ${MONO}`, color: INK, opacity: ramp(f, 40 + i * 8, 55 + i * 8)}}>±{v.toFixed(4)}</div>
            </div>
          );
        })}
      </div>
      <div style={{position: 'absolute', left: 140, bottom: 90, display: 'flex', gap: 18, opacity: ramp(f, 150, 166), transform: `translateY(${(1 - ramp(f, 150, 170)) * 20}px)`}}>
        {['CI on Linux: tests ✓', 'Reproduce: same six, same P(≥3) ✓', 'All seeds recorded'].map((t) => (
          <div key={t} style={{padding: '14px 24px', borderRadius: 999, boxShadow: '0 0 0 2px #24A148', color: '#0E6027', font: `500 26px ${SANS}`, background: '#DEFBE6'}}>{t}</div>
        ))}
      </div>
    </AbsoluteFill>
  );
};

// ---------- End card ----------
const End: React.FC = () => {
  const f = useCurrentFrame();
  const {fps} = useVideoConfig();
  const a = sp(f, fps, 0, 16);
  return (
    <AbsoluteFill style={{background: BLUE, color: '#fff', fontFamily: SANS, alignItems: 'center', justifyContent: 'center', textAlign: 'center'}}>
      <div style={{font: `700 120px ${SANS}`, letterSpacing: '-0.045em', transform: `translateY(${(1 - a) * 50}px)`, opacity: a}}>Six customers,<br />one campaign.</div>
      <div style={{marginTop: 60, font: `500 40px ${MONO}`, opacity: ramp(f, 12, 28)}}>yasaswip012.github.io/atomiq-quantum-campaign</div>
      <div style={{marginTop: 18, font: `400 32px ${MONO}`, opacity: ramp(f, 20, 36), color: '#D0E2FF'}}>github.com/YASASWIP012/atomiq-quantum-campaign</div>
      <div style={{marginTop: 50, font: `500 30px ${SANS}`, opacity: ramp(f, 28, 44), color: '#D0E2FF'}}>Qiskit 2.6 · Aer · IBM Heron noise model · no login</div>
    </AbsoluteFill>
  );
};

export const Atomiq: React.FC = () => {
  let at = 0;
  const seq = (i: number, node: React.ReactNode) => {
    const from = at;
    at += SCENES[i];
    return (
      <Sequence key={i} from={from} durationInFrames={SCENES[i]}>
        {node}
        <Sequence from={i === 0 ? 2 : 6}><Audio src={staticFile(`vo/s${i}.wav`)} /></Sequence>
      </Sequence>
    );
  };
  return (
    <AbsoluteFill style={{background: '#fff'}}>
      {seq(0, <Hook lit={false} />)}
      {seq(1, <Hook lit />)}
      {seq(2, <Footage src="footage/hero.mp4" dur={12.07} caption="The live page: the six, and P(≥3) = 0.197" sub="Exact value 0.1969 · every number links to a result file" push={[1.04, 1.16, 50, 35]} />)}
      {seq(3, <Stage1 />)}
      {seq(4, <Footage src="footage/checker.mp4" dur={17.83} caption="Stage 2 · Dicke(10,6) start + XY mixer QAOA" sub="Optimum 27× more often than a random valid pick · gap 0 vs brute force" push={[1.02, 1.12, 60, 40]} />)}
      {seq(5, <Footage src="footage/sampler.mp4" dur={11.77} caption="Stage 3 · one RY qubit per customer" sub="Qubit i = rank-i pick · success = 3 or more ones" push={[1.05, 1.12, 25, 45]}><Estimates /></Footage>)}
      {seq(6, <Budget />)}
      {seq(7, <End />)}
    </AbsoluteFill>
  );
};
