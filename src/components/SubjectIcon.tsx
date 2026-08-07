import type { SubjectKey } from '../../shared/domain.js';

/**
 * Icons for the report form's subject chips.
 *
 * Drawn rather than set in emoji, which render differently on every platform
 * and would sit at the mercy of the system font.
 *
 * Solid shapes throughout: at 22px an outline reads as a smudge, and the whole
 * point of these is to be recognisable before the label is. Each silhouette
 * has to be distinct from the others at a glance — a milk bottle and a machine
 * both drawn as boxes would be worse than no icons at all.
 *
 * Two colours are in play. `currentColor` is the chip's text colour, so icons
 * invert with the chip when selected; `--icon-bg` is the chip's background,
 * used to knock details out of a solid shape (the split in a coffee bean, the
 * label on the bottle) so they survive that inversion too.
 */

const COMMON = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  'aria-hidden': true as const,
  focusable: 'false' as const,
  className: 'chip__icon',
};

/* Set through `style`, not a fill attribute: presentation attributes are
   parsed before the cascade and cannot resolve var(). */
const KNOCKOUT = { fill: 'var(--icon-bg)' } as const;

/** Two beans, each with the split that makes a bean a bean. */
function CoffeeBeans() {
  return (
    <svg {...COMMON} fill="currentColor">
      <g transform="rotate(-32 8.2 8.6)">
        <ellipse cx="8.2" cy="8.6" rx="4.1" ry="6" />
        <path
          d="M8.2 3.4c-1.5 2.4-1.5 8 0 10.4"
          fill="none"
          style={{ stroke: 'var(--icon-bg)' }}
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </g>
      <g transform="rotate(-32 15.8 15.4)">
        <ellipse cx="15.8" cy="15.4" rx="4.1" ry="6" />
        <path
          d="M15.8 10.2c-1.5 2.4-1.5 8 0 10.4"
          fill="none"
          style={{ stroke: 'var(--icon-bg)' }}
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}

/** A mug with steam — the only icon here with a handle, so it reads fast. */
function Cocoa() {
  return (
    <svg {...COMMON} fill="currentColor">
      <path
        d="M6 4.6c0-1 1.2-1.3 1.2-2.6M10 4.6c0-1 1.2-1.3 1.2-2.6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
      <path d="M2.6 8.4h12.2v6.4a4.6 4.6 0 0 1-4.6 4.6H7.2a4.6 4.6 0 0 1-4.6-4.6z" />
      <path
        d="M15.4 10.2h1.9a3 3 0 0 1 0 6h-.9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** A bottle: narrow neck over a wide body. Nothing else here has a neck. */
function Milk() {
  return (
    <svg {...COMMON} fill="currentColor">
      <path d="M9.4 2h5.2v2.9l1.7 2.6a4 4 0 0 1 .7 2.2V20a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V9.7a4 4 0 0 1 .7-2.2l1.7-2.6z" />
      <rect x="8.6" y="12.4" width="6.8" height="4.6" rx="0.8" style={KNOCKOUT} />
    </svg>
  );
}

/** Two cubes, echoing the pile in the ice maker. */
function Ice() {
  return (
    <svg {...COMMON} fill="currentColor">
      <rect x="2.2" y="9.4" width="10.4" height="10.4" rx="2.6" transform="rotate(-12 7.4 14.6)" />
      <rect
        x="11.4"
        y="3.6"
        width="10.4"
        height="10.4"
        rx="2.6"
        transform="rotate(15 16.6 8.8)"
        style={{ stroke: 'var(--icon-bg)' }}
        strokeWidth="1.6"
      />
    </svg>
  );
}

/** The machine itself: three hoppers over a cabinet. */
function Machine() {
  return (
    <svg {...COMMON} fill="currentColor">
      <rect x="3.6" y="2" width="4.6" height="5.2" rx="1.1" />
      <rect x="9.7" y="2" width="4.6" height="5.2" rx="1.1" />
      <rect x="15.8" y="2" width="4.6" height="5.2" rx="1.1" />
      <rect x="2.4" y="8.6" width="19.2" height="13.4" rx="2.4" />
      <path d="M9.2 13.4h5.6v3.4a2.8 2.8 0 0 1-5.6 0z" style={KNOCKOUT} />
      <rect x="5.4" y="18.8" width="13.2" height="1.6" rx="0.8" style={KNOCKOUT} />
    </svg>
  );
}

/** Three people, matching the figures in the queue panel. */
function Queue() {
  return (
    <svg {...COMMON} fill="currentColor">
      <circle cx="4.6" cy="7.4" r="2.4" />
      <path d="M4.6 10.8c2.1 0 3.1 1.5 3.1 3.8V20H1.5v-5.4c0-2.3 1-3.8 3.1-3.8z" />
      <circle cx="12" cy="6.2" r="2.8" />
      <path d="M12 9.8c2.4 0 3.7 1.7 3.7 4.3V20H8.3v-5.9c0-2.6 1.3-4.3 3.7-4.3z" />
      <circle cx="19.4" cy="7.4" r="2.4" />
      <path d="M19.4 10.8c2.1 0 3.1 1.5 3.1 3.8V20h-6.2v-5.4c0-2.3 1-3.8 3.1-3.8z" />
    </svg>
  );
}

const ICONS: Record<SubjectKey, () => React.JSX.Element> = {
  coffeeBeans: CoffeeBeans,
  cocoaPowder: Cocoa,
  milkPowder: Milk,
  ice: Ice,
  machine: Machine,
  queue: Queue,
};

export function SubjectIcon({ subject }: { subject: SubjectKey }) {
  const Icon = ICONS[subject];
  return <Icon />;
}
