import type { Altitude } from '../spec.js';

export interface AltitudeRules {
  maxNodes: number;
  /** Max characters in a node label. */
  labelMax: number;
  /** Max characters in a node description. */
  descriptionMax: number;
  /** Max wrapped description lines inside a node. */
  descriptionLines: number;
  /** Max accented elements before a warning. */
  accentMax: number;
}

export const ALTITUDES: Record<Altitude, AltitudeRules> = {
  executive: { maxNodes: 9, labelMax: 40, descriptionMax: 70, descriptionLines: 1, accentMax: 2 },
  management: { maxNodes: 20, labelMax: 60, descriptionMax: 160, descriptionLines: 3, accentMax: 4 },
  detailed: { maxNodes: 60, labelMax: 80, descriptionMax: 300, descriptionLines: 5, accentMax: 8 },
};

export const NEXT_ALTITUDE: Record<Altitude, Altitude | undefined> = {
  executive: 'management',
  management: 'detailed',
  detailed: undefined,
};
