import { describe, expect, it } from 'vitest';
import {
  LAYOUT,
  MATERIAL_ORDER,
  SCREEN,
  TILE_COLS,
  TILE_H,
  TILE_ROWS,
  TILE_W,
  VB_H,
  VB_W,
  drop,
  labelAnchor,
} from './machineLayout.js';
import type { Rect } from './machineLayout.js';

/**
 * The render and the SVG agree only because both are built from layout.json.
 * These are the invariants that would break silently after a re-render: a
 * window that walked off the picture, two that overlapped, or a menu that no
 * longer fits the display it is painted on.
 */

const inside = (r: Rect) =>
  r.x >= 0 && r.y >= 0 && r.x + r.width <= VB_W && r.y + r.height <= VB_H;

const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.width && b.x < a.x + a.width &&
  a.y < b.y + b.height && b.y < a.y + a.height;

describe('machine layout', () => {
  it('renders at a whole multiple of the viewBox', () => {
    expect(LAYOUT.render.width).toBe(Math.round(VB_W * LAYOUT.render.scale));
    expect(LAYOUT.render.height).toBe(Math.round(VB_H * LAYOUT.render.scale));
    // 2x the widest the card ever gets (560 CSS px), so it is never upscaled.
    expect(LAYOUT.render.width).toBeGreaterThanOrEqual(1120);
  });

  it('keeps every window inside the picture', () => {
    for (const key of MATERIAL_ORDER) {
      const w = LAYOUT.windows[key];
      expect(w.width, key).toBeGreaterThan(0);
      expect(w.height, key).toBeGreaterThan(0);
      expect(inside(w), key).toBe(true);
    }
    expect(inside(SCREEN)).toBe(true);
    expect(LAYOUT.iceGlyph.x).toBeGreaterThan(0);
    expect(LAYOUT.iceGlyph.y).toBeLessThan(VB_H);
  });

  it('never lets two windows or the screen share pixels', () => {
    const rects = [...MATERIAL_ORDER.map((k) => LAYOUT.windows[k]), SCREEN];
    for (let i = 0; i < rects.length; i += 1) {
      for (let j = i + 1; j < rects.length; j += 1) {
        expect(overlaps(rects[i], rects[j]), `${i} vs ${j}`).toBe(false);
      }
    }
  });

  it('fits the whole menu on the display', () => {
    for (const x of TILE_COLS) {
      expect(x).toBeGreaterThanOrEqual(SCREEN.x);
      expect(x + TILE_W).toBeLessThanOrEqual(SCREEN.x + SCREEN.width);
    }
    for (const y of TILE_ROWS) {
      expect(y).toBeGreaterThanOrEqual(SCREEN.y);
      expect(y + TILE_H).toBeLessThanOrEqual(SCREEN.y + SCREEN.height);
    }
    expect(TILE_COLS[0] + TILE_W).toBeLessThanOrEqual(TILE_COLS[1]);
    expect(TILE_ROWS[0] + TILE_H).toBeLessThanOrEqual(TILE_ROWS[1]);
  });

  it('slides the contents from full to empty and no further', () => {
    const w = LAYOUT.windows.coffeeBeans;
    expect(drop(100, w)).toBe(0);
    expect(drop(0, w)).toBe(w.height);
    expect(drop(50, w)).toBeCloseTo(w.height / 2);
    // Unknown draws the same empty vessel as a reported 0%; only the readout
    // tells them apart.
    expect(drop(null, w)).toBe(w.height);
    expect(drop(140, w)).toBe(0);
    expect(drop(-40, w)).toBe(w.height);
  });

  it('puts every readout on the glass it describes', () => {
    for (const key of MATERIAL_ORDER) {
      const w = LAYOUT.windows[key];
      const a = labelAnchor(w);
      expect(a.x).toBeGreaterThan(w.x);
      expect(a.x).toBeLessThan(w.x + w.width);
      expect(a.y).toBeGreaterThan(w.y);
      expect(a.y).toBeLessThan(w.y + w.height);
    }
  });
});
