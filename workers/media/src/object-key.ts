/**
 * Object keys are generated here and NOWHERE else (RAPP-14 scope item 3). The
 * client never proposes a path: it declares what it is sending, and the Worker
 * decides where that lands. This is what makes path traversal, cross-tenant
 * writes, and overwriting someone else's object impossible rather than merely
 * validated-against.
 *
 * Shape: `<orgId>/<folder>/<uploaderId>/<year>/<month>/<random>.<ext>`
 *   - org first, so a white-label tenant is one prefix (ADR-010) and R2
 *     lifecycle rules, exports, and RGPD deletions can be scoped to it.
 *   - uploader next, so "delete everything this participant uploaded" is a
 *     prefix listing rather than a database join.
 *   - year/month keeps listings small as the gallery grows.
 *   - a random file name, never the original one: file names carry PII
 *     (people name photos after themselves) and collide.
 */

import {
  getFileExtensionForUploadContentType,
  type UploadContentType,
  type UploadFolder,
} from '@ramassa/shared/schemas';
import type { CallerIdentity } from './supabase-identity';

export interface GenerateObjectKeyOptions {
  readonly identity: Pick<CallerIdentity, 'userId' | 'orgId'>;
  readonly folder: UploadFolder;
  readonly contentType: UploadContentType;
  readonly generatedAt: Date;
  /** Injected only by tests; production always takes the crypto-random name. */
  readonly randomFileName?: string;
}

function generateRandomFileName(): string {
  return crypto.randomUUID().replaceAll('-', '');
}

export function generateObjectKey(options: GenerateObjectKeyOptions): string {
  const year = String(options.generatedAt.getUTCFullYear());
  const month = String(options.generatedAt.getUTCMonth() + 1).padStart(2, '0');
  const fileName = options.randomFileName ?? generateRandomFileName();
  const fileExtension = getFileExtensionForUploadContentType(options.contentType);

  return [
    options.identity.orgId,
    options.folder,
    options.identity.userId,
    year,
    month,
    `${fileName}.${fileExtension}`,
  ].join('/');
}
