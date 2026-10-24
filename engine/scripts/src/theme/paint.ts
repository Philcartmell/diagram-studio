/**
 * Semantic paint: maps meaning (emphasis, status, context) to colour tokens.
 * Layout modules call these instead of naming colours, so a theme swap
 * re-styles every diagram without touching geometry.
 */
import type { Dash, Paint } from '../scene/types.js';
import type { Emphasis, Status } from '../spec.js';
import type { Token } from './tokens.js';
import type { Theme } from './types.js';

export interface Look {
  paint: Paint;
  /** Primary text colour on this fill. */
  ink: Token;
  /** Secondary text colour on this fill. */
  inkMuted: Token;
  /** The fill token, for contrast-aware children. */
  fill: Token;
}

export type Surface = 'canvas' | 'band';

function textOn(pref: string, fill: Token): Token {
  return `text(${pref},${fill})`;
}

/** Look for a node box. `on` says what it sits on (bands are tinted). */
export function nodeLook(theme: Theme, emphasis: Emphasis = 'normal', status?: Status, on: Surface = 'canvas'): Look {
  const s = theme.shape;
  const solid = theme.style.accentFill === 'solid';
  const base: Token = on === 'band' ? 'background' : 'surface';
  let fill: Token = base;
  let stroke: Token = 'line';
  let strokeWidth = s.stroke;
  let ink: Token = 'ink';
  let inkMuted: Token = 'inkMuted';
  let dash: Dash = 'solid';

  if (emphasis === 'accent' || emphasis === 'highlight') {
    const c = emphasis === 'accent' ? 'accent' : 'highlight';
    if (solid) {
      fill = c;
      stroke = c;
      ink = c === 'accent' ? textOn('accentInk', fill) : textOn('ink', fill);
      inkMuted = ink;
    } else {
      fill = `${c}@${emphasis === 'accent' ? 14 : 14}:${base}`;
      stroke = c;
      strokeWidth = s.strokeStrong;
      ink = textOn('ink', fill);
      inkMuted = textOn('inkMuted', fill);
    }
  } else if (emphasis === 'muted') {
    fill = 'background';
    stroke = 'line';
    ink = textOn('inkMuted', fill);
    inkMuted = ink;
  }

  if (status === 'retired') {
    dash = 'dashed';
    if (emphasis === 'normal' || emphasis === 'muted') {
      fill = 'background';
      ink = textOn('inkMuted', fill);
      inkMuted = ink;
    }
  } else if (status === 'at-risk') {
    // Red border at normal weight; the labelled badge carries the message, so
    // an at-risk item does not outshout the accent.
    stroke = 'status.atRisk';
    strokeWidth = s.stroke + 0.25;
  }

  return {
    paint: { fill, stroke, strokeWidth, dash, shadow: theme.shape.shadow === 'soft' },
    ink: emphasis === 'normal' && status !== 'retired' ? textOn('ink', fill) : ink,
    inkMuted: emphasis === 'normal' && status !== 'retired' ? textOn('inkMuted', fill) : inkMuted,
    fill,
  };
}

/** Look for a band / layer / lane container. */
export function bandLook(theme: Theme, emphasis: Emphasis = 'normal', status?: Status): Look {
  const bandFill: Token = theme.style.bandFill === 'none' ? 'background' : theme.style.bandFill ?? 'surface';
  let fill: Token = bandFill;
  let stroke: Token = theme.style.bandFill === 'none' ? 'line' : 'none';
  let strokeWidth = theme.shape.stroke;
  let headInk: Token = textOn('ink', fill);
  if (emphasis === 'accent' || emphasis === 'highlight') {
    const c = emphasis === 'accent' ? 'accent' : 'highlight';
    fill = `${c}@8`;
    stroke = c;
    strokeWidth = theme.shape.strokeStrong;
    headInk = textOn(c, fill);
  } else if (emphasis === 'muted') {
    fill = 'background';
    stroke = 'line';
    headInk = textOn('inkMuted', fill);
  }
  let dash: Dash = 'solid';
  if (status === 'retired') dash = 'dashed';
  if (status === 'at-risk') {
    stroke = 'status.atRisk';
    strokeWidth = theme.shape.strokeStrong;
  }
  return { paint: { fill, stroke, strokeWidth, dash }, ink: headInk, inkMuted: textOn('inkMuted', fill), fill };
}

/** A quiet panel: callouts, detail panels, legend swatch frames. */
export function panelLook(theme: Theme, tone: 'plain' | 'accent' = 'plain'): Look {
  if (tone === 'accent') {
    const fill = 'accent@8';
    return {
      paint: { fill, stroke: 'accent', strokeWidth: theme.shape.stroke, dash: 'solid' },
      ink: textOn('ink', fill),
      inkMuted: textOn('accent', fill),
      fill,
    };
  }
  const fill = 'surface';
  return {
    paint: { fill, stroke: 'none', strokeWidth: 0, dash: 'solid' },
    ink: textOn('ink', fill),
    inkMuted: textOn('inkMuted', fill),
    fill,
  };
}

export function statusToken(status: Status): Token {
  return status === 'at-risk' ? 'status.atRisk' : `status.${status}`;
}

export const STATUS_LABEL: Record<Status, string> = {
  current: 'Current',
  new: 'New',
  changed: 'Changed',
  retired: 'Retired',
  'at-risk': 'At risk',
};

export function badgeLook(theme: Theme, status: Status, on: Token): Look {
  const t = statusToken(status);
  const fill = `${t}@22:${on.startsWith('text(') ? 'background' : on}`;
  return {
    paint: { fill, stroke: t, strokeWidth: theme.shape.stroke, dash: 'solid' },
    ink: textOn('ink', fill),
    inkMuted: textOn('inkMuted', fill),
    fill,
  };
}

export function connectorPaint(
  theme: Theme,
  kind: 'flow' | 'handoff' | 'feedback' = 'flow',
  style: Dash = 'solid',
  emphasis: Emphasis = 'normal',
): Paint {
  const stroke: Token = emphasis === 'accent' ? 'accent' : 'lineStrong';
  return {
    fill: 'none',
    stroke,
    strokeWidth: kind === 'handoff' ? theme.shape.strokeStrong : theme.shape.stroke + 0.25,
    dash: style,
  };
}

export function rulePaint(theme: Theme, strong = false, dash: Dash = 'solid'): Paint {
  return {
    fill: 'none',
    stroke: strong ? 'lineStrong' : 'line',
    strokeWidth: strong ? theme.shape.strokeStrong : theme.shape.stroke,
    dash,
  };
}

/** Categorical colour for the n-th distinct tag. */
export function tagToken(index: number): Token {
  return `cat.${index}`;
}
