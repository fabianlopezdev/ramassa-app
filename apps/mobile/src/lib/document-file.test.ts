import { expect, test } from 'bun:test';
import { documentFileName, documentSize, documentUti } from './document-file';

test('each accepted document type gets its iOS type', () => {
  expect(documentUti('application/pdf')).toBe('com.adobe.pdf');
  expect(documentUti('image/png')).toBe('public.png');
  expect(documentUti('text/plain')).toBe('public.data');
});

test('a document name stays inside the cache folder', () => {
  expect(documentFileName('Assegurança 2026.pdf')).toBe('Assegurança 2026.pdf');
  expect(documentFileName('../../secret/inventari.docx')).toBe('inventari.docx');
  expect(documentFileName('a:b*c?.pdf')).toBe('abc.pdf');
  expect(documentFileName('..')).toBe('document');
  expect(documentFileName('')).toBe('document');
});

test('a small document shows its size in KB, a large one in MB', () => {
  const format = new Intl.NumberFormat('en', { maximumFractionDigits: 1 });
  expect(documentSize(120, format)).toBe('1 KB');
  expect(documentSize(250_000, format)).toBe('244 KB');
  expect(documentSize(3_500_000, format)).toBe('3.3 MB');
});
