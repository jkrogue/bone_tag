import type { RoundResult } from '../data/types';
import { tileForHops } from './scoring';

/**
 * Builds the shareable result text, e.g.:
 * ```
 * 🦴 Bone Tag #12 — 7,420 / 9,000
 * 🟩🟩🟨 | 🟩🟥
 * https://example.com
 * ```
 * The url line is only included when `url` is given.
 */
export function buildShareText(args: {
  dayNumber: number;
  results: RoundResult[];
  multipliers: (1 | 3)[];
  total: number;
  max: number;
  url?: string;
}): string {
  const { dayNumber, results, total, max, url } = args;

  const tiles = results.map((r) => tileForHops(r.hops));
  const easyTiles = tiles.slice(0, 3).join('');
  const hardTiles = tiles.slice(3, 5).join('');

  const lines = [
    `🦴 Bone Tag #${dayNumber} — ${total.toLocaleString('en-US')} / ${max.toLocaleString('en-US')}`,
    `${easyTiles} | ${hardTiles}`,
  ];
  if (url) lines.push(url);

  return lines.join('\n');
}

/**
 * Shares `text` via the Web Share API when available, else falls back to
 * copying to the clipboard. Never throws.
 */
export async function shareResult(text: string): Promise<'shared' | 'copied' | 'failed'> {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      await navigator.share({ text });
      return 'shared';
    }
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      return 'copied';
    }
    return 'failed';
  } catch {
    return 'failed';
  }
}
