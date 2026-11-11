import React, {useMemo} from 'react';
import {AbsoluteFill, Sequence, useCurrentFrame} from 'remotion';
import {buildTimeline} from './timeline.js';
import {FilmProvider, SceneProvider, SceneInfo, Brand, Meta} from './lib/scene';
import {TransitionFrame} from './components/Transition';
import {Grain} from './components/Stage';
import {SCENES} from './scenes/registry';

export type FilmSpec = {meta: Record<string, unknown>; brand: Brand; scenes: Array<Record<string, unknown>>; grain?: number};

/** Plays a film.json: each scene in its own Sequence (overlapping by the incoming transition). */
export const Film: React.FC<{film: FilmSpec; debug?: boolean}> = ({film, debug}) => {
  const tl = useMemo(() => buildTimeline(film), [film]);
  return (
    <FilmProvider brand={tl.brand as Brand} meta={tl.meta as unknown as Meta}>
      <AbsoluteFill style={{background: (tl.brand as Brand).bg, fontFamily: (tl.brand as Brand).fontText}}>
        {(tl.scenes as SceneInfo[]).map((s) => {
          const Comp = SCENES[s.type];
          if (!Comp) throw new Error(`No component registered for scene type ${s.type}`);
          const from = s.start - s.inLen;
          return (
            <Sequence key={s.id} from={from} durationInFrames={s.end - from} name={`${s.index + 1}. ${s.id}`}>
              <SceneProvider scene={s}>
                <TransitionFrame scene={s}>
                  <Comp {...s.props} />
                </TransitionFrame>
              </SceneProvider>
            </Sequence>
          );
        })}
        <Grain opacity={film.grain ?? 0.045} />
        {debug ? <DebugStamp scenes={tl.scenes as SceneInfo[]} fps={tl.meta.fps} fpb={tl.meta.framesPerBeat} /> : null}
      </AbsoluteFill>
    </FilmProvider>
  );
};

/** Frame/scene/beat stamp for review stills (stills.mjs passes debug: true). Never in final renders. */
const DebugStamp: React.FC<{scenes: SceneInfo[]; fps: number; fpb: number}> = ({scenes, fps, fpb}) => {
  const frame = useCurrentFrame();
  const s = [...scenes].reverse().find((x) => frame >= x.start) ?? scenes[0];
  const local = frame - s.start;
  return (
    <div style={{position: 'absolute', left: 16, top: 14, padding: '6px 10px', borderRadius: 8, background: 'rgba(0,0,0,0.72)', color: '#fff', fontFamily: 'Geist Mono', fontSize: 22, letterSpacing: '0.02em'}}>
      f{frame} · {(frame / fps).toFixed(2)}s · {s.id} +{(local / fpb).toFixed(2)}b
    </div>
  );
};
