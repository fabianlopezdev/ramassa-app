/**
 * Presigned R2 upload URLs (ADR-002). The bytes go from the device straight to
 * R2; this Worker only signs permission for one specific object, one specific
 * content type, and one specific size, for a few minutes.
 *
 * `allHeaders: true` is the load-bearing option. aws4fetch treats `content-type`
 * and `content-length` as unsignable by default (they are on the SigV4
 * unsignable list), which would leave both limits as mint-time promises the
 * client could simply break. With them signed, they are inside
 * `X-Amz-SignedHeaders`, so R2 recomputes the signature from what the client
 * actually sent and answers 403 to any mismatch. That is the difference between
 * validating a claim and enforcing it.
 *
 * `AwsV4Signer` is used directly rather than `AwsClient.sign()` because the
 * latter builds a `Request`, whose header guard strips `content-length` before
 * it can ever be signed.
 */

import { AwsV4Signer } from 'aws4fetch';
import type { UploadContentType } from '@ramassa/shared/schemas';

export interface PresignR2UploadOptions {
  /**
   * R2's S3 endpoint for this bucket's jurisdiction. EU-jurisdiction buckets
   * (ADR-011: participant data stays in the EU) live at
   * `https://<account>.eu.r2.cloudflarestorage.com`, not the default host, so
   * this is configuration rather than a derived account id.
   */
  readonly s3Endpoint: string;
  readonly bucketName: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly objectKey: string;
  readonly contentType: UploadContentType;
  readonly contentLength: number;
  readonly expiresInSeconds: number;
  readonly signedAt: Date;
}

export async function presignR2Upload(options: PresignR2UploadOptions): Promise<string> {
  const url = new URL(options.s3Endpoint);
  // Resolve the key against the bucket root so every segment is encoded once
  // and no key can climb out of its bucket path.
  url.pathname = `/${options.bucketName}/${options.objectKey}`;
  url.searchParams.set('X-Amz-Expires', String(options.expiresInSeconds));

  const signer = new AwsV4Signer({
    url: url.toString(),
    method: 'PUT',
    headers: {
      'content-type': options.contentType,
      'content-length': String(options.contentLength),
    },
    accessKeyId: options.accessKeyId,
    secretAccessKey: options.secretAccessKey,
    service: 's3',
    region: 'auto',
    datetime: options.signedAt.toISOString().replace(/[:-]|\.\d{3}/g, ''),
    signQuery: true,
    allHeaders: true,
  });

  const signed = await signer.sign();
  return signed.url.toString();
}
