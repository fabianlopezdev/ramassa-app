/**
 * Screenshot-channel proof for the five Android player-tab labels (RAPP-104).
 *
 * UI Automator and Maestro can report text that exists in the accessibility
 * hierarchy even when Material never paints it. This helper captures the real
 * framebuffer with ADB, crops the bottom-navigation label band, and asks OCR
 * for evidence in each tab's horizontal slot.
 */

import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { log, run, runOrThrow } from './flow-capture/shell';
import { loadTranslator } from './flow-capture/translations';

export interface ExpectedTabLabel {
  readonly key: string;
  readonly text: string;
}

export interface OcrWord {
  readonly confidence: number;
  readonly left: number;
  readonly text: string;
  readonly width: number;
}

const MINIMUM_OCR_CONFIDENCE = 20;
const MINIMUM_LABEL_SIMILARITY = 0.55;
export const PLAYER_TAB_LABEL_KEYS = [
  'home',
  'events',
  'community',
  'services',
  'profile',
] as const;

export function parseTesseractTsv(tsv: string): readonly OcrWord[] {
  return tsv
    .split('\n')
    .slice(1)
    .flatMap((line): OcrWord[] => {
      const columns = line.split('\t');
      if (columns.length < 12 || columns[0] !== '5') return [];
      const confidence = Number(columns[10]);
      const left = Number(columns[6]);
      const width = Number(columns[8]);
      const text = columns.slice(11).join('\t').trim();
      if (
        !Number.isFinite(confidence) ||
        confidence < MINIMUM_OCR_CONFIDENCE ||
        !Number.isFinite(left) ||
        !Number.isFinite(width) ||
        text === ''
      ) {
        return [];
      }
      return [{ confidence, left, text, width }];
    });
}

function normalizeForComparison(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('ca')
    .replace(/[^a-z]/g, '');
}

function editDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        (current[rightIndex - 1] ?? 0) + 1,
        (previous[rightIndex] ?? 0) + 1,
        (previous[rightIndex - 1] ?? 0) + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length] ?? right.length;
}

function similarity(left: string, right: string): number {
  const normalizedLeft = normalizeForComparison(left);
  const normalizedRight = normalizeForComparison(right);
  const longest = Math.max(normalizedLeft.length, normalizedRight.length);
  if (longest === 0) return 0;
  return 1 - editDistance(normalizedLeft, normalizedRight) / longest;
}

export function recognizedTextByTabSlot(
  words: readonly OcrWord[],
  slotCount: number,
  imageWidth: number,
): readonly string[] {
  const slots = Array.from({ length: slotCount }, () => [] as OcrWord[]);
  for (const word of words) {
    const center = word.left + word.width / 2;
    const slot = Math.min(
      slotCount - 1,
      Math.max(0, Math.floor((center / imageWidth) * slotCount)),
    );
    slots[slot]?.push(word);
  }
  return slots.map((slotWords) =>
    slotWords
      .sort((left, right) => left.left - right.left)
      .map((word) => word.text)
      .join(' '),
  );
}

export function findMissingTabLabels(
  words: readonly OcrWord[],
  labels: readonly ExpectedTabLabel[],
  imageWidth: number,
): readonly string[] {
  const recognized = recognizedTextByTabSlot(words, labels.length, imageWidth);
  return labels
    .filter(
      (label, index) => similarity(recognized[index] ?? '', label.text) < MINIMUM_LABEL_SIMILARITY,
    )
    .map((label) => label.key);
}

async function captureFramebuffer(device: string, output: string): Promise<void> {
  const child = Bun.spawn(['adb', '-s', device, 'exec-out', 'screencap', '-p'], {
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [png, stderr, exitCode] = await Promise.all([
    new Response(child.stdout).arrayBuffer(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (exitCode !== 0) {
    throw new Error(`ADB screenshot failed for ${device}: ${stderr.trim()}`);
  }
  await Bun.write(output, png);
}

function sipsDimension(output: string, name: 'pixelWidth' | 'pixelHeight'): number {
  const match = output.match(new RegExp(`${name}:\\s*(\\d+)`));
  const value = Number(match?.[1]);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`Could not read ${name} from sips output:\n${output}`);
  }
  return value;
}

async function expectedCatalanLabels(): Promise<readonly ExpectedTabLabel[]> {
  const translate = await loadTranslator('ca');
  return PLAYER_TAB_LABEL_KEYS.map((key) => ({ key, text: translate(`nav:tabs.${key}`) }));
}

export async function assertAndroidTabLabelsDrawn(device: string): Promise<void> {
  const tesseract = await run(['tesseract', '--version']);
  if (tesseract.exitCode !== 0) {
    throw new Error('tesseract is required for Android drawn-label QA (brew install tesseract)');
  }

  const scratch = await mkdtemp(path.join(tmpdir(), 'ramassa-tab-labels-'));
  try {
    const screenshot = path.join(scratch, 'screen.png');
    const crop = path.join(scratch, 'tab-label-band.png');
    const enlarged = path.join(scratch, 'tab-label-band-4x.png');
    await captureFramebuffer(device, screenshot);

    const dimensions = await runOrThrow([
      'sips',
      '-g',
      'pixelWidth',
      '-g',
      'pixelHeight',
      screenshot,
    ]);
    const width = sipsDimension(dimensions.stdout, 'pixelWidth');
    const height = sipsDimension(dimensions.stdout, 'pixelHeight');

    // NativeTabs occupies the band immediately above Android's system
    // navigation area. Keep the lower part of the tab bar where labels paint,
    // excluding the gesture/navigation strip below it.
    const cropTop = Math.round(height * 0.89);
    const cropHeight = Math.round(height * 0.075);
    await runOrThrow([
      'sips',
      '--cropToHeightWidth',
      String(cropHeight),
      String(width),
      '--cropOffset',
      String(cropTop),
      '0',
      screenshot,
      '--out',
      crop,
    ]);

    const scale = 4;
    await runOrThrow([
      'sips',
      '--resampleHeightWidth',
      String(cropHeight * scale),
      String(width * scale),
      crop,
      '--out',
      enlarged,
    ]);

    const ocr = await runOrThrow(['tesseract', enlarged, 'stdout', '--psm', '11', 'tsv']);
    const words = parseTesseractTsv(ocr.stdout);
    const labels = await expectedCatalanLabels();
    const recognized = recognizedTextByTabSlot(words, labels.length, width * scale);
    const missing = findMissingTabLabels(words, labels, width * scale);
    log(`· Android tab-label pixels: ${recognized.map((text) => text || '<none>').join(' | ')}`);
    if (missing.length > 0) {
      throw new Error(
        `Android framebuffer did not show tab labels in slots: ${missing.join(', ')}. ` +
          `OCR read: ${recognized.map((text) => text || '<none>').join(' | ')}`,
      );
    }
  } finally {
    await rm(scratch, { recursive: true, force: true });
  }
}

if (import.meta.main) {
  const argv = process.argv.slice(2);
  const deviceIndex = argv.indexOf('--device');
  const device = deviceIndex === -1 ? undefined : argv[deviceIndex + 1];
  if (device === undefined || device.startsWith('--')) {
    console.error('Usage: bun run scripts/qa-android-tab-labels.ts --device emulator-5556');
    process.exit(2);
  }
  try {
    await assertAndroidTabLabelsDrawn(device);
    console.log(`✓ all five Android tab labels are drawn on ${device}`);
  } catch (error) {
    console.error(`✗ ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}
