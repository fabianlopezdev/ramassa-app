/**
 * `@ramassa/shared` public surface. Prefer the specific subpath exports
 * (`@ramassa/shared/tokens`, `/env`, `/i18n`, `/schemas`, `/supabase`) in app code so
 * bundlers tree-shake cleanly; this barrel exists for convenience and re-exports
 * the same modules.
 */

export * from './errors';
export * from './tokens';
export * from './env';
export * from './i18n';
export * from './schemas';
export * from './lib/supabase';
export type { Database } from './types/database';
