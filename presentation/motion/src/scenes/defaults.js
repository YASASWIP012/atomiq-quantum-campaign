// Choreography defaults per scene type, in BEATS from the scene's cut.
// Shared by the React scenes (via timeline.js → useScene().ev(name)) and by the score
// (cues → build/timeline.json → scripts/score.py). Change timing here, picture and sound move together.
//
// Each entry: { bars, in, music, tone, props, events(props, beats), cues(props, eventBeats, beats) }
//   events: name → beat offset. Scenes read them with ev('name').
//   cues:   { at: eventName | beat, sfx, gain?(dB), beats?(length), leadBeats?, pitch?, offset?(frames) }
//   music:  'sparse' | 'build' | 'full' | 'break' | 'out' | 'silent'   (density of the generated bed)
//
// When you add a scene type: add it here AND in registry.ts.

const range = (n) => Array.from({length: n}, (_, i) => i);

export const SCENE_DEFAULTS = {
  Hook: {
    bars: 2,
    music: 'sparse',
    // lines: one string per line; *word* = emphasis. swap: words that replace each other at the end
    // of the LAST line (swap[0] arrives with it, the rest one beat apart).
    props: {lines: ['Say the one thing', 'that matters.'], swap: [], align: 'left', size: null},
    events: (p) => {
      const ev = {};
      p.lines.forEach((_, i) => (ev[`line${i}`] = i));
      (p.swap ?? []).slice(1).forEach((_, k) => (ev[`swap${k + 1}`] = p.lines.length + k));
      return ev;
    },
    cues: (p) => [
      {at: 0, sfx: 'hit', gain: -2},
      ...p.lines.slice(1).map((_, i) => ({at: `line${i + 1}`, sfx: 'tick'})),
      ...(p.swap ?? []).slice(1).map((_, k) => ({at: `swap${k + 1}`, sfx: 'pop', pitch: k})),
    ],
  },

  Statement: {
    bars: 1,
    in: 'wipe',
    music: 'build',
    props: {text: 'One *idea*, said big.', align: 'center'},
    events: () => ({text: 0, emph: 1.5}),
    cues: () => [{at: 'emph', sfx: 'pop'}],
  },

  Reveal: {
    bars: 1,
    in: 'iris',
    music: 'build',
    props: {name: 'Product', tagline: 'What it does, in one line.'},
    events: () => ({mark: 0, name: 0.5, tagline: 1.5}),
    cues: () => [
      {at: 'mark', sfx: 'pop', gain: 2},
      {at: 'name', sfx: 'shimmer'},
      {at: 'tagline', sfx: 'tick', gain: -3},
    ],
  },

  Feature: {
    bars: 2,
    in: 'push',
    music: 'full',
    props: {num: '01', eyebrow: 'Feature', headline: ['Light line', 'bold line.'], sentence: 'One sentence that says what actually happens.', screen: 'SampleApp', device: 'phone', side: 'right'},
    events: () => ({caption: 0, sentence: 0.5, trigger: 1, react: 2, payoff: 3}),
    cues: () => [
      {at: 'trigger', sfx: 'click'},
      {at: 'react', sfx: 'pop'},
      {at: 'payoff', sfx: 'chime'},
    ],
  },

  Montage: {
    bars: (p) => Math.max(1, Math.ceil(((p.items?.length ?? 4) * (p.step ?? 0.5) + (p.final ? 2 : 0.5)) / 4)),
    in: 'whip',
    music: 'full',
    props: {items: ['Fast.', 'Exact.', 'Yours.'], step: 0.5, final: null},
    events: (p) => {
      const ev = {};
      p.items.forEach((_, k) => (ev[`item${k}`] = k * p.step));
      ev.final = p.items.length * p.step;
      return ev;
    },
    cues: (p) => [
      ...p.items.map((_, k) => ({at: `item${k}`, sfx: k % 2 ? 'tick' : 'thock', pitch: k})),
      ...(p.final ? [{at: 'final', sfx: 'hit'}] : []),
    ],
  },

  Stat: {
    bars: 1,
    in: 'zoom',
    music: 'build',
    props: {value: 100, from: 0, prefix: '', suffix: '', label: 'thing that matters', decimals: 0},
    events: () => ({count: 0, label: 0.5, land: 1.5}),
    cues: () => [
      {at: 'count', sfx: 'count', beats: 1.5},
      {at: 'land', sfx: 'hit', gain: -2},
    ],
  },

  Wall: {
    bars: 2,
    in: 'flood',
    music: 'build',
    props: {title: 'Everything, everywhere.', sub: '', card: 'SampleCard', count: 15, cols: 5},
    events: () => ({pull: 0, land: 2, title: 2.5}),
    cues: () => [
      {at: 'pull', sfx: 'riser', beats: 2},
      {at: 'land', sfx: 'hit'},
    ],
  },

  EndCard: {
    bars: 2,
    in: 'iris',
    music: 'out',
    props: {line: 'The closing line.', product: 'Product', url: 'example.com', cta: ''},
    events: () => ({line: 0, product: 1, url: 2}),
    cues: () => [
      {at: 'product', sfx: 'chime', gain: -1},
      {at: 'url', sfx: 'tick', gain: -4},
    ],
  },
};

// ---------- long-form ----------
const beatOf = (a, ev) => (typeof a === 'string' ? ev[a] : a);

SCENE_DEFAULTS.Journey = {
  bars: 8,
  in: 'cut',
  music: 'full',
  props: {panels: [], shots: [], captions: [], overlays: []},
  events: () => ({}),
  // Sound follows what moves: a soft tick when a caption lands, a pop when a panel pops in,
  // a whoosh into every big camera move. Add specific UI sounds with "addCues".
  cues: (p, ev) => {
    const out = [];
    for (const c of p.captions ?? []) {
      const at = beatOf(c.at, ev);
      if (at !== undefined) out.push({at, sfx: 'tick', gain: -9});
      for (const s of c.swapAt ?? []) {
        const b = beatOf(s, ev);
        if (b !== undefined) out.push({at: b, sfx: 'tick', gain: -11});
      }
    }
    for (const pn of p.panels ?? []) {
      if (pn.from !== undefined && pn.enter === 'pop') out.push({at: beatOf(pn.from, ev), sfx: 'pop', gain: -5});
    }
    for (const pn of p.overlays ?? []) {
      if (pn.from !== undefined) out.push({at: beatOf(pn.from, ev), sfx: 'pop', gain: -7});
    }
    let prevZoom = 1;
    for (const s of p.shots ?? []) {
      const at = beatOf(s.at, ev);
      const z = s.zoom ?? prevZoom;
      if (at > 0 && Math.abs(Math.log(z / prevZoom)) > 0.25) out.push({at, sfx: 'whoosh', gain: -8, offset: 0});
      prevZoom = z;
    }
    for (const bl of p.blooms ?? []) out.push({at: beatOf(bl.at, ev), sfx: 'hit', gain: 0});
    return out;
  },
};

SCENE_DEFAULTS.Outro = {
  bars: 3,
  in: 'blur',
  music: 'out',
  props: {name: 'Product', line: 'The line that closes it', roll: [], url: 'example.com'},
  events: () => ({mark: 0, line: 1, roll: 2, url: 3.5, click: 4.5}),
  cues: (p) => [
    {at: 'mark', sfx: 'pop', gain: 1},
    {at: 'line', sfx: 'tick', gain: -6},
    ...(p.roll?.length ? [{at: 'roll', sfx: 'count', beats: 1.2, gain: -6}] : []),
    {at: 'url', sfx: 'swish', gain: -6},
    {at: 'click', sfx: 'click', gain: 0},
    {at: 'click', sfx: 'chime', gain: -3, offset: 2},
  ],
};

export {range};
