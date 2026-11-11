import {useVideoConfig} from 'remotion';

/**
 * One story, laid out per aspect ratio. Never crop a wide film for vertical — branch layout here.
 * All sizes are authored in px for a 1080-short-side canvas (u = 1 at 1920x1080 and 1080x1920).
 */
export function useLayout() {
  const {width: w, height: h} = useVideoConfig();
  const u = Math.min(w, h) / 1080;
  const tall = h > w * 1.15;
  const square = !tall && Math.abs(w - h) < w * 0.15;
  const wide = !tall && !square;
  // Title-safe margins. 9:16 keeps text out of the bottom ~18% (platform UI) and top ~10%.
  const safe = tall
    ? {left: 84 * u, right: 84 * u, top: 200 * u, bottom: 360 * u}
    : square
      ? {left: 96 * u, right: 96 * u, top: 96 * u, bottom: 96 * u}
      : {left: 150 * u, right: 150 * u, top: 110 * u, bottom: 110 * u};
  return {w, h, u, tall, square, wide, cx: w / 2, cy: h / 2, safe, kind: tall ? 'tall' : square ? 'square' : 'wide'} as const;
}

/** Pick a value by format: pick({wide: 1, tall: 2, square: 1.5}) */
export function usePick() {
  const l = useLayout();
  return <T,>(v: {wide: T; tall?: T; square?: T}): T => (l.tall ? (v.tall ?? v.wide) : l.square ? (v.square ?? v.wide) : v.wide);
}
