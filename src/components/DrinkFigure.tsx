import { useId } from 'react';
import type { DrinkBase } from '../../shared/drinks.js';
import type { StatusKey } from '../../shared/domain.js';

/**
 * The drink itself, drawn in the availability card.
 *
 * The cup is not decoration: how full it is tracks the drink's status, so the
 * row can be read from the pictures alone — full when it's available, half
 * when something is running low, empty when it can't be made. Hot drinks get a
 * mug and steam, iced ones a tall glass with cubes and a straw, using the same
 * cube shape as the ice maker.
 */

/* Four drinks now share this panel, so the colours have to read as a ladder:
   coffee darkest, then mocha, then cocoa, with latte lightest. */
const LIQUID: Record<DrinkBase, string> = {
  coffee: '#40200f',
  mocha: '#663420',
  cocoa: '#99653f',
  latte: '#b58a5e',
};

/** A lighter tint of the same liquid, used for the surface ellipse. */
const SURFACE: Record<DrinkBase, string> = {
  coffee: '#63341e',
  mocha: '#8a4e33',
  cocoa: '#b47e53',
  latte: '#cfa87e',
};

/** Full, half, or empty — the picture carries the same fact as the words. */
const FILL: Record<StatusKey, number> = {
  available: 1,
  low: 0.45,
  unavailable: 0,
};

const VESSEL = 'var(--vessel)';
const RIM = 'var(--vessel-rim)';

/** Top edge of a floating cube: `rise` above the surface, but never above the rim. */
function cubeTop(surfaceY: number, rise: number): number {
  return Math.max(21, surfaceY - rise);
}

export interface DrinkFigureProps {
  base: DrinkBase;
  iced: boolean;
  status: StatusKey;
}

export function DrinkFigure({ base, iced, status }: DrinkFigureProps) {
  const uid = useId().replace(/:/g, '');
  const clipId = `${uid}-cup`;
  const level = FILL[status];
  const empty = level <= 0;

  // Interior of the vessel, in viewBox units — the liquid fills up from here.
  const top = iced ? 20 : 25;
  const bottom = iced ? 62 : 61;
  const surfaceY = bottom - (bottom - top) * level;

  return (
    <svg
      viewBox="0 0 60 74"
      width={54}
      height={66}
      aria-hidden="true"
      className={`drink-figure${empty ? ' drink-figure--empty' : ''}`}
    >
      <defs>
        <clipPath id={clipId}>
          {iced ? (
            <path d="M17 19h26l-2.4 39a5 5 0 0 1-5 4.7H24.4a5 5 0 0 1-5-4.7z" />
          ) : (
            <path d="M11 24h30v25a12 12 0 0 1-12 12h-6a12 12 0 0 1-12-12z" />
          )}
        </clipPath>
      </defs>

      {/* steam, only while there is something hot in the cup */}
      {!iced && !empty && (
        <g fill="none" stroke={SURFACE[base]} strokeWidth={2.2} strokeLinecap="round" opacity={0.55}>
          <path d="M21 16c0-3.5 3.5-3.5 3.5-7" />
          <path d="M30 13.5c0-3.5 3.5-3.5 3.5-7" />
        </g>
      )}

      {iced ? (
        <>
          {/* straw, behind the glass so the liquid covers its lower half */}
          <path
            d="M40 10 33 44"
            stroke={SURFACE[base]}
            strokeWidth={4}
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M17 19h26l-2.4 39a5 5 0 0 1-5 4.7H24.4a5 5 0 0 1-5-4.7z"
            style={{ fill: VESSEL, stroke: RIM }}
            strokeWidth={2.4}
            strokeLinejoin="round"
          />
          <g clipPath={`url(#${clipId})`}>
            {!empty && (
              <>
                <rect x={16} y={surfaceY} width={28} height={bottom - surfaceY + 2} fill={LIQUID[base]} />
                <ellipse cx={30} cy={surfaceY} rx={13} ry={2.6} fill={SURFACE[base]} />
                {/* Cubes straddle the surface, since ice floats. Clamped so a
                    full glass doesn't push them up through the rim. */}
                <rect
                  x={21}
                  y={cubeTop(surfaceY, 5)}
                  width={9}
                  height={9}
                  rx={2.4}
                  transform={`rotate(-14 25.5 ${cubeTop(surfaceY, 5) + 4.5})`}
                  fill="#dce9f0"
                  stroke="#a3c2d3"
                  strokeWidth={1.4}
                />
                <rect
                  x={30}
                  y={cubeTop(surfaceY, 1)}
                  width={8}
                  height={8}
                  rx={2.2}
                  transform={`rotate(16 34 ${cubeTop(surfaceY, 1) + 4})`}
                  fill="#dce9f0"
                  stroke="#a3c2d3"
                  strokeWidth={1.4}
                />
              </>
            )}
          </g>
          <path d="M17 19h26" style={{ stroke: RIM }} strokeWidth={2.4} strokeLinecap="round" />
        </>
      ) : (
        <>
          {/* handle */}
          <path
            d="M41 30c9 0 12 4.5 11 10.5-1 5.5-6 7.5-11.5 6.5"
            fill="none"
            style={{ stroke: VESSEL }}
            strokeWidth={6}
            strokeLinecap="round"
          />
          <path
            d="M41 30c9 0 12 4.5 11 10.5-1 5.5-6 7.5-11.5 6.5"
            fill="none"
            style={{ stroke: RIM }}
            strokeWidth={2.4}
            strokeLinecap="round"
          />
          <path
            d="M11 24h30v25a12 12 0 0 1-12 12h-6a12 12 0 0 1-12-12z"
            style={{ fill: VESSEL, stroke: RIM }}
            strokeWidth={2.4}
            strokeLinejoin="round"
          />
          <g clipPath={`url(#${clipId})`}>
            {!empty && (
              <>
                <rect x={10} y={surfaceY} width={32} height={bottom - surfaceY + 2} fill={LIQUID[base]} />
                <ellipse cx={26} cy={surfaceY} rx={15} ry={3} fill={SURFACE[base]} />
              </>
            )}
          </g>
          <path d="M11 24h30" style={{ stroke: RIM }} strokeWidth={2.4} strokeLinecap="round" />
          {/* saucer */}
          <rect x={8} y={64} width={36} height={4.5} rx={2.25} style={{ fill: RIM }} />
        </>
      )}
    </svg>
  );
}
