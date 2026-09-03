import layoutJson from '../assets/machine/layout.json';
import type { MaterialKey } from '../../shared/domain.js';

/**
 * Where the render put its holes.
 *
 * `tools/blender/wmf1100s.py` models the machine in the SVG's own coordinate
 * system and writes this file out of the same constants it builds geometry
 * from, so the component never has to guess where the windows landed. Keeping
 * the arithmetic here rather than in the component is what lets a test assert
 * the pieces still fit each other after a re-render.
 */

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface MachineLayout {
  viewBox: { width: number; height: number };
  render: { width: number; height: number; scale: number };
  windows: Record<MaterialKey, Rect>;
  screen: Rect;
  iceGlyph: { x: number; y: number };
}

export const LAYOUT: MachineLayout = layoutJson;
export const VB_W = LAYOUT.viewBox.width;
export const VB_H = LAYOUT.viewBox.height;
export const SCREEN = LAYOUT.screen;

/** The clip is a little wider than the hole; the render's frame hides the slack. */
export const CLIP_BLEED = 3;

/** Ice first, then the three hoppers left to right — reading order in the picture. */
export const MATERIAL_ORDER: MaterialKey[] = [
  'ice',
  'coffeeBeans',
  'cocoaPowder',
  'milkPowder',
];

export const clampPct = (pct: number) => Math.max(0, Math.min(100, pct));

/**
 * How far the contents image slides down for a given level.
 *
 * `null` — nobody has reported this material — drops it all the way, i.e. draws
 * an empty vessel, the same as a confirmed 0%. The two are told apart by the
 * readout alone (「—」 versus 「0%」), which is the deliberate trade-off: an
 * empty hopper is the honest picture of "we don't know", and inventing a
 * half-full one to mean "unknown" would be a worse lie than under-promising.
 */
export function drop(pct: number | null, window: Rect) {
  return (window.height * (100 - clampPct(pct ?? 0))) / 100;
}

/** The readout sits on the smoked glass just inside the top of its window. */
export function labelAnchor(window: Rect) {
  return { x: window.x + window.width / 2, y: window.y + 36 };
}

/* The menu's geometry as fractions of the rendered screen, so a re-render that
   moves the display takes the menu with it instead of leaving it floating. */
const sx = (f: number) => SCREEN.x + SCREEN.width * f;
const sy = (f: number) => SCREEN.y + SCREEN.height * f;
export const screenX = sx;
export const screenY = sy;
export const TILE_W = SCREEN.width * 0.453;
export const TILE_H = SCREEN.height * 0.167;
export const TILE_COLS = [sx(0.027), sx(0.52)];
export const TILE_ROWS = [sy(0.123), sy(0.309), sy(0.494), sy(0.679)];
