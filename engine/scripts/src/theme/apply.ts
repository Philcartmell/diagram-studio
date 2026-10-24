/** Theme stage: resolve every colour token in a scene to a concrete hex value. */
import type { Paint, Scene, SceneElement } from '../scene/types.js';
import { TokenResolver } from './tokens.js';
import type { Theme } from './types.js';

function paint(p: Paint, r: TokenResolver): Paint {
  return { ...p, fill: r.resolve(p.fill), stroke: r.resolve(p.stroke) };
}

export function applyTheme(scene: Scene, theme: Theme): Scene {
  if (scene.resolved) return scene;
  const r = new TokenResolver(theme);
  const elements: SceneElement[] = scene.elements.map((e) => {
    switch (e.kind) {
      case 'shape':
        return { ...e, paint: paint(e.paint, r) };
      case 'text':
        return { ...e, color: r.resolve(e.color) };
      case 'connector':
        return { ...e, paint: paint(e.paint, r) };
      case 'line':
        return { ...e, paint: paint(e.paint, r) };
      case 'icon':
        return { ...e, color: r.resolve(e.color) };
      case 'grid':
        return { ...e, color: r.resolve(e.color) };
    }
  });
  return { ...scene, background: r.resolve(scene.background), elements, resolved: true };
}
