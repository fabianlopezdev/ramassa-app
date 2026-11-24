import { describe, expect, test } from 'bun:test';

const read = (path: string) => Bun.file(new URL(path, import.meta.url)).text();

const screens = [
  {
    name: 'Mentoria',
    path: '../app/(app)/mentoring/index.tsx',
    prefix: 'mentoring',
    newLabel: "t('mentoring:newRequestTitle')",
  },
  {
    name: 'Suggeriments',
    path: '../app/(app)/feedback/index.tsx',
    prefix: 'feedback',
    newLabel: "t('feedback:newSubmission')",
  },
] as const;

describe('Mentoria and Suggeriments show her list; a new one opens in a sheet (RAPP-961)', () => {
  for (const screen of screens) {
    test(`${screen.name}: the bottom button opens the form in the shared sheet`, async () => {
      const source = await read(screen.path);
      const [main, sheet] = source.split('<AppSheet');

      expect(sheet).toBeDefined();
      expect(main).toContain(`testID="${screen.prefix}-new"`);
      expect(main).toContain(`label={${screen.newLabel}}`);
      expect(main).toContain('onPress={openForm}');
      // The form and its send button live only in the sheet.
      expect(main).not.toContain(`testID="${screen.prefix}-submit"`);
      expect(sheet).toContain(`testID="${screen.prefix}-submit"`);
      expect(sheet).toContain(`title={${screen.newLabel}}`);
    });

    test(`${screen.name}: with nothing sent yet, one line and the button`, async () => {
      const source = await read(screen.path);

      expect(source).toContain(`testID="${screen.prefix}-empty"`);
      expect(source).not.toContain('submitAnother');
    });
  }
});
