import { describe, expect, test } from 'bun:test';
import {
  findMissingTabLabels,
  parseTesseractTsv,
  PLAYER_TAB_LABEL_KEYS,
  type ExpectedTabLabel,
} from './qa-android-tab-labels';

const labels: readonly ExpectedTabLabel[] = [
  { key: 'home', text: 'Inici' },
  { key: 'events', text: 'Esdeveniments' },
  { key: 'chat', text: 'Xat' },
  { key: 'community', text: 'Comunitat' },
  { key: 'services', text: 'Serveis' },
];

function tsvRow(text: string, left: number, width: number, confidence = 90): string {
  return `5\t1\t1\t1\t1\t1\t${left}\t100\t${width}\t30\t${confidence}\t${text}`;
}

describe('Android tab-label visual evidence', () => {
  test('tracks the current five player tabs', () => {
    expect(PLAYER_TAB_LABEL_KEYS).toEqual(['home', 'events', 'chat', 'community', 'services']);
  });

  test('accepts OCR evidence from every horizontal tab slot', () => {
    const tsv = [
      'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext',
      tsvRow('Inici', 45, 70),
      tsvRow('Esdeveniments', 205, 180),
      tsvRow('Xat', 460, 60),
      tsvRow('Comunitat', 645, 150),
      tsvRow('Serveis', 885, 110),
    ].join('\n');

    expect(findMissingTabLabels(parseTesseractTsv(tsv), labels, 1_000)).toEqual([]);
  });

  test('reports the four labels Android auto mode did not draw', () => {
    const tsv = [
      'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext',
      tsvRow('Inici', 45, 70),
    ].join('\n');

    expect(findMissingTabLabels(parseTesseractTsv(tsv), labels, 1_000)).toEqual([
      'events',
      'chat',
      'community',
      'services',
    ]);
  });

  test('tolerates minor OCR errors without accepting unrelated icon noise', () => {
    const tsv = [
      'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext',
      tsvRow('Inici', 45, 70),
      tsvRow('Esdevenimenta', 205, 180),
      tsvRow('Q', 490, 30),
      tsvRow('Comuntat', 645, 150),
      tsvRow('Serveis', 885, 110),
    ].join('\n');

    expect(findMissingTabLabels(parseTesseractTsv(tsv), labels, 1_000)).toEqual(['chat']);
  });
});
