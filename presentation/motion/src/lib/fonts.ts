// Fonts ship inside the project (public/fonts, all SIL OFL) so renders are offline and identical
// on every machine. loadFont() blocks rendering until each face is ready — no fallback-font frames.
// To add a brand font: drop the .woff2 in public/fonts and add a line here.
import {loadFont} from '@remotion/fonts';
import {staticFile} from 'remotion';

const FACES: Array<{family: string; file: string; weight?: string; style?: 'normal' | 'italic'}> = [
  {family: 'Inter', file: 'fonts/inter.woff2', weight: '100 900'}, // optical sizing: big sizes get Inter Display cuts
  {family: 'Geist', file: 'fonts/geist.woff2', weight: '100 900'},
  {family: 'Geist Mono', file: 'fonts/geist-mono.woff2', weight: '100 900'},
  {family: 'Instrument Serif', file: 'fonts/instrument-serif.woff2', weight: '400'},
  {family: 'Instrument Serif', file: 'fonts/instrument-serif-italic.woff2', weight: '400', style: 'italic'},
];

let started = false;
export function loadFonts() {
  if (started) return;
  started = true;
  for (const f of FACES) {
    loadFont({family: f.family, url: staticFile(f.file), weight: f.weight, style: f.style ?? 'normal'}).catch((e) => {
      console.error('Font failed to load', f.file, e);
    });
  }
}
