import { useId } from 'react';
import type { MaterialKey } from '../../shared/domain.js';

/**
 * The drink machine, drawn to scale with the real thing in the 4F lounge,
 * with the ice maker standing to its left as it does in the room.
 *
 * The hoppers are the point: each one fills to the estimated remaining level
 * for its ingredient, so the picture answers 「まだある?」 before anyone reads
 * a single number. Coffee is a heap of individual beans, cocoa and milk are
 * powder, and ice is a pile of cubes.
 *
 * The ice maker is a separate unit rather than a fourth hopper because that's
 * what it is, and because squeezing a fourth tank into the machine would mean
 * redrawing the three that are already right.
 */

/** The visible interior of a hopper, in viewBox units. */
const TANK_TOP = 55;
const TANK_BOTTOM = 207;
const TANK_HEIGHT = TANK_BOTTOM - TANK_TOP; // 152
const UNITS_PER_PERCENT = TANK_HEIGHT / 100; // 1.52

/**
 * The drink machine keeps the coordinates it was originally designed with and
 * is shifted right as a whole, so putting the ice maker on the left cost
 * nothing in the three hoppers or the bean geometry.
 */
const MACHINE_SHIFT = 175;

/** The ice maker's window is wider than a hopper but the same height. */
const ICE_LEFT = 69;
const ICE_WIDTH = 122;
/** Centre of the leftmost column of cubes. */
const ICE_CUBE_LEFT = 81;

const clamp = (pct: number) => Math.max(0, Math.min(100, pct));

/** Top edge (y) and height of a powder column at the given fill level. */
function column(pct: number) {
  const height = Math.round(UNITS_PER_PERCENT * clamp(pct));
  return { y: TANK_BOTTOM - height, height };
}

/** Top edge of a pile at the given fill level, shared by beans and cubes. */
function pileTop(pct: number): number {
  return TANK_BOTTOM - Math.round(UNITS_PER_PERCENT * clamp(pct));
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
  const top = pileTop(level);
  const rows = Math.ceil(level / 10);
  const out: Bean[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < 6; c++) {
      const cy = 198 - r * 14;
      if (cy < top) continue;
      out.push({ cx: 98 + c * 16 + (r % 2 ? 7 : 0), cy, rotation: (c + r) % 2 ? 24 : -22 });
    }
  }
  return out;
}

interface Cube {
  x: number;
  y: number;
  rotation: number;
}

/**
 * Cubes stack the same way beans do, but drawn square so the two piles never
 * read as the same substance.
 */
function cubes(pct: number): Cube[] {
  const level = clamp(pct);
  if (level <= 0) return [];
  const top = pileTop(level);
  const rows = Math.ceil(level / 10);
  const out: Cube[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < 6; c++) {
      const y = 198 - r * 15;
      if (y < top) continue;
      out.push({
        x: ICE_CUBE_LEFT + c * 18 + (r % 2 ? 9 : 0),
        y,
        rotation: (c + r) % 2 ? 18 : -15,
      });
    }
  }
  return out;
}

/** The percentage label, knocked out of whatever is behind it. */
function LevelLabel({ x, pct }: { x: number; pct: number }) {
  return (
    <text
      x={x}
      y={86}
      textAnchor="middle"
      fontSize={19}
      fontWeight={800}
      className="fig-label"
      strokeWidth={5}
      paintOrder="stroke"
      strokeLinejoin="round"
    >
      {Math.round(pct)}%
    </text>
  );
}

interface UnitProps {
  levels: Record<MaterialKey, number>;
  clip: (name: string) => string;
}

function DrinkMachineUnit({ levels, clip }: UnitProps) {
  const coffeePct = clamp(levels.coffeeBeans);
  const coffeeTop = pileTop(coffeePct);
  const cocoa = column(levels.cocoaPowder);
  const milk = column(levels.milkPowder);

  return (
    <g transform={`translate(${MACHINE_SHIFT} 0)`}>
      {/* hopper shells */}
      <rect x={74} y={44} width={132} height={174} rx={12} className="fig-vessel" strokeWidth={3} />
      <rect x={214} y={44} width={132} height={174} rx={12} className="fig-vessel" strokeWidth={3} />
      <rect x={354} y={44} width={132} height={174} rx={12} className="fig-vessel" strokeWidth={3} />

      {/* hopper lids */}
      <rect x={69} y={32} width={142} height={20} rx={8} className="fig-lid" />
      <rect x={209} y={32} width={142} height={20} rx={8} className="fig-lid" />
      <rect x={349} y={32} width={142} height={20} rx={8} className="fig-lid" />

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

      <LevelLabel x={140} pct={coffeePct} />
      <LevelLabel x={280} pct={clamp(levels.cocoaPowder)} />
      <LevelLabel x={420} pct={clamp(levels.milkPowder)} />

      {/* cabinet */}
      <rect x={55} y={200} width={450} height={276} rx={28} className="fig-body" strokeWidth={5} />
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
        カフェラテ
      </text>

      {/* spout, drip tray, and the cup underneath */}
      <rect x={242} y={378} width={76} height={26} rx={8} fill="#8a6a50" />
      <rect x={257} y={399} width={46} height={28} rx={4} fill="#241811" />
      <rect x={92} y={427} width={376} height={26} rx={12} fill="#4a3a2c" />
      <ellipse cx={280} cy={437} rx={86} ry={12} fill="#241811" />
      <path
        d="M236 385h88v52c0 42-18 55-44 55s-44-13-44-55z"
        className="fig-cup"
        strokeWidth={3}
      />
      <path
        d="M324 402c28 0 38 14 34 31-4 17-18 23-35 18"
        className="fig-cup-line"
        strokeWidth={10}
        strokeLinecap="round"
      />
    </g>
  );
}

function IceMakerUnit({ levels, clip }: UnitProps) {
  const icePct = clamp(levels.ice);
  const iceTop = pileTop(icePct);

  return (
    <g>
      {/* hopper shell and lid, matching the machine's height exactly */}
      <rect x={55} y={44} width={150} height={174} rx={12} className="fig-vessel" strokeWidth={3} />
      <rect x={50} y={32} width={160} height={20} rx={8} className="fig-lid" />

      <g clipPath={`url(#${clip('ice')})`}>
        {icePct > 0 && (
          <>
            <rect
              x={ICE_LEFT}
              y={iceTop}
              width={ICE_WIDTH}
              height={TANK_BOTTOM - iceTop}
              fill="#7ba3b8"
              opacity={0.22}
            />
            {cubes(icePct).map((c, i) => (
              <rect
                key={i}
                x={c.x - 8}
                y={c.y - 8}
                width={16}
                height={16}
                rx={4}
                transform={`rotate(${c.rotation} ${c.x} ${c.y})`}
                fill="#dce9f0"
                stroke="#a3c2d3"
                strokeWidth={2}
              />
            ))}
          </>
        )}
      </g>
      <LevelLabel x={130} pct={icePct} />

      {/* cabinet, scoop chute, and dispense tray */}
      <rect x={55} y={200} width={150} height={276} rx={28} className="fig-body" strokeWidth={5} />
      <rect x={77} y={232} width={106} height={110} rx={12} fill="#1d1510" stroke="#120b07" strokeWidth={4} />
      <rect x={103} y={258} width={54} height={40} rx={6} fill="#4a6b7c" />
      <rect x={115} y={268} width={30} height={20} rx={3} fill="#dce9f0" opacity={0.85} />
      <text x={130} y={378} textAnchor="middle" fill="#f5edde" fontSize={20} fontWeight={700}>
        氷
      </text>
      <rect x={81} y={400} width={98} height={26} rx={8} fill="#8a6a50" />
      <rect x={73} y={432} width={114} height={22} rx={10} fill="#4a3a2c" />
    </g>
  );
}

export interface MachineIllustrationProps {
  levels: Record<MaterialKey, number>;
}

export function MachineIllustration({ levels }: MachineIllustrationProps) {
  const uid = useId().replace(/:/g, '');
  const clip = (name: string) => `${uid}-${name}`;
  const pct = (k: MaterialKey) => Math.round(clamp(levels[k]));

  return (
    <svg
      viewBox="0 0 735 520"
      role="img"
      aria-label={`製氷機とドリンクマシンの推定残量。氷 約${pct('ice')}%、コーヒー豆 約${pct('coffeeBeans')}%、ココア 約${pct('cocoaPowder')}%、ミルク 約${pct('milkPowder')}%`}
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
        <clipPath id={clip('ice')}>
          <rect x={ICE_LEFT} y={TANK_TOP} width={ICE_WIDTH} height={TANK_HEIGHT} rx={8} />
        </clipPath>
      </defs>

      <IceMakerUnit levels={levels} clip={clip} />
      <DrinkMachineUnit levels={levels} clip={clip} />
    </svg>
  );
}
