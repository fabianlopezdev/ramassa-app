/**
 * Internal documents on the phone (RAPP-406): the iOS type of each document
 * type the database accepts, so the share sheet offers the right apps, and a
 * cache file name that cannot leave the cache folder. A pure module, so the
 * unit tests run without the app's Supabase client.
 */
const UTIS: Readonly<Record<string, string>> = {
  'application/pdf': 'com.adobe.pdf',
  'application/msword': 'com.microsoft.word.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document':
    'org.openxmlformats.wordprocessingml.document',
  'image/jpeg': 'public.jpeg',
  'image/png': 'public.png',
  'image/webp': 'org.webmproject.webp',
};

/** The iOS type identifier, or plain data for a type the list does not name. */
export function documentUti(contentType: string): string {
  return UTIS[contentType] ?? 'public.data';
}

/** The document's own name, without folders or characters a file name cannot hold. */
export function documentFileName(name: string): string {
  const base = name.split(/[/\\]/).pop() ?? '';
  // Control characters are dropped by code point, which the lint allows.
  const cleaned = [...base]
    .filter((character) => (character.codePointAt(0) ?? 0) >= 32 && !':*?"<>|'.includes(character))
    .join('')
    .trim();
  return cleaned.length === 0 || cleaned === '.' || cleaned === '..' ? 'document' : cleaned;
}

/** A document's size for the list: KB under one megabyte, MB from there. */
export function documentSize(bytes: number, format: Intl.NumberFormat): string {
  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) return `${format.format(Math.max(1, Math.round(kilobytes)))} KB`;
  return `${format.format(kilobytes / 1024)} MB`;
}
