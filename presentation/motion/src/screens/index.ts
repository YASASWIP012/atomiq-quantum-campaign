// Product screens rebuilt in code, by name. Film JSON refers to them ("screen": "Name").
// Put each product's screens in its own folder (src/screens/<product>/) with an index.ts that
// exports SCREENS_<PRODUCT>, import it here and spread it into SCREENS.
import React from 'react';
import {KIT} from './kit';
import {SampleApp, SampleCard} from './SampleApp';
// @imports

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const SCREENS: Record<string, React.FC<any>> = {
  // built-in kit, usable by any film: KitText, KitExtrude, KitFlipClock, KitCounter, KitFillGrid, KitTypeField, KitChips, KitToggle
  ...KIT,
  // placeholders for the starter films — replace with the real product's screens
  SampleApp,
  SampleCard,
  // @screens
};
