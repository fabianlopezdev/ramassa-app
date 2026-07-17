import { expect, test } from 'bun:test';
import commitlintConfig from '../commitlint.config.mjs';

const subjectRappId = commitlintConfig.plugins[0]!.rules['subject-rapp-id']!;

test('commit subject ending with (RAPP-N) is accepted', () => {
  expect(subjectRappId({ header: 'chore(repo): initialize monorepo (RAPP-5)' })[0]).toBe(true);
});

test('commit subject without a RAPP issue ID is rejected', () => {
  expect(subjectRappId({ header: 'chore(repo): initialize monorepo' })[0]).toBe(false);
});

test('commit subject with the ID not at the end is rejected', () => {
  expect(subjectRappId({ header: 'chore(repo): (RAPP-5) initialize monorepo' })[0]).toBe(false);
});
