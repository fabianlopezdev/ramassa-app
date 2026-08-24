import { readFile } from 'node:fs/promises';
import { describe, expect, test } from 'bun:test';

const deploymentSecrets = ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'SENTRY_AUTH_TOKEN'];

describe('deployment workflow security contract', () => {
  test('an automatic deployment checks out the exact commit that passed CI', async () => {
    const workflow = await readFile('.github/workflows/deploy.yml', 'utf8');

    expect(workflow).toContain('github.event.workflow_run.head_sha');
    expect(workflow).toMatch(
      /ref:\s*\$\{\{\s*github\.event_name == 'workflow_run' && github\.event\.workflow_run\.head_sha \|\| github\.sha\s*\}\}/,
    );
  });

  test('secrets are step-scoped and external actions are immutable', async () => {
    const workflow = await readFile('.github/workflows/deploy.yml', 'utf8');
    const jobEnv = workflow.match(/\n {4}env:\n([\s\S]*?)\n {4}steps:/)?.[1] ?? '';

    for (const secret of deploymentSecrets) {
      expect(jobEnv).not.toContain(secret);
    }

    expect(workflow).toMatch(/\n {4}environment:\s*\$\{\{/);
    for (const action of workflow.matchAll(/uses:\s*([^\s#]+)/g)) {
      expect(action[1]).toMatch(/@[0-9a-f]{40}$/);
    }
  });
});
