import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'bun:test';
import { renderPushEdgeCatalog } from '../scripts/generate-push-edge-catalog';

describe('Edge push catalog artifact', () => {
  test('is generated exactly from the official five-language push catalogs', () => {
    const generated = readFileSync(
      new URL('../supabase/functions/_shared/push-catalog.generated.ts', import.meta.url),
      'utf8',
    );

    expect(generated).toBe(renderPushEdgeCatalog());
  });

  test('bundles fallback notification copy without unrelated permission-rationale copy', () => {
    const generated = renderPushEdgeCatalog();

    expect(generated).toContain('announcementFallbackBody');
    expect(generated).toContain('eventFallbackBody');
    expect(generated).toContain('forumFlagTitle');
    expect(generated).toContain('forumFlagBody');
    expect(generated).not.toContain('rationaleTitle');
    expect(generated).not.toContain('rationaleBody');
  });
});

describe('Edge push authority', () => {
  test('uses a publishable database client and never imports a broad Supabase credential', () => {
    const edgeSource = readFileSync(
      new URL('../supabase/functions/send-push/index.ts', import.meta.url),
      'utf8',
    );

    expect(edgeSource).toContain('SUPABASE_PUBLISHABLE_KEYS');
    expect(edgeSource).toContain("Deno.env.get('SUPABASE_PUBLISHABLE_KEY')");
    expect(edgeSource).toContain('SUPABASE_ANON_KEY');
    expect(edgeSource).not.toContain('SUPABASE_SECRET_KEYS');
    expect(edgeSource).not.toContain('SUPABASE_SECRET_KEY');
    expect(edgeSource).not.toContain('SUPABASE_SERVICE_ROLE_KEY');
    expect(edgeSource).not.toContain('PushError');
  });

  test('the migration grants no push authority to service_role', () => {
    const migration = readFileSync(
      new URL('../supabase/migrations/20260806115107_push_send_pipeline.sql', import.meta.url),
      'utf8',
    );
    const scheduler = readFileSync(
      new URL('../scripts/configure-local-push-scheduler.ts', import.meta.url),
      'utf8',
    );

    expect(migration).not.toMatch(/grant[\s\S]{0,160}\bservice_role\b/i);
    expect(migration).not.toContain('push_secret_key');
    expect(migration).toContain('push_dispatch_secret');
    expect(scheduler).not.toContain('SERVICE_ROLE_KEY');
    expect(scheduler).toContain('push_dispatch_secret');
  });

  test('the delivery schema carries and constrains its tenant identity', () => {
    const migration = readFileSync(
      new URL('../supabase/migrations/20260806115107_push_send_pipeline.sql', import.meta.url),
      'utf8',
    );

    expect(migration).toMatch(
      /create table public\.push_deliveries \([\s\S]*?org_id uuid not null/,
    );
    expect(migration).toContain('push_deliveries_publication_org_fkey');
    expect(migration).toContain('push_deliveries_recipient_org_fkey');
    expect(migration).toContain('push_deliveries_recipient_token_fkey');
  });
});
