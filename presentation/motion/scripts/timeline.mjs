// Print the film's beat map, write build/<film>.timeline.json (read by score.py), and lint it
// against the craft rules. Usage: node scripts/timeline.mjs --film <id> [--quiet]
import fs from 'node:fs';
import path from 'node:path';
import {ROOT, args, loadFilm, ensureDir} from './lib.mjs';
import {buildTimeline} from '../src/timeline.js';

const a = args();
const {id, film} = loadFilm(a.film);
const tl = buildTimeline(film);
const {meta} = tl;
const fps = meta.fps;
const sec = (fr) => (fr / fps).toFixed(2);

ensureDir(path.join(ROOT, 'build'));
const outPath = path.join(ROOT, 'build', `${id}.timeline.json`);
fs.writeFileSync(outPath, JSON.stringify({id, meta, brand: film.brand, scenes: tl.scenes.map(({props, ...s}) => s), cues: tl.cues}, null, 1));

const warnings = [];
const words = (t) => String(t).replace(/\*/g, '').trim().split(/\s+/).filter(Boolean).length;
const readFrames = (t) => Math.ceil((0.3 * words(t) + 0.5) * fps);
const beatToF = (s, v) => (typeof v === 'string' ? s.events[v] : Math.round(v * meta.framesPerBeat));

for (const s of tl.scenes) {
  const p = s.props ?? {};
  // captions (long form)
  for (const c of p.captions ?? []) {
    const at = beatToF(s, c.at);
    const until = c.until !== undefined ? beatToF(s, c.until) : s.dur;
    const text = [c.text, ...(c.swap ?? [])].join(' ');
    const need = readFrames(c.swap ? c.swap.reduce((m, x) => (words(x) > words(m) ? x : m), c.text) : c.text);
    if (until - at < need) warnings.push(`${s.id}: caption "${c.text}" holds ${sec(until - at)}s, needs ≥ ${sec(need)}s to be read (0.3 s/word + 0.5 s)`);
    if (String(c.text).replace(/\*/g, '').length > 48) warnings.push(`${s.id}: caption "${c.text}" is long (${c.text.length} chars) — keep lines short, ~6 words`);
    void text;
  }
  // headlines (short form)
  if (s.type === 'Feature') {
    const h = (p.headline ?? []).join(' ');
    if (s.dur < readFrames(h)) warnings.push(`${s.id}: headline needs ${sec(readFrames(h))}s, scene is ${sec(s.dur)}s`);
    for (const line of p.headline ?? []) if (String(line).replace(/\*/g, '').length > 16) warnings.push(`${s.id}: headline line "${line}" > 16 chars — it will wrap or shrink`);
    if (p.sentence && p.sentence.length > 80) warnings.push(`${s.id}: sentence is ${p.sentence.length} chars (keep < 80)`);
  }
}

// thumbnail rule: something must be on screen at frame 0
const first = tl.scenes[0];
if (first) {
  const p = first.props ?? {};
  const capAtZero = (p.captions ?? []).some((c) => beatToF(first, c.at) + Math.round(0.9 * fps) <= 0);
  const panelAtZero = (p.panels ?? []).some((pn) => pn.from === undefined);
  const ok = first.type === 'Hook' || capAtZero || panelAtZero || first.type === 'Feature';
  if (!ok) warnings.push(`frame 0 looks empty — it's the thumbnail. Start a caption at a negative beat (e.g. "at": -1.5) or show a panel without "from".`);
}

// flashes: never more than 3 per second (WCAG 2.3.1)
const flashes = [];
for (const s of tl.scenes) {
  if (s.in.type === 'flash') flashes.push(s.start);
  for (const bl of s.props?.blooms ?? []) flashes.push(s.start + beatToF(s, bl.at));
}
flashes.sort((x, y) => x - y);
for (let i = 3; i < flashes.length; i++) if (flashes[i] - flashes[i - 3] < fps) warnings.push(`more than 3 flashes within 1 s around ${sec(flashes[i])}s — reduce them`);

if (meta.target && Math.abs(meta.seconds - meta.target) > 2) warnings.push(`film runs ${meta.seconds.toFixed(1)}s, target is ${meta.target}s`);

if (!a.quiet) {
  console.log(`\n${film.meta?.title ?? id}  ·  ${meta.seconds.toFixed(2)} s  ·  ${meta.durationInFrames} frames @ ${fps} fps  ·  ${meta.bpm} BPM (${meta.framesPerBeat.toFixed(2)} frames/beat)\n`);
  console.log('  #  scene              type       in        bars  start→end (s)        music');
  for (const s of tl.scenes) {
    console.log(
      `${String(s.index + 1).padStart(3)}  ${s.id.padEnd(18)} ${s.type.padEnd(10)} ${s.in.type.padEnd(9)} ${String(s.beats / meta.beatsPerBar).padStart(4)}  ${sec(s.start).padStart(6)} → ${sec(s.end).padEnd(8)}     ${s.music}`,
    );
  }
  console.log(`\n${tl.cues.length} sound cues → ${path.relative(ROOT, outPath)}`);
}
if (warnings.length) {
  console.log(`\n⚠ ${warnings.length} note(s):`);
  for (const w of warnings) console.log('  - ' + w);
} else if (!a.quiet) console.log('\n✓ lint clean');
