import { useId } from 'react';
import { DRINK_LABELS, type DrinkKey, type MaterialKey } from '../../shared/domain.js';
import { RECIPE_BY_KEY } from '../../shared/drinks.js';
import bodyLight from '../assets/machine/wmf1100s-light.webp';
import bodyDark from '../assets/machine/wmf1100s-dark.webp';
import contentsUrl from '../assets/machine/wmf1100s-contents.webp';
import {
  CLIP_BLEED,
  LAYOUT,
  MATERIAL_ORDER,
  SCREEN,
  TILE_COLS,
  TILE_H,
  TILE_ROWS,
  TILE_W,
  VB_H,
  VB_W,
  clampPct,
  drop,
  labelAnchor,
  screenX as sx,
  screenY as sy,
} from '../lib/machineLayout.js';
import type { Rect } from '../lib/machineLayout.js';

/**
 * The lounge's drink machine — a WMF 1100 S — with the ice maker standing to
 * its left as it does in the room.
 *
 * The machine itself is a render, built and photographed by
 * `tools/blender/wmf1100s.py`; everything that reports something is still SVG
 * drawn on top of it. The render is a *frame*: the three hopper windows and the
 * ice bin are punched clean through it, so this component paints a dark
 * interior, slides the contents image up behind the hole to the reported level,
 * and lets the render's own glass edge close over it. Nothing can spill past
 * the glass, because the glass is in front.
 *
 * Two deliberate departures from the real thing, both inherited from the
 * drawing this replaced:
 *
 * 1. The hoppers are exaggerated. On the real machine they sit inside the
 *    cabinet and show nothing; here they are lifted onto the top deck as
 *    windows you can see through, because the whole point of the picture is to
 *    answer 「まだある?」 before anyone reads a number.
 * 2. No WMF wordmark — the shape and colours are the machine, the logo is
 *    theirs.
 *
 * The touch panel stays SVG for a different reason: its names come from
 * DRINK_LABELS, so it can never drift from the availability cards beside it.
 * Baked into the render, it would.
 */


const clamp = clampPct;

/**
 * The level slides rather than the clip growing: `x`/`y`/`width`/`height` on a
 * clipPath child only animate on Chromium, while a CSS transform on the clipped
 * image animates everywhere. It also looks better — the heap's surface travels
 * instead of a straight edge wiping across it.
 */
const SLIDE = { transition: 'transform .35s ease' } as const;

/** The level readout, sitting on the smoked glass near the top of its window. */
function LevelLabel({ window, pct }: { window: Rect; pct: number | null }) {
  return (
    <text
      x={labelAnchor(window).x}
      y={labelAnchor(window).y}
      textAnchor="middle"
      fontSize={19}
      fontWeight={800}
      className="wmf-label"
      strokeWidth={5}
      paintOrder="stroke"
      strokeLinejoin="round"
    >
      {pct === null ? '—' : `${Math.round(clamp(pct))}%`}
    </text>
  );
}

/**
 * The touch panel, tile by tile: each hot drink beside its iced twin, which is
 * how the grid reads left-to-right. Names come from DRINK_LABELS so the panel
 * can never drift from the availability cards sitting next to it — only the
 * drink's colour lives here, because that is picture, not data.
 *
 * At the size this renders the labels are closer to texture than to type, and
 * that is the intent: the real machine's screen is a dense grid of small names
 * too. Nobody reads the menu off this drawing — the aria-label carries the
 * levels, and 「ドリンクの作成可否」 carries the menu.
 */
const TILE_COLOURS: Record<DrinkKey, { cup: string; foam?: string }> = {
  hotCoffee: { cup: '#6b4226' },
  caffeLatte: { cup: '#b07d4e', foam: '#ecdfc6' },
  caffeMocha: { cup: '#7a4326', foam: '#e0cdb0' },
  hotCocoa: { cup: '#8a5330' },
  iceCoffee: { cup: '#5e3a22' },
  iceCaffeLatte: { cup: '#bd8f5f' },
  iceCaffeMocha: { cup: '#85502f' },
  iceCocoa: { cup: '#96603a' },
};

/** Row-major: hot in the left column, its iced twin to the right. */
const PANEL_ORDER: DrinkKey[] = [
  'hotCoffee',
  'iceCoffee',
  'caffeLatte',
  'iceCaffeLatte',
  'caffeMocha',
  'iceCaffeMocha',
  'hotCocoa',
  'iceCocoa',
];

function DrinkTile({ drink, index }: { drink: DrinkKey; index: number }) {
  const { cup, foam } = TILE_COLOURS[drink];
  const iced = RECIPE_BY_KEY[drink].iced;
  const label = DRINK_LABELS[drink];
  const x = TILE_COLS[index % 2];
  const y = TILE_ROWS[Math.floor(index / 2)];
  const cx = x + TILE_W / 2;

  return (
    <>
      <rect x={x} y={y} width={TILE_W} height={TILE_H} rx={4} fill="#1a2331" />
      {iced ? (
        <>
          {/* A tall glass, with a couple of cubes so ICE reads at this size. */}
          <path d={`M${cx - 5} ${y + 4}h10v10c0 2-1 2.8-5 2.8s-5-.8-5-2.8z`} fill={cup} />
          <rect x={cx - 3.5} y={y + 5.5} width={3} height={3} rx={0.8} fill="#dbe9f4" opacity={0.8} />
          <rect x={cx + 0.5} y={y + 9} width={3} height={3} rx={0.8} fill="#dbe9f4" opacity={0.6} />
        </>
      ) : (
        <>
          <path d={`M${cx - 6} ${y + 4}h12v8c0 3.6-2 5.4-6 5.4s-6-1.8-6-5.4z`} fill={cup} />
          {foam && <rect x={cx - 6} y={y + 4} width={12} height={3.4} rx={1.2} fill={foam} />}
        </>
      )}
      <text x={cx} y={y + 24} textAnchor="middle" fontSize={6.5} fontWeight={700} fill="#dbe5f4">
        {label}
      </text>
    </>
  );
}

export interface MachineIllustrationProps {
  levels: Record<MaterialKey, number | null>;
}

export function MachineIllustration({ levels }: MachineIllustrationProps) {
  const uid = useId().replace(/:/g, '');
  const id = (name: string) => `${uid}-${name}`;
  const url = (name: string) => `url(#${id(name)})`;

  const pct = (k: MaterialKey) => {
    const v = levels[k];
    return v === null ? '情報なし' : `約${Math.round(clamp(v))}%`;
  };

  return (
    <svg
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      role="img"
      aria-label={`製氷機とドリンクマシンの推定残量。氷 ${pct('ice')}、コーヒー豆 ${pct('coffeeBeans')}、ココア ${pct('cocoaPowder')}、ミルク ${pct('milkPowder')}`}
      className="machine-card__svg"
    >
      <defs>
        {MATERIAL_ORDER.map((key) => {
          const w = LAYOUT.windows[key];
          return (
            <clipPath key={key} id={id(`clip-${key}`)}>
              <rect
                x={w.x - CLIP_BLEED}
                y={w.y - CLIP_BLEED}
                width={w.width + CLIP_BLEED * 2}
                height={w.height + CLIP_BLEED * 2}
              />
            </clipPath>
          );
        })}
      </defs>

      {/* One contact shadow per unit rather than one wide pool: the two stand
          on the floor separately, and a single ellipse joined them into a
          plinth neither of them has. */}
      <ellipse cx={120} cy={528} rx={104} ry={10} className="wmf-floor" />
      <ellipse cx={510} cy={530} rx={278} ry={11} className="wmf-floor" />

      {/* Behind the render: an unlit interior, the contents sliding in it, and
          the smoked glass over them. The window's edge belongs to the render,
          which paints last. */}
      {MATERIAL_ORDER.map((key) => {
        const w = LAYOUT.windows[key];
        return (
          <g key={key}>
            <rect x={w.x} y={w.y} width={w.width} height={w.height} className="wmf-window" />
            <g clipPath={url(`clip-${key}`)}>
              <image
                href={contentsUrl}
                x={0}
                y={0}
                width={VB_W}
                height={VB_H}
                preserveAspectRatio="none"
                style={{ ...SLIDE, transform: `translateY(${drop(levels[key], w)}px)` }}
              />
            </g>
            <rect x={w.x} y={w.y} width={w.width} height={w.height} className="wmf-glass" />
          </g>
        );
      })}

      {/* Both shells stay mounted and CSS picks one. Swapping the href instead
          would drop the frame for as long as the new file takes to arrive, and
          the contents would hang there in mid-air. */}
      <image
        href={bodyLight}
        x={0}
        y={0}
        width={VB_W}
        height={VB_H}
        preserveAspectRatio="none"
        className="wmf-body wmf-body--light"
      />
      <image
        href={bodyDark}
        x={0}
        y={0}
        width={VB_W}
        height={VB_H}
        preserveAspectRatio="none"
        className="wmf-body wmf-body--dark"
      />

      {/* The screen is rendered as bare glass; the menu on it is ours. */}
      <g className="wmf-screen-ui">
        <rect x={sx(0.04)} y={sy(0.025)} width={9} height={1.6} rx={0.8} />
        <rect x={sx(0.04)} y={sy(0.046)} width={9} height={1.6} rx={0.8} />
        <rect x={sx(0.04)} y={sy(0.067)} width={9} height={1.6} rx={0.8} />
        <circle cx={sx(0.878)} cy={sy(0.049)} r={2} />
        <circle cx={sx(0.925)} cy={sy(0.049)} r={2} opacity={0.5} />
        <rect x={SCREEN.x} y={sy(0.093)} width={SCREEN.width} height={1} opacity={0.6} />
        <rect x={SCREEN.x} y={sy(0.877)} width={SCREEN.width} height={1} opacity={0.6} />
      </g>

      {PANEL_ORDER.map((drink, i) => (
        <DrinkTile key={drink} drink={drink} index={i} />
      ))}

      <g className="wmf-screen-glyphs">
        <path
          d={`M${sx(0.23)} ${sy(0.926)}h11v6c0 3-1.8 4.4-5.5 4.4s-5.5-1.4-5.5-4.4z`}
          fill="none"
          strokeWidth={1.3}
        />
        <ellipse
          cx={sx(0.5)}
          cy={sy(0.944)}
          rx={5}
          ry={3.4}
          fill="none"
          strokeWidth={1.3}
          transform={`rotate(-24 ${sx(0.5)} ${sy(0.944)})`}
        />
        <circle cx={sx(0.77)} cy={sy(0.944)} r={4.2} fill="none" strokeWidth={1.3} />
      </g>

      {/* Kept as text rather than baked into the render: it is the one label on
          the ice maker, and text stays crisp at any card width. */}
      <text
        x={LAYOUT.iceGlyph.x}
        y={LAYOUT.iceGlyph.y}
        textAnchor="middle"
        className="wmf-glyph"
        fontSize={19}
        fontWeight={700}
        strokeWidth={4}
        paintOrder="stroke"
        strokeLinejoin="round"
      >
        氷
      </text>

      {/* Readouts last, so nothing paints over them. */}
      {MATERIAL_ORDER.map((key) => (
        <LevelLabel key={key} window={LAYOUT.windows[key]} pct={levels[key]} />
      ))}
    </svg>
  );
}
