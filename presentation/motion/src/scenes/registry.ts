import React from 'react';
import {Hook} from './Hook';
import {Statement} from './Statement';
import {Reveal} from './Reveal';
import {Feature} from './Feature';
import {Montage} from './Montage';
import {Stat} from './Stat';
import {Wall} from './Wall';
import {EndCard} from './EndCard';
import {Journey} from './Journey';
import {Outro} from './Outro';

// type name in a film JSON → component. Add custom scenes here AND in defaults.js.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const SCENES: Record<string, React.FC<any>> = {
  // short format (≈30 s, feature-per-4-seconds)
  Hook,
  Statement,
  Reveal,
  Feature,
  Montage,
  Stat,
  Wall,
  EndCard,
  // long format (60 s – 3 min, one continuous camera)
  Journey,
  Outro,
};
