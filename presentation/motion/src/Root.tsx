import React from 'react';
import {Composition, Folder} from 'remotion';
import {Film, FilmSpec} from './Film';
import {buildTimeline} from './timeline.js';
import {loadFonts} from './lib/fonts';
import {FILMS} from './films';
import {Atomiq, TOTAL} from './Atomiq';

loadFonts();

export const FORMATS = [
  {id: '16x9', width: 1920, height: 1080},
  {id: '9x16', width: 1080, height: 1920},
  {id: '1x1', width: 1080, height: 1080},
  {id: '4x5', width: 1080, height: 1350},
];

export const Root: React.FC = () => (
  <>
    <Composition id="atomiq" component={Atomiq} durationInFrames={TOTAL} fps={30} width={1920} height={1080} />
    {Object.entries(FILMS).map(([filmId, json]) => {
      const spec = json as FilmSpec;
      const tl = buildTimeline(spec);
      return (
        <Folder key={filmId} name={filmId}>
          {FORMATS.map((fmt) => (
            <Composition
              key={fmt.id}
              id={`${filmId}-${fmt.id}`}
              component={Film}
              defaultProps={{film: spec}}
              durationInFrames={tl.meta.durationInFrames}
              fps={tl.meta.fps}
              width={fmt.width}
              height={fmt.height}
            />
          ))}
        </Folder>
      );
    })}
  </>
);
