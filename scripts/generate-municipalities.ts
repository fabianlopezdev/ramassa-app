/**
 * Generates the municipality catalogue used by the RAPP-100 picker.
 *
 * Re-run from the repository root:
 *   bun run municipalities:generate --date=YYYY-MM-DD
 *
 * IDESCAT's `nodes` endpoint is the authoritative municipal register and
 * carries both the official six-digit municipality code and comarca
 * membership. The API localizes its document chrome in Catalan, Spanish and
 * English, but municipality names are official Catalan toponyms in all three
 * responses. Arabic and Farsi therefore display that same official name: a
 * generated fallback is honest; an invented translation would not be.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { format } from 'prettier';

const DEFAULT_SOURCE_URL = 'https://api.idescat.cat/emex/v1/nodes.json';
const DEFAULT_OUTPUT = path.join('packages', 'shared', 'i18n', 'municipalities.json');
const API_LOCALES = ['ca', 'es', 'en'] as const;

type ApiLocale = (typeof API_LOCALES)[number];

interface IdescatNode {
  readonly scheme: 'ca' | 'com' | 'mun';
  readonly id: string;
  readonly content: string;
  readonly v?: readonly IdescatNode[];
}

interface IdescatResponse {
  readonly fitxes?: {
    readonly v?: IdescatNode;
  };
}

interface MunicipalitySourceRow {
  readonly code: string;
  readonly comarcaCode: string;
  readonly name: string;
}

interface GeneratorOptions {
  readonly date: string;
  readonly outputPath: string;
  readonly sourceUrl: string;
}

function argumentValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv
    .slice(2)
    .find((argument) => argument.startsWith(prefix))
    ?.slice(prefix.length);
}

function optionsFromArguments(): GeneratorOptions {
  const date = argumentValue('date') ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error('--date must be YYYY-MM-DD');
  }
  return {
    date,
    outputPath: argumentValue('out') ?? DEFAULT_OUTPUT,
    sourceUrl: argumentValue('source-url') ?? DEFAULT_SOURCE_URL,
  };
}

function flattenMunicipalities(
  response: IdescatResponse,
  locale: ApiLocale,
): MunicipalitySourceRow[] {
  const root = response.fitxes?.v;
  if (root?.scheme !== 'ca' || root.v === undefined) {
    throw new Error(`IDESCAT ${locale} response has no Catalonia hierarchy`);
  }

  const rows: MunicipalitySourceRow[] = [];
  for (const comarca of root.v) {
    if (comarca.scheme !== 'com' || comarca.v === undefined) continue;
    for (const municipality of comarca.v) {
      if (municipality.scheme !== 'mun') continue;
      if (!/^\d{6}$/.test(municipality.id) || municipality.content.trim() === '') {
        throw new Error(`IDESCAT ${locale} response contains an invalid municipality`);
      }
      rows.push({
        code: municipality.id,
        comarcaCode: comarca.id,
        name: municipality.content,
      });
    }
  }
  return rows;
}

async function fetchLocale(sourceUrl: string, locale: ApiLocale): Promise<MunicipalitySourceRow[]> {
  const url = new URL(sourceUrl);
  url.searchParams.set('lang', locale);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`IDESCAT ${locale} request failed: HTTP ${response.status}`);
  }
  return flattenMunicipalities((await response.json()) as IdescatResponse, locale);
}

async function generateMunicipalityData(options: GeneratorOptions) {
  const localizedRows = await Promise.all(
    API_LOCALES.map(
      async (locale) => [locale, await fetchLocale(options.sourceUrl, locale)] as const,
    ),
  );
  const rowsByLocale = new Map(localizedRows);
  const catalanRows = rowsByLocale.get('ca') ?? [];
  const expectedCodes = catalanRows.map((row) => row.code).join(',');

  for (const locale of API_LOCALES) {
    const codes = (rowsByLocale.get(locale) ?? []).map((row) => row.code).join(',');
    if (codes !== expectedCodes) {
      throw new Error(`IDESCAT ${locale} municipality codes differ from Catalan`);
    }
  }
  if (catalanRows.length !== 947) {
    throw new Error(`Expected 947 IDESCAT municipalities, received ${catalanRows.length}`);
  }

  const namesByLocale = new Map(
    localizedRows.map(([locale, rows]) => [
      locale,
      new Map(rows.map((row) => [row.code, row.name])),
    ]),
  );
  const municipalities = catalanRows
    .map((row) => {
      const ca = namesByLocale.get('ca')?.get(row.code);
      const es = namesByLocale.get('es')?.get(row.code);
      const en = namesByLocale.get('en')?.get(row.code);
      if (ca === undefined || es === undefined || en === undefined) {
        throw new Error(`IDESCAT municipality ${row.code} is missing a localized name`);
      }
      return {
        code: row.code,
        comarcaCode: row.comarcaCode,
        names: { ca, es, en, ar: ca, fa: ca },
      };
    })
    .sort((first, second) => first.names.ca.localeCompare(second.names.ca, 'ca'));

  return {
    provenance: {
      publisher: "Institut d'Estadística de Catalunya (IDESCAT)",
      sourceUrl: DEFAULT_SOURCE_URL,
      apiVersion: 'v1',
      retrievedAt: options.date,
      sourceLocales: API_LOCALES,
      fallbackLocales: ['ar', 'fa'],
    },
    municipalities,
  } as const;
}

async function main(): Promise<void> {
  const options = optionsFromArguments();
  const data = await generateMunicipalityData(options);
  await mkdir(path.dirname(options.outputPath), { recursive: true });
  const generatedJson = await format(JSON.stringify(data), { parser: 'json' });
  await writeFile(options.outputPath, generatedJson);
  console.log(`wrote ${data.municipalities.length} municipalities to ${options.outputPath}`);
}

if (import.meta.main) {
  await main();
}
