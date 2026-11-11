// The film's clock. Plain JS on purpose: the React film imports it AND node/python tooling
// (scripts/timeline.mjs → build/timeline.json → scripts/score.py) reads the same numbers,
// so picture and sound can never disagree about when something happens.
//
// Units: scenes are sized in bars/beats; events and cues are in beats relative to the scene's
// start (the cut). Every beat is converted to a frame independently (round per beat), never by
// adding a rounded frames-per-beat, so long films don't drift off the music.

import {SCENE_DEFAULTS} from './scenes/defaults.js';

/** Default transition lengths (ms). A transition always COMPLETES on the cut (the beat). */
export const TRANSITIONS = {
  cut: 0,
  iris: 520,
  flood: 680,
  wipe: 460,
  whip: 240,
  push: 560,
  zoom: 480,
  split: 560,
  blur: 420,
  flash: 520,
};

/** Sound each transition makes by default (peaks one frame after the cut). */
export const TRANSITION_SFX = {
  iris: 'swish',
  flood: 'whoosh',
  wipe: 'swish',
  whip: 'whip',
  push: 'swish',
  zoom: 'whoosh',
  split: 'whoosh',
  blur: 'swish',
  flash: 'hit',
};

export const beatFrame = (meta, beat) => Math.round((beat * meta.fps * 60) / meta.bpm);

export function normTransition(t) {
  if (!t || t === 'cut') return {type: 'cut', ms: 0};
  if (typeof t === 'string') return {type: t, ms: TRANSITIONS[t] ?? 450};
  return {ms: TRANSITIONS[t.type] ?? 450, ...t};
}

const resolve = (v, ...args) => (typeof v === 'function' ? v(...args) : v);

export function buildTimeline(film) {
  const meta = {fps: 60, bpm: 120, beatsPerBar: 4, tailBeats: 0, ...film.meta};
  const fpb = (meta.fps * 60) / meta.bpm;
  const scenes = [];
  let beat = 0;

  film.scenes.forEach((s, i) => {
    const d = SCENE_DEFAULTS[s.type];
    if (!d) throw new Error(`Unknown scene type "${s.type}" (scene ${i}). Add it to src/scenes/defaults.js and registry.ts.`);
    const props = {...(d.props ?? {}), ...(s.props ?? {})};
    const beats = s.beats ?? (s.bars ?? resolve(d.bars, props) ?? 2) * meta.beatsPerBar;
    const startBeat = beat;
    beat += beats;
    const start = beatFrame(meta, startBeat);
    const end = beatFrame(meta, beat);
    const tin = normTransition(i === 0 ? 'cut' : (s.in ?? d.in ?? 'cut'));
    const inLen = tin.type === 'cut' ? 0 : Math.max(2, Math.round((tin.ms / 1000) * meta.fps));

    const evBeats = {...(resolve(d.events, props, beats) ?? {}), ...(s.events ?? {})};
    const events = {};
    for (const [k, b] of Object.entries(evBeats)) events[k] = beatFrame(meta, startBeat + b) - start;

    const baseCues = s.cues ?? resolve(d.cues, props, evBeats, beats) ?? [];
    scenes.push({
      id: s.id ?? `${s.type.toLowerCase()}-${i}`,
      type: s.type,
      index: i,
      startBeat,
      beats,
      start,
      end,
      dur: end - start,
      in: tin,
      inLen,
      tone: s.tone ?? d.tone ?? 'light',
      music: s.music ?? d.music ?? 'full',
      events,
      eventBeats: evBeats,
      props,
      _cues: [...baseCues, ...(s.addCues ?? [])],
    });
  });

  scenes.forEach((s, i) => {
    const next = scenes[i + 1];
    s.out = next ? next.in : {type: 'cut', ms: 0};
    s.outLen = next ? next.inLen : 0;
  });

  const totalBeats = beat + meta.tailBeats;
  const durationInFrames = beatFrame(meta, totalBeats);
  // the last scene holds through the tail (silence/ring-out after the final hit)
  if (scenes.length) {
    const last = scenes[scenes.length - 1];
    last.end = durationInFrames;
    last.dur = last.end - last.start;
  }

  const cues = [];
  for (const s of scenes) {
    if (s.in.type !== 'cut' && s.in.sfx !== false) {
      cues.push({frame: s.start, sfx: s.in.sfx ?? TRANSITION_SFX[s.in.type] ?? 'swish', leadFrames: s.inLen, gain: s.in.gain ?? 0, scene: s.id, why: `${s.in.type} into ${s.id}`});
    }
    for (const c of s._cues) {
      let frame;
      if (typeof c.at === 'string') {
        if (!(c.at in s.events)) throw new Error(`Scene "${s.id}": cue refers to unknown event "${c.at}". Known: ${Object.keys(s.events).join(', ')}`);
        frame = s.start + s.events[c.at];
      } else {
        frame = beatFrame(meta, s.startBeat + (c.at ?? 0));
      }
      frame += c.offset ?? 0;
      const out = {...c, frame, scene: s.id};
      if (c.beats) out.durFrames = Math.round(c.beats * fpb);
      if (c.leadBeats) out.leadFrames = Math.round(c.leadBeats * fpb);
      cues.push(out);
    }
    delete s._cues;
  }
  cues.sort((a, b) => a.frame - b.frame);

  return {
    meta: {...meta, framesPerBeat: fpb, totalBeats, durationInFrames, seconds: durationInFrames / meta.fps},
    brand: film.brand,
    scenes,
    cues,
  };
}
