import type { TextEl } from '../scene/types.js';

/**
 * Split a shape's texts into blocks that read as one editable text: texts
 * stacked at the same x and anchor merge; bulleted items join the block
 * above them. Side-by-side texts (a band label and its items) stay separate.
 */
export function textBlocks(texts: TextEl[]): TextEl[][] {
  const blocks: TextEl[][] = [];
  for (const t of texts) {
    const cur = blocks[blocks.length - 1];
    const prev = cur?.[cur.length - 1];
    if (prev && (t.slot === 'item' || (Math.abs(prev.x - t.x) < 1 && prev.anchor === t.anchor))) cur.push(t);
    else blocks.push([t]);
  }
  return blocks;
}
