// Render review stills + a contact sheet. Look at these BEFORE a full render.
// Usage:
//   node scripts/stills.mjs --film <id> [--format 16x9] [--frames 0,45,90] [--every 1] [--scene id] [--scale 0.5]
//   default frames: for every scene, the cut, each named event (+8 frames), mid-scene and just before the next cut.
//   --every N : one still every N beats instead.  Output: out/stills/<film>-<format>/ + contact.png
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {bundle} from '@remotion/bundler';
import {renderStill, selectComposition, openBrowser} from '@remotion/renderer';
import {ROOT, args, loadFilm, findBrowser, ensureDir} from './lib.mjs';
import {buildTimeline} from '../src/timeline.js';

const a = args();
const {id, film} = loadFilm(a.film);
const fmt = a.format ?? '16x9';
const tl = buildTimeline(film);
const N = tl.meta.durationInFrames;
const fpb = tl.meta.framesPerBeat;

let frames = [];
if (a.frames) frames = String(a.frames).split(',').map((x) => parseInt(x, 10));
else if (a.every) for (let bt = 0; bt * fpb < N; bt += Number(a.every)) frames.push(Math.round(bt * fpb));
else {
  for (const s of tl.scenes) {
    if (a.scene && s.id !== a.scene) continue;
    frames.push(s.start + 2, Math.round((s.start + s.end) / 2), s.end - Math.max(3, s.outLen + 2));
    for (const v of Object.values(s.events)) frames.push(s.start + v + 8);
  }
}
frames = [...new Set(frames.filter((x) => x >= 0 && x < N))].sort((x, y) => x - y);

const outDir = ensureDir(path.join(ROOT, 'out/stills', `${id}-${fmt}`));
for (const f of fs.readdirSync(outDir)) fs.rmSync(path.join(outDir, f));

const browserExecutable = findBrowser();
console.log(`Bundling… (${frames.length} stills of ${id}-${fmt})`);
const serveUrl = await bundle({entryPoint: path.join(ROOT, 'src/index.ts'), publicDir: path.join(ROOT, 'public')});
const browser = await openBrowser('chrome', {browserExecutable});
const inputProps = {film, debug: !a.clean};
const composition = await selectComposition({serveUrl, id: `${id}-${fmt}`, inputProps, puppeteerInstance: browser});
const scale = Number(a.scale ?? 0.5);
const t0 = Date.now();
for (const fr of frames) {
  await renderStill({serveUrl, composition, frame: fr, output: path.join(outDir, `f${String(fr).padStart(5, '0')}.png`), inputProps, scale, puppeteerInstance: browser});
  process.stdout.write('.');
}
await browser.close({silent: true});
console.log(`\n${frames.length} stills in ${((Date.now() - t0) / 1000).toFixed(1)}s → ${path.relative(ROOT, outDir)}`);

// contact sheet(s): 4 columns, up to 16 per sheet
const files = fs.readdirSync(outDir).filter((f) => f.startsWith('f')).sort();
const per = 16;
for (let i = 0; i < files.length; i += per) {
  const chunk = files.slice(i, i + per);
  const list = path.join(outDir, `_list${i}.txt`);
  fs.writeFileSync(list, chunk.map((f) => `file '${path.join(outDir, f)}'`).join('\n'));
  const rows = Math.ceil(chunk.length / 4);
  const sheet = path.join(outDir, `contact-${String(i / per + 1).padStart(2, '0')}.png`);
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-vf', `scale=480:-2,tile=4x${rows}:padding=4:color=gray`, '-frames:v', '1', sheet]);
  fs.rmSync(list);
  console.log('contact sheet →', path.relative(ROOT, sheet));
}
