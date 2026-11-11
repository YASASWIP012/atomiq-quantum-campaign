// Contract for product screens rebuilt in code. A screen draws at its device's logical size
// (phone 393×852, laptop/browser 1440×900) and animates its own UI from the scene clock:
// trigger (tap / type / drop) → reaction in 2–3 visible steps → payoff readable in one frame.
// Use fake-but-believable data. Never show a feature the product doesn't have today.
export type ScreenProps = {
  f: number; // scene frame (0 = the cut)
  ev: (name: string, fallbackBeat?: number) => number; // named event frames from defaults.js / film.json
  b: (beat: number) => number; // frame of a beat from the cut
  fps: number;
  dark: boolean;
  index?: number; // for wall cards
  [k: string]: unknown;
};
