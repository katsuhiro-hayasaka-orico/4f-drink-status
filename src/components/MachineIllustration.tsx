import { useId } from 'react';
import { DRINK_LABELS, type DrinkKey, type MaterialKey } from '../../shared/domain.js';
import { RECIPE_BY_KEY } from '../../shared/drinks.js';

/**
 * The lounge's drink machine — a WMF 1100 S — with the ice maker standing to
 * its left as it does in the room. Drawn from a photo of the real unit: white
 * side panels flanking a black centre column, the tall touch display, the
 * twin-nozzle spout over a recessed cup station, the plinth underneath.
 *
 * Two deliberate departures from the real thing:
 *
 * 1. The hoppers are exaggerated. On the real machine they sit inside the
 *    cabinet and show nothing; here they are lifted onto the top deck as
 *    smoked windows you can see through, because the whole point of the
 *    picture is to answer 「まだある?」 before anyone reads a number.
 * 2. No WMF wordmark — the shape and colours are the machine, the logo is
 *    theirs.
 *
 * Everything inside a window keeps its real colour in both colour schemes;
 * the shell follows the theme (see `--wmf-*` in styles.css).
 */

/* ---- hopper interiors, in viewBox units ---- */
const HOPPER_TOP = 56;
const HOPPER_BOTTOM = 152;
const HOPPER_HEIGHT = HOPPER_BOTTOM - HOPPER_TOP; // 96

const ICE_TOP = 86;
const ICE_BOTTOM = 204;
const ICE_HEIGHT = ICE_BOTTOM - ICE_TOP; // 118

/** Left edge of each hopper window; the three are evenly spaced 155 apart. */
const COFFEE_X = 308;
const COCOA_X = 463;
const MILK_X = 618;
const HOPPER_W = 124;

const ICE_X = 48;
const ICE_W = 144;

const clamp = (pct: number) => Math.max(0, Math.min(100, pct));

/**
 * Top edge and height of a fill at the given level, for a window of `height`.
 *
 * `null` — nobody has reported this material — draws an empty vessel, the same
 * as a confirmed 0%. The two are told apart by the readout alone (「—」 versus
 * 「0%」), which is the deliberate trade-off: an empty hopper is the honest
 * picture of "we don't know", and inventing a half-full one to mean "unknown"
 * would be a worse lie than under-promising.
 */
function fill(pct: number | null, bottom: number, height: number) {
  const h = Math.round((height * clamp(pct ?? 0)) / 100);
  return { y: bottom - h, height: h };
}

/** Smooth the meters when a report lands, the way the old drawing did. */
const FILL_TRANSITION = { transition: 'y .35s ease, height .35s ease' } as const;

/** The level readout, knocked out of the smoked glass behind it. */
function LevelLabel({ x, y, pct }: { x: number; y: number; pct: number | null }) {
  return (
    <text
      x={x}
      y={y}
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

const TILE_W = 67;
const TILE_H = 27;
const TILE_COLS = [440, 513];
const TILE_ROWS = [206, 236, 266, 296];

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

  const coffee = fill(levels.coffeeBeans, HOPPER_BOTTOM, HOPPER_HEIGHT);
  const cocoa = fill(levels.cocoaPowder, HOPPER_BOTTOM, HOPPER_HEIGHT);
  const milk = fill(levels.milkPowder, HOPPER_BOTTOM, HOPPER_HEIGHT);
  const ice = fill(levels.ice, ICE_BOTTOM, ICE_HEIGHT);

  const pct = (k: MaterialKey) => {
    const v = levels[k];
    return v === null ? '情報なし' : `約${Math.round(clamp(v))}%`;
  };

  return (
    <svg
      viewBox="0 0 800 560"
      role="img"
      aria-label={`製氷機とドリンクマシンの推定残量。氷 ${pct('ice')}、コーヒー豆 ${pct('coffeeBeans')}、ココア ${pct('cocoaPowder')}、ミルク ${pct('milkPowder')}`}
      className="machine-card__svg"
    >
      <defs>
        {/* Shell gradients take their stops from CSS variables so the machine
            can be re-lit for dark mode without a second set of shapes. */}
        <linearGradient id={id('body')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" style={{ stopColor: 'var(--wmf-body-1)' }} />
          <stop offset="1" style={{ stopColor: 'var(--wmf-body-2)' }} />
        </linearGradient>
        <linearGradient id={id('iceBody')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" style={{ stopColor: 'var(--wmf-ice-1)' }} />
          <stop offset="0.15" style={{ stopColor: 'var(--wmf-ice-2)' }} />
          <stop offset="0.85" style={{ stopColor: 'var(--wmf-ice-3)' }} />
          <stop offset="1" style={{ stopColor: 'var(--wmf-ice-4)' }} />
        </linearGradient>
        <linearGradient id={id('white')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#ffffff" />
          <stop offset="0.55" stopColor="#eceef1" />
          <stop offset="1" stopColor="#d3d6db" />
        </linearGradient>
        <linearGradient id={id('chrome')} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#f3f5f7" />
          <stop offset="0.4" stopColor="#a7adb4" />
          <stop offset="0.6" stopColor="#8b9198" />
          <stop offset="1" stopColor="#e9ecef" />
        </linearGradient>
        <linearGradient id={id('steel')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#d6dade" />
          <stop offset="1" stopColor="#8f959c" />
        </linearGradient>
        <linearGradient id={id('screen')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#131a26" />
          <stop offset="1" stopColor="#0a0d14" />
        </linearGradient>
        <linearGradient id={id('cocoaFill')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8a5330" />
          <stop offset="1" stopColor="#5a2f16" />
        </linearGradient>
        <linearGradient id={id('milkFill')} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f4ead6" />
          <stop offset="1" stopColor="#d9c7a4" />
        </linearGradient>

        {/* Beans and cubes tile rather than being placed one by one: the
            hoppers are small here, and a pattern keeps the grain even at any
            fill level. */}
        <pattern id={id('beans')} width={34} height={26} patternUnits="userSpaceOnUse">
          <rect width={34} height={26} fill="#3a1e0e" />
          <ellipse cx={9} cy={7} rx={9} ry={5.5} fill="#5f3118" stroke="#2c1608" strokeWidth={1.4} transform="rotate(-20 9 7)" />
          <path d="M4 9 Q9 6 14 5" stroke="#2c1608" strokeWidth={1.2} fill="none" />
          <ellipse cx={26} cy={19} rx={9} ry={5.5} fill="#6b3a1e" stroke="#2c1608" strokeWidth={1.4} transform="rotate(22 26 19)" />
          <path d="M21 22 Q26 19 31 17" stroke="#2c1608" strokeWidth={1.2} fill="none" />
        </pattern>
        <pattern id={id('cubes')} width={30} height={26} patternUnits="userSpaceOnUse">
          <rect width={30} height={26} fill="#b9d3e2" />
          <rect x={2} y={3} width={15} height={15} rx={4} fill="#e4f0f7" stroke="#93b7cc" strokeWidth={1.6} transform="rotate(-12 9 10)" />
          <rect x={16} y={12} width={14} height={14} rx={4} fill="#d5e7f2" stroke="#93b7cc" strokeWidth={1.6} transform="rotate(14 23 19)" />
        </pattern>

        <clipPath id={id('clipCoffee')}>
          <rect x={COFFEE_X} y={HOPPER_TOP} width={HOPPER_W} height={HOPPER_HEIGHT} rx={8} />
        </clipPath>
        <clipPath id={id('clipCocoa')}>
          <rect x={COCOA_X} y={HOPPER_TOP} width={HOPPER_W} height={HOPPER_HEIGHT} rx={8} />
        </clipPath>
        <clipPath id={id('clipMilk')}>
          <rect x={MILK_X} y={HOPPER_TOP} width={HOPPER_W} height={HOPPER_HEIGHT} rx={8} />
        </clipPath>
        <clipPath id={id('clipIce')}>
          <rect x={ICE_X} y={ICE_TOP} width={ICE_W} height={ICE_HEIGHT} rx={8} />
        </clipPath>
      </defs>

      <ellipse cx={400} cy={537} rx={360} ry={16} className="wmf-floor" />

      {/* ------------------------------------------------------ ice maker -- */}
      <g>
        <rect x={30} y={216} width={180} height={306} rx={14} fill={url('iceBody')} className="wmf-shell" strokeWidth={2.5} />
        <rect x={42} y={228} width={156} height={282} rx={10} className="wmf-ice-front" />
        <rect x={40} y={72} width={160} height={140} rx={10} fill="#1a2126" className="wmf-shell" strokeWidth={2.5} />
        <g clipPath={url('clipIce')}>
          <rect x={ICE_X} y={ice.y} width={ICE_W} height={ice.height} fill={url('cubes')} style={FILL_TRANSITION} />
        </g>
        <rect x={ICE_X} y={ICE_TOP} width={ICE_W} height={ICE_HEIGHT} rx={8} fill="#0e1418" opacity={0.28} />
        <rect x={34} y={58} width={172} height={18} rx={7} fill={url('steel')} />
        <rect x={76} y={262} width={88} height={62} rx={9} fill="#2a2d31" />
        <rect x={90} y={274} width={60} height={38} rx={6} fill="#43606f" />
        {/* White, not near-white: the dark scheme lightens the cabinet behind
            this glyph, and #e8eaee on it came to 4.25:1 — under AA. */}
        <text x={120} y={376} textAnchor="middle" fill="#ffffff" fontSize={19} fontWeight={700}>
          氷
        </text>
        <rect x={64} y={446} width={112} height={20} rx={6} fill={url('steel')} />
        <rect x={70} y={451} width={100} height={3} rx={1.5} fill="#5c6167" />
        <rect x={70} y={458} width={100} height={3} rx={1.5} fill="#5c6167" />
      </g>

      {/* ----------------------------------------------------- the machine -- */}
      <g>
        {/* hoppers on the top deck */}
        <rect x={300} y={44} width={140} height={116} rx={10} className="wmf-hopper" strokeWidth={2.5} />
        <g clipPath={url('clipCoffee')}>
          <rect x={COFFEE_X} y={coffee.y} width={HOPPER_W} height={coffee.height} fill={url('beans')} style={FILL_TRANSITION} />
        </g>
        <rect x={COFFEE_X} y={HOPPER_TOP} width={HOPPER_W} height={HOPPER_HEIGHT} rx={8} fill="#0c0e11" opacity={0.34} />
        <rect x={294} y={30} width={152} height={18} rx={7} fill={url('steel')} />

        <rect x={455} y={44} width={140} height={116} rx={10} className="wmf-hopper" strokeWidth={2.5} />
        <g clipPath={url('clipCocoa')}>
          <rect x={COCOA_X} y={cocoa.y} width={HOPPER_W} height={cocoa.height} fill={url('cocoaFill')} style={FILL_TRANSITION} />
        </g>
        <rect x={COCOA_X} y={HOPPER_TOP} width={HOPPER_W} height={HOPPER_HEIGHT} rx={8} fill="#0c0e11" opacity={0.34} />
        <rect x={449} y={30} width={152} height={18} rx={7} fill={url('steel')} />

        <rect x={610} y={44} width={140} height={116} rx={10} className="wmf-hopper" strokeWidth={2.5} />
        <g clipPath={url('clipMilk')}>
          <rect x={MILK_X} y={milk.y} width={HOPPER_W} height={milk.height} fill={url('milkFill')} style={FILL_TRANSITION} />
        </g>
        <rect x={MILK_X} y={HOPPER_TOP} width={HOPPER_W} height={HOPPER_HEIGHT} rx={8} fill="#0c0e11" opacity={0.3} />
        <rect x={604} y={30} width={152} height={18} rx={7} fill={url('steel')} />

        {/* cabinet with its white side panels */}
        <rect x={250} y={166} width={520} height={322} rx={14} fill={url('body')} className="wmf-shell" strokeWidth={2.5} />
        <rect x={258} y={172} width={94} height={266} rx={8} fill={url('white')} stroke="#b9bcc2" strokeWidth={1.5} />
        <rect x={668} y={172} width={94} height={266} rx={8} fill={url('white')} stroke="#b9bcc2" strokeWidth={1.5} />
        <rect x={262} y={176} width={8} height={258} rx={4} fill="#ffffff" opacity={0.65} />
        <rect x={668} y={176} width={8} height={258} rx={4} fill="#ffffff" opacity={0.65} />

        {/* milk / steam wands */}
        <rect x={284} y={220} width={8} height={140} rx={4} fill="#17181b" />
        <rect x={304} y={220} width={8} height={140} rx={4} fill="#17181b" />
        <rect x={278} y={212} width={40} height={14} rx={6} fill="#26282c" />

        {/* touch display */}
        <rect x={428} y={178} width={164} height={178} rx={10} className="wmf-screen" strokeWidth={2.5} />
        <rect x={436} y={186} width={148} height={162} rx={6} fill={url('screen')} />
        <rect x={442} y={190} width={9} height={1.6} rx={0.8} fill="#7d93b4" />
        <rect x={442} y={193.4} width={9} height={1.6} rx={0.8} fill="#7d93b4" />
        <rect x={442} y={196.8} width={9} height={1.6} rx={0.8} fill="#7d93b4" />
        <circle cx={566} cy={194} r={2} fill="#5f7396" />
        <circle cx={573} cy={194} r={2} fill="#3f4f68" />
        <rect x={436} y={201} width={148} height={1} fill="#1d2839" />

        {PANEL_ORDER.map((drink, i) => (
          <DrinkTile key={drink} drink={drink} index={i} />
        ))}

        <rect x={436} y={328} width={148} height={1} fill="#1d2839" />
        <path d="M470 336h11v6c0 3-1.8 4.4-5.5 4.4s-5.5-1.4-5.5-4.4z" fill="none" stroke="#7d93b4" strokeWidth={1.3} />
        <ellipse cx={510} cy={339} rx={5} ry={3.4} fill="none" stroke="#7d93b4" strokeWidth={1.3} transform="rotate(-24 510 339)" />
        <circle cx={550} cy={339} r={4.2} fill="none" stroke="#7d93b4" strokeWidth={1.3} />
        <circle cx={550} cy={339} r={1.4} fill="#7d93b4" />

        {/* cup station: one recess, one grate, and the cup standing on it */}
        <rect x={412} y={360} width={196} height={110} rx={8} className="wmf-alcove" />
        <rect x={412} y={360} width={196} height={12} rx={6} fill="#000000" opacity={0.38} />
        <rect x={412} y={360} width={9} height={110} rx={4} fill="#000000" opacity={0.22} />
        <rect x={599} y={360} width={9} height={110} rx={4} fill="#ffffff" opacity={0.06} />

        <rect x={496} y={358} width={28} height={20} rx={6} fill={url('chrome')} />
        <rect x={478} y={374} width={64} height={22} rx={7} fill="#1a1c1f" className="wmf-shell" strokeWidth={2} />
        <rect x={486} y={394} width={12} height={11} rx={2.5} fill={url('chrome')} />
        <rect x={522} y={394} width={12} height={11} rx={2.5} fill={url('chrome')} />

        <rect x={420} y={454} width={180} height={14} rx={4} fill={url('steel')} stroke="#6c727c" strokeWidth={1} />
        <g fill="#767c84">
          <rect x={436} y={458} width={3} height={7} rx={1.5} />
          <rect x={456} y={458} width={3} height={7} rx={1.5} />
          <rect x={476} y={458} width={3} height={7} rx={1.5} />
          <rect x={544} y={458} width={3} height={7} rx={1.5} />
          <rect x={564} y={458} width={3} height={7} rx={1.5} />
          <rect x={584} y={458} width={3} height={7} rx={1.5} />
        </g>
        <ellipse cx={510} cy={454} rx={35} ry={4.5} fill="#000000" opacity={0.45} />
        <path d="M478 408h64v20c0 22-12 26-32 26s-32-4-32-26z" className="wmf-cup" strokeWidth={2.5} />
        <path d="M542 416c16 0 22 8 19 17-3 9-10 13-19 10" className="wmf-cup-line" strokeWidth={6} strokeLinecap="round" />

        {/* plinth — the machine's only other steel is the cup grate above */}
        <rect x={250} y={470} width={520} height={52} rx={12} className="wmf-base" strokeWidth={2.5} />
        <rect x={266} y={478} width={488} height={2} rx={1} fill="#ffffff" opacity={0.07} />
      </g>

      {/* Readouts last, so nothing paints over them. */}
      <LevelLabel x={120} y={122} pct={levels.ice} />
      <LevelLabel x={370} y={92} pct={levels.coffeeBeans} />
      <LevelLabel x={525} y={92} pct={levels.cocoaPowder} />
      <LevelLabel x={680} y={92} pct={levels.milkPowder} />
    </svg>
  );
}
