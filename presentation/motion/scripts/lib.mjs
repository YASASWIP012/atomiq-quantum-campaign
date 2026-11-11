// Shared helpers for the project scripts.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function args(argv = process.argv.slice(2)) {
  const out = {_: []};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      if (v !== undefined) out[k] = v;
      else if (argv[i + 1] && !argv[i + 1].startsWith('--')) out[k] = argv[++i];
      else out[k] = true;
    } else out._.push(a);
  }
  return out;
}

export function listFilms() {
  const dir = path.join(ROOT, 'src/films');
  return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));
}

export function loadFilm(id) {
  const films = listFilms();
  if (!id) {
    if (films.length === 1) id = films[0];
    else throw new Error(`Pass --film <id>. Films: ${films.join(', ')}`);
  }
  const p = path.join(ROOT, 'src/films', `${id}.json`);
  if (!fs.existsSync(p)) throw new Error(`No film "${id}". Films: ${films.join(', ')}`);
  return {id, film: JSON.parse(fs.readFileSync(p, 'utf8'))};
}

/** Find a Chrome Headless Shell / Chromium to render with; null lets Remotion download its own. */
export function findBrowser() {
  if (process.env.REMOTION_BROWSER_EXECUTABLE) return process.env.REMOTION_BROWSER_EXECUTABLE;
  const roots = ['/opt/pw-browsers', path.join(os.homedir(), '.cache/ms-playwright'), path.join(os.homedir(), 'Library/Caches/ms-playwright')];
  for (const r of roots) {
    if (!fs.existsSync(r)) continue;
    for (const d of fs.readdirSync(r).sort().reverse()) {
      if (!d.startsWith('chromium_headless_shell')) continue;
      for (const rel of ['chrome-linux/headless_shell', 'chrome-mac/headless_shell', 'chrome-headless-shell-mac-arm64/chrome-headless-shell', 'chrome-headless-shell-linux64/chrome-headless-shell']) {
        const p = path.join(r, d, rel);
        if (fs.existsSync(p)) return p;
      }
    }
  }
  return null;
}

export const FORMATS = {'16x9': [1920, 1080], '9x16': [1080, 1920], '1x1': [1080, 1080], '4x5': [1080, 1350]};

export function ensureDir(p) {
  fs.mkdirSync(p, {recursive: true});
  return p;
}
