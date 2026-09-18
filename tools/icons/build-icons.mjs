/*
 * Render public/favicon.svg into every PNG the site ships.
 *
 *   npm run render:icons            write the PNGs
 *   npm run render:icons -- --check re-render and compare, write nothing
 *   npm run render:icons -- --preview write contact sheets to tools/icons/out/
 *
 * The SVG is the original and the PNGs are derivatives, which is the whole
 * reason this script exists: the previous favicon shipped as three hand-made
 * binaries with no generator, so nothing stopped them drifting apart from the
 * vector they were supposedly cut from. --check makes that drift detectable.
 *
 * Two details are easy to get wrong and are asserted below rather than trusted:
 *
 *   Size. librsvg gives a viewBox="0 0 32 32" with no width/height an intrinsic
 *   size of 32x32 at 72dpi, so a large PNG comes from raising the density
 *   (72 * target / 32), never from resizing a 32px raster up. The assertion on
 *   the output dimensions is what catches a mistake here; a blurry icon does
 *   not announce itself in a diff.
 *
 *   Alpha, which has to go opposite ways. favicon-32 keeps transparent corners
 *   so the rounded tile sits on a dark browser tab strip without the white
 *   wedges the old file baked in. Everything Apple and Android treat as an app
 *   icon is masked by the OS, so those are rendered full-bleed (no rx) and
 *   flattened to remove the alpha channel entirely; a pre-rounded transparent
 *   icon shows a halo inside the OS's own corner.
 *
 * Mask safety was measured, not eyeballed: at 512px no ink falls outside iOS's
 * superellipse, and the ink reaches 12.59 of the 12.80 units that Android's
 * maskable safe circle allows. It fits, but it grazes the edge, so the maskable
 * variant alone scales the mark to sit comfortably inside the circle.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = new URL('../../', import.meta.url);
const publicDir = new URL('public/', root);
const outDir = new URL('out/', new URL('./', import.meta.url));

/** The grid the SVG is authored on. Everything scales from this. */
const VIEWBOX = 32;
/** librsvg's default dpi; density is expressed relative to it. */
const BASE_DPI = 72;
/** Android's maskable safe zone is a circle of 80% diameter; leave a margin inside it. */
const MASKABLE_SCALE = 0.88;

const densityFor = (px) => (BASE_DPI * px) / VIEWBOX;

/** Drop the rounded corner: the OS supplies its own mask on app icons. */
const fullBleed = (svg) => svg.replace(' rx="7"', '');

/** Shrink the mark about the tile's centre, keeping the ground full-bleed. */
function scaleMark(svg, factor) {
  const open = svg.indexOf('>', svg.indexOf('<svg')) + 1;
  const groundEnd = svg.indexOf('/>', svg.indexOf('<rect')) + 2;
  const head = svg.slice(0, groundEnd);
  const body = svg.slice(groundEnd, svg.lastIndexOf('</svg>'));
  if (open < 1 || groundEnd < 2) throw new Error('could not find the ground rect to scale around');
  const c = VIEWBOX / 2;
  return `${head}<g transform="translate(${c} ${c}) scale(${factor}) translate(${-c} ${-c})">${body}</g></svg>`;
}

/**
 * Every PNG the site ships, and why it looks the way it does.
 * `alpha: true` keeps the rounded corners transparent; `false` flattens onto
 * the espresso ground and drops the channel.
 */
const TARGETS = [
  {
    file: 'favicon-32.png',
    px: 32,
    alpha: true,
    variant: (svg) => svg,
    palette: true,
    note: 'browser tab, and the notification badge in public/sw.js',
  },
  {
    file: 'apple-touch-icon.png',
    px: 180,
    alpha: false,
    variant: fullBleed,
    note: 'iOS home screen, and the Web Push notification icon',
  },
  { file: 'icon-192.png', px: 192, alpha: false, variant: fullBleed, note: 'manifest, purpose any' },
  { file: 'icon-512.png', px: 512, alpha: false, variant: fullBleed, note: 'manifest, purpose any' },
  {
    file: 'icon-maskable-512.png',
    px: 512,
    alpha: false,
    variant: (svg) => scaleMark(fullBleed(svg), MASKABLE_SCALE),
    note: 'manifest, purpose maskable (Android crops to a circle)',
  },
];

async function render(master, target) {
  const svg = target.variant(master);
  let pipe = sharp(Buffer.from(svg), { density: densityFor(target.px) });
  if (!target.alpha) pipe = pipe.flatten({ background: '#2b1f18' });
  const png = await pipe
    .png(target.palette ? { palette: true, effort: 10, compressionLevel: 9 } : { compressionLevel: 9 })
    .toBuffer();

  const meta = await sharp(png).metadata();
  if (meta.width !== target.px || meta.height !== target.px) {
    throw new Error(`${target.file}: rendered ${meta.width}x${meta.height}, wanted ${target.px}`);
  }
  if (meta.hasAlpha !== target.alpha) {
    throw new Error(`${target.file}: hasAlpha=${meta.hasAlpha}, wanted ${target.alpha}`);
  }
  return png;
}

/** A contact sheet: each size at 1:1 and magnified 8x, over the grounds the icon actually sits on. */
async function preview(master) {
  await mkdir(outDir, { recursive: true });
  const grounds = ['#ffffff', '#f5edde', '#35363a', '#1d1712'];
  const sizes = [16, 32, 64, 180];
  const pad = 16;
  const cellW = 180 * 8 === 0 ? 0 : Math.max(...sizes.map((s) => Math.min(s * 8, 360)));
  const rowH = cellW + pad * 2;

  for (const [i, ground] of grounds.entries()) {
    const tiles = [];
    let x = pad;
    for (const size of sizes) {
      const one = await sharp(Buffer.from(master), { density: densityFor(size) }).png().toBuffer();
      const big = await sharp(one)
        .resize(Math.min(size * 8, 360), Math.min(size * 8, 360), { kernel: 'nearest' })
        .png()
        .toBuffer();
      tiles.push({ input: big, left: x, top: pad });
      x += Math.min(size * 8, 360) + pad;
    }
    const sheet = await sharp({
      create: { width: x, height: rowH, channels: 4, background: ground },
    })
      .composite(tiles)
      .png()
      .toBuffer();
    await writeFile(new URL(`contact-${i}-${ground.slice(1)}.png`, outDir), sheet);
  }
  console.log(`preview: ${fileURLToPath(outDir)}`);
}

const args = process.argv.slice(2);
const master = await readFile(new URL('favicon.svg', publicDir), 'utf8');

if (args.includes('--preview')) {
  await preview(master);
} else if (args.includes('--check')) {
  let drift = 0;
  for (const target of TARGETS) {
    const fresh = await render(master, target);
    const onDisk = await readFile(new URL(target.file, publicDir)).catch(() => null);
    const same = onDisk && onDisk.equals(fresh);
    if (!same) drift += 1;
    console.log(`${same ? 'ok  ' : 'DRIFT'} ${target.file}`);
  }
  if (drift) {
    console.error(`\n${drift} file(s) differ from favicon.svg. Run: npm run render:icons`);
    process.exit(1);
  }
} else {
  for (const target of TARGETS) {
    const png = await render(master, target);
    await writeFile(new URL(target.file, publicDir), png);
    console.log(`${target.file.padEnd(22)} ${target.px}px  alpha=${target.alpha}  ${png.length} bytes  — ${target.note}`);
  }
}
