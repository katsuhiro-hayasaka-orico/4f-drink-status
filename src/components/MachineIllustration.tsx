import { useId } from 'react';
import type { MaterialKey } from '../../shared/domain.js';

/**
 * The drink machine, drawn to scale with the real thing in the 4F lounge.
 *
 * The three hoppers are the point: each one fills to the estimated remaining
 * level for its ingredient, so the picture answers 「まだある?」 before anyone
 * reads a single number. Coffee is drawn as a heap of individual beans;
 * cocoa and milk as powder.
 */

/** The visible interior of a hopper, in viewBox units. */
const TANK_TOP = 55;
const TANK_BOTTOM = 207;
const TANK_HEIGHT = TANK_BOTTOM - TANK_TOP; // 152
const UNITS_PER_PERCENT = TANK_HEIGHT / 100; // 1.52

const clamp = (pct: number) => Math.max(0, Math.min(100, pct));

/** Top edge (y) and height of a powder column at the given fill level. */
function column(pct: number) {
  const height = Math.round(UNITS_PER_PERCENT * clamp(pct));
  return { y: TANK_BOTTOM - height, height };
}

interface Bean {
  cx: number;
  cy: number;
  rotation: number;
}

/**
 * Beans stack in offset rows from the bottom up, one row per 10%, alternating
 * lean so the heap doesn't read as a grid.
 */
function beans(pct: number): Bean[] {
  const level = clamp(pct);
  if (level <= 0) return [];
  const top = TANK_BOTTOM - Math.round(UNITS_PER_PERCENT * level);
  const rows = Math.ceil(level / 10);
  const out: Bean[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < 6; c++) {
      const cy = 198 - r * 14;
      if (cy < top) continue;
      out.push({
        cx: 98 + c * 16 + (r % 2 ? 7 : 0),
        cy,
        rotation: (c + r) % 2 ? 24 : -22,
      });
    }
  }
  return out;
}

export interface MachineIllustrationProps {
  levels: Record<MaterialKey, number>;
}

export function MachineIllustration({ levels }: MachineIllustrationProps) {
  const uid = useId().replace(/:/g, '');
  const clip = (name: string) => `${uid}-${name}`;

  const coffeePct = clamp(levels.coffeeBeans);
  const coffeeTop = TANK_BOTTOM - Math.round(UNITS_PER_PERCENT * coffeePct);
  const cocoa = column(levels.cocoaPowder);
  const milk = column(levels.milkPowder);

  return (
    <svg
      viewBox="0 0 560 520"
      role="img"
      aria-label={`ドリンクマシンの推定残量。コーヒー豆 約${Math.round(coffeePct)}%、ココア 約${Math.round(clamp(levels.cocoaPowder))}%、ミルク 約${Math.round(clamp(levels.milkPowder))}%`}
      className="machine-card__svg"
    >
      <defs>
        <clipPath id={clip('coffee')}>
          <rect x={88} y={TANK_TOP} width={104} height={TANK_HEIGHT} rx={8} />
        </clipPath>
        <clipPath id={clip('cocoa')}>
          <rect x={228} y={TANK_TOP} width={104} height={TANK_HEIGHT} rx={8} />
        </clipPath>
        <clipPath id={clip('milk')}>
          <rect x={368} y={TANK_TOP} width={104} height={TANK_HEIGHT} rx={8} />
        </clipPath>
      </defs>

      {/* hopper shells */}
      <rect x={74} y={44} width={132} height={174} rx={12} fill="#fdf8ee" stroke="#d9c8ac" strokeWidth={3} />
      <rect x={214} y={44} width={132} height={174} rx={12} fill="#fdf8ee" stroke="#d9c8ac" strokeWidth={3} />
      <rect x={354} y={44} width={132} height={174} rx={12} fill="#fdf8ee" stroke="#d9c8ac" strokeWidth={3} />

      {/* hopper lids */}
      <rect x={69} y={32} width={142} height={20} rx={8} fill="#2b1f18" />
      <rect x={209} y={32} width={142} height={20} rx={8} fill="#2b1f18" />
      <rect x={349} y={32} width={142} height={20} rx={8} fill="#2b1f18" />

      {/* contents */}
      <g clipPath={`url(#${clip('coffee')})`}>
        {coffeePct > 0 && (
          <>
            <rect
              x={88}
              y={coffeeTop}
              width={104}
              height={TANK_BOTTOM - coffeeTop}
              fill="#4b2716"
              opacity={0.25}
            />
            {beans(coffeePct).map((b, i) => (
              <ellipse
                key={i}
                cx={b.cx}
                cy={b.cy}
                rx={10}
                ry={6}
                transform={`rotate(${b.rotation} ${b.cx} ${b.cy})`}
                fill="#6e371d"
                stroke="#3e1d0f"
                strokeWidth={2}
              />
            ))}
          </>
        )}
      </g>
      <g clipPath={`url(#${clip('cocoa')})`}>
        <rect
          x={228}
          y={cocoa.y}
          width={104}
          height={cocoa.height}
          fill="#854728"
          opacity={0.92}
          style={{ transition: 'y .35s ease, height .35s ease' }}
        />
      </g>
      <g clipPath={`url(#${clip('milk')})`}>
        <rect
          x={368}
          y={milk.y}
          width={104}
          height={milk.height}
          fill="#efe2c9"
          opacity={0.95}
          style={{ transition: 'y .35s ease, height .35s ease' }}
        />
      </g>

      {/* percentage labels, knocked out of whatever is behind them */}
      {(
        [
          [140, coffeePct],
          [280, clamp(levels.cocoaPowder)],
          [420, clamp(levels.milkPowder)],
        ] as const
      ).map(([x, pct]) => (
        <text
          key={x}
          x={x}
          y={86}
          textAnchor="middle"
          fontSize={19}
          fontWeight={800}
          fill="#33261c"
          stroke="#fdf8ee"
          strokeWidth={5}
          paintOrder="stroke"
          strokeLinejoin="round"
        >
          {Math.round(pct)}%
        </text>
      ))}

      {/* cabinet */}
      <rect x={55} y={200} width={450} height={276} rx={28} fill="#2b1f18" stroke="#1a100b" strokeWidth={5} />
      <rect x={89} y={232} width={382} height={150} rx={15} fill="#1d1510" stroke="#120b07" strokeWidth={4} />

      {/* selection buttons */}
      <rect x={107} y={250} width={104} height={101} rx={10} fill="#6c391f" />
      <rect x={228} y={250} width={104} height={101} rx={10} fill="#7a4425" />
      <rect x={349} y={250} width={104} height={101} rx={10} fill="#a66e34" />
      <rect x={148} y={266} width={22} height={16} rx={3} fill="#f5edde" />
      <rect x={269} y={266} width={22} height={16} rx={3} fill="#f5edde" />
      <rect x={390} y={266} width={22} height={16} rx={3} fill="#f5edde" />
      <text x={159} y={327} textAnchor="middle" fill="#f5edde" fontSize={20} fontWeight={700}>
        コーヒー
      </text>
      <text x={280} y={327} textAnchor="middle" fill="#f5edde" fontSize={20} fontWeight={700}>
        ココア
      </text>
      <text x={401} y={327} textAnchor="middle" fill="#f5edde" fontSize={20} fontWeight={700}>
        カフェオレ
      </text>

      {/* spout, drip tray, and the cup underneath */}
      <rect x={242} y={378} width={76} height={26} rx={8} fill="#8a6a50" />
      <rect x={257} y={399} width={46} height={28} rx={4} fill="#241811" />
      <rect x={92} y={427} width={376} height={26} rx={12} fill="#4a3a2c" />
      <ellipse cx={280} cy={437} rx={86} ry={12} fill="#241811" />
      <path
        d="M236 385h88v52c0 42-18 55-44 55s-44-13-44-55z"
        fill="#fffaf0"
        stroke="#d9c8ac"
        strokeWidth={3}
      />
      <path
        d="M324 402c28 0 38 14 34 31-4 17-18 23-35 18"
        fill="none"
        stroke="#fffaf0"
        strokeWidth={10}
        strokeLinecap="round"
      />
    </svg>
  );
}
