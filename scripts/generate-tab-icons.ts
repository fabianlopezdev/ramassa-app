/**
 * The tab bar's icons (RAPP-835): the same SVG files every screen draws, as
 * images, because the phone's own tab bar takes an image and no component.
 *
 *   docs/design/icons/svg/<name>.<weight>.svg         the source
 *           v
 *   scripts/generate-tab-icons.ts                     this file (macOS only)
 *           v
 *   apps/mobile/assets/images/tab/<name>.<weight>.png   at 1x, 2x and 3x
 *
 *   bun run icons:tabs             write the images
 *   bun run icons:tabs --check     fail when they no longer match the SVG files
 *
 * THE IMAGES CARRY SHAPE AND NO COLOUR. The tab bar colours an icon image with
 * one colour and keeps only how opaque each point is. So each file is black
 * with a real transparency mask, and the two-tone weight survives: its second
 * layer is drawn at half strength, which becomes half transparency.
 *
 * HOW IT DRAWS. macOS QuickLook (`qlmanage`) renders the SVG, so nothing has
 * to be installed. It paints on white and returns no transparency, so the mask
 * is taken from brightness (black is opaque, white is clear). Each image is
 * rendered four times larger and averaged down, which smooths the curves.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { deflateSync, inflateSync } from 'node:zlib';

const ROOT = resolve(import.meta.dirname, '..');
const SVG_DIR = resolve(ROOT, 'docs/design/icons/svg');
const OUT = resolve(ROOT, 'apps/mobile/assets/images/tab');

/** Every icon a tab bar shows (player, team and entity), by OUR icon names. */
const ICONS = [
  'calendar',
  'chart',
  'chat',
  'chats',
  'document',
  'grid',
  'home',
  'more',
  'sun',
  'user-plus',
  'users',
] as const;
const WEIGHTS = ['linear', 'boldDuotone'] as const;
/** A tab icon sits in a 25-point square. */
const POINT = 25;
const SCALES = [1, 2, 3] as const;
const SUPERSAMPLE = 4;
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const CHANNELS_BY_COLOR_TYPE: Readonly<Record<number, number>> = { 0: 1, 2: 3, 4: 2, 6: 4 };

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

interface Raster {
  readonly width: number;
  readonly height: number;
  readonly channels: number;
  readonly data: Buffer;
}

function paeth(left: number, up: number, upLeft: number): number {
  const estimate = left + up - upLeft;
  const fromLeft = Math.abs(estimate - left);
  const fromUp = Math.abs(estimate - up);
  const fromUpLeft = Math.abs(estimate - upLeft);
  if (fromLeft <= fromUp && fromLeft <= fromUpLeft) return left;
  return fromUp <= fromUpLeft ? up : upLeft;
}

/** Reads an 8-bit, non-interlaced PNG, which is what QuickLook writes. */
function decodePng(file: string): Raster {
  const bytes = readFileSync(file);
  if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE)) fail(`${file} is not a PNG`);
  let width = 0;
  let height = 0;
  let channels = 0;
  const compressed: Buffer[] = [];
  for (let offset = 8; offset < bytes.length;) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.toString('latin1', offset + 4, offset + 8);
    const chunk = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      channels = CHANNELS_BY_COLOR_TYPE[chunk.readUInt8(9)] ?? 0;
      if (chunk.readUInt8(8) !== 8 || channels === 0 || chunk.readUInt8(12) !== 0) {
        fail(`${file}: only 8-bit, non-interlaced, non-palette PNGs are read`);
      }
    } else if (type === 'IDAT') {
      compressed.push(chunk);
    }
    offset += 12 + length;
  }
  const filtered = inflateSync(Buffer.concat(compressed));
  const stride = width * channels;
  const data = Buffer.alloc(stride * height);
  for (let row = 0; row < height; row += 1) {
    const filter = filtered.readUInt8(row * (stride + 1));
    for (let column = 0; column < stride; column += 1) {
      const value = filtered.readUInt8(row * (stride + 1) + 1 + column);
      const left = column >= channels ? data.readUInt8(row * stride + column - channels) : 0;
      const up = row > 0 ? data.readUInt8((row - 1) * stride + column) : 0;
      const upLeft =
        row > 0 && column >= channels ? data.readUInt8((row - 1) * stride + column - channels) : 0;
      const predicted =
        filter === 0
          ? 0
          : filter === 1
            ? left
            : filter === 2
              ? up
              : filter === 3
                ? Math.floor((left + up) / 2)
                : paeth(left, up, upLeft);
      data.writeUInt8((value + predicted) & 0xff, row * stride + column);
    }
  }
  return { width, height, channels, data };
}

function pngChunk(type: string, body: Buffer): Buffer {
  const typed = Buffer.concat([Buffer.from(type, 'latin1'), body]);
  const head = Buffer.alloc(4);
  head.writeUInt32BE(body.length);
  const tail = Buffer.alloc(4);
  tail.writeUInt32BE(Number(Bun.hash.crc32(typed)));
  return Buffer.concat([head, typed, tail]);
}

/** Writes a black image whose transparency is `alpha`, one byte per point. */
function encodeMaskPng(alpha: Uint8Array, size: number): Buffer {
  const stride = size * 4;
  const rows = Buffer.alloc((stride + 1) * size);
  for (let row = 0; row < size; row += 1) {
    for (let column = 0; column < size; column += 1) {
      rows.writeUInt8(alpha[row * size + column] ?? 0, row * (stride + 1) + 1 + column * 4 + 3);
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header.writeUInt8(8, 8);
  header.writeUInt8(6, 9);
  return Buffer.concat([
    PNG_SIGNATURE,
    pngChunk('IHDR', header),
    pngChunk('IDAT', deflateSync(rows, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

/** How opaque the icon is at each point of a white-backed render: black is 255, white is 0. */
function opacityOf(raster: Raster): Uint8Array {
  const { width, height, channels, data } = raster;
  const isGrey = channels <= 2;
  const hasAlpha = channels === 2 || channels === 4;
  const opacity = new Uint8Array(width * height);
  for (let point = 0; point < width * height; point += 1) {
    const at = point * channels;
    const red = data.readUInt8(at);
    const green = isGrey ? red : data.readUInt8(at + 1);
    const blue = isGrey ? red : data.readUInt8(at + 2);
    const cover = hasAlpha ? data.readUInt8(at + channels - 1) / 255 : 1;
    const brightness = 0.299 * red + 0.587 * green + 0.114 * blue;
    opacity[point] = Math.round(255 - (brightness * cover + 255 * (1 - cover)));
  }
  return opacity;
}

/** Averages each block of `factor` by `factor` points into one. */
function averageDown(opacity: Uint8Array, size: number, factor: number): Uint8Array {
  const target = size / factor;
  const out = new Uint8Array(target * target);
  for (let row = 0; row < target; row += 1) {
    for (let column = 0; column < target; column += 1) {
      let total = 0;
      for (let y = 0; y < factor; y += 1) {
        for (let x = 0; x < factor; x += 1) {
          total += opacity[(row * factor + y) * size + column * factor + x] ?? 0;
        }
      }
      out[row * target + column] = Math.round(total / (factor * factor));
    }
  }
  return out;
}

function render(name: string, weight: string, size: number, workdir: string): Uint8Array {
  const svg = join(SVG_DIR, `${name}.${weight}.svg`);
  if (!existsSync(svg)) fail(`missing ${svg}. Add it to scripts/generate-icons.ts and fetch it.`);
  const source = readFileSync(svg, 'utf8');
  // The files are sized in `em`; QuickLook would draw them tiny and stretch them.
  if (!source.includes('width="1em" height="1em"')) {
    fail(`${name}.${weight}.svg: expected the set's 1em sizing`);
  }
  const staged = join(workdir, `${name}.${weight}.${size}.svg`);
  writeFileSync(
    staged,
    source.replace('width="1em" height="1em"', `width="${size}" height="${size}"`),
  );
  execFileSync('qlmanage', ['-t', '-s', String(size), '-o', workdir, staged], { stdio: 'pipe' });
  const raster = decodePng(`${staged}.png`);
  if (raster.width !== size || raster.height !== size) {
    fail(`${name}.${weight}: QuickLook drew ${raster.width}x${raster.height}, expected ${size}`);
  }
  return opacityOf(raster);
}

const isCheck = process.argv.includes('--check');
if (process.platform !== 'darwin') fail('this script needs macOS QuickLook (qlmanage)');
mkdirSync(OUT, { recursive: true });
const workdir = mkdtempSync(join(tmpdir(), 'tab-icons-'));
const stale: string[] = [];
let written = 0;
try {
  for (const name of ICONS) {
    for (const weight of WEIGHTS) {
      for (const scale of SCALES) {
        const target = POINT * scale;
        const alpha = averageDown(
          render(name, weight, target * SUPERSAMPLE, workdir),
          target * SUPERSAMPLE,
          SUPERSAMPLE,
        );
        // A mask that never gets close to opaque means a faint, blurred icon.
        // At 1x a 1.5-point line cannot reach full strength in any renderer.
        const floor = scale > 1 ? 250 : 120;
        const peak = alpha.reduce((highest, value) => Math.max(highest, value), 0);
        if (peak < floor) {
          fail(
            `${name}.${weight}@${scale}x peaks at ${peak} (floor ${floor}): the render is faint`,
          );
        }
        const file = join(OUT, `${name}.${weight}${scale === 1 ? '' : `@${scale}x`}.png`);
        const png = encodeMaskPng(alpha, target);
        if (isCheck) {
          if (!existsSync(file) || !readFileSync(file).equals(png)) stale.push(file);
        } else {
          writeFileSync(file, png);
        }
        written += 1;
      }
    }
  }
} finally {
  rmSync(workdir, { recursive: true, force: true });
}

if (isCheck && stale.length > 0) {
  fail(
    `tab icons no longer match the SVG files:\n${stale.join('\n')}\nRun \`bun run icons:tabs\`.`,
  );
}
console.log(
  isCheck
    ? `tab icons match their source (${written} files)`
    : `wrote ${written} files into apps/mobile/assets/images/tab`,
);
