// Render a film to MP4 with its score muxed in.
//   node scripts/render.mjs --film <id> [--format 16x9,9x16] [--draft] [--frames 0-299]
//                           [--no-audio] [--music track.wav] [--music-gain -4] [--crf 16] [--concurrency N]
// --draft: half resolution, faster encode — for review. Final: full res, CRF 16, yuv420p, faststart.
// Output: out/<film>-<format>.mp4 (and -draft). The X/Instagram-ready settings are the defaults.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {bundle} from '@remotion/bundler';
import {renderMedia, selectComposition} from '@remotion/renderer';
import {ROOT, args, loadFilm, findBrowser, ensureDir} from './lib.mjs';

const a = args();
const {id, film} = loadFilm(a.film);
const formats = String(a.format ?? '16x9').split(',');
const draft = !!a.draft;
const outDir = ensureDir(path.join(ROOT, 'out'));
const buildDir = ensureDir(path.join(ROOT, 'build'));

// 1) timeline + lint, 2) score (unless --no-audio)
execFileSync('node', [path.join(ROOT, 'scripts/timeline.mjs'), '--film', id, '--quiet'], {stdio: 'inherit'});
let wav = null;
if (!a['no-audio']) {
  const sargs = [path.join(ROOT, 'scripts/score.py'), '--film', id];
  if (a.music) sargs.push('--music', path.resolve(a.music), '--music-gain', String(a['music-gain'] ?? -4));
  if (a['no-bed']) sargs.push('--no-bed');
  execFileSync('python3', sargs, {stdio: 'inherit'});
  wav = path.join(buildDir, `${id}.wav`);
}

const browserExecutable = findBrowser();
console.log('Bundling…');
const serveUrl = await bundle({entryPoint: path.join(ROOT, 'src/index.ts'), publicDir: path.join(ROOT, 'public')});
const inputProps = {film};

for (const fmt of formats) {
  const compId = `${id}-${fmt}`;
  const composition = await selectComposition({serveUrl, id: compId, inputProps, browserExecutable});
  let frameRange = null;
  if (a.frames) {
    const [s, e] = String(a.frames).split('-').map((x) => parseInt(x, 10));
    frameRange = [s, e ?? composition.durationInFrames - 1];
  }
  const tag = draft ? '-draft' : '';
  const silent = path.join(buildDir, `${compId}${tag}.video.mp4`);
  const final = path.join(outDir, `${compId}${tag}.mp4`);
  const t0 = Date.now();
  let last = -1;
  await renderMedia({
    serveUrl,
    composition,
    inputProps,
    codec: 'h264',
    outputLocation: silent,
    browserExecutable,
    scale: draft ? 0.5 : 1,
    crf: draft ? 26 : Number(a.crf ?? 16),
    pixelFormat: 'yuv420p',
    colorSpace: 'bt709',
    x264Preset: draft ? 'veryfast' : 'slow',
    muted: true,
    frameRange,
    concurrency: a.concurrency ? Number(a.concurrency) : Math.max(1, Math.min(8, os.cpus().length)),
    chromiumOptions: {gl: 'angle'},
    onProgress: ({progress, renderedFrames, encodedFrames}) => {
      const p = Math.floor(progress * 20);
      if (p !== last) {
        last = p;
        const el = (Date.now() - t0) / 1000;
        process.stdout.write(`\r${compId}${tag}: ${(progress * 100).toFixed(0)}%  frames ${renderedFrames}/${composition.durationInFrames} enc ${encodedFrames}  ${el.toFixed(0)}s   `);
      }
    },
  });
  console.log(`\nrendered ${compId}${tag} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
  if (wav && fs.existsSync(wav)) {
    const ss = frameRange ? frameRange[0] / composition.fps : 0;
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', silent, '-ss', String(ss), '-i', wav, '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '256k', '-ar', '48000', '-shortest', '-movflags', '+faststart', final]);
  } else {
    fs.copyFileSync(silent, final);
  }
  console.log('→', path.relative(ROOT, final));
}
