export interface ThemeColors {
  background: string;
  surface: string;
  surfaceAlt: string;
  ink: string;
  inkMuted: string;
  line: string;
  lineStrong: string;
  accent: string;
  accentInk: string;
  highlight: string;
  categorical: string[];
  status: { new: string; changed: string; retired: string; atRisk: string };
  /** Notation colours (azure- and databricks-architecture); each falls back to a core colour. */
  notation?: {
    step?: string;
    stepInk?: string;
    /** The second flow type's colour (the first is step). */
    flow2?: string;
    network?: string;
    zone?: string;
    /** Databricks account boundary. */
    account?: string;
    /** Customer cloud account boundary. */
    cloud?: string;
    /** Control, serverless and classic compute plane outlines; workspace outlines. */
    plane?: string;
    /** Fill of the Databricks platform block. */
    platform?: string;
    /** Unity Catalog boundary. */
    governance?: string;
    /** When set, stages draw a header bar in this colour instead of a grey panel. */
    stageHead?: string;
    bronze?: string;
    silver?: string;
    gold?: string;
  };
}

export type FontFileKey = 'regular' | 'medium' | 'semibold' | 'bold';

export interface ThemeFont {
  family: string;
  /** Font named in editable exports when a metric-compatible system font is likelier to be installed. */
  officeFamily?: string;
  files: Partial<Record<FontFileKey, string>>;
  size: { title: number; subtitle: number; group: number; label: number; body: number; caption: number };
  weight: { title: number; label: number; body: number };
  titleCase: 'sentence' | 'title' | 'upper' | 'none';
  lineHeight?: number;
}

export interface Theme {
  id: string;
  name: string;
  description?: string;
  extends?: string | null;
  color: ThemeColors;
  font: ThemeFont;
  shape: { radius: number; stroke: number; strokeStrong: number; shadow: 'none' | 'soft'; chevronDepth: number };
  space: { unit: number; gap: number; padding: number; margin: number };
  connector: { style: 'orthogonal'; arrow: 'triangle' | 'open' | 'none'; cornerRadius: number };
  style: {
    renderer: 'clean' | 'sketch';
    showIcons: boolean;
    accentFill: 'solid' | 'tint';
    grid?: boolean;
    headerRule?: boolean;
    roughness?: number;
    bandFill?: 'surface' | 'surfaceAlt' | 'none';
  };
}

export const FONT_KEY_WEIGHT: Record<FontFileKey, number> = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
};
