/**
 * Prints one module's SQL, for trying a module on its own while it is written.
 * Image tokens become fixed placeholders, so no image has to exist yet.
 *
 *   bun scripts/tester-ground/dev/print-module.ts comunitat publish
 *   bun scripts/tester-ground/dev/print-module.ts comunitat remove
 *   bun scripts/tester-ground/dev/print-module.ts comunitat renew 2
 */

import { TESTERS, type GroundModule } from '../lib/ground';

const PLACEHOLDER: Record<string, (name: string) => string> = {
  key: (name) => `'tester-ground/${name}.jpg'`,
  width: () => '1600',
  height: () => '1067',
  bytes: () => '250000',
  mime: () => `'image/jpeg'`,
};

const [moduleName, action = 'publish', testerNumber = '1'] = process.argv.slice(2);
if (!moduleName) {
  console.error('Usage: print-module.ts <module> publish|remove|renew [tester 1-4]');
  process.exit(1);
}

const loaded = (await import(`../modules/${moduleName}.ts`)) as { default: GroundModule };
const groundModule = loaded.default;

function sqlFor(): string {
  if (action === 'publish') return groundModule.publish();
  if (action === 'remove') return groundModule.remove();
  const tester = TESTERS[Number(testerNumber) - 1];
  if (action !== 'renew' || !tester) throw new Error(`Unknown action: ${action} ${testerNumber}`);
  return groundModule.renew?.(tester) ?? '';
}

const sql = sqlFor().replaceAll(
  /\{\{image:([a-z0-9-]+):([a-z]+)\}\}/g,
  (_token, name: string, field: string) => PLACEHOLDER[field]?.(name) ?? 'null',
);
console.log(sql);
