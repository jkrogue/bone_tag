import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RoundResult } from '../data/types';
import { buildShareText, shareResult } from './share';

function makeResult(hops: number): RoundResult {
  return {
    boneId: 'x',
    markerPoint: [0, 0, 0],
    hitMeshName: 'mesh',
    hops,
    path: [],
    points: 0,
    multiplier: 1,
  };
}

const FIVE_MULTIPLIERS: (1 | 3)[] = [1, 1, 1, 3, 3];

describe('buildShareText', () => {
  it('formats the exact fixture string with a url', () => {
    const results = [makeResult(0), makeResult(0), makeResult(1), makeResult(0), makeResult(6)];
    const text = buildShareText({
      dayNumber: 12,
      results,
      multipliers: FIVE_MULTIPLIERS,
      total: 7420,
      max: 9000,
      url: 'https://example.com',
    });
    expect(text).toBe('🦴 Bone Tag #12 — 7,420 / 9,000\n🟩🟩🟨 | 🟩🟥\nhttps://example.com');
  });

  it('omits the url line when no url is given', () => {
    const results = [makeResult(0), makeResult(0), makeResult(1), makeResult(0), makeResult(6)];
    const text = buildShareText({
      dayNumber: 12,
      results,
      multipliers: FIVE_MULTIPLIERS,
      total: 7420,
      max: 9000,
    });
    expect(text).toBe('🦴 Bone Tag #12 — 7,420 / 9,000\n🟩🟩🟨 | 🟩🟥');
  });

  it('maps hops to tiles: 0 -> green, 1-2 -> yellow, 3+ -> red', () => {
    const results = [makeResult(0), makeResult(1), makeResult(2), makeResult(3), makeResult(99)];
    const text = buildShareText({
      dayNumber: 1,
      results,
      multipliers: FIVE_MULTIPLIERS,
      total: 0,
      max: 9000,
    });
    expect(text.split('\n')[1]).toBe('🟩🟨🟨 | 🟥🟥');
  });

  it('formats large totals with thousands separators', () => {
    const results = [makeResult(0), makeResult(0), makeResult(0), makeResult(0), makeResult(0)];
    const text = buildShareText({
      dayNumber: 100,
      results,
      multipliers: FIVE_MULTIPLIERS,
      total: 12345,
      max: 9000,
    });
    expect(text.split('\n')[0]).toBe('🦴 Bone Tag #100 — 12,345 / 9,000');
  });
});

describe('shareResult', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('uses navigator.share when available', async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { share });
    const outcome = await shareResult('hello');
    expect(outcome).toBe('shared');
    expect(share).toHaveBeenCalledWith({ text: 'hello' });
  });

  it('falls back to clipboard.writeText when share is unavailable', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const outcome = await shareResult('hello');
    expect(outcome).toBe('copied');
    expect(writeText).toHaveBeenCalledWith('hello');
  });

  it('returns failed when neither share nor clipboard is available', async () => {
    vi.stubGlobal('navigator', {});
    const outcome = await shareResult('hello');
    expect(outcome).toBe('failed');
  });

  it('returns failed when navigator.share rejects', async () => {
    const share = vi.fn().mockRejectedValue(new Error('nope'));
    vi.stubGlobal('navigator', { share });
    const outcome = await shareResult('hello');
    expect(outcome).toBe('failed');
  });

  it('returns failed when clipboard.writeText rejects', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('nope'));
    vi.stubGlobal('navigator', { clipboard: { writeText } });
    const outcome = await shareResult('hello');
    expect(outcome).toBe('failed');
  });
});
